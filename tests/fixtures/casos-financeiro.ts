// Casos do Financeiro — visão (renovação do miolo, R10). Valores FICTÍCIOS.
import { renderFinanceiroPage } from '../../src/modules/dashboard/financeiro-views.js';
import { USER_CASA, USER_TENANT } from './miolo-leads.js';

export const FIN_CHEIO: any = {
  geradoEm: '2026-09-28T12:00:00Z', competencia: '2026-09',
  faturamentoMes: 48250.5, rbt12: 612340, faixa: 3, impostoASeparar: 5120.4, aReceber: 23900,
  fatorR: { ratio: 0.31, anexo: 'III', proLaboreMin: 3200 },
  salto: { limite: 720000, distancia: 107660 },
  faturamentoMensal: [
    { competencia: '2026-06', receita: 39800 }, { competencia: '2026-07', receita: 52100 },
    { competencia: '2026-08', receita: 44700 }, { competencia: '2026-09', receita: 48250.5 },
  ],
  despesasMensal: [
    { competencia: '2026-06', total: 21000 }, { competencia: '2026-07', total: 30500 },
    { competencia: '2026-08', total: 26400 }, { competencia: '2026-09', total: 18900 },
  ],
  contas: [
    { descricao: 'Usina Casa Exemplo — 2ª parcela', valor: 12000, status: 'pendente', imposto: 1080 },
    { descricao: 'Serviço <b>limpeza</b>', valor: 900, status: 'recebido_parcial', imposto: null },
    { descricao: null, valor: 11000, status: 'recebido', imposto: 990 },
  ],
  caixa: {
    saiuMesPj: 18900, lucroMes: 24230.1, entrouMesPf: 3500, saiuMesPf: 4100.9,
    pizzaCategorias: [{ categoria: 'Material', total: 12000 }, { categoria: 'Combustível', total: 2400 }, { categoria: 'Ferramentas', total: 4500 }],
    faturadoMesPj: 45000, entrouMesPjCaixa: 48250.5, entrouSemNotaPj: 3250.5,
  },
  faturadoMesPj: 45000, entrouMesPjCaixa: 48250.5, entrouSemNotaPj: 3250.5,
  lancamentos: [
    { id: 'l1', tipo: 'entrada', valor: 12000, data_evento: '2026-09-20', contraparte: 'Ana Exemplo', categoriaNome: 'Venda', pf_pj: 'PJ', comprovanteUrl: 'https://exemplo.invalid/c1.pdf', tem_nota: true },
    { id: 'l2', tipo: 'entrada', valor: 3250.5, data_evento: '2026-09-18', contraparte: 'Bruno <script>x</script>', categoriaNome: 'Serviço', pf_pj: 'PJ', comprovanteUrl: null, tem_nota: false },
    { id: 'l3', tipo: 'despesa', valor: 480.9, data_evento: '2026-09-15', contraparte: 'Posto Fictício', categoriaNome: 'Combustível', pf_pj: 'PF', comprovanteUrl: null, tem_nota: false },
    { id: 'l4', tipo: 'despesa', valor: 9000, data_evento: '2026-09-10', contraparte: null, categoriaNome: null, pf_pj: null, comprovanteUrl: 'javascript:alert(1)', tem_nota: false },
  ],
  filtros: {},
};

export const FIN_VAZIO: any = {
  ...FIN_CHEIO, faturamentoMes: 0, rbt12: 0, faixa: 1, salto: null, impostoASeparar: 0, aReceber: 0,
  fatorR: { ratio: 0, anexo: 'V', proLaboreMin: 0 }, faturamentoMensal: [], despesasMensal: [], contas: [], lancamentos: [],
  caixa: { saiuMesPj: 0, lucroMes: -250, entrouMesPf: 0, saiuMesPf: 0, pizzaCategorias: [], faturadoMesPj: 0, entrouMesPjCaixa: 0, entrouSemNotaPj: 0 },
};

export const CASOS_FINANCEIRO = {
  cheio: () => renderFinanceiroPage(FIN_CHEIO, USER_CASA),
  vazio: () => renderFinanceiroPage(FIN_VAZIO, USER_CASA),
  tenant: () => renderFinanceiroPage(FIN_CHEIO, USER_TENANT),
};
