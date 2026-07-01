const URL_GOOGLE_SCRIPT = "https://script.google.com/macros/s/AKfycbzc4Gs9m0mfEjQn60MoLdCwd3a4i5h-TmYG6ebKAKsMAzHuM27R0P3q9bQ-PcAP7LRP5Q/exec";
const PAGINA_DESTINO = "enderecos.html";
const URL_SERVICO_IP = "https://api.ipify.org?format=json";

const formLogin = document.getElementById("formLogin");
const formTrocaSenha = document.getElementById("formTrocaSenha");
const btnEntrar = document.getElementById("btnEntrar");
const btnMostrarTrocaSenha = document.getElementById("btnMostrarTrocaSenha");
const btnVoltarLogin = document.getElementById("btnVoltarLogin");
const usuarioInput = document.getElementById("usuario");
const senhaInput = document.getElementById("senha");
const btnToggleSenha = document.getElementById("btnToggleSenha");
const lembrarCheck = document.getElementById("lembrar");
const infoTentativas = document.getElementById("infoTentativas");
const CHAVE_USUARIO_LEMBRADO = "usuarioLembrado";

function detectarDispositivo() {
    const ua = navigator.userAgent || "";
    return /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua) ? "celular" : "computador";
}

function obterIpPublico() {
    const buscaIp = safeFetch(URL_SERVICO_IP, {}, { timeoutMs: 1200, retries: 0 })
        .then(r => r.json())
        .then(d => d.ip || "")
        .catch(() => "");
    const tempoLimite = new Promise(resolve => setTimeout(() => resolve(""), 1200));
    return Promise.race([buscaIp, tempoLimite]);
}

function mostrarToast(mensagem, tipo = "info") {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = mensagem;
    toast.className = `toast toast-${tipo}`;
    void toast.offsetWidth;
    toast.classList.add("mostrar");
    setTimeout(() => toast.classList.remove("mostrar"), 4000);
}

btnMostrarTrocaSenha.addEventListener("click", () => {
    formLogin.classList.add("card-oculto");
    formTrocaSenha.classList.remove("card-oculto");
});

btnVoltarLogin.addEventListener("click", () => {
    formTrocaSenha.classList.add("card-oculto");
    formLogin.classList.remove("card-oculto");
});

btnToggleSenha.addEventListener("click", () => {
    const oculta = senhaInput.type === "password";
    senhaInput.type = oculta ? "text" : "password";
    btnToggleSenha.textContent = oculta ? "🙈" : "👁️";
});

senhaInput.addEventListener("paste", (e) => {
    e.preventDefault();
    mostrarToast("⚠️ Não é permitido colar a senha. Digite manualmente.", "warning");
});

function carregarUsuarioLembrado() {
    const usuarioSalvo = localStorage.getItem(CHAVE_USUARIO_LEMBRADO);
    if (usuarioSalvo) {
        usuarioInput.value = sanitizeAlnum(usuarioSalvo, 40);
        lembrarCheck.checked = true;
        senhaInput.focus();
    }
}

function salvarOuLimparUsuarioLembrado(usuario) {
    if (lembrarCheck.checked) localStorage.setItem(CHAVE_USUARIO_LEMBRADO, sanitizeAlnum(usuario, 40));
    else localStorage.removeItem(CHAVE_USUARIO_LEMBRADO);
}

formLogin.addEventListener("submit", function (e) {
    e.preventDefault();

    if (!canRunAction("login_submit", 6, 15000)) {
        mostrarToast("Muitas tentativas em pouco tempo. Aguarde.", "warning");
        return;
    }

    const usuario = sanitizeAlnum(usuarioInput.value, 40);
    const senha = String(senhaInput.value || "");

    if (!usuario || !senha) {
        mostrarToast("⚠️ Preencha usuário e senha.", "warning");
        return;
    }

    btnEntrar.disabled = true;
    btnEntrar.classList.add("carregando");
    infoTentativas.textContent = "";
    infoTentativas.classList.remove("bloqueado");

    const inicio = Date.now();
    const dispositivo = detectarDispositivo();

    obterIpPublico()
        .then((ip) => {
            const dados = new URLSearchParams();
            dados.set("acao", "login");
            dados.set("usuario", usuario);
            dados.set("senha", senha);
            dados.set("ip", ip);
            dados.set("dispositivo", dispositivo);

            return safeFetch(URL_GOOGLE_SCRIPT, {
                method: "POST",
                body: dados
            }, { timeoutMs: 12000, retries: 1, retryDelayMs: 700 });
        })
        .then((response) => response.json())
        .then((resultado) => {
            btnEntrar.classList.remove("carregando");

            if (resultado.sucesso) {
                salvarOuLimparUsuarioLembrado(usuario);
                criarSessao(usuario);

                if (typeof registrarResposta === "function") {
                    registrarResposta("login", true, Date.now() - inicio, { dispositivo });
                }

                mostrarToast(`✅ Bem-vindo, ${usuario}!`, "success");
                setTimeout(() => { window.location.href = PAGINA_DESTINO; }, 700);
            } else {
                btnEntrar.disabled = false;
                senhaInput.value = "";
                const bloqueadoTotal = !!resultado.bloqueado;
                mostrarToast(resultado.mensagem || "Usuário ou senha incorretos.", bloqueadoTotal ? "error" : "warning");

                infoTentativas.textContent = resultado.mensagem || "";
                if (bloqueadoTotal) {
                    infoTentativas.classList.add("bloqueado");
                    btnEntrar.disabled = true;
                }

                if (typeof registrarEvento === "function") {
                    registrarEvento("resposta", "login", {
                        resultado: "erro",
                        tempoMs: Date.now() - inicio,
                        usuarioTentado: usuario,
                        motivo: resultado.mensagem || "credenciais invalidas",
                        bloqueado: bloqueadoTotal
                    });
                    if (typeof enviarFilaEventos === "function") enviarFilaEventos();
                }
            }
        })
        .catch(() => {
            btnEntrar.disabled = false;
            btnEntrar.classList.remove("carregando");
            mostrarToast("❌ Erro ao conectar. Tente novamente.", "error");
        });
});

formTrocaSenha.addEventListener("submit", function (e) {
    e.preventDefault();

    if (!canRunAction("troca_senha_submit", 4, 20000)) {
        mostrarToast("Aguarde antes de tentar novamente.", "warning");
        return;
    }

    const usuario = sanitizeAlnum(document.getElementById("usuarioTroca").value, 40);
    const senhaAtual = String(document.getElementById("senhaAtual").value || "");
    const senhaNova = String(document.getElementById("senhaNova").value || "");
    const senhaNovaConfirma = String(document.getElementById("senhaNovaConfirma").value || "");

    if (!usuario || !senhaAtual || !senhaNova || !senhaNovaConfirma) {
        mostrarToast("⚠️ Preencha todos os campos.", "warning");
        return;
    }

    if (senhaNova.length < 6) {
        mostrarToast("⚠️ A nova senha deve ter ao menos 6 caracteres.", "warning");
        return;
    }

    if (senhaNova !== senhaNovaConfirma) {
        mostrarToast("⚠️ As senhas novas não coincidem.", "warning");
        return;
    }

    const botao = formTrocaSenha.querySelector(".btn-enviar");
    botao.disabled = true;
    mostrarToast("🔄 Atualizando senha...", "info");

    const dados = new URLSearchParams();
    dados.set("acao", "trocarSenha");
    dados.set("usuario", usuario);
    dados.set("senhaAtual", senhaAtual);
    dados.set("senhaNova", senhaNova);

    safeFetch(URL_GOOGLE_SCRIPT, { method: "POST", body: dados }, { timeoutMs: 12000, retries: 1 })
        .then((response) => response.json())
        .then((resultado) => {
            botao.disabled = false;
            if (resultado.sucesso) {
                mostrarToast("✅ Senha alterada! Faça login com a nova senha.", "success");
                formTrocaSenha.reset();
                formTrocaSenha.classList.add("card-oculto");
                formLogin.classList.remove("card-oculto");
            } else {
                mostrarToast(resultado.mensagem || "Não foi possível trocar a senha.", "warning");
            }
        })
        .catch(() => {
            botao.disabled = false;
            mostrarToast("❌ Erro ao conectar. Tente novamente.", "error");
        });
});

document.addEventListener("DOMContentLoaded", carregarUsuarioLembrado);