// src/modules/relatorios/pos-instalacao/types.ts

export interface FotoEntry {
  storage_path: string;
  signed_url?: string;
  caption?: string | null;
}

export interface RelatorioPosInstalacaoRow {
  id: string;
  lead_id: string;
  slug: string;
  mensagem_personalizada: string | null;
  data_instalacao: string | null;
  fotos: FotoEntry[];
  enviado_em: string | null;
  enviado_para_phone: string | null;
  acessos: number;
  ultimo_acesso_em: string | null;
  created_at: string;
  created_by: string | null;
}

// Snapshot dos dados do cliente + sistema no momento de render do relatório.
// Resolved server-side antes de chamar renderPosInstalacaoHtml.
export interface RelatorioPosInstalacaoView {
  cliente_nome: string;
  cliente_cidade: string | null;
  cliente_uf: string | null;
  concessionaria_label: string | null;
  uc_numero: string | null;
  mensagem_personalizada: string | null;
  data_instalacao: string | null;
  data_medidor_trocado: string | null;
  sistema: {
    apelido: string;
    marca_inversor: string;
    inversor_modelo: string | null;
    potencia_kwp: number | null;
    qtd_paineis: number | null;
    painel_marca: string | null;
    painel_modelo: string | null;
  } | null;
  fotos: Array<{ url: string; caption?: string | null }>;
  gerado_em: string;     // ISO timestamp
  slug: string;
  publico: boolean;       // true = sem header admin; false = preview com banner "PREVIEW"
}

export interface DraftInput {
  lead_id: string;
  mensagem_personalizada: string | null;
  data_instalacao: string | null;     // YYYY-MM-DD
  fotos: Array<{
    buffer: Buffer;
    mimeType: string;
    ext: string;
    caption?: string | null;
  }>;
}
