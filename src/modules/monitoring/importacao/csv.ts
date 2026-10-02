// Importar geração de usina SEM integração (Hoymiles, APsystems, qualquer
// portal que exporte "geração diária") — 02/10/2026.
// Lê CSV/TXT exportado do portal: acha sozinho a coluna da DATA e a da ENERGIA,
// entende separador (; , tab), decimal brasileiro (1.234,5) ou americano
// (1,234.5), datas DD/MM/AAAA ou AAAA-MM-DD e energia em Wh/kWh/MWh.

export interface LinhaImportada { data: string; kwh: number }
export interface ResultadoLeitura { linhas: LinhaImportada[]; avisos: string[] }

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function separador(primeira: string): string {
  const cont = (c: string) => primeira.split(c).length - 1;
  const c = [';', '\t', ','].map((x) => [x, cont(x)] as const).sort((a, b) => b[1] - a[1])[0];
  return c[1] > 0 ? c[0] : ';';
}

function dividir(linha: string, sep: string): string[] {
  const out: string[] = []; let atual = ''; let aspas = false;
  for (const ch of linha) {
    if (ch === '"') { aspas = !aspas; continue; }
    if (ch === sep && !aspas) { out.push(atual.trim()); atual = ''; continue; }
    atual += ch;
  }
  out.push(atual.trim());
  return out;
}

/** "26/09/2026", "2026-09-26", "2026/09/26 00:00", "26-09-2026" → "2026-09-26". */
export function lerData(v: string): string | null {
  const s = v.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return valida(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(s);
  if (m) return valida(+m[3], +m[2], +m[1]);
  return null;
}
function valida(a: number, m: number, d: number): string | null {
  if (a < 2000 || a > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
}

/** "1.234,5" / "1,234.5" / "12,3" / "12.3" / "12 kWh" → número. */
export function lerNumero(v: string): number | null {
  let s = v.replace(/[^\d.,-]/g, '');
  if (!s || s === '-' ) return null;
  const ultimaVirg = s.lastIndexOf(','), ultimoPonto = s.lastIndexOf('.');
  if (ultimaVirg > -1 && ultimoPonto > -1) {
    // o que vier por último é o decimal
    s = ultimaVirg > ultimoPonto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (ultimaVirg > -1) {
    s = /,\d{3}$/.test(s) && s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const EH_DATA = /^(data|date|dia|day|time|tempo|periodo|period|datetime|horario)/;
const EH_ENERGIA = /(kwh|wh|energia|energy|producao|production|geracao|generation|yield|rendimento|pv)/;

export function lerCsvGeracao(texto: string): ResultadoLeitura {
  const avisos: string[] = [];
  const brutas = texto.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!brutas.length) return { linhas: [], avisos: ['Arquivo vazio.'] };
  const sep = separador(brutas.slice(0, 5).join('\n'));
  const tabela = brutas.map((l) => dividir(l, sep));

  // Cabeçalho: primeira linha (até a 10ª) que tenha uma coluna de data e uma de energia
  let iCab = -1, cData = -1, cEnergia = -1, fator = 1;
  for (let i = 0; i < Math.min(10, tabela.length); i++) {
    const cols = tabela[i].map(sem);
    const d = cols.findIndex((c) => EH_DATA.test(c));
    const e = cols.findIndex((c, k) => k !== d && EH_ENERGIA.test(c));
    if (d > -1 && e > -1) {
      iCab = i; cData = d; cEnergia = e;
      const h = cols[e];
      fator = /mwh/.test(h) ? 1000 : /(^|[^k])wh/.test(h) && !/kwh/.test(h) ? 1 / 1000 : 1;
      break;
    }
  }
  // Sem cabeçalho reconhecível: coluna 0 = data, primeira numérica depois = energia
  if (iCab === -1) {
    cData = 0;
    cEnergia = (tabela.find((r) => lerData(r[0] ?? ''))?.findIndex((v, k) => k > 0 && lerNumero(v) !== null)) ?? 1;
    avisos.push('Não achei o cabeçalho; usei a 1ª coluna como data e a 1ª coluna com número como energia (kWh). Confira os valores.');
  }

  const porDia = new Map<string, number>();
  let ignoradas = 0;
  for (const r of tabela.slice(iCab + 1)) {
    const data = lerData(r[cData] ?? '');
    const n = lerNumero(r[cEnergia] ?? '');
    if (!data || n === null || n < 0) { ignoradas++; continue; }
    porDia.set(data, Math.round(n * fator * 1000) / 1000); // repetido: fica o último
  }
  if (ignoradas) avisos.push(`${ignoradas} linha(s) sem data ou energia válida foram ignoradas.`);
  const linhas = [...porDia].map(([data, kwh]) => ({ data, kwh })).sort((a, b) => a.data.localeCompare(b.data));
  if (fator !== 1) avisos.push(fator > 1 ? 'Energia estava em MWh — convertida para kWh.' : 'Energia estava em Wh — convertida para kWh.');
  return { linhas, avisos };
}
