// Onda 3 — R18: RH. Telas renovadas com dados FICTÍCIOS em volume n
// (usadas pelo teste "telas leves" e por scripts/medir-telas-leves.ts).
import type { DashUser } from '../../src/modules/dashboard/permissions.js';
import {
  renderCandidatosPage, renderVagasPage, renderVagaFormPage, renderBuscaPage,
} from '../../src/modules/dashboard/rh-views.js';
import type { VagaRow, CandidatoRow } from '../../src/modules/rh/store.js';
import { STATUS_VALIDOS } from '../../src/modules/rh/store.js';

/** Classes fora do padrão cc- que a tela usa de propósito (gancho de JS ou de teste antigo). */
export const CLASSES_R18: string[] = [];

export function telasR18(n: number, user: DashUser): Record<string, string> {
  const vagas: VagaRow[] = Array.from({ length: Math.max(1, Math.ceil(n / 4)) }, (_, i) => ({
    id: `v${i}`, titulo: `Vaga fictícia ${i}`, descricao: 'Descrição de exemplo.', requisitos: 'NR-35',
    cidade: i % 3 ? 'Cidade Exemplo-DF' : '', tipo: i % 2 ? 'PJ' : 'CLT', status: i % 3 ? 'aberta' : 'fechada',
    created_at: '2026-09-01T12:00:00Z',
  }));
  const candidatos: CandidatoRow[] = Array.from({ length: n }, (_, i) => ({
    id: `c${i}`, vaga_id: i % 4 ? `v${i % vagas.length}` : null, nome: `Candidato Exemplo ${i}`,
    telefone: `55619999${String(i).padStart(5, '0')}`, email: i % 5 ? `c${i}@exemplo.invalid` : '',
    curriculo_path: `v/${i}.pdf`, status: STATUS_VALIDOS[i % STATUS_VALIDOS.length],
    nota_ia: i % 3 ? (i % 10) + 0.5 : null, resumo_ia: i % 3 ? 'Resumo fictício da triagem.' : null,
    alertas_ia: i % 7 ? null : 'Alerta fictício.', historico: [], created_at: '2026-09-20T12:00:00Z',
  }));
  return {
    'r18-candidatos': renderCandidatosPage(candidatos, vagas, {}, user),
    'r18-vagas': renderVagasPage(vagas, user),
    'r18-vaga-nova': renderVagaFormPage(null, user),
    'r18-busca': renderBuscaPage('quem tem NR-35?', candidatos.slice(0, Math.min(10, n)).map((c) => ({
      id: c.id, motivo: 'Motivo fictício.', candidato: { nome: c.nome, vaga: null, nota_ia: c.nota_ia, status: c.status },
    })), user),
  };
}
