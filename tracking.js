// =====================================================================
// MODULO DE RASTREAMENTO DE ATIVIDADE - Aguia Sistemas
// =====================================================================
// Registra o que cada usuario faz enquanto esta logado: login, logout,
// cliques em botoes, buscas, respostas de baixa de estoque (certo/errado
// e tempo de resposta), e qualquer outro evento que as paginas quiserem
// registrar via registrarEvento(...).
//
// IMPORTANTE - sobre transparencia:
// Este modulo so deve ser usado em sistemas onde os usuarios sabem (ou
// foram avisados) que a atividade deles e registrada. Isso e uma
// decisao de uso responsavel, nao apenas tecnica.
//
// Como funciona:
// 1. Cada evento e guardado em uma fila local (sessionStorage), nao
//    enviado um por um - isso evita travar o navegador e evita estourar
//    a cota de execucoes do Apps Script.
// 2. A fila e enviada em lote para o Apps Script a cada X segundos
//    (FLUSH_INTERVAL_MS) e tambem ao trocar de pagina/fechar a aba.
// 3. O Apps Script grava cada evento em uma aba dedicada "EventosUso"
//    (estruturada em colunas) e atualiza um resumo legivel na aba
//    "Usuarios", coluna "resumo_atividade" - sem tocar na coluna
//    "alerta_ip" que ja tem sua propria funcao.
//
// Como usar em qualquer pagina protegida:
//   <script src="auth.js"></script>
//   <script src="tracking.js"></script>
//   <script>protegerPagina(); iniciarRastreamento();</script>
//
// Para registrar um evento especifico em qualquer ponto do seu JS:
//   registrarEvento("clique", "btnProcessarColagem", { pagina: "baixa" });
//
// Para registrar uma resposta com certo/errado e tempo de resposta:
//   const inicio = Date.now();
//   ... usuario responde ...
//   registrarResposta("baixa_estoque", correto, Date.now() - inicio, detalhe);
// =====================================================================

// IMPORTANTE: esta URL deve ser a MESMA URL do Apps Script já usado pelo
// login (URL_GOOGLE_SCRIPT em login.js), pois o código de rastreamento
// (.gs) é adicionado ao MESMO projeto Apps Script do login, não um novo.
const TRACKING_URL_APPS_SCRIPT = "https://script.google.com/macros/s/AKfycbzc4Gs9m0mfEjQn60MoLdCwd3a4i5h-TmYG6ebKAKsMAzHuM27R0P3q9bQ-PcAP7LRP5Q/exec";
const TRACKING_FILA_CHAVE = "aguiaFilaEventos";
const TRACKING_FLUSH_INTERVAL_MS = 15 * 1000; // envia a fila a cada 15s
const TRACKING_MAX_FILA = 50; // forca envio antes do intervalo se acumular muito

let _trackingIntervalId = null;
let _trackingPaginaInicio = Date.now();

// ===== UTILITARIO: le a fila atual do sessionStorage =====
function _trackingLerFila() {
    try {
        const bruto = sessionStorage.getItem(TRACKING_FILA_CHAVE);
        return bruto ? JSON.parse(bruto) : [];
    } catch (erro) {
        return [];
    }
}

function _trackingSalvarFila(fila) {
    try {
        sessionStorage.setItem(TRACKING_FILA_CHAVE, JSON.stringify(fila));
    } catch (erro) {
        // sessionStorage cheio ou indisponivel - descarta silenciosamente
        // para nao quebrar a pagina por causa do rastreamento
    }
}

// ===== REGISTRA UM EVENTO GENERICO NA FILA =====
// tipo: "login" | "logout" | "clique" | "busca" | "resposta" | "pagina" | "erro" | outro nome livre
// alvo: identificador do elemento/acao (ex: id do botao, termo buscado)
// detalhe: objeto livre com qualquer info extra (opcional)
function registrarEvento(tipo, alvo, detalhe) {
    const usuarioSessao = (typeof nomeUsuarioLogado === "function" ? nomeUsuarioLogado() : "") || "";
    const usuario = usuarioSessao || (detalhe && detalhe.usuarioTentado) || "desconhecido";
    const agora = new Date();

    const evento = {
        usuario,
        dataHoraISO: agora.toISOString(),
        pagina: window.location.pathname.split("/").pop() || "desconhecida",
        tipo,
        alvo: alvo || "",
        detalhe: detalhe ? JSON.stringify(detalhe) : ""
    };

    const fila = _trackingLerFila();
    fila.push(evento);
    _trackingSalvarFila(fila);

    if (fila.length >= TRACKING_MAX_FILA) {
        enviarFilaEventos();
    }
}

// ===== REGISTRA UMA RESPOSTA/ACAO COM RESULTADO CERTO/ERRADO E TEMPO =====
// contexto: nome livre da acao (ex: "baixa_estoque", "login", "busca_endereco")
// correto: true/false
// tempoMs: tempo de resposta em milissegundos
// detalhe: objeto livre com qualquer info extra (opcional)
function registrarResposta(contexto, correto, tempoMs, detalhe) {
    registrarEvento("resposta", contexto, Object.assign({
        resultado: correto ? "correto" : "erro",
        tempoMs: tempoMs
    }, detalhe || {}));
}

// ===== ENVIA A FILA ACUMULADA PARA O APPS SCRIPT (EM LOTE) =====
function enviarFilaEventos() {
    const fila = _trackingLerFila();
    if (fila.length === 0) return;

    if (!TRACKING_URL_APPS_SCRIPT || TRACKING_URL_APPS_SCRIPT.includes("COLE_AQUI")) {
        console.warn("tracking.js: URL do Apps Script nao configurada, eventos nao enviados.");
        return;
    }

    // Limpa a fila local ANTES de enviar (evita duplicar se o envio demorar
    // e um novo evento chegar entre o envio e a confirmacao)
    _trackingSalvarFila([]);

    const payload = JSON.stringify({ acao: "registrarEventos", eventos: fila });

    // Usa sendBeacon quando disponivel (funciona mesmo ao fechar/trocar de
    // pagina, sem precisar esperar resposta); cai para fetch como reserva.
    if (navigator.sendBeacon) {
        const enviado = navigator.sendBeacon(TRACKING_URL_APPS_SCRIPT, new Blob([payload], { type: "text/plain;charset=UTF-8" }));
        if (enviado) return;
    }

    fetch(TRACKING_URL_APPS_SCRIPT, {
        method: "POST",
        body: payload
    }).catch(() => {
        // Falha de rede: devolve os eventos para a fila para tentar de novo depois
        const filaAtual = _trackingLerFila();
        _trackingSalvarFila(fila.concat(filaAtual));
    });
}

// ===== INICIA O RASTREAMENTO NESTA PAGINA =====
// Registra entrada na pagina, configura envio periodico e cliques globais
function iniciarRastreamento() {
    _trackingPaginaInicio = Date.now();
    registrarEvento("pagina", "entrada", { url: window.location.href });

    // Envia a fila periodicamente
    if (_trackingIntervalId) clearInterval(_trackingIntervalId);
    _trackingIntervalId = setInterval(enviarFilaEventos, TRACKING_FLUSH_INTERVAL_MS);

    // Captura cliques em qualquer botao ou link da pagina, automaticamente
    document.addEventListener("click", (e) => {
        const alvo = e.target.closest("button, a, input[type='submit'], input[type='button']");
        if (!alvo) return;

        const identificador = alvo.id || alvo.className || alvo.textContent.trim().slice(0, 40) || "elemento_sem_id";
        registrarEvento("clique", identificador, { tag: alvo.tagName.toLowerCase() });
    });

    // Registra saida da pagina (fecha aba, navega para outra pagina, etc.)
    window.addEventListener("beforeunload", () => {
        const tempoNaPaginaMs = Date.now() - _trackingPaginaInicio;
        registrarEvento("pagina", "saida", { tempoNaPaginaMs });
        enviarFilaEventos(); // ultimo envio garantido via sendBeacon
    });

    // Tambem envia quando a aba fica em segundo plano (mobile/troca de aba)
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            enviarFilaEventos();
        }
    });
}