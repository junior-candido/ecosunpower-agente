// Onda 4 da renovação do miolo (R5, R21–R26): telas renovadas com dados
// FICTÍCIOS (usadas pelo teste "telas leves" e por scripts/medir-telas-leves.ts).
// Cada fatia acrescenta SÓ a sua parte.
import type { DashUser } from '../../src/modules/dashboard/permissions.js';
import { renderContratosPage } from '../../src/modules/dashboard/contratos-views.js';
import { renderFecharVendaPage } from '../../src/modules/dashboard/vendas-views.js';
import { renderContratoFormPage, renderDocBloqueadoPage } from '../../src/modules/dashboard/contrato-form-views.js';
import { telaRecados } from '../../src/modules/dashboard/recados-views.js';
import { telaConhecimento } from '../../src/modules/dashboard/conhecimento-views.js';
import { getContrato, CONTRATOS } from '../../src/modules/closing/contratos-registry.js';
import { CASOS_COMERCIAL2 } from './casos-comercial2.js';
import { renderPosVendaPage } from '../../src/modules/dashboard/pos-venda-views.js';
import { CASOS_OPERACAO2, linhaPv } from './casos-operacao2.js';

const uuid = (i: number) => `${String(i).padStart(8, '0')}-2222-4333-8444-555555555555`;

/** Classes fora do padrão cc- que as telas da Onda 4 usam de propósito. */
export const CLASSES_ONDA4: string[] = [
  // R22 — Pós-venda: ganchos do script (querySelector/closest), sem estilo próprio
  ...['card', 'urgent', 'sugestao-btn', 'sug-dispensar', 'tpl-btn', 'previa', 'previa-texto', 'previa-enviar', 'previa-cancelar',
    'previa-status', 'copiloto-btn', 'chat', 'chat-in', 'chat-send', 'chat-out', 'chat-copy', 'chat-send-eva', 'notas-btn',
    'lembrete-btn', 'lembrete-form', 'lembrete-titulo', 'lembrete-data', 'lembrete-salvar', 'lembrete-status', 'notas', 'nota-in',
    'nota-salvar', 'nota-status', 'historico', 'tarefa-ok', 'tarefa-adiar', 'agenda'].map((c) => 'pv-' + c),
];

function telasR21(n: number, user: DashUser): Record<string, string> {
  const fv = getContrato('fv')!;
  const clientes = Array.from({ length: n }, (_, i) => ({ leadId: uuid(i), nome: `Cliente Fictício ${i}`, status: i % 2 ? 'instalado' : 'contrato_assinado' }));
  return {
    'r21-contratos': renderContratosPage({ q: '', buscou: false, resultados: [], recentes: clientes, selecionado: clientes[0], tipos: CONTRATOS.map((c) => ({ tipo: c.tipo, nome: c.nome, emoji: c.emoji, descricao: c.descricao })), user }),
    'r21-fechou': renderFecharVendaPage({ q: 'Cliente', buscou: true, hoje: '2026-09-28', user, resultados: clientes.map((c, i) => ({ leadId: c.leadId, propostaId: i % 2 ? null : uuid(i + 100), clienteNome: c.nome, numeroProposta: i % 3 ? `P-${i}` : null, createdAt: '2026-09-20T12:00:00Z', jaVenda: i % 5 === 4 })) }),
    'r21-contrato-form': renderContratoFormPage({ leadId: uuid(1), nome: 'Cliente Fictício', def: fv, tipos: CONTRATOS.map((c) => ({ tipo: c.tipo, nome: c.nome, emoji: c.emoji })), valores: {}, faltando: fv.campos.filter((c) => c.obrigatorio), problemas: ['CPF do titular'], temProposta: true, user }),
    'r21-bloqueado': renderDocBloqueadoPage({ leadId: uuid(1), nome: 'Cliente Fictício', acao: 'pdf', tipoForm: 'fv', user, blocos: [{ documento: 'Contrato', problemas: ['CPF'] }] }),
    'r21-recados': telaRecados(Array.from({ length: n }, (_, i) => ({ id: `r${i}`, nome: `Pessoa ${i}`, telefone: '5561999990000', mensagem: `Recado fictício ${i}.`, criado_em: '2026-09-28T12:00:00Z', lido_em: null })), user),
    'r21-lojas': CASOS_COMERCIAL2[user.companyId === '00000000-0000-0000-0000-000000000001' ? 'lojas-kit' : 'lojas-tenant'](),
    'r21-conhecimento': telaConhecimento([{ chave: 'a', titulo: 'Assunto', conteudo: '', ordem: 1 }], 'assistente', user),
  };
}

function telasR22(n: number, user: DashUser): Record<string, string> {
  const SAUDES = ['verde', 'amarelo', 'vermelho'] as const;
  return {
    'r22-pos-venda': renderPosVendaPage(Array.from({ length: n }, (_, i) => linhaPv({ leadId: uuid(i), nome: `Cliente Fictício ${i}`, saude: SAUDES[i % 3] })), user,
      { atrasados: [{ id: uuid(900), leadId: uuid(0), nomeCliente: 'Cliente Fictício 0', titulo: 'Ligar', dueAt: null }], hoje: [], semana: [] }),
    'r22-medicao': CASOS_OPERACAO2[user.companyId === '00000000-0000-0000-0000-000000000001' ? 'medicao' : 'medicao-tenant'](),
  };
}

export function telasOnda4(n: number, user: DashUser): Record<string, string> {
  return { ...telasR21(n, user), ...telasR22(n, user) };
}
