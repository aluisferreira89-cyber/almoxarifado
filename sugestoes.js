// ===== VARIÁVEIS GLOBAIS =====
const form = document.getElementById("formSugestoes");
const comentarios = document.getElementById("comentarios");
const contador = document.getElementById("contador");
const btnEnviar = form.querySelector(".btn-enviar");

const URL_GOOGLE_SCRIPT = "https://script.google.com/macros/s/AKfycbwXJ-2HyElYGDI0zht-IibPUCd7LVfkYliitmN1gUlImmX7i97pqEkNiJX4CNhyE2AT/exec";
const INTERVALO_ENVIO_MS = 35 * 60 * 1000; // 35 minutos
const CHAVE_STORAGE = "ultimaSugestao";

let intervaloContagem = null;

// ===== CONTADOR DE CARACTERES =====
comentarios.addEventListener("input", () => {
    contador.textContent = `${comentarios.value.length} / 500 caracteres`;
});

// ===== SISTEMA DE NOTIFICAÇÕES (TOAST) =====
function mostrarToast(mensagem, tipo = "info") {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.textContent = mensagem; // textContent evita injeção de HTML
    toast.className = `toast toast-${tipo}`;

    void toast.offsetWidth;
    toast.classList.add("mostrar");

    setTimeout(() => {
        toast.classList.remove("mostrar");
    }, 4000);
}

// ===== CALCULA TEMPO RESTANTE DE BLOQUEIO =====
function obterTempoRestante() {
    const ultimaSugestaoStr = localStorage.getItem(CHAVE_STORAGE);
    if (!ultimaSugestaoStr) return 0;

    const ultimaSugestao = Number(ultimaSugestaoStr);
    if (!Number.isFinite(ultimaSugestao)) return 0;

    const agora = Date.now();
    const decorrido = agora - ultimaSugestao;
    const restante = INTERVALO_ENVIO_MS - decorrido;

    return restante > 0 ? restante : 0;
}

// ===== ATUALIZA ESTADO DO BOTÃO/CONTAGEM =====
function iniciarContagemBloqueio(restanteMs) {
    if (intervaloContagem) {
        clearInterval(intervaloContagem);
    }

    btnEnviar.disabled = true;

    function atualizar() {
        const restante = obterTempoRestante();

        if (restante <= 0) {
            clearInterval(intervaloContagem);
            intervaloContagem = null;
            btnEnviar.disabled = false;
            mostrarToast("✅ Você já pode enviar outra sugestão!", "success");
            return;
        }

        const minutos = Math.floor(restante / 60000);
        const segundos = Math.floor((restante % 60000) / 1000);
        mostrarToast(`⏳ Aguarde ${minutos}m ${segundos}s para enviar outra sugestão.`, "warning");
    }

    atualizar();
    intervaloContagem = setInterval(atualizar, 1000);
}

// ===== VALIDAÇÃO BÁSICA DO FORMULÁRIO =====
function validarFormulario(dados) {
    const nome = (dados.get("nome") || "").toString().trim();
    const setor = (dados.get("setor") || "").toString().trim();
    const avaliacaoStr = (dados.get("avaliacao") || "").toString().trim();

    if (!nome || !setor) {
        return "⚠️ Preencha nome e setor.";
    }

    if (avaliacaoStr !== "") {
        const avaliacao = Number(avaliacaoStr);
        if (!Number.isFinite(avaliacao) || avaliacao < 0 || avaliacao > 10) {
            return "⚠️ A avaliação deve ser um número entre 0 e 10.";
        }
    }

    return null;
}

// ===== ENVIO DO FORMULÁRIO =====
form.addEventListener("submit", function (e) {
    e.preventDefault();

    const restante = obterTempoRestante();
    if (restante > 0) {
        iniciarContagemBloqueio(restante);
        return;
    }

    const dados = new FormData(form);
    const erro = validarFormulario(dados);

    if (erro) {
        mostrarToast(erro, "warning");
        return;
    }

    btnEnviar.disabled = true;
    mostrarToast("📤 Enviando sugestão...", "info");

    fetch(URL_GOOGLE_SCRIPT, {
        method: "POST",
        body: dados
    })
        .then((response) => response.text())
        .then(() => {
            mostrarToast("✅ Sugestão enviada com sucesso!", "success");
            form.reset();
            contador.textContent = "0 / 500 caracteres";

            const agora = Date.now();
            localStorage.setItem(CHAVE_STORAGE, String(agora));
            iniciarContagemBloqueio(INTERVALO_ENVIO_MS);
        })
        .catch(() => {
            mostrarToast("❌ Erro ao enviar sugestão. Tente novamente.", "error");
            btnEnviar.disabled = false;
        });
});

// ===== INICIALIZAÇÃO =====
document.addEventListener("DOMContentLoaded", () => {
    console.log("✅ Página de Sugestões carregada");

    const restante = obterTempoRestante();
    if (restante > 0) {
        iniciarContagemBloqueio(restante);
    }
});