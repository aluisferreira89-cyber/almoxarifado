// ===== SISTEMA DE NOTIFICAÇÕES (TOAST) =====
function mostrarToast(mensagem, tipo = "info") {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.textContent = mensagem; // textContent evita injeção de HTML
    toast.className = `toast toast-${tipo}`;

    void toast.offsetWidth; // força reflow para reiniciar a transição
    toast.classList.add("mostrar");

    setTimeout(() => {
        toast.classList.remove("mostrar");
    }, 3000);
}

// ===== INICIALIZAÇÃO =====
document.addEventListener("DOMContentLoaded", () => {
    console.log("✅ Página inicial carregada");

    // Feedback visual rápido ao clicar em um card de navegação
    document.querySelectorAll(".card-nav").forEach((card) => {
        card.addEventListener("click", () => {
            const titulo = card.querySelector(".card-titulo")?.textContent ?? "página";
            mostrarToast(`🔗 Abrindo ${titulo}...`, "info");
        });
    });
});