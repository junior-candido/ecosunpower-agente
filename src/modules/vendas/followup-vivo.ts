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
import { normalizeBrazilianPhone } from '../meta-leadgen.js';

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
  /**
   * [06/09/2026] Canal pra ERRO GRITAR. Nasceu do incidente em que a migration 101
   * nunca foi aplicada em producao: a tabela `proposta_followup_vivo` nao existia,
   * `processarDevidos` batia no erro, fazia console.error e devolvia 0 — calado.
   * O relogio rodou a cada 15min por MESES sem mandar uma mensagem, e o boot ainda
   * imprimia "Servico ativo". 184 propostas ficaram sem um unico toque.
   * Motor que morre em silencio parece vivo. Agora ele avisa no zap.
   */
  avisarAdmin?: (msg: string) => Promise<void>;
}

const T = 'proposta_followup_vivo';
const ON_CONFLICT = 'proposta_slug,etapa';
const A2H_MS = 2 * 3_600_000;
const SILENCIO_RETOMADA_MS = 48 * 3_600_000;
const ETAPAS_REARME_POS_VISITA = ['D3', 'D5', 'D8', 'D12', 'D20'];
const SENDING_EXPIRA_MS = 30 * 60_000;
/** cancelamentos que nenhuma visita reverte (a proposta não existe mais) */
const CANCELAMENTOS_DEFINITIVOS = ['proposta_revogada', 'proposta_inexistente'];

interface EtapaRow { id: string; proposta_slug: string; lead_id: string | null; etapa: string; scheduled_for: string }

export class FollowupVivoService {
  private readonly deps: Required<Pick<FollowupVivoDeps, 'templateFallback' | 'loteMaximo'>> & FollowupVivoDeps;
  constructor(deps: FollowupVivoDeps) {
    this.deps = { templateFallback: 'reativacao_lead_v1', loteMaximo: 30, ...deps };
  }

  /** Proposta enviada: cria as etapas fixas (sem tocar nas já existentes) e cala as cadências antigas do lead. */
  async agendarParaProposta(p: { slug: string; leadId: string | null; enviadaEmMs: number }): Promise<void> {
    let leadId = p.leadId;
    if (!leadId) {
      const { data: prop } = await this.deps.client.from('propostas_publicas').select('lead_id').eq('slug', p.slug).maybeSingle();
      leadId = prop?.lead_id ?? null;
    }
    const etapas = planejarEtapas(p.enviadaEmMs).map(e => ({
      proposta_slug: p.slug, lead_id: leadId, etapa: e.etapa,
      scheduled_for: new Date(e.scheduledForMs).toISOString(), status: 'pending',
    }));
    const { error } = await this.deps.client.from(T).upsert(etapas, { onConflict: ON_CONFLICT, ignoreDuplicates: true });
    if (error) { console.error('[followup-vivo] agendar falhou:', error.message); return; }
    if (leadId) {
      await this.deps.client.from('eva_cadence').update({ status: 'cancelled', cancelled_reason: 'followup_vivo' }).eq('lead_id', leadId).eq('status', 'pending');
      // 'canceled' (um L) = grafia do módulo dono de reengagement_touches
      await this.deps.client.from('reengagement_touches').update({ status: 'canceled' }).eq('lead_id', leadId).eq('status', 'pending');
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
    if (p.leadId) {
      const { data: lead } = await this.deps.client.from('leads').select('eva_active, opt_out, status, contact_type').eq('id', p.leadId).maybeSingle();
      const eleg = elegivelParaFollowup(lead ?? {}, false);
      if (!eleg.ok) { console.log(`[followup-vivo] pós-visita ignorada lead=${p.leadId} motivo=${eleg.motivo}`); return; }
    }
    let prop: { slug: string; lead_id: string | null } | undefined;
    if (p.leadId) {
      const { data } = await this.deps.client.from('propostas_publicas').select('slug, lead_id').eq('revoked', false)
        .eq('lead_id', p.leadId).order('created_at', { ascending: false }).limit(1);
      prop = data?.[0];
    } else {
      prop = (await this.propostasPorTelefone(p.phone))[0];
    }
    if (!prop) { console.log(`[followup-vivo] pós-visita sem proposta lead=${p.leadId} phone=${p.phone}`); return; }
    const { data: definitivas } = await this.deps.client.from(T).select('id').eq('proposta_slug', prop.slug)
      .eq('status', 'cancelled').in('cancelled_reason', CANCELAMENTOS_DEFINITIVOS).limit(1);
    if (definitivas && definitivas.length > 0) { console.log(`[followup-vivo] pós-visita ignorada slug=${prop.slug}: proposta cancelada em definitivo`); return; }
    const leadId = p.leadId ?? prop.lead_id ?? null;
    const rearme = planejarEtapas(p.agoraMs).filter(e => ETAPAS_REARME_POS_VISITA.includes(e.etapa));
    const linhas = [
      { etapa: 'POS_VISITA', scheduled_for: new Date(proximoHorarioValido(p.agoraMs)).toISOString() },
      ...rearme.map(e => ({ etapa: e.etapa, scheduled_for: new Date(e.scheduledForMs).toISOString() })),
    ].map(l => ({
      proposta_slug: prop.slug, lead_id: leadId, etapa: l.etapa, scheduled_for: l.scheduled_for,
      status: 'pending', sent_at: null, message_sent: null, cancelled_reason: null, error_message: null,
    }));
    const { error } = await this.deps.client.from(T).upsert(linhas, { onConflict: ON_CONFLICT });
    if (error) console.error('[followup-vivo] pós-visita falhou:', error.message);
    else console.log(`[followup-vivo] POS_VISITA + ${rearme.length} etapas re-armadas slug=${prop.slug}`);
  }

  /** propostas_publicas.cliente_telefone é texto livre ("(61) 99999-9999"). O ilike é só PRÉ-FILTRO
   *  pelos 4 últimos dígitos (sempre contíguos em qualquer formatação BR — os 8 últimos podem ter hífen
   *  no meio); a checagem AUTORITATIVA é igualdade do telefone normalizado (padrão da casa, cf. index.ts
   *  montarContextoProposta). Mais recente primeiro. */
  private async propostasPorTelefone(phone: string): Promise<Array<{ slug: string; lead_id: string | null }>> {
    const alvo = normalizeBrazilianPhone(phone);
    if (!alvo) return [];
    const ultimos4 = alvo.slice(-4);
    const { data, error } = await this.deps.client.from('propostas_publicas').select('slug, lead_id, cliente_telefone')
      .ilike('cliente_telefone', `%${ultimos4}%`).eq('revoked', false)
      .order('created_at', { ascending: false }).limit(50);
    if (error) { console.error('[followup-vivo] busca por telefone falhou:', error.message); return []; }
    return (data ?? [])
      .filter(p => normalizeBrazilianPhone(String(p.cliente_telefone ?? '')) === alvo)
      .map(p => ({ slug: p.slug as string, lead_id: (p.lead_id as string | null) ?? null }));
  }

  /** Cliente respondeu: a conversa normal assume; pendentes ficam paused. */
  async pausarPorResposta(telefone: string): Promise<void> {
    for (const p of await this.propostasPorTelefone(telefone)) {
      const { error } = await this.deps.client.from(T).update({ status: 'paused' }).eq('proposta_slug', p.slug).eq('status', 'pending');
      if (error) console.error(`[followup-vivo] pausar falhou slug=${p.slug}:`, error.message);
    }
  }

  /** Cron: paused → pending quando a última mensagem da conversa é da Eva há ≥ 48 h. Devolve quantas etapas re-armou. */
  async retomarSilenciosas(agoraMs: number): Promise<number> {
    const { data: pausadas, error } = await this.deps.client.from(T).select('id, scheduled_for, proposta_slug, lead_id').eq('status', 'paused');
    if (error) { console.error('[followup-vivo] busca de pausadas falhou:', error.message); return 0; }
    const leads = [...new Set((pausadas ?? []).map(r => r.lead_id).filter(Boolean))] as string[];
    let n = 0;
    for (const leadId of leads) {
      if (!(await this.evaSilenciosaHa(leadId, SILENCIO_RETOMADA_MS, agoraMs))) continue;
      const rows = (pausadas ?? []).filter(r => r.lead_id === leadId);
      // re-arma: etapas futuras voltam a pending; as já vencidas vão pra agora (dentro do horário)
      for (const r of rows) {
        const sf = Math.max(Date.parse(r.scheduled_for), proximoHorarioValido(agoraMs));
        const { error: e } = await this.deps.client.from(T).update({ status: 'pending', scheduled_for: new Date(sf).toISOString() }).eq('id', r.id);
        if (e) { console.error(`[followup-vivo] retomar falhou id=${r.id}:`, e.message); continue; }
        n++;
      }
      if (rows.length) console.log(`[followup-vivo] retomada após silêncio lead=${leadId} etapas=${rows.length}`);
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
    const { error } = await this.deps.client.from(T).update({ status: 'cancelled', cancelled_reason: motivo }).eq('proposta_slug', slug).in('status', ['pending', 'paused']);
    if (error) console.error(`[followup-vivo] cancelar slug=${slug} falhou:`, error.message);
  }
  async cancelarPorLead(leadId: string, motivo: string): Promise<void> {
    const { error } = await this.deps.client.from(T).update({ status: 'cancelled', cancelled_reason: motivo }).eq('lead_id', leadId).in('status', ['pending', 'paused']);
    if (error) console.error(`[followup-vivo] cancelar lead=${leadId} falhou:`, error.message);
  }

  /** Chamado pelo cron. Devolve quantas etapas foram enviadas. */
  /** Ultimo aviso de falha enviado (epoch ms). Throttle de 1h. */
  private ultimoGritoMs = 0;

  /**
   * Avisa o Junior no zap que o motor caiu. Throttle de 1h: o relogio bate a cada
   * 15min, entao sem isso um banco fora do ar viraria 4 mensagens por hora.
   * Nunca deixa o erro do aviso derrubar o ciclo — se o zap falhar, so loga.
   */
  private async gritar(msg: string, agoraMs: number): Promise<void> {
    if (!this.deps.avisarAdmin) return;
    if (agoraMs - this.ultimoGritoMs < 3_600_000) return;
    this.ultimoGritoMs = agoraMs;
    try { await this.deps.avisarAdmin(msg); }
    catch (err) { console.error('[followup-vivo] nao consegui nem avisar:', (err as Error).message); }
  }

  async processarDevidos(agoraMs: number): Promise<number> {
    if (!dentroDoHorario(agoraMs)) return 0;
    // varredura: 'sending' preso (processo caiu no meio) vira failed — nunca pending, pra não entregar em dobro
    const { data: presas, error: errPresas } = await this.deps.client.from(T)
      .update({ status: 'failed', error_message: 'sending_expirado' })
      .eq('status', 'sending').lt('scheduled_for', new Date(agoraMs - SENDING_EXPIRA_MS).toISOString()).select('id');
    if (errPresas) console.error('[followup-vivo] varredura de sending falhou:', errPresas.message);
    else if (presas && presas.length > 0) console.warn(`[followup-vivo] ${presas.length} etapa(s) presas em sending marcadas failed`);
    const { data: devidas, error } = await this.deps.client.from(T)
      .select('id, proposta_slug, lead_id, etapa, scheduled_for')
      .eq('status', 'pending').lte('scheduled_for', new Date(agoraMs).toISOString())
      .order('scheduled_for', { ascending: true }).limit(this.deps.loteMaximo);
    if (error) {
      console.error('[followup-vivo] busca falhou:', error.message);
      // GRITA. Antes isso morria num console.error que ninguem le. Throttle de 1h
      // pra nao virar spam: o relogio bate a cada 15min, mas o aviso sai 1x/hora.
      await this.gritar(
        `🚨 *Follow-up vivo PAROU*\n\nA busca de toques falhou:\n_${error.message}_\n\n` +
        `Nenhum cliente com proposta esta sendo acompanhado agora. ` +
        `Se disser "does not exist", a migration nao foi aplicada em producao.`,
        agoraMs,
      );
      return 0;
    }
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
      .select('slug, cliente_nome, cliente_telefone, lead_id, created_at, dados_input, revoked, acessos')
      .eq('slug', row.proposta_slug).maybeSingle();
    // [06/09/2026] Telefone: a proposta e a PRIMEIRA fonte, o lead e a RESERVA.
    // Auditoria de 06/09: das 184 propostas vivas, so 66 tinham `cliente_telefone`.
    // As outras nasciam sem — e aqui o follow-up cancelava com 'sem_telefone' e
    // o cliente nunca mais ouvia falar da gente. Mas em 50 desses casos a pessoa
    // ESTAVA no sistema, com telefone, como lead: a proposta e que nao olhava pra la.
    // Quem manda no dado e o lead; a proposta so guarda uma copia.
    let to = prop?.cliente_telefone ? normalizeBrazilianPhone(String(prop.cliente_telefone)) : null;
    if (!to && (prop?.lead_id ?? row.lead_id)) {
      const { data: lead } = await this.deps.client.from('leads')
        .select('phone').eq('id', prop?.lead_id ?? row.lead_id).maybeSingle();
      if (lead?.phone) {
        to = normalizeBrazilianPhone(String(lead.phone));
        if (to) console.log(`[followup-vivo] telefone da proposta ${row.proposta_slug} veio do lead (reserva)`);
      }
    }
    if (!prop || prop.revoked || !to) {
      await this.cancelarPorSlug(row.proposta_slug, !prop ? 'proposta_inexistente' : prop.revoked ? 'proposta_revogada' : 'sem_telefone');
      return false;
    }
    // NA24 = "não abriu em 24h": se já abriu, essa etapa perde o sentido (as outras seguem)
    if (row.etapa === 'NA24' && (Number(prop.acessos) || 0) > 0) {
      const { error } = await this.deps.client.from(T).update({ status: 'cancelled', cancelled_reason: 'ja_abriu' }).eq('id', row.id);
      if (error) console.error(`[followup-vivo] cancelar NA24 falhou id=${row.id}:`, error.message);
      else console.log(`[followup-vivo] NA24 cancelada slug=${row.proposta_slug}: proposta já aberta`);
      return false;
    }
    const leadId: string | null = row.lead_id ?? prop.lead_id ?? null;
    const { data: lead } = leadId
      ? await this.deps.client.from('leads').select('eva_active, opt_out, status, contact_type').eq('id', leadId).maybeSingle()
      : { data: null };
    const eleg = elegivelParaFollowup(lead ?? {}, await this.deps.emTakeover(to));
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
    if (await this.deps.janela24hAberta(to)) {
      const msg = await gerarMensagemEtapa(argumento, fatos, caso, this.deps.redator);
      await this.deps.sendText(to, msg.texto);
      registro = msg.texto;
    } else {
      const { templateUsado } = await this.deps.sendTemplate(to, prop.cliente_nome, this.deps.templateFallback);
      registro = `template:${templateUsado}`;
    }
    const { error: errSent } = await this.deps.client.from(T).update({ status: 'sent', sent_at: new Date(agoraMs).toISOString(), message_sent: registro }).eq('id', row.id);
    if (errSent) console.error(`[followup-vivo] marcar sent falhou id=${row.id} (mensagem JÁ enviada):`, errSent.message);
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
