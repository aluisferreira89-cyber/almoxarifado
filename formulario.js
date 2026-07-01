const form = document.getElementById("meuFormulario");
const mensagem = document.getElementById("mensagem");
const salvarBtn = document.getElementById("salvarBtn");
const enviarBtn = document.getElementById("enviarBtn");
const listaDados = document.getElementById("listaDados");
const contador = document.getElementById("contador");
const itemInput = document.getElementById("item");
const pecaInput = document.getElementById("peca");

let registros = [];
let countdownId = null;
let dadosGlobais = []; // 🔥 Cache dos dados

// ===== FUNÇÃO: Mostrar Mensagem =====
function mostrarMensagem(texto, tipo = "info") {
    mensagem.textContent = texto;
    mensagem.classList.add("show");
    
    if (tipo === "sucesso") {
        mensagem.style.borderLeftColor = "var(--cor-sucesso)";
    } else if (tipo === "erro") {
        mensagem.style.borderLeftColor = "var(--cor-erro)";
    } else if (tipo === "aviso") {
        mensagem.style.borderLeftColor = "var(--cor-aviso)";
    } else {
        mensagem.style.borderLeftColor = "var(--cor-primaria)";
    }

    setTimeout(() => {
        mensagem.classList.remove("show");
    }, 4000);
}

// ===== FUNÇÃO: Atualizar Contador =====
function atualizarContador() {
    contador.textContent = registros.length;
}

// ===== FUNÇÃO: Iniciar Contador Regressivo =====
function iniciarContador(segundos) {
    enviarBtn.disabled = true;
    let tempoRestante = segundos;

    if (countdownId) clearInterval(countdownId);
    
    countdownId = setInterval(() => {
        if (tempoRestante > 0) {
            const minutos = Math.floor(tempoRestante / 60);
            const segundosRest = tempoRestante % 60;
            enviarBtn.textContent = `⏳ ${minutos}:${segundosRest.toString().padStart(2, "0")}`;
            tempoRestante--;
        } else {
            clearInterval(countdownId);
            enviarBtn.disabled = false;
            enviarBtn.textContent = "📤 Enviar";
            mostrarMensagem("✅ Você já pode enviar novamente!", "sucesso");
            localStorage.removeItem("ultimoEnvio");
        }
    }, 1000);
}

// ===== FUNÇÃO: Carregar todos os dados ao iniciar (UMA VEZ) =====
function carregarDadosGlobais() {
    mostrarMensagem("⏳ Carregando base de dados...", "info");
    
    fetch("https://script.google.com/macros/s/AKfycbxN9BulCbnSQ9KI5E8RCnlrC_9z1XWGemSFx8N9teO8QgEVkYfwyat5o972KG69E4RlOg/exec")
        .then(response => response.json())
        .then(data => {
            if (Array.isArray(data) && data.length > 0) {
                dadosGlobais = data;
                mostrarMensagem("✅ Base de dados carregada!", "sucesso");
                console.log(`📊 ${dadosGlobais.length} itens carregados em memória`);
            } else {
                mostrarMensagem("⚠️ Nenhum dado encontrado", "aviso");
            }
        })
        .catch(error => {
            console.error("Erro ao carregar:", error);
            mostrarMensagem("❌ Erro ao carregar base de dados!", "erro");
        });
}

// ===== AO CARREGAR A PÁGINA =====
window.addEventListener("load", () => {
    // Carrega dados globais
    carregarDadosGlobais();

    // Verifica bloqueio de 4 minutos
    const ultimoEnvio = localStorage.getItem("ultimoEnvio");
    if (ultimoEnvio) {
        const agora = Date.now();
        const diferenca = Math.floor((agora - parseInt(ultimoEnvio)) / 1000);
        const tempoTotal = 4 * 60;
        const restante = tempoTotal - diferenca;
        if (restante > 0) {
            iniciarContador(restante);
        } else {
            localStorage.removeItem("ultimoEnvio");
        }
    }
});

// ===== BOTÃO SALVAR =====
salvarBtn.addEventListener("click", function() {
    const nome = document.getElementById("nome").value.trim();
    const peca = document.getElementById("peca").value.trim();
    const item = document.getElementById("item").value.trim();
    const quantidade = document.getElementById("quantidade").value.trim();
    const estabelecimento = document.getElementById("estabelecimento").value.trim();

    if (!nome || !peca || !item || !quantidade || !estabelecimento) {
        mostrarMensagem("⚠️ Preencha todos os campos!", "aviso");
        return;
    }

    if (registros.length >= 15) {
        mostrarMensagem("⚠️ Limite de 15 itens atingido!", "aviso");
        return;
    }

    const dados = {
        nome,
        peca,
        item,
        quantidade,
        estabelecimento
    };

    registros.push(dados);

    const li = document.createElement("li");

    const divTexto = document.createElement("div");

    const strongNome = document.createElement("strong");
    strongNome.textContent = nome;

    divTexto.appendChild(strongNome);
    divTexto.appendChild(document.createTextNode(` - ${peca}`));
    divTexto.appendChild(document.createElement("br"));
    divTexto.appendChild(document.createTextNode(`Item: ${item} | Qtd: ${quantidade} | ${estabelecimento}`));

    const spanRemover = document.createElement("span");
    spanRemover.textContent = "❌";

    li.appendChild(divTexto);
    li.appendChild(spanRemover);

    spanRemover.addEventListener("click", function() {
        registros = registros.filter(r => r !== dados);
        li.remove();
        atualizarContador();
        mostrarMensagem("🗑️ Item removido!", "info");
    });

    listaDados.appendChild(li);
    atualizarContador();
    mostrarMensagem("💾 Dados salvos!", "sucesso");
    form.reset();
    pecaInput.value = "";
});

// ===== BOTÃO ENVIAR =====
enviarBtn.addEventListener("click", function() {
    if (enviarBtn.disabled) return;

    if (registros.length === 0) {
        mostrarMensagem("⚠️ Nenhum dado para enviar!", "aviso");
        return;
    }

    mostrarMensagem("⏳ Enviando...", "info");
    enviarBtn.disabled = true;

    Promise.all(registros.map(dados => {
        return fetch(form.action, {
            method: "POST",
            body: new URLSearchParams(dados)
        });
    }))
    .then(responses => {
        if (responses.every(r => r.ok)) {
            mostrarMensagem("✅ Dados enviados com sucesso!", "sucesso");
            registros = [];
            listaDados.innerHTML = "";
            atualizarContador();
            form.reset();
            pecaInput.value = "";

            localStorage.setItem("ultimoEnvio", Date.now().toString());
            iniciarContador(4 * 60);
        } else {
            mostrarMensagem("❌ Erro ao enviar dados!", "erro");
            enviarBtn.disabled = false;
        }
    })
    .catch(error => {
        console.error("Erro:", error);
        mostrarMensagem("❌ Erro de conexão!", "erro");
        enviarBtn.disabled = false;
    });
});

// ===== BUSCAR DESCRIÇÃO DO ITEM (INSTANTÂNEO! 🚀) =====
itemInput.addEventListener("blur", function() {
    const codigo = this.value.trim();
    
    if (!codigo) {
        pecaInput.value = "";
        return;
    }

    // 🔥 BUSCA LOCAL (instantânea!)
    const resultado = dadosGlobais.find(r => r.item && r.item.toString() === codigo);
    
    if (resultado) {
        pecaInput.value = resultado.descricao || "Descrição não disponível";
        mostrarMensagem("✅ Descrição carregada!", "sucesso");
    } else {
        pecaInput.value = "Item não encontrado";
        mostrarMensagem("⚠️ Item não encontrado na base de dados!", "aviso");
    }
});

// ===== BONUS: Busca também enquanto digita (em tempo real) =====
itemInput.addEventListener("input", function() {
    const codigo = this.value.trim();
    
    if (!codigo) {
        pecaInput.value = "";
        return;
    }

    // Só busca se o código tem pelo menos 3 dígitos
    if (codigo.length >= 3) {
        const resultado = dadosGlobais.find(r => r.item && r.item.toString().includes(codigo));
        
        if (resultado) {
            pecaInput.value = resultado.descricao || "Descrição não disponível";
        } else {
            pecaInput.value = "";
        }
    }
});