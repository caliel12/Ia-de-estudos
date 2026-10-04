// Mini simulados do plano de estudos.
// As questões vêm da IA (/api/gerar-simulado) ou, sem IA, são montadas aqui com o conteúdo do plano.
// A múltipla escolha é corrigida no navegador; a IA (/api/corrigir-simulado) corrige as discursivas e explica os erros.
// Os resultados ficam em plano.simulados[indiceDaEtapa] e quem salva é o planejador (opcoes.salvar).
(function () {
  "use strict";

  const URL_GERAR = "api/gerar-simulado";
  const URL_CORRIGIR = "api/corrigir-simulado";
  const NOTA_BOA = 0.7;
  const MAX_REFORCO = 3;
  const AVISO_LOCAL = "Simulado simples feito no navegador, sem a IA: a correção é automática e não tem explicação personalizada.";
  const AVISO_SEM_CORRECAO = "Não consegui falar com a IA para corrigir as discursivas. Compare sua resposta com a resposta esperada.";

  // ---------- Utilidades ----------

  function el(tag, classe, texto, filhos) {
    const no = document.createElement(tag);
    if (classe) no.className = classe;
    if (texto != null && texto !== "") no.textContent = texto;
    (filhos || []).forEach((f) => f && no.appendChild(f));
    return no;
  }

  function anexar(pai, ...filhos) {
    filhos.forEach((f) => f && pai.appendChild(f));
  }

  function botao(texto, classe, aoClicar) {
    const b = el("button", classe || "btn", texto);
    b.type = "button";
    if (aoClicar) b.addEventListener("click", aoClicar);
    return b;
  }

  function virgula(numero) {
    return String(numero).replace(".", ",");
  }

  function letra(i) {
    return String.fromCharCode(65 + i);
  }

  function embaralhar(lista) {
    const copia = lista.slice();
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  function frases(texto) {
    return (String(texto || "").match(/[^.!?]+[.!?]?/g) || []).map((f) => f.trim()).filter((f) => f.length > 20);
  }

  function escaparRegex(texto) {
    return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  async function postar(url, corpo) {
    let resposta;
    try {
      resposta = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
    } catch (e) {
      return { erro: "IA indisponível (abra o site por um servidor com a função /api)" };
    }
    const dados = await resposta.json().catch(() => null);
    if (resposta.ok && dados) return { dados };
    return { erro: (dados && dados.erro) || "IA indisponível neste servidor" };
  }

  // ---------- Conteúdo do plano ----------

  function topicosDoPlano(plano) {
    const vistos = new Map();
    plano.dias.forEach((dia) => {
      if (dia.tipo !== "estudo") return;
      dia.tarefas.forEach((t) => {
        if (t.topico && !vistos.has(t.topico)) vistos.set(t.topico, t);
      });
    });
    return Array.from(vistos.values()).slice(0, 20);
  }

  function textoDoTopico(t) {
    return [t.leitura, t.explicacao].filter(Boolean).join(" ");
  }

  function topicosDoSimulado(plano, indice, tipo) {
    const tarefas = tipo === "final" ? topicosDoPlano(plano) : plano.dias[indice].tarefas.filter((t) => t.topico);
    return (tarefas.length > 0 ? tarefas : topicosDoPlano(plano)).slice(0, 20);
  }

  function registro(plano, indice) {
    return plano.simulados[indice] || null;
  }

  function corrigidos(plano) {
    return Object.entries(plano.simulados)
      .filter(([, s]) => s && s.estado === "corrigido" && s.resultado)
      .map(([indice, s]) => ({ indice: Number(indice), s }))
      .sort((a, b) => String(a.s.feitoEm).localeCompare(String(b.s.feitoEm)));
  }

  // Tópicos que ficaram abaixo de 70% no simulado mais recente que os cobriu.
  function pontosFracos(plano, antesDe) {
    const porTopico = new Map();
    corrigidos(plano)
      .filter(({ indice }) => antesDe == null || indice < antesDe)
      .forEach(({ indice, s }) => {
        const revisar = Array.isArray(s.resultado.revisar) ? s.resultado.revisar : [];
        Object.entries(s.resultado.porTopico || {}).forEach(([topico, p]) => {
          if (!p || !p.total) return;
          const dica = revisar.find((r) => r.topico && r.topico.toLowerCase() === topico.toLowerCase());
          porTopico.set(topico, {
            topico,
            indice,
            aproveitamento: p.pontos / p.total,
            oQueFazer: (dica && dica.oQueFazer) || "",
          });
        });
      });
    return Array.from(porTopico.values())
      .filter((p) => p.aproveitamento < NOTA_BOA)
      .sort((a, b) => b.indice - a.indice || a.aproveitamento - b.aproveitamento);
  }

  // ---------- Simulado local (sem IA) ----------

  function questaoDePergunta(topico, pergunta, todasRespostas) {
    const certa = pergunta.resposta;
    const distratores = embaralhar(todasRespostas.filter((r) => r.toLowerCase() !== certa.toLowerCase())).slice(0, 3);
    if (distratores.length < 1) return null;
    return montarMultipla(topico, pergunta.pergunta, certa, distratores);
  }

  function questaoDeAssunto(topico, todos) {
    const frase = frases(topico.leitura)[0];
    const outros = embaralhar(todos.filter((t) => t.topico !== topico.topico)).slice(0, 3).map((t) => t.topico);
    if (!frase || outros.length < 1) return null;
    const escondida = frase.replace(new RegExp(escaparRegex(topico.topico), "gi"), "___");
    return montarMultipla(topico, `Qual assunto combina com esta descrição? "${escondida}"`, topico.topico, outros);
  }

  function questoesDeLacuna(topico, palavrasDoPlano) {
    return frases(textoDoTopico(topico))
      .filter((f) => /\p{L}{7,}/u.test(f))
      .slice(0, 2)
      .map((f) => questaoDeLacuna(topico, f, palavrasDoPlano));
  }

  function questaoDeLacuna(topico, frase, palavrasDoPlano) {
    const alvo = frase.match(/\p{L}{7,}/gu).reduce((a, b) => (b.length > a.length ? b : a));
    const distratores = embaralhar(palavrasDoPlano.filter((p) => p.toLowerCase() !== alvo.toLowerCase())).slice(0, 3);
    if (distratores.length < 2) return null;
    return montarMultipla(topico, `Complete a frase: "${frase.replace(alvo, "_____")}"`, alvo, distratores);
  }

  function montarMultipla(topico, enunciado, certa, distratores) {
    const alternativas = embaralhar([certa].concat(distratores));
    return {
      tipo: "multipla",
      topico: topico.topico,
      enunciado,
      alternativas,
      correta: alternativas.indexOf(certa),
      explicacao: `A resposta certa é: ${certa}.`,
    };
  }

  function questoesLocais(plano, topicos, tipo, fracos) {
    const todos = topicosDoPlano(plano);
    const respostas = [];
    const palavras = new Set();
    todos.forEach((t) => {
      (t.perguntas || []).forEach((p) => p && p.resposta && p.resposta.length <= 200 && respostas.push(p.resposta));
      (textoDoTopico(t).match(/\p{L}{7,}/gu) || []).forEach((p) => palavras.add(p.toLowerCase()));
    });
    const listaPalavras = Array.from(palavras);

    // Para cada tópico, uma fila de questões possíveis; depois tira uma de cada tópico por vez.
    const filas = topicos.map((t) => {
      const fila = [questaoDeAssunto(t, todos)].concat(questoesDeLacuna(t, listaPalavras));
      (t.perguntas || []).forEach((p) => p && p.resposta && fila.push(questaoDePergunta(t, p, respostas)));
      return { topico: t.topico, fila: fila.filter(Boolean), peso: fracos.includes(t.topico) ? 2 : 1 };
    });

    const limite = tipo === "final" ? 10 : 5;
    const questoes = [];
    let rodada = 0;
    while (questoes.length < limite && filas.some((f) => f.fila.length > 0) && rodada < 20) {
      filas.forEach((f) => {
        for (let k = 0; k < f.peso && f.fila.length > 0 && questoes.length < limite; k++) questoes.push(f.fila.shift());
      });
      rodada++;
    }
    return questoes;
  }

  // ---------- Correção ----------

  function respostaComoTexto(q, resposta) {
    if (q.tipo === "multipla") return Number.isInteger(resposta) ? `${letra(resposta)}) ${q.alternativas[resposta]}` : "em branco";
    return resposta ? String(resposta) : "em branco";
  }

  function montarResultado(reg, ia) {
    const { questoes, respostas } = reg;
    const discursivas = new Map(((ia && ia.discursivas) || []).map((d) => [d.numero, d]));
    const explicacoes = new Map(((ia && ia.erros) || []).map((e) => [e.numero, e.explicacao]));

    const pontos = questoes.map((q, i) => {
      if (q.tipo === "multipla") return respostas[i] === q.correta ? 1 : 0;
      const d = discursivas.get(i + 1);
      return d ? Number(d.nota) || 0 : null;
    });

    const avaliadas = pontos.filter((p) => p != null);
    const soma = avaliadas.reduce((a, b) => a + b, 0);
    const porTopico = {};
    questoes.forEach((q, i) => {
      if (pontos[i] == null || !q.topico) return;
      const t = (porTopico[q.topico] = porTopico[q.topico] || { pontos: 0, total: 0 });
      t.pontos += pontos[i];
      t.total += 1;
    });

    const erros = [];
    questoes.forEach((q, i) => {
      if (pontos[i] === 1) return;
      const certa = q.tipo === "multipla" ? `${letra(q.correta)}) ${q.alternativas[q.correta]}` : q.respostaEsperada || "";
      erros.push({
        numero: i + 1,
        explicacao: explicacoes.get(i + 1) || (q.tipo === "multipla" ? q.explicacao : "") || "",
        comentario: (discursivas.get(i + 1) || {}).comentario || "",
        semCorrecao: pontos[i] == null,
        resumo: `${q.enunciado} — respondeu "${respostaComoTexto(q, respostas[i])}"${certa ? `; o certo é "${certa}"` : ""}.`.slice(0, 700),
      });
    });

    const revisarIA = ia && Array.isArray(ia.revisar) ? ia.revisar : [];
    const revisar = revisarIA.length > 0 || ia
      ? revisarIA
      : Object.entries(porTopico)
          .filter(([, p]) => p.pontos / p.total < NOTA_BOA)
          .map(([topico]) => ({ topico, oQueFazer: "Releia o resumo e a explicação e refaça as perguntas de revisão." }));

    return {
      nota: avaliadas.length > 0 ? Math.round((soma / avaliadas.length) * 100) / 10 : 0,
      acertos: soma,
      total: avaliadas.length,
      origem: ia ? "ia" : reg.origem === "ia" ? "parcial" : "local",
      mensagem: (ia && ia.mensagem) || "",
      pontosFortes: (ia && ia.pontosFortes) || [],
      erros,
      revisar,
      porTopico,
    };
  }

  function resumoParaIA(plano) {
    const lista = corrigidos(plano);
    if (lista.length === 0) return null;
    const { indice, s } = lista[lista.length - 1];
    const dia = plano.dias[indice];
    return {
      etapa: dia ? `Etapa ${indice + 1}: ${dia.titulo}` : "",
      nota: s.resultado.nota,
      erros: (s.resultado.erros || []).map((e) => [e.resumo, e.explicacao].filter(Boolean).join(" ")).slice(0, 12),
      revisar: (s.resultado.revisar || []).map((r) => [r.topico, r.oQueFazer].filter(Boolean).join(": ")).slice(0, 10),
    };
  }

  // ---------- Cartão do simulado ----------

  function cartao(plano, indice, opcoes) {
    const tipo = opcoes.tipo;
    const caixa = el("section", `simulado simulado--${tipo}`);
    let carregando = "";
    let confirmarEnvio = false;

    function salvarRegistro(reg) {
      plano.simulados[indice] = reg;
      opcoes.salvar();
    }

    function titulo() {
      return tipo === "final" ? "Simulado geral" : "Mini simulado";
    }

    function cabecalho(subtitulo) {
      return el("div", "simulado-topo", null, [
        el("p", "simulado-rotulo", titulo()),
        subtitulo ? el("p", "hint", subtitulo) : null,
      ]);
    }

    function aviso(texto) {
      return texto ? el("p", "simulado-aviso", texto) : null;
    }

    function desenhar() {
      const reg = registro(plano, indice);
      caixa.replaceChildren();
      if (carregando) {
        anexar(caixa, cabecalho(), el("p", "simulado-carregando", carregando));
      } else if (reg && reg.estado === "corrigido" && reg.resultado) {
        desenharResultado(reg);
      } else if (reg && reg.estado === "respondendo" && Array.isArray(reg.questoes) && reg.questoes.length > 0) {
        desenharQuestao(reg);
      } else {
        desenharInicio(reg);
      }
    }

    function desenharInicio(reg) {
      const texto = tipo === "final"
        ? "Um simulado com todos os tópicos, caprichando no que você errou antes. Faça sem consultar o material."
        : "Algumas questões rápidas para ver o que ficou desta etapa. Sem pressa e sem olhar o material.";
      anexar(caixa, 
        cabecalho(texto),
        reg && reg.erro ? el("p", "form-erro", reg.erro) : null,
        opcoes.perguntar ? botao("Começar simulado", "btn", comecar) : el("p", "hint", "O simulado fica disponível na etapa aberta.")
      );
    }

    async function comecar() {
      carregando = "Preparando as questões…";
      desenhar();
      const topicos = topicosDoSimulado(plano, indice, tipo);
      const fracos = tipo === "final" ? pontosFracos(plano).map((p) => p.topico) : [];
      const anterior = registro(plano, indice);
      const resposta = await postar(URL_GERAR, {
        tipo,
        materia: plano.materia,
        idade: opcoes.idade(),
        topicos: topicos.map((t) => ({ titulo: t.topico, resumo: textoDoTopico(t).slice(0, tipo === "final" ? 400 : 1500) })),
        pontosFracos: fracos,
      });

      let questoes = resposta.dados && Array.isArray(resposta.dados.questoes) ? resposta.dados.questoes : [];
      let origem = "ia";
      let avisoTexto = "";
      if (questoes.length === 0) {
        questoes = questoesLocais(plano, topicos, tipo, fracos);
        origem = "local";
        avisoTexto = `${AVISO_LOCAL}${resposta.erro ? ` (${resposta.erro})` : ""}`;
      }
      carregando = "";
      if (questoes.length === 0) {
        salvarRegistro({ tipo, estado: "inicio", erro: "Não deu para montar um simulado sem a IA com esse conteúdo. Pode concluir a etapa assim mesmo." });
        return desenhar();
      }
      salvarRegistro({
        tipo,
        titulo: plano.dias[indice].titulo,
        origem,
        aviso: avisoTexto,
        questoes,
        respostas: questoes.map(() => null),
        atual: 0,
        estado: "respondendo",
        tentativas: ((anterior && anterior.tentativas) || 0) + 1,
      });
      desenhar();
      caixa.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function desenharQuestao(reg) {
      const total = reg.questoes.length;
      const i = Math.min(Math.max(reg.atual || 0, 0), total - 1);
      const q = reg.questoes[i];
      const barra = el("div", "simulado-barra", null, [el("span")]);
      barra.firstChild.style.width = `${Math.round(((i + 1) / total) * 100)}%`;

      const corpo = el("fieldset", "questao");
      corpo.append(
        el("legend", "questao-num", `Questão ${i + 1} de ${total}${q.topico ? " · " + q.topico : ""}`),
        el("p", "questao-enunciado", q.enunciado)
      );

      let campoTexto = null;
      if (q.tipo === "multipla") {
        q.alternativas.forEach((alt, k) => {
          const radio = el("input");
          radio.type = "radio";
          radio.name = `questao-${indice}-${i}`;
          radio.checked = reg.respostas[i] === k;
          radio.addEventListener("change", () => {
            reg.respostas[i] = k;
            confirmarEnvio = false;
            salvarRegistro(reg);
          });
          corpo.appendChild(el("label", "alternativa", null, [radio, el("span", "alternativa-letra", letra(k)), el("span", "alternativa-texto", alt)]));
        });
      } else {
        campoTexto = el("textarea");
        campoTexto.rows = 4;
        campoTexto.placeholder = "Responda com suas palavras, em 1 a 3 frases.";
        campoTexto.value = reg.respostas[i] || "";
        campoTexto.maxLength = 2000;
        campoTexto.setAttribute("aria-label", "Sua resposta");
        campoTexto.addEventListener("change", () => {
          reg.respostas[i] = campoTexto.value.trim();
          salvarRegistro(reg);
        });
        corpo.appendChild(campoTexto);
      }

      const guardarTexto = () => {
        if (campoTexto) reg.respostas[i] = campoTexto.value.trim();
      };
      const ir = (destino) => {
        guardarTexto();
        reg.atual = destino;
        confirmarEnvio = false;
        salvarRegistro(reg);
        desenhar();
        const foco = caixa.querySelector("input, textarea");
        if (foco) foco.focus({ preventScroll: true });
      };

      const emBranco = () => reg.respostas.filter((r) => r == null || r === "").length;
      const acoes = el("div", "simulado-acoes");
      if (i > 0) acoes.appendChild(botao("Voltar", "btn btn--secundario", () => ir(i - 1)));
      if (i < total - 1) acoes.appendChild(botao("Próxima", "btn", () => ir(i + 1)));
      else {
        acoes.appendChild(
          botao(confirmarEnvio ? "Enviar mesmo assim" : "Enviar respostas", "btn", () => {
            guardarTexto();
            if (emBranco() > 0 && !confirmarEnvio) {
              confirmarEnvio = true;
              salvarRegistro(reg);
              return desenhar();
            }
            enviar(reg);
          })
        );
      }

      anexar(caixa, 
        cabecalho(),
        aviso(reg.aviso),
        barra,
        corpo,
        confirmarEnvio ? el("p", "simulado-aviso", `Faltam ${emBranco()} questão(ões) sem resposta.`) : null,
        acoes
      );
    }

    async function enviar(reg) {
      let ia = null;
      if (reg.origem === "ia") {
        carregando = "A IA está corrigindo suas respostas…";
        desenhar();
        const resposta = await postar(URL_CORRIGIR, {
          tipo,
          materia: plano.materia,
          idade: opcoes.idade(),
          questoes: reg.questoes.map((q, i) => Object.assign({}, q, { resposta: reg.respostas[i] })),
        });
        ia = resposta.dados || null;
        reg.aviso = ia ? "" : `${AVISO_SEM_CORRECAO}${resposta.erro ? ` (${resposta.erro})` : ""}`;
        carregando = "";
      }
      reg.resultado = montarResultado(reg, ia);
      reg.estado = "corrigido";
      reg.feitoEm = new Date().toISOString();
      salvarRegistro(reg);
      desenhar();
      caixa.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function desenharResultado(reg) {
      const r = reg.resultado;
      const boa = r.nota >= NOTA_BOA * 10;
      const placar = el("div", `simulado-nota${boa ? " simulado-nota--boa" : ""}`, null, [
        el("span", "simulado-nota-valor", virgula(r.nota)),
        el("span", "simulado-nota-de", "de 10"),
      ]);
      const frase = r.mensagem || (boa ? "Mandou bem! Você está no caminho certo." : "Tudo bem errar no simulado: é justamente para descobrir o que revisar.");

      anexar(caixa, 
        cabecalho(`Resultado · ${virgula(Math.round(r.acertos * 10) / 10)} de ${r.total} ${r.total === 1 ? "questão" : "questões"} certas`),
        el("div", "simulado-placar", null, [placar, el("p", "simulado-mensagem", frase)]),
        aviso(r.origem === "local" ? AVISO_LOCAL : reg.aviso)
      );

      if (r.pontosFortes && r.pontosFortes.length > 0) {
        caixa.appendChild(el("div", "simulado-bloco simulado-bloco--bom", null, [
          el("h5", null, "O que você acertou"),
          el("ul", null, null, r.pontosFortes.map((p) => el("li", null, p))),
        ]));
      }

      if (r.erros.length > 0) {
        const lista = el("ol", "simulado-erros");
        r.erros.forEach((e) => lista.appendChild(itemDeErro(reg, e)));
        caixa.appendChild(el("div", "simulado-bloco", null, [el("h5", null, "Onde você foi mal"), lista]));
      } else {
        caixa.appendChild(el("p", "simulado-mensagem", "Você acertou todas! Bora para a próxima."));
      }

      if (r.revisar && r.revisar.length > 0) {
        caixa.appendChild(el("div", "simulado-bloco simulado-bloco--revisar", null, [
          el("h5", null, "O que revisar"),
          el("ul", null, null, r.revisar.map((item) => el("li", null, null, [
            item.topico ? el("strong", null, `${item.topico}: `) : null,
            document.createTextNode(item.oQueFazer || ""),
          ]))),
        ]));
      }

      const acoes = el("div", "simulado-acoes");
      if (opcoes.perguntar && r.erros.length > 0) {
        acoes.appendChild(botao("Perguntar à IA sobre meus erros", "btn", () =>
          opcoes.perguntar("Me ajuda a entender o que eu errei no simulado? Explica de outro jeito e me dá uma questão parecida pra treinar.")
        ));
      }
      if (opcoes.perguntar && reg.origem === "ia" && r.origem === "parcial" && Array.isArray(reg.questoes)) {
        acoes.appendChild(botao("Corrigir com a IA de novo", "btn btn--secundario", () => {
          reg.estado = "respondendo";
          enviar(reg);
        }));
      }
      if (opcoes.perguntar) acoes.appendChild(botao("Refazer simulado", "btn btn--secundario", comecar));
      if (acoes.childNodes.length > 0) caixa.appendChild(acoes);
    }

    function itemDeErro(reg, erro) {
      const q = Array.isArray(reg.questoes) ? reg.questoes[erro.numero - 1] : null;
      if (!q) return el("li", "simulado-erro", erro.resumo || "");
      const resposta = reg.respostas ? reg.respostas[erro.numero - 1] : null;
      const certa = q.tipo === "multipla" ? `${letra(q.correta)}) ${q.alternativas[q.correta]}` : q.respostaEsperada;
      return el("li", "simulado-erro", null, [
        el("p", "questao-num", `Questão ${erro.numero}${q.topico ? " · " + q.topico : ""}`),
        el("p", "questao-enunciado", q.enunciado),
        el("p", "simulado-sua", `Sua resposta: ${respostaComoTexto(q, resposta)}`),
        certa ? el("p", "simulado-certa", `${q.tipo === "multipla" ? "Resposta certa" : "Resposta esperada"}: ${certa}`) : null,
        erro.comentario ? el("p", null, erro.comentario) : null,
        erro.explicacao ? el("p", "simulado-explicacao", erro.explicacao) : null,
      ]);
    }

    desenhar();
    return caixa;
  }

  // ---------- Reforço nas próximas etapas ----------

  function reforco(plano, indice) {
    const fracos = pontosFracos(plano, indice).slice(0, MAX_REFORCO);
    if (fracos.length === 0) return null;
    const topicos = topicosDoPlano(plano);
    const lista = el("ul", "reforco-lista");
    fracos.forEach((f) => {
      const t = topicos.find((x) => x.topico === f.topico);
      const item = el("li", null, null, [
        el("strong", null, f.topico),
        el("span", null, ` · você acertou ${Math.round(f.aproveitamento * 100)}% no simulado`),
        f.oQueFazer ? el("p", null, f.oQueFazer) : null,
      ]);
      if (t && (t.leitura || t.dica)) {
        item.appendChild(el("details", null, null, [
          el("summary", null, "Rever o resumo"),
          t.leitura ? el("p", null, t.leitura) : null,
          t.dica ? el("p", "reforco-dica", `Macete: ${t.dica}`) : null,
        ]));
      }
      lista.appendChild(item);
    });
    return el("div", "reforco", null, [
      el("p", "simulado-rotulo", "Reforço antes de começar"),
      el("p", "hint", "Esses pontos ficaram difíceis nos simulados. Dá uma revisada rápida:"),
      lista,
    ]);
  }

  window.IAEstudosSimulado = { cartao, reforco, pontosFracos, resumoParaIA, questoesLocais };
})();
