/* Agenda escolar: provas, lições e trabalhos com lembretes. */
(function () {
  "use strict";

  var CHAVE = "ia-de-estudos:agenda";
  var CHAVE_AVISOS = "ia-de-estudos:agenda-avisos";
  var INTERVALO_AVISOS = 30 * 60 * 1000;
  var TIPOS = ["Prova", "Lição de casa", "Trabalho", "Outro"];
  var MS_DIA = 24 * 60 * 60 * 1000;

  var raiz = document.getElementById("agenda-app");

  /* ---------- Datas (sempre no horário local) ---------- */

  function doisDigitos(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function paraISO(d) {
    return d.getFullYear() + "-" + doisDigitos(d.getMonth() + 1) + "-" + doisDigitos(d.getDate());
  }

  function deISO(iso) {
    var p = String(iso).split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function hojeISO() {
    return paraISO(new Date());
  }

  function diasAte(iso) {
    var hoje = deISO(hojeISO());
    return Math.round((deISO(iso) - hoje) / MS_DIA);
  }

  function somarDias(iso, n) {
    var d = deISO(iso);
    d.setDate(d.getDate() + n);
    return paraISO(d);
  }

  function dataPorExtenso(iso) {
    var d = deISO(iso);
    var opcoes = { weekday: "long", day: "numeric", month: "long" };
    if (d.getFullYear() !== new Date().getFullYear()) opcoes.year = "numeric";
    var texto = d.toLocaleDateString("pt-BR", opcoes);
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  function rotuloPrazo(dias) {
    if (dias < 0) return "Atrasado há " + -dias + (dias === -1 ? " dia" : " dias");
    if (dias === 0) return "Hoje";
    if (dias === 1) return "Amanhã";
    return "Em " + dias + " dias";
  }

  function nivelPrazo(dias) {
    if (dias < 0) return "atrasado";
    if (dias <= 1) return "urgente";
    if (dias <= 3) return "proximo";
    return "";
  }

  /* ---------- Armazenamento ---------- */

  function lerJSON(chave, padrao) {
    try {
      var valor = JSON.parse(localStorage.getItem(chave));
      return valor == null ? padrao : valor;
    } catch (e) {
      return padrao;
    }
  }

  function gravarJSON(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch (e) {
      /* armazenamento cheio ou bloqueado: segue só na memória */
    }
  }

  function itemValido(i) {
    return i && typeof i.id === "string" && typeof i.titulo === "string" && /^\d{4}-\d{2}-\d{2}$/.test(i.data);
  }

  function carregar() {
    var lista = lerJSON(CHAVE, []);
    return Array.isArray(lista) ? lista.filter(itemValido) : [];
  }

  var itens = carregar();

  function salvar() {
    gravarJSON(CHAVE, itens);
  }

  function ordenar(lista) {
    return lista.slice().sort(function (a, b) {
      if (a.data !== b.data) return a.data < b.data ? -1 : 1;
      if ((a.hora || "") !== (b.hora || "")) return (a.hora || "") < (b.hora || "") ? -1 : 1;
      return (a.criadoEm || "") < (b.criadoEm || "") ? -1 : 1;
    });
  }

  function novoId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function pendentesUrgentes() {
    return ordenar(itens).filter(function (i) {
      return !i.feito && diasAte(i.data) <= 3;
    });
  }

  /* ---------- Para a IA do chat ---------- */

  function paraIA() {
    var lista = ordenar(itens)
      .filter(function (i) {
        return !i.feito && diasAte(i.data) <= 30;
      })
      .slice(0, 30)
      .map(function (i) {
        return { tipo: i.tipo, titulo: i.titulo, materia: i.materia || "", data: i.data, hora: i.hora || "" };
      });
    return { hoje: hojeISO(), itens: lista };
  }

  window.IAEstudosAgenda = { paraIA: paraIA };

  if (!raiz) return;

  /* ---------- Google Agenda e .ics ---------- */

  function descricaoItem(item) {
    var partes = [item.tipo];
    if (item.materia) partes.push("Matéria: " + item.materia);
    if (item.obs) partes.push(item.obs);
    partes.push("Criado no IA de Estudos");
    return partes.join("\n");
  }

  function tituloEvento(item) {
    return item.tipo + ": " + item.titulo + (item.materia ? " (" + item.materia + ")" : "");
  }

  function compacta(iso) {
    return iso.replace(/-/g, "");
  }

  function horaMais(item, horas) {
    var p = item.hora.split(":");
    var d = deISO(item.data);
    d.setHours(Number(p[0]) + horas, Number(p[1]), 0, 0);
    return compacta(paraISO(d)) + "T" + doisDigitos(d.getHours()) + doisDigitos(d.getMinutes()) + "00";
  }

  function intervaloDatas(item) {
    if (item.hora) return [horaMais(item, 0), horaMais(item, 1)];
    return [compacta(item.data), compacta(somarDias(item.data, 1))];
  }

  function linkGoogle(item) {
    var datas = intervaloDatas(item);
    var params = [
      "action=TEMPLATE",
      "text=" + encodeURIComponent(tituloEvento(item)),
      "dates=" + datas[0] + "/" + datas[1],
      "details=" + encodeURIComponent(descricaoItem(item))
    ];
    try {
      var fuso = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (item.hora && fuso) params.push("ctz=" + encodeURIComponent(fuso));
    } catch (e) {
      /* sem fuso: o Google usa o da conta */
    }
    return "https://calendar.google.com/calendar/render?" + params.join("&");
  }

  function escaparICS(texto) {
    return String(texto)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r\n|\r|\n/g, "\\n");
  }

  /* Dobra linhas em até 75 bytes (UTF-8), como pede o padrão iCalendar. */
  function dobrarLinha(linha) {
    var saida = [];
    var atual = "";
    var bytes = 0;
    for (var i = 0; i < linha.length; i++) {
      var c = linha.charAt(i);
      var code = linha.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < linha.length) {
        c += linha.charAt(++i);
      }
      var tam = unescape(encodeURIComponent(c)).length;
      var limite = saida.length === 0 ? 75 : 74;
      if (bytes + tam > limite) {
        saida.push(atual);
        atual = "";
        bytes = 0;
      }
      atual += c;
      bytes += tam;
    }
    saida.push(atual);
    return saida.join("\r\n ");
  }

  function carimboUTC(d) {
    return (
      d.getUTCFullYear() + doisDigitos(d.getUTCMonth() + 1) + doisDigitos(d.getUTCDate()) + "T" +
      doisDigitos(d.getUTCHours()) + doisDigitos(d.getUTCMinutes()) + doisDigitos(d.getUTCSeconds()) + "Z"
    );
  }

  function alarme(gatilho, texto) {
    return ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + escaparICS(texto), "TRIGGER:" + gatilho, "END:VALARM"];
  }

  function gerarICS(item) {
    var datas = intervaloDatas(item);
    var linhas = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//IA de Estudos//Agenda//PT-BR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:" + item.id + "@ia-de-estudos",
      "DTSTAMP:" + carimboUTC(new Date())
    ];
    if (item.hora) {
      linhas.push("DTSTART:" + datas[0], "DTEND:" + datas[1]);
    } else {
      linhas.push("DTSTART;VALUE=DATE:" + datas[0], "DTEND;VALUE=DATE:" + datas[1]);
    }
    linhas.push("SUMMARY:" + escaparICS(tituloEvento(item)), "DESCRIPTION:" + escaparICS(descricaoItem(item)));
    /* Dia inteiro: avisa às 9h da véspera (e 3 dias antes, às 9h, para provas). */
    var umDia = item.hora ? "-P1D" : "-PT15H";
    var tresDias = item.hora ? "-P3D" : "-P2DT15H";
    linhas = linhas.concat(alarme(umDia, "Amanhã: " + tituloEvento(item)));
    if (item.tipo === "Prova") linhas = linhas.concat(alarme(tresDias, "Em 3 dias: " + tituloEvento(item)));
    linhas.push("END:VEVENT", "END:VCALENDAR");
    return linhas.map(dobrarLinha).join("\r\n") + "\r\n";
  }

  function nomeArquivo(item) {
    var base = (item.tipo + " " + item.titulo)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);
    return (base || "lembrete") + ".ics";
  }

  function baixarICS(item) {
    var blob = new Blob([gerarICS(item)], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo(item);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  /* ---------- Notificações ---------- */

  var suportaNotificacao = "Notification" in window;
  var registroSW = null;

  function registrarSW() {
    if (!("serviceWorker" in navigator) || registroSW) return Promise.resolve(registroSW);
    return navigator.serviceWorker
      .register("sw.js")
      .then(function (reg) {
        registroSW = reg;
        return reg;
      })
      .catch(function () {
        return null;
      });
  }

  function registroAtivo() {
    if (!("serviceWorker" in navigator)) return Promise.resolve(null);
    var espera = new Promise(function (resolve) {
      setTimeout(function () {
        resolve(null);
      }, 3000);
    });
    return registrarSW().then(function (reg) {
      if (!reg) return null;
      return Promise.race([navigator.serviceWorker.ready, espera]);
    });
  }

  function notificar(titulo, corpo, tag) {
    var opcoes = { body: corpo, tag: tag, data: { url: "#agenda" } };
    return registroAtivo()
      .then(function (reg) {
        if (reg && reg.showNotification) return reg.showNotification(titulo, opcoes);
        throw new Error("sem service worker");
      })
      .catch(function () {
        try {
          var n = new Notification(titulo, opcoes);
          n.onclick = function () {
            window.focus();
            location.hash = "#agenda";
            n.close();
          };
        } catch (e) {
          /* navegador não permite notificações fora do service worker */
        }
      });
  }

  function deveAvisar(item) {
    if (item.feito) return false;
    var dias = diasAte(item.data);
    return dias <= 1 || (item.tipo === "Prova" && dias <= 3);
  }

  function textoAviso(item) {
    var dias = diasAte(item.data);
    return {
      titulo: rotuloPrazo(dias) + " — " + item.tipo,
      corpo: item.titulo + (item.materia ? " (" + item.materia + ")" : "") + (item.hora ? ", às " + item.hora : "") + "."
    };
  }

  function verificarAvisos() {
    if (!suportaNotificacao || Notification.permission !== "granted") return;
    var hoje = hojeISO();
    var registro = lerJSON(CHAVE_AVISOS, {});
    if (typeof registro !== "object" || Array.isArray(registro)) registro = {};
    var ids = {};
    itens.forEach(function (i) {
      ids[i.id] = true;
    });
    Object.keys(registro).forEach(function (id) {
      if (!ids[id]) delete registro[id];
    });
    ordenar(itens).forEach(function (item) {
      if (!deveAvisar(item) || registro[item.id] === hoje) return;
      registro[item.id] = hoje;
      var t = textoAviso(item);
      notificar(t.titulo, t.corpo, "agenda-" + item.id);
    });
    gravarJSON(CHAVE_AVISOS, registro);
  }

  function ativarAvisos() {
    if (!suportaNotificacao) return;
    registrarSW();
    var pedido = Notification.requestPermission(function () {});
    Promise.resolve(pedido).then(function () {
      atualizarBotaoAvisos();
      if (Notification.permission === "granted") {
        notificar("Avisos ativados", "Vamos te avisar quando uma prova ou lição estiver chegando.", "agenda-ativado").then(verificarAvisos);
      }
    });
  }

  /* ---------- Interface ---------- */

  function el(tag, attrs, filhos) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === "texto") n.textContent = v;
        else if (k === "classe") n.className = v;
        else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? "" : v);
      });
    }
    (filhos || []).forEach(function (f) {
      if (f) n.appendChild(typeof f === "string" ? document.createTextNode(f) : f);
    });
    return n;
  }

  var mostrarConcluidos = false;

  var faixa = el("div", { classe: "agenda-avisos", role: "status", "aria-live": "polite" });
  var btnAdicionar = el("button", { type: "button", classe: "agenda-btn agenda-btn--primario", "aria-expanded": "false", "aria-controls": "agenda-form", texto: "+ Adicionar" });
  var btnAvisos = el("button", { type: "button", classe: "agenda-btn agenda-btn--secundario" });
  var estadoAvisos = el("span", { classe: "agenda-estado-avisos" });
  var nota = el("p", {
    classe: "agenda-nota",
    texto: "Os avisos só aparecem com o site aberto no navegador. Para ser lembrado com o site fechado, use “Google Agenda” ou “Baixar lembrete” em cada item."
  });

  var campoTipo = el("select", { id: "agenda-tipo", name: "tipo" }, TIPOS.map(function (t) {
    return el("option", { value: t, texto: t });
  }));
  var campoTitulo = el("input", { id: "agenda-titulo", name: "titulo", type: "text", required: true, maxlength: "120", placeholder: "Ex.: Exercícios da página 42" });
  var campoMateria = el("input", { id: "agenda-materia", name: "materia", type: "text", maxlength: "60", placeholder: "Ex.: Matemática" });
  var campoData = el("input", { id: "agenda-data", name: "data", type: "date", required: true });
  var campoHora = el("input", { id: "agenda-hora", name: "hora", type: "time" });
  var campoObs = el("textarea", { id: "agenda-obs", name: "obs", rows: "2", maxlength: "500", placeholder: "Ex.: Levar calculadora" });
  var erroForm = el("p", { classe: "agenda-erro", role: "alert", hidden: true });

  function campo(rotulo, input, opcional) {
    return el("div", { classe: "agenda-campo" }, [
      el("label", { for: input.id }, [rotulo, opcional ? el("span", { classe: "agenda-opcional", texto: " (opcional)" }) : null]),
      input
    ]);
  }

  var form = el("form", { id: "agenda-form", classe: "agenda-form", novalidate: true, hidden: true }, [
    el("div", { classe: "agenda-grade" }, [campo("Tipo", campoTipo), campo("Matéria", campoMateria, true)]),
    campo("O que é", campoTitulo),
    el("div", { classe: "agenda-grade" }, [campo("Data", campoData), campo("Hora", campoHora, true)]),
    campo("Observação", campoObs, true),
    erroForm,
    el("div", { classe: "agenda-form-acoes" }, [
      el("button", { type: "submit", classe: "agenda-btn agenda-btn--primario", texto: "Salvar" }),
      el("button", { type: "button", classe: "agenda-btn agenda-btn--secundario", texto: "Cancelar", onclick: fecharForm })
    ])
  ]);

  var lista = el("ul", { classe: "agenda-lista", "aria-label": "Itens da agenda" });
  var vazio = el("p", { classe: "agenda-vazio", texto: "Nada na agenda. Adicione sua próxima prova ou lição." });
  var checkConcluidos = el("input", { type: "checkbox", id: "agenda-mostrar-concluidos" });
  var rotuloConcluidos = el("label", { classe: "agenda-concluidos", for: "agenda-mostrar-concluidos" }, [checkConcluidos, " Mostrar concluídos"]);

  raiz.replaceChildren();
  raiz.classList.add("agenda");
  raiz.appendChild(faixa);
  raiz.appendChild(
    el("div", { classe: "agenda-barra" }, [
      btnAdicionar,
      el("div", { classe: "agenda-avisos-controle" }, [btnAvisos, estadoAvisos])
    ])
  );
  raiz.appendChild(nota);
  raiz.appendChild(form);
  raiz.appendChild(lista);
  raiz.appendChild(vazio);
  raiz.appendChild(rotuloConcluidos);

  function abrirForm() {
    form.hidden = false;
    btnAdicionar.hidden = true;
    btnAdicionar.setAttribute("aria-expanded", "true");
    if (!campoData.value) campoData.value = somarDias(hojeISO(), 1);
    campoTitulo.focus();
  }

  function fecharForm() {
    form.reset();
    erroForm.hidden = true;
    form.hidden = true;
    btnAdicionar.hidden = false;
    btnAdicionar.setAttribute("aria-expanded", "false");
    btnAdicionar.focus();
  }

  btnAdicionar.addEventListener("click", abrirForm);
  btnAvisos.addEventListener("click", ativarAvisos);
  checkConcluidos.addEventListener("change", function () {
    mostrarConcluidos = checkConcluidos.checked;
    render();
  });

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var titulo = campoTitulo.value.trim();
    var data = campoData.value;
    var erro = !titulo ? "Escreva o que é (ex.: Exercícios da página 42)." : !/^\d{4}-\d{2}-\d{2}$/.test(data) ? "Escolha a data." : "";
    if (erro) {
      erroForm.textContent = erro;
      erroForm.hidden = false;
      (titulo ? campoData : campoTitulo).focus();
      return;
    }
    itens.push({
      id: novoId(),
      tipo: TIPOS.indexOf(campoTipo.value) >= 0 ? campoTipo.value : "Outro",
      titulo: titulo,
      materia: campoMateria.value.trim(),
      data: data,
      hora: /^\d{2}:\d{2}$/.test(campoHora.value) ? campoHora.value : "",
      obs: campoObs.value.trim(),
      feito: false,
      criadoEm: new Date().toISOString()
    });
    salvar();
    fecharForm();
    render();
    verificarAvisos();
  });

  function atualizarBotaoAvisos() {
    var estado = !suportaNotificacao ? "nao-suportado" : Notification.permission;
    var textos = {
      "nao-suportado": ["Avisos indisponíveis", "Este navegador não mostra notificações."],
      denied: ["Avisos bloqueados", "Libere as notificações nas configurações do navegador."],
      granted: ["Avisos ativados", ""],
      default: ["Ativar avisos", ""]
    };
    var t = textos[estado] || textos["default"];
    btnAvisos.textContent = t[0];
    btnAvisos.disabled = estado !== "default";
    btnAvisos.setAttribute("data-estado", estado);
    estadoAvisos.textContent = t[1];
    estadoAvisos.hidden = !t[1];
  }

  // O js/etapas.js preenche o formulário e mostra o passo 1, mesmo se já houver um plano gerado.
  function criarPlano(item) {
    document.dispatchEvent(new CustomEvent("ia-de-estudos:novo-plano", {
      detail: { materia: item.materia || item.titulo, data: item.data }
    }));
    location.hash = "#planejador";
  }

  function alternarFeito(item) {
    item.feito = !item.feito;
    salvar();
    render();
  }

  function excluir(item) {
    if (!window.confirm("Excluir “" + item.titulo + "” da agenda?")) return;
    itens = itens.filter(function (i) {
      return i.id !== item.id;
    });
    salvar();
    render();
  }

  function renderItem(item) {
    var dias = diasAte(item.data);
    var nivel = item.feito ? "" : nivelPrazo(dias);
    var classes = "agenda-item" + (nivel ? " agenda-item--" + nivel : "") + (item.feito ? " agenda-item--feito" : "");
    var acoes = [
      el("button", {
        type: "button",
        classe: "agenda-acao agenda-acao--feito",
        "aria-pressed": item.feito ? "true" : "false",
        texto: item.feito ? "Desfazer" : "Marcar como feito",
        onclick: function () {
          alternarFeito(item);
        }
      })
    ];
    if (!item.feito) {
      if (item.tipo === "Prova") {
        acoes.push(el("button", { type: "button", classe: "agenda-acao", texto: "Criar plano de estudos", onclick: function () { criarPlano(item); } }));
      }
      acoes.push(el("a", { classe: "agenda-acao", href: linkGoogle(item), target: "_blank", rel: "noopener", texto: "Google Agenda" }));
      acoes.push(el("button", { type: "button", classe: "agenda-acao", texto: "Baixar lembrete (.ics)", onclick: function () { baixarICS(item); } }));
    }
    acoes.push(el("button", { type: "button", classe: "agenda-acao agenda-acao--perigo", texto: "Excluir", "aria-label": "Excluir " + item.titulo, onclick: function () { excluir(item); } }));

    return el("li", { classe: classes }, [
      el("div", { classe: "agenda-item-topo" }, [
        el("span", { classe: "agenda-tipo agenda-tipo--" + TIPOS.indexOf(item.tipo), texto: item.tipo }),
        item.feito ? el("span", { classe: "agenda-prazo", texto: "Concluído" }) : el("span", { classe: "agenda-prazo", texto: rotuloPrazo(dias) })
      ]),
      el("h3", { classe: "agenda-titulo", texto: item.titulo }),
      el("p", { classe: "agenda-meta" }, [
        item.materia ? el("span", { classe: "agenda-materia", texto: item.materia }) : null,
        el("span", { texto: dataPorExtenso(item.data) + (item.hora ? ", " + item.hora : "") })
      ]),
      item.obs ? el("p", { classe: "agenda-obs", texto: item.obs }) : null,
      el("div", { classe: "agenda-acoes" }, acoes)
    ]);
  }

  function renderFaixa() {
    var urgentes = pendentesUrgentes();
    faixa.textContent = "";
    faixa.hidden = urgentes.length === 0;
    if (!urgentes.length) return;
    var atrasados = urgentes.filter(function (i) {
      return diasAte(i.data) < 0;
    }).length;
    var resumo = atrasados
      ? atrasados + (atrasados === 1 ? " item atrasado" : " itens atrasados")
      : "";
    var proximos = urgentes.length - atrasados;
    if (proximos) resumo += (resumo ? " e " : "") + proximos + (proximos === 1 ? " vence em até 3 dias" : " vencem em até 3 dias");
    faixa.appendChild(el("p", { classe: "agenda-avisos-titulo" }, [el("strong", { texto: "Atenção: " }), resumo + "."]));
    faixa.appendChild(
      el("ul", null, urgentes.slice(0, 5).map(function (i) {
        var dias = diasAte(i.data);
        return el("li", { classe: "agenda-aviso agenda-aviso--" + nivelPrazo(dias) }, [
          el("strong", { texto: rotuloPrazo(dias) + ": " }),
          i.tipo + " — " + i.titulo + (i.materia ? " (" + i.materia + ")" : "")
        ]);
      }))
    );
    if (urgentes.length > 5) faixa.appendChild(el("p", { classe: "agenda-avisos-mais", texto: "e mais " + (urgentes.length - 5) + "." }));
  }

  function render() {
    var ordenados = ordenar(itens);
    var visiveis = ordenados.filter(function (i) {
      return mostrarConcluidos || !i.feito;
    });
    var temFeitos = ordenados.some(function (i) {
      return i.feito;
    });
    lista.textContent = "";
    visiveis.forEach(function (i) {
      lista.appendChild(renderItem(i));
    });
    lista.hidden = visiveis.length === 0;
    vazio.hidden = visiveis.length > 0;
    if (!visiveis.length && temFeitos) vazio.textContent = "Tudo em dia! Nenhuma prova ou lição pendente.";
    else vazio.textContent = "Nada na agenda. Adicione sua próxima prova ou lição.";
    rotuloConcluidos.hidden = !temFeitos;
    renderFaixa();
    atualizarBotaoAvisos();
  }

  /* ---------- Inicialização ---------- */

  render();

  if (suportaNotificacao && Notification.permission === "granted") {
    registrarSW().then(verificarAvisos);
  }

  if (suportaNotificacao && navigator.permissions && navigator.permissions.query) {
    navigator.permissions
      .query({ name: "notifications" })
      .then(function (status) {
        status.onchange = function () {
          atualizarBotaoAvisos();
          if (Notification.permission === "granted") registrarSW().then(verificarAvisos);
        };
      })
      .catch(function () {});
  }

  setInterval(function () {
    render();
    verificarAvisos();
  }, INTERVALO_AVISOS);

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    render();
    verificarAvisos();
  });

  window.addEventListener("storage", function (ev) {
    if (ev.key !== CHAVE) return;
    itens = carregar();
    render();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", function (ev) {
      if (ev.data && ev.data.tipo === "abrir-agenda") location.hash = "#agenda";
    });
  }
})();
