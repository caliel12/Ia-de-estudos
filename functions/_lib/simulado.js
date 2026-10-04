// Regras compartilhadas dos simulados (/api/gerar-simulado e /api/corrigir-simulado).
import { texto } from "./gemini.js";

export const MAX_QUESTOES = 12;
export const MAX_BYTES_PEDIDO = 100 * 1024;
const MAX_TOPICOS = 20;
const MAX_ALTERNATIVAS = 5;

export function tipoDeSimulado(valor) {
  return valor === "final" ? "final" : "topico";
}

export function pedidoGrandeDemais(request) {
  return Number(request.headers.get("Content-Length")) > MAX_BYTES_PEDIDO;
}

export function validarTopicos(lista) {
  return (Array.isArray(lista) ? lista : [])
    .slice(0, MAX_TOPICOS)
    .map((t) => ({ titulo: texto(t && t.titulo, 120), resumo: texto(t && t.resumo, 1500) }))
    .filter((t) => t.titulo);
}

export function validarLista(lista, maximo, limite) {
  return (Array.isArray(lista) ? lista : [])
    .slice(0, maximo)
    .map((v) => texto(v, limite))
    .filter(Boolean);
}

// Mantém só questões bem formadas: múltipla escolha com 2 a 5 alternativas e gabarito válido, ou discursiva.
export function normalizarQuestoes(lista) {
  return (Array.isArray(lista) ? lista : [])
    .slice(0, MAX_QUESTOES)
    .map((q) => {
      const base = {
        tipo: q && q.tipo === "discursiva" ? "discursiva" : "multipla",
        topico: texto(q && q.topico, 120),
        enunciado: texto(q && q.enunciado, 800),
      };
      if (base.tipo === "discursiva") {
        return { ...base, respostaEsperada: texto(q.respostaEsperada, 1200) };
      }
      const alternativas = (Array.isArray(q && q.alternativas) ? q.alternativas : [])
        .slice(0, MAX_ALTERNATIVAS)
        .map((a) => texto(a, 300));
      const correta = Number(q && q.correta);
      if (alternativas.length < 2 || alternativas.some((a) => !a)) return null;
      if (!Number.isInteger(correta) || correta < 0 || correta >= alternativas.length) return null;
      return { ...base, alternativas, correta, explicacao: texto(q.explicacao, 800) };
    })
    .filter((q) => q && q.enunciado);
}
