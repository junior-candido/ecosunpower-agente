import type { Argumento } from './followup-vivo-plano.js';
import { primeiroNome } from '../template-inicial.js';

export interface PropostaParaMensagem {
  cliente_nome: string; slug: string; created_at: string;
  dados_input: Record<string, unknown> | null;
}
export interface ContextoMensagem { linkProposta: string; validadeKitDias: number; agoraMs: number }
export interface Fatos {
  primeiroNome: string; link: string;
  economiaMensal: number | null; valorTotal: number | null; potenciaKwp: number | null;
  parcela18x: number | null; cidade: string | null; diasRestantesValidade: number;
}
export interface CasoSimilar { titulo: string; cidade: string; kwp?: number; fotoUrl?: string }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const brl = (v: number) =>
  ('R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })).replace(/ /g, ' ');

export function montarFatos(p: PropostaParaMensagem, ctx: ContextoMensagem): Fatos {
  const d = p.dados_input ?? {};
  const diasDesde = Math.floor((ctx.agoraMs - Date.parse(p.created_at)) / 86_400_000);
  return {
    primeiroNome: primeiroNome(p.cliente_nome),
    link: ctx.linkProposta,
    economiaMensal: num(d.economiaMensal), valorTotal: num(d.valorTotal),
    potenciaKwp: num(d.potenciaKwp), parcela18x: num(d.parcela18x),
    cidade: typeof d.cidade === 'string' ? d.cidade : null,
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
