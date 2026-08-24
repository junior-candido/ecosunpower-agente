// src/modules/vendas/lojas/solfacil-kit-client.ts
// Adapter de KIT da Sol Fácil: chama getCustomKitOffersV2 (a mesma API do "Montar kit")
// e devolve KitOferta[] com o PREÇO DE KIT REAL. Server-side (usa tokenSolfacil por senha).
// ⚠️ TODO param string vai preenchido ('' quando não filtra) — se algum ficar undefined,
// o resolver da Sol Fácil quebra (".replace of undefined"). fetchFn injetável p/ teste.
import type { FetchFn } from './solfacil-client.js';
import type { KitOferta, KitItemOferta, KitPagamentoOferta } from './kit-oferta.js';
import { parseBRL, parseRsPorWp } from './kit-oferta.js';

const GRAPHQL = 'https://kong.solfacil.com.br/prd-bff-store/api/graphql';

// Seleção exata extraída do app (chunk _nuxt/CeZ93xpD.js). Se a Sol Fácil mudar o schema,
// só este trecho muda.
const SELECAO = `offers{tag{type text}inverter_manufacturer module_manufacturer description total_value value_per_wp items{category details{label value}}request{items{sku amount}dc_id region}payment_conditions{enabled discount_percent final_price description payment_name installments{installments installmentValue totalValue has_interest}}}alert{message}`;

const QUERY = `query getCustomKitOffersV2($channel:String,$region:String,$power:Float,$zipcode:String,$inverter_manufacturer:String,$inverter_nominal_power:String,$network_type:String,$structure_installation:String,$inverter_type:String,$segmentation_id:String){getCustomKitOffersV2(channel:$channel,region:$region,power:$power,zipcode:$zipcode,inverter_manufacturer:$inverter_manufacturer,inverter_nominal_power:$inverter_nominal_power,network_type:$network_type,structure_installation:$structure_installation,inverter_type:$inverter_type,segmentation_id:$segmentation_id){${SELECAO}}}`;

export interface ParamsKitSolfacil {
  power: number;                    // kWp do kit
  region?: string;                  // 'DF' | 'GO' (default DF)
  zipcode?: string;                 // CEP (muda preço/frete)
  inverterManufacturer?: string;    // '' = qualquer
  inverterNominalPower?: string;
  networkType?: string;
  structureInstallation?: string;
  inverterType?: string;            // micro | string (a loja define o valor exato)
  segmentationId?: string;
  channel?: string;                 // default 'autoservico'
}

/** Monta as variables com TODA string preenchida (nunca undefined). */
export function variaveisKitSolfacil(p: ParamsKitSolfacil): Record<string, unknown> {
  const s = (v: string | undefined) => (v == null ? '' : v);
  return {
    channel: s(p.channel) || 'autoservico',
    region: s(p.region) || 'DF',
    power: p.power,
    zipcode: s(p.zipcode),
    inverter_manufacturer: s(p.inverterManufacturer),
    inverter_nominal_power: s(p.inverterNominalPower),
    network_type: s(p.networkType),
    structure_installation: s(p.structureInstallation),
    inverter_type: s(p.inverterType),
    segmentation_id: s(p.segmentationId),
  };
}

/** Normaliza a resposta bruta da getCustomKitOffersV2 → KitOferta[]. PURO/testável. */
export function normalizarKitsSolfacil(data: any, region: string): KitOferta[] {
  const D = data?.getCustomKitOffersV2;
  const offers: any[] = D?.offers ?? [];
  const alerta: string | null = D?.alert?.message ?? null;
  const ehAlt = !!alerta;
  return offers.map((o) => {
    const itens: KitItemOferta[] = [];
    for (const it of o.items ?? []) {
      for (const d of it.details ?? []) {
        itens.push({ categoria: String(it.category ?? ''), label: String(d.label ?? ''), valor: String(d.value ?? '') });
      }
    }
    const pagamentos: KitPagamentoOferta[] = (o.payment_conditions ?? []).map((p: any) => ({
      nome: String(p.payment_name ?? ''),
      descontoPct: typeof p.discount_percent === 'number' ? p.discount_percent : parseBRL(p.discount_percent),
      precoFinal: parseBRL(p.final_price),
      semJuros: Array.isArray(p.installments) && p.installments.length
        ? p.installments.every((i: any) => i.has_interest === false)
        : null,
    }));
    return {
      fonte: 'solfacil' as const,
      region: o.request?.region ?? region,
      inversorMarca: String(o.inverter_manufacturer ?? ''),
      moduloMarca: String(o.module_manufacturer ?? ''),
      descricao: String(o.description ?? ''),
      precoTotal: parseBRL(o.total_value) ?? 0,
      rsPorWp: parseRsPorWp(o.value_per_wp),
      itens,
      pagamentos,
      ehAlternativa: ehAlt,
      alerta,
    };
  });
}

/** Chama a API de kit da Sol Fácil com o token dado. Ordena do mais barato ao mais caro. */
export async function puxarKitsSolfacil(
  token: string, p: ParamsKitSolfacil, fetchFn: FetchFn = fetch,
): Promise<KitOferta[]> {
  const variables = variaveisKitSolfacil(p);
  const res = await fetchFn(GRAPHQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ operationName: 'getCustomKitOffersV2', variables, query: QUERY }),
  });
  if (!res.ok) throw new Error(`Sol Fácil kit HTTP ${res.status}`);
  const j = await res.json();
  if (j.errors?.length) throw new Error(`Sol Fácil kit: ${j.errors[0].message}`);
  const kits = normalizarKitsSolfacil(j.data, variables.region as string);
  return kits.sort((a, b) => a.precoTotal - b.precoTotal);
}
