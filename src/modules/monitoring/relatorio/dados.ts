// src/modules/monitoring/relatorio/dados.ts
import { garantiaInfo, type GarantiaResult } from '../garantia.js';
import { classificarSistema } from '../classificacao.js';
import { empresaDe } from '../../empresa-config.js';
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
  const cls = classificarSistema({
    ativo: s.ativo,
    ultimoErro: s.ultimo_erro ?? null,
    potenciaKwp: s.potencia_kwp,
    uf: s.uf,
    diasSemGeracao: cls0DiasSemGeracao(d),
    realUltimos7: ratio7d * (Number(d.kpis?.esperadoDiaKwh ?? 0) * 7),
    // 084/085: motivo do problema + régua da empresa dona da usina
    statusInversor: (s.status_inversor as 'ok' | 'offline' | 'falha' | 'desconhecido' | null | undefined) ?? null,
    corteAtencao: empresaDe(s.company_id).reguaAtencaoPct / 100,
  });
  const offline = cls.alerta?.tipo === 'sistema_offline';
  const erro = cls.alerta?.tipo === 'erro_integracao';
  const grav = classificarGravidade({
    apelido: s.apelido, offline, diasSemGeracao: cls0DiasSemGeracao(d), erro, ratio7d,
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
