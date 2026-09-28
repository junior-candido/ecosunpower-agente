// src/modules/dashboard/mapa-usinas-rotas.ts
// Rotas do Mapa das Usinas (28/09/2026). Fora do router.ts pra serem testadas
// direto (req/res falsos), no mesmo molde de command-center-rotas.ts.
//
//  GET  /dashboard/command-center/mapa.json   dados dos alfinetes (JSON, cache 60 s)
//  GET  /dashboard/monitoramento/localizar    tela "Localizar usinas sem posição"
//  POST /dashboard/monitoramento/localizar/:id  localiza UMA usina (a tela chama em sequência)
//  POST /dashboard/monitoramento/:id/posicao  alfinete arrastado → salva como 'manual'
//
// MULTI-TENANT: company_id SEMPRE da sessão (nunca da URL/corpo). Acesso =
// módulo contratado ('monitoramento', o bloco "usinas" do Command Center) E
// papel. O mapa.json não está no MODULO_DA_ROTA (fica sob /command-center),
// então confere o módulo aqui mesmo; as rotas /monitoramento/* passam também
// pela trava central de módulos.

import type { Request, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthedRequest } from './auth.js';
import { can, type DashUser } from './permissions.js';
import { bancoDoOperador } from '../tenant-client.js';
import { modulosDaRequisicao } from './modulos-contratados.js';
import { blocosContratados } from './command-center-queries.js';
import { carregarMapaUsinas, type DadosMapa } from './mapa-usinas.js';
import { empresaDe } from '../empresa-config.js';
import { listarSemPosicao, localizarUsina, salvarPosicaoManual, ehColunaFaltando } from '../monitoring/usinas-posicao.js';
import { geocodificadorPadrao, type Geocodificador } from '../monitoring/geocodificacao.js';
import { renderLocalizarUsinasPage } from './mapa-usinas-views.js';

type Handler = (req: Request, res: Response) => Promise<void>;

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cache curto POR EMPRESA (o mapa é igual pra todo mundo da mesma empresa). */
export const CACHE_MAPA_MS = 60_000;
const cache = new Map<string, { expira: number; dados: DadosMapa }>();
/** Localizou/arrastou: o próximo mapa.json da empresa já vem com o ponto novo. */
export function invalidarCacheMapa(companyId: string): void { cache.delete(companyId); }
/** Só pra teste. */
export function _limparCacheMapa(): void { cache.clear(); }

function usuario(req: Request): DashUser | undefined {
  return (req as AuthedRequest).dashUser;
}

async function temModuloUsinas(req: Request, db: SupabaseClient, user: DashUser): Promise<boolean> {
  try {
    return blocosContratados(await modulosDaRequisicao(req, db, user.companyId)).usinas;
  } catch {
    return false; // fail-closed
  }
}

export function rotaMapaJson(supabase: SupabaseClient, agoraFn: () => Date = () => new Date()): Handler {
  return async (req, res) => {
    const user = usuario(req);
    if (!user) { res.status(401).json({ erro: 'sem_sessao' }); return; }
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    if (!(await temModuloUsinas(req, db, user))) {
      res.status(403).json({ erro: 'Módulo de usinas fora do plano', trancado: true });
      return;
    }
    if (!can(user, 'usinas', 'visualizar')) { res.status(403).json({ erro: 'Sem acesso às usinas' }); return; }

    const agora = agoraFn();
    const podeLocalizar = can(user, 'usinas', 'editar');
    let item = cache.get(user.companyId);
    if (!item || item.expira <= agora.getTime()) {
      try {
        const dados = await carregarMapaUsinas(db, user.companyId, agora, empresaDe(user.companyId).reguaAtencaoPct / 100);
        item = { expira: agora.getTime() + CACHE_MAPA_MS, dados };
        cache.set(user.companyId, item);
      } catch (err) {
        console.error('[dashboard/mapa] carga falhou:', (err as Error).message);
        res.status(503).json({ erro: 'sem_dado' });
        return;
      }
    }
    res.setHeader('Cache-Control', `private, max-age=${Math.round(CACHE_MAPA_MS / 1000)}`);
    res.json({ ...item.dados, podeLocalizar });
  };
}

export function rotaLocalizarPagina(supabase: SupabaseClient): Handler {
  return async (req, res) => {
    const user = usuario(req);
    if (!user) { res.redirect('/dashboard/cockpit'); return; }
    if (!can(user, 'usinas', 'editar')) {
      res.status(403).type('text/html').send('<h2>Sem permissão</h2><p>Localizar usinas pede permissão de editar usinas.</p>');
      return;
    }
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    try {
      const pendentes = await listarSemPosicao(db, user.companyId);
      res.type('text/html').send(renderLocalizarUsinasPage({ pendentes, user }));
    } catch (err) {
      const faltaColuna = ehColunaFaltando({ message: (err as Error).message });
      if (!faltaColuna) console.error('[dashboard/mapa/localizar] lista falhou:', (err as Error).message);
      res.status(faltaColuna ? 200 : 503).type('text/html').send(renderLocalizarUsinasPage({ pendentes: [], user, migracaoPendente: faltaColuna, falhou: !faltaColuna }));
    }
  };
}

export function rotaLocalizarUma(supabase: SupabaseClient, geo?: Geocodificador): Handler {
  return async (req, res) => {
    const user = usuario(req);
    if (!user) { res.status(401).json({ ok: false, motivo: 'sem sessão' }); return; }
    if (!can(user, 'usinas', 'editar')) { res.status(403).json({ ok: false, motivo: 'sem permissão para editar usinas' }); return; }
    const id = String(req.params?.id ?? '');
    if (!RE_UUID.test(id)) { res.status(400).json({ ok: false, motivo: 'usina inválida' }); return; }
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    const r = await localizarUsina(db, user.companyId, id, geo ?? geocodificadorPadrao());
    if (!r.ok && r.motivo === 'usina não encontrada') { res.status(404).json(r); return; }
    if (r.ok && !r.pulada) invalidarCacheMapa(user.companyId);
    res.json(r);
  };
}

export function rotaSalvarPosicao(supabase: SupabaseClient): Handler {
  return async (req, res) => {
    const user = usuario(req);
    if (!user) { res.status(401).json({ ok: false, motivo: 'sem sessão' }); return; }
    if (!can(user, 'usinas', 'editar')) { res.status(403).json({ ok: false, motivo: 'sem permissão para editar usinas' }); return; }
    const id = String(req.params?.id ?? '');
    if (!RE_UUID.test(id)) { res.status(400).json({ ok: false, motivo: 'usina inválida' }); return; }
    const corpo = (req.body ?? {}) as Record<string, unknown>;
    const lat = Number(corpo.lat);
    const lng = Number(corpo.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || corpo.lat === '' || corpo.lng === '') {
      res.status(400).json({ ok: false, motivo: 'posição inválida' });
      return;
    }
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    const r = await salvarPosicaoManual(db, user.companyId, id, lat, lng);
    if (!r.ok) {
      res.status(r.motivo === 'usina não encontrada' ? 404 : r.motivo === 'ponto fora do Brasil' ? 400 : 500).json(r);
      return;
    }
    invalidarCacheMapa(user.companyId);
    res.json(r);
  };
}
