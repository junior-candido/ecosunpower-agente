import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Config } from '../config.js';

export interface MessageEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ConversationData {
  id: string;
  lead_id: string;
  session_status: 'active' | 'paused' | 'completed' | 'expired';
  qualification_step: string;
  messages: MessageEntry[];
  summary: string | null;
  message_count: number;
  last_message_at: string;
  expires_at: string;
}

interface LeadData {
  phone: string;
  name?: string;
  city?: string;
  neighborhood?: string;
  profile?: 'residencial' | 'comercial' | 'agronegocio' | 'indefinido';
  origin?: string;
  status?: 'novo' | 'qualificando' | 'qualificado' | 'agendado' | 'transferido' | 'inativo';
  energy_data?: Record<string, unknown>;
  opportunities?: Record<string, boolean>;
  future_demand?: string;
  consent_given?: boolean;
  consent_date?: string;
  // ID Meta da campanha de aquisicao (do anuncio que trouxe o lead). Usado
  // pra resolver template A/B no auto-ack via marketing_campaigns.template_inicial.
  ad_campaign_id?: string | null;
}

interface DossierData {
  lead_id: string;
  content: Record<string, unknown>;
  formatted_text: string;
  status: 'draft' | 'sent' | 'read' | 'actioned';
}

export class SupabaseService {
  private client: SupabaseClient;

  constructor(config: Pick<Config, 'supabaseUrl' | 'supabaseServiceKey'>) {
    this.client = createClient(config.supabaseUrl, config.supabaseServiceKey);
  }

  getClient(): SupabaseClient {
    return this.client;
  }

  async upsertLead(data: LeadData): Promise<{ id: string }> {
    const { data: result, error } = await this.client
      .from('leads')
      .upsert({ ...data, updated_at: new Date().toISOString() }, { onConflict: 'phone' })
      .select('id')
      .single();

    if (error) throw new Error(`Failed to upsert lead: ${error.message}`);
    return { id: result.id };
  }

  async getLeadByPhone(phone: string): Promise<(LeadData & { id: string }) | null> {
    const { data, error } = await this.client
      .from('leads')
      .select('*')
      .eq('phone', phone)
      .single();

    if (error && error.code !== 'PGRST116') throw new Error(`Failed to get lead: ${error.message}`);
    return data;
  }

  async getOrCreateConversation(leadId: string): Promise<ConversationData> {
    const { data: existing, error: findError } = await this.client
      .from('conversations')
      .select('*')
      .eq('lead_id', leadId)
      .eq('session_status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);

    if (findError) throw new Error(`Failed to find conversation: ${findError.message}`);

    if (existing && existing.length > 0) {
      const conv = existing[0];
      if (new Date(conv.expires_at) > new Date()) {
        return conv as ConversationData;
      }
      await this.client
        .from('conversations')
        .update({ session_status: 'expired' })
        .eq('id', conv.id);
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: newConv, error: createError } = await this.client
      .from('conversations')
      .insert({
        lead_id: leadId,
        session_status: 'active',
        qualification_step: 'inicio',
        messages: [],
        summary: null,
        message_count: 0,
        last_message_at: new Date().toISOString(),
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (createError) throw new Error(`Failed to create conversation: ${createError.message}`);
    return newConv as ConversationData;
  }

  async updateConversation(
    conversationId: string,
    updates: Partial<Pick<ConversationData, 'messages' | 'summary' | 'message_count' | 'qualification_step' | 'session_status'>>
  ): Promise<void> {
    const { error } = await this.client
      .from('conversations')
      .update({
        ...updates,
        last_message_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', conversationId);

    if (error) throw new Error(`Failed to update conversation: ${error.message}`);
  }

  async saveDossier(data: DossierData): Promise<{ id: string }> {
    const { data: result, error } = await this.client
      .from('dossiers')
      .insert(data)
      .select('id')
      .single();

    if (error) throw new Error(`Failed to save dossier: ${error.message}`);
    return { id: result.id };
  }

  async logEvent(
    level: 'info' | 'warn' | 'error' | 'debug',
    module: string,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.client
      .from('logs')
      .insert({ level, module, message, metadata: metadata ?? {} });
  }

  // ==========================================================================
  // Eva-active flag (controle de quem Eva atende)
  // ==========================================================================

  async isEvaActiveForPhone(phone: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('leads')
      .select('eva_active')
      .eq('phone', phone)
      .maybeSingle();

    if (error) {
      console.warn(`[supabase] isEvaActiveForPhone error: ${error.message}`);
      return true; // fail-open: na duvida, deixa Eva responder (lead novo cai aqui)
    }
    if (!data) return true; // lead nao existe ainda = Eva responde (vai ser criado com default true)
    return data.eva_active === true;
  }

  async setEvaActive(phone: string, active: boolean): Promise<void> {
    const updates: Record<string, unknown> = { eva_active: active };
    if (active) updates.eva_activated_at = new Date().toISOString();

    const { error } = await this.client
      .from('leads')
      .update(updates)
      .eq('phone', phone);

    if (error) throw new Error(`Failed to set eva_active: ${error.message}`);
  }

  async markMaintenanceClient(phone: string): Promise<{ leadId: string } | null> {
    const lead = await this.getLeadByPhone(phone);
    if (!lead) return null;

    const { error } = await this.client
      .from('leads')
      .update({ maintenance_client: true })
      .eq('id', lead.id);

    if (error) throw new Error(`Failed to mark maintenance client: ${error.message}`);
    return { leadId: lead.id };
  }

  // ==========================================================================
  // Eva intro pendente (delay 2h apos /eva on)
  // ==========================================================================

  async scheduleEvaIntro(leadId: string, scheduledFor: Date): Promise<void> {
    // cancela qualquer intro anterior pendente do mesmo lead
    await this.client
      .from('eva_intro_pending')
      .update({ status: 'cancelled', cancelled_reason: 'superseded' })
      .eq('lead_id', leadId)
      .eq('status', 'pending');

    const { error } = await this.client
      .from('eva_intro_pending')
      .insert({ lead_id: leadId, scheduled_for: scheduledFor.toISOString() });

    if (error) throw new Error(`Failed to schedule eva intro: ${error.message}`);
  }

  async cancelEvaIntro(leadId: string, reason: string): Promise<void> {
    // Cancela apenas se ainda esta 'pending'. Se ja virou 'sending' (cron
    // travou pra enviar), eh tarde demais — Eva ja vai mandar a intro.
    // Trade-off aceito: melhor cliente receber intro tardiamente do que
    // ter race onde Eva manda apos ja ter conversado.
    await this.client
      .from('eva_intro_pending')
      .update({ status: 'cancelled', cancelled_reason: reason })
      .eq('lead_id', leadId)
      .eq('status', 'pending');
  }

  async getDueEvaIntros(): Promise<Array<{ id: string; lead_id: string; phone: string; name: string | null }>> {
    const { data, error } = await this.client
      .from('eva_intro_pending')
      .select('id, lead_id, leads!inner(phone, name)')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString());

    if (error) {
      console.error(`[supabase] getDueEvaIntros error: ${error.message}`);
      return [];
    }

    return (data ?? []).map((row: any) => ({
      id: row.id,
      lead_id: row.lead_id,
      phone: row.leads.phone,
      name: row.leads.name,
    }));
  }

  /**
   * CAS: tenta marcar intro como 'sending' pra travar contra cancelamento
   * concorrente do cliente. Retorna true se travou, false se outro processo
   * (ou cancelEvaIntro) ja mudou o status.
   */
  async lockEvaIntroForSending(id: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('eva_intro_pending')
      .update({ status: 'sending' })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id');

    if (error) {
      console.error(`[supabase] lockEvaIntroForSending error: ${error.message}`);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  }

  /**
   * Devolve uma intro travada como 'sending' pra 'pending' (em caso de erro
   * no envio — permite retry no proximo ciclo).
   */
  async unlockEvaIntro(id: string): Promise<void> {
    await this.client
      .from('eva_intro_pending')
      .update({ status: 'pending' })
      .eq('id', id)
      .eq('status', 'sending');
  }

  async markEvaIntroSent(id: string): Promise<void> {
    // CAS: so marca como sent se ainda esta como sending (foi travada por nos).
    await this.client
      .from('eva_intro_pending')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'sending');
  }

  // ==========================================================================
  // Lembretes de manutencao (maio e agosto recorrentes)
  // ==========================================================================

  async scheduleMaintenanceReminders(leadId: string): Promise<number> {
    // gera proximo maio e proximo agosto a partir de hoje
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth(); // 0-indexed: maio=4, agosto=7

    const nextMay = new Date(month >= 4 ? year + 1 : year, 4, 1);     // 1 de maio
    const nextAug = new Date(month >= 7 ? year + 1 : year, 7, 1);     // 1 de agosto

    const rows = [
      { lead_id: leadId, scheduled_date: nextMay.toISOString().slice(0, 10), topic: 'limpeza_maio' },
      { lead_id: leadId, scheduled_date: nextAug.toISOString().slice(0, 10), topic: 'limpeza_agosto' },
    ];

    const { error } = await this.client
      .from('maintenance_reminders')
      .upsert(rows, { onConflict: 'lead_id,scheduled_date,topic', ignoreDuplicates: true });

    if (error) throw new Error(`Failed to schedule maintenance reminders: ${error.message}`);
    return rows.length;
  }

  async getDueMaintenanceReminders(): Promise<Array<{
    id: string;
    lead_id: string;
    topic: string;
    scheduled_date: string;
    phone: string;
    name: string | null;
  }>> {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await this.client
      .from('maintenance_reminders')
      .select('id, lead_id, topic, scheduled_date, leads!inner(phone, name)')
      .eq('status', 'pending')
      .lte('scheduled_date', today);

    if (error) {
      console.error(`[supabase] getDueMaintenanceReminders error: ${error.message}`);
      return [];
    }

    return (data ?? []).map((row: any) => ({
      id: row.id,
      lead_id: row.lead_id,
      topic: row.topic,
      scheduled_date: row.scheduled_date,
      phone: row.leads.phone,
      name: row.leads.name,
    }));
  }

  async markMaintenanceReminderSent(id: string, messageSent: string): Promise<void> {
    await this.client
      .from('maintenance_reminders')
      .update({ status: 'sent', sent_at: new Date().toISOString(), message_sent: messageSent })
      .eq('id', id);
  }

  async markMaintenanceReminderFailed(id: string, errorMessage: string): Promise<void> {
    await this.client
      .from('maintenance_reminders')
      .update({ status: 'failed', error_message: errorMessage })
      .eq('id', id);
  }

  /**
   * Resolve template inicial customizado pra uma campanha Meta (A/B test).
   * Usado pelo auto-ack: lead vindo de campanha X usa o template mapeado
   * em marketing_campaigns.template_inicial. NULL -> caller usa default.
   *
   * Migration 028 adiciona a coluna. Antes dela aplicada, retorna sempre null
   * (graceful: query falha por coluna nao existir, capturamos e devolvemos null).
   */
  async getTemplateInicialPorCampanha(adCampaignId: string | null): Promise<string | null> {
    if (!adCampaignId) return null;
    try {
      const { data, error } = await this.client
        .from('marketing_campaigns')
        .select('template_inicial')
        .eq('meta_campaign_id', adCampaignId)
        .maybeSingle();
      if (error) {
        // Coluna ainda nao migrada OU campanha desconhecida — fallback silencioso.
        return null;
      }
      return (data?.template_inicial as string | undefined) ?? null;
    } catch {
      return null;
    }
  }

  // ==========================================================================
  // Cadencia de reengajamento INFINITA — Eva insiste ate cliente responder
  // ou pedir pra parar (opt_out=true).
  //
  // Intervalos progressivos no primeiro ano: 0h, 1d, 3d, 7d, 15d, 30d, 60d,
  // 90d, 180d, 365d (10 toques). Depois disso, scheduleCadenceContinuation
  // gera mais toques espacados de 1 ano cada, indefinidamente, ate cliente
  // responder ou opt-out.
  //
  // Ajuste 13/05/2026: 14d -> 15d no toque 5 pra alinhar com o template
  // eva_provocativa_v1 (Marketing) que dispara nessa data como ultima cartada.
  // ==========================================================================

  /** Intervalos em dias do toque inicial (toque 1 = 0h). */
  static readonly CADENCE_INTERVALS_DAYS = [0, 1, 3, 7, 15, 30, 60, 90, 180, 365];

  /** Apos o ultimo toque da serie inicial, espacamento entre toques (1 ano cada). */
  static readonly CADENCE_LOOP_INTERVAL_DAYS = 365;

  async scheduleCadence(leadId: string, startOffsetMinutes: number = 0): Promise<void> {
    await this.client
      .from('eva_cadence')
      .update({ status: 'cancelled', cancelled_reason: 'superseded' })
      .eq('lead_id', leadId)
      .eq('status', 'pending');

    const now = Date.now();
    const intervals = SupabaseService.CADENCE_INTERVALS_DAYS;
    const rows = intervals.map((days, idx) => ({
      lead_id: leadId,
      step: idx + 1,
      scheduled_for: new Date(
        now + startOffsetMinutes * 60_000 + days * 24 * 60 * 60_000,
      ).toISOString(),
      status: 'pending',
    }));

    const { error } = await this.client
      .from('eva_cadence')
      .upsert(rows, { onConflict: 'lead_id,step', ignoreDuplicates: false });

    if (error) throw new Error(`Failed to schedule cadence: ${error.message}`);
  }

  /**
   * Busca leads "silentes" — criados ha mais de N horas e que nunca
   * tiveram cadencia agendada. Excluir opt_out, eva_active=false e
   * status terminal (transferido, fechado, perdido).
   *
   * Usado pelo cron de auto-agendamento de cadencia: garante que NENHUM
   * lead novo seja esquecido. Apos 24h sem responder, Eva comeca a
   * arrochar via cadencia infinita.
   */
  async getSilentLeadsWithoutCadence(hoursSilent: number = 24): Promise<Array<{
    id: string;
    phone: string;
    name: string | null;
    created_at: string;
  }>> {
    // Primeiro pega leads candidatos (criados ha > N horas, ativos, sem opt-out, status nao-terminal).
    const cutoff = new Date(Date.now() - hoursSilent * 60 * 60_000).toISOString();
    const { data: candidates, error } = await this.client
      .from('leads')
      .select('id, phone, name, created_at')
      .eq('eva_active', true)
      .eq('opt_out', false)
      .in('status', ['novo', 'qualificando', 'qualificado'])
      .lt('created_at', cutoff)
      .limit(200);

    if (error) {
      console.error('[supabase] getSilentLeadsWithoutCadence list error:', error.message);
      return [];
    }
    if (!candidates || candidates.length === 0) return [];

    // Filtra fora os que ja tem QUALQUER registro de cadencia (pending OU sent).
    // Idempotencia: scheduleCadence ja chamado uma vez nao deve disparar de novo.
    const ids = candidates.map((c) => c.id);
    const { data: withCadence } = await this.client
      .from('eva_cadence')
      .select('lead_id')
      .in('lead_id', ids);
    const withCadenceSet = new Set((withCadence ?? []).map((r: any) => r.lead_id));

    return candidates.filter((c) => !withCadenceSet.has(c.id));
  }

  /**
   * Apos enviar o ultimo toque pendente, gera o proximo toque +1 ano a
   * frente. Mantem cadencia rodando indefinidamente ate cliente responder
   * ou pedir opt-out. Idempotente: se ja existe step > lastStep pendente,
   * nao faz nada.
   */
  async scheduleCadenceContinuation(leadId: string, lastStep: number): Promise<void> {
    const { data: existing } = await this.client
      .from('eva_cadence')
      .select('step')
      .eq('lead_id', leadId)
      .gt('step', lastStep)
      .eq('status', 'pending')
      .limit(1);

    if (existing && existing.length > 0) return; // ja tem toque futuro agendado

    const nextStep = lastStep + 1;
    const scheduledFor = new Date(
      Date.now() + SupabaseService.CADENCE_LOOP_INTERVAL_DAYS * 24 * 60 * 60_000,
    ).toISOString();

    const { error } = await this.client.from('eva_cadence').upsert(
      [{ lead_id: leadId, step: nextStep, scheduled_for: scheduledFor, status: 'pending' }],
      { onConflict: 'lead_id,step', ignoreDuplicates: true },
    );

    if (error) throw new Error(`Failed to schedule cadence continuation: ${error.message}`);
  }

  async cancelCadence(leadId: string, reason: string): Promise<number> {
    const { data, error } = await this.client
      .from('eva_cadence')
      .update({ status: 'cancelled', cancelled_reason: reason })
      .eq('lead_id', leadId)
      .eq('status', 'pending')
      .select('id');

    if (error) {
      console.warn(`[supabase] cancelCadence error: ${error.message}`);
      return 0;
    }
    return Array.isArray(data) ? data.length : 0;
  }

  async cancelCadenceByPhone(phone: string, reason: string): Promise<number> {
    const lead = await this.getLeadByPhone(phone);
    if (!lead?.id) return 0;
    return this.cancelCadence(lead.id, reason);
  }

  /**
   * Checa se a janela WABA de 24h esta ABERTA pro lead. WABA so deixa enviar
   * texto livre quando o cliente respondeu nas ultimas 24h — fora disso, so
   * via template aprovado.
   *
   * Heuristica: olha as mensagens da conversa mais recente do lead, procura
   * a ultima com role='user' e ve se foi < 24h atras.
   *
   * Retorna `null` se nao conseguir determinar (sem conversa, erro). Caller
   * decide: por seguranca, tratar `null` como FECHADA (fallback pra template).
   */
  async isWithin24hWindow(leadId: string): Promise<boolean | null> {
    const { data: conv, error } = await this.client
      .from('conversations')
      .select('messages')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn(`[supabase] isWithin24hWindow error pra lead ${leadId}: ${error.message}`);
      return null;
    }
    if (!conv || !Array.isArray(conv.messages)) return null;

    const msgs = conv.messages as Array<{ role?: string; timestamp?: string }>;
    // De tras pra frente, acha ultima do user
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m?.role === 'user' && m.timestamp) {
        const tMs = new Date(m.timestamp).getTime();
        if (!isFinite(tMs)) return null;
        return (Date.now() - tMs) < 24 * 60 * 60_000;
      }
    }
    return null; // sem msg do user na conversa
  }

  async getDueCadenceSteps(batchLimit: number = 50): Promise<Array<{
    id: string;
    lead_id: string;
    step: number;
    scheduled_for: string;
    phone: string;
    name: string | null;
    ad_campaign_id: string | null;
  }>> {
    const safeLimit = Math.max(1, Math.min(200, batchLimit));
    const { data, error } = await this.client
      .from('eva_cadence')
      .select('id, lead_id, step, scheduled_for, leads!inner(phone, name, ad_campaign_id)')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(safeLimit);

    if (error) {
      console.error(`[supabase] getDueCadenceSteps error: ${error.message}`);
      return [];
    }

    return (data ?? []).map((row: any) => ({
      id: row.id,
      lead_id: row.lead_id,
      step: row.step,
      scheduled_for: row.scheduled_for,
      phone: row.leads.phone,
      name: row.leads.name,
      ad_campaign_id: row.leads.ad_campaign_id ?? null,
    }));
  }

  async lockCadenceForSending(id: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('eva_cadence')
      .update({ status: 'sending' })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id');

    if (error) {
      console.error(`[supabase] lockCadenceForSending error: ${error.message}`);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  }

  async unlockCadence(id: string): Promise<void> {
    await this.client
      .from('eva_cadence')
      .update({ status: 'pending' })
      .eq('id', id)
      .eq('status', 'sending');
  }

  async markCadenceSent(id: string, messageSent: string): Promise<void> {
    await this.client
      .from('eva_cadence')
      .update({ status: 'sent', sent_at: new Date().toISOString(), message_sent: messageSent })
      .eq('id', id)
      .eq('status', 'sending');
  }

  async markCadenceFailed(id: string, errorMessage: string): Promise<void> {
    await this.client
      .from('eva_cadence')
      .update({ status: 'failed', error_message: errorMessage })
      .eq('id', id);
  }

  // ==========================================================================
  // Propostas publicas (HTML hospedado em /p/:slug, TTL 60d)
  // Resolve a limitacao do Drive desktop que abre HTML como codigo fonte.
  // ==========================================================================

  async savePropostaPublica(input: {
    slug: string;
    numeroProposta: string;
    clienteNome: string;
    clienteTelefone?: string;
    htmlContent: string;
    dadosInput?: Record<string, unknown>;
    tipo?: 'basica' | 'personalizada';
    modoEnvio?: 'junior_envia' | 'eva_envia';
  }): Promise<{ id: string; expiresAt: string }> {
    const { data, error } = await this.client
      .from('propostas_publicas')
      .insert({
        slug: input.slug,
        numero_proposta: input.numeroProposta,
        cliente_nome: input.clienteNome,
        cliente_telefone: input.clienteTelefone ?? null,
        html_content: input.htmlContent,
        dados_input: input.dadosInput ?? null,
        tipo: input.tipo ?? 'basica',
        modo_envio: input.modoEnvio ?? 'junior_envia',
      })
      .select('id, expires_at')
      .single();

    if (error) throw new Error(`Failed to save proposta publica: ${error.message}`);
    return { id: data.id, expiresAt: data.expires_at };
  }

  async updatePropostaPublicaHtml(slug: string, htmlContent: string): Promise<void> {
    const { error } = await this.client
      .from('propostas_publicas')
      .update({ html_content: htmlContent })
      .eq('slug', slug);
    if (error) throw new Error(`Failed to update proposta html: ${error.message}`);
  }

  async getPropostaPublicaBySlug(slug: string): Promise<{
    status: 'ok' | 'not_found' | 'expired' | 'revoked';
    html?: string;
    numeroProposta?: string;
    clienteNome?: string;
    tipo?: 'basica' | 'personalizada';
  }> {
    // .maybeSingle() retorna data=null sem error pra "no rows".
    // Erro aqui = falha real de DB (conexao, schema, RLS) — propaga pro endpoint
    // retornar 500 em vez de 404 silencioso.
    const { data, error } = await this.client
      .from('propostas_publicas')
      .select('html_content, numero_proposta, cliente_nome, expires_at, revoked, tipo')
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw new Error(`Failed to get proposta publica: ${error.message}`);
    if (!data) return { status: 'not_found' };
    if (data.revoked) return { status: 'revoked' };
    if (new Date(data.expires_at) < new Date()) return { status: 'expired' };

    return {
      status: 'ok',
      html: data.html_content,
      numeroProposta: data.numero_proposta,
      clienteNome: data.cliente_nome,
      tipo: data.tipo ?? 'basica',
    };
  }

  async getPropostaPublicaExtras(slug: string): Promise<{
    cliente_telefone: string | null;
    sent_to_client_at: string | null;
    opt_out: boolean;
  }> {
    const { data, error } = await this.client
      .from('propostas_publicas')
      .select('cliente_telefone, sent_to_client_at')
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw new Error(`Failed to get proposta extras: ${error.message}`);
    if (!data) return { cliente_telefone: null, sent_to_client_at: null, opt_out: false };

    // Cruza telefone com leads pra detectar opt_out
    let opt_out = false;
    const clienteTelefone = (data as any).cliente_telefone as string | null;
    if (clienteTelefone) {
      const { data: leadRow } = await this.client
        .from('leads')
        .select('opt_out')
        .eq('phone', clienteTelefone)
        .maybeSingle();
      opt_out = !!leadRow?.opt_out;
    }

    return {
      cliente_telefone: clienteTelefone,
      sent_to_client_at: ((data as any).sent_to_client_at as string | null) ?? null,
      opt_out,
    };
  }

  async marcarPropostaPublicaEnviada(slug: string): Promise<void> {
    const { error } = await this.client
      .from('propostas_publicas')
      .update({ sent_to_client_at: new Date().toISOString() } as any)
      .eq('slug', slug);
    if (error) throw new Error(`Failed to mark proposta sent: ${error.message}`);
  }

  // Fire-and-forget. Race condition em counter de view e tolerada (~best effort).
  // Nao bloqueia a resposta HTTP da proposta.
  // Retorna { acessosAntes } pra caller detectar primeira visualizacao
  // (acessosAntes === 0) e disparar followup automatico. Retorna null se
  // proposta nao encontrada ou erro.
  async incrementPropostaPublicaAcesso(slug: string): Promise<{ acessosAntes: number } | null> {
    try {
      const { data } = await this.client
        .from('propostas_publicas')
        .select('acessos')
        .eq('slug', slug)
        .maybeSingle();

      if (!data) return null;
      const acessosAntes = data.acessos ?? 0;
      await this.client
        .from('propostas_publicas')
        .update({
          acessos: acessosAntes + 1,
          ultimo_acesso_at: new Date().toISOString(),
        })
        .eq('slug', slug);
      return { acessosAntes };
    } catch (err) {
      console.warn('[supabase] incrementPropostaPublicaAcesso (non-blocking):', err);
      return null;
    }
  }

  /**
   * Insere 1 linha em proposta_visualizacoes pra cada acesso (Junior preview
   * OU cliente real). Permite timeline + KPIs no dashboard. Fire-and-forget:
   * falha aqui nunca quebra a renderizacao da proposta.
   *
   * Migration 029 cria a tabela. Antes dela aplicada, retorna silenciosamente.
   */
  async registrarVisualizacaoProposta(params: {
    slug: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    isPreview: boolean;
    referer?: string | null;
  }): Promise<void> {
    try {
      await this.client.from('proposta_visualizacoes').insert({
        proposta_slug: params.slug,
        ip_address: params.ipAddress ?? null,
        user_agent: params.userAgent ?? null,
        is_preview: params.isPreview,
        referer: params.referer ?? null,
      });
    } catch (err) {
      // Migration 029 ainda nao aplicada? Outras falhas? Nao critico.
      console.warn(
        '[supabase] registrarVisualizacaoProposta (non-blocking):',
        (err as Error).message,
      );
    }
  }

  // ==========================================================================
  // Relatório de geração de usina (link público /r/:slug, TTL 60 dias)
  // ==========================================================================

  async criarRelatorioSlug(sistemaId: string): Promise<string> {
    const slug = crypto.randomBytes(18).toString('base64url').slice(0, 24);
    const expira = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    await this.getClient().from('relatorio_slugs').insert({
      slug, sistema_id: sistemaId, expira_em: expira,
    });
    return slug;
  }

  async getRelatorioSlug(slug: string): Promise<{ sistema_id: string; expira_em: string } | null> {
    const { data } = await this.getClient()
      .from('relatorio_slugs')
      .select('sistema_id, expira_em')
      .eq('slug', slug)
      .maybeSingle();
    if (!data) return null;
    if (new Date((data as any).expira_em).getTime() < Date.now()) return null;
    return data as { sistema_id: string; expira_em: string };
  }

  // ====================================================================
  // Módulo 6: alerta proativo
  // ====================================================================

  async getAlertasAbertosBySistemas(sistemaIds: string[]): Promise<any[]> {
    if (sistemaIds.length === 0) return [];
    const { data, error } = await this.client
      .from('monitoring_alerts')
      .select('*')
      .in('sistema_id', sistemaIds)
      .is('resolved_at', null);
    if (error) {
      console.error('[supabase] getAlertasAbertosBySistemas:', error.message);
      return [];
    }
    return data ?? [];
  }

  async criarAlertaPendente(input: {
    sistema_id: string;
    tipo: string;
    severidade: string;
    texto: string;
    primeiro_visto_em: string;
    next_send_at: string;
  }): Promise<void> {
    const { error } = await this.client.from('monitoring_alerts').insert({
      ...input,
      last_sent_at: null,
      snoozed_until: null,
      resolved_at: null,
    });
    if (error) {
      // Pode bater no unique partial index (corrida) — log e segue
      console.warn('[supabase] criarAlertaPendente:', error.message);
    }
  }

  async lockAlertaParaEnvio(id: string): Promise<boolean> {
    // CAS: zera next_send_at se ainda não está zerado (alguém pegou).
    // Retorna a linha afetada — se vazio, perdemos a corrida.
    // Concurrência: sob READ COMMITTED (default Supabase/Postgres), 2 instâncias
    // concorrentes serializam no row-lock — a segunda re-avalia o WHERE pós-commit
    // da primeira, vê next_send_at=null, atualiza 0 rows, retorna false. Easypanel
    // hoje roda single-instance então o cenário concorrente é teórico, mas o
    // mecanismo está correto se algum dia escalar.
    const { data, error } = await this.client
      .from('monitoring_alerts')
      .update({ next_send_at: null })
      .eq('id', id)
      .not('next_send_at', 'is', null)
      .select('id');
    if (error) {
      console.error('[supabase] lockAlertaParaEnvio:', error.message);
      return false;
    }
    return (data?.length ?? 0) > 0;
  }

  async unlockAlerta(id: string, retornarPara: string): Promise<void> {
    await this.client
      .from('monitoring_alerts')
      .update({ next_send_at: retornarPara })
      .eq('id', id);
  }

  async marcarAlertaEnviado(id: string, sentAt: string, nextSendAt: string): Promise<void> {
    const { error } = await this.client
      .from('monitoring_alerts')
      .update({ last_sent_at: sentAt, next_send_at: nextSendAt })
      .eq('id', id);
    if (error) console.error('[supabase] marcarAlertaEnviado:', error.message);
  }

  async snoozeAlerta(sistemaId: string, snoozedUntil: string): Promise<void> {
    await this.client
      .from('monitoring_alerts')
      .update({ snoozed_until: snoozedUntil })
      .eq('sistema_id', sistemaId)
      .is('resolved_at', null);
  }

  async resolverAlerta(id: string, hoje: string, reason: string = 'auto'): Promise<void> {
    await this.client
      .from('monitoring_alerts')
      .update({ resolved_at: hoje, resolved_reason: reason })
      .eq('id', id)
      .is('resolved_at', null);
  }

  async resolverAlertaManual(sistemaId: string, reason: 'manual' | 'ignorada'): Promise<void> {
    await this.client
      .from('monitoring_alerts')
      .update({ resolved_at: new Date().toISOString(), resolved_reason: reason })
      .eq('sistema_id', sistemaId)
      .is('resolved_at', null);
  }

  async getAlertasParaDespachar(hojeIso: string, limit: number = 8): Promise<any[]> {
    const { data, error } = await this.client
      .from('monitoring_alerts')
      .select('*')
      .is('resolved_at', null)
      .not('next_send_at', 'is', null)
      .lte('next_send_at', hojeIso)
      .or(`snoozed_until.is.null,snoozed_until.lte.${hojeIso}`)
      .order('primeiro_visto_em', { ascending: true })
      .limit(limit * 2);  // pega 2x pra reordenar por severidade no JS
    if (error) {
      console.error('[supabase] getAlertasParaDespachar:', error.message);
      return [];
    }
    // ordem por severidade no JS porque 'aviso'/'info'/'urgente' não alfabeta certo
    const peso: Record<string, number> = { urgente: 0, aviso: 1, info: 2 };
    return [...(data ?? [])].sort((a, b) => {
      const dp = (peso[a.severidade] ?? 9) - (peso[b.severidade] ?? 9);
      if (dp !== 0) return dp;
      return a.primeiro_visto_em.localeCompare(b.primeiro_visto_em);
    }).slice(0, limit);
  }

  async marcarAlertaAcaoDisparada(sistemaId: string, acao: string, hoje: string): Promise<void> {
    await this.client
      .from('monitoring_alerts')
      .update({ acao_disparada: acao, acao_disparada_em: hoje })
      .eq('sistema_id', sistemaId)
      .is('resolved_at', null);
  }

  async getSistemasNoAniversarioHoje(hoje: Date): Promise<Array<{
    id: string; lead_id: string | null; apelido: string; data_instalacao: string | null; anos: number;
  }>> {
    const m = hoje.getMonth() + 1;
    const d = hoje.getDate();
    const hojeYear = hoje.getFullYear();
    const { data, error } = await this.client
      .from('sistemas_clientes')
      .select('id, lead_id, apelido, data_instalacao')
      .not('data_instalacao', 'is', null)
      .eq('ativo', true);
    if (error) {
      console.error('[supabase] getSistemasNoAniversarioHoje:', error.message);
      return [];
    }
    const mm = String(m).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    const out: Array<{ id: string; lead_id: string | null; apelido: string; data_instalacao: string | null; anos: number }> = [];
    for (const s of data ?? []) {
      if (!s.data_instalacao) continue;
      const [y, mes, dia] = s.data_instalacao.split('-');
      if (mes === mm && dia === dd) {
        const anos = hojeYear - Number(y);
        if (anos >= 1 && anos <= 5) {
          out.push({ id: s.id, lead_id: s.lead_id, apelido: s.apelido, data_instalacao: s.data_instalacao, anos });
        }
      }
    }
    return out;
  }

  async getSistemaById(id: string): Promise<any | null> {
    const { data, error } = await this.client.from('sistemas_clientes').select('*').eq('id', id).single();
    if (error) {
      console.warn('[supabase] getSistemaById:', error.message);
      return null;
    }
    return data;
  }

  async getLeadById(id: string): Promise<any | null> {
    const { data, error } = await this.client.from('leads').select('*').eq('id', id).single();
    if (error) {
      console.warn('[supabase] getLeadById:', error.message);
      return null;
    }
    return data;
  }

  async upsertMaintenanceReminderPublic(input: { lead_id: string; scheduled_date: string; topic: string }): Promise<void> {
    const { error } = await this.client
      .from('maintenance_reminders')
      .upsert(input, { onConflict: 'lead_id,scheduled_date,topic', ignoreDuplicates: true });
    if (error) {
      console.warn('[supabase] upsertMaintenanceReminderPublic:', error.message);
    }
  }

  // ====================================================================
  // Perfil do Cliente A1
  // ====================================================================

  async listClientesByStatus(statuses: string[], filters: { q?: string; concessionaria?: string; cidade?: string; ord?: string } = {}, limit: number = 50, offset: number = 0, incluirManuaisDashboard: boolean = false): Promise<any[]> {
    let q = this.client
      .from('leads')
      .select('id, name, phone, email, profile, installation_status, installed_at, city, uf, concessionaria, consumo_medio_kwh, conta_media_brl, opt_out, eva_active, created_at')
      .limit(limit);

    // /clientes mostra: fechados (status em CLIENTE_STATUSES) OR cadastros manuais
    // do Junior (acquisition_source='manual_dashboard'). Leads vindos da Eva ficam
    // em /leads. Junior pediu separação 21/05 — ver project_a4_tela_admin_proposta.
    if (statuses.length > 0 && incluirManuaisDashboard) {
      q = q.or(`installation_status.in.(${statuses.join(',')}),acquisition_source.eq.manual_dashboard`);
    } else if (statuses.length > 0) {
      q = q.in('installation_status', statuses);
    } else if (incluirManuaisDashboard) {
      q = q.eq('acquisition_source', 'manual_dashboard');
    }
    // statuses vazio + incluirManuais=false: mostra TUDO (uso por chamadores que querem lista geral).

    if (filters.q) q = q.or(`name.ilike.%${filters.q}%,phone.ilike.%${filters.q}%,email.ilike.%${filters.q}%,cpf_cnpj.ilike.%${filters.q}%`);
    if (filters.concessionaria) q = q.eq('concessionaria', filters.concessionaria);
    if (filters.cidade) q = q.eq('city', filters.cidade);

    if (filters.ord === 'nome') q = q.order('name', { ascending: true });
    else q = q.order('updated_at', { ascending: false });

    const { data, error } = await q.range(offset, offset + limit - 1);
    if (error) {
      console.error('[supabase] listClientesByStatus:', error.message);
      return [];
    }
    return data ?? [];
  }

  async getClienteByLeadId(leadId: string): Promise<any | null> {
    const { data, error } = await this.client.from('leads').select('*').eq('id', leadId).single();
    if (error) {
      console.warn('[supabase] getClienteByLeadId:', error.message);
      return null;
    }
    return data;
  }

  async updateClienteFields(leadId: string, fields: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      cleaned[k] = v;
    }
    if (Object.keys(cleaned).length === 0) return { ok: true };
    cleaned.updated_at = new Date().toISOString();

    const { error } = await this.client.from('leads').update(cleaned).eq('id', leadId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async listAnexos(leadId: string): Promise<any[]> {
    const { data, error } = await this.client
      .from('lead_anexos')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[supabase] listAnexos:', error.message);
      return [];
    }
    return data ?? [];
  }

  async insertAnexo(input: {
    lead_id: string; tipo: string; descricao: string | null;
    storage_path: string; mime_type: string | null; size_bytes: number | null;
    created_by: string;
  }): Promise<{ ok: boolean; id?: string; error?: string }> {
    const { data, error } = await this.client
      .from('lead_anexos')
      .insert(input)
      .select('id')
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data.id };
  }

  async deleteAnexo(anexoId: string): Promise<{ ok: boolean; storage_path?: string; error?: string }> {
    const { data: row, error: rdErr } = await this.client.from('lead_anexos').select('storage_path').eq('id', anexoId).single();
    if (rdErr) return { ok: false, error: rdErr.message };
    const storage_path = row?.storage_path;

    const { error: delErr } = await this.client.from('lead_anexos').delete().eq('id', anexoId);
    if (delErr) return { ok: false, error: delErr.message };

    return { ok: true, storage_path };
  }

  async listPropostasByLeadId(leadId: string): Promise<any[]> {
    const { data, error } = await this.client
      .from('propostas_publicas')
      .select('id, slug, numero_proposta, created_at, acessos, cliente_respondeu_at, dados_input')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });
    if (error) return [];
    return data ?? [];
  }

  async listAlertasAtivosByLeadId(leadId: string): Promise<any[]> {
    const { data: sistemas } = await this.client.from('sistemas_clientes').select('id').eq('lead_id', leadId);
    const sistemaIds = (sistemas ?? []).map((s: any) => s.id);
    if (sistemaIds.length === 0) return [];
    const { data, error } = await this.client
      .from('monitoring_alerts')
      .select('id, tipo, severidade, texto, primeiro_visto_em, sistema_id')
      .in('sistema_id', sistemaIds)
      .is('resolved_at', null)
      .order('primeiro_visto_em', { ascending: false });
    if (error) return [];
    return data ?? [];
  }

  async listManutencoesFuturasByLeadId(leadId: string): Promise<any[]> {
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, error } = await this.client
      .from('maintenance_reminders')
      .select('scheduled_date, topic, status')
      .eq('lead_id', leadId)
      .eq('status', 'pending')
      .gte('scheduled_date', hoje)
      .order('scheduled_date', { ascending: true });
    if (error) return [];
    return data ?? [];
  }

  // Sistemas ativos sem lead vinculado — aparecem em /clientes como "vincular"
  async listSistemasOrfaos(): Promise<any[]> {
    const { data, error } = await this.client
      .from('sistemas_clientes')
      .select('id, apelido, marca_inversor, potencia_kwp, cidade, uf, data_instalacao')
      .is('lead_id', null)
      .eq('ativo', true)
      .order('apelido', { ascending: true });
    if (error) {
      console.error('[supabase] listSistemasOrfaos:', error.message);
      return [];
    }
    return data ?? [];
  }

  // Cria um novo lead já marcado como cliente operando e vincula ao sistema órfão.
  // Tudo numa transação lógica: se falhar criar lead, não toca no sistema; se falhar
  // vincular, deleta o lead recém-criado pra não deixar fantasma.
  async vincularNovoLeadAoSistema(input: {
    sistema_id: string;
    name: string;
    phone: string;
    email?: string | null;
  }): Promise<{ ok: boolean; lead_id?: string; error?: string }> {
    // 1. Confirma que o sistema existe e ainda não tem lead vinculado
    const { data: sistema, error: sErr } = await this.client
      .from('sistemas_clientes')
      .select('id, lead_id, data_instalacao')
      .eq('id', input.sistema_id)
      .single();
    if (sErr || !sistema) return { ok: false, error: 'Sistema não encontrado' };
    if (sistema.lead_id) return { ok: false, error: 'Sistema já tem cliente vinculado' };

    // 2. Cria o lead
    const { data: novoLead, error: lErr } = await this.client
      .from('leads')
      .insert({
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        installation_status: 'operando',
        installed_at: sistema.data_instalacao,
        eva_active: false,                    // Junior precisa ativar depois
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (lErr || !novoLead) return { ok: false, error: lErr?.message ?? 'Falha ao criar lead' };

    // 3. Vincula
    const { error: vErr } = await this.client
      .from('sistemas_clientes')
      .update({ lead_id: novoLead.id })
      .eq('id', input.sistema_id);
    if (vErr) {
      // rollback do lead (best-effort)
      try { await this.client.from('leads').delete().eq('id', novoLead.id); } catch {}
      return { ok: false, error: vErr.message };
    }
    return { ok: true, lead_id: novoLead.id };
  }

  // Cria um lead avulso sem sistema vinculado. Usado pelo dashboard quando o
  // Junior cadastra um cliente diretamente (A4-V2.1 — Novo cliente avulso).
  async criarLeadAvulso(input: {
    name: string;
    phone: string;
    email?: string | null;
    cpf_cnpj?: string | null;
    city?: string | null;
    uf?: string | null;
    concessionaria?: string | null;
    consumo_medio_kwh?: number | null;
    profile?: 'residencial' | 'comercial' | 'rural' | 'industrial' | 'indefinido' | null;
  }): Promise<{ ok: boolean; lead_id?: string; error?: string }> {
    // Confere se já existe lead com mesmo telefone (evita duplicata)
    const phoneClean = String(input.phone).replace(/\D/g, '');
    if (!phoneClean) return { ok: false, error: 'Telefone obrigatório' };

    const { data: existente } = await this.client
      .from('leads')
      .select('id, name')
      .eq('phone', phoneClean)
      .maybeSingle();
    if (existente) {
      return { ok: false, error: `Já existe cliente com esse telefone: ${existente.name ?? 'sem nome'}` };
    }

    const { data: novoLead, error } = await this.client
      .from('leads')
      .insert({
        name: input.name,
        phone: phoneClean,
        email: input.email ?? null,
        cpf_cnpj: input.cpf_cnpj ?? null,
        city: input.city ?? null,
        uf: input.uf ?? null,
        concessionaria: input.concessionaria ?? null,
        consumo_medio_kwh: input.consumo_medio_kwh ?? null,
        profile: input.profile ?? 'indefinido',
        installation_status: null,
        eva_active: false,
        opt_out: false,
        acquisition_source: 'manual_dashboard',
        created_at: new Date().toISOString(),
      } as any)
      .select('id')
      .single();

    if (error || !novoLead) return { ok: false, error: error?.message ?? 'Falha ao criar lead' };
    return { ok: true, lead_id: novoLead.id };
  }

  async excluirLead(leadId: string): Promise<{ ok: boolean; error?: string }> {
    const { error } = await this.client.from('leads').delete().eq('id', leadId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  // ====================================================================
  // A5 — Relatório Pós-Instalação
  // ====================================================================

  async criarRelatorioPosInstalacao(input: {
    lead_id: string;
    slug: string;
    mensagem_personalizada: string | null;
    data_instalacao: string | null;
    fotos: Array<{ storage_path: string; caption?: string | null }>;
  }): Promise<{ ok: boolean; id?: string; error?: string }> {
    const { data, error } = await this.client
      .from('relatorios_pos_instalacao')
      .insert({
        lead_id: input.lead_id,
        slug: input.slug,
        mensagem_personalizada: input.mensagem_personalizada,
        data_instalacao: input.data_instalacao,
        fotos: input.fotos,
        created_by: 'junior',
      })
      .select('id')
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data.id };
  }

  async getRelatorioPosInstalacaoBySlug(slug: string): Promise<any | null> {
    const { data, error } = await this.client
      .from('relatorios_pos_instalacao')
      .select('*')
      .eq('slug', slug)
      .single();
    if (error) {
      console.warn('[supabase] getRelatorioPosInstalacaoBySlug:', error.message);
      return null;
    }
    return data;
  }

  async getRelatorioPosInstalacaoById(id: string): Promise<any | null> {
    const { data, error } = await this.client
      .from('relatorios_pos_instalacao')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data;
  }

  async listRelatoriosPosInstalacaoByLead(lead_id: string, limit: number = 10): Promise<any[]> {
    const { data, error } = await this.client
      .from('relatorios_pos_instalacao')
      .select('id, slug, created_at, enviado_em, acessos, mensagem_personalizada')
      .eq('lead_id', lead_id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return data ?? [];
  }

  async marcarRelatorioPosInstalacaoEnviado(id: string, phone: string): Promise<void> {
    await this.client
      .from('relatorios_pos_instalacao')
      .update({ enviado_em: new Date().toISOString(), enviado_para_phone: phone })
      .eq('id', id);
  }

  async marcarLeadPostInstallReportSent(leadId: string): Promise<void> {
    await this.client
      .from('leads')
      .update({ post_install_report_sent_at: new Date().toISOString() })
      .eq('id', leadId);
  }

  async incrementarAcessoRelatorioPI(slug: string): Promise<void> {
    // RPC atômico (definido na migration 034) — evita race em concurrent reads.
    const { error } = await this.client.rpc('increment_pi_access', { p_slug: slug });
    if (error) console.warn('[supabase] increment_pi_access:', error.message);
  }

  async getLeadsMedidorTrocadoSemRelatorio(): Promise<any[]> {
    const { data, error } = await this.client
      .from('leads')
      .select('id, name, phone, installation_status, meter_swapped_at')
      .eq('installation_status', 'medidor_trocado')
      .is('post_install_report_sent_at', null)
      .order('updated_at', { ascending: false })
      .limit(20);
    if (error) return [];
    return data ?? [];
  }
}
