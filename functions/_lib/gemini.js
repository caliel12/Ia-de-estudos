// Chamada compartilhada ao Google Gemini (Interactions API), usada pelas funções em /api.

const MODELO_PADRAO = "gemini-3.8-flash";
// Usados em sequência quando o modelo anterior está sobrecarregado (503) ou sem cota (429).
const MODELOS_RESERVA = ["gemini-3.5-flash", "gemini-3.5-flash-lite"];
const STATUS_TENTAR_OUTRO = new Set([429, 503]);
const URL_GEMINI = "https://generativelanguage.googleapis.com/v1beta/interactions";

export function json(corpo, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export function texto(valor, limite) {
  return typeof valor === "string" ? valor.slice(0, limite).trim() : "";
}

function listarModelos(env) {
  return [...new Set([env.GEMINI_MODEL || MODELO_PADRAO, ...MODELOS_RESERVA])];
}

function extrairTexto(interacao) {
  const passos = (interacao && interacao.steps) || [];
  for (let i = passos.length - 1; i >= 0; i--) {
    const partes = (passos[i].content || []).filter((c) => c.type === "text" && c.text);
    if (partes.length > 0) return partes.map((c) => c.text).join("");
  }
  return "";
}

// Devolve { texto } com a resposta do modelo, ou { erro } com a Response de erro para o navegador.
export async function chamarGemini(env, corpo) {
  if (!env.GEMINI_API_KEY) {
    return { erro: json({ erro: "A IA não está configurada no servidor." }, 503) };
  }

  let resposta;
  for (const modelo of listarModelos(env)) {
    try {
      resposta = await fetch(env.GEMINI_API_URL || URL_GEMINI, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({ model: modelo, store: false, ...corpo }),
      });
    } catch (e) {
      return { erro: json({ erro: "Não foi possível falar com a IA." }, 502) };
    }
    if (resposta.ok) break;
    console.error("Erro do Gemini", modelo, resposta.status, (await resposta.text()).slice(0, 500));
    if (!STATUS_TENTAR_OUTRO.has(resposta.status)) break;
  }

  if (!resposta.ok) {
    if (resposta.status === 429) {
      return { erro: json({ erro: "Limite gratuito da IA atingido. Tente de novo em alguns minutos." }, 429) };
    }
    if (resposta.status === 503) {
      return { erro: json({ erro: "A IA está sobrecarregada agora. Tente de novo em alguns minutos." }, 503) };
    }
    return { erro: json({ erro: "A IA não conseguiu responder agora." }, 502) };
  }

  const resultado = extrairTexto(await resposta.json().catch(() => null));
  if (!resultado) return { erro: json({ erro: "A IA devolveu uma resposta inesperada." }, 502) };
  return { texto: resultado };
}
