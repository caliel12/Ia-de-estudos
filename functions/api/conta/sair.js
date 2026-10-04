// POST /api/conta/sair
import { encerrarSessao, semConfiguracao } from "../../_lib/conta.js";

export async function onRequestPost({ request, env }) {
  return semConfiguracao(env) || encerrarSessao(request, env);
}
