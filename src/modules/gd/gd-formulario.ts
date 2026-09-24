// Digitação na tela de demonstrativos: número do jeito que a pessoa digita
// (1.234,5 · 612.4 · 612,4) e campos do demonstrativo digitados à mão.
// Função PURA. Mesmo formato de saída do leitor do PDF (DemonstrativoGd) —
// assim o que foi digitado passa pelas mesmas travas e é gravado igual.

import { numeroBr, type DemonstrativoGd } from './demonstrativo-parser.js';

/** kWh digitado → número. Nunca adivinha: formato estranho vira null. */
export function numeroForm(s: string | null | undefined): number | null {
  const t = (s ?? '').trim().replace(/\s/g, '');
  if (!t) return null;
  let v: number | null = null;
  if (t.includes(',')) v = numeroBr(t);
  else if (/^\d+$/.test(t)) v = Number(t);
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) v = Number(t.replace(/\./g, '')); // 1.234 = milhar
  else if (/^\d+\.\d{1,2}$/.test(t)) v = Number(t);                         // 612.4 = decimal
  return v !== null && Number.isFinite(v) && v >= 0 ? v : null;
}

/** 'YYYY-MM' (input type=month) → 'YYYY-MM-01'. */
export function mesInput(s: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec((s ?? '').trim());
  if (!m) return null;
  const mes = Number(m[2]);
  return mes >= 1 && mes <= 12 ? `${m[1]}-${m[2]}-01` : null;
}

export interface CamposDigitados {
  clienteNome: string;
  codigoCliente: string;
  instalacao: string;
  mes: string;            // YYYY-MM
  injetado: string;
  consumo: string;
  creditoUtilizado: string;
  saldoAcumulado: string;
  proximoExpirar: string; // opcional
  cicloExpirar: string;   // YYYY-MM, opcional
}

export type ResultadoDigitado = { ok: true; dados: DemonstrativoGd } | { ok: false; erros: string[] };

export function montarDigitado(c: CamposDigitados): ResultadoDigitado {
  const erros: string[] = [];
  const nome = (c.clienteNome ?? '').trim();
  if (!nome) erros.push('Nome do cliente é obrigatório.');
  const codigo = (c.codigoCliente ?? '').replace(/\D/g, '');
  const instalacao = (c.instalacao ?? '').replace(/\D/g, '');
  if (!/^\d{3,15}$/.test(instalacao)) erros.push('Instalação (UC) precisa ser só números.');
  const referencia = mesInput(c.mes);
  if (!referencia) erros.push('Mês de referência inválido.');

  const obrig = (rotulo: string, s: string): number | null => {
    const v = numeroForm(s);
    if (v === null) erros.push(`${rotulo}: número inválido.`);
    return v;
  };
  const injetado = obrig('Injetado', c.injetado);
  const consumo = obrig('Consumo', c.consumo);
  const creditoUtilizado = obrig('Crédito utilizado', c.creditoUtilizado);
  const saldo = obrig('Saldo acumulado', c.saldoAcumulado);

  const proximo = (c.proximoExpirar ?? '').trim() ? numeroForm(c.proximoExpirar) : null;
  if ((c.proximoExpirar ?? '').trim() && proximo === null) erros.push('Crédito a expirar: número inválido.');
  const ciclo = (c.cicloExpirar ?? '').trim() ? mesInput(c.cicloExpirar) : null;
  if ((c.cicloExpirar ?? '').trim() && ciclo === null) erros.push('Mês de expiração inválido.');
  if (ciclo !== null && proximo === null) erros.push('Informe quantos kWh expiram nesse mês.');

  if (erros.length > 0) return { ok: false, erros };
  return {
    ok: true,
    dados: {
      clienteNome: nome,
      codigoCliente: codigo || instalacao,
      instalacao,
      referencia: referencia!,
      medidor: null,
      injetadoKwh: injetado,
      saldoMesAnteriorKwh: null,
      injetadoAcumuladoKwh: null,
      consumoKwh: consumo,
      creditoUtilizadoKwh: creditoUtilizado,
      creditoRestanteKwh: null,
      creditoExpira: null,
      historico: [],
      totalInjetadoKwh: null,
      totalCompensadoKwh: null,
      saldoAcumuladoKwh: saldo,
      proximoExpirarKwh: proximo,
      cicloExpirar: ciclo,
      creditosExpiradosKwh: null,
      unidades: [],
    },
  };
}
