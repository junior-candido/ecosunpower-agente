// src/modules/proposal/bateria.ts
// Bateria do sistema híbrido: tipo + cálculos puros (capacidade total e
// autonomia de backup). A presença de bateria é o que marca a proposta como
// híbrida. NÃO mexe em economia/payback.

export interface Bateria {
  fabricante: string;
  modelo: string;
  capacidadeKwh: number; // por unidade
  quantidade: number;
  garantia: number;      // anos
  fichaOverride?: string;
}

// Profundidade de descarga útil — bateria não entrega 100% da capacidade.
export const DOD_UTIL = 0.9;

type BateriaMin = Pick<Bateria, 'capacidadeKwh' | 'quantidade'>;

// Há bateria válida pra renderizar/calcular? (define o "híbrido")
export function temBateria(b?: BateriaMin | null): boolean {
  return !!b && b.capacidadeKwh > 0 && b.quantidade > 0;
}

// Capacidade total instalada (kWh).
export function capacidadeTotalKwh(b: BateriaMin): number {
  return Math.round(b.capacidadeKwh * b.quantidade * 100) / 100;
}

// Horas de autonomia no consumo médio do cliente. null se não dá pra estimar
// ou se daria menos de 1h (aí "~0h" só atrapalharia — melhor omitir a linha).
export function autonomiaBackupHoras(b: BateriaMin, consumoMensalKwh: number): number | null {
  if (consumoMensalKwh <= 0) return null;
  const energiaUtilKwh = capacidadeTotalKwh(b) * DOD_UTIL;
  const consumoMedioKw = consumoMensalKwh / 30 / 24;
  if (consumoMedioKw <= 0) return null;
  const horas = Math.round(energiaUtilKwh / consumoMedioKw);
  return horas >= 1 ? horas : null;
}
