// src/modules/closing/escapar-dados.ts
//
// 🔒 Blindagem do documento. Os templates (contrato/procuração) montam HTML
// interpolando os dados em ~78 lugares. Escapar um por um é receita pra esquecer
// um — então a blindagem é feita na PORTA: os dados entram escapados, e aí tanto
// faz onde o template usa.
//
// Por que isso importa: o nome do lead vem do PERFIL DO WHATSAPP (quem manda
// mensagem escolhe o próprio nome), da IA que lê a CNH e do formulário do Meta.
// Nada disso é confiável. Enquanto o HTML só virava PDF, um script ali não fazia
// nada. Mas a PRÉVIA mostra o documento dentro do painel — e aí um `<img onerror>`
// no nome rodaria dentro da sessão logada do operador.
import type { DadosFechamento } from './types.js';

export function escapeTextoDoc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escapa TODO texto do objeto, fundo a fundo. Números e booleanos passam batido. */
function escaparFundo(v: unknown): unknown {
  if (typeof v === 'string') return escapeTextoDoc(v);
  if (Array.isArray(v)) return v.map(escaparFundo);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = escaparFundo(val);
    return out;
  }
  return v;
}

/** Os dados do fechamento, prontos pra virar HTML sem levar código junto. */
export function escaparDadosFechamento(dados: DadosFechamento): DadosFechamento {
  return escaparFundo(dados) as DadosFechamento;
}
