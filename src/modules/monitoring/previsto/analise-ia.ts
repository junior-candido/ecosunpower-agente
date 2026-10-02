// "ANALISAR USINA COM IA" (Energy Studio — 02/10/2026).
// Junta o dossiê da usina (30 dias previsto × real, clima, diagnóstico por
// regra, calibração, rede, alerta) e pede à IA hipóteses COM EVIDÊNCIA e como
// confirmar no local. Regra de ouro: separar medido, calculado e inferido —
// a IA nunca afirma defeito e nunca inventa número que não está no dossiê.
import type Anthropic from '@anthropic-ai/sdk';
import { medirIa } from '../../custos/ia-metering.js';
import type { Clima } from './situacao.js';
import type { Hipotese } from './diagnostico.js';

export const MODELO_ANALISE = 'claude-opus-5-5';
export const TIPOS_OS = ['limpeza', 'revisao_inversor', 'revisao_eletrica', 'corretiva', 'inspecao'] as const;
export type TipoOsIa = typeof TIPOS_OS[number];

export interface DossieUsina {
  nome: string;
  kwp: number | null;
  local: string;
  marca: string | null;
  premissas: Record<string, unknown> | null;
  dias: Array<{ data: string; previsto: number; real: number | null; clima: Clima; indiceCeu: number | null }>;
  regras: Hipotese[];
  calibracao: { azimute: number; inclinacao: number; fator: number | null; confianca: string } | null;
  rede: Array<{ dia: string; vMin: number | null; vMax: number | null; desarmes: number; nivel: string }>;
  alertaAberto: string | null;
}

export interface HipoteseIa {
  titulo: string;
  chance: 'alta' | 'media' | 'baixa';
  evidencias: string[];
  comoConfirmar: string;
  tipoOs: TipoOsIa | null;
}
export interface AnaliseIa {
  resumo: string;
  hipoteses: HipoteseIa[];
  proximoPasso: string;
  faltaDado: string[];
}

const n1 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : (Math.round(v * 10) / 10).toString());

/** Texto compacto (e determinístico) que vai para a IA — testável. */
export function montarDossie(d: DossieUsina): string {
  const linhas = d.dias.map((x) => {
    const pct = x.real != null && x.previsto > 0 ? `${Math.round((x.real / x.previsto - 1) * 100)}%` : '—';
    return `${x.data} | prev ${n1(x.previsto)} | real ${n1(x.real)} | ${pct} | ${x.clima} | céu ${x.indiceCeu == null ? '—' : x.indiceCeu.toFixed(2)}`;
  });
  const prem = d.premissas ? Object.entries(d.premissas)
    .filter(([, v]) => v != null && typeof v !== 'object').map(([k, v]) => `${k}=${String(v)}`).join(', ') : '';
  return [
    `USINA: ${d.nome} · ${d.kwp ?? '?'} kWp · ${d.local || 'local não informado'} · inversor ${d.marca ?? '?'}`,
    prem ? `PREMISSAS DO CÁLCULO (cadastro/estimadas): ${prem}` : 'PREMISSAS: não informadas',
    d.calibracao
      ? `CALIBRAÇÃO PELA CURVA REAL: azimute ${d.calibracao.azimute}°, inclinação ${d.calibracao.inclinacao}°, fator ${n1(d.calibracao.fator)}, confiança ${d.calibracao.confianca}`
      : 'CALIBRAÇÃO: ainda não calibrada',
    `ALERTA ABERTO: ${d.alertaAberto ?? 'nenhum'}`,
    '',
    'DIAS (kWh) — data | previsto (calculado) | real (medido) | diferença | clima | índice de céu (1 = limpo):',
    ...(linhas.length ? linhas : ['(sem dias calculados)']),
    '',
    'DIAGNÓSTICO POR REGRA (automático):',
    ...(d.regras.length ? d.regras.map((h) => `- ${h.titulo} (${h.confianca}): ${h.evidencia}`) : ['- nenhum padrão encontrado']),
    '',
    'REDE (tensão, últimos dias) — dia | mín V | máx V | desligamentos por tensão | nível:',
    ...(d.rede.length ? d.rede.map((r) => `${r.dia} | ${n1(r.vMin)} | ${n1(r.vMax)} | ${r.desarmes} | ${r.nivel}`) : ['(sem medição de tensão para esta usina)']),
  ].join('\n');
}

const INSTRUCOES = `Você é um analista sênior de desempenho de usinas fotovoltaicas (O&M) no Brasil.
Recebe o DOSSIÊ de UMA usina: geração prevista (calculada por modelo físico com o clima real do dia por satélite), geração real (medida pelo inversor), diagnóstico por regras, calibração de orientação e dados de tensão da rede.
Sua tarefa: explicar a diferença entre previsto e real e listar as causas mais prováveis.
Regras:
- Use SOMENTE números do dossiê. Cite-os nas evidências (datas, %, kWh, V). Nunca invente medição.
- Separe medido (real), calculado (previsto) e inferido (suas hipóteses). Hipótese nunca é certeza.
- Considere: sujeira acumulada (queda gradual, volta após chuva), string/MPPT parado (degrau súbito e estável), sombra, corte do inversor por potência ou por tensão alta da rede (desligamentos, V máx ≥ 242 V), falha de comunicação (dias sem leitura não são defeito), premissa errada no cadastro (kWp, orientação — compare com a calibração), degradação, dia nublado (o previsto já desconta o clima).
- Se a usina está bem, diga isso claramente e não invente problema.
- Português do Brasil simples, frases curtas, para técnico de campo.
- tipo_os: limpeza | revisao_inversor | revisao_eletrica | corretiva | inspecao | null (quando não precisa ir ao local).
Responda SÓ com JSON:
{"resumo":"2-3 frases","hipoteses":[{"titulo":"...","chance":"alta|media|baixa","evidencias":["..."],"como_confirmar":"o que olhar/medir no local ou no app","tipo_os":"..."}],"proximo_passo":"1 frase","falta_dado":["dado que melhoraria a análise"]}
No máximo 4 hipóteses, da mais provável para a menos provável.`;

export async function analisarUsinaIa(client: Anthropic, d: DossieUsina, companyId: string | null): Promise<AnaliseIa> {
  const resp = await client.messages.create({
    model: MODELO_ANALISE,
    max_tokens: 2500,
    system: INSTRUCOES,
    messages: [{ role: 'user', content: montarDossie(d) }],
  }, { timeout: 90_000 });
  medirIa({ modelo: MODELO_ANALISE, origem: 'resumo:usina-previsto', usage: resp.usage, companyId });
  return interpretarAnalise(resp.content.map((c) => (c.type === 'text' ? c.text : '')).join(''));
}

/** Valida o JSON da IA — o que vier fora do formato é descartado. */
export function interpretarAnalise(texto: string): AnaliseIa {
  const vazio: AnaliseIa = { resumo: 'A IA não conseguiu concluir a análise agora. Tente de novo em alguns minutos.', hipoteses: [], proximoPasso: '', faltaDado: [] };
  const m = /\{[\s\S]*\}/.exec(texto);
  if (!m) return vazio;
  let j: any;
  try { j = JSON.parse(m[0]); } catch { return vazio; }
  const s = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
  const hipoteses: HipoteseIa[] = (Array.isArray(j.hipoteses) ? j.hipoteses : []).slice(0, 4).map((h: any) => ({
    titulo: s(h?.titulo, 140),
    chance: h?.chance === 'alta' || h?.chance === 'media' ? h.chance : 'baixa',
    evidencias: (Array.isArray(h?.evidencias) ? h.evidencias : []).slice(0, 5).map((e: unknown) => s(e, 300)).filter(Boolean),
    comoConfirmar: s(h?.como_confirmar, 400),
    tipoOs: (TIPOS_OS as readonly string[]).includes(h?.tipo_os) ? h.tipo_os as TipoOsIa : null,
  })).filter((h: HipoteseIa) => h.titulo);
  return {
    resumo: s(j.resumo, 600) || vazio.resumo,
    hipoteses,
    proximoPasso: s(j.proximo_passo, 300),
    faltaDado: (Array.isArray(j.falta_dado) ? j.falta_dado : []).slice(0, 5).map((e: unknown) => s(e, 200)).filter(Boolean),
  };
}

// Cache curto: mesma usina no mesmo dia não paga a análise duas vezes em 30 min.
const CACHE = new Map<string, { em: number; a: AnaliseIa }>();
const TTL_MS = 30 * 60_000;
export function analiseEmCache(chave: string, agora = Date.now()): AnaliseIa | null {
  const c = CACHE.get(chave);
  if (!c || agora - c.em > TTL_MS) { CACHE.delete(chave); return null; }
  return c.a;
}
export function guardarAnalise(chave: string, a: AnaliseIa, agora = Date.now()): void {
  if (CACHE.size > 500) CACHE.clear();
  CACHE.set(chave, { em: agora, a });
}
