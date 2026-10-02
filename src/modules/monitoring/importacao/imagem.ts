// Importar geração por PRINT/FOTO da tela do app do inversor (S-Miles,
// SolarEdge, NEP, qualquer um) — a IA lê as barras/tabela do gráfico DIÁRIO
// e devolve os valores pra pessoa CONFERIR antes de gravar. Nunca grava sozinha.
import type Anthropic from '@anthropic-ai/sdk';
import { medirIa } from '../../custos/ia-metering.js';
import { lerData } from './csv.js';
import type { ResultadoLeitura } from './csv.js';

export const MODELO_LEITURA = 'claude-sonnet-5-5';

const INSTRUCOES = `Você lê prints de aplicativos de monitoramento de usina solar.
Extraia a GERAÇÃO DIÁRIA (kWh por dia) que aparece na imagem: gráfico de barras diário ou tabela por dia.
Regras:
- Só valores que você consegue LER na imagem (rótulo numérico, tabela ou tooltip). NUNCA estime pela altura da barra.
- Se o gráfico é mensal/anual (uma barra por mês), devolva tipo "mensal" com os meses lidos.
- Datas completas AAAA-MM-DD. Se a tela mostra só "dia 1, 2, 3…", use o mês/ano visível na tela; se não houver, use o informado no contexto.
- Energia em kWh (converta Wh/MWh se a tela indicar).
Responda SÓ com JSON: {"tipo":"diario"|"mensal"|"nada","itens":[{"data":"AAAA-MM-DD","kwh":12.3}],"mes_ref":"AAAA-MM","observacao":"..."}
Para "mensal", use "data" = primeiro dia do mês (AAAA-MM-01).`;

export interface LeituraImagem extends ResultadoLeitura { tipo: 'diario' | 'mensal' | 'nada'; observacao: string }

export async function lerPrintGeracao(
  client: Anthropic,
  imagem: { base64: string; mime: string },
  contexto: { usina: string; mesSugerido: string; companyId?: string | null },
): Promise<LeituraImagem> {
  const resp = await client.messages.create({
    model: MODELO_LEITURA,
    max_tokens: 2000,
    system: INSTRUCOES,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: imagem.mime as 'image/png', data: imagem.base64 } },
        { type: 'text', text: `Usina: ${contexto.usina}. Mês provável (se a tela não mostrar): ${contexto.mesSugerido}.` },
      ],
    }],
  }, { timeout: 60_000 });
  medirIa({ modelo: MODELO_LEITURA, origem: 'midia:geracao-print', usage: resp.usage, companyId: contexto.companyId ?? null });
  const texto = resp.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
  return interpretarRespostaImagem(texto);
}

/** Separado pra teste: valida o JSON da IA (nada inventado passa). */
export function interpretarRespostaImagem(texto: string): LeituraImagem {
  const m = /\{[\s\S]*\}/.exec(texto);
  if (!m) return { tipo: 'nada', linhas: [], avisos: ['A IA não conseguiu ler valores nessa imagem.'], observacao: '' };
  let j: { tipo?: string; itens?: Array<{ data?: string; kwh?: number | string }>; observacao?: string };
  try { j = JSON.parse(m[0]); } catch { return { tipo: 'nada', linhas: [], avisos: ['Resposta da IA ilegível.'], observacao: '' }; }
  const tipo = j.tipo === 'mensal' ? 'mensal' : j.tipo === 'diario' ? 'diario' : 'nada';
  const porDia = new Map<string, number>();
  for (const it of j.itens ?? []) {
    const data = lerData(String(it.data ?? ''));
    const kwh = Number(it.kwh);
    if (data && Number.isFinite(kwh) && kwh >= 0 && kwh < 1_000_000) porDia.set(data, Math.round(kwh * 1000) / 1000);
  }
  const linhas = [...porDia].map(([data, kwh]) => ({ data, kwh })).sort((a, b) => a.data.localeCompare(b.data));
  const avisos = ['Valores lidos pela IA a partir da imagem — confira cada um antes de gravar.'];
  if (tipo === 'mensal') avisos.push('A imagem tem totais MENSAIS: cada valor fica no dia 1º do mês (igual à leitura manual).');
  return { tipo, linhas, avisos, observacao: String(j.observacao ?? '').slice(0, 300) };
}
