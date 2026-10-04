// Planejador de estudos.
// Os tópicos vêm da IA (/api/gerar-plano, Google Gemini) quando disponível, ou
// são extraídos localmente do texto. O cronograma é sempre montado aqui.
(function () {
  "use strict";

  const CHAVE_STORAGE = "ia-de-estudos:plano";
  const CHAVE_PERFIL = "ia-de-estudos:perfil";
  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  const URL_IA = "api/gerar-plano";
  const LIMITE_ARQUIVOS_BYTES = 15 * 1024 * 1024;
  const EXTENSOES_TEXTO = /\.(txt|md|markdown)$/i;

  function hoje() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function parseDataLocal(valor) {
    const [ano, mes, dia] = valor.split("-").map(Number);
    return new Date(ano, mes - 1, dia);
  }

  function somarDias(data, dias) {
    return new Date(data.getFullYear(), data.getMonth(), data.getDate() + dias);
  }

  function formatarData(data) {
    return data.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  }

  function limparTitulo(linha) {
    return linha
      .replace(/^#+\s*/, "")
      .replace(/^(\d+[.)-]|[-*•])\s*/, "")
      .replace(/[:;.]$/, "")
      .trim();
  }

  function pareceTitulo(linha) {
    if (/^#+\s/.test(linha)) return true;
    if (/^(\d+[.)-]|[-*•])\s/.test(linha)) return linha.length <= 90;
    return linha.length <= 60 && !/[.!?]$/.test(linha);
  }

  function extrairTopicos(texto) {
    const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const topicos = [];
    let atual = null;

    linhas.forEach((linha) => {
      if (pareceTitulo(linha)) {
        const titulo = limparTitulo(linha);
        if (!titulo) return;
        atual = { titulo, texto: "" };
        topicos.push(atual);
      } else if (atual) {
        atual.texto += (atual.texto ? " " : "") + linha;
      } else {
        const titulo = linha.split(/\s+/).slice(0, 6).join(" ") + "…";
        atual = { titulo, texto: linha };
        topicos.push(atual);
      }
    });

    const vistos = new Set();
    return topicos.filter((t) => {
      const chave = t.titulo.toLowerCase();
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
  }

  function frases(texto) {
    return (texto.match(/[^.!?]+[.!?]?/g) || []).map((f) => f.trim()).filter((f) => f.length > 20);
  }

  function perguntaDeLacuna(texto) {
    const frase = frases(texto).find((f) => /\p{L}{7,}/u.test(f));
    if (!frase) return null;
    const palavras = frase.match(/\p{L}{7,}/gu);
    const alvo = palavras.reduce((a, b) => (b.length > a.length ? b : a));
    return {
      pergunta: "Complete: " + frase.replace(alvo, "_____"),
      resposta: alvo,
    };
  }

  function gerarPerguntas(topico, outroTopico) {
    const perguntas = [
      { pergunta: `O que é ${topico.titulo}? Explique com suas palavras.` },
      { pergunta: `Dê um exemplo prático ou aplicação de ${topico.titulo}.` },
    ];
    if (outroTopico) {
      perguntas.push({ pergunta: `Qual a relação entre ${topico.titulo} e ${outroTopico.titulo}?` });
    }
    const lacuna = perguntaDeLacuna(topico.texto);
    if (lacuna) perguntas.push(lacuna);
    return perguntas;
  }

  function linkVideo(materia, assunto, buscaPronta) {
    const busca = buscaPronta || `${materia} ${assunto} aula`;
    return {
      titulo: `Vídeos sobre "${assunto}" no YouTube`,
      url: "https://www.youtube.com/results?search_query=" + encodeURIComponent(busca),
    };
  }

  function resumoDoTopico(topico) {
    const primeiras = frases(topico.texto).slice(0, 2).join(" ");
    return primeiras || `Releia o material do professor sobre ${topico.titulo} e anote os pontos principais.`;
  }

  function explicacaoLocal(topico) {
    const todas = frases(topico.texto);
    return todas.length > 2 ? todas.slice(2).join(" ").slice(0, 1500) : "";
  }

  // Etapas de estudo levam o conteúdo completo; revisões só o essencial (o plano fica menor).
  function tarefasDeEstudo(materia, topicos, todos, horasPorDia, completo) {
    const minutos = Math.round((horasPorDia * 60) / topicos.length);
    return topicos.map((topico) => {
      const indice = todos.indexOf(topico);
      const outro = todos[indice - 1] || todos[indice + 1];
      const tarefa = {
        topico: topico.titulo,
        minutos,
        leitura: topico.resumo || resumoDoTopico(topico),
        perguntas: topico.perguntas && topico.perguntas.length > 0 ? topico.perguntas : gerarPerguntas(topico, outro),
        videos: [linkVideo(materia, topico.titulo, topico.buscaVideo)],
      };
      if (!completo) return tarefa;
      const veioDaIA = Boolean(topico.resumo);
      return Object.assign(tarefa, {
        explicacao: veioDaIA ? topico.explicacao || "" : explicacaoLocal(topico),
        exemplo: topico.exemplo || "",
        dica: topico.dica || (veioDaIA ? "" : `Depois de ler, feche o material e tente explicar ${topico.titulo} em voz alta, como se ensinasse um amigo.`),
        errosComuns: Array.isArray(topico.errosComuns) ? topico.errosComuns : [],
      });
    });
  }

  function gerarPlano({ materia, dataProva, horasPorDia, conteudo, links, topicosDaIA, origem = "local", aviso = "" }) {
    const inicio = hoje();
    const prova = parseDataLocal(dataProva);
    const diasDisponiveis = Math.round((prova - inicio) / MS_POR_DIA);
    if (diasDisponiveis < 1) {
      throw new Error("A data da prova precisa ser a partir de amanhã.");
    }

    const topicos = topicosDaIA && topicosDaIA.length > 0
      ? topicosDaIA.map((t) => Object.assign({ texto: "" }, t))
      : extrairTopicos(conteudo);
    if (topicos.length === 0) {
      throw new Error("Adicione o conteúdo da prova (texto ou arquivo) para montar o plano.");
    }

    const temRevisaoFinal = diasDisponiveis >= 2;
    const diasDeEstudo = temRevisaoFinal ? diasDisponiveis - 1 : diasDisponiveis;
    const grupos = Array.from({ length: diasDeEstudo }, () => []);
    topicos.forEach((t, i) => grupos[Math.floor((i * diasDeEstudo) / topicos.length)].push(t));

    const dias = [];
    const estudados = [];
    let proximaRevisao = 0;

    grupos.forEach((doDia, i) => {
      const data = somarDias(inicio, i).toISOString();

      if (doDia.length > 0) {
        estudados.push(...doDia);
        dias.push({
          data,
          tipo: "estudo",
          titulo: doDia.map((t) => t.titulo).join(", "),
          simulado: "topico",
          tarefas: tarefasDeEstudo(materia, doDia, topicos, horasPorDia, true),
        });
        return;
      }

      const quantidade = Math.min(3, estudados.length);
      const revisar = Array.from({ length: quantidade }, (_, k) => estudados[(proximaRevisao + k) % estudados.length]);
      proximaRevisao += quantidade;
      dias.push({
        data,
        tipo: "revisao",
        titulo: "Revisão ativa: " + revisar.map((t) => t.titulo).join(", "),
        tarefas: tarefasDeEstudo(materia, revisar, topicos, horasPorDia, false),
      });
    });

    if (temRevisaoFinal) {
      dias.push({
        data: somarDias(prova, -1).toISOString(),
        tipo: "revisao",
        titulo: "Revisão geral e simulado",
        simulado: "final",
        tarefas: [
          {
            topico: "Revisão geral",
            minutos: Math.round(horasPorDia * 60),
            leitura: "Revise suas anotações e os pontos que você errou nos simulados. Depois responda às perguntas abaixo sem consultar o material e faça o simulado geral.",
            perguntas: topicos.slice(0, 8).map((t) => ({ pergunta: `Resuma ${t.titulo} em até 3 frases.` })),
            videos: [linkVideo(materia, "revisão para prova")],
          },
        ],
      });
    }

    dias.push({
      data: prova.toISOString(),
      tipo: "prova",
      titulo: "Dia da prova",
      tarefas: [
        {
          topico: "Boa prova!",
          leitura: "Durma bem, faça uma leitura rápida dos resumos e confie no que você estudou.",
          perguntas: [],
          videos: [],
        },
      ],
    });

    return {
      materia,
      dataProva,
      horasPorDia,
      links,
      criadoEm: new Date().toISOString(),
      totalTopicos: topicos.length,
      origem,
      aviso,
      dias,
      concluidos: [],
      simulados: {},
      descansoAte: "",
    };
  }

  // ---------- Interface ----------

  const LIMITE_PLANO_BYTES = 450 * 1024;
  const ICONE_CADEADO = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  const ICONE_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';
  const ICONE_CHAT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>';

  function el(tag, opcoes = {}, filhos = []) {
    const no = document.createElement(tag);
    if (opcoes.classe) no.className = opcoes.classe;
    if (opcoes.texto != null) no.textContent = opcoes.texto;
    if (opcoes.attrs) Object.entries(opcoes.attrs).forEach(([k, v]) => no.setAttribute(k, v));
    filhos.forEach((f) => f && no.appendChild(f));
    return no;
  }

  function icone(svg, classe) {
    const span = el("span", { classe: classe || "icone", attrs: { "aria-hidden": "true" } });
    span.innerHTML = svg;
    return span;
  }

  function botao(texto, classe, aoClicar) {
    const b = el("button", { classe: classe || "btn", texto, attrs: { type: "button" } });
    if (aoClicar) b.addEventListener("click", aoClicar);
    return b;
  }

  function linkExterno(titulo, url) {
    return el("a", { texto: titulo, attrs: { href: url, target: "_blank", rel: "noopener noreferrer" } });
  }

  function paragrafos(texto) {
    return String(texto || "")
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => el("p", { texto: p }));
  }

  function secao(titulo, filhos, classe) {
    return el("div", { classe: "tarefa" + (classe ? " " + classe : "") }, [el("h5", { texto: titulo })].concat(filhos));
  }

  function renderTarefa(tarefa, links) {
    const cabecalho = tarefa.minutos ? `${tarefa.topico} · ~${tarefa.minutos} min` : tarefa.topico;
    const bloco = el("div", { classe: "topico" }, [el("h5", { classe: "topico-titulo", texto: cabecalho })]);
    const perguntas = Array.isArray(tarefa.perguntas) ? tarefa.perguntas : [];
    const videos = Array.isArray(tarefa.videos) ? tarefa.videos : [];
    const erros = Array.isArray(tarefa.errosComuns) ? tarefa.errosComuns.filter(Boolean) : [];

    if (tarefa.leitura) bloco.appendChild(secao(tarefa.explicacao ? "Resumo" : "Leitura", [el("p", { texto: tarefa.leitura })]));
    if (tarefa.explicacao) bloco.appendChild(secao("Explicação", paragrafos(tarefa.explicacao)));
    if (tarefa.exemplo) bloco.appendChild(secao("Exemplo resolvido", paragrafos(tarefa.exemplo), "tarefa--exemplo"));
    if (tarefa.dica) bloco.appendChild(secao("Macete", [el("p", { texto: tarefa.dica })], "tarefa--dica"));
    if (erros.length > 0) {
      bloco.appendChild(secao("Erros comuns", [el("ul", {}, erros.map((e) => el("li", { texto: e })))]));
    }

    if (perguntas.length > 0) {
      const lista = el("ul");
      perguntas.forEach((p) => {
        if (p.resposta) {
          lista.appendChild(
            el("li", {}, [
              el("details", {}, [el("summary", { texto: p.pergunta }), el("p", { texto: "Resposta: " + p.resposta })]),
            ])
          );
        } else {
          lista.appendChild(el("li", { texto: p.pergunta }));
        }
      });
      bloco.appendChild(secao("Perguntas de revisão", [el("p", { classe: "hint", texto: "Tente responder antes de abrir a resposta." }), lista]));
    }

    const itensVideo = videos.map((v) => el("li", {}, [linkExterno(v.titulo, v.url)]));
    const materiais = (links || []).map((url) => el("li", {}, [linkExterno(url, url)]));
    if (itensVideo.length + materiais.length > 0) {
      bloco.appendChild(secao("Vídeos e materiais", [el("ul", {}, itensVideo.concat(materiais))]));
    }

    return bloco;
  }

  // Se o plano passar do limite, apaga as questões dos simulados mais antigos (o resultado fica).
  function compactar(plano) {
    let json = JSON.stringify(plano);
    if (json.length <= LIMITE_PLANO_BYTES) return json;
    const antigos = Object.values(plano.simulados || {})
      .filter((s) => s && s.questoes && s.estado === "corrigido")
      .sort((a, b) => String(a.feitoEm).localeCompare(String(b.feitoEm)));
    for (const s of antigos) {
      delete s.questoes;
      delete s.respostas;
      json = JSON.stringify(plano);
      if (json.length <= LIMITE_PLANO_BYTES) break;
    }
    return json;
  }

  function salvar(plano) {
    try {
      localStorage.setItem(CHAVE_STORAGE, compactar(plano));
      document.dispatchEvent(new CustomEvent("ia-de-estudos:dados-alterados"));
    } catch (e) {
      // localStorage indisponível (ex.: modo privado); o plano só não persiste.
    }
  }

  function salvarIdade(idade) {
    if (!idade) return;
    try {
      const perfil = JSON.parse(localStorage.getItem(CHAVE_PERFIL)) || {};
      if (perfil.idade === idade) return;
      localStorage.setItem(CHAVE_PERFIL, JSON.stringify({ ...perfil, idade }));
      document.dispatchEvent(new CustomEvent("ia-de-estudos:dados-alterados"));
    } catch (e) {}
  }

  function lerIdade() {
    try {
      return (JSON.parse(localStorage.getItem(CHAVE_PERFIL)) || {}).idade || null;
    } catch (e) {
      return null;
    }
  }

  function carregar() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE_STORAGE));
    } catch (e) {
      return null;
    }
  }

  // Planos salvos em versões antigas não têm simulados nem pausa: completa o que falta sem quebrar.
  function normalizarPlano(plano) {
    if (!plano || typeof plano !== "object" || !Array.isArray(plano.dias) || plano.dias.length === 0) return null;
    plano.dias = plano.dias.filter((d) => d && typeof d === "object");
    plano.dias.forEach((dia) => {
      if (!Array.isArray(dia.tarefas)) dia.tarefas = [];
      dia.tarefas = dia.tarefas.filter((t) => t && typeof t === "object");
      dia.titulo = dia.titulo || "Etapa";
    });
    plano.concluidos = (Array.isArray(plano.concluidos) ? plano.concluidos : []).filter(
      (i, k, lista) => Number.isInteger(i) && i >= 0 && i < plano.dias.length && lista.indexOf(i) === k
    );
    if (!plano.simulados || typeof plano.simulados !== "object" || Array.isArray(plano.simulados)) plano.simulados = {};
    if (typeof plano.descansoAte !== "string") plano.descansoAte = "";
    if (!plano.materia) plano.materia = "sua matéria";
    return plano;
  }

  function isoLocal(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function tipoDeSimulado(dia) {
    if (dia.simulado === "topico" || dia.simulado === "final") return dia.simulado;
    if (dia.simulado === "") return "";
    if (dia.tipo === "estudo") return "topico";
    if (dia.tipo === "revisao" && /^Revisão geral/i.test(dia.titulo)) return "final";
    return "";
  }

  function indiceAtual(plano) {
    return plano.dias.findIndex((_, i) => !plano.concluidos.includes(i));
  }

  function emPausa(plano, indice) {
    return indice > 0 && plano.concluidos.includes(indice - 1) && plano.descansoAte > isoLocal(hoje());
  }

  function atualizarProgresso(plano) {
    const total = plano.dias.length;
    const feitos = plano.concluidos.length;
    document.getElementById("progresso-barra").style.width = `${Math.round((feitos / total) * 100)}%`;
    document.getElementById("progresso-texto").textContent = `${feitos} de ${total} etapas concluídas`;
  }

  function dataDaEtapa(dia) {
    const data = new Date(dia.data);
    return isNaN(data) ? "" : formatarData(data);
  }

  function cabecalhoDaEtapa(dia, indice, extra) {
    const data = dataDaEtapa(dia);
    return el("div", { classe: "dia-topo" }, [
      el("div", { classe: "dia-topo-texto" }, [
        el("p", { classe: "dia-data", texto: `Etapa ${indice + 1}${data ? " · " + data : ""}` }),
        el("h4", { texto: dia.titulo }),
      ]),
      extra,
    ]);
  }

  // Contexto da etapa aberta para o chat do plano (/api/perguntar).
  function contextoDaEtapa(plano, indice) {
    const dia = plano.dias[indice];
    const simulado = window.IAEstudosSimulado ? window.IAEstudosSimulado.resumoParaIA(plano) : null;
    return {
      materia: plano.materia,
      topicosDoPlano: topicosDoPlano(plano).map((t) => ({ titulo: t.topico, resumo: t.leitura.slice(0, 600) })),
      etapa: {
        titulo: `Etapa ${indice + 1}: ${dia.titulo}`,
        topicos: dia.tarefas.slice(0, 5).map((t) => ({ titulo: t.topico, resumo: [t.leitura, t.explicacao].filter(Boolean).join(" ").slice(0, 1500) })),
        simulado,
      },
    };
  }

  function topicosDoPlano(plano) {
    const vistos = new Map();
    plano.dias.forEach((dia) => {
      if (dia.tipo !== "estudo") return;
      dia.tarefas.forEach((t) => {
        if (t.topico && !vistos.has(t.topico)) vistos.set(t.topico, Object.assign({ leitura: "" }, t));
      });
    });
    return Array.from(vistos.values()).slice(0, 20);
  }

  function abrirChat(plano, indice, pergunta) {
    if (!window.IAEstudosPlanoChat) return;
    window.IAEstudosPlanoChat.abrir({
      chave: `${plano.criadoEm}:${indice}`,
      titulo: `Etapa ${indice + 1}: ${plano.dias[indice].titulo}`,
      contexto: () => contextoDaEtapa(plano, indice),
      idade: lerIdade,
      pergunta,
    });
  }

  function conteudoDaEtapa(plano, indice, aberta) {
    const dia = plano.dias[indice];
    const partes = [];
    const tipo = tipoDeSimulado(dia);
    const simulado = window.IAEstudosSimulado;

    if (aberta && simulado) partes.push(simulado.reforco(plano, indice));
    dia.tarefas.forEach((t) => partes.push(renderTarefa(t, dia.tipo === "estudo" ? plano.links : [])));
    if (tipo && simulado) {
      partes.push(
        simulado.cartao(plano, indice, {
          tipo,
          idade: lerIdade,
          salvar: () => salvar(plano),
          perguntar: aberta ? (texto) => abrirChat(plano, indice, texto) : null,
        })
      );
    }
    return partes.filter(Boolean);
  }

  function renderConcluida(plano, indice) {
    const dia = plano.dias[indice];
    const resultado = ((plano.simulados[indice] || {}).resultado) || null;
    const selo = el("span", { classe: "dia-selo dia-selo--feito" }, [
      icone(ICONE_CHECK),
      document.createTextNode(resultado ? `Concluída · nota ${String(resultado.nota).replace(".", ",")}` : "Concluída"),
    ]);
    const detalhes = el("details", { classe: "dia-detalhes" }, [
      el("summary", {}, [cabecalhoDaEtapa(dia, indice, selo)]),
    ]);
    let preenchido = false;
    detalhes.addEventListener("toggle", () => {
      if (!detalhes.open || preenchido) return;
      preenchido = true;
      conteudoDaEtapa(plano, indice, false).forEach((n) => detalhes.appendChild(n));
    });
    return el("li", { classe: `dia dia--${dia.tipo} dia--concluido` }, [detalhes]);
  }

  function renderBloqueada(plano, indice) {
    const dia = plano.dias[indice];
    const selo = el("span", { classe: "dia-selo" }, [icone(ICONE_CADEADO), document.createTextNode("Bloqueada")]);
    return el("li", { classe: `dia dia--${dia.tipo} dia--bloqueada`, attrs: { "aria-disabled": "true" } }, [
      cabecalhoDaEtapa(dia, indice, selo),
    ]);
  }

  function mensagemDePausa(plano, indice) {
    const anterior = plano.simulados[indice - 1];
    const nota = anterior && anterior.resultado ? anterior.resultado.nota : null;
    if (nota == null) return "Estudar um pouco por dia ajuda o cérebro a guardar o conteúdo.";
    if (nota >= 7) return `Você mandou bem no simulado (nota ${String(nota).replace(".", ",")}). Descansar agora ajuda a fixar o que aprendeu.`;
    return "O simulado mostrou o que ainda está difícil, e tudo bem: a próxima etapa começa reforçando esses pontos.";
  }

  function renderPausa(plano, indice) {
    const dia = plano.dias[indice];
    const continuar = botao("Continuar mesmo assim", "btn btn--secundario", () => {
      plano.descansoAte = "";
      salvar(plano);
      renderEtapas(plano, indice);
    });
    return el("li", { classe: "dia dia--pausa", attrs: { id: "etapa-pausa" } }, [
      el("p", { classe: "pausa-titulo", texto: `Bom trabalho! Etapa ${indice} concluída.` }),
      el("p", { texto: mensagemDePausa(plano, indice) }),
      el("p", { classe: "pausa-destaque" }, [el("mark", { texto: "Que tal uma pausa? Volta amanhã para a próxima etapa." })]),
      el("p", { classe: "hint", texto: `Próxima: Etapa ${indice + 1} · ${dia.titulo}` }),
      el("div", { classe: "pausa-acoes" }, [continuar]),
    ]);
  }

  function concluirEtapa(plano, indice) {
    if (!plano.concluidos.includes(indice)) plano.concluidos.push(indice);
    const proxima = indiceAtual(plano);
    plano.descansoAte = proxima > indice ? isoLocal(somarDias(hoje(), 1)) : "";
    salvar(plano);
    renderEtapas(plano, proxima === -1 ? -1 : proxima);
  }

  function renderAberta(plano, indice) {
    const dia = plano.dias[indice];
    const perguntar = botao("", "btn btn--pequeno btn-perguntar", () => abrirChat(plano, indice));
    perguntar.append(icone(ICONE_CHAT), document.createTextNode("Perguntar à IA"));

    const item = el("li", { classe: `dia dia--${dia.tipo} dia--aberta`, attrs: { id: "etapa-aberta" } }, [
      el("p", { classe: "dia-agora", texto: "Etapa de agora" }),
      cabecalhoDaEtapa(dia, indice, perguntar),
    ]);
    conteudoDaEtapa(plano, indice, true).forEach((n) => item.appendChild(n));

    const temSimulado = Boolean(tipoDeSimulado(dia));
    const ultima = indice === plano.dias.length - 1;
    item.appendChild(
      el("div", { classe: "dia-concluir" }, [
        el("p", {
          classe: "hint",
          texto: temSimulado
            ? "Terminou de estudar e fez o simulado? Então pode concluir."
            : "Quando terminar, conclua a etapa para liberar a próxima.",
        }),
        botao(ultima ? "Concluir plano" : "Concluir etapa", "btn", () => concluirEtapa(plano, indice)),
      ])
    );
    return item;
  }

  function renderFim(plano) {
    return el("li", { classe: "dia dia--pausa", attrs: { id: "etapa-pausa" } }, [
      el("p", { classe: "pausa-titulo", texto: "Plano concluído!" }),
      el("p", { texto: `Você fez todas as etapas de ${plano.materia}. Agora é confiar no que estudou. Boa prova!` }),
    ]);
  }

  // Desenha só as etapas (sem avisar os outros módulos). focar: índice para rolar até ele.
  function renderEtapas(plano, focar) {
    const lista = document.getElementById("plano-dias");
    const atual = indiceAtual(plano);
    lista.replaceChildren();
    if (atual === -1) lista.appendChild(renderFim(plano));

    plano.dias.forEach((_, indice) => {
      if (plano.concluidos.includes(indice)) lista.appendChild(renderConcluida(plano, indice));
      else if (indice !== atual) lista.appendChild(renderBloqueada(plano, indice));
      else if (emPausa(plano, indice)) {
        lista.appendChild(renderPausa(plano, indice));
        lista.appendChild(renderBloqueada(plano, indice));
      } else lista.appendChild(renderAberta(plano, indice));
    });

    atualizarProgresso(plano);
    if (focar != null) {
      const alvo = document.getElementById("etapa-pausa") || document.getElementById("etapa-aberta");
      if (alvo) alvo.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function renderPlano(plano) {
    const container = document.getElementById("resultado-plano");
    const prova = parseDataLocal(String(plano.dataProva || isoLocal(hoje())));

    document.getElementById("plano-titulo").textContent = `Plano de ${plano.materia}`;
    document.getElementById("plano-resumo").textContent =
      `Prova em ${formatarData(prova)} · ${plano.totalTopicos || topicosDoPlano(plano).length} tópico(s) · ${plano.dias.length} etapa(s)`;

    const origem = document.getElementById("plano-origem");
    const comIA = plano.origem === "ia";
    origem.className = "plano-origem" + (comIA ? " plano-origem--ia" : "");
    origem.textContent = comIA
      ? "Gerado com IA (Google Gemini)"
      : "Gerado no modo local, sem IA" + (plano.aviso ? `: ${plano.aviso}` : "");

    renderEtapas(plano);
    container.hidden = false;
    document.dispatchEvent(new CustomEvent("ia-de-estudos:plano"));
  }

  function lerArquivo(arquivo, comoTexto) {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(leitor.result);
      leitor.onerror = () => reject(new Error(`Não foi possível ler o arquivo ${arquivo.name}.`));
      if (comoTexto) leitor.readAsText(arquivo);
      else leitor.readAsDataURL(arquivo);
    });
  }

  async function lerArquivos(lista) {
    const textos = [];
    const binarios = [];
    let tamanho = 0;

    for (const arquivo of Array.from(lista)) {
      if (EXTENSOES_TEXTO.test(arquivo.name) || arquivo.type.startsWith("text/")) {
        textos.push(await lerArquivo(arquivo, true));
        continue;
      }
      tamanho += arquivo.size;
      if (tamanho > LIMITE_ARQUIVOS_BYTES) {
        throw new Error("Os arquivos são grandes demais (limite de 15 MB no total).");
      }
      const dataUrl = await lerArquivo(arquivo, false);
      const mimeType = arquivo.type || (/\.pdf$/i.test(arquivo.name) ? "application/pdf" : "");
      binarios.push({ nome: arquivo.name, mimeType, data: dataUrl.split(",")[1] || "" });
    }

    return { textos, binarios };
  }

  async function obterTopicosDaIA(pedido) {
    let resposta;
    try {
      resposta = await fetch(URL_IA, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pedido),
      });
    } catch (e) {
      return { aviso: "IA indisponível (abra o site por um servidor com a função /api)" };
    }

    const corpo = await resposta.json().catch(() => null);
    if (resposta.ok && corpo && Array.isArray(corpo.topicos) && corpo.topicos.length > 0) {
      return { topicos: corpo.topicos };
    }
    if (corpo && corpo.erro) return { aviso: corpo.erro, status: resposta.status };
    return { aviso: "IA indisponível neste servidor" };
  }

  function mostrarErro(mensagem) {
    const erro = document.getElementById("form-erro");
    erro.textContent = mensagem;
    erro.hidden = !mensagem;
  }

  function iniciar() {
    const form = document.getElementById("form-plano");
    if (!form) return;

    const campoData = document.getElementById("data-prova");
    const amanha = somarDias(hoje(), 1);
    const iso = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    campoData.min = iso(amanha);

    form.addEventListener("submit", async (evento) => {
      evento.preventDefault();
      mostrarErro("");

      const materia = form.materia.value.trim();
      if (!materia) return mostrarErro("Informe a matéria.");
      if (!form.dataProva.value) return mostrarErro("Escolha a data da prova.");

      const botao = document.getElementById("btn-gerar");
      botao.disabled = true;
      botao.textContent = "Gerando plano com IA…";

      try {
        const { textos, binarios } = await lerArquivos(form.arquivos.files);
        const conteudo = [form.conteudo.value].concat(textos).join("\n").trim();
        const links = form.links.value
          .split(/\s+/)
          .map((l) => l.trim())
          .filter((l) => /^https?:\/\//i.test(l));
        const dataProva = form.dataProva.value;
        const horasPorDia = Number(form.horasPorDia.value);
        const idade = Math.round(Number(form.idade && form.idade.value)) || null;
        salvarIdade(idade);

        if (!conteudo && binarios.length === 0) {
          throw new Error("Adicione o conteúdo da prova (texto ou arquivo) para montar o plano.");
        }

        const ia = await obterTopicosDaIA({ materia, dataProva, horasPorDia, idade, conteudo, arquivos: binarios });
        if (!ia.topicos && ia.status === 400) throw new Error(ia.aviso);
        if (!ia.topicos && !conteudo) {
          throw new Error(`Não foi possível ler os arquivos sem a IA (${ia.aviso}). Cole o conteúdo em texto.`);
        }

        const plano = gerarPlano({
          materia,
          dataProva,
          horasPorDia,
          conteudo,
          links,
          topicosDaIA: ia.topicos,
          origem: ia.topicos ? "ia" : "local",
          aviso: ia.aviso || "",
        });
        salvar(plano);
        renderPlano(normalizarPlano(plano));
        document.getElementById("resultado-plano").scrollIntoView({ behavior: "smooth" });
      } catch (erro) {
        mostrarErro(erro.message);
      } finally {
        botao.disabled = false;
        botao.textContent = "Gerar plano";
      }
    });

    document.getElementById("btn-imprimir").addEventListener("click", () => window.print());
    document.getElementById("btn-novo-plano").addEventListener("click", () => {
      try {
        localStorage.removeItem(CHAVE_STORAGE);
        document.dispatchEvent(new CustomEvent("ia-de-estudos:dados-alterados"));
      } catch (e) {}
      document.getElementById("resultado-plano").hidden = true;
      if (window.IAEstudosPlanoChat) window.IAEstudosPlanoChat.fechar();
      document.dispatchEvent(new CustomEvent("ia-de-estudos:plano"));
      form.reset();
      form.scrollIntoView({ behavior: "smooth" });
    });

    const salvo = normalizarPlano(carregar());
    if (salvo) {
      try {
        renderPlano(salvo);
      } catch (e) {
        console.error("Não foi possível mostrar o plano salvo", e);
      }
    }
  }

  window.IAEstudos = { gerarPlano, extrairTopicos, frases };
  document.addEventListener("DOMContentLoaded", iniciar);
})();
