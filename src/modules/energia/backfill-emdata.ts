// src/modules/energia/backfill-emdata.ts
//
// Backfill LOCAL a partir da memória do próprio Shelly Pro 3EM (guarda ~60 dias
// a 1 min). Só funciona na MESMA rede do aparelho (GET http://<ip>/emdata/0/data.csv)
// — não é caminho de produto (o servidor não enxerga a rede do cliente). Usado
// pelo script scripts/energia-backfill-emdata.ts, que gera um .sql pra revisar
// e aplicar à mão. Nada aqui fala com o banco.
//
// CSV (EMData, add_keys=true): 1ª linha = nomes das colunas; depois 1 linha por
// período (60 s). As energias são DO PERÍODO (Wh), não acumuladas:
//   timestamp, a_total_act_energy, a_total_act_ret_energy, ..., c_max_act_power,
//   c_min_voltage, c_max_voltage, c_avg_voltage, ...

import { inicioJanela, JANELA_MS, type Janela15 } from './agregacao.js';
import { faixaProdist, LIMITE_DESARME_INVERSOR_V, type TensaoNominal } from './prodist.js';

export interface RegistroEmdata { ts: number; valores: Record<string, number> }

export function parseEmdataCsv(texto: string): RegistroEmdata[] {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (linhas.length < 2) return [];
  const cab = linhas[0].split(',').map((c) => c.trim().toLowerCase());
  const iTs = cab.findIndex((c) => c === 'timestamp' || c === 'ts');
  if (iTs < 0) return [];
  const out: RegistroEmdata[] = [];
  for (const l of linhas.slice(1)) {
    const cel = l.split(',');
    const ts = Number(cel[iTs]);
    if (!Number.isFinite(ts) || ts < 1_577_836_800) continue; // antes de 2020 = relógio zerado
    const valores: Record<string, number> = {};
    cab.forEach((c, i) => {
      if (i === iTs) return;
      const v = Number(cel[i]);
      if (cel[i] !== undefined && cel[i] !== '' && Number.isFinite(v)) valores[c] = v;
    });
    out.push({ ts, valores });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

/** Soma os registros de 1 min da fase em janelas de 15 min. Período sem registro = sem cobertura. */
export function janelasDoEmdata(regs: RegistroEmdata[], fase: 'a' | 'b' | 'c', o: { tensaoNominal: TensaoNominal | null; periodoS?: number }): Janela15[] {
  const periodo = o.periodoS ?? 60;
  const mapa = new Map<number, Janela15 & { _v: number; _n: number }>();
  const vistos = new Set<number>();
  for (const r of regs) {
    if (vistos.has(r.ts)) continue;
    vistos.add(r.ts);
    const imp = r.valores[`${fase}_total_act_energy`];
    const exp = r.valores[`${fase}_total_act_ret_energy`];
    if (!Number.isFinite(imp) || !Number.isFinite(exp)) continue;
    const ini = inicioJanela(r.ts * 1000);
    let j = mapa.get(ini);
    if (!j) {
      j = { inicio: new Date(ini).toISOString(), importadoWh: 0, exportadoWh: 0, potenciaMaxW: null, tensaoMinV: null, tensaoMaxV: null,
        tensaoMedV: null, fpMedio: null, minTensaoPrecaria: 0, minTensaoCritica: 0, minAcima242: 0, segundosCobertos: 0, _v: 0, _n: 0 };
      mapa.set(ini, j);
    }
    j.importadoWh += imp;
    j.exportadoWh += exp;
    j.segundosCobertos = Math.min(JANELA_MS / 1000, j.segundosCobertos + periodo);
    const pmax = r.valores[`${fase}_max_act_power`];
    if (Number.isFinite(pmax)) j.potenciaMaxW = j.potenciaMaxW === null ? pmax : Math.max(j.potenciaMaxW, pmax);
    const vmin = r.valores[`${fase}_min_voltage`], vmax = r.valores[`${fase}_max_voltage`], vavg = r.valores[`${fase}_avg_voltage`];
    if (Number.isFinite(vmin)) j.tensaoMinV = j.tensaoMinV === null ? vmin : Math.min(j.tensaoMinV, vmin);
    if (Number.isFinite(vmax)) j.tensaoMaxV = j.tensaoMaxV === null ? vmax : Math.max(j.tensaoMaxV, vmax);
    if (Number.isFinite(vavg)) {
      j._v += vavg; j._n++;
      const f = faixaProdist(vavg, o.tensaoNominal);
      if (f === 'precaria') j.minTensaoPrecaria++;
      if (f === 'critica') j.minTensaoCritica++;
    }
    if (Number.isFinite(vmax) && vmax > LIMITE_DESARME_INVERSOR_V) j.minAcima242++;
  }
  return [...mapa.values()].sort((a, b) => a.inicio.localeCompare(b.inicio))
    .map(({ _v, _n, ...j }) => ({ ...j, tensaoMedV: _n ? _v / _n : null }));
}

const sqlNum = (v: number | null, casas: number) => (v === null || !Number.isFinite(v) ? 'null' : v.toFixed(casas));
const sqlTexto = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * SQL pra colar no SQL Editor. `on conflict do nothing`: o backfill só preenche
 * BURACO — janela que já veio do push fica como está.
 */
export function sqlBackfill(js: Janela15[], alvo: { companyId: string; deviceId: string; canal: number }): string {
  const medidor = `(select id from medidores_energia where company_id = ${sqlTexto(alvo.companyId)} and device_id = ${sqlTexto(alvo.deviceId)})`;
  const linhas = js.filter((j) => j.segundosCobertos > 0).map((j) => `  (${medidor}, ${sqlTexto(alvo.companyId)}, 'rede', ${alvo.canal}, ${sqlTexto(j.inicio)}, `
    + `${sqlNum(j.importadoWh, 3)}, ${sqlNum(j.exportadoWh, 3)}, ${sqlNum(j.potenciaMaxW, 2)}, ${sqlNum(j.tensaoMinV, 2)}, ${sqlNum(j.tensaoMaxV, 2)}, `
    + `${sqlNum(j.tensaoMedV, 2)}, ${j.minTensaoPrecaria}, ${j.minTensaoCritica}, ${j.minAcima242}, ${j.segundosCobertos}, 'backfill')`);
  if (linhas.length === 0) return '-- nada para inserir\n';
  const blocos: string[] = [];
  for (let i = 0; i < linhas.length; i += 500) {
    blocos.push(`insert into energia_15min (medidor_id, company_id, papel, canal, inicio, importado_wh, exportado_wh, potencia_max_w, tensao_min_v, tensao_max_v, tensao_med_v, min_tensao_precaria, min_tensao_critica, min_acima_242, segundos_cobertos, fonte)
values
${linhas.slice(i, i + 500).join(',\n')}
on conflict (medidor_id, papel, canal, inicio) do nothing;`);
  }
  return `-- Backfill do Shelly (${linhas.length} janelas de 15 min). Revisar antes de rodar.\n${blocos.join('\n\n')}\n`;
}
