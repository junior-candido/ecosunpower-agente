// Casos da tela da USINA (renovação do miolo, R9): detalhe, dados (telemetria),
// editar e importar. Dados FICTÍCIOS — nomes inventados, nunca cliente real.
import {
  renderDetalheSistemaPage, renderTelemetriaPage, renderEditarSistemaPage, renderImportarSitesPage,
} from '../../src/modules/dashboard/views.js';
import { renderProntuario } from '../../src/modules/dashboard/manutencao-views.js';
import { USER_CASA, USER_TENANT } from './miolo-leads.js';

export const SISTEMA: any = {
  id: '99999999-2222-4222-8222-222222222222', company_id: USER_CASA.companyId, lead_id: 'lead-1',
  apelido: 'Casa Exemplo <script>alert(1)</script>', marca_inversor: 'goodwe', api_credentials: {},
  potencia_kwp: 8.4, data_instalacao: '2025-03-10', cidade: 'Gama', uf: 'DF', ativo: true,
  ultima_sincronizacao: new Date().toISOString(), ultimo_erro: null,
  painel_marca: 'Trina Solar', painel_modelo: 'TSM-NEG21C.20-700', qtd_paineis: 12, inversor_modelo: 'GoodWe GW5K-DT',
  telhado_tipo: 'ceramica', telhado_orientacao: 'N', telhado_inclinacao_graus: 20, sombreamento_pct: 5,
  observacoes: 'Troca de string box em 2026.',
};

const kpis = (over: Record<string, unknown> = {}) => ({
  hojeKwh: 28.4, mesKwh: 812, anoKwh: 7650, totalKwh: 14200, esperadoDiaKwh: 32.1,
  ratioUltimos7: 0.93, medianaCarteira7d: null, ...over,
});

const serieMes = Array.from({ length: 28 }, (_, i) => ({ x: `2026-09-${String(i + 1).padStart(2, '0')}`, kwh: 20 + (i % 7) * 2.5 }));
const mensal = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
  .map((mes, i) => ({ mes, kwh: 800 + i * 12, esperado: 850 }));

export function detalhe(over: Record<string, unknown> = {}): any {
  return {
    sistema: SISTEMA, kpis: kpis(), vista: 'mes', ref: '2026-09-28',
    nav: { anterior: '2026-08-28', proximo: null, label: 'setembro de 2026' },
    serie: serieMes, totalDiaKwh: null, serieMensalCompleta: mensal,
    alertas: [
      { tipo: 'queda_geracao', severidade: 'aviso', texto: 'Geração 20% abaixo da média da carteira.' },
      { tipo: 'offline', severidade: 'urgente', texto: 'Inversor sem comunicação há 2 horas <b>teste</b>.' },
    ],
    ...over,
  };
}

export const CURVA_DIA = Array.from({ length: 12 }, (_, i) => ({ hora: `${String(7 + i).padStart(2, '0')}:00`, kw: Math.max(0, 5 - Math.abs(5.5 - i)), kwh: i * 2.1 }));

export const TIMELINE = [
  { created_at: '2026-09-20T12:00:00Z', tipo: 'queda', status: 'enviada', desfecho: 'limpeza_fechada', mensagem_enviada: 'Oi! Notamos uma queda na geração da sua usina <b>ontem</b>.', resposta_resumo: null, nota_junior: 'boa' },
  { created_at: '2026-08-02T12:00:00Z', tipo: 'parabens', status: 'enviada', desfecho: null, mensagem_enviada: null, resposta_resumo: null, nota_junior: null },
];

export const PRONTUARIO: any[] = [
  { id: 'm1', tipo: 'limpeza', status: 'feita', origem: 'agenda', data_agendada: '2026-06-01', feita_em: '2026-06-03', notas: 'Placas bem sujas <script>' },
  { id: 'm2', tipo: 'preventiva', status: 'agendada', origem: 'agenda', data_agendada: '2026-12-01', feita_em: null, notas: null },
];

/** O mesmo que a rota faz com o prontuário (HTML pronto que a tela embute). */
export const prontuarioHtml = (itens: any[]) => renderProntuario(itens);

export const DEVICES = ['GW5K-DT-001', 'GW5K-DT-002'];
export const GRANDEZAS = [
  { ponto: 'pac', rotulo: 'Potência AC', unidade: 'kW' },
  { ponto: 'vpv1', rotulo: 'Tensão string 1', unidade: 'V' },
];
export const SERIE_T = Array.from({ length: 24 }, (_, i) => ({ ts: `2026-09-28T${String(i).padStart(2, '0')}:00:00Z`, valor: Math.max(0, 5 - Math.abs(12 - i) * 0.6) }));

const DONO = { id: 'lead-1', name: 'Ana Exemplo', phone: '5561999990001' };

export const CASOS_USINA = {
  'detalhe-mes': () => renderDetalheSistemaPage(detalhe(), null, null, { id: 'lead-1', name: 'Ana Exemplo' }, TIMELINE, prontuarioHtml(PRONTUARIO), USER_CASA),
  'detalhe-dia': () => renderDetalheSistemaPage(detalhe({ vista: 'dia', serie: [], nav: { anterior: '2026-09-27', proximo: null, label: '28/09/2026' } }), CURVA_DIA, null, null, [], prontuarioHtml([]), USER_CASA),
  'detalhe-dia-sem-curva': () => renderDetalheSistemaPage(detalhe({ vista: 'dia', serie: [], totalDiaKwh: 21.3 }), null, 'Curva minuto a minuto não disponível para este inversor.', null, [], '', USER_CASA),
  'detalhe-sem-dado': () => renderDetalheSistemaPage(detalhe({ kpis: kpis({ hojeKwh: null, mesKwh: 0, anoKwh: 0, totalKwh: 0, ratioUltimos7: 0 }), alertas: [], serie: serieMes.map((p) => ({ ...p, kwh: 0 })), serieMensalCompleta: [], sistema: { ...SISTEMA, potencia_kwp: null, data_instalacao: null, ultimo_erro: 'Token expirado (401)' } }), null, null, null, [], '', USER_CASA),
  'detalhe-tenant': () => renderDetalheSistemaPage(detalhe({ kpis: kpis({ medianaCarteira7d: 3.1 }) }), null, null, null, TIMELINE, prontuarioHtml(PRONTUARIO), USER_TENANT),
  'dados': () => renderTelemetriaPage(SISTEMA, DEVICES, GRANDEZAS, { device: DEVICES[0], ponto: 'pac', periodo: 'dia' }, SERIE_T, USER_CASA),
  'dados-vazio': () => renderTelemetriaPage(SISTEMA, [], [], { device: '', ponto: 'pac', periodo: 'semana' }, [], USER_CASA),
  'editar': () => renderEditarSistemaPage(SISTEMA, DONO, USER_CASA),
  'editar-sem-dono': () => renderEditarSistemaPage({ ...SISTEMA, apelido: 'Usina Nova', painel_marca: null, telhado_tipo: null, ativo: false }, null, USER_TENANT),
  'importar': () => renderImportarSitesPage({ user: USER_CASA }),
  'importar-erro': () => renderImportarSitesPage({ user: USER_CASA, errorMsg: 'API key inválida ou sem permissão <b>x</b>.' }),
  'importar-sucesso': () => renderImportarSitesPage({ user: USER_CASA, successMsg: 'Importação concluída', total: 3, novos: 2, atualizados: 1, sitesNomes: ['Usina A', 'Usina <B>'] }),
  'importar-tenant': () => renderImportarSitesPage({ user: USER_TENANT }),
};
