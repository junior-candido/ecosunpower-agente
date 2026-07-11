// src/modules/email/email-sequence.ts
// Envia so em dias uteis (seg-sex), das 9h as 20h BRT (UTC-3).
export function podeEnviarAgora(now: Date = new Date()): boolean {
  const brtMs = now.getTime() - 3 * 60 * 60 * 1000;
  const brt = new Date(brtMs);
  const dia = brt.getUTCDay();          // 0=domingo ... 6=sabado
  const hora = brt.getUTCHours();
  if (dia === 0 || dia === 6) return false;
  return hora >= 9 && hora < 20;
}
