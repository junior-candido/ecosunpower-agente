// Casos dos Demonstrativos GD (renovação do miolo, R11) — 6 telas.
// Dados FICTÍCIOS: nomes inventados, nunca cliente real.
import {
  renderDemonstrativosLista, renderDemonstrativoCliente, renderEnviarPdf, renderConferenciaPdf,
  renderDigitar, renderConfirmarEnvioRelatorio,
} from '../../src/modules/dashboard/demonstrativos-views.js';
import { USER_CASA, USER_TENANT } from './miolo-leads.js';

const item = (over: Record<string, unknown> = {}): any => ({
  instalacao: '200002', clienteNome: 'Ana Exemplo', leadId: 'L1', referencia: '2026-08-01',
  geracaoKwh: 612, saldoKwh: 1240, estado: 'pronto', motivo: null, alertaVencimento: null, ...over,
});

export const ITENS = [
  item(),
  item({ instalacao: '200003', clienteNome: 'Bruno <b>Fictício</b>', estado: 'falta_dado', geracaoKwh: null, motivo: 'falta a geração do mês' }),
  item({ instalacao: '200004', clienteNome: 'Chácara Modelo', estado: 'inconsistente', motivo: 'Injetado maior que a geração', alertaVencimento: '320 kWh de crédito vencem em out/2026' }),
  item({ instalacao: '200005', clienteNome: 'UC sem dono', leadId: null, estado: 'sem_cliente', saldoKwh: null, motivo: 'UC sem cliente' }),
];
const MESES = ['2026-08-01', '2026-07-01', '2026-06-01', '2026-05-01'];

const pronto = { estado: 'pronto', bloqueios: [], pendencias: [], avisos: ['Geração 5% abaixo do esperado'], geracaoKwh: 612, origemGeracao: 'api', esperadoMesKwh: 640 };
const falta = { estado: 'falta_dado', bloqueios: [], pendencias: ['falta a geração do mês'], avisos: [], geracaoKwh: null, origemGeracao: null, esperadoMesKwh: 640 };

const detalhe = (over: Record<string, unknown> = {}): any => ({
  instalacao: '200002', clienteNome: 'Ana <b>Exemplo</b>', leadId: 'L1', meses: MESES, mes: '2026-07-01',
  consumoKwh: 480, injetadoKwh: 222, saldoKwh: 1240, compensadoKwh: 380, economiaRs: 376.2,
  proximoExpirar: '120 kWh de crédito vencem em nov/2026',
  historico: [
    { mes: '2026-05-01', consumida: 450, injetada: 260, compensado: 300 },
    { mes: '2026-06-01', consumida: 470, injetada: 240, compensado: 320 },
    { mes: '2026-07-01', consumida: 480, injetada: 222, compensado: 380 },
    { mes: '2026-08-01', consumida: 500, injetada: 230, compensado: 390 },
  ],
  unidades: [{ codigoCliente: '7000000001', percentual: 60, saldo: 700 }, { codigoCliente: '3000002', percentual: 40, saldo: 540 }],
  origemDemonstrativo: 'email', verificado: true, validacao: pronto, candidatos: [], msg: 'Geração salva.',
  ultimoEnvio: { enviadoEm: '2026-09-27T13:05:00Z', zapPara: '5561999990001', emailPara: 'ana@exemplo.invalid' },
  ultimoEnvioPeriodo: { enviadoEm: '2026-09-20T14:32:00Z', zapPara: '5561999990001', emailPara: null, inicio: '2026-05-01', fim: '2026-08-01' },
  ...over,
});

const confirmar = (over: Record<string, unknown> = {}): any => ({
  instalacao: '200002', mes: '2026-08-01', mesExtenso: 'agosto de 2026', clienteNome: 'Ana <b>Exemplo</b>', canal: 'casa',
  zap: { para: '5561999990001', motivo: null, texto: 'Olá, Ana! ☀️ O relatório de agosto da sua usina está pronto.' },
  email: { para: 'ana@exemplo.invalid', motivo: null, assunto: 'Ana, o relatório de agosto de 2026 da sua usina solar', html: '<p>Olá <b>Ana</b></p>' },
  linkExemplo: 'https://exemplo.invalid/rg/…', ultimoEnvio: null, ...over,
});

export const CASOS_DEMONSTRATIVOS = {
  'lista': () => renderDemonstrativosLista({ itens: ITENS, meses: MESES, mes: '2026-08-01', filtro: {}, msg: 'Demonstrativo gravado.' }, USER_CASA),
  'lista-filtro': () => renderDemonstrativosLista({ itens: ITENS.slice(1, 2), meses: MESES, mes: '2026-07-01', filtro: { estado: 'falta_dado', q: 'bru' } }, USER_CASA),
  'lista-vazia': () => renderDemonstrativosLista({ itens: [], meses: [], mes: null, filtro: {} }, USER_CASA),
  'lista-tenant': () => renderDemonstrativosLista({ itens: ITENS, meses: MESES, mes: '2026-08-01', filtro: {} }, USER_TENANT),
  'cliente-pronto': () => renderDemonstrativoCliente(detalhe(), USER_CASA),
  'cliente-falta': () => renderDemonstrativoCliente(detalhe({ validacao: falta, ultimoEnvio: null, ultimoEnvioPeriodo: null, msg: null, unidades: [], proximoExpirar: null }), USER_CASA),
  'cliente-sem-cliente': () => renderDemonstrativoCliente(detalhe({
    leadId: null, clienteNome: 'UC sem dono', meses: ['2026-08-01'], mes: '2026-08-01', consumoKwh: null, injetadoKwh: null, saldoKwh: null,
    compensadoKwh: null, economiaRs: null, historico: [], unidades: [], origemDemonstrativo: 'pdf_manual', verificado: false,
    validacao: { estado: 'sem_cliente', bloqueios: [], pendencias: ['UC sem cliente'], avisos: [], geracaoKwh: null, origemGeracao: null, esperadoMesKwh: null },
    candidatos: [{ id: 'L2', nome: 'Maria Fictícia', uc: '200005' }, { id: 'L3', nome: null, uc: null }],
    msg: null, ultimoEnvio: null, ultimoEnvioPeriodo: null, proximoExpirar: null,
  }), USER_CASA),
  'cliente-tenant': () => renderDemonstrativoCliente(detalhe({ ultimoEnvio: null }), USER_TENANT),
  'enviar-pdf': () => renderEnviarPdf(USER_CASA),
  'conferencia': () => renderConferenciaPdf([
    { arquivo: 'demonstrativo-ago.pdf', ok: true, textoB64: 'dGV4dG8=', assinatura: 'abc"<x', clienteNome: 'Ana Exemplo', instalacao: '200002', referencia: '2026-08-01', injetadoKwh: 222, consumoKwh: 480, saldoKwh: 1240, inconsistencias: ['Saldo não fecha com o mês anterior'] },
    { arquivo: 'conta-comum.pdf', ok: false, motivo: 'nao parece um demonstrativo' },
  ] as any, USER_CASA),
  'digitar': () => renderDigitar({}, [], USER_CASA),
  'digitar-erro': () => renderDigitar({ clienteNome: 'Ana', instalacao: '200002', mes: '2026-13' }, ['Mês de referência inválido', 'Injetado <b>obrigatório</b>'], USER_CASA),
  'confirmar': () => renderConfirmarEnvioRelatorio(confirmar(), USER_CASA),
  'confirmar-reenviar': () => renderConfirmarEnvioRelatorio(confirmar({ ultimoEnvio: { enviadoEm: '2026-09-27T13:05:00Z', zapPara: '5561999990001', emailPara: null } }), USER_CASA),
  'confirmar-bloqueado': () => renderConfirmarEnvioRelatorio(confirmar({ zap: { para: null, motivo: 'opt_out', texto: '' }, email: null }), USER_CASA),
  'confirmar-periodo': () => renderConfirmarEnvioRelatorio(confirmar({ mesExtenso: 'maio a agosto de 2026', periodo: { de: '2026-05-01', ate: '2026-08-01' }, canal: 'evolution' }), USER_TENANT),
};
