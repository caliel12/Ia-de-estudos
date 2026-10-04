// Contas de usuário: senhas com PBKDF2, sessões por cookie e dados salvos no KV (binding CONTAS).
import { json } from "./gemini.js";

const ITERACOES = 100000;
const DURACAO_SESSAO = 60 * 60 * 24 * 30;
const MAX_TENTATIVAS = 10;
const JANELA_TENTATIVAS = 15 * 60;
const COOKIE = "sessao";
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export const SENHA_MIN = 6;
export const SENHA_MAX = 200;

export function semConfiguracao(env) {
  return env.CONTAS ? null : json({ erro: "As contas não estão configuradas no servidor." }, 503);
}

export function normalizarEmail(valor) {
  const email = typeof valor === "string" ? valor.trim().toLowerCase() : "";
  return email.length <= 254 && EMAIL.test(email) ? email : "";
}

// Só aceita JSON: formulários de outros sites não conseguem enviar esse tipo sem permissão (CORS).
export async function lerJSON(request) {
  if (!(request.headers.get("Content-Type") || "").includes("application/json")) return null;
  try {
    return await request.json();
  } catch (e) {
    return null;
  }
}

function paraHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function deHex(hex) {
  return new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));
}

function aleatorioHex(bytes) {
  return paraHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256(texto) {
  return paraHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)));
}

async function derivar(senha, salHex, iteracoes) {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: deHex(salHex), iterations: iteracoes },
    chave,
    256
  );
  return paraHex(bits);
}

function iguais(a, b) {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

export async function criarSenha(senha) {
  const sal = aleatorioHex(16);
  return { sal, iteracoes: ITERACOES, hash: await derivar(senha, sal, ITERACOES) };
}

export async function conferirSenha(senha, usuario) {
  return iguais(await derivar(senha, usuario.sal, usuario.iteracoes), usuario.hash);
}

export async function lerUsuario(env, email) {
  return env.CONTAS.get("usuario:" + email, "json");
}

export async function salvarUsuario(env, email, usuario) {
  await env.CONTAS.put("usuario:" + email, JSON.stringify(usuario));
}

/* ---------- Limite de tentativas ---------- */

export async function bloqueado(env, chave) {
  const n = Number(await env.CONTAS.get("tentativas:" + chave)) || 0;
  return n >= MAX_TENTATIVAS;
}

export async function registrarTentativa(env, chave) {
  const n = Number(await env.CONTAS.get("tentativas:" + chave)) || 0;
  await env.CONTAS.put("tentativas:" + chave, String(n + 1), { expirationTtl: JANELA_TENTATIVAS });
}

export async function limparTentativas(env, chave) {
  await env.CONTAS.delete("tentativas:" + chave);
}

/* ---------- Sessões ---------- */

function lerCookie(request) {
  const cabecalho = request.headers.get("Cookie") || "";
  const par = cabecalho.split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
  const valor = par ? par.slice(COOKIE.length + 1) : "";
  return /^[0-9a-f]{64}$/.test(valor) ? valor : "";
}

function cookie(valor, maxAge) {
  return `${COOKIE}=${valor}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

// No KV fica só o hash do token: quem ler o banco não consegue usar as sessões.
export async function iniciarSessao(env, email, corpo) {
  const token = aleatorioHex(32);
  await env.CONTAS.put("sessao:" + (await sha256(token)), email, { expirationTtl: DURACAO_SESSAO });
  const resposta = json(corpo);
  resposta.headers.append("Set-Cookie", cookie(token, DURACAO_SESSAO));
  return resposta;
}

export async function emailDaSessao(request, env) {
  const token = lerCookie(request);
  if (!token) return "";
  return (await env.CONTAS.get("sessao:" + (await sha256(token)))) || "";
}

export async function encerrarSessao(request, env) {
  const token = lerCookie(request);
  if (token) await env.CONTAS.delete("sessao:" + (await sha256(token)));
  const resposta = json({ ok: true });
  resposta.headers.append("Set-Cookie", cookie("", 0));
  return resposta;
}

export function naoLogado() {
  return json({ erro: "Você não entrou na sua conta." }, 401);
}
