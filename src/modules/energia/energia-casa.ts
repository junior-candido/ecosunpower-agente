// src/modules/energia/energia-casa.ts
//
// Números da tela "Energia da casa" (spec §4.4), a partir do que já está
// resumido no banco (energia_diaria, energia_15min, geracao_diaria,
// demonstrativos_gd). Função PURA — a consulta fica em dashboard/energia-queries.ts.
//
// Regras de honestidade:
//  - dia sem linha = sem dado (null), nunca 0;
//  - os cartões do período só usam dias COMPLETOS (cobertura ≥ 95%) e, havendo
//    usina, só os dias que também têm geração — senão a conta
//    consumo = gerado + comprado − devolvido misturaria períodos diferentes;
//  - o perfil por hora é MÉDIA de potência sobre o tempo coberto (buraco não
//    puxa a média pra baixo).

import { balancoEnergia, type Balanco } from './balanco.js';
import { conciliarComDemonstrativo, type LinhaConciliacao } from './conciliacao.js';
import { horaBrt, somarDias } from './tempo.js';
import { COBERTURA_DIA_COMPLETO_PCT } from './energia-service.js';

export interface DiaMedido {
  dia: string;
  importadoKwh: number | null;
  exportadoKwh: number | null;
  coberturaPct: number;
  baseNoturnaW: number | null;
  demandaMaxW: number | null;
}

export interface JanelaPerfil { inicio: string; importadoWh: number; exportadoWh: number; segundosCobertos: number }

export interface PontoDia {
  dia: string;
  importadoKwh: number | null;
  exportadoKwh: number | null;
  geradoKwh: number | null;
  consumoKwh: number | null;
  coberturaPct: number | null;
  completo: boolean;
}

export interface PontoHora { hora: number; importadoKw: number | null; exportadoKw: number | null; horasCobertas: number }

export interface PainelEnergia {
  serie: PontoDia[];
  periodo: {
    dias: number;                 // dias no período (30)
    diasComDado: number;
    diasCompletos: number;
    diasUsados: number;           // os que entraram nos cartões
    balanco: Balanco | null;      // null = nenhum dia usável
  };
  perfil: PontoHora[];
  baseNoturnaW: number | null;
  demandaMaxW: number | null;
  conciliacao: { referencia: string; coberturaPct: number; linhas: LinhaConciliacao[] } | null;
}

export interface EntradaPainel {
  hoje: string;                   // dia de Brasília
  diasJanela?: number;            // padrão 30
  temUsina: boolean;
  dias: DiaMedido[];
  geracao: Record<string, number>; // dia → kWh (geracao_diaria)
  janelas: JanelaPerfil[];
  mes: {
    referencia: string;           // YYYY-MM-01
    dias: DiaMedido[];            // energia_diaria daquele mês civil
    demonstrativo: { injetado_kwh: number | null; consumo_kwh: number | null } | null;
  } | null;
}

function mediana(v: number[]): number | null {
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const diasNoMes = (ref: string) => {
  const [a, m] = ref.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
};

export function montarPainel(e: EntradaPainel): PainelEnergia {
  const n = e.diasJanela ?? 30;
  const porDia = new Map(e.dias.map((d) => [d.dia, d]));
  const serie: PontoDia[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const dia = somarDias(e.hoje, -i);
    const d = porDia.get(dia);
    const gerado = e.temUsina && Number.isFinite(e.geracao[dia]) ? e.geracao[dia] : null;
    if (!d) {
      serie.push({ dia, importadoKwh: null, exportadoKwh: null, geradoKwh: gerado, consumoKwh: null, coberturaPct: null, completo: false });
      continue;
    }
    const completo = d.coberturaPct >= COBERTURA_DIA_COMPLETO_PCT && d.importadoKwh !== null && d.exportadoKwh !== null;
    const consumo = completo && gerado !== null
      ? balancoEnergia({ geradoKwh: gerado, importadoKwh: d.importadoKwh!, exportadoKwh: d.exportadoKwh! }).consumoKwh
      : null;
    serie.push({ dia, importadoKwh: d.importadoKwh, exportadoKwh: d.exportadoKwh, geradoKwh: gerado, consumoKwh: consumo, coberturaPct: d.coberturaPct, completo });
  }

  const comDado = serie.filter((p) => p.coberturaPct !== null);
  const completos = serie.filter((p) => p.completo);
  const usados = e.temUsina ? completos.filter((p) => p.geradoKwh !== null) : completos;
  let balanco: Balanco | null = null;
  if (usados.length > 0) {
    const imp = usados.reduce((s, p) => s + (p.importadoKwh ?? 0), 0);
    const exp = usados.reduce((s, p) => s + (p.exportadoKwh ?? 0), 0);
    const ger = e.temUsina ? usados.reduce((s, p) => s + (p.geradoKwh ?? 0), 0) : null;
    balanco = balancoEnergia({ geradoKwh: ger, importadoKwh: imp, exportadoKwh: exp });
  }

  // Perfil por hora: potência média (kW) = energia ÷ tempo coberto naquela hora do dia.
  const acc = Array.from({ length: 24 }, () => ({ imp: 0, exp: 0, seg: 0 }));
  for (const j of e.janelas) {
    if (!(j.segundosCobertos > 0)) continue;
    const a = acc[horaBrt(j.inicio)];
    a.imp += j.importadoWh; a.exp += j.exportadoWh; a.seg += j.segundosCobertos;
  }
  const perfil: PontoHora[] = acc.map((a, hora) => {
    const h = a.seg / 3600;
    // Menos de meia hora coberta no período inteiro naquela hora: pouco pra média.
    if (h < 0.5) return { hora, importadoKw: null, exportadoKw: null, horasCobertas: h };
    return { hora, importadoKw: a.imp / 1000 / h, exportadoKw: a.exp / 1000 / h, horasCobertas: h };
  });

  const diasBons = e.dias.filter((d) => d.coberturaPct >= COBERTURA_DIA_COMPLETO_PCT);
  const baseNoturnaW = mediana(diasBons.map((d) => d.baseNoturnaW).filter((v): v is number => v !== null && Number.isFinite(v)));
  const demandas = diasBons.map((d) => d.demandaMaxW).filter((v): v is number => v !== null && Number.isFinite(v));
  const demandaMaxW = demandas.length ? Math.max(...demandas) : null;

  let conciliacao: PainelEnergia['conciliacao'] = null;
  if (e.mes) {
    const nDias = diasNoMes(e.mes.referencia);
    const doMes = e.mes.dias.filter((d) => d.dia.slice(0, 7) === e.mes!.referencia.slice(0, 7));
    const coberturaPct = doMes.reduce((s, d) => s + Math.min(100, Math.max(0, d.coberturaPct)), 0) / nDias;
    const somar = (k: 'importadoKwh' | 'exportadoKwh') =>
      doMes.some((d) => d[k] !== null) ? doMes.reduce((s, d) => s + (d[k] ?? 0), 0) : null;
    conciliacao = {
      referencia: e.mes.referencia,
      coberturaPct,
      linhas: conciliarComDemonstrativo({
        referencia: e.mes.referencia,
        exportadoMesKwh: somar('exportadoKwh'),
        importadoMesKwh: somar('importadoKwh'),
        coberturaMesPct: coberturaPct,
        demonstrativo: e.mes.demonstrativo,
      }),
    };
  }

  return {
    serie,
    periodo: { dias: n, diasComDado: comDado.length, diasCompletos: completos.length, diasUsados: usados.length, balanco },
    perfil,
    baseNoturnaW,
    demandaMaxW,
    conciliacao,
  };
}
