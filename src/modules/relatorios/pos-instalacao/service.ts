// src/modules/relatorios/pos-instalacao/service.ts
import { randomUUID } from 'crypto';
import type { SupabaseService } from '../../supabase.js';
import { uploadAnexo, getSignedUrls } from '../../anexos/storage.js';
import { novoSlug } from '../slug.js';
import type { DraftInput, RelatorioPosInstalacaoView, RelatorioPosInstalacaoRow } from './types.js';

const PUBLIC_BASE_URL = process.env.PROPOSAL_PUBLIC_BASE_URL ?? 'https://propostas.ecosunpower.eng.br';

// Tipo da função que resolve sistema FV vinculado ao lead (injetado pra evitar circular import)
export type ResolverSistema = (leadId: string) => Promise<{
  id: string; apelido: string; marca_inversor: string;
  potencia_kwp: number | null; qtd_paineis: number | null;
  painel_marca: string | null; painel_modelo: string | null;
  inversor_modelo: string | null;
} | null>;

const CONCESSIONARIA_LABELS: Record<string, string> = {
  'neoenergia-df': 'Neoenergia Brasília',
  'equatorial-go': 'Equatorial Goiás',
};

export class PosInstalacaoService {
  constructor(
    private supabase: SupabaseService,
    private resolverSistema: ResolverSistema,
  ) {}

  async criarDraft(input: DraftInput): Promise<{ ok: boolean; id?: string; slug?: string; error?: string }> {
    const client = this.supabase.getClient();
    const fotosUploaded: Array<{ storage_path: string; caption?: string | null }> = [];

    // Upload das fotos em sequência (se uma falhar, faz rollback das anteriores pra não deixar lixo)
    for (const f of input.fotos) {
      const up = await uploadAnexo(client, input.lead_id, 'pos_instalacao', f.buffer, f.mimeType, f.ext);
      if (!up.ok || !up.storage_path) {
        // Rollback: remove o que já subiu
        for (const ok of fotosUploaded) {
          try { await client.storage.from('client-attachments').remove([ok.storage_path]); } catch {}
        }
        return { ok: false, error: up.error ?? 'Upload falhou' };
      }
      fotosUploaded.push({ storage_path: up.storage_path, caption: f.caption ?? null });
    }

    const slug = novoSlug();
    const r = await this.supabase.criarRelatorioPosInstalacao({
      lead_id: input.lead_id,
      slug,
      mensagem_personalizada: input.mensagem_personalizada,
      data_instalacao: input.data_instalacao,
      fotos: fotosUploaded,
    });
    if (!r.ok) {
      // Rollback storage também
      for (const ok of fotosUploaded) {
        try { await client.storage.from('client-attachments').remove([ok.storage_path]); } catch {}
      }
      return { ok: false, error: r.error };
    }
    return { ok: true, id: r.id, slug };
  }

  async resolverView(rel: RelatorioPosInstalacaoRow, publico: boolean): Promise<RelatorioPosInstalacaoView | null> {
    const lead = await this.supabase.getClienteByLeadId(rel.lead_id);
    if (!lead) return null;
    const sistema = await this.resolverSistema(rel.lead_id);

    const paths = (rel.fotos ?? []).map((f) => f.storage_path).filter(Boolean);
    const urls = paths.length > 0 ? await getSignedUrls(this.supabase.getClient(), paths, 3600 * 24 * 7) : {};

    return {
      cliente_nome: lead.name ?? 'Cliente',
      cliente_cidade: lead.city ?? null,
      cliente_uf: lead.uf ?? null,
      concessionaria_label: lead.concessionaria ? (CONCESSIONARIA_LABELS[lead.concessionaria] ?? lead.concessionaria) : null,
      uc_numero: lead.uc_numero ?? null,
      mensagem_personalizada: rel.mensagem_personalizada,
      data_instalacao: rel.data_instalacao,
      data_medidor_trocado: lead.meter_swapped_at ? String(lead.meter_swapped_at).slice(0, 10) : null,
      sistema,
      fotos: (rel.fotos ?? []).map((f) => ({ url: urls[f.storage_path] ?? '#', caption: f.caption })),
      gerado_em: rel.created_at,
      slug: rel.slug,
      publico,
    };
  }

  async enviarPorWhatsApp(
    relatorioId: string,
    sendText: (to: string, text: string) => Promise<void>,
  ): Promise<{ ok: boolean; reason?: string }> {
    const rel = await this.supabase.getRelatorioPosInstalacaoById(relatorioId);
    if (!rel) return { ok: false, reason: 'relatorio_not_found' };

    const lead = await this.supabase.getClienteByLeadId(rel.lead_id);
    if (!lead) return { ok: false, reason: 'lead_not_found' };
    if (lead.opt_out) return { ok: false, reason: 'opt_out' };
    if (!lead.phone) return { ok: false, reason: 'sem_phone' };

    const primeiroNome = (lead.name ?? 'Olá').split(/\s+/)[0];
    const link = `${PUBLIC_BASE_URL}/r-pi/${rel.slug}`;
    const body =
      `🎉 ${primeiroNome}, parabéns! Seu sistema solar foi ativado pela concessionária.\n\n` +
      `Preparei um relatório com o que foi feito na sua obra:\n${link}\n\n` +
      `Qualquer dúvida tô aqui pra ajudar.`;

    await sendText(lead.phone, body);
    await this.supabase.marcarRelatorioPosInstalacaoEnviado(relatorioId, lead.phone);
    await this.supabase.marcarLeadPostInstallReportSent(rel.lead_id);
    return { ok: true };
  }
}
