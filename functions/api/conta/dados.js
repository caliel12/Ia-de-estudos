// GET/PUT /api/conta/dados: agenda e plano de estudos guardados na conta.
import { json } from "../../_lib/gemini.js";
import { emailDaSessao, lerJSON, naoLogado, semConfiguracao } from "../../_lib/conta.js";

const MAX_BYTES = 1024 * 1024;
const MAX_ITENS_AGENDA = 1000;

async function logado(request, env) {
  const erroConfig = semConfiguracao(env);
  if (erroConfig) return { resposta: erroConfig };
  const email = await emailDaSessao(request, env);
  return email ? { email } : { resposta: naoLogado() };
}

export async function onRequestGet({ request, env }) {
  const { email, resposta } = await logado(request, env);
  if (resposta) return resposta;
  const dados = await env.CONTAS.get("dados:" + email, "json");
  return json(dados || { agenda: null, plano: null, perfil: null, atualizadoEm: null });
}

export async function onRequestPut({ request, env }) {
  const { email, resposta } = await logado(request, env);
  if (resposta) return resposta;

  if (Number(request.headers.get("Content-Length")) > MAX_BYTES) return json({ erro: "Dados grandes demais." }, 413);
  const dados = await lerJSON(request);
  if (!dados) return json({ erro: "Dados inválidos." }, 400);

  const agenda = Array.isArray(dados.agenda) ? dados.agenda.slice(0, MAX_ITENS_AGENDA) : [];
  const plano = dados.plano && typeof dados.plano === "object" && !Array.isArray(dados.plano) ? dados.plano : null;
  const idade = Math.round(Number(dados.perfil && dados.perfil.idade));
  const perfil = idade >= 5 && idade <= 99 ? { idade } : null;
  const atualizadoEm = new Date().toISOString();
  const valor = JSON.stringify({ agenda, plano, perfil, atualizadoEm });
  if (valor.length > MAX_BYTES) return json({ erro: "Dados grandes demais." }, 413);

  await env.CONTAS.put("dados:" + email, valor);
  return json({ ok: true, atualizadoEm });
}
