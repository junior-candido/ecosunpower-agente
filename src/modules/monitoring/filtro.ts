// src/modules/monitoring/filtro.ts
// Busca/filtro/ordenação server-side da lista de usinas. Função PURA.
import type { NivelSistema } from './classificacao.js';

export interface FiltroQuery {
  q?: string;
  marca?: string;
  cidade?: string;
  status?: string; // 'urgente'|'aviso'|'info'|'ok'
  ord?: string;    // 'severidade'(default) | 'geracao_desc' | 'nome'
}

interface LinhaFiltravel {
  apelido: string;
  cidade: string | null;
  marca_inversor: string;
  nivel: NivelSistema;
  geracao_hoje_kwh: number | null;
}

const PESO: Record<string, number> = { urgente: 0, aviso: 1, info: 2, ok: 3 };

function removerAcentos(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function filtrarOrdenarSistemas<T extends LinhaFiltravel>(rows: T[], qf: FiltroQuery): T[] {
  let out = rows.slice();
  const q = (qf.q ?? '').trim().toLowerCase();
  if (q) {
    const qNorm = removerAcentos(q);
    out = out.filter((r) => {
      const apelidoNorm = removerAcentos(r.apelido.toLowerCase());
      const cidadeNorm = removerAcentos((r.cidade ?? '').toLowerCase());
      return apelidoNorm.includes(qNorm) || cidadeNorm.includes(qNorm);
    });
  }
  if (qf.marca) out = out.filter((r) => r.marca_inversor === qf.marca);
  if (qf.cidade) out = out.filter((r) => (r.cidade ?? '') === qf.cidade);
  if (qf.status) out = out.filter((r) => r.nivel === qf.status);

  const ord = qf.ord ?? 'severidade';
  if (ord === 'geracao_desc') {
    out.sort((a, b) => (b.geracao_hoje_kwh ?? 0) - (a.geracao_hoje_kwh ?? 0));
  } else if (ord === 'nome') {
    out.sort((a, b) => a.apelido.localeCompare(b.apelido, 'pt-BR'));
  } else {
    out.sort((a, b) => (PESO[a.nivel] ?? 9) - (PESO[b.nivel] ?? 9)
      || a.apelido.localeCompare(b.apelido, 'pt-BR'));
  }
  return out;
}
