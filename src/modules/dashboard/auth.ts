// Auth do dashboard interno: form HTML de login + cookie de sessao HMAC.
// Substitui o Basic Auth do navegador (que pedia usuario+senha em pop-up feio)
// por uma tela de login profissional com identidade EcoSun.
//
// Sessao: cookie 'ecosun_dash_token' com formato `<expires>.<hmac-sha256>`.
// Assinado com META_APP_SECRET (ou DASHBOARD_PASSWORD como fallback).
// HttpOnly + Secure + SameSite=Strict + duracao 7 dias.

import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const COOKIE_NAME = 'ecosun_dash_token';
const COOKIE_TTL_DAYS = 7;

function getSecret(): string {
  // Preferimos META_APP_SECRET pq ja existe no env e eh longo/aleatorio.
  // Fallback pra DASHBOARD_PASSWORD se META_APP_SECRET nao estiver setado.
  return process.env.META_APP_SECRET ?? process.env.DASHBOARD_PASSWORD ?? 'fallback-mude-isso';
}

export function gerarTokenSessao(): string {
  const exp = Date.now() + COOKIE_TTL_DAYS * 24 * 60 * 60 * 1000;
  const sig = crypto.createHmac('sha256', getSecret()).update(String(exp)).digest('hex');
  return `${exp}.${sig}`;
}

export function validarTokenSessao(token: string): boolean {
  const dot = token.indexOf('.');
  if (dot < 0) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(exp)) return false;
  if (!/^[a-f0-9]{64}$/i.test(sig)) return false;
  const expected = crypto.createHmac('sha256', getSecret()).update(exp).digest('hex');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'))) {
      return false;
    }
  } catch {
    return false;
  }
  return parseInt(exp, 10) > Date.now();
}

function lerCookieToken(req: Request): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const parts = raw.split(';');
  for (const p of parts) {
    const trimmed = p.trim();
    if (trimmed.startsWith(COOKIE_NAME + '=')) {
      return decodeURIComponent(trimmed.slice(COOKIE_NAME.length + 1));
    }
  }
  return null;
}

// Middleware: bloqueia acesso a rotas protegidas. Se nao autenticado, redireciona
// pra /dashboard/login. Pra requests AJAX (Accept: application/json), retorna 401.
export function dashboardSessionAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) {
    res.status(503).send(
      '<h2>Dashboard nao configurado</h2><p>Defina DASHBOARD_PASSWORD no Easypanel.</p>',
    );
    return;
  }

  const token = lerCookieToken(req);
  if (token && validarTokenSessao(token)) {
    next();
    return;
  }

  // Rota AJAX/API: retorna 401 sem redirect
  const accept = (req.headers.accept ?? '').toLowerCase();
  if (accept.includes('application/json')) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  // Rota HTML: redireciona pra login
  const next_url = encodeURIComponent(req.originalUrl);
  res.redirect(`/dashboard/login?next=${next_url}`);
}

// Define o cookie de sessao apos login bem-sucedido.
export function setSessionCookie(res: Response): void {
  const token = gerarTokenSessao();
  // SameSite=Strict pra zero CSRF nesse fluxo (Junior so usa direto, sem fluxo cross-origin).
  // Secure: cookie nao envia em HTTP. Em dev local sem TLS, removeria — mas
  // dashboard sempre roda atras do Easypanel/Traefik com HTTPS.
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${COOKIE_TTL_DAYS * 24 * 60 * 60}`,
  );
}

// Limpa cookie de sessao (logout).
export function clearSessionCookie(res: Response): void {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
  );
}

// Compara senha digitada com DASHBOARD_PASSWORD em tempo constante (timing-safe).
export function senhaValida(senha: string): boolean {
  const expected = process.env.DASHBOARD_PASSWORD ?? '';
  if (!expected) return false;
  if (senha.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(senha), Buffer.from(expected));
}
