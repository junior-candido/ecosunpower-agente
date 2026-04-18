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

    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
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
        expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
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
}
