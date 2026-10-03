// STUDIO 3D (Energy Studio — 02/10/2026): o app de projeto 3D (drone → telhado
// → placas → sombra → inversores → simulação → relatório) DENTRO do painel.
//
// - O app é o build do simulador-fv (app/, Vite+React+three) copiado para
//   ./studio3d/ (index.html + assets/). Ver studio3d/LEIA.md para atualizar.
// - Módulo vendável 'studio_3d' (MODULO_DA_ROTA '/studio-3d' → trava central)
//   + papel usinas.
// - O navegador NUNCA fala com o motor direto: /dashboard/studio-3d/motor/*
//   repassa ao serviço interno com o MOTOR_TOKEN (só 3 rotas liberadas).
// - O relatório sai com a marca da EMPRESA logada (window.__STUDIO__), nunca a
//   da casa por engano (multiempresa).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Request, Response, Router, RequestHandler } from 'express';
import type { AuthedRequest } from './auth.js';
import { empresaDe, nomeTituloCase } from '../empresa-config.js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';
import { configMotorDoAmbiente, type ConfigMotor } from '../monitoring/previsto/motor-cliente.js';

export const PASTA_STUDIO = path.resolve(process.cwd(), 'src', 'modules', 'dashboard', 'studio3d');

/** Rotas do motor que o app pode chamar (o resto do motor fica fechado). */
const ROTAS_MOTOR: Record<string, { metodo: 'GET' | 'POST'; timeoutMs: number }> = {
  simular: { metodo: 'POST', timeoutMs: 120_000 },
  sol: { metodo: 'GET', timeoutMs: 60_000 },
  'ler-datasheet': { metodo: 'POST', timeoutMs: 240_000 },
};

/** logo: "casa" = logo oficial da EcoSun (embutida no app) · URL https da logo do tenant · "" = sem logo. */
export interface EmpresaStudio { nome: string; cnpj: string; rt: string; registro: string; contato: string; logo: string }

/** Dados da empresa logada para o relatório (título e nº do RT do cadastro da empresa). */
export function empresaDoStudio(companyId: string | null | undefined): EmpresaStudio {
  const e = empresaDe(companyId);
  const casa = !companyId || companyId === ECOSUN_COMPANY_ID;
  return {
    nome: e.nomeFantasia || e.razaoSocial || '',
    cnpj: e.cnpj || '',
    rt: e.rtNome ? nomeTituloCase(e.rtNome) : '',
    // o relatório escreve "Responsável Técnico <registro>": aqui vai o resto do título + nº
    registro: [
      (e.rtTitulo || (casa ? 'Responsável Técnico CREA/CFT' : '')).replace(/^respons[áa]vel t[ée]cnico\s*/i, '').trim(),
      (e.rtRegistro ?? '').trim() ? `nº ${(e.rtRegistro ?? '').trim()}` : '',
    ].filter(Boolean).join(' · '),
    contato: [e.telefoneAtendente, e.email].filter(Boolean).join(' · '),
    // tenant: só a logo CADASTRADA dele (URL http/https) — nunca a da casa por engano
    logo: casa ? 'casa' : (/^https?:\/\//i.test((e.logoStoragePath ?? '').trim()) ? (e.logoStoragePath ?? '').trim() : ''),
  };
}

/** Injeta a configuração no index.html do app (JSON escapado contra </script>). */
export function injetarAmbiente(html: string, ambiente: Record<string, unknown>): string {
  const json = JSON.stringify(ambiente).replace(/</g, '\\u003c');
  return html.replace('</head>', `<script>window.__STUDIO__=${json}</script></head>`);
}

export interface DepsStudio { pasta?: string; motor?: ConfigMotor | null; fetchImpl?: typeof fetch; chaveGoogle?: string | null }

// GOOGLE SOLAR API (03/10/2026): foto aérea nítida + modelo de altura (DSM) +
// águas do telhado detectadas — "drone sem drone". A chave GOOGLE_MAPS_API_KEY
// fica SÓ no servidor (Ambiente do EasyPanel); o navegador pede aqui.
// Uso permitido pra projeto solar (≠ contornar imagem do Google Maps comum).
const SOLAR = 'https://solar.googleapis.com/v1';

/** lat/lon válidos (Brasil e arredores não precisam de mais nada). */
function coordenadas(q: Record<string, unknown>): { lat: number; lon: number } | null {
  const lat = Number(q.lat), lon = Number(q.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** Troca as URLs geoTiff:get da Google (que exigem a chave) pela nossa ponte. */
export function reescreverGeoTiffs(json: unknown, base: string): unknown {
  return JSON.parse(JSON.stringify(json), (_k, v) => {
    if (typeof v !== 'string') return v;
    const m = /^https:\/\/solar\.googleapis\.com\/v1\/geoTiff:get\?id=([A-Za-z0-9_-]+)$/.exec(v);
    return m ? `${base}/geotiff?id=${m[1]}` : v;
  });
}

export function montarRotasStudio3d(
  router: Router,
  exigir: (area: 'usinas', nivel: 'visualizar' | 'editar') => RequestHandler,
  d: DepsStudio = {},
): void {
  const pasta = d.pasta ?? PASTA_STUDIO;
  const motor = () => (d.motor !== undefined ? d.motor : configMotorDoAmbiente());
  const chaveGoogle = () => (d.chaveGoogle !== undefined ? d.chaveGoogle : (process.env.GOOGLE_MAPS_API_KEY || null));

  router.get('/studio-3d', exigir('usinas', 'visualizar'), async (req: Request, res: Response) => {
    try {
      const user = (req as AuthedRequest).dashUser!;
      const html = await readFile(path.join(pasta, 'index.html'), 'utf8');
      res.set('Cache-Control', 'no-store');
      res.type('html').send(injetarAmbiente(html, {
        urlMotor: '/dashboard/studio-3d/motor',
        voltar: '/dashboard/energy-studio',
        empresa: empresaDoStudio(user.companyId),
        // 3D da Google (sem drone) só quando a chave existe no servidor
        urlGoogle: chaveGoogle() ? '/dashboard/studio-3d/google' : null,
      }));
    } catch (err) {
      console.error('[studio-3d] app ausente:', (err as Error).message);
      res.status(503).type('html').send('<h2>Studio 3D indisponível neste servidor.</h2><a href="/dashboard/energy-studio">← voltar</a>');
    }
  });

  router.get('/studio-3d/assets/:arquivo', exigir('usinas', 'visualizar'), async (req: Request, res: Response) => {
    const arquivo = String(req.params.arquivo ?? '');
    const ext = /^[A-Za-z0-9._-]+\.(js|css|png|jpg|webp|svg)$/.exec(arquivo)?.[1];
    if (!ext) { res.status(404).end(); return; }
    try {
      const conteudo = await readFile(path.join(pasta, 'assets', arquivo));
      // nome leva o hash do conteúdo (Vite) → cache longo sem risco de versão velha
      res.set('Cache-Control', 'private, max-age=31536000, immutable');
      const TIPOS: Record<string, string> = { js: 'application/javascript', css: 'text/css', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };
      res.type(TIPOS[ext]).send(conteudo);
    } catch {
      res.status(404).end();
    }
  });

  /** Chama a Solar API e devolve a resposta (JSON ou binário) com log de uso (API paga). */
  async function chamarSolar(req: Request, res: Response, nome: string, url: string, binario = false): Promise<void> {
    const chave = chaveGoogle();
    if (!chave) { res.status(503).json({ detail: 'Google não configurado no servidor (GOOGLE_MAPS_API_KEY).' }); return; }
    const user = (req as AuthedRequest).dashUser!;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 60_000);
    const inicio = Date.now();
    try {
      const r = await (d.fetchImpl ?? fetch)(`${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(chave)}`, { signal: ctl.signal });
      console.log(`[studio-3d] google/${nome} empresa=${user.companyId} status=${r.status} ${Date.now() - inicio}ms`);
      if (r.status === 404) { res.status(404).json({ detail: 'A Google não tem cobertura deste endereço — use o mapa comum ou o drone.' }); return; }
      if (!r.ok) {
        const texto = await r.text();
        console.error(`[studio-3d] google/${nome} erro ${r.status}: ${texto.slice(0, 300)}`);
        res.status(502).json({ detail: `A Google recusou o pedido (${r.status}).` });
        return;
      }
      if (binario) {
        res.set('Cache-Control', 'private, max-age=3600');
        res.type(r.headers.get('content-type') || 'image/tiff').send(Buffer.from(await r.arrayBuffer()));
      } else {
        res.json(reescreverGeoTiffs(await r.json(), '/dashboard/studio-3d/google'));
      }
    } catch (err) {
      const abortou = (err as Error).name === 'AbortError';
      console.error(`[studio-3d] google/${nome} falhou (${abortou ? 'tempo esgotado' : (err as Error).message})`);
      res.status(abortou ? 504 : 502).json({ detail: abortou ? 'A Google demorou demais — tente de novo.' : 'Não consegui falar com a Google.' });
    } finally {
      clearTimeout(t);
    }
  }

  // prédio mais perto: águas detectadas (inclinação, azimute, área), qualidade e data da imagem
  router.get('/studio-3d/google/predio', exigir('usinas', 'visualizar'), async (req: Request, res: Response) => {
    const c = coordenadas(req.query as Record<string, unknown>);
    if (!c) { res.status(400).json({ detail: 'lat/lon inválidos' }); return; }
    await chamarSolar(req, res, 'predio', `${SOLAR}/buildingInsights:findClosest?location.latitude=${c.lat}&location.longitude=${c.lon}&requiredQuality=LOW`);
  });

  // camadas: foto aérea (RGB), modelo de altura (DSM) e máscara do telhado
  router.get('/studio-3d/google/camadas', exigir('usinas', 'visualizar'), async (req: Request, res: Response) => {
    const c = coordenadas(req.query as Record<string, unknown>);
    if (!c) { res.status(400).json({ detail: 'lat/lon inválidos' }); return; }
    const raio = Math.min(100, Math.max(10, Number(req.query.raio) || 50));
    await chamarSolar(req, res, 'camadas', `${SOLAR}/dataLayers:get?location.latitude=${c.lat}&location.longitude=${c.lon}&radiusMeters=${raio}&view=IMAGERY_LAYERS&requiredQuality=LOW&pixelSizeMeters=0.1`);
  });

  router.get('/studio-3d/google/geotiff', exigir('usinas', 'visualizar'), async (req: Request, res: Response) => {
    const id = String(req.query.id ?? '');
    if (!/^[A-Za-z0-9_-]{1,512}$/.test(id)) { res.status(400).json({ detail: 'id inválido' }); return; }
    await chamarSolar(req, res, 'geotiff', `${SOLAR}/geoTiff:get?id=${id}`, true);
  });

  router.all('/studio-3d/motor/:rota', exigir('usinas', 'visualizar'), async (req: Request, res: Response) => {
    const rota = String(req.params.rota ?? '');
    const def = ROTAS_MOTOR[rota];
    if (!def || req.method !== def.metodo) { res.status(404).json({ detail: 'rota do motor não liberada' }); return; }
    const cfg = motor();
    if (!cfg) { res.status(503).json({ detail: 'Motor de simulação não configurado (MOTOR_URL).' }); return; }
    const user = (req as AuthedRequest).dashUser!;
    const qs = new URLSearchParams(req.query as Record<string, string>).toString();
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), def.timeoutMs);
    const inicio = Date.now();
    try {
      const r = await (d.fetchImpl ?? fetch)(`${cfg.url}/${rota}${qs ? `?${qs}` : ''}`, {
        method: def.metodo,
        headers: { 'Content-Type': 'application/json', ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}) },
        body: def.metodo === 'POST' ? JSON.stringify(req.body ?? {}) : undefined,
        signal: ctl.signal,
      });
      const texto = await r.text();
      // observabilidade: quem usou, o quê, quanto tempo (leitor de datasheet = IA paga)
      console.log(`[studio-3d] motor/${rota} empresa=${user.companyId} status=${r.status} ${Date.now() - inicio}ms`);
      res.status(r.status).type('application/json').send(texto);
    } catch (err) {
      const abortou = (err as Error).name === 'AbortError';
      console.error(`[studio-3d] motor/${rota} falhou (${abortou ? 'tempo esgotado' : (err as Error).message})`);
      res.status(abortou ? 504 : 502).json({ detail: abortou ? 'O motor demorou demais — tente de novo.' : 'Motor de simulação fora do ar.' });
    } finally {
      clearTimeout(t);
    }
  });
}
