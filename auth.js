const SESSAO_CHAVE = "aguiaSessaoToken";
const SESSAO_DURACAO_MS = 8 * 60 * 60 * 1000;
const SESSAO_INATIVIDADE_MS = 30 * 60 * 1000;

function gerarTokenSessao() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function criarSessao(usuario) {
    const agora = Date.now();
    const sessao = {
        token: gerarTokenSessao(),
        usuario: String(usuario || "").trim().slice(0, 60),
        criadaEm: agora,
        ultimaAtividade: agora,
        expiraEm: agora + SESSAO_DURACAO_MS
    };
    sessionStorage.setItem(SESSAO_CHAVE, JSON.stringify(sessao));
}

function encerrarSessao() {
    sessionStorage.removeItem(SESSAO_CHAVE);
}

function obterSessao() {
    const bruto = sessionStorage.getItem(SESSAO_CHAVE);
    if (!bruto) return null;

    try {
        const sessao = JSON.parse(bruto);
        if (!sessao || !sessao.token || !sessao.expiraEm || !sessao.ultimaAtividade) {
            encerrarSessao();
            return null;
        }

        const agora = Date.now();
        const expirou = agora > sessao.expiraEm;
        const inativo = (agora - Number(sessao.ultimaAtividade || 0)) > SESSAO_INATIVIDADE_MS;

        if (expirou || inativo) {
            encerrarSessao();
            return null;
        }

        return sessao;
    } catch {
        encerrarSessao();
        return null;
    }
}

function atualizarAtividadeSessao() {
    const sessao = obterSessao();
    if (!sessao) return;
    sessao.ultimaAtividade = Date.now();
    sessionStorage.setItem(SESSAO_CHAVE, JSON.stringify(sessao));
}

function sessaoValida() {
    return obterSessao() !== null;
}

function nomeUsuarioLogado() {
    const s = obterSessao();
    return s ? s.usuario : "";
}

function protegerPagina() {
    if (!sessaoValida()) {
        window.location.replace("login.html");
        return;
    }
    atualizarAtividadeSessao();
}

function sair() {
    encerrarSessao();
    window.location.replace("login.html");
}

["click", "keydown", "mousemove", "touchstart"].forEach((evt) => {
    document.addEventListener(evt, () => {
        if (sessaoValida()) atualizarAtividadeSessao();
    }, { passive: true });
});