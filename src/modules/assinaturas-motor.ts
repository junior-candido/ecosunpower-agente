// src/modules/assinaturas-motor.ts
// Motor automático das mensalidades (fatia 2). Régua do Junior:
// 8d antes: link + aviso · 2d antes: lembrete · venceu: 3d de tolerância com
// último aviso · depois trava (e o Junior fica sabendo no zap).
// Tudo por janela (não data exata): se o cron perder um dia, sai no seguinte.
import type { StatusAssinatura } from './dashboard/assinaturas-store.js';

export type Acao = 'aviso8' | 'aviso2' | 'ultimo' | 'travar';

const DIA_MS = 86_400_000;

export function acaoDoDia(
  a: { status: StatusAssinatura; venceEm: string },
  hoje: string,
  jaEnviados: ReadonlySet<string>,
): Acao | null {
  if (a.status !== 'ativa') return null;
  const dias = Math.round((Date.parse(a.venceEm) - Date.parse(hoje)) / DIA_MS);
  if (dias < -3) return 'travar';
  if (dias < 0) return jaEnviados.has('ultimo') ? null : 'ultimo';
  if (dias <= 2) return jaEnviados.has('aviso2') ? null : 'aviso2';
  if (dias <= 8) return jaEnviados.has('aviso8') ? null : 'aviso8';
  return null;
}
