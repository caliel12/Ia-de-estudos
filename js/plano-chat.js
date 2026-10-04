// Chat do plano de estudos: gaveta "Perguntar à IA" aberta a partir da etapa atual.
// Usa /api/perguntar com o contexto da etapa (tópicos, resumo e último simulado), a agenda e a idade.
// É separado do chat da tela "Estudar com vídeo" (js/estudo.js), que continua igual.
(function () {
  "use strict";

  const URL_CHAT = "api/perguntar";
  const MAX_HISTORICO = 20;
  const BOAS_VINDAS = "Oi! Tô aqui para te ajudar nesta etapa. Pode perguntar o que não entendeu, pedir outro exemplo ou ajuda com o simulado.";
  const SUGESTOES = ["Explica de outro jeito", "Me dá mais um exemplo", "Faz uma pergunta pra eu treinar"];

  let historico = [];
  let atual = null;
  let ultimoFoco = null;

  const $ = (id) => document.getElementById(id);

  function el(tag, classe, texto) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    if (texto) no.textContent = texto;
    return no;
  }

  function adicionarMensagem(papel, texto, extra) {
    const caixa = $("plano-chat-mensagens");
    const msg = el("div", `msg msg--${papel}${extra ? " " + extra : ""}`, texto);
    caixa.appendChild(msg);
    caixa.scrollTop = caixa.scrollHeight;
    return msg;
  }

  function mostrarSugestoes() {
    const lista = $("plano-chat-sugestoes");
    lista.replaceChildren();
    lista.hidden = historico.length > 0;
    SUGESTOES.forEach((texto) => {
      const b = el("button", "chip", texto);
      b.type = "button";
      b.addEventListener("click", () => enviar(texto));
      const item = el("li");
      item.appendChild(b);
      lista.appendChild(item);
    });
  }

  function reiniciar() {
    historico = [];
    $("plano-chat-mensagens").replaceChildren();
    adicionarMensagem("ia", BOAS_VINDAS);
    mostrarSugestoes();
  }

  function agendaParaIA() {
    const agenda = window.IAEstudosAgenda;
    if (!agenda || typeof agenda.paraIA !== "function") return null;
    try {
      return agenda.paraIA() || null;
    } catch (e) {
      return null;
    }
  }

  async function perguntarIA(pergunta) {
    const contexto = atual.contexto();
    let resposta;
    try {
      resposta = await fetch(URL_CHAT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pergunta,
          historico: historico.slice(-MAX_HISTORICO),
          materia: contexto.materia || "",
          topicos: contexto.topicosDoPlano || [],
          etapa: contexto.etapa,
          agenda: agendaParaIA(),
          idade: atual.idade(),
        }),
      });
    } catch (e) {
      throw new Error("IA indisponível (abra o site por um servidor com a função /api).");
    }
    const corpo = await resposta.json().catch(() => null);
    if (resposta.ok && corpo && corpo.resposta) return corpo.resposta;
    throw new Error((corpo && corpo.erro) || "IA indisponível neste servidor.");
  }

  async function enviar(pergunta) {
    const botao = $("btn-enviar-plano-chat");
    if (!pergunta || botao.disabled || !atual) return;
    $("plano-chat-sugestoes").hidden = true;
    adicionarMensagem("usuario", pergunta);
    const pensando = adicionarMensagem("ia", "Pensando…", "msg--carregando");
    botao.disabled = true;
    try {
      const resposta = await perguntarIA(pergunta);
      pensando.textContent = resposta;
      pensando.classList.remove("msg--carregando");
      historico.push({ papel: "usuario", texto: pergunta }, { papel: "ia", texto: resposta });
    } catch (erro) {
      pensando.textContent = erro.message;
      pensando.classList.replace("msg--carregando", "msg--erro");
    } finally {
      botao.disabled = false;
      const caixa = $("plano-chat-mensagens");
      caixa.scrollTop = caixa.scrollHeight;
    }
  }

  function aoTeclar(evento) {
    if (evento.key === "Escape") fechar();
  }

  // opcoes: { chave, titulo, contexto(): {materia, topicosDoPlano, etapa}, idade(), pergunta? }
  function abrir(opcoes) {
    const gaveta = $("plano-chat");
    if (!gaveta) return;
    if (!atual || atual.chave !== opcoes.chave) {
      atual = opcoes;
      reiniciar();
    } else {
      atual = opcoes;
    }
    $("plano-chat-sub").textContent = `Sobre: ${opcoes.titulo}`;
    ultimoFoco = document.activeElement;
    gaveta.hidden = false;
    document.body.classList.add("gaveta-aberta");
    document.addEventListener("keydown", aoTeclar);
    $("plano-chat-pergunta").focus({ preventScroll: true });
    if (opcoes.pergunta) enviar(opcoes.pergunta);
  }

  function fechar() {
    const gaveta = $("plano-chat");
    if (!gaveta || gaveta.hidden) return;
    gaveta.hidden = true;
    document.body.classList.remove("gaveta-aberta");
    document.removeEventListener("keydown", aoTeclar);
    if (ultimoFoco && document.contains(ultimoFoco)) ultimoFoco.focus({ preventScroll: true });
  }

  function iniciar() {
    const form = $("form-plano-chat");
    if (!form) return;
    const campo = $("plano-chat-pergunta");

    form.addEventListener("submit", (evento) => {
      evento.preventDefault();
      const pergunta = campo.value.trim();
      if (!pergunta || $("btn-enviar-plano-chat").disabled) return;
      campo.value = "";
      enviar(pergunta);
    });
    campo.addEventListener("keydown", (evento) => {
      if (evento.key === "Enter" && !evento.shiftKey) {
        evento.preventDefault();
        form.requestSubmit();
      }
    });
    $("btn-fechar-plano-chat").addEventListener("click", fechar);
    $("plano-chat-fundo").addEventListener("click", fechar);
    window.addEventListener("hashchange", fechar);
  }

  window.IAEstudosPlanoChat = { abrir, fechar };
  document.addEventListener("DOMContentLoaded", iniciar);
})();
