// R20 — Financeiro II: Notas fiscais (lista, nova, detalhe, configuração) e
// Cobrar cliente, com dados FICTÍCIOS e volume configurável (teste "telas
// leves"). Assinaturas já entram por telas-cobranca.ts.
import type { DashUser } from '../../src/modules/dashboard/permissions.js';
import { renderNotasPage, renderNovaNotaPage, renderNotaDetalhe, renderConfigFiscalPage } from '../../src/modules/dashboard/fiscal-views.js';
import { renderCobrarPage } from '../../src/modules/dashboard/cobrar-views.js';
import { nota, CONFIG_OK, SERVICOS } from './casos-financeiro2.js';

const STATUS = ['preparada', 'autorizada', 'enviada', 'cancelada', 'rejeitada', 'rascunho'];
const uuid = (i: number) => `${String(i).padStart(8, '0')}-5555-4666-8777-888888888888`;

export function telasR20(n: number, user: DashUser): Record<string, string> {
  const notas = Array.from({ length: n }, (_, i) => nota({ id: uuid(i), status: STATUS[i % STATUS.length], numero: i % 2 ? String(100 + i) : null, companyId: user.companyId }));
  return {
    'r20-notas': renderNotasPage(notas, CONFIG_OK, user),
    'r20-nota-nova': renderNovaNotaPage(SERVICOS, {}, user),
    'r20-nota-preparada': renderNotaDetalhe(nota(), CONFIG_OK, user),
    'r20-nota-enviada': renderNotaDetalhe(nota({ status: 'enviada' }), CONFIG_OK, user),
    'r20-nota-autorizada': renderNotaDetalhe(nota({ status: 'autorizada', numero: '84', chaveAcesso: 'x'.repeat(44), ambienteEmissao: 'producao', pdfStoragePath: 'p', contaReceberId: 'c' }), CONFIG_OK, user),
    'r20-fiscal-config': renderConfigFiscalPage(null, undefined, user),
    'r20-cobrar': renderCobrarPage({ off: false, user }),
  };
}
