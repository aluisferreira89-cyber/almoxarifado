// ===== VARIÁVEIS GLOBAIS =====
const form = document.getElementById("pesquisaForm");
const tabela = document.getElementById("tabelaResultados");
let ultimoTermo = "";
let ultimosDados = [];
let filtroAberto = false;
let dadosCacheados = []; // 🔥 Cache dos dados

// URL do Google Sheets
const URL_GOOGLE_SHEETS = "https://script.google.com/macros/s/AKfycbxN9BulCbnSQ9KI5E8RCnlrC_9z1XWGemSFx8N9teO8QgEVkYfwyat5o972KG69E4RlOg/exec";

// ===== COMPAT: util seguro caso security-utils ainda não tenha carregado =====
function textoSeguro(v, max = 120) {
    if (typeof sanitizeText === "function") return sanitizeText(v, max);
    return String(v ?? "").slice(0, max).replace(/[\u0000-\u001F\u007F]/g, "").trim();
}
function podeExecutar(chave, limite, janelaMs) {
    if (typeof canRunAction === "function") return canRunAction(chave, limite, janelaMs);
    return true;
}
function comDebounce(fn, wait = 250) {
    if (typeof debounce === "function") return debounce(fn, wait);
    return fn;
}
function requisicaoSegura(url, options = {}, cfg = {}) {
    if (typeof safeFetch === "function") return safeFetch(url, options, cfg);
    return fetch(url, options);
}

// ===== UTILITÁRIO: limpar todos os filhos de um elemento (sem innerHTML) =====
function limparElemento(elemento) {
    while (elemento.firstChild) {
        elemento.removeChild(elemento.firstChild);
    }
}

// ===== FUNÇÃO: Carregar dados UMA VEZ =====
function carregarDadosCache() {
    console.log("📊 Carregando dados para cache...");
    mostrarToast("⏳ Carregando base de dados...", "info");

    requisicaoSegura(URL_GOOGLE_SHEETS, {}, { timeoutMs: 12000, retries: 1, retryDelayMs: 700 })
        .then(response => response.json())
        .then(data => {
            if (Array.isArray(data) && data.length > 0) {
                dadosCacheados = data;
                console.log(`✅ ${dadosCacheados.length} itens carregados em cache!`);
                mostrarToast(`✅ Base carregada com ${data.length} itens!`, "success");
            } else {
                mostrarToast("⚠️ Nenhum dado encontrado", "warning");
            }
        })
        .catch(error => {
            console.error("Erro ao carregar:", error);
            mostrarToast("❌ Erro ao carregar base de dados!", "error");
        });
}

// ===== AO CARREGAR A PÁGINA =====
window.addEventListener("load", () => {
    console.log("🚀 Página carregada");
    carregarDadosCache(); // Carrega dados ao abrir
});

// ===== EVENTO DE SUBMIT DO FORMULÁRIO =====
form.addEventListener("submit", function(e) {
    e.preventDefault();

    if (!podeExecutar("pesquisa_submit", 8, 8000)) {
        mostrarToast("⚠️ Muitas pesquisas seguidas. Aguarde um instante.", "warning");
        return;
    }

    const termo = textoSeguro(document.getElementById("pesquisa").value, 80);
    if (!termo) {
        mostrarToast("⚠️ Digite algo para pesquisar!", "warning");
        return;
    }
    ultimoTermo = termo;
    carregarResultados(termo);
});

// ===== EVENTO DO BOTÃO ATUALIZAR =====
const atualizarResultadosComDebounce = comDebounce(function() {
    if (ultimoTermo) {
        carregarResultados(ultimoTermo);
    } else {
        mostrarToast("⚠️ Faça uma pesquisa primeiro!", "warning");
    }
}, 250);

document.getElementById("btnAtualizar").addEventListener("click", atualizarResultadosComDebounce);

// ===== MOSTRAR/OCULTAR FILTROS =====
function mostrarFiltros() {
    const box = document.getElementById("filtrosBox");
    const arrow = document.querySelector(".filtros-arrow");

    box.style.maxHeight = "400px";
    arrow.style.transform = "rotate(180deg)";
    filtroAberto = true;
}

function ocultarFiltros() {
    const box = document.getElementById("filtrosBox");
    const arrow = document.querySelector(".filtros-arrow");

    box.style.maxHeight = "0";
    arrow.style.transform = "rotate(0deg)";
    filtroAberto = false;
}

// ===== OBTER FILTRO SELECIONADO =====
function obterFiltroSelecionado() {
    if (document.getElementById("chkItem").checked) return "item";
    if (document.getElementById("chkEndereco").checked) return "endereco";
    if (document.getElementById("chkEstabelecimentos").checked) return "estabelecimentos";
    if (document.getElementById("chkTodos").checked) return "todos";
    return null;
}

// ===== FILTRO 1: APENAS O PRIMEIRO ITEM ENCONTRADO =====
function filtrarApenasItem(termo, data) {
    const tt = textoSeguro(termo, 60).toLowerCase();
    const itemEncontrado = data.find(r => {
        const item = (r.item || "").toString().toLowerCase();
        return item.includes(tt);
    });

    if (!itemEncontrado) return [];
    return [itemEncontrado];
}

// ===== FILTRO 2: ITENS NO MESMO ENDEREÇO =====
function filtrarPorEndereco(termo, data) {
    const tt = textoSeguro(termo, 60).toLowerCase();
    const itemsEncontrados = data.filter(r => {
        const item = (r.item || "").toString().toLowerCase();
        const endereco = (r.endereco || "").toString().toLowerCase();
        return item.includes(tt) || endereco.includes(tt);
    });

    const enderecosEncontrados = [...new Set(itemsEncontrados.map(r => r.endereco))];
    return data.filter(r => enderecosEncontrados.includes(r.endereco));
}

// ===== FILTRO 3: DIFERENTES ESTABELECIMENTOS =====
function filtrarPorEstabelecimentos(termo, data) {
    const tt = textoSeguro(termo, 60).toLowerCase();
    const itemsEncontrados = data.filter(r => {
        const item = (r.item || "").toString().toLowerCase();
        return item.includes(tt);
    });

    const nomeItem = itemsEncontrados.length > 0 ? itemsEncontrados[0].item : null;
    if (!nomeItem) return [];

    return data.filter(r => {
        const item = (r.item || "").toString().toLowerCase();
        return item.includes((nomeItem || "").toString().toLowerCase());
    });
}

// ===== FILTRO 4: TODOS OS RESULTADOS =====
function filtrarTodos(termo, data) {
    const tt = textoSeguro(termo, 60).toLowerCase();
    return data.filter(r => {
        const item = (r.item || "").toString().toLowerCase();
        const endereco = (r.endereco || "").toString().toLowerCase();
        return item.includes(tt) || endereco.includes(tt);
    });
}

// ===== AGRUPAR RESULTADOS POR ESTABELECIMENTO =====
function agruparPorEstabelecimento(resultados) {
    const agrupados = {};
    resultados.forEach(r => {
        const est = r.estabelecimento || "Sem Estabelecimento";
        if (!agrupados[est]) agrupados[est] = [];
        agrupados[est].push(r);
    });
    return agrupados;
}

// ===== AGRUPAR RESULTADOS POR ENDEREÇO =====
function agruparPorEndereco(resultados) {
    const agrupados = {};
    resultados.forEach(r => {
        const end = r.endereco || "Sem Endereço";
        if (!agrupados[end]) agrupados[end] = [];
        agrupados[end].push(r);
    });
    return agrupados;
}

// ===== CARREGAR RESULTADOS (cache local) =====
function carregarResultados(entrada) {
    entrada = textoSeguro(entrada, 120);

    if (dadosCacheados.length === 0) {
        mostrarToast("⚠️ Base de dados não carregada ainda. Tente novamente!", "warning");
        return;
    }

    document.getElementById("loadingMsg").style.display = "flex";
    console.log("🔍 Pesquisando por:", entrada);

    setTimeout(() => {
        processarResultados(entrada, dadosCacheados);
    }, 200);
}

// ===== CRIAR CABEÇALHO DA TABELA =====
function criarCabecalhoTabela() {
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");

    const colunas = [
        { texto: "📦 Item", classe: "th-item" },
        { texto: "📍 Endereço", classe: "th-endereco" },
        { texto: "📝 Descrição", classe: "th-descricao" },
        { texto: "🔢 Quantidade", classe: "th-quantidade" },
        { texto: "🏢 Estabelecimento", classe: "th-estabelecimento" },
        { texto: "⚡ Ações", classe: "th-acoes" }
    ];

    colunas.forEach(({ texto, classe }) => {
        const th = document.createElement("th");
        th.className = classe;
        th.textContent = texto;
        tr.appendChild(th);
    });

    thead.appendChild(tr);
    return thead;
}

function criarLinhaMensagem(texto, classe = "msg-vazia") {
    const row = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.className = classe;
    td.textContent = texto;
    row.appendChild(td);
    return row;
}

function criarLinhaTitulo(texto, opcoes = {}) {
    const row = document.createElement("tr");
    if (opcoes.classe) row.classList.add(opcoes.classe);
    if (opcoes.background) row.style.background = opcoes.background;

    const td = document.createElement("td");
    td.colSpan = 6;
    if (opcoes.paddingLeft) td.style.paddingLeft = opcoes.paddingLeft;
    td.textContent = texto;

    row.appendChild(td);
    return row;
}

// ===== PROCESSAR RESULTADOS =====
function processarResultados(entrada, data) {
    const termos = entrada.split(/\s+|,/).filter(t => t.trim() !== "").map(t => textoSeguro(t, 40));
    const filtroSelecionado = obterFiltroSelecionado();

    console.log("Filtro selecionado:", filtroSelecionado);

    limparElemento(tabela);
    tabela.appendChild(criarCabecalhoTabela());

    let temResultados = 0;

    if (filtroSelecionado === "item") {
        const tbody = document.createElement("tbody");

        termos.forEach((t, idx) => {
            const filtrados = filtrarApenasItem(t, data);

            if (filtrados.length === 0) {
                if (idx === 0) tbody.appendChild(criarLinhaMensagem(`😢 Item "${t}" não encontrado`));
            } else {
                filtrados.forEach((resultado, index) => {
                    temResultados++;
                    tbody.appendChild(criarLinhaTabela(resultado, index));
                });
            }
        });
        tabela.appendChild(tbody);

    } else if (filtroSelecionado === "endereco") {
        const tbody = document.createElement("tbody");

        termos.forEach((t, termIdx) => {
            const filtrados = filtrarPorEndereco(t, data);

            if (filtrados.length === 0) {
                tbody.appendChild(criarLinhaMensagem(`😢 Nenhum resultado para "${t}"`));
            } else {
                const agrupados = agruparPorEndereco(filtrados);

                Object.keys(agrupados).forEach((endereco, endIdx) => {
                    const items = agrupados[endereco];
                    tbody.appendChild(criarLinhaTitulo(`📍 ${endereco} (${items.length} item${items.length !== 1 ? "s" : ""})`, { classe: "row-titulo" }));

                    items.forEach((resultado, index) => {
                        temResultados++;
                        tbody.appendChild(criarLinhaTabela(resultado, termIdx + endIdx + index * 0.05));
                    });
                });
            }
        });
        tabela.appendChild(tbody);

    } else if (filtroSelecionado === "estabelecimentos") {
        const tbody = document.createElement("tbody");

        termos.forEach((t, termIdx) => {
            const filtrados = filtrarPorEstabelecimentos(t, data);

            if (filtrados.length === 0) {
                tbody.appendChild(criarLinhaMensagem("😢 Item não encontrado em nenhum estabelecimento"));
            } else {
                const agrupados = agruparPorEstabelecimento(filtrados);

                Object.keys(agrupados).forEach((estabelecimento, estIdx) => {
                    const items = agrupados[estabelecimento];
                    tbody.appendChild(criarLinhaTitulo(`🏢 ${estabelecimento} (${items.length} item${items.length !== 1 ? "s" : ""})`, { classe: "row-titulo" }));

                    items.forEach((resultado, index) => {
                        temResultados++;
                        tbody.appendChild(criarLinhaTabela(resultado, termIdx + estIdx + index * 0.05));
                    });
                });
            }
        });
        tabela.appendChild(tbody);

    } else if (filtroSelecionado === "todos") {
        const tbody = document.createElement("tbody");

        termos.forEach((t, termIdx) => {
            const filtrados = filtrarTodos(t, data);

            if (filtrados.length === 0) {
                tbody.appendChild(criarLinhaMensagem(`😢 Nenhum resultado para "${t}"`));
            } else {
                tbody.appendChild(criarLinhaTitulo(`🔍 ${t} (${filtrados.length} resultado${filtrados.length !== 1 ? "s" : ""})`, { classe: "row-titulo" }));
                const agrupados = agruparPorEstabelecimento(filtrados);

                Object.keys(agrupados).forEach((estabelecimento, estIdx) => {
                    const items = agrupados[estabelecimento];
                    tbody.appendChild(criarLinhaTitulo(`🏢 ${estabelecimento}`, {
                        background: "rgba(0, 195, 255, 0.08)",
                        paddingLeft: "30px"
                    }));

                    items.forEach((resultado, index) => {
                        temResultados++;
                        tbody.appendChild(criarLinhaTabela(resultado, termIdx + estIdx + index * 0.05));
                    });
                });
            }
        });
        tabela.appendChild(tbody);

    } else {
        const tbody = document.createElement("tbody");
        termos.forEach(t => {
            const filtrados = filtrarTodos(t, data);
            filtrados.forEach((resultado, index) => {
                temResultados++;
                tbody.appendChild(criarLinhaTabela(resultado, index));
            });
        });
        if (tbody.children.length === 0) {
            tbody.appendChild(criarLinhaMensagem("😢 Nenhum resultado encontrado"));
        }
        tabela.appendChild(tbody);
    }

    if (temResultados > 0) {
        document.getElementById("infoResultados").textContent = `✨ ${temResultados} resultado${temResultados !== 1 ? "s" : ""} encontrado${temResultados !== 1 ? "s" : ""}`;
        mostrarToast(`✅ ${temResultados} resultado${temResultados !== 1 ? "s" : ""} carregado${temResultados !== 1 ? "s" : ""}!`, "success");
    } else {
        document.getElementById("infoResultados").textContent = "";
        mostrarToast("😢 Nenhum resultado encontrado", "info");
    }

    document.getElementById("loadingMsg").style.display = "none";
}

// ===== CRIAR LINHA DA TABELA =====
function criarLinhaTabela(resultado, index) {
    const row = document.createElement("tr");
    row.style.animationDelay = `${index * 0.05}s`;
    row.classList.add("row-animada");

    const tdItem = document.createElement("td");
    tdItem.textContent = resultado.item || "-";

    const tdEndereco = document.createElement("td");
    tdEndereco.textContent = resultado.endereco || "-";

    const tdDescricao = document.createElement("td");
    tdDescricao.textContent = resultado.descricao || "-";

    const tdQuantidade = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "badge-qty";
    badge.textContent = resultado.quantidade || 0;
    tdQuantidade.appendChild(badge);

    const tdEstabelecimento = document.createElement("td");
    tdEstabelecimento.textContent = resultado.estabelecimento || "-";

    const tdAcoes = document.createElement("td");
    const btnExcluir = document.createElement("button");
    btnExcluir.className = "btnExcluir";
    btnExcluir.type = "button";
    btnExcluir.title = "Remover esta linha";
    btnExcluir.textContent = "✕";
    tdAcoes.appendChild(btnExcluir);

    row.append(tdItem, tdEndereco, tdDescricao, tdQuantidade, tdEstabelecimento, tdAcoes);

    btnExcluir.addEventListener("click", () => {
        row.classList.add("row-removendo");
        setTimeout(() => {
            row.remove();
            verificarSeTemResultados();
        }, 300);
    });

    return row;
}

// ===== VERIFICAR SE AINDA TEM RESULTADOS =====
function verificarSeTemResultados() {
    const linhas = document.querySelectorAll("tbody tr");
    let temResultados = false;

    linhas.forEach(linha => {
        if (!linha.classList.contains("msg-vazia") && !linha.classList.contains("row-titulo")) {
            temResultados = true;
        }
    });

    if (!temResultados) {
        document.getElementById("pesquisa").value = "";
        mostrarToast("✅ Todos os itens foram removidos!", "info");
    } else {
        const contador = document.querySelectorAll("tbody tr:not(.row-titulo):not(.msg-vazia)").length;
        document.getElementById("infoResultados").textContent = `✨ ${contador} resultado${contador !== 1 ? "s" : ""} encontrado${contador !== 1 ? "s" : ""}`;
    }
}

// ===== COPIAR TABELA PARA CLIPBOARD =====
function copiarTabela() {
    const tabela = document.getElementById("tabelaResultados");
    let texto = "";

    const headers = Array.from(tabela.querySelectorAll("thead th"))
        .map(th => th.textContent.trim().replace(/[📦📍📝🔢🏢⚡]/g, "").trim());
    texto += headers.join("\t") + "\n";

    const linhas = tabela.querySelectorAll("tbody tr");
    let linhasCopiadas = 0;

    linhas.forEach(linha => {
        if (linha.classList.contains("row-titulo")) return;

        const cells = Array.from(linha.querySelectorAll("td")).slice(0, -1);
        const valores = cells.map(cell => cell.textContent.trim());

        if (valores.length > 0 && !linha.classList.contains("msg-vazia")) {
            texto += valores.join("\t") + "\n";
            linhasCopiadas++;
        }
    });

    if (linhasCopiadas === 0) {
        mostrarToast("⚠️ Nada para copiar!", "warning");
        return;
    }

    navigator.clipboard.writeText(texto).then(() => {
        mostrarToast(`✅ ${linhasCopiadas} linha${linhasCopiadas !== 1 ? "s" : ""} copiada${linhasCopiadas !== 1 ? "s" : ""}!`, "success");
    }).catch(() => {
        mostrarToast("❌ Erro ao copiar tabela", "error");
    });
}

// ===== SISTEMA DE NOTIFICAÇÕES (TOAST) =====
function mostrarToast(mensagem, tipo = "info") {
    const toast = document.getElementById("toast");
    toast.textContent = mensagem;
    toast.className = `toast toast-${tipo}`;

    void toast.offsetWidth;
    toast.classList.add("mostrar");

    setTimeout(() => {
        toast.classList.remove("mostrar");
    }, 3000);
}

// ===== INICIALIZAÇÃO =====
document.addEventListener("DOMContentLoaded", function() {
    console.log("✅ Página DOM carregada");

    const btnSair = document.getElementById("btnSair");
    if (btnSair) {
        btnSair.addEventListener("click", () => {
            if (window.confirm("Deseja encerrar a sessão e voltar para o login?")) {
                sair();
            }
        });
    }
});