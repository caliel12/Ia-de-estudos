/* Conta (opcional): entrar com e-mail e senha e guardar a agenda, o plano e o perfil no servidor. */
(function () {
  "use strict";

  var CHAVES = { agenda: "ia-de-estudos:agenda", plano: "ia-de-estudos:plano", perfil: "ia-de-estudos:perfil" };
  var MARCA_RECARGA = "ia-de-estudos:conta-recarregou";
  var ESPERA_ENVIO = 1500;

  var emailAtual = "";
  var timerEnvio = null;
  var enviando = false;
  var pendente = false;
  // Há mudança feita neste navegador que ainda não chegou na conta.
  var alterado = false;

  var $ = function (id) {
    return document.getElementById(id);
  };

  function api(caminho, metodo, corpo) {
    var opcoes = { method: metodo || "GET", credentials: "same-origin", headers: {} };
    if (corpo !== undefined) {
      opcoes.headers["Content-Type"] = "application/json";
      opcoes.body = JSON.stringify(corpo);
    }
    return fetch("api/conta/" + caminho, opcoes).then(function (r) {
      return r
        .json()
        .catch(function () {
          return null;
        })
        .then(function (dados) {
          if (!dados) throw { status: r.status, erro: "O servidor não respondeu direito. Tente de novo." };
          if (!r.ok) throw { status: r.status, erro: dados.erro || "Algo deu errado. Tente de novo." };
          return dados;
        });
    });
  }

  /* ---------- Dados locais ---------- */

  function lerLocal(chave) {
    try {
      return JSON.parse(localStorage.getItem(CHAVES[chave]));
    } catch (e) {
      return null;
    }
  }

  function gravarLocal(chave, valor) {
    try {
      if (valor == null) localStorage.removeItem(CHAVES[chave]);
      else localStorage.setItem(CHAVES[chave], JSON.stringify(valor));
    } catch (e) {}
  }

  function dadosLocais() {
    var agenda = lerLocal("agenda");
    return { agenda: Array.isArray(agenda) ? agenda : [], plano: lerLocal("plano"), perfil: lerLocal("perfil") };
  }

  function mesmoConteudo(a, b) {
    return JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b);
  }

  // Aplica os dados da conta neste navegador e recarrega a página se algo mudou.
  function aplicar(remoto, destino) {
    var local = dadosLocais();
    var mudou = false;
    ["agenda", "plano", "perfil"].forEach(function (chave) {
      var valor = remoto[chave] == null && chave === "agenda" ? [] : remoto[chave];
      if (!mesmoConteudo(local[chave], valor)) {
        gravarLocal(chave, valor);
        mudou = true;
      }
    });
    if (destino) location.hash = destino;
    if (mudou || destino) {
      sessionStorage.setItem(MARCA_RECARGA, "1");
      location.reload();
    }
  }

  // No primeiro login, junta o que já estava no navegador com o que está na conta.
  function juntar(remoto) {
    var local = dadosLocais();
    var agendaRemota = Array.isArray(remoto.agenda) ? remoto.agenda : [];
    var ids = {};
    agendaRemota.forEach(function (i) {
      if (i && i.id) ids[i.id] = true;
    });
    return {
      agenda: agendaRemota.concat(
        local.agenda.filter(function (i) {
          return i && i.id && !ids[i.id];
        })
      ),
      plano: remoto.plano || local.plano,
      perfil: Object.assign({}, local.perfil || {}, remoto.perfil || {})
    };
  }

  /* ---------- Envio das mudanças ---------- */

  function enviar() {
    timerEnvio = null;
    if (!emailAtual) return;
    if (enviando) {
      pendente = true;
      return;
    }
    enviando = true;
    alterado = false;
    mostrarSalvo("Salvando…");
    api("dados", "PUT", dadosLocais())
      .then(function () {
        mostrarSalvo("Tudo salvo na sua conta.");
      })
      .catch(function (e) {
        alterado = true;
        if (e && e.status === 401) {
          emailAtual = "";
          atualizarTela();
          mostrarMensagem("Sua sessão acabou. Entre de novo para continuar salvando na conta.");
        } else {
          mostrarSalvo("Não deu para salvar agora. Vou tentar de novo quando você mudar algo.");
        }
      })
      .then(function () {
        enviando = false;
        if (pendente) {
          pendente = false;
          agendarEnvio();
        }
      });
  }

  function agendarEnvio() {
    if (!emailAtual) return;
    alterado = true;
    clearTimeout(timerEnvio);
    timerEnvio = setTimeout(enviar, ESPERA_ENVIO);
  }

  function enviarAntesDeSair() {
    if (!timerEnvio || !emailAtual) return;
    clearTimeout(timerEnvio);
    timerEnvio = null;
    try {
      fetch("api/conta/dados", {
        method: "PUT",
        credentials: "same-origin",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dadosLocais())
      });
    } catch (e) {}
  }

  /* ---------- Tela ---------- */

  function mostrarMensagem(texto) {
    var erro = $("conta-erro");
    erro.textContent = texto;
    erro.hidden = !texto;
  }

  function mostrarSalvo(texto) {
    $("conta-status").textContent = texto;
  }

  function atualizarTela() {
    var botao = $("btn-conta");
    botao.hidden = false;
    botao.querySelector(".btn-conta-texto").textContent = emailAtual ? "Minha conta" : "Entrar";
    $("conta-entrar").hidden = !!emailAtual;
    $("conta-logado").hidden = !emailAtual;
    $("conta-email").textContent = emailAtual;
    $("titulo-conta").textContent = emailAtual ? "Minha conta" : modoCriar ? "Criar conta" : "Entrar";
  }

  var modoCriar = false;

  function trocarModo(criar) {
    modoCriar = criar;
    var form = $("form-conta");
    $("btn-conta-enviar").textContent = criar ? "Criar conta" : "Entrar";
    $("conta-trocar-texto").textContent = criar ? "Já tem conta?" : "Ainda não tem conta?";
    $("btn-conta-trocar").textContent = criar ? "Entrar" : "Criar conta";
    form.senha.setAttribute("autocomplete", criar ? "new-password" : "current-password");
    $("conta-dica-senha").hidden = !criar;
    mostrarMensagem("");
    atualizarTela();
  }

  function iniciarTela() {
    var form = $("form-conta");

    $("btn-conta-trocar").addEventListener("click", function () {
      trocarModo(!modoCriar);
      form.email.focus();
    });

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var email = form.email.value.trim();
      var senha = form.senha.value;
      if (!email || !senha) {
        mostrarMensagem("Digite o e-mail e a senha.");
        return;
      }
      var botao = $("btn-conta-enviar");
      var textoBotao = botao.textContent;
      botao.disabled = true;
      botao.textContent = "Aguarde…";
      mostrarMensagem("");

      api(modoCriar ? "criar" : "entrar", "POST", { email: email, senha: senha })
        .then(function (resposta) {
          emailAtual = resposta.email;
          return api("dados").then(function (remoto) {
            var juntos = juntar(remoto);
            return api("dados", "PUT", juntos).then(function () {
              aplicar(juntos, "#inicio");
            });
          });
        })
        .catch(function (e) {
          mostrarMensagem((e && e.erro) || "Sem conexão. Tente de novo.");
          botao.disabled = false;
          botao.textContent = textoBotao;
        });
    });

    $("btn-conta-sair").addEventListener("click", function () {
      var botao = this;
      botao.disabled = true;
      clearTimeout(timerEnvio);
      // Só envia se houver mudança pendente: uma aba desatualizada não pode apagar o que outro aparelho salvou.
      var antes = emailAtual && alterado ? api("dados", "PUT", dadosLocais()).catch(function () {}) : Promise.resolve();
      antes
        .then(function () {
          return api("sair", "POST", {});
        })
        .catch(function () {})
        .then(function () {
          emailAtual = "";
          clearTimeout(timerEnvio);
          timerEnvio = null;
          // Em computador compartilhado, ninguém vê a agenda depois que você sai.
          gravarLocal("agenda", null);
          gravarLocal("plano", null);
          gravarLocal("perfil", null);
          location.hash = "#inicio";
          location.reload();
        });
    });
  }

  /* ---------- Início ---------- */

  function iniciar() {
    if (!$("form-conta")) return;
    iniciarTela();
    trocarModo(false);
    $("btn-conta").hidden = true;

    var recarregou = sessionStorage.getItem(MARCA_RECARGA) === "1";
    sessionStorage.removeItem(MARCA_RECARGA);

    api("eu")
      .then(function (resposta) {
        emailAtual = resposta.email;
        atualizarTela();
        if (recarregou) return;
        return api("dados").then(function (remoto) {
          if (remoto.atualizadoEm) aplicar(remoto);
          else agendarEnvio();
        });
      })
      .catch(function (e) {
        // 401 = ninguém logado. Sem o servidor (ex.: index.html aberto do disco) o botão some.
        if (e && e.status === 401) atualizarTela();
      });

    document.addEventListener("ia-de-estudos:dados-alterados", agendarEnvio);
    window.addEventListener("pagehide", enviarAntesDeSair);
    document.addEventListener("visibilitychange", atualizarDaConta);
  }

  // Ao voltar para a aba, traz o que foi salvo em outro aparelho (se aqui não há nada por enviar).
  function atualizarDaConta() {
    if (document.visibilityState !== "visible" || !emailAtual || alterado || enviando) return;
    api("dados")
      .then(function (remoto) {
        if (remoto.atualizadoEm && !alterado) aplicar(remoto);
      })
      .catch(function () {});
  }

  document.addEventListener("DOMContentLoaded", iniciar);
})();
