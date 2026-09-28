// Onda 3 — R16: Clientes. Telas renovadas com dados FICTÍCIOS em volume n
// (usadas pelo teste "telas leves" e por scripts/medir-telas-leves.ts).
import type { DashUser } from '../../src/modules/dashboard/permissions.js';
import { renderClientesListPage, renderClienteDetailPage, renderFormNovoCliente } from '../../src/modules/dashboard/clientes-views.js';
import { renderFormNovoRelatorio, renderPreviewRelatorio } from '../../src/modules/dashboard/relatorio-pi-views.js';
import { clienteRow, detalhe, INSIGHTS, ORFAOS } from './casos-clientes.js';

/** Classes fora do padrão cc- que a tela usa de propósito (gancho de JS ou de teste antigo). */
export const CLASSES_R16: string[] = [
  // Ficha do cliente: o script do formulário troca vírgula por ponto nos campos numéricos.
  'js-num',
];

const STATUS = ['operando', 'instalado', 'contrato_assinado', 'pos_venda_concluido', 'medidor_trocado', null] as const;
const uuid = (i: number) => `${String(i).padStart(8, '0')}-2222-4222-8222-222222222222`;

export function telasR16(n: number, user: DashUser): Record<string, string> {
  const linhas = Array.from({ length: n }, (_, i) => clienteRow({
    id: uuid(i), name: `Cliente Fictício ${i}`, phone: `55619${String(20000000 + i)}`,
    installation_status: STATUS[i % STATUS.length], consumo_medio_kwh: 300 + i * 10, conta_media_brl: i % 4 ? 250 + i : null,
  }));
  const d = detalhe({
    anexos: Array.from({ length: Math.min(n, 12) }, (_, i) => ({ ...detalhe().anexos[i % 2], id: uuid(900 + i) })),
    conversas_recentes: Array.from({ length: 5 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `Mensagem fictícia ${i}.`, timestamp: '2026-09-24T10:00:00Z' })),
  });
  return {
    'r16-clientes': renderClientesListPage(linhas, {}, ORFAOS, { total: n * 3, limit: Math.max(1, n), offset: 0 }, user),
    'r16-clientes-arquivados': renderClientesListPage(linhas.slice(0, Math.ceil(n / 4)), {}, [], { total: Math.ceil(n / 4), limit: 50, offset: 0, mostrarArquivados: true }, user),
    'r16-cliente-ficha': renderClienteDetailPage(d, INSIGHTS, user),
    'r16-cliente-novo': renderFormNovoCliente({ user }),
    'r16-relatorio-novo': renderFormNovoRelatorio({ lead_id: uuid(1), cliente_nome: 'Cliente Fictício 1', data_instalacao_pre: '2026-03-10', user }),
    'r16-relatorio-previa': renderPreviewRelatorio({ lead_id: uuid(1), relatorio_id: 'r1', slug: 'cliente-ficticio-1', html_preview: '<html><body><h1>Relatório fictício</h1></body></html>', ja_enviado: false, enviado_em: null, user }),
  };
}
