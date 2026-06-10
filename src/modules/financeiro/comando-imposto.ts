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
