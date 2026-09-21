// Leitor do "Mini e Microgeracao — Demonstrativo do Faturamento" da Neoenergia.
//
// A concessionaria manda esse PDF por e-mail todo mes (remetente
// r2d2.frms@neoenergia.com, anexo RelatorioResumo.pdf, sem senha). Ele traz o
// que ela MEDE — injetado, consumido, compensado, saldo de creditos, rateio —
// mas nao a geracao, que so o monitoramento sabe. Ver
// docs/superpowers/specs/2026-09-21-demonstrativo-gd-ingestao-design.md.
//
// Funcao PURA: recebe o texto que o unpdf extrai do PDF e devolve os numeros.
// Numero de credito vira dinheiro na conta do cliente, entao nada de chute:
// ou o campo casa com o layout, ou fica nulo; e as somas que o proprio
// documento deveria fechar sao conferidas e viram `inconsistencias`.

export interface LinhaHistorico {
  mes: string; // YYYY-MM-01
  codigoCliente: string;
  consumida: number;
  injetada: number;
  faturada: number;
  compensado: number;
  credito: number;
}

export interface UnidadeRateio {
  codigoCliente: string;
  percentual: number;
  saldo: number;
}

export interface DemonstrativoGd {
  clienteNome: string;
  codigoCliente: string;
  instalacao: string;
  referencia: string; // YYYY-MM-01
  // Bloco "Injetado" (linha Gerador)
  medidor: string | null;
  injetadoKwh: number | null;
  saldoMesAnteriorKwh: number | null;
  injetadoAcumuladoKwh: number | null;
  // Bloco "Consumo" (linha Consumidor)
  consumoKwh: number | null;
  creditoUtilizadoKwh: number | null;
  creditoRestanteKwh: number | null;
  creditoExpira: string | null;
  historico: LinhaHistorico[];
  // Totais
  totalInjetadoKwh: number | null;
  totalCompensadoKwh: number | null;
  saldoAcumuladoKwh: number | null;
  proximoExpirarKwh: number | null;
  cicloExpirar: string | null;
  creditosExpiradosKwh: number | null;
  unidades: UnidadeRateio[];
}

export type ResultadoParse =
  | { ok: true; dados: DemonstrativoGd; inconsistencias: string[] }
  | { ok: false; motivo: string };

// Numero no formato brasileiro: milhar com ponto, decimal com virgula.
const N = String.raw`-?\d[\d.]*(?:,\d+)?`;

export function numeroBr(s: string): number | null {
  const t = (s ?? '').trim();
  if (!new RegExp(`^${N}$`).test(t)) return null;
  const v = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

const MESES: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function montaData(ano: number, mes: number): string | null {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12 || ano < 2000 || ano > 2100) return null;
  return `${ano}-${String(mes).padStart(2, '0')}-01`;
}

/** 'mai/2026', '06/2026' ou 'junho de 2026' → '2026-05-01'. */
export function mesParaData(s: string): string | null {
  const t = semAcento((s ?? '').trim().toLowerCase());
  let m = /^(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return montaData(Number(m[2]), Number(m[1]));
  m = /^([a-z]+)\/(\d{4})$/.exec(t);
  if (m) return MESES[m[1].slice(0, 3)] && m[1].length === 3 ? montaData(Number(m[2]), MESES[m[1]]) : null;
  m = /^([a-z]+) de (\d{4})$/.exec(t);
  if (m) {
    const mes = MESES[m[1].slice(0, 3)];
    return mes ? montaData(Number(m[2]), mes) : null;
  }
  return null;
}

function num(s: string | undefined): number | null {
  return s === undefined ? null : numeroBr(s);
}

const MES_NUM = String.raw`\d{2}\/\d{4}`;
const MES_TXT = String.raw`[a-zA-Z]{3}\/\d{4}`;

export function parseDemonstrativo(texto: string): ResultadoParse {
  const t = (texto ?? '').replace(/\r\n?/g, '\n');
  if (!/Faturamento\s+Microgera/i.test(t) && !/Demonstrativo/i.test(t)) {
    return { ok: false, motivo: 'nao parece um demonstrativo de microgeracao' };
  }

  // "Cliente: NOME - 779577 - 718871"  (codigo do cliente, instalacao)
  const cli = /^Cliente:\s*(.+?)\s+-\s+(\d+)\s+-\s+(\d+)\s*$/m.exec(t);
  if (!cli) return { ok: false, motivo: 'linha do cliente (codigo e instalacao) nao encontrada' };
  const [, clienteNome, codigoCliente, instalacao] = cli;

  // Bloco Injetado — "Gerador <medidor> <instalacao> <de> <ate> <mm/aaaa> <injetado> <saldo ant> <acum>"
  const ger = new RegExp(
    String.raw`^Gerador\s+(\d+)\s+(\d+)\s+(${N})\s+(${N})\s+(${MES_NUM})\s+(${N})\s+(${N})\s+(${N})\s*$`,
    'm',
  ).exec(t);

  // Referencia: "Periodo: junho de 2026"; se faltar, o mes da linha Gerador.
  const per = /^Per[ií]odo:\s*(.+?)\s*$/m.exec(t);
  const referencia = (per && mesParaData(per[1])) ?? (ger ? mesParaData(ger[5]) : null);
  if (!referencia) return { ok: false, motivo: 'mes de referencia nao encontrado' };

  // Bloco Consumo — "Consumidor <medidor> <instalacao> <de> <ate> <consumo>"
  // e na linha de baixo "<mm/aaaa> <utilizado> <restante> <expira mm/aaaa>"
  const con = new RegExp(String.raw`^Consumidor\s+(\d+)\s+(\d+)\s+(${N})\s+(${N})\s+(${N})\s*$`, 'm').exec(t);
  const cred = new RegExp(String.raw`^(${MES_NUM})\s+(${N})\s+(${N})\s+(${MES_NUM})\s*$`, 'm').exec(t);

  // Historico: "mai/2026 779577 357 664 100 283,97 380,03"
  const historico: LinhaHistorico[] = [];
  const reHist = new RegExp(
    String.raw`^(${MES_TXT})\s+(\d+)\s+(${N})\s+(${N})\s+(${N})\s+(${N})\s+(${N})\s*$`,
    'gm',
  );
  for (const m of t.matchAll(reHist)) {
    const mes = mesParaData(m[1]);
    const vals = [m[3], m[4], m[5], m[6], m[7]].map(numeroBr);
    if (!mes || vals.some((v) => v === null)) continue;
    const [consumida, injetada, faturada, compensado, credito] = vals as number[];
    historico.push({ mes, codigoCliente: m[2], consumida, injetada, faturada, compensado, credito });
  }

  // Totais — linha logo depois de "EXPIRADOS":
  // "<total inj> <total comp> <saldo> <prox a expirar> <ciclo mm/aaaa | -> <expirados>"
  const tot = new RegExp(
    String.raw`EXPIRADOS\s*\n\s*(${N})\s+(${N})\s+(${N})\s+(${N})\s+(${MES_NUM}|-)\s+(${N})\s*$`,
    'm',
  ).exec(t);

  // Unidades: "779577 100 % 10998,67" depois do cabecalho do resumo por unidade.
  const unidades: UnidadeRateio[] = [];
  const iRes = t.search(/RESUMO DO SALDO DE CR[EÉ]DITO POR UNIDADE/i);
  if (iRes >= 0) {
    const reUni = new RegExp(String.raw`^(\d+)\s+(${N})\s*%\s+(${N})\s*$`, 'gm');
    for (const m of t.slice(iRes).matchAll(reUni)) {
      const percentual = numeroBr(m[2]);
      const saldo = numeroBr(m[3]);
      if (percentual === null || saldo === null) continue;
      unidades.push({ codigoCliente: m[1], percentual, saldo });
    }
  }

  const dados: DemonstrativoGd = {
    clienteNome: clienteNome.trim(),
    codigoCliente,
    instalacao,
    referencia,
    medidor: ger ? ger[1] : null,
    injetadoKwh: num(ger?.[6]),
    saldoMesAnteriorKwh: num(ger?.[7]),
    injetadoAcumuladoKwh: num(ger?.[8]),
    consumoKwh: num(con?.[5]),
    creditoUtilizadoKwh: num(cred?.[2]),
    creditoRestanteKwh: num(cred?.[3]),
    creditoExpira: cred ? mesParaData(cred[4]) : null,
    historico,
    totalInjetadoKwh: num(tot?.[1]),
    totalCompensadoKwh: num(tot?.[2]),
    saldoAcumuladoKwh: num(tot?.[3]),
    proximoExpirarKwh: num(tot?.[4]),
    cicloExpirar: tot && tot[5] !== '-' ? mesParaData(tot[5]) : null,
    creditosExpiradosKwh: num(tot?.[6]),
    unidades,
  };

  return { ok: true, dados, inconsistencias: conferir(dados) };
}

const TOL_KWH = 0.1;
const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** Somas que o proprio documento deveria fechar. Nao bloqueia — sinaliza. */
function conferir(d: DemonstrativoGd): string[] {
  const out: string[] = [];
  if (d.injetadoKwh === null) out.push('bloco Injetado (linha Gerador) nao encontrado');
  if (d.saldoAcumuladoKwh === null) out.push('totais (saldo acumulado) nao encontrados');

  if (d.totalInjetadoKwh !== null && d.totalCompensadoKwh !== null && d.saldoAcumuladoKwh !== null) {
    const esperado = d.totalInjetadoKwh - d.totalCompensadoKwh - (d.creditosExpiradosKwh ?? 0);
    if (Math.abs(esperado - d.saldoAcumuladoKwh) > TOL_KWH) {
      out.push(
        `saldo acumulado ${fmt(d.saldoAcumuladoKwh)} kWh nao fecha com injetado − compensado − expirado (${fmt(esperado)} kWh)`,
      );
    }
  }

  if (d.unidades.length > 0) {
    const somaPct = d.unidades.reduce((s, u) => s + u.percentual, 0);
    if (Math.abs(somaPct - 100) > 0.01) out.push(`percentuais do rateio somam ${fmt(somaPct)}%, nao 100%`);
    const somaSaldo = d.unidades.reduce((s, u) => s + u.saldo, 0);
    if (d.saldoAcumuladoKwh !== null && Math.abs(somaSaldo - d.saldoAcumuladoKwh) > TOL_KWH * d.unidades.length) {
      out.push(
        `saldos das unidades somam ${fmt(somaSaldo)} kWh, diferente do saldo acumulado ${fmt(d.saldoAcumuladoKwh)} kWh`,
      );
    }
  }
  return out;
}
