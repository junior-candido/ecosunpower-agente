// Casos da Pasta do Cliente (renovação do miolo, R12) — 3 telas.
// Dados FICTÍCIOS: nomes inventados, nunca cliente real.
import { renderListaPastas, renderEditorPasta, renderPreviewPasta } from '../../src/modules/dashboard/pasta-views.js';
import { USER_CASA, USER_TENANT } from './miolo-leads.js';

const PASTAS = [
  { id: 'p1', slug: 'ana-exemplo-x1', status: 'publicada', acessos: 3, enviado_em: '2026-09-20T12:00:00Z', updated_at: '2026-09-20T12:00:00Z', cliente_nome: 'Ana Exemplo', qtd_arquivos: 14 },
  { id: 'p2', slug: 'bruno-y2', status: 'rascunho', acessos: 0, enviado_em: null, updated_at: '2026-09-25T12:00:00Z', cliente_nome: "Bruno <b>D'Ávila</b>", qtd_arquivos: 1 },
  { id: 'p3', slug: 'sem-nome-z3', status: 'publicada', acessos: 1, enviado_em: null, updated_at: '2026-09-26T12:00:00Z', cliente_nome: null, qtd_arquivos: 0 },
];
const CLIENTES = [{ id: 'L1', name: 'Ana Exemplo' }, { id: 'L2', name: 'Carla <script>x</script>' }, { id: 'L3', name: null }];

const arq = (secao: string, nome: string, over: Record<string, unknown> = {}) =>
  ({ secao, storage_path: `pasta/p1/${secao}/${nome}`, nome_exibicao: nome, ...over });

export const PASTA: any = {
  id: 'p1', lead_id: 'L1', slug: 'ana-exemplo-x1', status: 'rascunho', capa_storage_path: 'pasta/p1/fotos/telhado.jpg',
  data_entrega: '2026-09-20', mensagem_zap: 'Oi Ana! Sua pasta <b>chegou</b>.',
  arquivos: [
    arq('fotos', 'telhado.jpg'), arq('fotos', 'inversor.jpg', { origem: 'r-pi' }), arq('fotos', 'video-obra.mp4'),
    arq('projeto', 'projeto-eletrico.pdf'), arq('art', 'trt-assinada.pdf'), arq('contrato', "contrato <b>d'ana</b>.pdf"),
  ],
  acessos: 0, ultimo_acesso_em: null, enviado_em: null, enviado_para_phone: null,
  created_at: '2026-09-01T12:00:00Z', updated_at: '2026-09-25T12:00:00Z', created_by: null,
  dados_declaracao: { trt: 'CFT0000000000', conclusao_em: '2026-09-15' },
};

const FOTOS = { 'pasta/p1/fotos/telhado.jpg': 'https://exemplo.invalid/telhado.jpg', 'pasta/p1/fotos/inversor.jpg': 'https://exemplo.invalid/inversor.jpg' };

export const CASOS_PASTAS = {
  'lista': () => renderListaPastas({ pastas: PASTAS, clientes: CLIENTES, publicBase: 'https://exemplo.invalid', user: USER_CASA }),
  'lista-vazia': () => renderListaPastas({ pastas: [], clientes: CLIENTES, publicBase: 'https://exemplo.invalid', user: USER_CASA }),
  'lista-tenant': () => renderListaPastas({ pastas: PASTAS, clientes: CLIENTES, publicBase: 'https://exemplo.invalid', user: USER_TENANT }),
  'editor-rascunho': () => renderEditorPasta({ pasta: PASTA, cliente_nome: "Ana D'Ávila <b>x</b>", tem_rpi: true, tem_servicos: true, fotos_urls: FOTOS, publicBase: 'https://exemplo.invalid', faltando: ['Homologação', 'Manuais', 'Garantia'], user: USER_CASA }),
  'editor-publicada': () => renderEditorPasta({ pasta: { ...PASTA, status: 'publicada', acessos: 3 }, cliente_nome: 'Ana Exemplo', tem_rpi: false, tem_servicos: false, fotos_urls: FOTOS, publicBase: 'https://exemplo.invalid', faltando: [], user: USER_CASA }),
  'editor-tenant': () => renderEditorPasta({ pasta: { ...PASTA, status: 'publicada' }, cliente_nome: 'Ana Exemplo', tem_rpi: false, tem_servicos: true, fotos_urls: {}, publicBase: 'https://exemplo.invalid', faltando: [], user: USER_TENANT }),
  'preview': () => renderPreviewPasta({ pasta_id: 'p1', cliente_nome: 'Ana Exemplo', html_preview: '<html><body><h1>Pasta da Ana</h1><p>"aspas" & <b>negrito</b></p></body></html>', user: USER_CASA }),
};
