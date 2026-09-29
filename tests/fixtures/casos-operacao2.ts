// Casos da Operação II (renovação do miolo, R22): Pós-venda / Relacionamento e
// Medição (kit Shelly). Dados FICTÍCIOS: nomes inventados, nunca cliente real.
import { renderPosVendaPage } from '../../src/modules/dashboard/pos-venda-views.js';
import { renderMedicaoTela } from '../../src/modules/dashboard/medicao-views.js';
import type { PosVendaLinha } from '../../src/modules/dashboard/pos-venda-queries.js';
import type { AgendaAgrupada } from '../../src/modules/dashboard/pos-venda-agenda.js';
import type { ResumoMedicao, Aparelho } from '../../src/modules/dashboard/medicao-queries.js';
import { USER_CASA, USER_TENANT } from './miolo-leads.js';

const dias = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
export const linhaPv = (over: Partial<PosVendaLinha> = {}): PosVendaLinha => ({
  leadId: '11111111-3333-4333-8444-555555555555', sistemaId: 's1', nome: 'Antonio Exemplo', telefone: '5561999990000',
  cidade: 'Brasília', potenciaKwp: 5.2, marcaInversor: 'deye', dataInstalacao: '2024-06-25',
  saude: 'verde', ultimoContatoEm: dias(12), jaTeveDepoimento: false, elegivelUpgrade: false,
  gerouBem: false, ultimoContatoPositivoEm: null, snoozedTipos: new Set<string>(), semApi: false,
  proximaAcao: { tipo: 'parabens', label: 'Aniversário em 3 dia(s)', urgencia: 'media' },
  ...over,
});
const LINHAS: PosVendaLinha[] = [
  linhaPv({ leadId: '22222222-3333-4333-8444-555555555555', nome: 'Bia <script>x</script>', saude: 'vermelho', ultimoContatoEm: dias(200), proximaAcao: { tipo: 'limpeza', label: 'Geração caiu 30% — ofereça limpeza', urgencia: 'alta' } }),
  linhaPv({ leadId: '33333333-3333-4333-8444-555555555555', nome: "Carlos D'Ávila", saude: 'amarelo', semApi: true, marcaInversor: null, cidade: null, ultimoContatoEm: null, gerouBem: true, ultimoContatoPositivoEm: dias(40) }),
  linhaPv(),
];
const AGENDA: AgendaAgrupada = {
  atrasados: [{ id: 't1', leadId: LINHAS[0].leadId, nomeCliente: 'Bia <b>', titulo: 'Ligar sobre a limpeza', dueAt: dias(3) }],
  hoje: [{ id: 't2', leadId: LINHAS[1].leadId, nomeCliente: "Carlos D'Ávila", titulo: 'Mandar relatório', dueAt: dias(0) }],
  semana: [{ id: 't3', leadId: LINHAS[2].leadId, nomeCliente: 'Antonio Exemplo', titulo: 'Revisão', dueAt: null }],
};

const APARELHOS: Aparelho[] = [
  { deviceId: 'shelly-aaa', apelido: 'Casa <b>Exemplo</b>', leituras: 1440, ultimaEm: dias(0) },
  { deviceId: 'shelly-bbb', apelido: null, leituras: 20, ultimaEm: dias(1) },
];
const ini = Date.parse('2026-09-28T12:00:00Z');
const janelas = (n: number, comInjecao: boolean) => Array.from({ length: n }, (_, i) => ({
  inicio: new Date(ini + i * 15 * 60000).toISOString(),
  mediaW: comInjecao && i % 4 === 3 ? -800 - i * 10 : 900 + (i % 5) * 300,
  picoW: comInjecao && i % 4 === 3 ? -1200 : 1800 + (i % 3) * 400,
  amostras: 15,
}));
const RESUMO = (comInjecao: boolean, atrasado = false): ResumoMedicao => ({
  aparelho: APARELHOS[0],
  agora: { potenciaW: 1520, tensao: 221.4, corrente: 6.87, fatorPotencia: 0.97, medidoEm: '2026-09-28T15:00:00Z' },
  demanda: { demandaW: 2400, picoInstantaneoW: 4800, janelaInicio: '2026-09-28T13:15:00Z' },
  janelas: janelas(24, comInjecao),
  consumoDiaKwh: 18.42, injecaoDiaKwh: comInjecao ? 6.1 : null, minutosSemReceber: atrasado ? 42 : 1,
});
const VAZIO: ResumoMedicao = { aparelho: null, agora: null, demanda: null, janelas: [], consumoDiaKwh: null, injecaoDiaKwh: null, minutosSemReceber: null };

export const CASOS_OPERACAO2: Record<string, () => string> = {
  'pos-venda': () => renderPosVendaPage(LINHAS, USER_CASA, AGENDA),
  'pos-venda-sem-agenda': () => renderPosVendaPage(LINHAS.slice(2), USER_CASA),
  'pos-venda-vazio': () => renderPosVendaPage([], USER_CASA, { atrasados: [], hoje: [], semana: [] }),
  'pos-venda-tenant': () => renderPosVendaPage(LINHAS.slice(1), USER_TENANT, AGENDA),
  'medicao': () => renderMedicaoTela(APARELHOS, RESUMO(true), 24, USER_CASA),
  'medicao-um-aparelho': () => renderMedicaoTela(APARELHOS.slice(0, 1), RESUMO(false, true), 6, USER_CASA),
  'medicao-sem-leitura': () => renderMedicaoTela(APARELHOS.slice(1), { ...VAZIO, aparelho: APARELHOS[1] }, 72, USER_CASA),
  'medicao-sem-aparelho': () => renderMedicaoTela([], VAZIO, 24, USER_CASA),
  'medicao-tenant': () => renderMedicaoTela(APARELHOS, RESUMO(false), 24, USER_TENANT),
};
