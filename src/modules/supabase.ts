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

  // ==========================================================================
  // Cadencia de reengajamento (5 toques: 0h, 15d, 30d, 45d, 60d)
  // ==========================================================================

  async scheduleCadence(leadId: string, startOffsetMinutes: number = 0): Promise<void> {
    await this.client
      .from('eva_cadence')
      .update({ status: 'cancelled', cancelled_reason: 'superseded' })
      .eq('lead_id', leadId)
      .eq('status', 'pending');

    const now = Date.now();
    const steps = [
      { step: 1, offsetDays: 0 },
      { step: 2, offsetDays: 15 },
      { step: 3, offsetDays: 30 },
      { step: 4, offsetDays: 45 },
      { step: 5, offsetDays: 60 },
    ];

    const rows = steps.map((s) => ({
      lead_id: leadId,
      step: s.step,
      scheduled_for: new Date(now + startOffsetMinutes * 60_000 + s.offsetDays * 24 * 60 * 60_000).toISOString(),
      status: 'pending',
    }));

    const { error } = await this.client
      .from('eva_cadence')
      .upsert(rows, { onConflict: 'lead_id,step', ignoreDuplicates: false });

    if (error) throw new Error(`Failed to schedule cadence: ${error.message}`);
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

  async getDueCadenceSteps(): Promise<Array<{
    id: string;
    lead_id: string;
    step: number;
    scheduled_for: string;
    phone: string;
    name: string | null;
  }>> {
    const { data, error } = await this.client
      .from('eva_cadence')
      .select('id, lead_id, step, scheduled_for, leads!inner(phone, name)')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(50);

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
}
