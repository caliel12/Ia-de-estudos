// POST /api/conta/criar  { email, senha }
import { json } from "../../_lib/gemini.js";
import {
  SENHA_MAX, SENHA_MIN, bloqueado, criarSenha, iniciarSessao, lerJSON, lerUsuario,
  normalizarEmail, registrarTentativa, salvarUsuario, semConfiguracao,
} from "../../_lib/conta.js";

export async function onRequestPost({ request, env }) {
  const erroConfig = semConfiguracao(env);
  if (erroConfig) return erroConfig;

  const dados = await lerJSON(request);
  const email = normalizarEmail(dados && dados.email);
  const senha = typeof (dados && dados.senha) === "string" ? dados.senha : "";
  if (!email) return json({ erro: "Digite um e-mail válido." }, 400);
  if (senha.length < SENHA_MIN) return json({ erro: `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.` }, 400);
  if (senha.length > SENHA_MAX) return json({ erro: "Senha longa demais." }, 400);

  const ip = "criar:" + (request.headers.get("CF-Connecting-IP") || "local");
  if (await bloqueado(env, ip)) return json({ erro: "Muitas contas criadas daqui. Tente de novo mais tarde." }, 429);

  if (await lerUsuario(env, email)) return json({ erro: "Já existe uma conta com esse e-mail. Use “Entrar”." }, 409);

  await salvarUsuario(env, email, { ...(await criarSenha(senha)), criadoEm: new Date().toISOString() });
  await registrarTentativa(env, ip);
  return iniciarSessao(env, email, { email, nova: true });
}
