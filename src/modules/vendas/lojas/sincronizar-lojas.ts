// src/modules/vendas/lojas/sincronizar-lojas.ts
// Job da "tabela viva": puxa o catálogo das 3 lojas e faz upsert em catalogo_loja.
// Cada loja é independente — uma falhar não derruba as outras. Avisa o Junior no
// zap se uma loja falhar. Roda só pras lojas com credencial/cookie configurado.
import type { ItemLoja } from './tipos.js';
import type { CatalogoLojaService } from './catalogo-loja.js';
import { puxarCatalogoBelenus, type BelenusCreds } from './belenus-client.js';
import { puxarCatalogoSolfacil, type SolfacilCreds } from './solfacil-client.js';
import { puxarCatalogoFortlev } from './fortlev-client.js';

export interface SincronizarDeps {
  catalogo: CatalogoLojaService;
  belenus?: BelenusCreds;
  solfacil?: SolfacilCreds;
  fortlevCookie?: string;
  fetchFn?: typeof fetch;
  agoraMs: () => number;
  /** Aviso pro Junior (zap) quando uma loja falha. Best-effort. */
  alertar?: (msg: string) => Promise<void>;
}

export interface ResultadoLoja { fonte: string; ok: boolean; itens: number; erro?: string; }

async function sincronizarUma(
  fonte: 'belenus' | 'solfacil' | 'fortlev',
  puxar: () => Promise<ItemLoja[]>,
  deps: SincronizarDeps,
): Promise<ResultadoLoja> {
  try {
    const itens = await puxar();
    const r = await deps.catalogo.upsertLote(itens, deps.agoraMs());
    if (!r.ok) throw new Error(r.erro);
    await deps.catalogo.marcarSumidos(fonte, itens.map((i) => i.sku), deps.agoraMs());
    console.log(`[tabela-viva] ${fonte}: ${itens.length} itens sincronizados`);
    return { fonte, ok: true, itens: itens.length };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error(`[tabela-viva] ${fonte} FALHOU:`, erro);
    if (deps.alertar) await deps.alertar(`⚠️ Tabela viva: falha ao sincronizar *${fonte}* — ${erro}`).catch(() => {});
    return { fonte, ok: false, itens: 0, erro };
  }
}

/** Sincroniza todas as lojas configuradas. Retorna o resultado por loja. */
export async function sincronizarLojas(deps: SincronizarDeps): Promise<ResultadoLoja[]> {
  const fetchFn = deps.fetchFn ?? fetch;
  const jobs: Promise<ResultadoLoja>[] = [];
  if (deps.belenus) jobs.push(sincronizarUma('belenus', () => puxarCatalogoBelenus(deps.belenus!, fetchFn), deps));
  if (deps.solfacil) jobs.push(sincronizarUma('solfacil', () => puxarCatalogoSolfacil(deps.solfacil!, fetchFn), deps));
  if (deps.fortlevCookie) jobs.push(sincronizarUma('fortlev', () => puxarCatalogoFortlev(deps.fortlevCookie!, fetchFn), deps));
  if (!jobs.length) {
    console.log('[tabela-viva] nenhuma loja configurada (faltam segredos) — job no-op');
    return [];
  }
  return Promise.all(jobs);
}

/** Lê as credenciais do ambiente. Retorna só o que estiver setado. */
export function credenciaisDoEnv(env: NodeJS.ProcessEnv = process.env): Pick<SincronizarDeps, 'belenus' | 'solfacil' | 'fortlevCookie'> {
  const out: Pick<SincronizarDeps, 'belenus' | 'solfacil' | 'fortlevCookie'> = {};
  if (env.BELENUS_USER && env.BELENUS_PASS) out.belenus = { email: env.BELENUS_USER, senha: env.BELENUS_PASS };
  if (env.SOLFACIL_USER && env.SOLFACIL_PASS) out.solfacil = { usuario: env.SOLFACIL_USER, senha: env.SOLFACIL_PASS };
  if (env.FORTLEV_COOKIE) out.fortlevCookie = env.FORTLEV_COOKIE;
  return out;
}
