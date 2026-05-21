// src/modules/relatorios/pos-instalacao/cron.ts
import type { SupabaseService } from '../../supabase.js';
import { dentroDaJanela } from '../../monitoring/proactive-alerts/janela.js';

export interface PosInstalacaoNotifCtx {
  supabase: SupabaseService;
  sendText: (to: string, text: string) => Promise<void>;
  adminPhone: string;
  dashboardBaseUrl: string;
}

export async function runPosInstalacaoNotifCycle(
  hoje: Date,
  ctx: PosInstalacaoNotifCtx,
): Promise<{ notificados: number; falhas: number; janelaAberta: boolean }> {
  if (!dentroDaJanela(hoje)) {
    return { notificados: 0, falhas: 0, janelaAberta: false };
  }

  const leads = await ctx.supabase.getLeadsMedidorTrocadoSemRelatorio();
  let notificados = 0;
  let falhas = 0;

  for (const lead of leads) {
    const nome = lead.name ?? 'Cliente sem nome';
    const link = `${ctx.dashboardBaseUrl}/dashboard/clientes/${lead.id}/relatorio-pos-instalacao/novo`;
    const body =
      `📋 Hora do relatório pós-instalação\n\n` +
      `Cliente *${nome}* teve o medidor trocado. Vai gerar e enviar o relatório com fotos da obra?\n\n` +
      `👉 ${link}`;

    try {
      await ctx.sendText(ctx.adminPhone, body);
      notificados++;
    } catch (err) {
      console.error('[pos-instalacao] falha ao notificar lead', lead.id, (err as Error).message);
      falhas++;
    }
  }

  console.log(`[pos-instalacao] notif cycle: ${notificados} notificados, ${falhas} falhas, ${leads.length} candidatos`);
  return { notificados, falhas, janelaAberta: true };
}
