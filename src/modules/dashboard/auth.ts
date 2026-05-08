// Auth basico HTTP pro dashboard interno EcoSun.
// Senha unica via env DASHBOARD_PASSWORD. Junior define no Easypanel.
// Browser pede senha 1x e mantem em cache da sessao — sem necessidade de
// login form, cookies de sessao ou bcrypt nessa V1.

import type { Request, Response, NextFunction } from 'express';

export function dashboardBasicAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) {
    res.status(503).send(
      '<h2>Dashboard nao configurado</h2><p>Defina DASHBOARD_PASSWORD no Easypanel.</p>'
    );
    return;
  }

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="EcoSun Dashboard"');
    res.status(401).send('Autenticacao necessaria');
    return;
  }

  let decoded: string;
  try {
    decoded = Buffer.from(auth.slice(6), 'base64').toString('utf-8');
  } catch {
    res.set('WWW-Authenticate', 'Basic realm="EcoSun Dashboard"');
    res.status(401).send('Auth header invalido');
    return;
  }

  const idx = decoded.indexOf(':');
  if (idx < 0) {
    res.set('WWW-Authenticate', 'Basic realm="EcoSun Dashboard"');
    res.status(401).send('Auth header sem senha');
    return;
  }

  const senha = decoded.slice(idx + 1);
  if (senha !== expected) {
    res.set('WWW-Authenticate', 'Basic realm="EcoSun Dashboard"');
    res.status(401).send('Senha invalida');
    return;
  }

  next();
}
