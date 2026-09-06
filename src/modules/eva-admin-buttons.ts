// eva-admin-buttons.ts
// Botoes interativos WABA pros alertas/digest da Eva pro Junior.
//
// Padrao do id: "evabt:<acao>" ou "evabt:<acao>:<leadId>".
// Acoes suportadas:
//   - dash-leads             -> responde com URL /dashboard/leads
//   - dash-alerts            -> URL /dashboard/leads?only_alerts=1
//   - cad-force              -> dispara cadencia pros silentes agora (force=true)
//   - lead-view:<id>         -> URL /dashboard/leads/<id>
//   - email-quente:<id>      -> mesmo que lead-view (alerta de lead quente por e-mail)
//   - lead-pause:<id>        -> seta eva_active=false (Junior assume)
//   - lead-resume:<id>       -> seta eva_active=true
//   - lead-optout:<id>       -> opt_out=true + eva_active=false + cancela cadencia
//   - lead-cad-cancel:<id>   -> cancela cadencia pendente
//
// Fallback: se metaWaba=null (Evolution), envia somente texto sem botoes.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseService } from './supabase.js';
import { empresa } from './empresa-config.js';
import { avisoAdminPermitido } from './tenant-admin-guard.js';

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
 * texto puro com as opcoes numeradas e o id pra responder (fallback Evolution).
 */
export async function sendAdminWithButtons(
  ctx: AdminButtonCtx,
  to: string,
  body: string,
  buttons: Array<{ id: string; title: string }>,
  footer?: string,
): Promise<void> {
  // ⚖️ TRAVA LGPD (31/08/2026) — este é o canal dos avisos administrativos
  // (lead novo, dossiê, handoff). Dentro do contexto de um tenant ele só pode
  // sair pro telefone de atendimento DAQUELE tenant. O caminho WABA abaixo não
  // passa pelo sendText, então a trava tem que estar aqui também.
  if (!avisoAdminPermitido(to)) {
    console.error(
      `[lgpd] BLOQUEADO: aviso admin da empresa "${empresa().nomeFantasia}" (${empresa().companyId}) para um numero que nao e o telefone_atendente dela. Nada foi enviado.`,
    );
    return;
  }
  if (ctx.metaWaba && buttons.length > 0 && buttons.length <= 3) {
    try {
      await ctx.metaWaba.sendInteractiveButtons(to, body, buttons, footer);
      return;
    } catch (err) {
      console.warn('[admin-buttons] WABA falhou, fallback texto:', (err as Error).message);
    }
  }
  const opcoes = buttons.map((b, i) => `${i + 1}) ${b.title} → responda: ${b.id}`).join('\n');
  await ctx.sendText(to, opcoes ? `${body}\n\n${opcoes}` : body);
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
  // Botões sem id, agem sobre o estado Redis do `from` (admin atual):
  onFecharGerarConfirm?: () => Promise<void>;
  onFecharAjustar?: () => Promise<void>;
  onFecharSair?: () => Promise<void>;
  onFecharDocPick?: (cmd: 'procuracao' | 'contrato' | 'ambos', leadId: string) => Promise<void>;
  // Cadastro de dono de usina órfã (fluxo dono-cad)
  onDonoCadStart?: (sistemaId: string) => Promise<void>;
  onDonoExiste?: () => Promise<void>;
  onDonoNovo?: () => Promise<void>;
  onDonoPick?: (leadId: string) => Promise<void>;
  onDonoPular?: () => Promise<void>;
  onDonoPularTudo?: () => Promise<void>;
  onDonoCancelar?: () => Promise<void>;
  // Campanha via Eva (preview de e-mail): aprovar/refazer/descartar.
  onCampanhaAprovar?: (campanhaId: string) => Promise<void>;
  onCampanhaRefazer?: (campanhaId: string) => Promise<void>;
  onCampanhaDescartar?: (campanhaId: string) => Promise<void>;
  // Pasta digital pós-obra (envio automático modo b): Enviar agora / Segurar / Ver
  onPastaEnviar?: (pastaId: string) => Promise<void>;
  onPastaSegurar?: (pastaId: string) => Promise<void>;
}): Promise<boolean> {
  // Regex relaxado: aceita qualquer sufixo apos a action (ex: fechar-doc:procuracao:<uuid>)
  const m = args.text.trim().match(/^evabt:([a-z0-9-]+)(?::(.+))?$/i);
  if (!m) return false;

  const action = m[1];
  // Para actions simples, leadId é o sufixo direto (UUID). Para fechar-doc, o case
  // faz o parse completo via split(':') lendo do buttonId original.
  const buttonId = args.text.trim();
  const leadId = m[2];

  try {
    switch (action) {
      case 'pasta-enviar': {
        if (!leadId) return false;
        if (args.onPastaEnviar) await args.onPastaEnviar(leadId);
        else await args.sendText(args.from, '⚠️ Envio da pasta não está ligado neste ambiente.');
        return true;
      }
      case 'pasta-segurar': {
        if (!leadId) return false;
        if (args.onPastaSegurar) await args.onPastaSegurar(leadId);
        else await args.sendText(args.from, '⏸ Ok, segurei.');
        return true;
      }
      case 'pasta-ver': {
        if (!leadId) return false;
        await args.sendText(args.from, `👁 Pasta no dashboard:\n${DASHBOARD_BASE}/dashboard/pastas/${leadId}`);
        return true;
      }
      case 'dash-leads':
        await args.sendText(args.from, `📊 Dashboard de leads:\n${DASHBOARD_BASE}/leads`);
        return true;

      case 'dash-alerts':
        await args.sendText(args.from, `🚨 Leads com alerta:\n${DASHBOARD_BASE}/leads?only_alerts=1`);
        return true;

      case 'cad-force': {
        const r = await args.forceCadenceForSilentes();
        // [06/09/2026] Zero deixou de ser uma resposta seca. Quando nao ha ninguem
        // pra tocar isso quase sempre e BOA noticia (o relogio ja pegou todo mundo,
        // ou os silentes ja estao com proposta no follow-up vivo) — mas a mensagem
        // antiga fazia parecer defeito. Agora ela explica o porque.
        await args.sendText(
          args.from,
          r.acionados > 0
            ? `📤 Toque forçado pra ${r.acionados} lead(s) silente(s). Sai na próxima janela (9h–20h).`
            : '✅ Nenhum lead pra cutucar agora.\n\nOu o robô já tocou todos nas últimas 48h, ' +
              'ou os silentes da lista já estão com proposta na mão — esses o follow-up cuida.',
        );
        return true;
      }

      case 'lead-view':
      case 'email-quente': {
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

      // Botões sem id (agem sobre estado Redis do admin atual):
      case 'fechar-gerar': {
        if (args.onFecharGerarConfirm) await args.onFecharGerarConfirm();
        else await args.sendText(args.from, '⚠️ Handler de fechar-gerar não configurado.');
        return true;
      }

      case 'fechar-ajustar': {
        if (args.onFecharAjustar) await args.onFecharAjustar();
        else await args.sendText(args.from, '⚠️ Handler de fechar-ajustar não configurado.');
        return true;
      }

      case 'fechar-sair': {
        if (args.onFecharSair) await args.onFecharSair();
        else await args.sendText(args.from, '⚠️ Handler de fechar-sair não configurado.');
        return true;
      }

      case 'fechar-doc': {
        // ID vem como evabt:fechar-doc:<modo>:<leadId>
        // O parser comum do switch ja capturou action="fechar-doc" do segmento [1].
        // Os segmentos [2] e [3] (modo, leadId) precisam ser lidos diretamente do buttonId.
        const allParts = buttonId.split(':');
        // allParts = ['evabt', 'fechar-doc', '<modo>', '<leadId>']
        const modo = allParts[2] as 'procuracao' | 'contrato' | 'ambos' | undefined;
        const ldId = allParts.slice(3).join(':'); // defensivo se leadId tem ':'
        if (!modo || !['procuracao', 'contrato', 'ambos'].includes(modo)) {
          await args.sendText(args.from, '⚠️ Modo invalido no botao fechar-doc.');
          return true;
        }
        if (!ldId) { await args.sendText(args.from, '⚠️ Botao sem lead id.'); return true; }
        if (args.onFecharDocPick) await args.onFecharDocPick(modo, ldId);
        else await args.sendText(args.from, '⚠️ Handler de fechar-doc nao configurado.');
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

      case 'dono-cad': {
        if (!leadId) { await args.sendText(args.from, '⚠️ Botão sem id de sistema.'); return true; }
        if (args.onDonoCadStart) await args.onDonoCadStart(leadId);
        else await args.sendText(args.from, '⚠️ Handler dono-cad não configurado.');
        return true;
      }
      case 'dono-existe': {
        if (args.onDonoExiste) await args.onDonoExiste();
        return true;
      }
      case 'dono-novo': {
        if (args.onDonoNovo) await args.onDonoNovo();
        return true;
      }
      case 'dono-pick': {
        if (!leadId) { await args.sendText(args.from, '⚠️ Botão sem lead id.'); return true; }
        if (args.onDonoPick) await args.onDonoPick(leadId);
        return true;
      }
      case 'dono-pular': {
        if (args.onDonoPular) await args.onDonoPular();
        return true;
      }
      case 'dono-pular-tudo': {
        if (args.onDonoPularTudo) await args.onDonoPularTudo();
        return true;
      }
      case 'dono-cancelar': {
        if (args.onDonoCancelar) await args.onDonoCancelar();
        return true;
      }

      case 'camp-ok': {
        if (!leadId) { await args.sendText(args.from, '⚠️ Botão sem id da campanha.'); return true; }
        if (args.onCampanhaAprovar) await args.onCampanhaAprovar(leadId);
        else await args.sendText(args.from, '⚠️ Handler de campanha não configurado.');
        return true;
      }
      case 'camp-re': {
        if (!leadId) { await args.sendText(args.from, '⚠️ Botão sem id da campanha.'); return true; }
        if (args.onCampanhaRefazer) await args.onCampanhaRefazer(leadId);
        else await args.sendText(args.from, '⚠️ Handler de campanha não configurado.');
        return true;
      }
      case 'camp-x': {
        if (!leadId) { await args.sendText(args.from, '⚠️ Botão sem id da campanha.'); return true; }
        if (args.onCampanhaDescartar) await args.onCampanhaDescartar(leadId);
        else await args.sendText(args.from, '⚠️ Handler de campanha não configurado.');
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
