import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Config } from '../config.js';
import { proximaEtapaPorEvento, type EventoFunil } from './dashboard/pipeline.js';
import { registrarAtividade } from './dashboard/atividades.js';
import { criarTarefa, cancelarTarefasPendentesDoLead } from './dashboard/tarefas.js';
import { variantesTelefone } from './phone.js';
import { registrarEvento } from './elo/eventos.js';
import { clientDaMensagem } from './tenant-client.js';

// Elo: mapeia a origem livre do lead pro canal canônico do event-stream.
// Best-effort — a maioria dos leads entra por WhatsApp (default). E-mail e web
// só quando a origem deixa claro; caso contrário, sistema pra origem exótica.
function canalDeOrigem(origin?: string | null): 'whatsapp' | 'email' | 'web' | 'sistema' {
  const o = String(origin ?? '').toLowerCase();
  if (!o) return 'whatsapp';
  if (o.includes('email') || o.includes('e-mail')) return 'email';
  if (/\b(ad|ads|meta|instagram|facebook|form|web|site|google|leadgen)\b/.test(o)) return 'web';
  return 'sistema';
}

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
  // Click id CTWA (referral.ctwa_clid). Chave pra casar conversao com anuncio
  // via Conversions API. Leads organicos/antigos ficam null. (migration 044)
  ctwa_clid?: string | null;
  // Empresa dona do lead (multi-tenant). So aplicado na CRIACAO de lead novo —
  // nunca reatribui tenant de lead existente (o update strip-a esse campo).
  // Ausente = default da coluna no banco (EcoSun). (migration 081)
  company_id?: string;
}

interface DossierData {
  lead_id: string;
  content: Record<string, unknown>;
  formatted_text: string;
  status: 'draft' | 'sent' | 'read' | 'actioned';
  // [MT fatia 3e] carimbo da empresa dona — sob crachá do tenant, sem ele o
  // default EcoSun batia no WITH CHECK da 079 e o dossiê sumia falha-fechado.
  company_id?: string;
}

export class SupabaseService {
  private client: SupabaseClient;
  private readonly configRef: Pick<Config, 'supabaseUrl' | 'supabaseServiceKey'>;

  constructor(config: Pick<Config, 'supabaseUrl' | 'supabaseServiceKey'>, client?: SupabaseClient) {
    this.configRef = config;
    this.client = client ?? createClient(config.supabaseUrl, config.supabaseServiceKey);
  }

  getClient(): SupabaseClient {
    return this.client;
  }

  /** EVA MT Fatia 3a — CLONE deste serviço com OUTRO client (o crachá da
   *  empresa da mensagem). Todos os ~90 métodos passam a rodar tenant-scoped
   *  de graça. NUNCA muta o singleton: os crons de fundo (cadence, e-mail,
   *  monitoring) são multi-tenant e continuam no service_role. */
  comClient(client: SupabaseClient, companyIdDaMensagem?: string): SupabaseService {
    const clone = new SupabaseService(this.configRef, client);
    clone.companyIdDaMensagem = companyIdDaMensagem;
    return clone;
  }

  /** [MT fatia 3e] A empresa RESOLVIDA da mensagem que originou este clone.
   *  Escritas que precisam CARIMBAR company_id (dossiê, eventos do Elo)
   *  leem daqui — no singleton é undefined (caller cai no default EcoSun). */
  companyIdDaMensagem?: string;

  /** O SupabaseService que o caminho da MENSAGEM deve usar: com `RLS_EVA=1` +
   *  env do tenant + companyId resolvido → clone com o crachá da empresa;
   *  senão → ESTA MESMA instância (===, zero mudança). Decisão única em
   *  clientDaMensagem (tenant-client.ts). */
  paraMensagem(companyId?: string, e: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): SupabaseService {
    const c = clientDaMensagem(companyId, this.client, e);
    return c === this.client ? this : this.comClient(c, companyId);
  }

  async upsertLead(data: LeadData): Promise<{ id: string }> {
    // Dedup do 9º dígito: se já existe lead numa variante do telefone, ATUALIZA
    // ele (por id, preservando o telefone já salvo) em vez de inserir outro com
    // formato diferente — que era justamente o que recriava a duplicata.
    if (data.phone) {
      const existente = await this.getLeadByPhone(data.phone);
      if (existente) {
        // Lead ja existe: NUNCA reatribui a empresa (evita "mover" lead de
        // tenant por engano). company_id so vale na criacao.
        const { phone: _ignora, company_id: _icid, ...rest } = data;
        const { data: upd, error: updErr } = await this.client
          .from('leads')
          .update({ ...rest, updated_at: new Date().toISOString() })
          .eq('id', existente.id)
          .select('id')
          .single();
        if (updErr) throw new Error(`Failed to update lead: ${updErr.message}`);
        return { id: upd.id };
      }
    }

    const { data: result, error } = await this.client
      .from('leads')
      .upsert({ ...data, updated_at: new Date().toISOString() }, { onConflict: 'phone' })
      .select('id')
      .single();

    if (error) throw new Error(`Failed to upsert lead: ${error.message}`);

    // Elo (casa Comercial): chegou aqui = getLeadByPhone não achou variante →
    // é lead genuinamente NOVO (o caminho de update por telefone existente
    // retornou lá em cima). Best-effort, nunca derruba o cadastro.
    // [MT 3e] carimbo: era o 4º ponto de registrarEvento sem empresa (achado do
    // review — escondido DENTRO do método; sob crachá o evento sumia calado).
    await registrarEvento(this.client, {
      tipo: 'comercial:lead_novo',
      departamento: 'comercial',
      leadId: result.id,
      canal: canalDeOrigem(data.origin),
      payload: { origem: data.origin ?? null, status: data.status ?? null },
      companyId: (data.company_id as string | undefined) ?? this.companyIdDaMensagem,
    });

    return { id: result.id };
  }

  async getLeadByPhone(phone: string): Promise<(LeadData & { id: string }) | null> {
    // Dedup do 9º dígito: procura por TODAS as variantes do número (com/sem o 9,
    // com/sem país 55). Casa o lead independente do formato em que foi salvo.
    // Se houver mais de um (duplicata legada), devolve o MAIS ANTIGO (o original).
    const variantes = variantesTelefone(phone);
    if (variantes.length === 0) return null;
    const { data, error } = await this.client
      .from('leads')
      .select('*')
      .in('phone', variantes)
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) throw new Error(`Failed to get lead: ${error.message}`);
    return ((data?.[0] as (LeadData & { id: string }) | undefined) ?? null);
  }

  // ---- Copiloto de IA do lead (histórico salvo, migration 061) ----

  // Lê a conversa do copiloto de um lead, em ordem cronológica.
  async getConversaIA(leadId: string): Promise<{ role: 'user' | 'assistant'; conteudo: string }[]> {
    const { data, error } = await this.client
      .from('lead_ia_conversas')
      .select('role, conteudo')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('[supabase] getConversaIA:', error.message);
      return [];
    }
    return (data ?? []) as { role: 'user' | 'assistant'; conteudo: string }[];
  }

  // Salva uma mensagem da conversa (user = vendedor; assistant = IA, user_id null).
  async addMensagemIA(
    leadId: string,
    role: 'user' | 'assistant',
    conteudo: string,
    userId: string | null,
  ): Promise<void> {
    const { error } = await this.client.from('lead_ia_conversas').insert({
      lead_id: leadId,
      role,
      conteudo,
      user_id: userId,
    });
    if (error) throw new Error(`addMensagemIA: ${error.message}`);
  }

  // ---- Memória de sugestão do pós-venda (migration 065) ----
  // Obs.: a LEITURA da memória é feita inline em pos-venda-queries.ts (recebe o
  // client cru), então aqui só vive a gravação (usada pelo router ao enviar/dispensar).

  // Grava (ou atualiza) a memória de um tipo de sugestão pro lead: quando foi
  // sugerida, se foi enviada ou dispensada e até quando fica em descanso (snooze).
  // Best-effort: falhou → só loga (o envio/dispensa não pode ser bloqueado por isso).
  async upsertSugestaoMemoria(input: {
    leadId: string;
    sistemaId: string | null;
    tipo: string;
    acao: 'enviada' | 'dispensada';
    snoozedUntil: string;
    agoraIso: string;
  }): Promise<void> {
    const { error } = await this.client
      .from('pos_venda_sugestao_memoria')
      .upsert(
        {
          lead_id: input.leadId,
          sistema_id: input.sistemaId,
          tipo: input.tipo,
          ultima_sugerida_em: input.agoraIso,
          ultima_acao: input.acao,
          ultima_acao_em: input.agoraIso,
          snoozed_until: input.snoozedUntil,
          updated_at: input.agoraIso,
        },
        { onConflict: 'lead_id,tipo' },
      );
    if (error) console.warn('[supabase] upsertSugestaoMemoria falhou:', error.message);
  }

  // ---- Meta Conversions API (CAPI) ----

  /** Dados minimos pra montar/decidir um evento CAPI de um lead. */
  async getLeadForCapi(
    leadId: string,
  ): Promise<{ phone: string | null; ctwa_clid: string | null; leadgen_id: string | null; capi_stages_sent: string[] } | null> {
    const { data, error } = await this.client
      .from('leads')
      .select('phone, ctwa_clid, capi_stages_sent')
      .eq('id', leadId)
      .maybeSingle();

    if (error) throw new Error(`Failed to get lead for capi: ${error.message}`);
    if (!data) return null;

    const ctwaClid = (data.ctwa_clid as string) ?? null;

    // Lead de FORMULARIO: o leadgen_id mora em meta_leadgen_events (o webhook
    // grava lead_id -> leadgen_id). So consulta quando NAO ha clique CTWA —
    // o clique e o match mais forte e economiza uma query por evento.
    let leadgenId: string | null = null;
    if (!ctwaClid) {
      const { data: ev, error: evError } = await this.client
        .from('meta_leadgen_events')
        .select('leadgen_id')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (evError) throw new Error(`Failed to get leadgen_id for capi: ${evError.message}`);
      leadgenId = (ev?.leadgen_id as string) ?? null;
    }

    return {
      phone: (data.phone as string) ?? null,
      ctwa_clid: ctwaClid,
      leadgen_id: leadgenId,
      capi_stages_sent: (data.capi_stages_sent as string[]) ?? [],
    };
  }

  /**
   * Marca um estagio de funil como ja reportado pra Meta (idempotencia).
   * Le o array atual, appenda se ausente. Retorna true se foi adicionado agora.
   */
  async recordCapiStage(leadId: string, stage: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('leads')
      .select('capi_stages_sent')
      .eq('id', leadId)
      .maybeSingle();
    if (error) throw new Error(`Failed to read capi_stages_sent: ${error.message}`);

    const current = ((data?.capi_stages_sent as string[]) ?? []);
    if (current.includes(stage)) return false;

    const { error: updErr } = await this.client
      .from('leads')
      .update({ capi_stages_sent: [...current, stage] })
      .eq('id', leadId);
    if (updErr) throw new Error(`Failed to record capi stage: ${updErr.message}`);
    return true;
  }

  // companyId (multi-tenant fatia 2): quando informado, carimba company_id na
  // conversa NOVA (INSERT). Ausente → coluna usa o default (EcoSun, migration
  // 077) = comportamento de hoje. O ramo de conversa EXISTENTE nunca é
  // reatribuído (nunca troca a empresa de uma conversa já aberta).
  async getOrCreateConversation(leadId: string, companyId?: string): Promise<ConversationData> {
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
        ...(companyId ? { company_id: companyId } : {}),
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
  // SEQUENCIA DE E-MAIL (Elo + Maquina de E-mail — Fatia 1, migration 069)
  //
  // Espelha eva_cadence: mesma logica de agendamento, lock CAS pra evitar
  // envio duplicado quando mais de um worker roda, e status pending/sending/
  // sent/failed/cancelled.
  // ==========================================================================

  /** Intervalos em dias da sequencia de e-mail (toque 1 = imediato). */
  static readonly EMAIL_SEQUENCE_INTERVALS_DAYS = [0, 2, 5, 10, 18, 30];

  async scheduleEmailSequence(leadId: string): Promise<void> {
    const dias = SupabaseService.EMAIL_SEQUENCE_INTERVALS_DAYS;
    const now = Date.now();
    const rows = dias.map((d, i) => ({
      lead_id: leadId,
      step: i + 1,
      status: 'pending',
      scheduled_for: new Date(now + d * 24 * 60 * 60 * 1000).toISOString(),
    }));

    await this.client
      .from('email_sequencia')
      .upsert(rows, { onConflict: 'lead_id,step', ignoreDuplicates: true });
  }

  async getDueEmailSteps(batchLimit: number = 50): Promise<any[]> {
    const lim = Math.min(Math.max(batchLimit, 1), 200);
    const { data, error } = await this.client
      .from('email_sequencia')
      .select('id, lead_id, step, leads!inner(id, name, city, email, email_opt_out, profile)')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .limit(lim);

    if (error) {
      console.warn('[email] getDueEmailSteps:', error.message);
      return [];
    }
    return data ?? [];
  }

  async lockEmailForSending(id: string): Promise<boolean> {
    const { data } = await this.client
      .from('email_sequencia')
      .update({ status: 'sending' })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id');

    return Array.isArray(data) && data.length > 0;
  }

  async markEmailSent(id: string, providerMessageId: string, subject: string): Promise<void> {
    await this.client
      .from('email_sequencia')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        provider_message_id: providerMessageId,
        subject_sent: subject,
      })
      .eq('id', id)
      .eq('status', 'sending');
  }

  async markEmailFailed(id: string, err: string): Promise<void> {
    await this.client
      .from('email_sequencia')
      .update({ status: 'failed', error_message: err.slice(0, 500) })
      .eq('id', id)
      .eq('status', 'sending');
  }

  async cancelEmailSequence(leadId: string, reason: string): Promise<void> {
    await this.client
      .from('email_sequencia')
      .update({ status: 'cancelled', cancelled_reason: reason })
      .eq('lead_id', leadId)
      .eq('status', 'pending');
  }

  /**
   * Grava email + origem no lead (intake — Meta Lead Ads, formulario do site
   * etc). Best-effort: nunca lanca, so avisa no console e retorna false. O
   * caller decide se prossegue com a matricula na sequencia de e-mail.
   */
  async setLeadEmail(leadId: string, email: string, origem: string): Promise<boolean> {
    const { error } = await this.client
      .from('leads')
      .update({ email: email.toLowerCase().trim(), email_origem: origem, updated_at: new Date().toISOString() })
      .eq('id', leadId);
    if (error) {
      console.warn(`[supabase] setLeadEmail falhou para lead ${leadId}:`, error.message);
      return false;
    }
    return true;
  }

  async isEmailDescadastrado(email: string): Promise<boolean> {
    const { data } = await this.client
      .from('email_descadastro')
      .select('email')
      .eq('email', email.toLowerCase())
      .limit(1);

    return Array.isArray(data) && data.length > 0;
  }

  async registrarDescadastro(email: string, leadId: string | null, motivo: string): Promise<void> {
    await this.client
      .from('email_descadastro')
      .upsert({ email: email.toLowerCase(), lead_id: leadId, motivo });

    if (leadId) {
      await this.client.from('leads').update({ email_opt_out: true }).eq('id', leadId);
    }
  }

  /**
   * Conta eventos em eventos_elo por tipo, um HEAD count por tipo (não
   * seleciona linhas). O PostgREST cobre `select` normal com um teto de
   * ~1000 linhas por página — contar em JS a partir de um `.select('tipo')`
   * plateauia/subconta assim que o volume passa disso. Um `count: 'exact',
   * head: true` por tipo evita o teto (custa 1 query por tipo, tudo bem
   * pra um punhado de tipos).
   */
  async contarEventosPorTipo(tipos: string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const t of tipos) {
      const { count } = await this.client
        .from('eventos_elo')
        .select('*', { count: 'exact', head: true })
        .eq('tipo', t);
      out[t] = count ?? 0;
    }
    return out;
  }

  async getModeloEmail(step: number): Promise<any | null> {
    const { data } = await this.client
      .from('email_modelos')
      .select('*')
      .eq('step', step)
      .eq('ativo', true)
      .limit(1);

    return Array.isArray(data) && data[0] ? data[0] : null;
  }

  /**
   * Lê uma flag booleana da tabela app_flags (key/value texto: 'true'/'false').
   * Retorna null se a chave não existe (permite o caller decidir o default).
   */
  async getFlag(key: string): Promise<boolean | null> {
    const { data } = await this.client.from('app_flags').select('value').eq('key', key).maybeSingle();
    if (!data) return null;
    return (data as { value: string }).value === 'true';
  }

  /** Grava/atualiza uma flag booleana em app_flags (upsert por key). */
  async setFlag(key: string, value: boolean): Promise<void> {
    await this.client.from('app_flags').upsert({ key, value: value ? 'true' : 'false' }, { onConflict: 'key' });
  }

  /**
   * Inscreve automaticamente na jornada de e-mail (scheduleEmailSequence) todo
   * lead ABERTO e elegivel: tem e-mail, nao deu opt-out, nao esta arquivado,
   * nao virou cliente (installation_status) e nao esta 'perdido' (status).
   * Cobre a base existente + leads futuros de qualquer origem, chamado num
   * sweep periodico (src/index.ts) — idempotente porque scheduleEmailSequence
   * ja usa upsert com ignoreDuplicates.
   *
   * Duplica a lista de CLIENTE_STATUSES em vez de importar de
   * dashboard/clientes-queries.ts pra nao criar dependencia server->dashboard
   * (raias separadas, ver CLAUDE.md). Se essa lista mudar la, muda aqui tambem.
   *
   * O filtro de status roda em JS (nao em SQL): um `.not(col,'in',(...))` puro
   * no Postgres derruba silenciosamente toda linha com a coluna NULL (armadilha
   * ja documentada em dashboard/leads-queries.ts) — e a maioria dos leads
   * abertos tem installation_status NULL. Fazer a checagem em JS depois de um
   * fetch mais simples evita essa pegadinha.
   */
  async inscreverLeadsElegiveisEmail(max: number = 500): Promise<number> {
    const CLIENTE_STATUSES = ['contrato_assinado', 'instalado', 'medidor_trocado', 'operando', 'pos_venda_concluido'];

    const { data, error } = await this.client
      .from('leads')
      .select('id, email, status, installation_status, archived_at, email_opt_out')
      .not('email', 'is', null)
      .neq('email', '')
      .not('email_opt_out', 'is', true)
      .is('archived_at', null)
      .limit(2000);

    if (error) {
      console.warn('[email] inscreverLeadsElegiveisEmail: busca de leads falhou:', error.message);
      return 0;
    }

    const candidatos = ((data ?? []) as any[]).filter((l) => {
      if (!l.email || l.email_opt_out || l.archived_at) return false;
      if (l.status === 'perdido') return false;
      if (l.installation_status && CLIENTE_STATUSES.includes(l.installation_status)) return false;
      return true;
    });
    if (candidatos.length === 0) return 0;

    const [{ data: jaInscritos }, { data: descadastrados }] = await Promise.all([
      this.client.from('email_sequencia').select('lead_id'),
      this.client.from('email_descadastro').select('email'),
    ]);
    const idsInscritos = new Set(((jaInscritos ?? []) as any[]).map((r) => r.lead_id));
    const emailsDescadastrados = new Set(
      ((descadastrados ?? []) as any[]).map((r) => String(r.email ?? '').toLowerCase()),
    );

    const elegiveis = candidatos
      .filter((l) => !idsInscritos.has(l.id) && !emailsDescadastrados.has(String(l.email).toLowerCase()))
      .slice(0, max);

    let inscritos = 0;
    for (const lead of elegiveis) {
      try {
        await this.scheduleEmailSequence(lead.id);
        inscritos++;
      } catch (err) {
        console.error(`[email] inscreverLeadsElegiveisEmail: falhou pro lead ${lead.id}:`, (err as Error)?.message);
      }
    }
    if (inscritos) console.log(`[email] inscrição automática: ${inscritos} lead(s) novo(s) na jornada`);
    return inscritos;
  }

  /**
   * Destinatários de uma CAMPANHA de e-mail avulsa (feature "Campanha via Eva").
   * Reusa os MESMOS filtros de elegibilidade da jornada (inscreverLeadsElegiveisEmail):
   * lead com e-mail, sem email_opt_out, não arquivado, status != 'perdido',
   * installation_status fora dos CLIENTE_STATUSES, e-mail não descadastrado.
   *
   * DIFERENÇA da jornada: campanha é AVULSA — NÃO exclui quem já está na
   * email_sequencia (a campanha vai pra base toda que aceita e-mail, esteja ou
   * não na régua automática).
   *
   * O filtro de status roda em JS (não em SQL) pela mesma armadilha do NULL
   * documentada em inscreverLeadsElegiveisEmail (um `.not(col,'in',(...))` puro
   * derruba silenciosamente toda linha com a coluna NULL).
   */
  async listarDestinatariosCampanha(max: number = 1000): Promise<Array<{ id: string; email: string; name: string }>> {
    const CLIENTE_STATUSES = ['contrato_assinado', 'instalado', 'medidor_trocado', 'operando', 'pos_venda_concluido'];

    const { data, error } = await this.client
      .from('leads')
      .select('id, name, email, status, installation_status, archived_at, email_opt_out')
      .not('email', 'is', null)
      .neq('email', '')
      .not('email_opt_out', 'is', true)
      .is('archived_at', null)
      .limit(5000);

    if (error) {
      console.warn('[campanha] listarDestinatariosCampanha: busca de leads falhou:', error.message);
      return [];
    }

    const candidatos = ((data ?? []) as any[]).filter((l) => {
      if (!l.email || l.email_opt_out || l.archived_at) return false;
      if (l.status === 'perdido') return false;
      if (l.installation_status && CLIENTE_STATUSES.includes(l.installation_status)) return false;
      return true;
    });
    if (candidatos.length === 0) return [];

    const { data: descadastrados } = await this.client.from('email_descadastro').select('email');
    const emailsDescadastrados = new Set(
      ((descadastrados ?? []) as any[]).map((r) => String(r.email ?? '').toLowerCase()),
    );

    return candidatos
      .filter((l) => !emailsDescadastrados.has(String(l.email).toLowerCase()))
      .slice(0, max)
      .map((l) => ({ id: l.id as string, email: l.email as string, name: (l.name ?? '') as string }));
  }

  /**
   * Retorna o id do lead existente pelo telefone, ou cria um novo (status='qualificado').
   * Usado por savePropostaPublica e pelo modo /fechar pra garantir que
   * proposta sempre fica linkada a um lead. Resolve bug Fase 1 (proposta orfa).
   *
   * Lanca se phone vazio (leads.phone e NOT NULL UNIQUE).
   */
  // company_id EXPLÍCITO (Fase 2): com 1 tenant o DEFAULT da coluna segurava;
  // com o tenant #2 um lead criado "no default" nasceria na empresa errada.
  // Quem sabe a empresa (webhook/rota) passa; ausente = EcoSun (compat).
  async getOrCreateLeadByPhone(phone: string, nameIfNew: string, companyId = '00000000-0000-0000-0000-000000000001'): Promise<string> {
    if (!phone || !phone.trim()) {
      throw new Error('getOrCreateLeadByPhone: telefone obrigatorio');
    }
    const phoneClean = phone.replace(/\D+/g, '');

    // Dedup do 9º dígito: acha por QUALQUER variante (com/sem 9) antes de criar.
    const existing = await this.getLeadByPhone(phoneClean);
    if (existing?.id) return existing.id as string;

    const { data: created, error: insertErr } = await this.client
      .from('leads')
      .insert({ name: nameIfNew, phone: phoneClean, status: 'qualificado', company_id: companyId })
      .select('id')
      .single();
    if (insertErr) throw new Error(`getOrCreateLeadByPhone insert: ${insertErr.message}`);
    return (created as { id: string }).id;
  }

  // ==========================================================================
  // Hooks de funil (CRM Fase 2) — ADITIVOS e BEST-EFFORT.
  // Avancam a etapa do lead e logam na timeline. Quem chama SEMPRE envolve
  // em try/catch que so faz console.warn — erro aqui nunca quebra proposta,
  // registro de acesso, nem fechamento. A Eva de atendimento nao muda.
  // ==========================================================================

  // Avanca a etapa do lead conforme o evento e loga 'etapa_mudou' se mudou.
  // Best-effort — quem chama envolve em try/catch.
  private async avancarEtapaFunil(leadId: string, evento: EventoFunil): Promise<void> {
    const { data: lead } = await this.client.from('leads')
      .select('status, company_id').eq('id', leadId).maybeSingle();
    if (!lead) return;
    const companyId = (lead as { company_id?: string }).company_id ?? '00000000-0000-0000-0000-000000000001';
    const atual = String((lead as { status?: string }).status ?? '');
    const proxima = proximaEtapaPorEvento(atual, evento);
    if (proxima !== atual) {
      await this.client.from('leads').update({ status: proxima }).eq('id', leadId);
      await registrarAtividade(this.client, {
        company_id: companyId, lead_id: leadId, tipo: 'etapa_mudou',
        titulo: `Etapa: ${atual} → ${proxima}`, automatica: true,
        payload: { de: atual, para: proxima, evento },
      });
      // Elo (casa Comercial): estágio do lead mudou. Best-effort.
      await registrarEvento(this.client, {
        tipo: 'comercial:estagio_mudou',
        departamento: 'comercial',
        leadId,
        payload: { de: atual, para: proxima, evento },
      });
    }
  }

  async onPropostaEnviada(leadId: string, numeroProposta: string, propostaId: string): Promise<void> {
    const { data: lead } = await this.client.from('leads').select('company_id').eq('id', leadId).maybeSingle();
    const companyId = (lead as { company_id?: string } | null)?.company_id ?? '00000000-0000-0000-0000-000000000001';
    await registrarAtividade(this.client, {
      company_id: companyId, lead_id: leadId, tipo: 'proposta_enviada',
      titulo: `Proposta ${numeroProposta} enviada`, automatica: true, payload: { propostaId },
    });
    await this.avancarEtapaFunil(leadId, 'proposta_gerada');
    // Task 8: cria tarefa de cobrança de retorno da proposta (best-effort, idempotente).
    const { data: leadInfo } = await this.client.from('leads').select('company_id, claimed_by').eq('id', leadId).maybeSingle();
    const ci = (leadInfo as { company_id?: string } | null)?.company_id ?? '00000000-0000-0000-0000-000000000001';
    const dono = (leadInfo as { claimed_by?: string | null } | null)?.claimed_by ?? null;
    await criarTarefa(this.client, {
      company_id: ci, lead_id: leadId, titulo: 'Cobrar retorno da proposta', tipo: 'cobrar_proposta',
      due_at: new Date(Date.now() + 3 * 24 * 3600_000).toISOString(), prioridade: 'alta',
      automatica: true, etapa_origem: 'proposta_enviada', assigned_to: dono,
    });
  }

  async onPropostaAberta(leadId: string): Promise<void> {
    const { data: lead } = await this.client.from('leads').select('company_id').eq('id', leadId).maybeSingle();
    const companyId = (lead as { company_id?: string } | null)?.company_id ?? '00000000-0000-0000-0000-000000000001';
    await registrarAtividade(this.client, {
      company_id: companyId, lead_id: leadId, tipo: 'proposta_aberta',
      titulo: 'Cliente abriu a proposta', automatica: true,
    });
    await this.avancarEtapaFunil(leadId, 'proposta_aberta');
  }

  async onLeadGanho(leadId: string): Promise<void> {
    const { data: lead } = await this.client.from('leads').select('company_id').eq('id', leadId).maybeSingle();
    const companyId = (lead as { company_id?: string } | null)?.company_id ?? '00000000-0000-0000-0000-000000000001';
    await registrarAtividade(this.client, {
      company_id: companyId, lead_id: leadId, tipo: 'ganho',
      titulo: 'Fechamento confirmado', automatica: true,
    });
    await this.avancarEtapaFunil(leadId, 'fechou');
    // Lead virou terminal (ganho): cancela tarefas pendentes pra não alertar SLA-fantasma.
    try { await cancelarTarefasPendentesDoLead(this.client, leadId); } catch (e) { console.warn('[onLeadGanho] cancelar tarefas falhou (segue):', (e as Error).message); }
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
    // [Fase 2 B1b] empresa dona da proposta — carimbo explícito (o dashboard
    // lista propostas pelo crachá; sem carimbo a proposta do tenant sumiria).
    companyId?: string | null;
  }): Promise<{ id: string; expiresAt: string }> {
    const donoId = input.companyId ?? '00000000-0000-0000-0000-000000000001';
    // Vincula lead se telefone vier preenchido. Resolve bug Fase 1 (proposta orfa).
    let leadId: string | null = null;
    if (input.clienteTelefone && input.clienteTelefone.trim()) {
      try {
        leadId = await this.getOrCreateLeadByPhone(input.clienteTelefone, input.clienteNome, donoId);
      } catch (err) {
        // Falha no get-or-create NAO bloqueia salvar a proposta — loga e segue.
        console.warn('[supabase] savePropostaPublica getOrCreateLeadByPhone falhou:', (err as Error).message);
      }
    }

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
        lead_id: leadId,
        company_id: donoId,
      })
      .select('id, expires_at')
      .single();

    if (error) throw new Error(`Failed to save proposta publica: ${error.message}`);

    // Elo (casa Comercial): proposta pública criada. Best-effort. leadId pode
    // ser null (proposta sem telefone) — o event-stream aceita.
    await registrarEvento(this.client, {
      tipo: 'comercial:proposta_criada',
      departamento: 'comercial',
      leadId,
      payload: { propostaId: data.id, numeroProposta: input.numeroProposta, slug: input.slug },
      companyId: donoId, // [B1b] evento do Elo carimbado com a empresa da proposta
    });

    // Hook de funil (Fase 2) — best-effort, nunca quebra o salvamento da proposta.
    if (leadId) {
      try { await this.onPropostaEnviada(leadId, input.numeroProposta, data.id); }
      catch (e) { console.warn('[funil] onPropostaEnviada falhou:', (e as Error).message); }
    }

    return { id: data.id, expiresAt: data.expires_at };
  }

  async getPropostaInputBySlug(slug: string): Promise<{
    dadosInput: Record<string, unknown> | null;
    numeroProposta: string;
    clienteNome: string;
    clienteTelefone: string | null;
    tipo: 'basica' | 'personalizada';
    modoEnvio: 'junior_envia' | 'eva_envia';
  } | null> {
    const { data, error } = await this.client
      .from('propostas_publicas')
      .select('dados_input, numero_proposta, cliente_nome, cliente_telefone, tipo, modo_envio, revoked')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw new Error(`getPropostaInputBySlug: ${error.message}`);
    if (!data || data.revoked) return null;
    return {
      dadosInput: (data.dados_input as Record<string, unknown> | null) ?? null,
      numeroProposta: data.numero_proposta,
      clienteNome: data.cliente_nome,
      clienteTelefone: data.cliente_telefone ?? null,
      tipo: data.tipo ?? 'basica',
      modoEnvio: data.modo_envio ?? 'junior_envia',
    };
  }

  async updatePropostaPublica(slug: string, fields: { htmlContent?: string; dadosInput?: Record<string, unknown> }): Promise<void> {
    const update: Record<string, unknown> = {};
    if (fields.htmlContent !== undefined) update.html_content = fields.htmlContent;
    if (fields.dadosInput !== undefined) update.dados_input = fields.dadosInput;
    if (Object.keys(update).length === 0) return;
    const { error } = await this.client.from('propostas_publicas').update(update).eq('slug', slug);
    if (error) throw new Error(`updatePropostaPublica: ${error.message}`);
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
        .select('id, acessos, lead_id')
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

      // Hook de funil (Fase 2) — cliente abriu a proposta. Best-effort.
      const leadIdDaProposta = (data as { lead_id?: string | null }).lead_id ?? null;
      if (leadIdDaProposta) {
        try { await this.onPropostaAberta(leadIdDaProposta); }
        catch (e) { console.warn('[funil] onPropostaAberta falhou:', (e as Error).message); }
      }

      // Elo (casa Comercial): proposta aberta pelo cliente. Só na PRIMEIRA
      // visualização (acessosAntes === 0) — evita disparar em cada refresh.
      // Best-effort, nunca bloqueia a resposta HTTP da proposta.
      if (acessosAntes === 0) {
        await registrarEvento(this.client, {
          tipo: 'comercial:proposta_aberta',
          departamento: 'comercial',
          canal: 'web',
          leadId: leadIdDaProposta,
          payload: { propostaId: (data as { id?: string }).id ?? null, slug },
        });
      }

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
    canal?: 'web' | 'pdf';
  }): Promise<void> {
    try {
      await this.client.from('proposta_visualizacoes').insert({
        proposta_slug: params.slug,
        ip_address: params.ipAddress ?? null,
        user_agent: params.userAgent ?? null,
        is_preview: params.isPreview,
        referer: params.referer ?? null,
        canal: params.canal ?? 'web',
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
    // [Fase 2 A3] empresa dona do sistema — carimbo explícito (nunca o default).
    company_id?: string | null;
  }): Promise<void> {
    const { error } = await this.client.from('monitoring_alerts').insert({
      ...input,
      company_id: input.company_id ?? '00000000-0000-0000-0000-000000000001',
      last_sent_at: null,
      snoozed_until: null,
      resolved_at: null,
    });
    if (error) {
      // 23505 = unique_violation no índice parcial monitoring_alerts_dedupe
      // (sistema_id, tipo) WHERE resolved_at IS NULL. Significa que JÁ existe
      // um alerta aberto desse tipo pra essa usina — que é exatamente o estado
      // desejado. Operação idempotente: não há nada a fazer, segue em silêncio.
      // (Antes isso virava warn e spammava o log toda detecção horária.)
      if (error.code === '23505') return;
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

  // Resumo diário do pós-venda: alerta não-urgente em treino não vira mensagem
  // individual — fica registrado como absorvido e não compete de novo antes do
  // prazo. Fica sempre ABERTO (nunca resolvido): resolver faria o detect
  // recriar o alerta toda hora (churn) porque o detect só dedupa contra
  // alertas OPEN do mesmo tipo. Quem decide a trava é o dispatcher: marco
  // (milestone_economia) usa +30d (aberto não repinta nada — saúde da tela
  // ignora esse tipo), queda (queda_geracao) usa +3d (é ela que pinta o
  // amarelo da tela).
  async marcarAlertaAbsorvidoPorResumo(id: string, sentAt: string, nextSendAt: string): Promise<void> {
    const { error } = await this.client
      .from('monitoring_alerts')
      .update({
        acao_disparada: 'resumo_diario', acao_disparada_em: sentAt,
        last_sent_at: sentAt, next_send_at: nextSendAt,
      })
      .eq('id', id);
    if (error) console.error('[supabase] marcarAlertaAbsorvidoPorResumo:', error.message);
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
      // Despacho vai pro zap do ADMIN EcoSun — so alertas da CASA entram na
      // fila: company_id da EcoSun ou null (legado pre-multi-tenant). Alerta
      // de tenant fica no banco (tela do tenant; zap do tenant = produto
      // futuro). Achado na degustacao Sabion 27/07: 27 usinas importadas sem
      // geracao viraram "offline" no zap do Junior.
      .or(`company_id.is.null,company_id.eq.00000000-0000-0000-0000-000000000001`)
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

  async listClientesByStatus(statuses: string[], filters: { q?: string; concessionaria?: string; cidade?: string; ord?: string; mostrarArquivados?: boolean } = {}, limit: number = 50, offset: number = 0, incluirManuaisDashboard: boolean = false): Promise<any[]> {
    let q = this.client
      .from('leads')
      .select('id, name, phone, email, profile, installation_status, installed_at, city, uf, concessionaria, consumo_medio_kwh, conta_media_brl, opt_out, eva_active, created_at, archived_at')
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

    if (filters.mostrarArquivados) q = q.not('archived_at', 'is', null);
    else q = q.is('archived_at', null);

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

  async countClientesByStatus(statuses: string[], filters: { q?: string; concessionaria?: string; cidade?: string; mostrarArquivados?: boolean } = {}, incluirManuaisDashboard: boolean = false): Promise<number> {
    let q = this.client.from('leads').select('id', { count: 'exact', head: true });

    if (statuses.length > 0 && incluirManuaisDashboard) {
      q = q.or(`installation_status.in.(${statuses.join(',')}),acquisition_source.eq.manual_dashboard`);
    } else if (statuses.length > 0) {
      q = q.in('installation_status', statuses);
    } else if (incluirManuaisDashboard) {
      q = q.eq('acquisition_source', 'manual_dashboard');
    }

    if (filters.mostrarArquivados) q = q.not('archived_at', 'is', null);
    else q = q.is('archived_at', null);

    if (filters.q) q = q.or(`name.ilike.%${filters.q}%,phone.ilike.%${filters.q}%,email.ilike.%${filters.q}%,cpf_cnpj.ilike.%${filters.q}%`);
    if (filters.concessionaria) q = q.eq('concessionaria', filters.concessionaria);
    if (filters.cidade) q = q.eq('city', filters.cidade);

    const { count, error } = await q;
    if (error) {
      console.error('[supabase] countClientesByStatus:', error.message);
      return 0;
    }
    return count ?? 0;
  }

  async arquivarLead(leadId: string): Promise<{ ok: boolean; error?: string }> {
    const { error } = await this.client.from('leads').update({ archived_at: new Date().toISOString() }).eq('id', leadId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async desarquivarLead(leadId: string): Promise<{ ok: boolean; error?: string }> {
    const { error } = await this.client.from('leads').update({ archived_at: null }).eq('id', leadId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async marcarLeadPerdido(
    leadId: string,
    reason: string,
    notes?: string | null,
  ): Promise<{ ok: boolean; error?: string }> {
    const validReasons = ['nao_atende', 'concorrente', 'sem_orcamento', 'fora_area', 'sem_interesse', 'outro'];
    if (!validReasons.includes(reason)) {
      return { ok: false, error: `Motivo invalido: ${reason}` };
    }
    const { error } = await this.client
      .from('leads')
      .update({
        status: 'perdido',
        loss_reason: reason,
        loss_notes: notes?.trim() || null,
        lost_at: new Date().toISOString(),
        eva_active: false, // pausa Eva automaticamente
      })
      .eq('id', leadId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async desmarcarLeadPerdido(leadId: string): Promise<{ ok: boolean; error?: string }> {
    // Volta pra 'qualificando' (estado neutro) — Junior pode reclassificar manualmente
    const { error } = await this.client
      .from('leads')
      .update({
        status: 'qualificando',
        loss_reason: null,
        loss_notes: null,
        lost_at: null,
      })
      .eq('id', leadId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
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
    company_id?: string; // [MT 3e] carimbo da empresa dona (lead_anexos na 079)
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

  // Busca propostas (não revogadas) pelo nome do cliente — pro comando "atualizar
  // <nome>" no zap. Mais recentes primeiro. valorTotal lido do dados_input (KPI).
  async buscarPropostasPorNome(nome: string, limit = 5): Promise<Array<{
    slug: string;
    clienteNome: string;
    numeroProposta: string;
    createdAt: string;
    valorTotal: number | null;
  }>> {
    const termo = nome.trim();
    if (!termo) return [];
    const { data, error } = await this.client
      .from('propostas_publicas')
      .select('slug, cliente_nome, numero_proposta, created_at, dados_input')
      .ilike('cliente_nome', `%${termo}%`)
      .eq('revoked', false)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`buscarPropostasPorNome: ${error.message}`);
    return (data ?? []).map((p: any) => ({
      slug: p.slug,
      clienteNome: p.cliente_nome,
      numeroProposta: p.numero_proposta,
      createdAt: p.created_at,
      valorTotal: (p.dados_input?.investimento?.total as number | undefined) ?? null,
    }));
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
    city?: string | null;
    uf?: string | null;
    cep?: string | null;
  }): Promise<{ ok: boolean; lead_id?: string; error?: string; reused?: boolean; reusedName?: string | null }> {
    // 1. Confirma que o sistema existe e ainda não tem lead vinculado
    const { data: sistema, error: sErr } = await this.client
      .from('sistemas_clientes')
      .select('id, lead_id, data_instalacao')
      .eq('id', input.sistema_id)
      .single();
    if (sErr || !sistema) return { ok: false, error: 'Sistema não encontrado' };
    if (sistema.lead_id) return { ok: false, error: 'Sistema já tem cliente vinculado' };

    // Vincula um lead (novo ou já existente) ao sistema. Centraliza o passo 3 pra
    // reusar tanto no fluxo normal quanto no fallback de telefone duplicado.
    const vincular = async (leadId: string): Promise<{ ok: boolean; error?: string }> => {
      // Vincular dono a uma usina órfã = ela veio do monitoramento, já opera =>
      // vai direto pro pós-venda (etapa_obra='pos_venda'), saindo do kanban.
      // Regra: usina nunca em dois lugares (ver pos-venda-queries / regra XOR).
      const now = new Date().toISOString();
      const { error: vErr } = await this.client
        .from('sistemas_clientes')
        .update({ lead_id: leadId, etapa_obra: 'pos_venda', etapa_obra_updated_at: now, updated_at: now })
        .eq('id', input.sistema_id);
      return vErr ? { ok: false, error: vErr.message } : { ok: true };
    };

    // 2. O telefone tem trava de unicidade (leads_phone_key). Se já existe um lead
    // com esse telefone, é a mesma pessoa: reusa o cadastro em vez de duplicar
    // (não sobrescreve dados do lead existente — só liga na usina).
    const { data: existente } = await this.client
      .from('leads')
      .select('id, name')
      .eq('phone', input.phone)
      .maybeSingle();
    if (existente) {
      const v = await vincular(existente.id);
      if (!v.ok) return { ok: false, error: v.error };
      return { ok: true, lead_id: existente.id, reused: true, reusedName: existente.name };
    }

    // 3. Cria o lead novo
    const { data: novoLead, error: lErr } = await this.client
      .from('leads')
      .insert({
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        city: input.city ?? null,
        uf: input.uf ?? null,
        cep: input.cep ?? null,
        // Empresa dona do lead. Sem isso o cliente nasce "órfão de empresa" e
        // some das telas que filtram por company (ex: Pós-venda). Default EcoSun
        // (single-tenant), igual ao fallback usado no resto do código.
        company_id: '00000000-0000-0000-0000-000000000001',
        installation_status: 'operando',
        installed_at: sistema.data_instalacao,
        eva_active: false,                    // Junior precisa ativar depois
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (lErr || !novoLead) {
      // Corrida: alguém com esse telefone foi inserido entre a checagem e o insert.
      // Cai no mesmo tratamento de reuso em vez de devolver erro cru do banco.
      if (lErr?.code === '23505') {
        const { data: agora } = await this.client
          .from('leads').select('id, name').eq('phone', input.phone).maybeSingle();
        if (agora) {
          const v = await vincular(agora.id);
          if (!v.ok) return { ok: false, error: v.error };
          return { ok: true, lead_id: agora.id, reused: true, reusedName: agora.name };
        }
        // Bateu na trava de telefone mas o re-lookup não achou (falha transitória):
        // mensagem amigável em vez do erro cru do banco.
        return { ok: false, error: 'Esse telefone já está cadastrado. Tente buscar o cliente pelo nome.' };
      }
      return { ok: false, error: lErr?.message ?? 'Falha ao criar lead' };
    }

    // 4. Vincula o lead recém-criado
    const v = await vincular(novoLead.id);
    if (!v.ok) {
      // rollback do lead (best-effort)
      try { await this.client.from('leads').delete().eq('id', novoLead.id); } catch {}
      return { ok: false, error: v.error };
    }
    return { ok: true, lead_id: novoLead.id };
  }

  // Busca clientes (leads) por nome OU telefone pra vincular como proprietário.
  // Exclui inativos (arquivados). Retorna no máximo `limit` resultados.
  async searchClientesParaVinculo(
    rawTerm: string,
    limit = 10,
  ): Promise<Array<{ id: string; name: string | null; phone: string | null; city: string | null }>> {
    const { buildClienteSearchFilter } = await import('./dashboard/proprietario.js');
    const f = buildClienteSearchFilter(rawTerm);
    if (!f.valid) return [];
    const { data, error } = await this.client
      .from('leads')
      .select('id, name, phone, city')
      .or(f.or)
      .neq('status', 'inativo')
      .order('name', { ascending: true })
      .limit(limit);
    if (error) {
      console.error('[supabase] searchClientesParaVinculo:', error.message);
      return [];
    }
    return data ?? [];
  }

  // Vincula um sistema a um cliente JÁ EXISTENTE. Não altera nenhum dado do
  // cliente (status, installed_at, etc.) — só seta sistemas_clientes.lead_id.
  async vincularClienteExistente(input: {
    sistema_id: string;
    lead_id: string;
  }): Promise<{ ok: boolean; error?: string }> {
    // valida sistema
    const { data: sistema, error: sErr } = await this.client
      .from('sistemas_clientes')
      .select('id')
      .eq('id', input.sistema_id)
      .single();
    if (sErr || !sistema) return { ok: false, error: 'Sistema não encontrado' };
    // valida lead
    const { data: lead, error: lErr } = await this.client
      .from('leads')
      .select('id')
      .eq('id', input.lead_id)
      .single();
    if (lErr || !lead) return { ok: false, error: 'Cliente não encontrado' };
    // vincula. Vincular dono a uma usina órfã = ela já opera => vai direto pro
    // pós-venda (etapa_obra='pos_venda'), saindo do kanban. Regra XOR: usina
    // nunca em dois lugares (ver pos-venda-queries).
    const now = new Date().toISOString();
    const { error: vErr } = await this.client
      .from('sistemas_clientes')
      .update({ lead_id: input.lead_id, etapa_obra: 'pos_venda', etapa_obra_updated_at: now, updated_at: now })
      .eq('id', input.sistema_id);
    if (vErr) return { ok: false, error: vErr.message };
    return { ok: true };
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
    /** Empresa dona do lead. Sem isso o cliente nasce na EcoSun (#1) e some das
     *  telas de outra empresa (multi-tenant). Default EcoSun quando não vem. */
    companyId?: string | null;
  }): Promise<{ ok: boolean; lead_id?: string; error?: string }> {
    // Confere se já existe lead com mesmo telefone (evita duplicata)
    const phoneClean = String(input.phone).replace(/\D/g, '');
    if (!phoneClean) return { ok: false, error: 'Telefone obrigatório' };

    // Duplicata é POR EMPRESA: a MESMA pessoa pode ser cliente de dois integradores
    // (multi-tenant). Sem escopar, criar cliente na Empresa B trava porque o telefone
    // existe na Empresa A. `.limit(1)` (não maybeSingle) pra não estourar com duplicata.
    let dedup = this.client.from('leads').select('id, name').eq('phone', phoneClean).limit(1);
    if (input.companyId) dedup = dedup.eq('company_id', input.companyId);
    const { data: existentes } = await dedup;
    const existente = (existentes ?? [])[0];
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
        // Empresa dona do lead. Vem do operador logado (multi-tenant); default
        // EcoSun (#1) quando não informado. Sem isso o cliente some das telas
        // filtradas por company (Pós-venda, CRM).
        company_id: input.companyId ?? '00000000-0000-0000-0000-000000000001',
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
    // GUARD: bloqueia delete se cliente tem proposta ou sistema vinculado.
    // Propostas envolvem valor financeiro; sistemas FV são dado físico real.
    // Demais tabelas (cadencia, conversas, anexos, relatorios, alertas) somem
    // por ON DELETE CASCADE no schema — ok perder porque sao recriaveis.
    const [propostasResp, sistemasResp] = await Promise.all([
      this.client.from('propostas_publicas').select('id', { count: 'exact', head: true }).eq('lead_id', leadId),
      this.client.from('sistemas_clientes').select('id', { count: 'exact', head: true }).eq('lead_id', leadId),
    ]);
    const propostas = propostasResp.count ?? 0;
    const sistemas = sistemasResp.count ?? 0;
    if (propostas > 0 || sistemas > 0) {
      const partes: string[] = [];
      if (propostas > 0) partes.push(`${propostas} proposta${propostas > 1 ? 's' : ''}`);
      if (sistemas > 0) partes.push(`${sistemas} sistema${sistemas > 1 ? 's' : ''} FV`);
      return {
        ok: false,
        error: `Este cliente tem ${partes.join(' e ')} vinculado(s). Revogue/arquive antes de excluir, ou peça pra mim adicionar 'Arquivar' como alternativa.`,
      };
    }
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
