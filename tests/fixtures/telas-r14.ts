// Onda 3 — R14: Serviços de campo (painel interno). Telas renovadas com dados FICTÍCIOS em volume n
// (usadas pelo teste "telas leves" e por scripts/medir-telas-leves.ts).
import type { DashUser } from '../../src/modules/dashboard/permissions.js';
import {
  renderServicosPage, renderNovoServicoPage, renderDetalheServicoPage, renderLixeiraServicosPage,
} from '../../src/modules/dashboard/servicos-views.js';
import { servicoRow, TIPOS_SERVICO } from './casos-servicos.js';

/** Classes fora do padrão cc- que a tela usa de propósito (gancho de JS ou de teste antigo). */
export const CLASSES_R14: string[] = [
  // Novo registro: mostraGuia() faz querySelectorAll('.guia-fotos') (contrato da tela).
  'guia-fotos',
];

export function telasR14(n: number, user: DashUser): Record<string, string> {
  const lista = Array.from({ length: n }, (_, i) => servicoRow({
    id: `srv-${i}`, clienteNome: `Cliente Fictício ${i}`,
    status: i % 3 === 0 ? 'atribuido' : 'concluido',
    atribuidoA: i % 6 === 0 ? user.id : i % 3 === 0 ? 'u-outro' : null,
    atribuidoNome: i % 3 === 0 ? 'Instalador Fictício' : null,
    fotos: i % 4, videos: i % 5 === 0 ? 1 : 0,
  }));
  const midias = Array.from({ length: Math.min(n, 30) }, (_, i) => ({ tipoMidia: i % 10 === 9 ? 'video' : 'foto', url: `https://exemplo.invalid/foto-${i}.jpg` }));
  const usuarios = Array.from({ length: Math.min(n, 30) }, (_, i) => ({ id: `u-${i}`, nome: `Pessoa Fictícia ${i}` }));
  return {
    'r14-servicos': renderServicosPage(lista, user),
    'r14-servico-novo': renderNovoServicoPage(TIPOS_SERVICO, user, usuarios),
    'r14-servico-detalhe': renderDetalheServicoPage(servicoRow({ campoSlug: 'abcdefghjk', campoNome: 'Fulano', campoExpiraEm: '2099-01-01T12:00:00Z' }), midias, user, true, { pode: true }),
    'r14-servico-trabalho': renderDetalheServicoPage(servicoRow({ status: 'atribuido', tipoId: 'termino-instalacao', atribuidoA: user.id, atribuidoNome: user.nome }), [], user, false, { pode: false }),
    'r14-servicos-lixeira': renderLixeiraServicosPage(lista.slice(0, Math.max(1, Math.floor(n / 2))), user),
  };
}
