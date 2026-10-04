// Divide o formulário do plano (#form-plano) em 3 passos.
// O envio e a renderização do plano continuam no js/planejador.js.
(function () {
  "use strict";

  const TOTAL = 3;
  let atual = 1;

  const $ = (id) => document.getElementById(id);

  function mostrarErro(mensagem) {
    const erro = $("form-erro");
    erro.textContent = mensagem;
    erro.hidden = !mensagem;
  }

  function formatarData(iso) {
    const [ano, mes, dia] = iso.split("-");
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso;
  }

  function resumir(texto, limite) {
    const limpo = texto.replace(/\s+/g, " ").trim();
    return limpo.length > limite ? `${limpo.slice(0, limite)}…` : limpo;
  }

  function linhaRevisao(rotulo, valor, etapa) {
    const linha = document.createElement("div");
    linha.className = "revisao-linha";

    const dt = document.createElement("dt");
    dt.textContent = rotulo;
    const dd = document.createElement("dd");
    dd.textContent = valor;

    const editar = document.createElement("button");
    editar.type = "button";
    editar.className = "revisao-editar";
    editar.textContent = "Alterar";
    editar.setAttribute("aria-label", `Alterar ${rotulo.toLowerCase()}`);
    editar.addEventListener("click", () => irPara(etapa, true));

    linha.append(dt, dd, editar);
    return linha;
  }

  function preencherRevisao(form) {
    const horas = form.horasPorDia.options[form.horasPorDia.selectedIndex];
    const arquivos = Array.from(form.arquivos.files).map((a) => a.name);
    const links = form.links.value.split(/\s+/).filter((l) => /^https?:\/\//i.test(l));
    const conteudo = resumir(form.conteudo.value, 140);

    $("etapa-revisao").replaceChildren(
      linhaRevisao("Matéria", form.materia.value.trim(), 1),
      linhaRevisao("Data da prova", formatarData(form.dataProva.value), 1),
      linhaRevisao("Tempo por dia", horas ? horas.textContent : "", 1),
      linhaRevisao("Conteúdo", conteudo || "Nada colado", 2),
      linhaRevisao("Arquivos", arquivos.length ? arquivos.join(", ") : "Nenhum", 2),
      linhaRevisao("Links", links.length ? `${links.length} link(s)` : "Nenhum", 2)
    );
  }

  function validarPasso1(form) {
    if (!form.materia.value.trim()) {
      form.materia.focus();
      return "Informe a matéria.";
    }
    if (!form.dataProva.value) {
      form.dataProva.focus();
      return "Escolha a data da prova.";
    }
    if (form.dataProva.validity.rangeUnderflow) {
      form.dataProva.focus();
      return "Escolha uma data a partir de amanhã.";
    }
    return "";
  }

  function irPara(numero, focar) {
    const form = $("form-plano");
    atual = Math.min(Math.max(numero, 1), TOTAL);

    let nome = "";
    form.querySelectorAll(".etapa").forEach((etapa) => {
      const ativa = Number(etapa.dataset.etapa) === atual;
      etapa.hidden = !ativa;
      if (ativa) nome = etapa.dataset.nome || "";
    });

    $("etapa-atual-texto").textContent = `Passo ${atual} de ${TOTAL}`;
    $("etapa-nome").textContent = nome;
    form.querySelectorAll(".etapa-ponto").forEach((ponto, i) => {
      ponto.classList.toggle("is-ativo", i + 1 === atual);
      ponto.classList.toggle("is-feito", i + 1 < atual);
    });

    $("btn-etapa-voltar").hidden = atual === 1;
    $("btn-etapa-continuar").hidden = atual === TOTAL;
    $("btn-gerar").hidden = atual !== TOTAL;

    if (atual === TOTAL) preencherRevisao(form);

    if (focar) {
      const campo = form.querySelector(`.etapa[data-etapa="${atual}"] input, .etapa[data-etapa="${atual}"] textarea`);
      if (campo) campo.focus({ preventScroll: true });
      else $("btn-gerar").focus({ preventScroll: true });
      form.scrollIntoView({ block: "start" });
    }
  }

  function avancar() {
    const form = $("form-plano");
    if (atual === 1) {
      const erro = validarPasso1(form);
      mostrarErro(erro);
      if (erro) return;
    }
    mostrarErro("");
    irPara(atual + 1, true);
  }

  // O resultado aparece no lugar do formulário; sem plano, o formulário volta ao passo 1.
  function sincronizarComResultado() {
    const form = $("form-plano");
    const resultado = $("resultado-plano");
    if (!form || !resultado) return;
    form.hidden = !resultado.hidden;
    if (resultado.hidden) irPara(1, false);
  }

  document.addEventListener("ia-de-estudos:plano", sincronizarComResultado);

  document.addEventListener("DOMContentLoaded", () => {
    const form = $("form-plano");
    if (!form) return;

    $("btn-etapa-continuar").addEventListener("click", avancar);
    $("btn-etapa-voltar").addEventListener("click", () => {
      mostrarErro("");
      irPara(atual - 1, true);
    });

    form.addEventListener("keydown", (evento) => {
      const alvo = evento.target;
      if (evento.key !== "Enter" || atual === TOTAL) return;
      if (alvo.tagName === "INPUT" && alvo.type !== "file") {
        evento.preventDefault();
        avancar();
      }
    });

    form.addEventListener("submit", (evento) => {
      if (atual !== TOTAL) {
        evento.preventDefault();
        evento.stopImmediatePropagation();
        avancar();
      }
    }, true);

    form.addEventListener("reset", () => {
      mostrarErro("");
      setTimeout(() => irPara(1, false));
    });

    sincronizarComResultado();
  });
})();
