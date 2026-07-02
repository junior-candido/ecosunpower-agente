// src/modules/monitoring/detalhe-series.ts
// PURO: monta as séries de calendário (mês=diária, ano=mensal) e calcula a
// navegação Dia/Mês/Ano (setas + rótulo). Sem I/O — testável.

export interface GeracaoDia { data: string; geracao_kwh: number }
export type Vista = 'dia' | 'mes' | 'ano';

const MESES_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export function serieMesDiaria(geracoes: GeracaoDia[], ano: number, mes: number): Array<{ data: string; kwh: number }> {
  const porDia = new Map<string, number>();
  for (const g of geracoes) porDia.set(g.data, (porDia.get(g.data) ?? 0) + Number(g.geracao_kwh));
  const out: Array<{ data: string; kwh: number }> = [];
  const n = diasNoMes(ano, mes);
  const mm = String(mes).padStart(2, '0');
  for (let d = 1; d <= n; d++) {
    const data = `${ano}-${mm}-${String(d).padStart(2, '0')}`;
    out.push({ data, kwh: Number((porDia.get(data) ?? 0).toFixed(1)) });
  }
  return out;
}

export function serieAnoMensal(geracoes: GeracaoDia[], ano: number): Array<{ mes: string; kwh: number }> {
  const porMes = new Map<string, number>();
  for (const g of geracoes) {
    if (g.data.slice(0, 4) !== String(ano)) continue;
    const mes = g.data.slice(0, 7);
    porMes.set(mes, (porMes.get(mes) ?? 0) + Number(g.geracao_kwh));
  }
  const out: Array<{ mes: string; kwh: number }> = [];
  for (let m = 1; m <= 12; m++) {
    const mes = `${ano}-${String(m).padStart(2, '0')}`;
    out.push({ mes, kwh: Number((porMes.get(mes) ?? 0).toFixed(1)) });
  }
  return out;
}

export function navegacao(
  vista: Vista,
  ref: string,
  hoje: Date,
  _dataInstalacao: string | null,
): { anterior: string; proximo: string | null; label: string } {
  const [y, m, d] = ref.split('-').map(Number);
  const iso = (yy: number, mm: number, dd: number) => `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const hy = hoje.getUTCFullYear(), hm = hoje.getUTCMonth() + 1, hd = hoje.getUTCDate();

  if (vista === 'ano') {
    return { anterior: iso(y - 1, m, d), proximo: y < hy ? iso(y + 1, m, d) : null, label: `${y}` };
  }
  if (vista === 'mes') {
    const antMes = m === 1 ? { yy: y - 1, mm: 12 } : { yy: y, mm: m - 1 };
    const proxMes = m === 12 ? { yy: y + 1, mm: 1 } : { yy: y, mm: m + 1 };
    const noFuturo = proxMes.yy > hy || (proxMes.yy === hy && proxMes.mm > hm);
    return { anterior: iso(antMes.yy, antMes.mm, d), proximo: noFuturo ? null : iso(proxMes.yy, proxMes.mm, d), label: `${MESES_PT[m - 1]} de ${y}` };
  }
  const base = new Date(Date.UTC(y, m - 1, d));
  const ant = new Date(base); ant.setUTCDate(ant.getUTCDate() - 1);
  const prox = new Date(base); prox.setUTCDate(prox.getUTCDate() + 1);
  const proxIso = prox.toISOString().slice(0, 10);
  const hojeIso = iso(hy, hm, hd);
  return { anterior: ant.toISOString().slice(0, 10), proximo: proxIso > hojeIso ? null : proxIso, label: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}` };
}
