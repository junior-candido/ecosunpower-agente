// Casos do RH (renovação do miolo, R18) — 4 telas: candidatos, vagas,
// vaga nova/editar e busca IA no banco de talentos.
// Dados FICTÍCIOS: nomes inventados, nunca candidato real.
import {
  renderVagasPage, renderVagaFormPage, renderCandidatosPage, renderBuscaPage,
} from '../../src/modules/dashboard/rh-views.js';
import type { VagaRow, CandidatoRow } from '../../src/modules/rh/store.js';
import { USER_CASA, USER_TENANT } from './miolo-leads.js';

export const VAGAS_RH: VagaRow[] = [
  { id: 'v1', titulo: 'Instalador Fotovoltaico', descricao: 'Montagem de estrutura e módulos.', requisitos: 'NR-35, NR-10', cidade: 'Brasília-DF', tipo: 'CLT', status: 'aberta', created_at: '2026-09-01T12:00:00Z' },
  { id: 'v2', titulo: 'Auxiliar <script>alert(1)</script> "Elétrica"', descricao: '', requisitos: '', cidade: '', tipo: 'PJ', status: 'fechada', created_at: '2026-08-10T12:00:00Z' },
];

const cand = (over: Partial<CandidatoRow>): CandidatoRow => ({
  id: 'c0', vaga_id: 'v1', nome: 'Candidato Exemplo', telefone: '5561999990000', email: 'exemplo@exemplo.invalid',
  curriculo_path: 'v1/a.pdf', status: 'novo', nota_ia: null, resumo_ia: null, alertas_ia: null,
  historico: [], created_at: '2026-09-20T12:00:00Z', ...over,
});

export const CANDIDATOS_RH: CandidatoRow[] = [
  cand({ id: 'c1', nome: "José D'Ávila", status: 'triado', nota_ia: 8.5, resumo_ia: 'Eletricista com 5 anos de obra.', alertas_ia: 'Não menciona NR-35' }),
  cand({ id: 'c2', nome: 'Maria <b>Teste</b>', vaga_id: null, telefone: '5561988887777', email: '', status: 'entrevista', nota_ia: 5.2, resumo_ia: 'Auxiliar com vontade de aprender.' }),
  cand({ id: 'c3', nome: 'Pedro Exemplo', vaga_id: 'v-apagada', status: 'reprovado', nota_ia: 2 }),
  cand({ id: 'c4', nome: 'Lúcia Fictícia', status: 'novo' }),
];

export const CASOS_RH: Record<string, () => string> = {
  'candidatos': () => renderCandidatosPage(CANDIDATOS_RH, VAGAS_RH, {}, USER_CASA),
  'candidatos-filtrado': () => renderCandidatosPage(CANDIDATOS_RH.slice(0, 1), VAGAS_RH, { vagaId: 'v1', status: 'triado', q: "José <x>" }, USER_CASA),
  'candidatos-banco': () => renderCandidatosPage(CANDIDATOS_RH.slice(1, 2), VAGAS_RH, { vagaId: 'banco' }, USER_CASA),
  'candidatos-vazio': () => renderCandidatosPage([], [], {}, USER_CASA),
  'candidatos-tenant': () => renderCandidatosPage(CANDIDATOS_RH, VAGAS_RH, {}, USER_TENANT),
  'vagas': () => renderVagasPage(VAGAS_RH, USER_CASA),
  'vagas-vazia': () => renderVagasPage([], USER_CASA),
  'vagas-tenant': () => renderVagasPage(VAGAS_RH, USER_TENANT),
  'vaga-nova': () => renderVagaFormPage(null, USER_CASA),
  'vaga-editar': () => renderVagaFormPage({ ...VAGAS_RH[1], descricao: 'Texto com <script>x</script> & "aspas"', requisitos: "Ter CNH 'B'" }, USER_CASA),
  'vaga-nova-tenant': () => renderVagaFormPage(null, USER_TENANT),
  'busca-inicial': () => renderBuscaPage('', null, USER_CASA),
  'busca-resultados': () => renderBuscaPage('quem tem NR-35 e "telhado"?', [
    { id: 'c1', motivo: 'NR-35 em dia e <b>3 anos</b> de telhado.', candidato: { nome: "José D'Ávila", vaga: 'Instalador Fotovoltaico', nota_ia: 8.5, status: 'triado' } },
    { id: 'c2', motivo: 'Já trabalhou em obra de telhado metálico.', candidato: { nome: 'Maria <b>Teste</b>', vaga: null, nota_ia: null, status: 'entrevista' } },
    { id: 'c3', motivo: 'Cita curso de altura.', candidato: { nome: 'Pedro Exemplo', vaga: 'Auxiliar', nota_ia: 4, status: 'reprovado' } },
  ], USER_CASA),
  'busca-vazia': () => renderBuscaPage('quem fala russo?', [], USER_CASA),
  'busca-erro': () => renderBuscaPage('quem tem NR-10?', null, USER_CASA, 'A busca falhou agora — tenta de novo em instantes.'),
  'busca-tenant': () => renderBuscaPage('quem tem NR-35?', [
    { id: 'c1', motivo: 'NR-35 em dia.', candidato: { nome: 'José Exemplo', vaga: 'Instalador', nota_ia: 7, status: 'novo' } },
  ], USER_TENANT),
};
