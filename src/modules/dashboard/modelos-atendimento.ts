// src/modules/dashboard/modelos-atendimento.ts
// Modelos (templates) aprovados na Meta que a tela de Conversas oferece quando
// a janela de 24 h do número da Eva está FECHADA (Atendimento Parte 2).
//
// A lista sai do que a plataforma JÁ usa hoje (cadência, abordagem da
// proposta, pós-venda) — nada de modelo novo aqui. Só entram os que têm UMA
// variável, {{1}} = primeiro nome do cliente: a tela preenche, a pessoa pode
// corrigir, e a prévia mostra o texto antes de enviar. Modelos com link/botão
// (relatório da usina, pasta digital) ficam nos fluxos deles.
//
// O texto e a categoria de verdade estão na Meta. Quando a Meta responde
// (listTemplates), vale o que está lá (só APROVADOS em pt_BR); quando não
// responde, vale a cópia local abaixo — marcada como "não conferida".

import { TEXTOS_PREVIA } from './pos-venda-envio.js';

export type CategoriaModelo = 'marketing' | 'utilidade' | 'desconhecida';

export interface ModeloAtendimento {
  nome: string;
  rotulo: string;
  categoria: CategoriaModelo;
  /** Texto com {nome} no lugar de {{1}}. null = só a Meta sabe o texto. */
  texto: string | null;
  /** true = confirmado agora na Meta (aprovado). */
  conferido: boolean;
}

// Cópia do corpo aprovado de eva_proposta_aberta_v1 (mesmo texto de proposal-followup.ts).
const TEXTO_PROPOSTA_ABERTA =
  'Oi, {nome}! 😊 Aqui é a Eva, consultora da EcoSunPower (trabalho com o Junior). ' +
  'Vi que você abriu a proposta de energia solar que recebeu — posso te ajudar a entender ' +
  'os números e tirar suas dúvidas? Se quiser, comparo as opções com você por aqui. ' +
  '👉 Salva meu contato que eu fico à disposição pra te ajudar!';

/** A ordem aqui é a ordem na tela. */
export const CATALOGO_MODELOS: ReadonlyArray<Omit<ModeloAtendimento, 'conferido'>> = Object.freeze([
  { nome: 'reativacao_lead_v1', rotulo: 'Retomar a conversa', categoria: 'desconhecida', texto: null },
  { nome: 'eva_proposta_aberta_v1', rotulo: 'Ajudar com a proposta', categoria: 'desconhecida', texto: TEXTO_PROPOSTA_ABERTA },
  { nome: 'lembrete_manutencao', rotulo: 'Lembrete de limpeza / manutenção', categoria: 'desconhecida', texto: TEXTOS_PREVIA.limpeza },
  { nome: 'upgrade_ampliacao', rotulo: 'Ampliar o sistema', categoria: 'desconhecida', texto: TEXTOS_PREVIA.upgrade },
  { nome: 'pedido_depoimento', rotulo: 'Pedir depoimento', categoria: 'desconhecida', texto: TEXTOS_PREVIA.depoimento },
  { nome: 'eva_curiosidade_v1', rotulo: 'Primeiro contato (curiosidade)', categoria: 'desconhecida', texto: null },
  { nome: '_eva_qualificacao_v1', rotulo: 'Primeiro contato (qualificação)', categoria: 'desconhecida', texto: null },
  { nome: 'eva_provocativa_v1', rotulo: 'Última tentativa', categoria: 'desconhecida', texto: null },
]);

/** Um modelo como a Meta devolve em listTemplates (campos que usamos). */
export interface ModeloDaMeta {
  name: string;
  status: string;
  language: string;
  category?: string;
  components?: Array<{ type?: string; text?: string }>;
}

function categoriaDaMeta(c: string | undefined): CategoriaModelo {
  const u = (c ?? '').toUpperCase();
  if (u === 'MARKETING') return 'marketing';
  if (u === 'UTILITY' || u === 'AUTHENTICATION') return 'utilidade';
  return 'desconhecida';
}

/** Corpo da Meta com {{1}} → {nome}. Mais de uma variável → null (não serve para a tela). */
export function corpoDaMeta(m: ModeloDaMeta): string | null | undefined {
  const body = (m.components ?? []).find((c) => String(c.type ?? '').toUpperCase() === 'BODY');
  if (!body?.text) return undefined;
  const vars = new Set([...body.text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((x) => x[1]));
  if ([...vars].some((v) => v !== '1')) return null;
  return body.text.replace(/\{\{\s*1\s*\}\}/g, '{nome}');
}

/**
 * Catálogo da tela. Com a lista da Meta: só os APROVADOS em pt_BR, com texto e
 * categoria de lá (e sai quem pede mais de 1 variável). Sem a lista: cópia local.
 */
export function modelosDaTela(daMeta: ModeloDaMeta[] | null): ModeloAtendimento[] {
  if (!daMeta) return CATALOGO_MODELOS.map((m) => ({ ...m, conferido: false }));
  const out: ModeloAtendimento[] = [];
  for (const m of CATALOGO_MODELOS) {
    const meta = daMeta.find((x) => x.name === m.nome && /^pt_BR$/i.test(x.language) && String(x.status).toUpperCase() === 'APPROVED');
    if (!meta) continue;
    const corpo = corpoDaMeta(meta);
    if (corpo === null) continue;
    out.push({ ...m, texto: corpo ?? m.texto, categoria: categoriaDaMeta(meta.category), conferido: true });
  }
  return out;
}

/** Primeiro nome para o {{1}} (a Meta recusa parâmetro com quebra de linha ou tab). */
export function parametroNome(bruto: string | null | undefined): string {
  const limpo = String(bruto ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 60);
  return limpo || 'tudo bem';
}

/** Texto que o cliente vai ler (prévia e histórico). */
export function previaDoModelo(m: Pick<ModeloAtendimento, 'nome' | 'texto'>, nome: string): string {
  const n = parametroNome(nome);
  return m.texto ? m.texto.replace(/\{nome\}/g, n) : `[modelo ${m.nome} · nome: ${n}]`;
}
