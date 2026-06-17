// src/modules/financeiro/comando-imposto.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { impostoDaVenda, fatorR, proximoSalto, proLaboreMinimoParaAnexoIII } from './imposto.js';
import { competenciaAtual, getBuckets, getParametros } from './repo.js';
import { calcularRBT12 } from './rbt12.js';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (n: number) => `${(n * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export function parseImpostoCommand(text: string): number | null {
  const m = text.trim().match(/^\/imposto\s+([\d.,]+)/i);
  if (!m) return null;
  const raw = m[1];
  // único ponto com exatamente 2 dígitos no fim = decimal americano (copiado de planilha)
  const valor = !raw.includes(',') && /^\d+\.\d{2}$/.test(raw)
    ? Number(raw)
    : Number(raw.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

// Lê um valor em reais escrito do jeito que o Junior digita: "30000", "30.000",
// "30.000,50", "R$ 30 mil", "30k", "1,5 mi". Retorna número > 0 ou null.
// Usado pelo "modo esperando valor" do submenu Financeiro (Calcular imposto).
export function parseValorReais(text: string): number | null {
  let s = text.trim().toLowerCase();
  s = s.replace(/r\$\s*/g, '').replace(/reais?/g, '').trim();
  const m = s.match(/^([\d.,]+)\s*(mil|k|mi|milh(?:ã|a)o|milh(?:õ|o)es)?$/);
  if (!m) return null;
  const numRaw = m[1];
  const unit = m[2];
  let mult = 1;
  if (unit === 'mil' || unit === 'k') mult = 1000;
  else if (unit) mult = 1_000_000; // mi, milhão, milhões

  // Com unidade (mil/k/mi): ponto e vírgula são decimal (ex: "1,5 mi" → 1.5).
  // Sem unidade: ponto = milhar, vírgula = decimal — exceto ponto-com-2-dígitos
  // no fim, que é decimal americano copiado de planilha (ex: "1500.50").
  const num = unit
    ? Number(numRaw.replace(',', '.'))
    : (!numRaw.includes(',') && /^\d+\.\d{2}$/.test(numRaw)
        ? Number(numRaw)
        : Number(numRaw.replace(/\./g, '').replace(',', '.')));

  return Number.isFinite(num) && num * mult > 0 ? num * mult : null;
}

export async function montarRespostaImposto(client: SupabaseClient, valor: number): Promise<string> {
  const comp = competenciaAtual();
  const [buckets, params] = await Promise.all([getBuckets(client), getParametros(client)]);
  const rbt12 = calcularRBT12(buckets, comp);
  const receita12 = rbt12; // mesma base
  const folha12 = params.pro_labore_mensal * 12 + params.outras_folhas_mensal * 12;
  const fr = fatorR(folha12, receita12);
  const anexoComissao = fr.anexo; // III ou V
  const i = impostoDaVenda(valor, rbt12, 'I');
  const iii = impostoDaVenda(valor, rbt12, 'III');
  const com = impostoDaVenda(valor, rbt12, anexoComissao);
  const salto = proximoSalto(rbt12);
  const proLaboreMin = proLaboreMinimoParaAnexoIII(receita12, params.outras_folhas_mensal * 12);

  const linhas = [
    `💰 *Imposto sobre ${brl(valor)}*`,
    `RBT12 atual: ${brl(rbt12)} (faixa ${iii.faixa})`,
    ``,
    `🛒 Equipamento (Anexo I): ${pct(i.efetiva)} → *${brl(i.imposto)}*`,
    `🔧 Instalação (Anexo III): ${pct(iii.efetiva)} → *${brl(iii.imposto)}*`,
    `🪙 Comissão (Anexo ${anexoComissao}): ${pct(com.efetiva)} → *${brl(com.imposto)}*`,
    ``,
    `Fator R: ${pct(fr.ratio)} → ${fr.anexo === 'III' ? '✅ Anexo III' : '⚠️ Anexo V (caro!)'}`,
    `Pró-labore mín. p/ ficar no III: ${brl(proLaboreMin)}/mês`,
    salto ? `Faltam ${brl(salto.distancia)} pro salto de faixa (${brl(salto.limite)}).` : `Última faixa.`,
  ];
  return linhas.join('\n');
}

// handler no formato dos comandos do index: (from, text) => Promise<boolean>
export function makeImpostoHandler(
  client: SupabaseClient,
  isAdminPhone: (p: string) => boolean,
  sendText: (to: string, body: string) => Promise<unknown>,
) {
  return async function tryHandleImpostoCommand(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const valor = parseImpostoCommand(text);
    if (valor === null) return false;
    const resposta = await montarRespostaImposto(client, valor);
    await sendText(from, resposta);
    return true;
  };
}
