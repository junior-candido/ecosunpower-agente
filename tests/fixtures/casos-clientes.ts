// Casos de Clientes (renovação do miolo, R16) — lista, ficha, novo e o
// relatório pós-instalação (novo + prévia). Dados FICTÍCIOS: nomes inventados,
// nunca cliente real. Inclui <script>/aspas pra testar o escape.
import { renderClientesListPage, renderClienteDetailPage, renderFormNovoCliente } from '../../src/modules/dashboard/clientes-views.js';
import { renderFormNovoRelatorio, renderPreviewRelatorio } from '../../src/modules/dashboard/relatorio-pi-views.js';
import type { ClienteRow, ClienteDetail, InsightCard, SistemaOrfaoCard } from '../../src/modules/clientes/types.js';
import { USER_CASA, USER_TENANT } from './miolo-leads.js';

const ID1 = '11111111-aaaa-4aaa-8aaa-111111111111';
const ID2 = '22222222-aaaa-4aaa-8aaa-222222222222';
const ID3 = '33333333-aaaa-4aaa-8aaa-333333333333';

export function clienteRow(over: Partial<ClienteRow> = {}): ClienteRow {
  return {
    id: ID1, name: 'Ana Exemplo', phone: '5561999990001', email: 'ana@exemplo.invalid', profile: 'residencial',
    installation_status: 'operando', installed_at: '2026-03-10', city: 'Gama', uf: 'DF', concessionaria: 'neoenergia-df',
    consumo_medio_kwh: 650, conta_media_brl: 712.4, opt_out: false, eva_active: true, archived_at: null, ...over,
  };
}

export const LINHAS_CLIENTES: ClienteRow[] = [
  clienteRow(),
  clienteRow({ id: ID2, name: "Bruno <script>alert(1)</script> D'Ávila", phone: '5561988887777', installation_status: 'contrato_assinado', city: 'Sobradinho', concessionaria: 'equatorial-go', uf: 'GO', consumo_medio_kwh: null, conta_media_brl: null }),
  clienteRow({ id: ID3, name: null, phone: '5561977776666', installation_status: null, city: null, uf: null, concessionaria: null }),
  clienteRow({ id: '44444444-aaaa-4aaa-8aaa-444444444444', name: 'Carla Fictícia Souza', installation_status: 'instalado', concessionaria: 'desconhecida-x' }),
];

export const ORFAOS: SistemaOrfaoCard[] = [
  { sistema_id: '55555555-aaaa-4aaa-8aaa-555555555555', apelido: "Usina <b>Sem Dono</b> d'Água", marca_inversor: 'Deye', potencia_kwp: 8.4, cidade: 'Taguatinga', uf: 'DF', data_instalacao: '2025-11-02' },
  { sistema_id: '66666666-aaaa-4aaa-8aaa-666666666666', apelido: 'Usina Órfã 2', marca_inversor: 'SolarEdge', potencia_kwp: null, cidade: null, uf: null, data_instalacao: null },
];

export function detalhe(over: Partial<ClienteDetail> = {}): ClienteDetail {
  return {
    ...clienteRow({ name: "Ana <script>x</script> D'Ávila" }),
    cpf_cnpj: '00000000000', data_nascimento: '1980-05-01', estado_civil: 'casado', neighborhood: 'Setor Leste',
    cep: '72000000', endereco_rua: 'Rua Exemplo', endereco_numero: '10', endereco_complemento: 'Casa "B"',
    uc_numero: '000000', tarifa_classe: 'B1', tarifa_modalidade: 'convencional', consumo_mensal_json: null,
    forma_pagamento: 'financiamento', banco_financiamento: 'bv', eh_consumidor_rateio: true,
    uc_geradora_lead_id: ID2, percentual_rateio: 30, credito_esperado_kwh: 200,
    vendedor_responsavel: 'Vendedor Teste', observacoes_perfil: 'Cliente pediu <b>visita</b> de manhã.',
    review_confirmed_at: null, lead_source: 'indicacao', acquisition_source: 'manual_dashboard',
    created_at: '2026-01-05T12:00:00Z',
    sistema: {
      id: '77777777-aaaa-4aaa-8aaa-777777777777', apelido: 'Casa da Ana', marca_inversor: 'GoodWe', potencia_kwp: 6.3,
      qtd_paineis: 9, painel_marca: 'Risen', data_instalacao: '2026-03-10', geracao_7d_kwh: 180, geracao_total_kwh: 610, ratio_ultimos_7d: 0.82,
    },
    propostas: [
      { id: 'p1', slug: 'ana-exemplo-p1', numero_proposta: 'EX-0001', created_at: '2026-01-10T12:00:00Z', acessos: 4, cliente_respondeu_at: '2026-01-11T12:00:00Z', valor_total_brl: 18500 },
      { id: 'p2', slug: 'ana-exemplo-p2', numero_proposta: 'EX-0002 <i>b</i>', created_at: '2026-01-15T12:00:00Z', acessos: 0, cliente_respondeu_at: null, valor_total_brl: null },
    ],
    alertas_ativos: [
      { id: 'a1', tipo: 'geracao_baixa', severidade: 'aviso', texto: 'Geração 18% abaixo do esperado <b>7d</b>', primeiro_visto_em: '2026-09-20T12:00:00Z' },
    ],
    conversas_recentes: [
      { role: 'user', content: 'Oi, a conta veio <b>baixinha</b>!', timestamp: '2026-09-24T10:00:00Z' },
      { role: 'assistant', content: 'Que bom! Vamos agendar a limpeza?', timestamp: '2026-09-24T10:05:00Z' },
    ],
    cadence_pendente: 0,
    manutencoes_futuras: [],
    anexos: [
      { id: '88888888-aaaa-4aaa-8aaa-888888888888', tipo: 'foto_telhado', descricao: null, storage_path: 'l/1.jpg', mime_type: 'image/jpeg', size_bytes: 1000, created_at: '2026-03-10T12:00:00Z', signed_url: 'https://exemplo.invalid/1.jpg?t="x"' },
      { id: '99999999-aaaa-4aaa-8aaa-999999999999', tipo: 'contrato', descricao: 'contrato', storage_path: 'l/2.pdf', mime_type: 'application/pdf', size_bytes: 2000, created_at: '2026-03-11T12:00:00Z' },
    ],
    ...over,
  };
}

export const INSIGHTS: InsightCard[] = [
  { id: 'depoimento', texto: 'Cliente satisfeito há 6 meses — bom momento pra pedir depoimento.', cta: { label: '▶ Eva pedir', action: 'eva_pedir_depoimento', params: {} } },
  { id: 'aniversario', texto: "1 ano de usina — agendar revisão <b>d'aniversário</b>.", cta: { label: 'Agendar revisão', action: 'agendar_revisao_aniversario', params: { anos: 1 } } },
  { id: 'upgrade', texto: 'Consumo subiu 30% — talvez ampliar.', cta: null },
];

const FILTROS = { q: 'ana & "cia"', concessionaria: 'neoenergia-df', cidade: 'Gama', ord: 'nome' };

export const CASOS_CLIENTES: Record<string, () => string> = {
  'lista': () => renderClientesListPage(LINHAS_CLIENTES, {}, ORFAOS, { total: 4, limit: 50, offset: 0 }, USER_CASA),
  'lista-filtrada-paginada': () => renderClientesListPage(LINHAS_CLIENTES, FILTROS, [], { total: 130, limit: 50, offset: 50 }, USER_CASA),
  'lista-arquivados': () => renderClientesListPage([clienteRow({ archived_at: '2026-09-01T12:00:00Z' })], {}, [], { total: 1, limit: 50, offset: 0, mostrarArquivados: true }, USER_CASA),
  'lista-vazia': () => renderClientesListPage([], {}, [], { total: 0, limit: 50, offset: 0 }, USER_CASA),
  'lista-tenant': () => renderClientesListPage(LINHAS_CLIENTES, {}, ORFAOS, { total: 4, limit: 50, offset: 0 }, USER_TENANT),
  'ficha': () => renderClienteDetailPage(detalhe(), INSIGHTS, USER_CASA),
  'ficha-arquivada-sem-dados': () => renderClienteDetailPage(detalhe({
    archived_at: '2026-09-01T12:00:00Z', sistema: null, propostas: [], anexos: [], alertas_ativos: [], conversas_recentes: [],
    installation_status: null, installed_at: null, city: null, uf: null, concessionaria: null, name: null,
  }), [], USER_CASA),
  'ficha-tenant': () => renderClienteDetailPage(detalhe(), INSIGHTS, USER_TENANT),
  'novo': () => renderFormNovoCliente({ user: USER_CASA }),
  'novo-erros': () => renderFormNovoCliente({
    user: USER_CASA, erros: ['Campo "Telefone" obrigatório', 'Consumo <b>inválido</b>'],
    values: { name: "Ana <script>x</script> D'Ávila", phone: '', email: 'a@b.invalid', cpf_cnpj: '1', city: 'Gama', uf: 'GO', concessionaria: 'equatorial-go', consumo_medio_kwh: 'abc', profile: 'rural' },
  }),
  'novo-tenant': () => renderFormNovoCliente({ user: USER_TENANT }),
  'rpi-novo': () => renderFormNovoRelatorio({ lead_id: ID1, cliente_nome: "Ana <script>x</script> D'Ávila", data_instalacao_pre: '2026-03-10', user: USER_CASA }),
  'rpi-novo-sem-nome': () => renderFormNovoRelatorio({ lead_id: ID1, cliente_nome: null, data_instalacao_pre: null, user: USER_TENANT }),
  'rpi-previa': () => renderPreviewRelatorio({ lead_id: ID1, relatorio_id: 'r-1', slug: 'ana-rpi-x1', html_preview: '<html><body><h1>Relatório da Ana</h1><p>"aspas" & <b>negrito</b></p></body></html>', ja_enviado: false, enviado_em: null, user: USER_CASA }),
  'rpi-previa-enviada': () => renderPreviewRelatorio({ lead_id: ID1, relatorio_id: 'r-1', slug: 'ana-rpi-x1', html_preview: '<p>ok</p>', ja_enviado: true, enviado_em: '2026-09-20 10:00', user: USER_TENANT }),
};
