// src/modules/rh/routes-publicas.ts
// Rotas PÚBLICAS do RH — a página /trabalhe-conosco do site consome:
//   GET  /rh/vagas        -> vagas abertas (JSON)
//   POST /rh/candidatura  -> formulário multipart com o currículo em PDF
// CORS liberado só pro domínio do site. Honeypot + rate limit contra spam.
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { validarCandidatura, CURRICULO_MAX_BYTES } from './validacao.js';
import { getVaga, listarVagasAbertas, salvarCandidatura } from './store.js';

const ORIGENS_PERMITIDAS = new Set([
  'https://ecosunpower.eng.br',
  'https://www.ecosunpower.eng.br',
  'http://localhost:4321', // astro dev do site (npm run dev)
]);

function cors(req: Request, res: Response, next: NextFunction): void {
  const origin = String(req.headers.origin ?? '');
  if (ORIGENS_PERMITIDAS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
}

// Rate limit simples em memória: máx 5 candidaturas por IP por hora.
const enviosPorIp = new Map<string, number[]>();
const JANELA_MS = 60 * 60 * 1000;
export function estourouLimite(ip: string, agoraMs: number, registro: Map<string, number[]> = enviosPorIp): boolean {
  // Faxina: IPs de passagem (1 POST e some) não podem acumular pra sempre.
  if (registro.size > 1000) {
    for (const [k, ts] of registro) {
      const vivos = ts.filter((t) => agoraMs - t < JANELA_MS);
      if (vivos.length === 0) registro.delete(k);
      else registro.set(k, vivos);
    }
  }
  const lista = (registro.get(ip) ?? []).filter((t) => agoraMs - t < JANELA_MS);
  if (lista.length >= 5) { registro.set(ip, lista); return true; }
  lista.push(agoraMs);
  registro.set(ip, lista);
  return false;
}

export function criarRhRoutesPublicas(client: SupabaseClient): Router {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: CURRICULO_MAX_BYTES + 1024 } });
  // Escopado em /rh: este router é montado na raiz do app — sem o prefixo,
  // o CORS engoliria as requisições OPTIONS do app inteiro.
  router.use('/rh', cors);

  router.get('/rh/vagas', async (_req: Request, res: Response) => {
    try {
      res.json({ vagas: await listarVagasAbertas(client) });
    } catch (err) {
      console.warn('[rh] GET /rh/vagas:', (err as Error).message);
      res.status(500).json({ vagas: [] });
    }
  });

  router.post('/rh/candidatura', upload.single('curriculo'), async (req: Request, res: Response) => {
    // IP real = ÚLTIMO da lista X-Forwarded-For (o proxy anexa no fim; o
    // primeiro pode ser forjado pelo cliente e driblaria o limite).
    const xff = String(req.headers['x-forwarded-for'] ?? '');
    const ip = (xff.split(',').pop() ?? '').trim() || String(req.socket.remoteAddress ?? '?');
    const b = (req.body ?? {}) as Record<string, unknown>;
    const r = validarCandidatura(
      {
        nome: String(b.nome ?? ''),
        telefone: String(b.telefone ?? ''),
        email: String(b.email ?? ''),
        vagaId: String(b.vaga_id ?? ''),
        consentimento: String(b.consentimento ?? ''),
        // honeypot: o form manda como "extra_info" (nome neutro — "website"
        // era preenchido pelo autofill do Chrome e derrubava gente de verdade)
        website: String(b.extra_info ?? ''),
      },
      req.file?.buffer,
      String(req.file?.originalname ?? ''),
    );
    if (!r.ok) {
      if (r.spam) { res.json({ ok: true }); return; } // robô: finge sucesso, sem dica
      res.status(400).json({ ok: false, erro: r.erro });
      return;
    }
    // Limite só conta candidatura VÁLIDA: quem errou o anexo 5x não fica
    // trancado na 6ª tentativa (a certa). Bot de envio válido continua barrado.
    if (estourouLimite(ip, Date.now())) {
      res.status(429).json({ ok: false, erro: 'Muitas tentativas — tenta de novo mais tarde.' });
      return;
    }
    // Vaga do formulário: se não existe mais ou já fechou, vai pro Banco de
    // Talentos em vez de perder a candidatura (ou aceitar em vaga encerrada).
    if (r.dados.vagaId) {
      const vaga = await getVaga(client, r.dados.vagaId);
      if (!vaga || vaga.status !== 'aberta') r.dados.vagaId = null;
    }
    const salvo = await salvarCandidatura(client, r.dados, req.file!.buffer);
    if (!salvo.ok) {
      console.warn('[rh] candidatura falhou:', salvo.error);
      res.status(500).json({ ok: false, erro: 'Não consegui salvar agora — tenta de novo em instantes.' });
      return;
    }
    console.log(`[rh] candidatura recebida: ${r.dados.nome} (vaga=${r.dados.vagaId ?? 'banco-talentos'})`);
    res.json({ ok: true });
  });

  // Erro do multer (arquivo grande/campo errado) vira 400 legível, não 500 feio.
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.warn('[rh] upload rejeitado:', (err as Error)?.message);
    res.status(400).json({ ok: false, erro: 'Arquivo inválido ou grande demais (máx 5 MB).' });
  });

  return router;
}
