import type { Argumento } from './followup-vivo-plano.js';
import { primeiroNome } from '../template-inicial.js';
import { parcelaCartaoSolar } from '../proposal/cartao-solar.js';

// Formato REAL de propostas_publicas.dados_input (camelCase) — a proposta salva
// `...data` (ProposalData) + `investimento.total` derivado (ver
// src/modules/proposal/dados-input.ts e src/modules/closing/closing-data-fetcher.ts:56-77).
// NÃO existe valorTotal/parcela18x prontos no dados_input; economiaMensal só existe
// se a proposal-assistant persistiu calc.economiaMensal (ver proposal-assistant.ts).
// Números às vezes chegam como string (JSON legado) — por isso a coerção em num().
export interface PropostaParaMensagem {
  cliente_nome: string; slug: string; created_at: string;
  dados_input: {
    potenciaKwp?: number | string;
    valorTotalRs?: number | string;
    investimento?: { total?: number | string };
    enderecoCliente?: string; // resumido (cidade-UF) — não existe campo de cidade isolado
    economiaMensal?: number | string;
    [key: string]: unknown;
  } | null;
}
export interface ContextoMensagem { linkProposta: string; validadeKitDias: number; agoraMs: number }
export interface Fatos {
  primeiroNome: string; link: string;
  economiaMensal: number | null; valorTotal: number | null; potenciaKwp: number | null;
  parcela18x: number | null; cidade: string | null; diasRestantesValidade: number;
}
export interface CasoSimilar { titulo: string; cidade: string; kwp?: number; fotoUrl?: string }

// Coerce string numéricas (JSON legado) e descarta zero/negativo — nunca aparece
// "economia de R$ 0" ou "parcela de R$ -50" numa mensagem.
function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}
export const brl = (v: number) =>
  // toLocaleString('pt-BR') separa "R$" do número com NBSP (U+00A0); troca por
  // espaço comum pra bater com o texto que a IA escreve e com os testes.
  ('R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })).replace(/ /g, ' ');

export function montarFatos(p: PropostaParaMensagem, ctx: ContextoMensagem): Fatos {
  const d = p.dados_input ?? {};
  // investimento.total é o valor COM serviços extras (o que o cliente vê na proposta —
  // proposal-assistant.ts:2042-2063); valorTotalRs é só o kit. Preferir sempre o total
  // com serviços, senão a mensagem cotaria um valor menor do que o cliente já viu.
  const valorTotal = num(d.investimento?.total) ?? num(d.valorTotalRs);
  // Mesma tabela que a proposta renderiza (18x Sol Fácil), arredondada como no PDF
  // (fmtRs(Math.round(parcela)), proposal-assistant.ts ~2279) — nunca reinventar a conta.
  const parcelaBruta = valorTotal != null ? parcelaCartaoSolar(valorTotal, 18, 'solfacil')?.parcela ?? null : null;
  const parcela18x = parcelaBruta != null ? Math.round(parcelaBruta) : null;
  const diasDesde = Math.floor((ctx.agoraMs - Date.parse(p.created_at)) / 86_400_000);
  return {
    primeiroNome: primeiroNome(p.cliente_nome),
    link: ctx.linkProposta,
    economiaMensal: num(d.economiaMensal),
    valorTotal,
    potenciaKwp: num(d.potenciaKwp),
    parcela18x,
    cidade: typeof d.enderecoCliente === 'string' ? d.enderecoCliente : null,
    // Validade contada a partir do created_at da proposta — aproximação de "data
    // da cotação" (spec §6 D+12); não existe um carimbo de "cotação enviada" à parte.
    diasRestantesValidade: Math.max(0, ctx.validadeKitDias - diasDesde),
  };
}

const REGRAS = `Você é a Eva, consultora da EcoSunPower (Brasília/Goiás), escrevendo no WhatsApp.
Regras inegociáveis: NÃO invente números — use só os fatos abaixo, exatamente como estão; NUNCA ofereça desconto, brinde ou condição nova;
máximo 4 linhas, sem emoji em excesso (no máximo 1), tom de gente, sem "Prezado", sem assinatura. Termine com UMA pergunta simples.`;

function fatosTexto(f: Fatos): string {
  const l = [`Nome do cliente: ${f.primeiroNome}`, `Link da proposta: ${f.link}`];
  if (f.potenciaKwp) l.push(`Sistema: ${f.potenciaKwp.toLocaleString('pt-BR')} kWp`);
  if (f.valorTotal) l.push(`Investimento: ${brl(f.valorTotal)}`);
  if (f.economiaMensal) l.push(`Economia estimada: ${brl(f.economiaMensal)} por mês`);
  if (f.parcela18x) l.push(`Parcela em 18x no cartão: ${brl(f.parcela18x)}`);
  l.push(`Validade do preço do kit: ${f.diasRestantesValidade} dias`);
  return l.join('\n');
}

const OBJETIVO: Record<Argumento, string> = {
  resumo: 'Apresentar a proposta em 3 linhas e convidar a abrir o link.',
  duvida_ab: 'O cliente abriu a proposta e não respondeu. Perguntar se ficou dúvida na opção A ou B.',
  reenvio_audio: 'O cliente não abriu em 24 h. Reenviar o link de forma curta e oferecer explicar por áudio em 1 minuto.',
  economia: 'Mostrar a economia mensal concreta (a conta de luz praticamente some) e perguntar se faz sentido.',
  financiamento: 'Mostrar que cabe no bolso: citar a parcela em 18x exatamente como nos fatos.',
  prova_social: 'Contar de uma obra parecida na região (dados do caso abaixo) e perguntar se quer ver mais fotos.',
  validade: 'Avisar com leveza que o preço do kit tem validade (dias restantes nos fatos) e perguntar se quer garantir.',
  toque_leve: 'Toque leve e educado: perguntar se ainda faz sentido pensar em energia solar agora; sem pressão.',
  pos_visita: 'O Junior esteve no imóvel ontem. Perguntar se ficou alguma dúvida depois da visita e se pode ajudar com algo.',
};

export function montarPromptEtapa(argumento: Argumento, f: Fatos, caso: CasoSimilar | null) {
  let efetivo: Argumento = argumento;
  if (argumento === 'economia' && !f.economiaMensal) efetivo = 'toque_leve';
  if (argumento === 'financiamento' && !f.parcela18x) efetivo = 'toque_leve';
  if (argumento === 'prova_social' && !caso) efetivo = 'toque_leve';
  if (argumento === 'validade' && f.diasRestantesValidade === 0) efetivo = 'toque_leve';
  const casoTxt = caso ? `\nCaso parecido: ${caso.titulo} em ${caso.cidade}${caso.kwp ? ` (${caso.kwp} kWp)` : ''}` : '';
  const prompt = `${REGRAS}\n\nOBJETIVO DESTA MENSAGEM: ${OBJETIVO[efetivo]}\n\nFATOS (use apenas estes):\n${fatosTexto(f)}${casoTxt}\n\nEscreva só a mensagem.`;
  return { prompt, argumentoEfetivo: efetivo, fotoUrl: efetivo === 'prova_social' ? caso?.fotoUrl ?? null : null };
}

export type RedatorIA = (prompt: string) => Promise<string>;

export async function gerarMensagemEtapa(argumento: Argumento, f: Fatos, caso: CasoSimilar | null, ia: RedatorIA) {
  const { prompt, argumentoEfetivo, fotoUrl } = montarPromptEtapa(argumento, f, caso);
  try {
    const texto = (await ia(prompt)).trim();
    if (texto.length >= 10) return { texto, argumentoEfetivo, fotoUrl };
  } catch (err) {
    console.warn('[followup-vivo] IA falhou, usando fallback:', (err as Error).message);
  }
  return {
    texto: `Oi ${f.primeiroNome}, tudo bem? Passando pra saber se ainda faz sentido conversar sobre a proposta: ${f.link}\nPosso te ajudar com alguma dúvida?`,
    argumentoEfetivo, fotoUrl,
  };
}
