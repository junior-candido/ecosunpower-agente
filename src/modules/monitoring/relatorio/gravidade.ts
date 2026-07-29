// src/modules/monitoring/relatorio/gravidade.ts
// Sinal de saúde do S3 (S4 usa pra alertar o Junior — S3 nunca envia).
// Tiers aprovados: grave (offline/erro/ratio<=0.50) · medio (0.50–0.70) ·
// leve (0.70–0.85) · null (>=0.85). Corte 0.70 = mesmo do radar S1.

export interface GravidadeInput {
  apelido: string;
  offline: boolean;
  diasSemGeracao: number;
  erro: boolean;
  // Razão de 7d vs a REFERÊNCIA da régua oficial: mediana de kWh/kWp da
  // carteira quando existe (29/07), senão o esperado absoluto de HSP.
  ratio7d: number;
}

export type Gravidade = 'grave' | 'medio' | 'leve' | null;

export interface GravidadeResult {
  gravidade: Gravidade;
  descritivo: string;
}

export function classificarGravidade(i: GravidadeInput): GravidadeResult {
  if (i.offline) {
    return {
      gravidade: 'grave',
      descritivo: `${i.apelido}: parada há ${i.diasSemGeracao} dias, sem geração. Provável inversor desligado / sem internet.`,
    };
  }
  if (i.erro) {
    return {
      gravidade: 'grave',
      descritivo: `${i.apelido}: falha de integração com a API — não estamos lendo os dados da usina.`,
    };
  }
  const pct = Math.round(i.ratio7d * 100);
  if (i.ratio7d <= 0.50) {
    return { gravidade: 'grave', descritivo: `${i.apelido}: gerando só ${pct}% do esperado (últimos 7 dias) — queda forte.` };
  }
  if (i.ratio7d < 0.70) {
    return { gravidade: 'medio', descritivo: `${i.apelido}: gerando ~${pct}% do esperado (últimos 7 dias). Possível sujeira/sombra — candidata a limpeza.` };
  }
  if (i.ratio7d < 0.85) {
    return { gravidade: 'leve', descritivo: `${i.apelido}: levemente abaixo (~${pct}% do esperado, 7 dias). Só acompanhar, sem ação.` };
  }
  return { gravidade: null, descritivo: `${i.apelido}: operando dentro do esperado.` };
}
