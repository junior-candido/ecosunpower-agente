// Envio do relatório mensal da usina (fatia 3) — peças PURAS: token do link
// público, o link, os textos do WhatsApp (o corpo do modelo Meta
// "relatorio_usina_v1" é EXATAMENTE textoTemplateRelatorio) e formatações.
// Ver docs/whatsapp-templates/relatorio_usina_v1.md.

import { randomBytes } from 'node:crypto';
import { nomeTituloCase } from '../empresa-config.js';

export const TEMPLATE_RELATORIO = 'relatorio_usina_v1';

/** 24 bytes aleatórios em base64url = 32 caracteres. Impossível de adivinhar. */
const RE_TOKEN = /^[A-Za-z0-9_-]{32}$/;

/** Mesma base da Pasta Digital (propostas.<domínio>). */
export function basePublica(): string {
  return (process.env.PROPOSAL_PUBLIC_BASE_URL ?? 'https://propostas.ecosunpower.eng.br').replace(/\/+$/, '');
}

export function gerarTokenRelatorio(): string {
  return randomBytes(24).toString('base64url');
}

/** Tira pontuação que o WhatsApp/e-mail cola no fim do link; só aceita o formato exato. */
export function normalizarTokenRelatorio(raw: unknown): string | null {
  const s = String(raw ?? '').trim().replace(/[.,;:!?)\]}>'"]+$/, '');
  return RE_TOKEN.test(s) ? s : null;
}

/** /rg/ porque /r/:slug já é o relatório de acompanhamento da usina (index.ts). */
export function linkPublicoRelatorio(base: string, token: string): string {
  return `${base.replace(/\/+$/, '')}/rg/${token}`;
}

/** Primeiro nome em Title Case: a conta de luz traz "JOÃO DA SILVA" → "João". */
export function primeiroNome(nome: string | null | undefined): string {
  const p = String(nome ?? '').trim().split(/\s+/)[0] ?? '';
  return p ? nomeTituloCase(p) : 'cliente';
}

/** O corpo do modelo aprovado na Meta, com {{1}} = nome e {{2}} = mês por extenso. */
export function textoTemplateRelatorio(nome: string, mesExtenso: string): string {
  return `Olá, ${nome}! ☀️ O relatório de ${mesExtenso} da sua usina solar está pronto: quanto ela gerou, quanto você economizou e seus créditos.`;
}

/** Mensagem comum (sem modelo): mesmo texto + o link escrito. */
export function textoLivreRelatorio(nome: string, mesExtenso: string, link: string): string {
  return `${textoTemplateRelatorio(nome, mesExtenso)}\n\nVer meu relatório: ${link}`;
}

export interface ComponenteTemplate {
  type: 'body' | 'button';
  sub_type?: 'url';
  index?: number;
  parameters: Array<{ type: 'text'; text: string }>;
}

export function componentesTemplateRelatorio(nome: string, mesExtenso: string, token: string): ComponenteTemplate[] {
  return [
    { type: 'body', parameters: [{ type: 'text', text: nome }, { type: 'text', text: mesExtenso }] },
    { type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: token }] },
  ];
}

export function nomeArquivoRelatorio(instalacao: string, referencia: string): string {
  return `relatorio-${instalacao}-${referencia.slice(0, 7)}.pdf`;
}

/** 'DD/MM HH:mm' no horário de Brasília (UTC-3), independente do fuso do servidor. Data vazia/inválida → '—'. */
export function dataHoraBrasilia(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
