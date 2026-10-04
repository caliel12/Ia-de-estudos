document.addEventListener("DOMContentLoaded", () => {
  atualizarAnoDoRodape();
  configurarMenuMobile();
});

function atualizarAnoDoRodape() {
  const ano = document.getElementById("ano-atual");
  if (ano) {
    ano.textContent = new Date().getFullYear();
  }
}

function configurarMenuMobile() {
  const botao = document.querySelector(".nav-toggle");
  const nav = document.getElementById("site-nav");
  if (!botao || !nav) return;

  botao.addEventListener("click", () => {
    const aberto = nav.classList.toggle("is-open");
    botao.setAttribute("aria-expanded", String(aberto));
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      botao.setAttribute("aria-expanded", "false");
    });
  });
}
