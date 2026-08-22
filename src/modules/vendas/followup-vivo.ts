// Follow-up vivo (spec 2026-08-21 §6): agenda, processa, pausa, retoma e cancela
// as etapas de acompanhamento de proposta. Deps injetadas; tempo sempre injetado (agoraMs).
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  planejarEtapas, dentroDoHorario, proximoHorarioValido, elegivelParaFollowup,
  argumentoDaEtapa, proximaEtapaMensal, INTERVALO_MENSAL_MS,
} from './followup-vivo-plano.js';
import {
  montarFatos, gerarMensagemEtapa,
  type CasoSimilar, type RedatorIA, type PropostaParaMensagem,
} from './followup-vivo-mensagem.js';
import { registrarEvento } from '../elo/eventos.js';

export interface FollowupVivoDeps {
  client: SupabaseClient;
  sendText: (to: string, text: string) => Promise<void>;
  /** envia template aprovado (fora da janela 24h); devolve o nome usado */
  sendTemplate: (to: string, nome: string | null | undefined, template: string) => Promise<{ templateUsado: string }>;
  janela24hAberta: (phone: string) => Promise<boolean>;
  emTakeover: (phone: string) => Promise<boolean>;
  redator: RedatorIA;
  buscarCasoSimilar: (cidade: string | null) => Promise<CasoSimilar | null>;
  proposalBaseUrl: string;
  validadeKitDias: number;
  templateFallback?: string; // default 'reativacao_lead_v1'
  loteMaximo?: number;       // default 30
}

const T = 'proposta_followup_vivo';
const ON_CONFLICT = 'proposta_slug,etapa';
const A2H_MS = 2 * 3_600_000;
const SILENCIO_RETOMADA_MS = 48 * 3_600_000;
const ETAPAS_REARME_POS_VISITA = ['D3', 'D5', 'D8', 'D12', 'D20'];

interface EtapaRow { id: string; proposta_slug: string; lead_id: string | null; etapa: string; scheduled_for: string }

export class FollowupVivoService {
  private readonly deps: Required<Pick<FollowupVivoDeps, 'templateFallback' | 'loteMaximo'>> & FollowupVivoDeps;
  constructor(deps: FollowupVivoDeps) {
    this.deps = { templateFallback: 'reativacao_lead_v1', loteMaximo: 30, ...deps };
  }

  /** Proposta enviada: cria as etapas fixas (sem tocar nas já existentes) e cala as cadências antigas do lead. */
  async agendarParaProposta(p: { slug: string; leadId: string | null; enviadaEmMs: number }): Promise<void> {
    const etapas = planejarEtapas(p.enviadaEmMs).map(e => ({
      proposta_slug: p.slug, lead_id: p.leadId, etapa: e.etapa,
      scheduled_for: new Date(e.scheduledForMs).toISOString(), status: 'pending',
    }));
    const { error } = await this.deps.client.from(T).upsert(etapas, { onConflict: ON_CONFLICT, ignoreDuplicates: true });
    if (error) { console.error('[followup-vivo] agendar falhou:', error.message); return; }
    if (p.leadId) {
      await this.deps.client.from('eva_cadence').update({ status: 'cancelled', cancelled_reason: 'followup_vivo' }).eq('lead_id', p.leadId).eq('status', 'pending');
      await this.deps.client.from('reengagement_touches').update({ status: 'cancelled' }).eq('lead_id', p.leadId).eq('status', 'pending');
    }
    console.log(`[followup-vivo] ${etapas.length} etapas agendadas slug=${p.slug}`);
  }

  /** Abriu a proposta e não respondeu: A2H para +2 h (dentro do horário). */
  async agendarAbriuSemResposta(slug: string, agoraMs: number): Promise<void> {
    const { data: prop } = await this.deps.client.from('propostas_publicas').select('lead_id').eq('slug', slug).maybeSingle();
    const { error } = await this.deps.client.from(T).upsert([{
      proposta_slug: slug, lead_id: prop?.lead_id ?? null, etapa: 'A2H',
      scheduled_for: new Date(proximoHorarioValido(agoraMs + A2H_MS)).toISOString(), status: 'pending',
    }], { onConflict: ON_CONFLICT, ignoreDuplicates: true });
    if (error) console.error('[followup-vivo] A2H falhou:', error.message);
    else console.log(`[followup-vivo] A2H agendada slug=${slug}`);
  }

  /** Pós-visita: cria etapa POS_VISITA pra agora (dentro do horário) na proposta mais recente do lead
   *  e re-arma D3..D20 relativos à visita (o cliente viu o Junior — voltou a ser quente), mesmo as já enviadas. */
  async agendarPosVisita(p: { leadId: string | null; phone: string; agoraMs: number }): Promise<void> {
    let q = this.deps.client.from('propostas_publicas').select('slug, lead_id').eq('revoked', false)
      .order('created_at', { ascending: false }).limit(1);
    q = p.leadId ? q.eq('lead_id', p.leadId) : q.eq('cliente_telefone', p.phone);
    const { data } = await q;
    const prop = data?.[0];
    if (!prop) { console.log(`[followup-vivo] pós-visita sem proposta lead=${p.leadId} phone=${p.phone}`); return; }
    const leadId = p.leadId ?? prop.lead_id ?? null;
    const rearme = planejarEtapas(p.agoraMs).filter(e => ETAPAS_REARME_POS_VISITA.includes(e.etapa));
    const linhas = [
      { etapa: 'POS_VISITA', scheduled_for: new Date(proximoHorarioValido(p.agoraMs)).toISOString() },
      ...rearme.map(e => ({ etapa: e.etapa, scheduled_for: new Date(e.scheduledForMs).toISOString() })),
    ].map(l => ({
      proposta_slug: prop.slug, lead_id: leadId, etapa: l.etapa, scheduled_for: l.scheduled_for,
      status: 'pending', sent_at: null, message_sent: null,
    }));
    const { error } = await this.deps.client.from(T).upsert(linhas, { onConflict: ON_CONFLICT });
    if (error) console.error('[followup-vivo] pós-visita falhou:', error.message);
    else console.log(`[followup-vivo] POS_VISITA + ${rearme.length} etapas re-armadas slug=${prop.slug}`);
  }

  /** Cliente respondeu: a conversa normal assume; pendentes ficam paused. */
  async pausarPorResposta(telefone: string): Promise<void> {
    const { data: props } = await this.deps.client.from('propostas_publicas').select('slug').eq('cliente_telefone', telefone).eq('revoked', false);
    for (const p of props ?? []) {
      await this.deps.client.from(T).update({ status: 'paused' }).eq('proposta_slug', p.slug).eq('status', 'pending');
    }
  }

  /** Cron: paused → pending quando a última mensagem da conversa é da Eva há ≥ 48 h. Devolve quantas etapas re-armou. */
  async retomarSilenciosas(agoraMs: number): Promise<number> {
    const { data: pausadas } = await this.deps.client.from(T).select('proposta_slug, lead_id').eq('status', 'paused');
    const leads = [...new Set((pausadas ?? []).map(r => r.lead_id).filter(Boolean))] as string[];
    let n = 0;
    for (const leadId of leads) {
      if (!(await this.evaSilenciosaHa(leadId, SILENCIO_RETOMADA_MS, agoraMs))) continue;
      const slugs = [...new Set((pausadas ?? []).filter(r => r.lead_id === leadId).map(r => r.proposta_slug as string))];
      for (const slug of slugs) {
        // re-arma: etapas futuras voltam a pending; as já vencidas vão pra agora (dentro do horário)
        const { data: rows } = await this.deps.client.from(T).select('id, scheduled_for').eq('proposta_slug', slug).eq('status', 'paused');
        for (const r of rows ?? []) {
          const sf = Math.max(Date.parse(r.scheduled_for), proximoHorarioValido(agoraMs));
          await this.deps.client.from(T).update({ status: 'pending', scheduled_for: new Date(sf).toISOString() }).eq('id', r.id);
          n++;
        }
      }
      if (slugs.length) console.log(`[followup-vivo] retomada após silêncio lead=${leadId} propostas=${slugs.length}`);
    }
    return n;
  }

  /** Última mensagem da conversa mais recente é da Eva e tem pelo menos `silencioMs`? */
  private async evaSilenciosaHa(leadId: string, silencioMs: number, agoraMs: number): Promise<boolean> {
    const { data: conv } = await this.deps.client.from('conversations')
      .select('messages, last_message_at').eq('lead_id', leadId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!conv) return false;
    const msgs = (conv.messages ?? []) as Array<{ role?: string }>;
    const ultima = msgs[msgs.length - 1];
    if (!ultima || ultima.role !== 'assistant') return false;
    const lastAt = Date.parse(conv.last_message_at ?? '');
    if (!Number.isFinite(lastAt)) return false;
    return agoraMs - lastAt >= silencioMs;
  }

  async cancelarPorSlug(slug: string, motivo: string): Promise<void> {
    await this.deps.client.from(T).update({ status: 'cancelled', cancelled_reason: motivo }).eq('proposta_slug', slug).in('status', ['pending', 'paused']);
  }
  async cancelarPorLead(leadId: string, motivo: string): Promise<void> {
    await this.deps.client.from(T).update({ status: 'cancelled', cancelled_reason: motivo }).eq('lead_id', leadId).in('status', ['pending', 'paused']);
  }

  /** Chamado pelo cron. Devolve quantas etapas foram enviadas. */
  async processarDevidos(agoraMs: number): Promise<number> {
    if (!dentroDoHorario(agoraMs)) return 0;
    const { data: devidas, error } = await this.deps.client.from(T)
      .select('id, proposta_slug, lead_id, etapa, scheduled_for')
      .eq('status', 'pending').lte('scheduled_for', new Date(agoraMs).toISOString())
      .order('scheduled_for', { ascending: true }).limit(this.deps.loteMaximo);
    if (error) { console.error('[followup-vivo] busca falhou:', error.message); return 0; }
    let enviadas = 0;
    for (const row of (devidas ?? []) as EtapaRow[]) {
      try { if (await this.processarUma(row, agoraMs)) enviadas++; }
      catch (err) {
        const msg = (err as Error)?.message ?? String(err);
        console.error(`[followup-vivo] etapa ${row.etapa} slug=${row.proposta_slug} falhou:`, msg);
        await this.deps.client.from(T).update({ status: 'failed', error_message: msg }).eq('id', row.id);
      }
    }
    return enviadas;
  }

  private async processarUma(row: EtapaRow, agoraMs: number): Promise<boolean> {
    const { data: prop } = await this.deps.client.from('propostas_publicas')
      .select('slug, cliente_nome, cliente_telefone, lead_id, created_at, dados_input, revoked')
      .eq('slug', row.proposta_slug).maybeSingle();
    if (!prop || prop.revoked || !prop.cliente_telefone) {
      await this.cancelarPorSlug(row.proposta_slug, !prop ? 'proposta_inexistente' : prop.revoked ? 'proposta_revogada' : 'sem_telefone');
      return false;
    }
    const leadId: string | null = row.lead_id ?? prop.lead_id ?? null;
    const { data: lead } = leadId
      ? await this.deps.client.from('leads').select('eva_active, opt_out, status, contact_type').eq('id', leadId).maybeSingle()
      : { data: null };
    const eleg = elegivelParaFollowup(lead ?? {}, await this.deps.emTakeover(prop.cliente_telefone));
    if (!eleg.ok) {
      if (eleg.motivo === 'takeover') return false; // fica pendente, volta quando o Junior soltar
      await this.cancelarPorSlug(row.proposta_slug, eleg.motivo);
      console.log(`[followup-vivo] cancelada slug=${row.proposta_slug} motivo=${eleg.motivo}`);
      return false;
    }
    // lock otimista: pending -> sending (dois crons não enviam a mesma etapa)
    const { data: locked } = await this.deps.client.from(T).update({ status: 'sending' }).eq('id', row.id).eq('status', 'pending').select();
    if (!locked || locked.length === 0) return false;

    const fatos = montarFatos(
      {
        cliente_nome: prop.cliente_nome, slug: prop.slug, created_at: prop.created_at,
        dados_input: (prop.dados_input ?? {}) as PropostaParaMensagem['dados_input'],
      },
      { linkProposta: `${this.deps.proposalBaseUrl}/${prop.slug}`, validadeKitDias: this.deps.validadeKitDias, agoraMs },
    );
    const argumento = argumentoDaEtapa(row.etapa);
    const caso = argumento === 'prova_social' ? await this.deps.buscarCasoSimilar(fatos.cidade) : null;

    let registro: string;
    if (await this.deps.janela24hAberta(prop.cliente_telefone)) {
      const msg = await gerarMensagemEtapa(argumento, fatos, caso, this.deps.redator);
      await this.deps.sendText(prop.cliente_telefone, msg.texto);
      registro = msg.texto;
    } else {
      const { templateUsado } = await this.deps.sendTemplate(prop.cliente_telefone, prop.cliente_nome, this.deps.templateFallback);
      registro = `template:${templateUsado}`;
    }
    await this.deps.client.from(T).update({ status: 'sent', sent_at: new Date(agoraMs).toISOString(), message_sent: registro }).eq('id', row.id);
    const viaTemplate = registro.startsWith('template:');
    console.log(`[followup-vivo] etapa ${row.etapa} enviada slug=${row.proposta_slug} (${viaTemplate ? registro : 'texto'})`);
    await registrarEvento(this.deps.client, {
      tipo: 'comercial:followup_vivo', leadId: leadId ?? undefined, canal: 'whatsapp', origem: 'followup-vivo',
      payload: { etapa: row.etapa, slug: row.proposta_slug, argumento, via: viaTemplate ? 'template' : 'texto' },
    });

    if (/^M\d+$/.test(row.etapa)) {
      await this.deps.client.from(T).upsert([{
        proposta_slug: row.proposta_slug, lead_id: leadId, etapa: proximaEtapaMensal(row.etapa),
        scheduled_for: new Date(proximoHorarioValido(agoraMs + INTERVALO_MENSAL_MS)).toISOString(), status: 'pending',
      }], { onConflict: ON_CONFLICT, ignoreDuplicates: true });
    }
    return true;
  }
}
