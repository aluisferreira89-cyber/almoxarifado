// ===== VARIAVEIS GLOBAIS =====
let dadosCacheados = [];
let itensParaBaixa = [];
let linhasOriginaisBaixa = [];

// URL do Apps Script, igual a usada pela pagina de Enderecos.
const URL_GOOGLE_SHEETS = "https://script.google.com/macros/s/AKfycbxN9BulCbnSQ9KI5E8RCnlrC_9z1XWGemSFx8N9teO8QgEVkYfwyat5o972KG69E4RlOg/exec";

function mostrarToast(mensagem, tipo = "info") {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.textContent = mensagem;
    toast.className = `toast toast-${tipo}`;

    void toast.offsetWidth;
    toast.classList.add("mostrar");

    setTimeout(() => {
        toast.classList.remove("mostrar");
    }, 4000);
}

function converterNumero(valor) {
    if (typeof valor === "number") {
        return Number.isFinite(valor) ? valor : 0;
    }

    const texto = String(valor || "").trim().replace(/\s/g, "");
    if (!texto) return 0;

    const normalizado = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(texto)
        ? texto.replace(/\./g, "").replace(",", ".")
        : texto.replace(",", ".");

    const numero = Number(normalizado);
    return Number.isFinite(numero) ? numero : 0;
}

function formatarQuantidade(valor) {
    const numero = converterNumero(valor);
    return Number.isInteger(numero)
        ? String(numero)
        : numero.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function normalizarBusca(valor) {
    return String(valor || "").trim().toLowerCase();
}

function normalizarRegistro(registro) {
    return {
        item: String(registro.item || "").trim(),
        endereco: String(registro.endereco || "").trim(),
        descricao: String(registro.descricao || "").trim(),
        quantidade: converterNumero(registro.quantidade),
        estabelecimento: String(registro.estabelecimento || "-").trim() || "-"
    };
}

function limparElemento(elemento) {
    while (elemento.firstChild) {
        elemento.removeChild(elemento.firstChild);
    }
}

function criarCelula(texto = "", classe = "") {
    const td = document.createElement("td");
    if (classe) td.className = classe;
    td.textContent = texto;
    return td;
}

function carregarDadosCache() {
    const loading = document.getElementById("loadingMsg");
    if (loading) loading.style.display = "flex";

    fetch(URL_GOOGLE_SHEETS)
        .then((response) => {
            if (!response.ok) {
                throw new Error("Resposta invalida do Apps Script.");
            }
            return response.json();
        })
        .then((data) => {
            const lista = Array.isArray(data) ? data : [];
            dadosCacheados = lista
                .map(normalizarRegistro)
                .filter((registro) => registro.item && registro.quantidade > 0);

            if (dadosCacheados.length > 0) {
                mostrarToast(`Base carregada com ${dadosCacheados.length} linha(s) com estoque.`, "success");
            } else {
                mostrarToast("Nenhum item com estoque encontrado na base.", "warning");
            }
        })
        .catch(() => {
            mostrarToast("Erro ao carregar base de dados.", "error");
        })
        .finally(() => {
            if (loading) loading.style.display = "none";
        });
}

function parsearColagem(texto) {
    const linhas = texto
        .split(/\r?\n/)
        .map((linha) => linha.trim())
        .filter((linha) => linha !== "");

    return linhas.map((linha) => {
        const colunas = linha.includes("\t")
            ? linha.split(/\t/).map((coluna) => coluna.trim())
            : linha.split(";").map((coluna) => coluna.trim());

        if (colunas.length < 3) {
            return {
                item: linha,
                descricao: "",
                quantidade: null,
                erro: "Linha incompleta. Esperado: item, descricao e quantidade."
            };
        }

        const item = colunas[0];
        const descricao = colunas[1];
        const quantidade = converterNumero(colunas[2]);

        if (!item) {
            return { item: linha, descricao, quantidade: null, erro: "Item vazio." };
        }

        if (!Number.isFinite(quantidade) || quantidade <= 0) {
            return { item, descricao, quantidade: null, erro: "Quantidade invalida." };
        }

        return { item, descricao, quantidade, erro: null };
    });
}

function buscarOcorrenciasItem(nomeItem) {
    const termo = normalizarBusca(nomeItem);
    return dadosCacheados.filter((registro) => normalizarBusca(registro.item) === termo);
}

function agruparPorEstabelecimento(ocorrencias) {
    return ocorrencias.reduce((grupos, ocorrencia) => {
        const estabelecimento = ocorrencia.estabelecimento || "-";
        if (!grupos[estabelecimento]) {
            grupos[estabelecimento] = [];
        }
        grupos[estabelecimento].push(ocorrencia);
        return grupos;
    }, {});
}

function calcularPercentual(disponivelTotal, quantidadePedida) {
    if (!quantidadePedida || quantidadePedida <= 0) return 0;
    const percentual = (disponivelTotal / quantidadePedida) * 100;
    return Math.max(0, Math.min(100, percentual));
}

function classePercentual(percentual) {
    if (percentual <= 40) return "baixa";
    if (percentual <= 70) return "media";
    return "alta";
}

function dividirEntreEnderecos(ocorrenciasDoEstabelecimento, quantidadePedida) {
    let restante = quantidadePedida;
    const partes = [];
    const disponivelTotal = ocorrenciasDoEstabelecimento.reduce(
        (total, ocorrencia) => total + converterNumero(ocorrencia.quantidade),
        0
    );

    ocorrenciasDoEstabelecimento.forEach((ocorrencia) => {
        if (restante <= 0) return;

        const disponivel = converterNumero(ocorrencia.quantidade);
        if (disponivel <= 0) return;

        const tirarDaqui = Math.min(disponivel, restante);
        partes.push({
            item: ocorrencia.item,
            endereco: ocorrencia.endereco,
            estabelecimento: ocorrencia.estabelecimento,
            quantidade: tirarDaqui,
            disponivelNoEndereco: disponivel
        });

        restante -= tirarDaqui;
    });

    return {
        partes,
        faltou: Math.max(0, restante),
        disponivelTotal,
        percentual: calcularPercentual(disponivelTotal, quantidadePedida)
    };
}

function renderizarEnderecos(td, preview) {
    limparElemento(td);

    if (!preview.partes.length) {
        const span = document.createElement("span");
        span.className = "baixa-endereco-vazio";
        span.textContent = "Sem estoque disponivel";
        td.appendChild(span);
        return;
    }

    const lista = document.createElement("div");
    lista.className = "baixa-enderecos-lista";

    preview.partes.forEach((parte) => {
        const linha = document.createElement("span");
        linha.className = "baixa-endereco-item";
        linha.textContent = `${parte.endereco} (${formatarQuantidade(parte.quantidade)})`;
        lista.appendChild(linha);
    });

    if (preview.faltou > 0) {
        const falta = document.createElement("span");
        falta.className = "baixa-alerta-falta";
        falta.textContent = `Faltam ${formatarQuantidade(preview.faltou)}`;
        lista.appendChild(falta);
    }

    td.appendChild(lista);
}

function renderizarPercentual(td, preview) {
    limparElemento(td);
    td.className = "percentual-box";

    const badge = document.createElement("span");
    badge.className = `percentual-badge ${classePercentual(preview.percentual)}`;
    badge.textContent = `${Math.round(preview.percentual)}%`;

    const detalhe = document.createElement("span");
    detalhe.className = "percentual-detalhe";
    detalhe.textContent = `${formatarQuantidade(preview.disponivelTotal)} de ${formatarQuantidade(preview.quantidadePedida)}`;

    td.appendChild(badge);
    td.appendChild(detalhe);
}

function atualizarToggleEstado(toggle, preview) {
    const inputs = toggle.querySelectorAll("input");
    const inputSim = toggle.querySelector('input[value="sim"]');
    const inputNao = toggle.querySelector('input[value="nao"]');
    const podeSeparar = preview.partes.length > 0;

    inputs.forEach((input) => {
        input.disabled = !podeSeparar;
    });

    toggle.classList.toggle("is-disabled", !podeSeparar);

    if (!podeSeparar) {
        preview.separar = false;
        preview.status = "SEM_ESTOQUE";
        preview.motivo = "Sem estoque disponivel";
        inputSim.checked = false;
        inputNao.checked = true;
    } else if (!inputSim.checked && !inputNao.checked) {
        preview.separar = true;
        preview.status = "BAIXAR";
        preview.motivo = "";
        inputSim.checked = true;
    }
}

function criarToggleSeparar(preview) {
    const wrapper = document.createElement("div");
    wrapper.className = "separar-toggle";

    const name = `separar-${preview.id}`;

    const inputSim = document.createElement("input");
    inputSim.type = "radio";
    inputSim.name = name;
    inputSim.value = "sim";
    inputSim.checked = true;

    const labelSim = document.createElement("label");
    labelSim.className = "separar-opcao";
    labelSim.textContent = "Sim";

    const inputNao = document.createElement("input");
    inputNao.type = "radio";
    inputNao.name = name;
    inputNao.value = "nao";

    const labelNao = document.createElement("label");
    labelNao.className = "separar-opcao";
    labelNao.textContent = "Nao";

    wrapper.appendChild(inputSim);
    wrapper.appendChild(labelSim);
    wrapper.appendChild(inputNao);
    wrapper.appendChild(labelNao);

    inputSim.addEventListener("change", () => {
        if (inputSim.checked) {
            preview.separar = true;
            preview.status = "BAIXAR";
            preview.motivo = "";
            atualizarResumoBaixa();
        }
    });

    inputNao.addEventListener("change", () => {
        if (inputNao.checked) {
            preview.separar = false;
            preview.status = "NAO_MARCADO";
            preview.motivo = "Item marcado como Nao";
            atualizarResumoBaixa();
        }
    });

    labelSim.addEventListener("click", () => {
        if (!inputSim.disabled) inputSim.checked = true;
        inputSim.dispatchEvent(new Event("change"));
    });

    labelNao.addEventListener("click", () => {
        if (!inputNao.disabled) inputNao.checked = true;
        inputNao.dispatchEvent(new Event("change"));
    });

    return wrapper;
}

function criarLinhaErro(tbody, item, descricao, quantidade, mensagem) {
    const tr = document.createElement("tr");
    tr.appendChild(criarCelula(item, "baixa-col-item"));
    tr.appendChild(criarCelula(descricao || "-"));
    tr.appendChild(criarCelula(quantidade ? formatarQuantidade(quantidade) : "-", "baixa-col-numero"));

    const tdErro = criarCelula(mensagem, "baixa-linha-erro");
    tdErro.colSpan = 4;
    tr.appendChild(tdErro);

    tbody.appendChild(tr);
}

function criarCabecalhoTabela() {
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");
    [
        "Item",
        "Descricao",
        "Quantidade pedida",
        "Endereco(s)",
        "Estabelecimento",
        "% Disponivel",
        "Separar?"
    ].forEach((titulo) => {
        const th = document.createElement("th");
        th.textContent = titulo;
        tr.appendChild(th);
    });
    thead.appendChild(tr);
    return thead;
}

function criarLinhaPreview(tbody, linha, indice, porEstabelecimento, estabelecimentos) {
    const preview = {
        id: `${Date.now()}-${indice}`,
        indiceOriginal: indice,
        item: linha.item,
        descricao: linha.descricao,
        quantidadePedida: linha.quantidade,
        estabelecimento: "",
        partes: [],
        faltou: linha.quantidade,
        disponivelTotal: 0,
        percentual: 0,
        separar: true,
        status: "BAIXAR",
        motivo: ""
    };

    itensParaBaixa.push(preview);

    const tr = document.createElement("tr");
    const tdEnderecos = document.createElement("td");
    const tdEstabelecimento = document.createElement("td");
    const tdPercentual = document.createElement("td");
    const tdSeparar = document.createElement("td");
    const toggle = criarToggleSeparar(preview);

    function aplicarEstabelecimento(estabelecimento) {
        const divisao = dividirEntreEnderecos(porEstabelecimento[estabelecimento], linha.quantidade);

        preview.estabelecimento = estabelecimento;
        preview.partes = divisao.partes;
        preview.faltou = divisao.faltou;
        preview.disponivelTotal = divisao.disponivelTotal;
        preview.percentual = divisao.percentual;

        if (!preview.partes.length) {
            preview.separar = false;
            preview.status = "SEM_ESTOQUE";
            preview.motivo = "Sem estoque disponivel";
        } else if (preview.separar) {
            preview.status = "BAIXAR";
            preview.motivo = "";
        } else {
            preview.status = "NAO_MARCADO";
            preview.motivo = "Item marcado como Nao";
        }

        renderizarEnderecos(tdEnderecos, preview);
        renderizarPercentual(tdPercentual, preview);
        atualizarToggleEstado(toggle, preview);
        atualizarResumoBaixa();
    }

    tr.appendChild(criarCelula(linha.item, "baixa-col-item"));
    tr.appendChild(criarCelula(linha.descricao || "-"));
    tr.appendChild(criarCelula(formatarQuantidade(linha.quantidade), "baixa-col-numero"));
    tr.appendChild(tdEnderecos);

    if (estabelecimentos.length > 1) {
        const select = document.createElement("select");
        select.className = "baixa-select-endereco";

        estabelecimentos.forEach((estabelecimento) => {
            const option = document.createElement("option");
            option.value = estabelecimento;
            option.textContent = estabelecimento;
            select.appendChild(option);
        });

        select.addEventListener("change", () => {
            aplicarEstabelecimento(select.value);
        });

        tdEstabelecimento.appendChild(select);
    } else {
        tdEstabelecimento.textContent = estabelecimentos[0];
    }

    tr.appendChild(tdEstabelecimento);
    tr.appendChild(tdPercentual);
    tdSeparar.appendChild(toggle);
    tr.appendChild(tdSeparar);
    tbody.appendChild(tr);

    aplicarEstabelecimento(estabelecimentos[0]);

    return preview;
}

function atualizarResumoBaixa() {
    const resumo = document.getElementById("resumoBaixa");
    const btnConfirmar = document.getElementById("btnConfirmarBaixa");
    if (!resumo || !btnConfirmar) return;

    const itensComEstoque = itensParaBaixa.filter((item) => item.partes.length > 0);
    const itensSelecionados = itensComEstoque.filter((item) => item.separar);
    const baixas = gerarBaixasSelecionadas();
    const itensParciais = itensSelecionados.filter((item) => item.faltou > 0).length;

    resumo.textContent = `${itensSelecionados.length} item(ns) marcado(s) como Sim, gerando ${baixas.length} baixa(s) por endereco.`;

    if (itensParciais > 0) {
        resumo.textContent += ` ${itensParciais} item(ns) tem estoque parcial.`;
    }

    btnConfirmar.disabled = baixas.length === 0;
}

function processarColagem() {
    const textarea = document.getElementById("baixaTextarea");
    const texto = textarea.value;

    if (!texto.trim()) {
        mostrarToast("Cole os dados da planilha antes de processar.", "warning");
        return;
    }

    if (dadosCacheados.length === 0) {
        mostrarToast("Base de dados ainda nao carregada. Aguarde e tente novamente.", "warning");
        return;
    }

    const linhasParseadas = parsearColagem(texto);
    linhasOriginaisBaixa = linhasParseadas.map((linha, idx) => ({
        indice: idx,
        item: linha.item || "",
        descricao: linha.descricao || "",
        quantidade: linha.quantidade,
        erro: linha.erro || null
    }));

    itensParaBaixa = [];

    const container = document.getElementById("baixaResultadoContainer");
    limparElemento(container);

    const scroll = document.createElement("div");
    scroll.className = "baixa-tabela-scroll";

    const tabela = document.createElement("table");
    tabela.className = "baixa-tabela-preview";
    tabela.appendChild(criarCabecalhoTabela());

    const tbody = document.createElement("tbody");
    tabela.appendChild(tbody);

    linhasParseadas.forEach((linha, indice) => {
        if (linha.erro) {
            criarLinhaErro(tbody, linha.item, linha.descricao, linha.quantidade, linha.erro);
            return;
        }

        const ocorrencias = buscarOcorrenciasItem(linha.item);

        if (ocorrencias.length === 0) {
            const mensagem = "Item nao encontrado na base.";
            criarLinhaErro(tbody, linha.item, linha.descricao, linha.quantidade, mensagem);
            return;
        }

        const porEstabelecimento = agruparPorEstabelecimento(ocorrencias);
        const estabelecimentos = Object.keys(porEstabelecimento);

        criarLinhaPreview(tbody, linha, indice, porEstabelecimento, estabelecimentos);
    });

    scroll.appendChild(tabela);
    container.appendChild(scroll);

    const resumo = document.createElement("p");
    resumo.id = "resumoBaixa";
    resumo.className = "resumo-baixa";
    container.appendChild(resumo);

    const btnConfirmar = document.getElementById("btnConfirmarBaixa");
    const temBaixaPossivel = itensParaBaixa.some((item) => item.partes.length > 0);
    btnConfirmar.style.display = temBaixaPossivel ? "block" : "none";
    btnConfirmar.disabled = !temBaixaPossivel;

    atualizarResumoBaixa();

    if (!temBaixaPossivel) {
        mostrarToast("Nenhum item com estoque disponivel para baixa.", "warning");
    } else {
        mostrarToast("Revise a porcentagem e o Sim/Nao antes de confirmar.", "info");
    }
}

function gerarBaixasSelecionadas() {
    return itensParaBaixa
        .filter((item) => item.separar && item.partes.length > 0)
        .flatMap((item) => item.partes.map((parte) => ({
            item: parte.item,
            descricao: item.descricao || "",
            endereco: parte.endereco,
            estabelecimento: parte.estabelecimento,
            quantidade: parte.quantidade,
            quantidadePedida: item.quantidadePedida,
            percentualDisponivel: Math.round(item.percentual)
        })));
}

function montarLinhasCopiaCompleta() {
    const linhas = [];

    itensParaBaixa.forEach((item) => {
        if (!item.separar) {
            linhas.push({
                item: item.item || "",
                descricao: item.descricao || "",
                quantidade: formatarQuantidade(item.quantidadePedida),
                endereco: "",
                estabelecimento: ""
            });
            return;
        }

        if (!item.partes.length) {
            linhas.push({
                item: item.item || "",
                descricao: item.descricao || "",
                quantidade: formatarQuantidade(item.quantidadePedida),
                endereco: "",
                estabelecimento: ""
            });
            return;
        }

        item.partes.forEach((parte) => {
            linhas.push({
                item: parte.item || item.item || "",
                descricao: item.descricao || "",
                quantidade: formatarQuantidade(parte.quantidade),
                endereco: parte.endereco || "",
                estabelecimento: parte.estabelecimento || ""
            });
        });

        if (item.faltou > 0) {
            linhas.push({
                item: item.item || "",
                descricao: item.descricao || "",
                quantidade: formatarQuantidade(item.faltou),
                endereco: "",
                estabelecimento: ""
            });
        }
    });

    linhasOriginaisBaixa.forEach((linhaOriginal) => {
        const foiProcessadaComoPreview = itensParaBaixa.some((p) => p.indiceOriginal === linhaOriginal.indice);
        if (foiProcessadaComoPreview) return;

        linhas.push({
            item: linhaOriginal.item || "",
            descricao: linhaOriginal.descricao || "",
            quantidade: linhaOriginal.quantidade ? formatarQuantidade(linhaOriginal.quantidade) : "",
            endereco: "",
            estabelecimento: ""
        });
    });

    return linhas;
}

function montarDadosParaExcel() {
    return montarLinhasCopiaCompleta().map((linha) => ({
        Item: linha.item || "",
        Descricao: linha.descricao || "",
        Quantidade: linha.quantidade || "",
        Endereco: linha.endereco || "",
        Estabelecimento: linha.estabelecimento || ""
    }));
}

function gerarArquivoExcel(linhas, nomeArquivo = "baixa_estoque.xlsx") {
    if (typeof XLSX === "undefined") {
        throw new Error("Biblioteca XLSX nao carregada.");
    }

    const dados = [
        ["Item", "Descricao", "Quantidade", "Endereco", "Estabelecimento"],
        ...linhas.map((linha) => [
            linha.Item,
            linha.Descricao,
            linha.Quantidade,
            linha.Endereco,
            linha.Estabelecimento
        ])
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(dados);

    ws["!cols"] = [
        { wch: 18 },
        { wch: 35 },
        { wch: 12 },
        { wch: 30 },
        { wch: 25 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Baixa");

    XLSX.writeFile(wb, nomeArquivo);
}

function limparTelaAposBaixa() {
    const btnConfirmar = document.getElementById("btnConfirmarBaixa");
    document.getElementById("baixaTextarea").value = "";
    document.getElementById("baixaResultadoContainer").innerHTML = "";
    btnConfirmar.style.display = "none";
    btnConfirmar.disabled = true;
    itensParaBaixa = [];
    linhasOriginaisBaixa = [];
}

function confirmarBaixaEstoque() {
    if (typeof sessaoValida === "function" && !sessaoValida()) {
        mostrarToast("Sua sessao expirou. Faca login novamente.", "warning");
        window.location.replace("login.html");
        return;
    }

    const baixas = gerarBaixasSelecionadas();

    if (baixas.length === 0) {
        mostrarToast("Nenhum item marcado como Sim para baixar.", "warning");
        return;
    }

    const confirmado = window.confirm(`Confirmar baixa de ${baixas.length} endereco(s) marcado(s) como Sim?`);

    if (!confirmado) {
        mostrarToast("Baixa cancelada.", "info");
        return;
    }

    const btnConfirmar = document.getElementById("btnConfirmarBaixa");
    btnConfirmar.disabled = true;
    mostrarToast("Processando baixa e gerando Excel...", "info");

    const inicioBaixa = Date.now();
    const usuarioLogado = typeof nomeUsuarioLogado === "function" ? nomeUsuarioLogado() : "";
    let copiaRealizada = false;

    fetch(URL_GOOGLE_SHEETS, {
        method: "POST",
        body: JSON.stringify({
            baixas,
            relatorioAlertas: true,
            usuario: usuarioLogado,
            colunasCopiadas: ["Item", "Descricao", "Quantidade", "Endereco", "Estabelecimento"]
        })
    })
    .then((response) => response.json())
    .then((resultado) => {
        btnConfirmar.disabled = false;

        if (resultado.sucesso) {
            const dadosExcel = montarDadosParaExcel();

            try {
                gerarArquivoExcel(dadosExcel, "baixa_estoque.xlsx");
                copiaRealizada = true;
                mostrarToast("Baixa concluida e arquivo Excel gerado.", "success");
            } catch (erro) {
                mostrarToast("Baixa concluida, mas nao foi possivel gerar o Excel.", "warning");
            }

            if (typeof registrarResposta === "function") {
                registrarResposta("baixa_estoque", true, Date.now() - inicioBaixa, {
                    quantidadeEnderecos: baixas.length,
                    copiaRealizada
                });
            }

            if (typeof enviarFilaEventos === "function") enviarFilaEventos();

            limparTelaAposBaixa();
            carregarDadosCache();
        } else {
            const falhasTexto = (resultado.falhas || [])
                .map((falha) => `${falha.item}: ${falha.motivo}`)
                .join(" | ");

            mostrarToast(`${resultado.mensagem || "Baixa processada com alerta."} ${falhasTexto}`, "warning");

            if (typeof registrarResposta === "function") {
                registrarResposta("baixa_estoque", false, Date.now() - inicioBaixa, {
                    quantidadeEnderecos: baixas.length,
                    motivo: resultado.mensagem || "falha nao especificada",
                    falhas: falhasTexto
                });
            }

            if (typeof enviarFilaEventos === "function") enviarFilaEventos();
        }
    })
    .catch(() => {
        btnConfirmar.disabled = false;
        mostrarToast("Erro ao processar a baixa. Tente novamente.", "error");

        if (typeof registrarResposta === "function") {
            registrarResposta("baixa_estoque", false, Date.now() - inicioBaixa, {
                quantidadeEnderecos: baixas.length,
                motivo: "erro de rede ou conexao"
            });
        }

        if (typeof enviarFilaEventos === "function") enviarFilaEventos();
    });
}

window.addEventListener("load", carregarDadosCache);

document.addEventListener("DOMContentLoaded", () => {
    const btnProcessar = document.getElementById("btnProcessarColagem");
    const btnConfirmar = document.getElementById("btnConfirmarBaixa");
    const btnSair = document.getElementById("btnSair");

    if (btnProcessar) {
        btnProcessar.addEventListener("click", processarColagem);
    }

    if (btnConfirmar) {
        btnConfirmar.addEventListener("click", confirmarBaixaEstoque);
    }

    if (btnSair) {
        btnSair.addEventListener("click", () => {
            if (window.confirm("Deseja encerrar a sessão e voltar para o login?")) {
                sair();
            }
        });
    }
});