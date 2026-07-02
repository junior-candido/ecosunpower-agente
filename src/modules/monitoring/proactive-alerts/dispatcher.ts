// src/modules/monitoring/proactive-alerts/dispatcher.ts
import type { SupabaseService } from '../../supabase.js';
import { dentroDaJanela } from './janela.js';
import { formatAlertMessage } from './format.js';
import type { MonitoringAlertRow, AlertButton } from './types.js';

export interface DispatchCtx {
  supabase: SupabaseService;
  sendAdminWithButtons: (
    to: string,
    body: string,
    buttons: AlertButton[],
    footer?: string,
  ) => Promise<void>;
  adminPhone: string;
  dryRun?: boolean;
  // Eva Monitoramento Evolutivo (Task 8): alerta de tipo "cliente" com dono
  // vinculado tenta virar abordagem da Eva AO CLIENTE antes do alerta admin.
  // O wrapper (montado no index) recalcula diasOffline/percentualQueda reais
  // e chama o orquestrador. Campo opcional: sem ele o fluxo é 100% o atual.
  proporAbordagem?: (
    alerta: MonitoringAlertRow,
    sistema: { id: string; apelido: string; potencia_kwp: number | null; marca_inversor: string; lead_id: string | null; uf: string | null },
    lead: { id: string; name: string | null; phone: string },
  ) => Promise<'proposta' | 'enviada' | 'inelegivel'>;
  // Resumo diário (incremento 2): com dono + autonomia OFF, queda/milestone
  // NÃO viram mensagem individual — o resumo diário cobre (ação no painel).
  // Campo opcional: sem ele, comportamento 100% atual (compat).
  autonomiaOn?: (tipo: 'queda' | 'parabens') => Promise<boolean>;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

export async function runDispatchCycle(hoje: Date, ctx: DispatchCtx): Promise<{
  enviados: number; dryRunSimulados: number; janelaAberta: boolean;
}> {
  if (!dentroDaJanela(hoje)) {
    console.log('[proactive-alerts] dispatch: fora da janela, pulando');
    return { enviados: 0, dryRunSimulados: 0, janelaAberta: false };
  }
  const fila = await ctx.supabase.getAlertasParaDespachar(hoje.toISOString(), 8) as MonitoringAlertRow[];

  let enviados = 0;
  let dryRunSimulados = 0;
  for (const alerta of fila) {
    const nextSendAtOriginal = alerta.next_send_at!;
    const locked = await ctx.supabase.lockAlertaParaEnvio(alerta.id);
    if (!locked) continue;

    try {
      const sistema = await ctx.supabase.getSistemaById(alerta.sistema_id);
      if (!sistema) {
        await ctx.supabase.unlockAlerta(alerta.id, nextSendAtOriginal);
        continue;
      }
      const lead = sistema.lead_id ? await ctx.supabase.getLeadById(sistema.lead_id) : null;

      // Resumo diário: não-urgente em treino é absorvido (sem mensagem
      // individual). Offline/erro_integracao/órfã NUNCA passam por aqui.
      if (ctx.autonomiaOn && lead && lead.phone &&
          (alerta.tipo === 'queda_geracao' || alerta.tipo === 'milestone_economia')) {
        const tipoFlag = alerta.tipo === 'queda_geracao' ? 'queda' : 'parabens';
        let auto = true; // erro na leitura da config → segue o fluxo atual (seguro)
        try { auto = await ctx.autonomiaOn(tipoFlag); } catch { auto = true; }
        if (!auto) {
          if (ctx.dryRun) {
            console.log(`[proactive-alerts] dispatch DRY: absorveria no resumo — alerta=${alerta.id} tipo=${alerta.tipo}`);
            await ctx.supabase.unlockAlerta(alerta.id, addDays(hoje, 3).toISOString());
            dryRunSimulados++;
            continue;
          }
          await ctx.supabase.marcarAlertaAbsorvidoPorResumo(
            alerta.id, hoje.toISOString(), addDays(hoje, 3).toISOString());
          console.log(`[proactive-alerts] dispatch: absorvido pelo resumo — alerta=${alerta.id} tipo=${alerta.tipo}`);
          continue;
        }
      }

      // Eva Monitoramento Evolutivo: alerta de tipo "cliente" com dono vinculado
      // tenta virar abordagem ao cliente. Inelegível → fluxo atual (alerta admin).
      // O orquestrador trata os próprios erros (devolve 'inelegivel') — nada
      // aqui muda o caminho de alertas erro_integracao/órfãs.
      if (ctx.proporAbordagem && lead && lead.phone &&
          (alerta.tipo === 'sistema_offline' || alerta.tipo === 'queda_geracao' || alerta.tipo === 'milestone_economia')) {
        // Dry-run fiel à spec ("simula e loga, NÃO envia — igual alertas
        // atuais"): NADA de abordagem é criado/mandado — nem pro admin.
        // Mesmo padrão do dry-run de alerta admin logo abaixo.
        if (ctx.dryRun) {
          console.log(`[proactive-alerts] dispatch DRY: abordaria cliente — alerta=${alerta.id} sistema=${alerta.sistema_id} tipo=${alerta.tipo}`);
          await ctx.supabase.unlockAlerta(alerta.id, addDays(hoje, 3).toISOString()); // simula throttle 3d
          dryRunSimulados++;
          continue;
        }
        const resultado = await ctx.proporAbordagem(alerta, sistema, lead);
        if (resultado !== 'inelegivel') {
          // O alerta foi absorvido pelo motor de abordagem — não compete por 30d.
          await ctx.supabase.marcarAlertaEnviado(alerta.id, hoje.toISOString(), addDays(hoje, 30).toISOString());
          enviados++;
          continue;
        }
        // inelegível → segue pro alerta admin normal abaixo
      }

      const { texto, botoes, footer } = formatAlertMessage(alerta, sistema, lead);

      if (ctx.dryRun) {
        console.log(`[proactive-alerts] dispatch DRY: alerta=${alerta.id} sistema=${alerta.sistema_id} tipo=${alerta.tipo}`);
        await ctx.supabase.unlockAlerta(alerta.id, addDays(hoje, 3).toISOString()); // simula throttle 3d
        dryRunSimulados++;
        continue;
      }

      await ctx.sendAdminWithButtons(ctx.adminPhone, texto, botoes, footer);
      await ctx.supabase.marcarAlertaEnviado(
        alerta.id,
        hoje.toISOString(),
        addDays(hoje, 3).toISOString(),
      );
      enviados++;
    } catch (err) {
      console.error('[proactive-alerts] dispatch falhou:', (err as Error).message);
      await ctx.supabase.unlockAlerta(alerta.id, nextSendAtOriginal);
    }
  }
  console.log(`[proactive-alerts] dispatch: ${enviados} enviados, ${dryRunSimulados} dry-run, ${fila.length - enviados - dryRunSimulados} ficaram pendentes`);
  return { enviados, dryRunSimulados, janelaAberta: true };
}
