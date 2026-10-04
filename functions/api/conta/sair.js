// POST /api/conta/sair
import { json } from "../../_lib/gemini.js";
import { encerrarSessao, outraOrigem, semConfiguracao } from "../../_lib/conta.js";

export async function onRequestPost({ request, env }) {
  if (outraOrigem(request)) return json({ erro: "Pedido recusado." }, 403);
  return semConfiguracao(env) || encerrarSessao(request, env);
}
