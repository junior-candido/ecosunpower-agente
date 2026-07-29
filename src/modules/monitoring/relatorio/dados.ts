// src/modules/monitoring/relatorio/dados.ts
import { garantiaInfo, type GarantiaResult } from '../garantia.js';
import { classificarGravidade, type GravidadeResult } from './gravidade.js';

// Tarifa default p/ economia ESTIMADA (Junior ajusta depois). Nunca promete
// número fechado pro cliente — sempre rotular "economia estimada (base R$ 1,00/kWh)".
export const TARIFA_ESTIMADA_KWH = 1.00;

export type ModoRelatorio = 'boas_vindas' | 'manutencao' | 'acompanhamento';

export interface RelatorioDeps {
  getDetalhe: (sistemaId: string) => Promise<any | null>;
}

export interface RelatorioData {
  modo: ModoRelatorio;
  apelido: string;
  cidade: string | null;
  uf: string | null;
  marcaInversor: string;
  potenciaKwp: number | null;
  // [Folha do tenant 27/07] base da linha "Instalada em X · garantia até Y".
  dataInstalacao: string | null;
  kpis: { hojeKwh: number | null; mesKwh: number; anoKwh: number; totalKwh: number };
  serieMensal: { mes: string; kwh: number; esperado: number }[];
  economiaEstimadaReais: number;
  garantia: GarantiaResult;
  sinal: GravidadeResult & { ratio7d: number };
  semDados: boolean;
}

export async function montarDadosRelatorio(
  deps: RelatorioDeps,
  sistemaId: string,
  modo: ModoRelatorio,
): Promise<RelatorioData | { erro: string }> {
  const d = await deps.getDetalhe(sistemaId);
  if (!d || !d.sistema) return { erro: 'Sistema não encontrado' };
  const s = d.sistema;

  const ratio7d = Number(d.kpis?.ratioUltimos7 ?? 1);
  // Os alertas do detalhe JÁ saem da régua oficial (relativa à carteira
  // quando há mediana — 29/07); re-classificar aqui criava régua paralela.
  const tiposAlerta = new Set(((d.alertas ?? []) as { tipo: string }[]).map((a) => a.tipo));
  const offline = tiposAlerta.has('sistema_offline');
  const erro = tiposAlerta.has('erro_integracao');
  // Gravidade na MESMA régua do painel: relativa quando há mediana; senão
  // absoluta (ratio7d) — o relatório do cliente não pode acusar queda que o
  // painel não mostra (julho nublado derruba a carteira inteira junto).
  const mediana = (d.kpis?.medianaCarteira7d ?? null) as number | null;
  const esperado7 = Number(d.kpis?.esperadoDiaKwh ?? 0) * 7;
  const real7 = ratio7d * esperado7;
  const kwp = Number(s.potencia_kwp ?? 0);
  const ratioEfetivo = (mediana != null && mediana > 0 && kwp > 0 && real7 > 0)
    ? (real7 / kwp) / mediana
    : ratio7d;
  const grav = classificarGravidade({
    apelido: s.apelido, offline, diasSemGeracao: cls0DiasSemGeracao(d), erro, ratio7d: ratioEfetivo,
  });

  const garantia = garantiaInfo({
    data_instalacao: s.data_instalacao,
    marca_inversor: s.marca_inversor,
    painel_marca: s.painel_marca ?? null,
  });

  const totalKwh = Number(d.kpis?.totalKwh ?? 0);
  return {
    modo,
    apelido: s.apelido,
    cidade: s.cidade ?? null,
    uf: s.uf ?? null,
    marcaInversor: s.marca_inversor,
    potenciaKwp: s.potencia_kwp ?? null,
    dataInstalacao: s.data_instalacao ?? null,
    kpis: {
      hojeKwh: d.kpis?.hojeKwh ?? null,
      mesKwh: Number(d.kpis?.mesKwh ?? 0),
      anoKwh: Number(d.kpis?.anoKwh ?? 0),
      totalKwh,
    },
    serieMensal: (d.serieMensalCompleta ?? []) as { mes: string; kwh: number; esperado: number }[],
    economiaEstimadaReais: totalKwh * TARIFA_ESTIMADA_KWH,
    garantia,
    sinal: { ...grav, ratio7d },
    semDados: totalKwh <= 0 && (d.serieMensalCompleta ?? []).length === 0,
  };
}

function cls0DiasSemGeracao(d: any): number {
  const a = (d.alertas ?? []).find((x: any) => x.tipo === 'sistema_offline');
  if (!a) return 0;
  const m = String(a.texto).match(/há (\d+) dias/);
  return m ? Number(m[1]) : 3;
}
