// GET /api/conta/eu: diz se há alguém logado neste navegador.
import { json } from "../../_lib/gemini.js";
import { emailDaSessao, naoLogado, semConfiguracao } from "../../_lib/conta.js";

export async function onRequestGet({ request, env }) {
  const erroConfig = semConfiguracao(env);
  if (erroConfig) return erroConfig;
  const email = await emailDaSessao(request, env);
  return email ? json({ email }) : naoLogado();
}
