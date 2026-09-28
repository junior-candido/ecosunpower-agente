// src/modules/energia/balanco.ts
//
// A conta que o cliente paga para ter (spec §4.4):
//   consumo           = gerado + comprado − devolvido
//   autoconsumo %     = (gerado − devolvido) ÷ gerado      (parcela do sol usada na hora)
//   autossuficiência %= (gerado − devolvido) ÷ consumo     (parcela da casa atendida pelo sol na hora)
//
// Sem geração → não calcula (não inventa). Gerou menos do que devolveu → o
// cadastro está errado (usina errada, TC trocado, geração faltando): avisa.

export interface Balanco {
  geradoKwh: number | null;
  importadoKwh: number;
  exportadoKwh: number;
  consumoKwh: number | null;
  autoconsumoPct: number | null;
  autossuficienciaPct: number | null;
  aviso: 'sem_geracao' | 'conferir_cadastro' | null;
}

export function balancoEnergia(e: { geradoKwh: number | null; importadoKwh: number; exportadoKwh: number }): Balanco {
  const base = { geradoKwh: e.geradoKwh, importadoKwh: e.importadoKwh, exportadoKwh: e.exportadoKwh };
  const nada = { consumoKwh: null, autoconsumoPct: null, autossuficienciaPct: null };
  if (e.geradoKwh == null || !Number.isFinite(e.geradoKwh)) return { ...base, ...nada, aviso: 'sem_geracao' };
  if (e.geradoKwh < e.exportadoKwh) return { ...base, ...nada, aviso: 'conferir_cadastro' };
  const usadoNaHora = e.geradoKwh - e.exportadoKwh;
  const consumo = e.geradoKwh + e.importadoKwh - e.exportadoKwh;
  return {
    ...base,
    consumoKwh: consumo,
    autoconsumoPct: e.geradoKwh > 0 ? (usadoNaHora / e.geradoKwh) * 100 : null,
    autossuficienciaPct: consumo > 0 ? (usadoNaHora / consumo) * 100 : null,
    aviso: null,
  };
}
