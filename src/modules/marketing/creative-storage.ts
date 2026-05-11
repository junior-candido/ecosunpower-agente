// src/modules/marketing/creative-storage.ts
// Helper de storage de criativos: upload de imagens pro bucket
// `ad-creatives` (Supabase Storage), persistencia de drafts em
// `marketing_creatives` e log de geracao em `marketing_creative_logs`.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreativePackage } from './types.js';

export class CreativeStorage {
  constructor(private supabase: SupabaseClient, private bucket = 'ad-creatives') {}

  async uploadImage(imageUrl: string, creativeId: number, index: number): Promise<string> {
    const r = await fetch(imageUrl);
    if (!r.ok) throw new Error(`Download falhou: ${r.status}`);
    const blob = await r.blob();
    const path = `creatives/${creativeId}/img-${index}.png`;
    const { error } = await this.supabase.storage.from(this.bucket).upload(path, blob, {
      contentType: 'image/png',
      upsert: true,
    });
    if (error) throw error;
    const { data } = this.supabase.storage.from(this.bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  // Upload de banner promocional (Buffer direto). Retorna URL publica + path no bucket.
  // Usado pelo handler /banner pra dar link de qualidade total (sem compressao WhatsApp).
  async uploadBanner(buf: Buffer, slug: string): Promise<{ publicUrl: string; path: string }> {
    const path = `banners/${slug}.png`;
    const { error } = await this.supabase.storage.from(this.bucket).upload(path, buf, {
      contentType: 'image/png',
      upsert: true,
    });
    if (error) throw error;
    const { data } = this.supabase.storage.from(this.bucket).getPublicUrl(path);
    return { publicUrl: data.publicUrl, path };
  }

  async persistDraft(pkg: CreativePackage, modelUsed: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('marketing_creatives')
      .insert({
        persona_id: pkg.persona_id,
        briefing: pkg.briefing,
        status: 'draft',
        imagens: pkg.imagens,
        copies: pkg.copies,
        cta_primario: pkg.cta_primario,
        justificativa: pkg.justificativa,
        created_by_model: modelUsed,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }

  async logGeneration(params: {
    creative_id: number;
    prompt: string;
    raw_output: unknown;
    filter_results?: unknown;
    decision: string;
    reason?: string;
  }): Promise<void> {
    await this.supabase.from('marketing_creative_logs').insert({
      creative_id: params.creative_id,
      prompt_used: params.prompt,
      raw_output: params.raw_output,
      filter_results: params.filter_results,
      decision: params.decision,
      reason: params.reason,
    });
  }
}
