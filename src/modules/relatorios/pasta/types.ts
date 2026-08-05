// src/modules/relatorios/pasta/types.ts

export type SecaoId = 'fotos' | 'monitoramento' | 'projeto' | 'art' | 'homologacao' | 'manuais' | 'garantia' | 'contrato';

// Ordem de exibição na página pública e no editor admin.
export const SECOES: ReadonlyArray<{ id: SecaoId; titulo: string }> = [
  { id: 'fotos',         titulo: '📸 Fotos da instalação' },
  { id: 'monitoramento', titulo: '📊 Monitoramento' },   // fotos e vídeos do app gerando
  { id: 'projeto',     titulo: '📐 Projeto' },
  { id: 'art',         titulo: '📋 ART' },
  { id: 'homologacao', titulo: '✅ Homologação' },
  { id: 'manuais',     titulo: '📖 Manuais' },
  { id: 'garantia',    titulo: '🛡️ Garantia' },
  { id: 'contrato',    titulo: '📄 Contrato' },
];

export interface ArquivoPasta {
  secao: SecaoId;
  storage_path: string;
  nome_exibicao: string;
  caption?: string | null;
  // 'r-pi'/'servico' = REFERENCIADO (relatório pós-instalação / diário de serviços):
  // o arquivo pertence à origem — NUNCA apagar do bucket ao remover/excluir.
  origem?: 'upload' | 'r-pi' | 'servico';
}

export interface PastaClienteRow {
  id: string;
  lead_id: string;
  slug: string;
  status: 'rascunho' | 'publicada';
  capa_storage_path: string | null;
  data_entrega: string | null;      // YYYY-MM-DD
  mensagem_zap: string | null;
  arquivos: ArquivoPasta[];
  acessos: number;
  ultimo_acesso_em: string | null;
  enviado_em: string | null;
  enviado_para_phone: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// Snapshot resolvido server-side antes de renderPastaHtml (signed URLs por visita).
export interface PastaView {
  cliente_nome: string;
  cliente_cidade: string | null;
  cliente_uf: string | null;
  data_entrega: string | null;
  sistema: {
    apelido: string;
    marca_inversor: string;
    inversor_modelo: string | null;
    potencia_kwp: number | null;
    qtd_paineis: number | null;
    painel_marca: string | null;
    painel_modelo: string | null;
  } | null;
  capa_url: string | null;
  logo_base64: string;              // data URI (obterLogoBase64)
  whatsapp: string | null;          // empresa().telefoneAtendente — botão wa.me
  secoes: Array<{
    secao: SecaoId;
    titulo: string;
    arquivos: Array<{ url: string; nome: string; caption: string | null; is_imagem: boolean; is_video: boolean }>;
  }>;
  slug: string;
  publico: boolean;                 // false = banner PREVIEW
  gerado_em: string;
}
