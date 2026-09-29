// src/modules/dashboard/custo-ia-rota.ts
// GET /dashboard/custo-ia — SÓ admin da casa. Tenant (qualquer papel) leva 403:
// custo da casa e de outras empresas nunca aparece pra empresa cliente.
import type { Response } from 'express';
import type { AuthedRequest } from './auth.js';
import { can } from './permissions.js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';
import { carregarDadosCustoIa } from './custo-ia-queries.js';
import { montarPainelCustoIa } from './custo-ia-calc.js';
import { renderCustoIaPage } from './custo-ia-views.js';

export function podeVerCustoIa(u: AuthedRequest['dashUser']): boolean {
  return !!u && u.companyId === ECOSUN_COMPANY_ID && can(u, 'usuarios', 'administrar');
}

export function criarRotaCustoIa(client: unknown, agora: () => Date = () => new Date()) {
  return async function rotaCustoIa(req: AuthedRequest, res: Response): Promise<void> {
    if (!podeVerCustoIa(req.dashUser)) { res.status(403).send('Sem permissão'); return; }
    try {
      const quando = agora();
      const dados = await carregarDadosCustoIa(client, quando);
      const pedido = Number(req.query.alerta);
      const painel = montarPainelCustoIa({ ...dados, agora: quando, alertaPct: Number.isFinite(pedido) && pedido > 0 ? pedido : 40 });
      res.type('html').send(renderCustoIaPage(painel, req.dashUser));
    } catch (err) {
      console.error('[custo-ia]', err);
      res.status(500).send('Não consegui montar o custo de IA agora');
    }
  };
}
