// Estudar com vídeo: player do YouTube e chat de dúvidas com a IA (/api/perguntar).
(function () {
  "use strict";

  const URL_CHAT = "api/perguntar";
  const CHAVE_PLANO = "ia-de-estudos:plano";
  const CHAVE_VIDEO = "ia-de-estudos:video";
  const MAX_HISTORICO = 20;
  const BOAS_VINDAS = "Oi! Abra um vídeo do YouTube e me pergunte o que quiser: eu assisto ao vídeo e uso os tópicos do seu plano para responder.";
  const PEDIDO_RESUMO = "Resuma este vídeo com os pontos principais que podem cair na prova.";
  const AVISO_SEM_VIDEO = "(Não consegui assistir a este vídeo, talvez ele seja privado ou longo demais. Respondi sem ele.)";

  let historico = [];
  let videoAtual = "";

  function idDoYouTube(valor) {
    let url;
    try {
      url = new URL(valor.trim());
    } catch (e) {
      return "";
    }
    const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
    let id = "";
    if (host === "youtu.be") {
      id = url.pathname.slice(1);
    } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      id = url.searchParams.get("v") || (url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/]+)/) || [])[1] || "";
    }
    id = id.split("/")[0];
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
  }

  function lerPlano() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE_PLANO));
    } catch (e) {
      return null;
    }
  }

  function topicosDoPlano(plano) {
    const topicos = new Map();
    ((plano && plano.dias) || []).forEach((dia) => {
      if (dia.tipo !== "estudo") return;
      (dia.tarefas || []).forEach((t) => {
        if (t.topico && !topicos.has(t.topico)) {
          topicos.set(t.topico, { titulo: t.topico, resumo: t.leitura || "", videos: t.videos || [] });
        }
      });
    });
    return Array.from(topicos.values()).slice(0, 20);
  }

  function el(tag, classe, texto) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    if (texto) no.textContent = texto;
    return no;
  }

  function avisoVideo(mensagem) {
    document.getElementById("video-aviso").textContent = mensagem;
  }

  function mostrarVideo(id) {
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
    iframe.title = "Vídeo do YouTube";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    document.getElementById("video-player").replaceChildren(iframe);
    videoAtual = `https://www.youtube.com/watch?v=${id}`;
    document.getElementById("btn-resumir-video").hidden = false;
    try {
      localStorage.setItem(CHAVE_VIDEO, id);
    } catch (e) {}
  }

  function abrirBusca(termo) {
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(termo)}`, "_blank", "noopener");
    avisoVideo("Abrimos a busca no YouTube em outra aba. Escolha um vídeo, copie o link (Compartilhar → Copiar link) e cole aqui.");
  }

  function abrirVideo(valor) {
    const termo = valor.trim();
    if (!termo) return avisoVideo("Cole um link do YouTube ou digite o que quer buscar.");
    const id = idDoYouTube(termo);
    if (id) {
      avisoVideo("");
      return mostrarVideo(id);
    }
    if (/^https?:\/\//i.test(termo)) return avisoVideo("Esse link não é de um vídeo do YouTube (youtube.com ou youtu.be).");
    abrirBusca(termo);
  }

  function renderSugestoes() {
    const lista = document.getElementById("estudo-sugestoes");
    const topicos = topicosDoPlano(lerPlano());
    lista.replaceChildren();
    if (topicos.length === 0) {
      lista.appendChild(el("li", "hint", "Crie um plano de estudos para ver sugestões de vídeos por tópico."));
      return;
    }
    topicos.forEach((t) => {
      const botao = el("button", "chip", t.titulo);
      botao.type = "button";
      botao.title = "Buscar videoaula no YouTube";
      const video = t.videos[0];
      botao.addEventListener("click", () => {
        if (video && video.url) {
          window.open(video.url, "_blank", "noopener");
          avisoVideo("Abrimos a busca no YouTube em outra aba. Escolha um vídeo, copie o link (Compartilhar → Copiar link) e cole aqui.");
        } else {
          abrirBusca(`${t.titulo} aula`);
        }
      });
      const item = el("li");
      item.appendChild(botao);
      lista.appendChild(item);
    });
  }

  function adicionarMensagem(papel, texto, extra) {
    const caixa = document.getElementById("chat-mensagens");
    const msg = el("div", `msg msg--${papel}${extra ? " " + extra : ""}`, texto);
    caixa.appendChild(msg);
    caixa.scrollTop = caixa.scrollHeight;
    return msg;
  }

  function limparChat() {
    historico = [];
    document.getElementById("chat-mensagens").replaceChildren();
    adicionarMensagem("ia", BOAS_VINDAS);
  }

  async function perguntarIA(pergunta) {
    const plano = lerPlano();
    let resposta;
    try {
      resposta = await fetch(URL_CHAT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pergunta,
          historico: historico.slice(-MAX_HISTORICO),
          materia: (plano && plano.materia) || "",
          topicos: topicosDoPlano(plano).map(({ titulo, resumo }) => ({ titulo, resumo })),
          video: videoAtual,
        }),
      });
    } catch (e) {
      throw new Error("IA indisponível (abra o site por um servidor com a função /api).");
    }
    const corpo = await resposta.json().catch(() => null);
    if (resposta.ok && corpo && corpo.resposta) {
      return corpo.semVideo ? `${corpo.resposta}\n\n${AVISO_SEM_VIDEO}` : corpo.resposta;
    }
    throw new Error((corpo && corpo.erro) || "IA indisponível neste servidor.");
  }

  function iniciar() {
    const formChat = document.getElementById("form-chat");
    if (!formChat) return;

    const campoPergunta = document.getElementById("chat-pergunta");
    const botaoEnviar = document.getElementById("btn-enviar-chat");

    formChat.addEventListener("submit", async (evento) => {
      evento.preventDefault();
      const pergunta = campoPergunta.value.trim();
      if (!pergunta || botaoEnviar.disabled) return;

      campoPergunta.value = "";
      adicionarMensagem("usuario", pergunta);
      const pensando = adicionarMensagem("ia", videoAtual ? "Assistindo ao vídeo e pensando…" : "Pensando…", "msg--carregando");
      botaoEnviar.disabled = true;

      try {
        const resposta = await perguntarIA(pergunta);
        pensando.textContent = resposta;
        pensando.classList.remove("msg--carregando");
        historico.push({ papel: "usuario", texto: pergunta }, { papel: "ia", texto: resposta });
      } catch (erro) {
        pensando.textContent = erro.message;
        pensando.classList.replace("msg--carregando", "msg--erro");
      } finally {
        botaoEnviar.disabled = false;
        campoPergunta.focus();
        const caixa = document.getElementById("chat-mensagens");
        caixa.scrollTop = caixa.scrollHeight;
      }
    });

    campoPergunta.addEventListener("keydown", (evento) => {
      if (evento.key === "Enter" && !evento.shiftKey) {
        evento.preventDefault();
        formChat.requestSubmit();
      }
    });

    document.getElementById("btn-limpar-chat").addEventListener("click", limparChat);
    document.getElementById("btn-resumir-video").addEventListener("click", () => {
      campoPergunta.value = PEDIDO_RESUMO;
      formChat.requestSubmit();
    });
    document.getElementById("form-video").addEventListener("submit", (evento) => {
      evento.preventDefault();
      abrirVideo(document.getElementById("video-url").value);
    });
    document.addEventListener("ia-de-estudos:plano", renderSugestoes);

    let salvo = "";
    try {
      salvo = localStorage.getItem(CHAVE_VIDEO) || "";
    } catch (e) {}
    if (/^[A-Za-z0-9_-]{11}$/.test(salvo)) mostrarVideo(salvo);

    renderSugestoes();
    limparChat();
  }

  window.IAEstudosVideo = { idDoYouTube };
  document.addEventListener("DOMContentLoaded", iniciar);
})();
