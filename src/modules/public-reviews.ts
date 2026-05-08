// Service para a tabela public_reviews — avaliacoes publicas que clientes
// deixam pelo formulario do site /avaliar (sem precisar de conta Google).
// Junior aprova manualmente via WhatsApp (/aprovar-review <id>).

import type { SupabaseClient } from '@supabase/supabase-js';

export interface PublicReviewRow {
  id: string;
  case_slug: string | null;
  cliente_nome: string;
  cliente_cidade: string | null;
  cliente_telefone: string | null;
  estrelas: number;
  texto: string | null;
  foto_url: string | null;
  created_at: string;
  approved_for_marketing: boolean;
  approved_at: string | null;
  notified_at: string | null;
}

export class PublicReviewsService {
  constructor(private supabase: SupabaseClient) {}

  async approve(id: string): Promise<PublicReviewRow> {
    const { data, error } = await this.supabase
      .from('public_reviews')
      .update({ approved_for_marketing: true, approved_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new Error(`Failed to approve public review: ${error.message}`);
    if (!data) throw new Error(`Review ${id} not found`);
    return data as PublicReviewRow;
  }

  async listPending(limit = 10): Promise<PublicReviewRow[]> {
    const { data, error } = await this.supabase
      .from('public_reviews')
      .select('*')
      .eq('approved_for_marketing', false)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Failed to list pending reviews: ${error.message}`);
    return (data ?? []) as PublicReviewRow[];
  }

  async getById(id: string): Promise<PublicReviewRow | null> {
    const { data, error } = await this.supabase
      .from('public_reviews')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`Failed to fetch review ${id}: ${error.message}`);
    return (data as PublicReviewRow) ?? null;
  }

  // Reviews recebidas mas que ainda nao foram notificadas pro Junior via WhatsApp.
  async listUnnotified(limit = 5): Promise<PublicReviewRow[]> {
    const { data, error } = await this.supabase
      .from('public_reviews')
      .select('*')
      .is('notified_at', null)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) throw new Error(`Failed to list unnotified: ${error.message}`);
    return (data ?? []) as PublicReviewRow[];
  }

  async markNotified(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('public_reviews')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Failed to mark notified: ${error.message}`);
  }
}
