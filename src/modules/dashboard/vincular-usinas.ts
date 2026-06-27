// src/modules/dashboard/vincular-usinas.ts
// Lógica pura do mutirão de vínculo usina<->cliente. Sem banco, sem HTML.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Normaliza nome pra casar apelido do painel com nome do lead. */
export function normalizarNome(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // tira acento
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ') // pontuação/hífen viram espaço
    .trim();
}

export interface CandidatoUsina { id: string; apelido: string | null; }
export interface LeadOpcao { id: string; name: string | null; }
export interface SugestaoVinculo {
  usinaId: string;
  apelido: string | null;
  leadSugeridoId: string | null;
  leadSugeridoNome: string | null;
}

/** Pra cada usina sem cliente, sugere o lead cujo nome normalizado bate. */
export function sugerirVinculos(usinas: CandidatoUsina[], leads: LeadOpcao[]): SugestaoVinculo[] {
  const idx = new Map<string, LeadOpcao>();
  for (const l of leads) {
    const k = normalizarNome(l.name);
    if (k && !idx.has(k)) idx.set(k, l); // 1º lead vence em caso de nomes iguais
  }
  return usinas.map((u) => {
    const k = normalizarNome(u.apelido);
    const hit = k ? idx.get(k) : undefined;
    return {
      usinaId: u.id,
      apelido: u.apelido,
      leadSugeridoId: hit?.id ?? null,
      leadSugeridoNome: hit?.name ?? null,
    };
  });
}

export interface ParVinculo { usinaId: string; leadId: string; }

/** Lê o corpo do form (usinaId -> leadId) e mantém só pares com 2 UUIDs. */
export function sanitizarPares(body: Record<string, unknown>): ParVinculo[] {
  const vistos = new Set<string>();
  const out: ParVinculo[] = [];
  for (const [usinaId, leadIdRaw] of Object.entries(body)) {
    const leadId = String(leadIdRaw ?? '').trim();
    if (!UUID_RE.test(usinaId) || !UUID_RE.test(leadId)) continue;
    if (vistos.has(usinaId)) continue;
    vistos.add(usinaId);
    out.push({ usinaId, leadId });
  }
  return out;
}
