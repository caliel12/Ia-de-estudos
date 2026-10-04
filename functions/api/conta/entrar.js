// POST /api/conta/entrar  { email, senha }
import { json } from "../../_lib/gemini.js";
import {
  SENHA_MAX, bloqueado, conferirSenha, iniciarSessao, lerJSON, lerUsuario,
  limparTentativas, normalizarEmail, registrarTentativa, semConfiguracao,
} from "../../_lib/conta.js";

const ERRO = "E-mail ou senha errados.";

export async function onRequestPost({ request, env }) {
  const erroConfig = semConfiguracao(env);
  if (erroConfig) return erroConfig;

  const dados = await lerJSON(request);
  const email = normalizarEmail(dados && dados.email);
  const senha = typeof (dados && dados.senha) === "string" ? dados.senha.slice(0, SENHA_MAX) : "";
  if (!email || !senha) return json({ erro: "Digite o e-mail e a senha." }, 400);

  // Por e-mail e IP: alguém de fora errando a senha não tranca a conta do dono.
  const chave = "entrar:" + email + ":" + (request.headers.get("CF-Connecting-IP") || "local");
  if (await bloqueado(env, chave)) return json({ erro: "Muitas tentativas. Espere 15 minutos e tente de novo." }, 429);

  const usuario = await lerUsuario(env, email);
  if (!usuario || !(await conferirSenha(senha, usuario))) {
    await registrarTentativa(env, chave);
    return json({ erro: ERRO }, 401);
  }

  await limparTentativas(env, chave);
  return iniciarSessao(env, email, { email });
}
