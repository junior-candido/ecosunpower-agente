// eva-admin-buttons.ts
// Botoes interativos WABA pros alertas/digest da Eva pro Junior.
//
// Padrao do id: "evabt:<acao>" ou "evabt:<acao>:<leadId>".
// Acoes suportadas:
//   - dash-leads             -> responde com URL /dashboard/leads
//   - dash-alerts            -> URL /dashboard/leads?only_alerts=1
//   - cad-force              -> dispara cadencia pros silentes agora (force=true)
//   - lead-view:<id>         -> URL /dashboard/leads/<id>
//   - lead-pause:<id>        -> seta eva_active=false (Junior assume)
//   - lead-resume:<id>       -> seta eva_active=true
//   - lead-optout:<id>       -> opt_out=true + eva_active=false + cancela cadencia
//   - lead-cad-cancel:<id>   -> cancela cadencia pendente
//
// Fallback: se metaWaba=null (Evolution), envia somente texto sem botoes.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseService } from './supabase.js';

export interface MetaWabaLike {
  sendInteractiveButtons(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
    footer?: string,
  ): Promise<{ messageId: string }>;
}

export interface AdminButtonCtx {
  metaWaba: MetaWabaLike | null;
  sendText: (to: string, text: string) => Promise<void>;
}

/**
 * Envia mensagem com botoes interativos se WABA disponivel. Senao envia
 * texto puro (sem os IDs como instrucao — botao nao ajuda no Evolution).
 */
export async function sendAdminWithButtons(
  ctx: AdminButtonCtx,
  to: string,
  body: string,
  buttons: Array<{ id: string; title: string }>,
  footer?: string,
): Promise<void> {
  if (ctx.metaWaba && buttons.length > 0 && buttons.length <= 3) {
    try {
      await ctx.metaWaba.sendInteractiveButtons(to, body, buttons, footer);
      return;
    } catch (err) {
      console.warn('[admin-buttons] WABA falhou, fallback texto:', (err as Error).message);
    }
  }
  await ctx.sendText(to, body);
}

const DASHBOARD_BASE = 'https://dashboard.ecosunpower.eng.br';

/**
 * Handler de botoes admin. Retorna true se o text foi um botao reconhecido
 * (e ja foi processado). Caller deve return depois pra nao re-rotear.
 *
 * Pre-condicao: caller deve ter verificado que `from` eh admin.
 */
export async function tryHandleEvaAdminButton(args: {
  client: SupabaseClient;
  sendText: (to: string, text: string) => Promise<void>;
  from: string;
  text: string;
  forceCadenceForSilentes: () => Promise<{ acionados: number }>;
  supabase?: SupabaseService;
  onFecharStart?: (leadId: string) => Promise<void>;
  onFecharPick?: (leadId: string) => Promise<void>;
  onFecharApprove?: (fechamentoId: string) => Promise<void>;
  onFecharRefazer?: (fechamentoId: string) => Promise<void>;
  onFecharCancel?: (fechamentoId: string) => Promise<void>;
}): Promise<boolean> {
  const m = args.text.trim().match(/^evabt:([a-z0-9-]+)(?::([0-9a-f-]{36}))?$/i);
  if (!m) return false;

  const action = m[1];
  const leadId = m[2];

  try {
    switch (action) {
      case 'dash-leads':
        await args.sendText(args.from, `📊 Dashboard de leads:\n${DASHBOARD_BASE}/leads`);
        return true;

      case 'dash-alerts':
        await args.sendText(args.from, `🚨 Leads com alerta:\n${DASHBOARD_BASE}/leads?only_alerts=1`);
        return true;

      case 'cad-force': {
        const r = await args.forceCadenceForSilentes();
        await args.sendText(
          args.from,
          `📤 Cadência disparada pra ${r.acionados} lead(s) silente(s). Próximos toques chegam em até 1h.`,
        );
        return true;
      }

      case 'lead-view': {
        if (!leadId) {
          await args.sendText(args.from, '⚠️ Botão sem lead id.');
          return true;
        }
        await args.sendText(args.from, `👤 Perfil do lead:\n${DASHBOARD_BASE}/leads/${leadId}`);
        return true;
      }

      case 'lead-pause': {
        if (!leadId) {
          await args.sendText(args.from, '⚠️ Botão sem lead id.');
          return true;
        }
        const { error } = await args.client
          .from('leads')
          .update({ eva_active: false, updated_at: new Date().toISOString() })
          .eq('id', leadId);
        if (error) throw new Error(error.message);
        // Tambem cancela cadencia pendente pra Eva nao mandar toque por cima.
        await args.client
          .from('eva_cadence')
          .update({ status: 'cancelled', cancelled_reason: 'admin_assumed' })
          .eq('lead_id', leadId)
          .eq('status', 'pending');
        await args.sendText(
          args.from,
          `✋ Eva pausada pra este lead e cadência cancelada. Você assume daqui. Pra retomar: /eva on neste número OU clique em retomar no dashboard.`,
        );
        return true;
      }

      case 'lead-resume': {
        if (!leadId) {
          await args.sendText(args.from, '⚠️ Botão sem lead id.');
          return true;
        }
        const { error } = await args.client
          .from('leads')
          .update({ eva_active: true, updated_at: new Date().toISOString() })
          .eq('id', leadId);
        if (error) throw new Error(error.message);
        await args.sendText(args.from, `▶️ Eva retomou esse lead.`);
        return true;
      }

      case 'lead-optout': {
        if (!leadId) {
          await args.sendText(args.from, '⚠️ Botão sem lead id.');
          return true;
        }
        const now = new Date().toISOString();
        const { error: e1 } = await args.client
          .from('leads')
          .update({ opt_out: true, eva_active: false, updated_at: now })
          .eq('id', leadId);
        if (e1) throw new Error(e1.message);
        await args.client
          .from('eva_cadence')
          .update({ status: 'cancelled', cancelled_reason: 'opt_out' })
          .eq('lead_id', leadId)
          .eq('status', 'pending');
        await args.sendText(args.from, `🚫 Lead marcado como opt-out. Eva não fala mais com ele.`);
        return true;
      }

      case 'lead-cad-cancel': {
        if (!leadId) {
          await args.sendText(args.from, '⚠️ Botão sem lead id.');
          return true;
        }
        const { error } = await args.client
          .from('eva_cadence')
          .update({ status: 'cancelled', cancelled_reason: 'manual_admin_button' })
          .eq('lead_id', leadId)
          .eq('status', 'pending');
        if (error) throw new Error(error.message);
        await args.sendText(args.from, `✋ Cadência cancelada pra este lead.`);
        return true;
      }

      case 'fechar': {
        if (!leadId) { await args.sendText(args.from, '⚠️ Botão sem lead id.'); return true; }
        if (args.onFecharStart) await args.onFecharStart(leadId);
        else await args.sendText(args.from, '⚠️ Handler de fechar não configurado.');
        return true;
      }

      case 'fechar-pick': {
        if (!leadId) { await args.sendText(args.from, '⚠️ Botão sem lead id.'); return true; }
        if (args.onFecharPick) await args.onFecharPick(leadId);
        else await args.sendText(args.from, '⚠️ Handler de fechar-pick não configurado.');
        return true;
      }

      case 'fechar-aprovar': {
        if (!leadId) { await args.sendText(args.from, '⚠️ Botão sem fechamento id.'); return true; }
        if (args.onFecharApprove) await args.onFecharApprove(leadId);
        else await args.sendText(args.from, '⚠️ Handler de fechar-aprovar não configurado.');
        return true;
      }

      case 'fechar-refazer': {
        if (!leadId) { await args.sendText(args.from, '⚠️ Botão sem fechamento id.'); return true; }
        if (args.onFecharRefazer) await args.onFecharRefazer(leadId);
        else await args.sendText(args.from, '⚠️ Handler de fechar-refazer não configurado.');
        return true;
      }

      case 'fechar-cancelar': {
        if (!leadId) { await args.sendText(args.from, '⚠️ Botão sem fechamento id.'); return true; }
        if (args.onFecharCancel) await args.onFecharCancel(leadId);
        else await args.sendText(args.from, '⚠️ Handler de fechar-cancelar não configurado.');
        return true;
      }

      case 'alert-eva-offline':
      case 'alert-eva-limpeza':
      case 'alert-eva-depoimento': {
        if (!leadId) { await args.sendText(args.from, '⚠️ Botão sem id de sistema.'); return true; }
        if (!args.supabase) { await args.sendText(args.from, '⚠️ Supabase service não disponível.'); return true; }
        const topic = action === 'alert-eva-offline' ? 'alerta_offline'
                    : action === 'alert-eva-limpeza' ? 'alerta_limpeza'
                    : 'pedido_depoimento';
        const sistema = await args.supabase.getSistemaById(leadId);
        if (!sistema) { await args.sendText(args.from, '⚠️ Sistema não encontrado.'); return true; }
        if (!sistema.lead_id) { await args.sendText(args.from, '⚠️ Sistema sem cliente vinculado — vincule o lead antes.'); return true; }
        const lead = await args.supabase.getLeadById(sistema.lead_id);
        if (lead?.opt_out) { await args.sendText(args.from, '⚠️ Lead em opt-out, Eva não pode falar.'); return true; }

        const hojeIso = new Date().toISOString().slice(0, 10);
        await args.supabase.upsertMaintenanceReminderPublic({
          lead_id: sistema.lead_id,
          scheduled_date: hojeIso,
          topic,
        });
        await args.supabase.marcarAlertaAcaoDisparada(sistema.id, `eva_${topic}`, new Date().toISOString());
        const nomeAcao = topic === 'alerta_offline' ? 'avisar sobre offline'
                       : topic === 'alerta_limpeza' ? 'agendar limpeza'
                       : 'pedir depoimento';
        await args.sendText(args.from, `✅ Eva vai ${nomeAcao} com ${lead?.name ?? sistema.apelido} no próximo ciclo (até 1h).`);
        return true;
      }

      case 'alert-ligar': {
        if (!leadId) { await args.sendText(args.from, '⚠️ Botão sem id de sistema.'); return true; }
        if (!args.supabase) { await args.sendText(args.from, '⚠️ Supabase service não disponível.'); return true; }
        const sistema = await args.supabase.getSistemaById(leadId);
        if (!sistema) { await args.sendText(args.from, '⚠️ Sistema não encontrado.'); return true; }
        const lead = sistema.lead_id ? await args.supabase.getLeadById(sistema.lead_id) : null;
        const phone = lead?.phone;
        if (!phone) { await args.sendText(args.from, '⚠️ Sem telefone cadastrado pro cliente.'); return true; }
        await args.sendText(args.from, `📞 ${lead?.name ?? sistema.apelido} — wa.me/${phone}`);
        await args.supabase.marcarAlertaAcaoDisparada(sistema.id, 'junior_ligar', new Date().toISOString());
        return true;
      }

      case 'alert-snooze3d':
      case 'alert-snooze7d': {
        if (!leadId) { await args.sendText(args.from, '⚠️ Botão sem id de sistema.'); return true; }
        if (!args.supabase) { await args.sendText(args.from, '⚠️ Supabase service não disponível.'); return true; }
        const dias = action === 'alert-snooze3d' ? 3 : 7;
        const until = new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();
        await args.supabase.snoozeAlerta(leadId, until);
        await args.sendText(args.from, `💤 Alerta adiado ${dias} dias.`);
        return true;
      }

      case 'alert-resolvido':
      case 'alert-ignorar': {
        if (!leadId) { await args.sendText(args.from, '⚠️ Botão sem id de sistema.'); return true; }
        if (!args.supabase) { await args.sendText(args.from, '⚠️ Supabase service não disponível.'); return true; }
        const reason = action === 'alert-ignorar' ? 'ignorada' : 'manual';
        await args.supabase.resolverAlertaManual(leadId, reason);
        await args.sendText(args.from, '✅ Alerta encerrado.');
        return true;
      }

      case 'alert-ver': {
        if (!leadId) { await args.sendText(args.from, '⚠️ Botão sem id de sistema.'); return true; }
        await args.sendText(args.from, `📊 ${DASHBOARD_BASE}/monitoramento/${leadId}`);
        return true;
      }

      default:
        await args.sendText(args.from, `⚠️ Botão não reconhecido: ${action}`);
        return true;
    }
  } catch (err) {
    console.error('[admin-buttons] erro processando botão:', (err as Error).message);
    await args.sendText(args.from, `⚠️ Erro: ${(err as Error).message}`);
    return true;
  }
}
