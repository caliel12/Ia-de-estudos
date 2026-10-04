// Planejador de estudos.
// Os tópicos vêm da IA (/api/gerar-plano, Google Gemini) quando disponível, ou
// são extraídos localmente do texto. O cronograma é sempre montado aqui.
(function () {
  "use strict";

  const CHAVE_STORAGE = "ia-de-estudos:plano";
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

  function tarefasDeEstudo(materia, topicos, todos, horasPorDia) {
    const minutos = Math.round((horasPorDia * 60) / topicos.length);
    return topicos.map((topico) => {
      const indice = todos.indexOf(topico);
      const outro = todos[indice - 1] || todos[indice + 1];
      return {
        topico: topico.titulo,
        minutos,
        leitura: topico.resumo || resumoDoTopico(topico),
        perguntas: topico.perguntas && topico.perguntas.length > 0 ? topico.perguntas : gerarPerguntas(topico, outro),
        videos: [linkVideo(materia, topico.titulo, topico.buscaVideo)],
      };
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
          tarefas: tarefasDeEstudo(materia, doDia, topicos, horasPorDia),
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
        tarefas: tarefasDeEstudo(materia, revisar, topicos, horasPorDia),
      });
    });

    if (temRevisaoFinal) {
      dias.push({
        data: somarDias(prova, -1).toISOString(),
        tipo: "revisao",
        titulo: "Revisão geral e simulado",
        tarefas: [
          {
            topico: "Simulado",
            minutos: Math.round(horasPorDia * 60),
            leitura: "Revise suas anotações de todos os tópicos e responda às perguntas abaixo sem consultar o material.",
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
    };
  }

  // ---------- Interface ----------

  function el(tag, opcoes = {}, filhos = []) {
    const no = document.createElement(tag);
    if (opcoes.classe) no.className = opcoes.classe;
    if (opcoes.texto != null) no.textContent = opcoes.texto;
    if (opcoes.attrs) Object.entries(opcoes.attrs).forEach(([k, v]) => no.setAttribute(k, v));
    filhos.forEach((f) => f && no.appendChild(f));
    return no;
  }

  function linkExterno(titulo, url) {
    return el("a", { texto: titulo, attrs: { href: url, target: "_blank", rel: "noopener noreferrer" } });
  }

  function renderTarefa(tarefa, links) {
    const cabecalho = tarefa.minutos ? `${tarefa.topico} · ~${tarefa.minutos} min` : tarefa.topico;
    const bloco = el("div", { classe: "tarefa" }, [el("h5", { texto: cabecalho }), el("p", { texto: tarefa.leitura })]);

    if (tarefa.perguntas.length > 0) {
      const lista = el("ul");
      tarefa.perguntas.forEach((p) => {
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
      bloco.appendChild(el("div", { classe: "tarefa" }, [el("h5", { texto: "Perguntas de revisão" }), lista]));
    }

    const videos = tarefa.videos.map((v) => el("li", {}, [linkExterno(v.titulo, v.url)]));
    const materiais = (links || []).map((url) => el("li", {}, [linkExterno(url, url)]));
    if (videos.length + materiais.length > 0) {
      const lista = el("ul", {}, videos.concat(materiais));
      bloco.appendChild(el("div", { classe: "tarefa" }, [el("h5", { texto: "Vídeos e materiais" }), lista]));
    }

    return bloco;
  }

  function salvar(plano) {
    try {
      localStorage.setItem(CHAVE_STORAGE, JSON.stringify(plano));
    } catch (e) {
      // localStorage indisponível (ex.: modo privado); o plano só não persiste.
    }
  }

  function carregar() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE_STORAGE));
    } catch (e) {
      return null;
    }
  }

  function atualizarProgresso(plano) {
    const total = plano.dias.length;
    const feitos = plano.concluidos.length;
    document.getElementById("progresso-barra").style.width = `${Math.round((feitos / total) * 100)}%`;
    document.getElementById("progresso-texto").textContent = `${feitos} de ${total} etapas concluídas`;
  }

  function renderPlano(plano) {
    const container = document.getElementById("resultado-plano");
    const lista = document.getElementById("plano-dias");
    const prova = parseDataLocal(plano.dataProva);

    document.getElementById("plano-titulo").textContent = `Plano de ${plano.materia}`;
    document.getElementById("plano-resumo").textContent =
      `Prova em ${formatarData(prova)} · ${plano.totalTopicos} tópico(s) · ${plano.dias.length} etapa(s)`;

    const origem = document.getElementById("plano-origem");
    const comIA = plano.origem === "ia";
    origem.className = "plano-origem" + (comIA ? " plano-origem--ia" : "");
    origem.textContent = comIA
      ? "Gerado com IA (Google Gemini)"
      : "Gerado no modo local, sem IA" + (plano.aviso ? `: ${plano.aviso}` : "");

    lista.replaceChildren();
    plano.dias.forEach((dia, indice) => {
      const concluido = plano.concluidos.includes(indice);
      const check = el("input", { attrs: { type: "checkbox" } });
      check.checked = concluido;

      const item = el("li", { classe: `dia dia--${dia.tipo}${concluido ? " dia--concluido" : ""}` }, [
        el("div", { classe: "dia-topo" }, [
          el("div", {}, [
            el("p", { classe: "dia-data", texto: `Etapa ${indice + 1} · ${formatarData(new Date(dia.data))}` }),
            el("h4", { texto: dia.titulo }),
          ]),
          el("label", { classe: "dia-check" }, [check, document.createTextNode("Concluído")]),
        ]),
      ]);
      dia.tarefas.forEach((t) => item.appendChild(renderTarefa(t, dia.tipo === "estudo" ? plano.links : [])));

      check.addEventListener("change", () => {
        plano.concluidos = check.checked
          ? plano.concluidos.concat(indice)
          : plano.concluidos.filter((i) => i !== indice);
        item.classList.toggle("dia--concluido", check.checked);
        salvar(plano);
        atualizarProgresso(plano);
      });

      lista.appendChild(item);
    });

    atualizarProgresso(plano);
    container.hidden = false;
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

        if (!conteudo && binarios.length === 0) {
          throw new Error("Adicione o conteúdo da prova (texto ou arquivo) para montar o plano.");
        }

        const ia = await obterTopicosDaIA({ materia, dataProva, horasPorDia, conteudo, arquivos: binarios });
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
        renderPlano(plano);
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
      } catch (e) {}
      document.getElementById("resultado-plano").hidden = true;
      form.reset();
      form.scrollIntoView({ behavior: "smooth" });
    });

    const salvo = carregar();
    if (salvo && Array.isArray(salvo.dias)) renderPlano(salvo);
  }

  window.IAEstudos = { gerarPlano, extrairTopicos };
  document.addEventListener("DOMContentLoaded", iniciar);
})();
