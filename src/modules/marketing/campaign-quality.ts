// src/modules/marketing/campaign-quality.ts
//
// Calculadora PURA: dado gasto por campanha + leads (qualificados/total) por
// campanha, devolve custo por lead qualificado de cada uma, a média ponderada
// e um status relativo (campea/ok/cara/sem_dados). Sem I/O — fácil de testar.

export interface CampaignSpend { campaignId: string; name: string; spendBrl: number; }
export interface CampaignLeads { campaignId: string; qualified: number; totalLeads: number; }
/** Defaults: minLeadsParaJulgar=5, desvioPct=0.4 (±40% da média ponderada). */
export interface CampaignQualityConfig { minLeadsParaJulgar?: number; desvioPct?: number; }

export type CampaignStatus = 'campea' | 'ok' | 'cara' | 'sem_dados';

export interface CampaignQualityRow {
  campaignId: string;
  name: string;
  spendBrl: number;
  qualified: number;
  totalLeads: number;
  costPerQualified: number | null;
  status: CampaignStatus;
}

export interface CampaignQualityReport {
  rows: CampaignQualityRow[];
  mediaCostPerQualified: number | null;
}

export function analyzeCampaignQuality(
  spends: CampaignSpend[],
  leads: CampaignLeads[],
  config: CampaignQualityConfig = {},
): CampaignQualityReport {
  const minLeads = config.minLeadsParaJulgar ?? 5;
  const desvio = config.desvioPct ?? 0.4;

  const spendByCampaign = new Map(spends.map((s) => [s.campaignId, s]));
  const leadByCampaign = new Map(leads.map((l) => [l.campaignId, l]));
  const allIds = new Set<string>([...spendByCampaign.keys(), ...leadByCampaign.keys()]);

  const base = [...allIds].map((id) => {
    const s = spendByCampaign.get(id);
    const l = leadByCampaign.get(id);
    const spendBrl = s?.spendBrl ?? 0;
    const qualified = l?.qualified ?? 0;
    const totalLeads = l?.totalLeads ?? 0;
    const name = s?.name ?? id;
    const costPerQualified = spendBrl > 0 && qualified > 0 ? spendBrl / qualified : null;
    return { campaignId: id, name, spendBrl, qualified, totalLeads, costPerQualified };
  });

  // Campanhas sem_dados e sem gasto registrado são excluídas do benchmark intencionalmente.
  const comDados = base.filter((b) => b.totalLeads >= minLeads && b.spendBrl > 0 && b.qualified > 0);
  const totalSpend = comDados.reduce((acc, b) => acc + b.spendBrl, 0);
  const totalQualified = comDados.reduce((acc, b) => acc + b.qualified, 0);
  const media = totalQualified > 0 ? totalSpend / totalQualified : null;

  const rows: CampaignQualityRow[] = base.map((b) => {
    let status: CampaignStatus;
    if (b.totalLeads < minLeads) {
      status = 'sem_dados';
    } else if (b.spendBrl === 0) {
      status = 'sem_dados';
    } else if (b.qualified === 0) {
      status = 'cara';
    } else if (media == null) {
      status = 'ok';
    } else if (b.costPerQualified != null && b.costPerQualified <= media * (1 - desvio)) {
      status = 'campea';
    } else if (b.costPerQualified != null && b.costPerQualified >= media * (1 + desvio)) {
      status = 'cara';
    } else {
      status = 'ok';
    }
    return { ...b, status };
  });

  rows.sort((a, b) => {
    if (a.costPerQualified == null && b.costPerQualified == null) return 0;
    if (a.costPerQualified == null) return 1;
    if (b.costPerQualified == null) return -1;
    return a.costPerQualified - b.costPerQualified;
  });

  return { rows, mediaCostPerQualified: media };
}
