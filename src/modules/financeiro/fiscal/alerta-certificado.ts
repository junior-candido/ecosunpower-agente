// src/modules/financeiro/fiscal/alerta-certificado.ts
// Aviso no zap do Junior quando o certificado A1 está pra vencer (30/15/5 dias e vencido).
// Chamado pelo cron diário (mesmo tick dos vencimentos financeiros).
export function mensagemAlertaCertificado(validadeIso: string | null, hojeIso: string): string | null {
  if (!validadeIso) return null;
  const dias = Math.round((Date.parse(validadeIso) - Date.parse(hojeIso)) / 864e5);
  if (dias < 0) return `🚨 Certificado digital A1 VENCEU em ${validadeIso.split('-').reverse().join('/')} — sem ele não emite nota. Renove hoje.`;
  if (dias === 30 || dias === 15 || dias === 5) return `⚠️ Certificado digital A1 vence em ${dias} dias (${validadeIso.split('-').reverse().join('/')}). Renove pra não travar a emissão de nota.`;
  return null;
}
