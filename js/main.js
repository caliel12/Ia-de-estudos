const TELAS = ["inicio", "agenda", "planejador", "estudar"];
const TELA_PADRAO = "inicio";

document.addEventListener("DOMContentLoaded", () => {
  atualizarAnoDoRodape();
  mostrarTelaDoHash(false);
  window.addEventListener("hashchange", () => mostrarTelaDoHash(true));
});

function atualizarAnoDoRodape() {
  const ano = document.getElementById("ano-atual");
  if (ano) {
    ano.textContent = new Date().getFullYear();
  }
}

// Descobre qual tela mostrar a partir do hash (#agenda, #estudar…).
// Um hash que aponta para algo dentro de uma tela abre essa tela.
function telaDoHash() {
  let id = "";
  try {
    id = decodeURIComponent(location.hash.slice(1));
  } catch (e) {}
  if (TELAS.includes(id)) return { tela: id, alvo: null };

  const alvo = id ? document.getElementById(id) : null;
  const tela = alvo && alvo.closest(".tela");
  if (tela && TELAS.includes(tela.id)) return { tela: tela.id, alvo };
  return { tela: TELA_PADRAO, alvo: null };
}

function mostrarTelaDoHash(focar) {
  const { tela, alvo } = telaDoHash();

  TELAS.forEach((id) => {
    const secao = document.getElementById(id);
    if (secao) secao.hidden = id !== tela;
  });

  document.querySelectorAll(".site-nav a[data-tela]").forEach((link) => {
    if (link.dataset.tela === tela) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  if (alvo) {
    alvo.scrollIntoView();
  } else {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }

  if (focar) {
    const titulo = document.querySelector(`#${tela} h1, #${tela} h2`);
    if (titulo) {
      titulo.setAttribute("tabindex", "-1");
      titulo.focus({ preventScroll: true });
    }
  }
}
