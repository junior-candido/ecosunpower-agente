// Casos do Quadro de Obras + Vincular usinas (renovação do miolo, R15).
// Dados FICTÍCIOS: nomes inventados, nunca cliente real.
import { renderUsinasKanbanPage, type UsinaKanbanCard } from '../../src/modules/dashboard/usinas-kanban-views.js';
import { renderVincularUsinasPage } from '../../src/modules/dashboard/vincular-usinas-views.js';
import { USER_CASA, USER_TENANT } from './miolo-leads.js';

const diasAtras = (d: number) => new Date(Date.now() - d * 86_400_000 - 3600_000).toISOString();
const u = (id: string, apelido: string | null, etapa: string, dias: number | null, over: Partial<UsinaKanbanCard> = {}): UsinaKanbanCard =>
  ({ id, apelido, cidade: 'Cidade Exemplo', potencia_kwp: 6.3, etapa_obra: etapa, etapa_obra_updated_at: dias === null ? null : diasAtras(dias), ...over });

export const OBRAS: UsinaKanbanCard[] = [
  u('11111111-1111-4111-8111-000000000001', 'Usina Ana Exemplo', 'projeto', 2),
  u('11111111-1111-4111-8111-000000000002', "Bruno <script>x</script> D'Ávila", 'projeto', 45, { cidade: 'Vila <b>Teste</b>', potencia_kwp: 12.6 }),
  u('11111111-1111-4111-8111-000000000003', null, 'aprovacao', null, { cidade: null, potencia_kwp: null }),
  u('11111111-1111-4111-8111-000000000004', 'Carla Fictícia', 'instalacao', 0, { potencia_kwp: 4.2 }),
  u('11111111-1111-4111-8111-000000000005', 'Diego Modelo', 'instalacao', 1, { potencia_kwp: 75 }),
  u('11111111-1111-4111-8111-000000000006', 'Elisa Amostra', 'homologacao', 20, { potencia_kwp: 8.4 }),
  u('11111111-1111-4111-8111-000000000007', 'Fábio Teste', 'operacao', 3, { potencia_kwp: 10.08 }),
  // etapa fora da lista (pos_venda) não vira coluna — some do quadro
  u('11111111-1111-4111-8111-000000000008', 'Gabi Pós-venda', 'pos_venda', 5),
];

const SUGESTOES = [
  { usinaId: 'U1', apelido: 'Usina Ana Exemplo', leadSugeridoId: 'L1', leadSugeridoNome: 'Ana Exemplo' },
  { usinaId: 'U2', apelido: "Bruno <script>x</script> D'Ávila", leadSugeridoId: null, leadSugeridoNome: null },
  { usinaId: 'U3', apelido: null, leadSugeridoId: 'L3', leadSugeridoNome: null },
];
const LEADS = [{ id: 'L1', name: 'Ana Exemplo' }, { id: 'L2', name: 'Carla <b>Fictícia</b>' }, { id: 'L3', name: null }];

export const CASOS_OBRAS: Record<string, () => string> = {
  'quadro': () => renderUsinasKanbanPage(OBRAS, USER_CASA),
  'quadro-vazio': () => renderUsinasKanbanPage([], USER_CASA),
  'quadro-tenant': () => renderUsinasKanbanPage(OBRAS.slice(0, 4), USER_TENANT),
  'vincular': () => renderVincularUsinasPage({ sugestoes: SUGESTOES as any, leads: LEADS as any, user: USER_CASA }),
  'vincular-vazio': () => renderVincularUsinasPage({ sugestoes: [], leads: LEADS as any, user: USER_CASA }),
  'vincular-tenant': () => renderVincularUsinasPage({ sugestoes: SUGESTOES.slice(0, 1) as any, leads: LEADS as any, user: USER_TENANT }),
};

// Só para os PRINTS (fora do contrato): o quadro com o modo seleção ligado e 2
// obras marcadas, e com o painel de contato aberto (fetch falso, dado fictício).
const aoCarregar = (html: string, js: string) => html.replace('</body>', `<script>window.addEventListener('load',function(){setTimeout(function(){${js}},300)})</script></body>`);
const CONTATO_FALSO = JSON.stringify({ apelido: 'Usina Ana Exemplo', localizacao: 'Cidade Exemplo-DF', potencia: '6.3 kWp', etapa: 'Projeto', diasNaEtapa: 'há 2 dias', detalheUrl: '/dashboard/monitoramento/x', cliente: { nome: 'Ana <b>Exemplo</b>', telefone: '(61) 99999-0000', email: 'nao cadastrado' } });
export const CASOS_OBRAS_PRINTS: Record<string, () => string> = {
  ...CASOS_OBRAS,
  'quadro-lote': () => aoCarregar(CASOS_OBRAS.quadro(), `document.getElementById('btn-selecionar').click();var cs=document.querySelectorAll('.kanban-check');cs[0].click();cs[3].click();`),
  'quadro-contato': () => aoCarregar(CASOS_OBRAS.quadro(), `window.fetch=function(){return Promise.resolve({ok:true,json:function(){return Promise.resolve(${CONTATO_FALSO})}})};document.querySelector('.kanban-info').click();`),
};
