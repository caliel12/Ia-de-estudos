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

function chave(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// O modelo às vezes devolve "Título: resumo" no campo topico. Troca pelo título da lista que combina
// (igual, prefixo ou inclusão, sem maiúsculas e acentos; o mais longo vence) ou "" se nenhum combina.
export function casarTopico(valor, titulos) {
  const v = chave(valor);
  if (!v) return "";
  let melhor = "";
  let tamanho = 0;
  for (const titulo of titulos) {
    const k = chave(titulo);
    if (!k) continue;
    if (v === k) return titulo;
    const combina = v.startsWith(k) || v.includes(k) || (v.length >= 4 && k.includes(v));
    if (combina && k.length > tamanho) {
      melhor = titulo;
      tamanho = k.length;
    }
  }
  return melhor;
}

// Mantém só questões bem formadas: múltipla escolha com 2 a 5 alternativas e gabarito válido, ou discursiva.
// Com `titulos`, o topico de cada questão vira o título correspondente da lista.
export function normalizarQuestoes(lista, titulos) {
  return (Array.isArray(lista) ? lista : [])
    .slice(0, MAX_QUESTOES)
    .map((q) => {
      const base = {
        tipo: q && q.tipo === "discursiva" ? "discursiva" : "multipla",
        topico: titulos ? casarTopico(q && q.topico, titulos) : texto(q && q.topico, 120),
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
