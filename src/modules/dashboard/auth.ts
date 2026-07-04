// Auth do dashboard: login por pessoa + cookie de sessão HMAC carregando o user_id.
// Cookie 'ecosun_dash_token' = `<userId>.<exp>.<hmac(userId.exp)>`. 60 dias.
// Assinado com META_APP_SECRET (fallback DASHBOARD_PASSWORD).

import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DashUser } from './permissions.js';
import { getUserById } from './users-store.js';

const COOKIE_NAME = 'ecosun_dash_token';
const COOKIE_TTL_DAYS = 60;

function getSecret(): string {
  return process.env.META_APP_SECRET ?? process.env.DASHBOARD_PASSWORD ?? 'fallback-mude-isso';
}

function assinar(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
}

export function gerarTokenSessao(userId: string): string {
  const exp = Date.now() + COOKIE_TTL_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${userId}.${exp}`;
  return `${payload}.${assinar(payload)}`;
}

// Valida assinatura + expiração e devolve o userId, ou null.
export function lerUserIdDoToken(token: string): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  if (!userId || !/^\d+$/.test(exp) || !/^[a-f0-9]{64}$/i.test(sig)) return null;
  const expected = assinar(`${userId}.${exp}`);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'))) return null;
  } catch {
    return null;
  }
  if (parseInt(exp, 10) <= Date.now()) return null;
  return userId;
}

function lerCookieToken(req: Request): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const p of raw.split(';')) {
    const t = p.trim();
    if (t.startsWith(COOKIE_NAME + '=')) return decodeURIComponent(t.slice(COOKIE_NAME.length + 1));
  }
  return null;
}

// Estende o Request com o usuário logado.
export interface AuthedRequest extends Request {
  dashUser?: DashUser;
}

// Cria o middleware de sessão. Precisa do supabase pra carregar o usuário do token.
export function criarSessionAuth(client: SupabaseClient) {
  return async function dashboardSessionAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
    const token = lerCookieToken(req);
    const userId = token ? lerUserIdDoToken(token) : null;
    if (userId) {
      const user = await getUserById(client, userId);
      if (user) {
        req.dashUser = user;
        next();
        return;
      }
    }
    const accept = (req.headers.accept ?? '').toLowerCase();
    if (accept.includes('application/json')) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    res.redirect(`/dashboard/login?next=${encodeURIComponent(req.originalUrl)}`);
  };
}

// manter=true (padrão): cookie persistente de 60 dias. manter=false (usuário
// desmarcou "Continuar conectado" no login): cookie de sessão — sem Max-Age,
// morre quando o navegador fecha (bom pra computador emprestado).
export function setSessionCookie(res: Response, userId: string, manter = true): void {
  const token = gerarTokenSessao(userId);
  const base = `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict`;
  res.setHeader('Set-Cookie', manter ? `${base}; Max-Age=${COOKIE_TTL_DAYS * 24 * 60 * 60}` : base);
}

export function clearSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}
