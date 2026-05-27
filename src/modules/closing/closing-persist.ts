// src/modules/closing/closing-persist.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DadosFechamento, FechamentoRow } from './types.js';

export interface CreateFechamentoInput {
  leadId: string | null;
  propostaPublicaId: string | null;
  dados: DadosFechamento;
  createdBy: string;
  parentId?: string | null;
}

export interface UpdateDriveLinksInput {
  contratoDriveId?: string;
  contratoDriveLink?: string;
  procuracaoDriveId?: string;
  procuracaoDriveLink?: string;
  driveFolderId?: string;
}

export class ClosingPersist {
  constructor(private sb: SupabaseClient) {}

  async createFechamento(input: CreateFechamentoInput): Promise<string> {
    const { data, error } = await this.sb
      .from('fechamentos')
      .insert({
        lead_id: input.leadId,
        proposta_publica_id: input.propostaPublicaId,
        docs_pedidos: input.dados.docs_pedidos,
        dados_snapshot: input.dados,
        status: 'gerado',
        created_by: input.createdBy,
        parent_id: input.parentId ?? null,
      })
      .select('id')
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  async updateDriveLinks(id: string, links: UpdateDriveLinksInput): Promise<void> {
    const { error } = await this.sb
      .from('fechamentos')
      .update({
        contrato_drive_id: links.contratoDriveId ?? null,
        contrato_drive_link: links.contratoDriveLink ?? null,
        procuracao_drive_id: links.procuracaoDriveId ?? null,
        procuracao_drive_link: links.procuracaoDriveLink ?? null,
        drive_folder_id: links.driveFolderId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;
  }

  async updateStatus(id: string, status: FechamentoRow['status']): Promise<void> {
    const { error } = await this.sb
      .from('fechamentos')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  async nextVersionForLead(leadId: string): Promise<number> {
    const { data, error } = await this.sb
      .from('fechamentos')
      .select('id')
      .eq('lead_id', leadId);
    if (error) throw error;
    return ((data?.length ?? 0) + 1);
  }
}
