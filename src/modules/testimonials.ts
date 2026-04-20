import { SupabaseClient } from '@supabase/supabase-js';

export type TestimonialFormat = 'audio' | 'video' | 'text' | 'screenshot';
export type TestimonialSentiment = 'positivo' | 'neutro' | 'negativo';

export interface SaveTestimonialInput {
  leadId: string;
  format: TestimonialFormat;
  content?: string | null;       // texto bruto ou transcricao
  mediaUrl?: string | null;      // URL no Supabase Storage
  googlePosted?: boolean;        // cliente ja confirmou postagem no GMB?
  sentiment?: TestimonialSentiment;
  sourceMessageId?: string | null;
  notes?: string | null;
}

export interface TestimonialRow {
  id: string;
  lead_id: string;
  format: TestimonialFormat;
  content: string | null;
  media_url: string | null;
  google_posted: boolean;
  usable_for_marketing: boolean;
  sentiment: TestimonialSentiment | null;
  source_message_id: string | null;
  notes: string | null;
  created_at: string;
}

export class TestimonialService {
  constructor(private supabase: SupabaseClient) {}

  async save(input: SaveTestimonialInput): Promise<{ id: string; duplicate: boolean }> {
    // Dedup: se ja existe depoimento com o mesmo source_message_id, retorna
    // ele em vez de inserir duplicata. Protege contra replay de mensagem
    // do WhatsApp (queue retry, restart com mensagem ainda na fila).
    if (input.sourceMessageId) {
      const { data: existing } = await this.supabase
        .from('testimonials')
        .select('id')
        .eq('source_message_id', input.sourceMessageId)
        .maybeSingle();
      if (existing) {
        return { id: existing.id as string, duplicate: true };
      }
    }

    const row = {
      lead_id: input.leadId,
      format: input.format,
      content: input.content ?? null,
      media_url: input.mediaUrl ?? null,
      google_posted: input.googlePosted ?? false,
      sentiment: input.sentiment ?? null,
      source_message_id: input.sourceMessageId ?? null,
      notes: input.notes ?? null,
    };
    const { data, error } = await this.supabase
      .from('testimonials')
      .insert(row)
      .select('id')
      .single();
    if (error) {
      // Colisao de unique index (race condition) = volta a buscar o existente
      if (error.code === '23505' && input.sourceMessageId) {
        const { data: existing } = await this.supabase
          .from('testimonials')
          .select('id')
          .eq('source_message_id', input.sourceMessageId)
          .maybeSingle();
        if (existing) return { id: existing.id as string, duplicate: true };
      }
      throw new Error(`Failed to save testimonial: ${error.message}`);
    }
    return { id: data.id, duplicate: false };
  }

  async listUsable(limit = 20): Promise<TestimonialRow[]> {
    const { data, error } = await this.supabase
      .from('testimonials')
      .select('*')
      .eq('usable_for_marketing', true)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Failed to list testimonials: ${error.message}`);
    return (data ?? []) as TestimonialRow[];
  }

  async listByLead(leadId: string): Promise<TestimonialRow[]> {
    const { data, error } = await this.supabase
      .from('testimonials')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to list by lead: ${error.message}`);
    return (data ?? []) as TestimonialRow[];
  }

  async markGooglePosted(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('testimonials')
      .update({ google_posted: true })
      .eq('id', id);
    if (error) throw new Error(`Failed to mark google posted: ${error.message}`);
  }

  async setUsableForMarketing(id: string, usable: boolean): Promise<void> {
    const { error } = await this.supabase
      .from('testimonials')
      .update({ usable_for_marketing: usable })
      .eq('id', id);
    if (error) throw new Error(`Failed to update usable flag: ${error.message}`);
  }
}
