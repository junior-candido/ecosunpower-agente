// src/modules/relatorios/pos-instalacao/cron.ts
import type { SupabaseService } from '../../supabase.js';
import { dentroDaJanela } from '../../monitoring/proactive-alerts/janela.js';
import { avisoAdminSoDaCasa, ehCasa, type RotaAvisoAdmin } from '../../canal-automatico.js';

export interface PosInstalacaoNotifCtx {
  supabase: SupabaseService;
  sendText: (to: string, text: string) => Promise<void>;
  /** Admin da CASA. Tenant usa o admin dele, via `avisarAdmin`. */
  adminPhone: string;
  dashboardBaseUrl: string;
  /**
   * LGPD (28/09/2026): o aviso vai pro admin DA empresa do lead, pelo canal
   * dela (canal-automatico.ts). Ausente = só a casa é avisada; lead de tenant
   * nunca cai no zap do Junior.
   */
  avisarAdmin?: RotaAvisoAdmin;
}

export async function runPosInstalacaoNotifCycle(
  hoje: Date,
  ctx: PosInstalacaoNotifCtx,
): Promise<{ notificados: number; falhas: number; janelaAberta: boolean }> {
  if (!dentroDaJanela(hoje)) {
    return { notificados: 0, falhas: 0, janelaAberta: false };
  }

  const avisar = ctx.avisarAdmin ?? avisoAdminSoDaCasa(ctx.adminPhone);
  const leads = await ctx.supabase.getLeadsMedidorTrocadoSemRelatorio();
  let notificados = 0;
  let falhas = 0;
  let barrados = 0;

  for (const lead of leads) {
    // A tela do relatório (/dashboard/clientes/...) ainda é SÓ da casa
    // (soEcosunPorEnquanto): pro tenant o link cairia em "Em breve". Lead de
    // tenant não gera aviso nenhum — nem pro Junior, nem pro admin dele.
    // Quando a tela abrir pro tenant, é só tirar este if (a rota já é por empresa).
    if (!ehCasa(lead.company_id)) { barrados++; continue; }
    const nome = lead.name ?? 'Cliente sem nome';
    const link = `${ctx.dashboardBaseUrl}/dashboard/clientes/${lead.id}/relatorio-pos-instalacao/novo`;
    const body =
      `📋 Hora do relatório pós-instalação\n\n` +
      `Cliente *${nome}* teve o medidor trocado. Vai gerar e enviar o relatório com fotos da obra?\n\n` +
      `👉 ${link}`;

    try {
      const r = await avisar(lead.company_id ?? null, (to) => ctx.sendText(to, body));
      if (r === 'enviado') notificados++;
      else barrados++;
    } catch (err) {
      console.error('[pos-instalacao] falha ao notificar lead', lead.id, (err as Error).message);
      falhas++;
    }
  }

  console.log(`[pos-instalacao] notif cycle: ${notificados} notificados, ${falhas} falhas, ${barrados} sem canal/admin, ${leads.length} candidatos`);
  return { notificados, falhas, janelaAberta: true };
}
