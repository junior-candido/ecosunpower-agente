// src/modules/dashboard/cobrar-rotas.ts
// "Cobrar cliente" (InfinitePay): a tela /cobrar e os dois POST que ela chama
// (/cobrancas = link único, /cobrancas/par = Pix + cartão). Saíram do router.ts
// (R20) pra serem testados com req/res falsos — o router só monta.
//
// Cria a cobrança PENDENTE + o link. O cliente paga → o webhook /webhook/
// infinitepay confirma e marca "pago". Pré-preenche os dados do lead pra o
// cliente não redigitar. Os POST respondem JSON com o link (o front mostra/copia).

import type { Request, Response, Router, RequestHandler } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthedRequest } from './auth.js';
import { bancoDoOperador } from '../tenant-client.js';
import { acharLeadPorTelefone } from './cobrancas-store.js';
import { montarParDeLinks } from '../cobranca-forma.js';
import { criarLinkPagamento as criarLinkPadrao } from '../infinitepay.js';
import { renderCobrarPage } from './cobrar-views.js';

export interface DepsCobrar {
  /** Cliente do Supabase (service) — as leituras de lead passam por bancoDoOperador. */
  supabase: SupabaseClient;
  /** Grava a cobrança (tabela cobrancas) e o link — métodos do SupabaseService. */
  cobrancas: {
    criarCobranca(dados: { companyId: string | null; leadId?: string | null; descricao: string; valorCentavos: number; formaCombinada?: string | null; taxaPct?: number | null; valorLiquidoCentavos?: number | null }): Promise<{ id: string; orderNsu: string }>;
    salvarLinkCobranca(id: string, linkUrl: string): Promise<void>;
  };
  infinitepayHandle?: string;
  appBaseUrl?: string;
  criarLinkPagamento?: typeof criarLinkPadrao;
}

type Handler = (req: Request, res: Response) => Promise<void> | void;

export function rotaTelaCobrar(d: DepsCobrar): Handler {
  return (req, res) => {
    const off = !d.infinitepayHandle;
    res.type('html').send(renderCobrarPage({ off, user: (req as AuthedRequest).dashUser }));
  };
}

export function rotaCobrancaUnica(d: DepsCobrar): Handler {
  const criarLinkPagamento = d.criarLinkPagamento ?? criarLinkPadrao;
  const supabase = d.supabase;
  return async (reqBruto, res) => {
    const req = reqBruto as AuthedRequest;
    try {
      const handle = d.infinitepayHandle;
      if (!handle) { res.status(503).json({ erro: 'Cobrança não configurada (falta INFINITEPAY_HANDLE).' }); return; }
      const descricao = String(req.body?.descricao ?? '').trim();
      // aceita "1.234,56" (pt-BR) ou "1234.56"
      const valorReais = Number(String(req.body?.valor ?? '').replace(/\./g, '').replace(',', '.'));
      let leadId = req.body?.lead_id ? String(req.body.lead_id) : null;
      if (!descricao) { res.status(400).json({ erro: 'Descrição obrigatória.' }); return; }
      if (!(valorReais > 0)) { res.status(400).json({ erro: 'Valor inválido.' }); return; }
      const valorCentavos = Math.round(valorReais * 100);
      const companyId = req.dashUser!.companyId;
      const telefone = String(req.body?.telefone ?? '').trim();

      let cliente: { nome?: string; email?: string; telefone?: string } | undefined;
      if (leadId) {
        // lead pelo crachá do operador (RLS Fase B) — não vaza lead de outra empresa
        const db = bancoDoOperador(req, supabase);
        const { data: lead } = await db.from('leads').select('name, email, phone')
          .eq('id', leadId).eq('company_id', companyId).maybeSingle();
        // R20: lead de OUTRA empresa (ou que não existe) não entra na cobrança.
        // Antes o id seguia gravado mesmo sem achar o lead.
        if (!lead) { res.status(404).json({ erro: 'Lead não encontrado.' }); return; }
        cliente = { nome: (lead as { name?: string }).name ?? undefined, email: (lead as { email?: string }).email ?? undefined, telefone: (lead as { phone?: string }).phone ?? undefined };
      } else if (telefone) {
        // telefone digitado na página → vincula ao lead (variantes do 9º dígito)
        const lead = await acharLeadPorTelefone(bancoDoOperador(req, supabase), companyId, telefone);
        if (lead) { leadId = lead.id; cliente = { nome: lead.nome, email: lead.email, telefone: lead.telefone }; }
        else cliente = { telefone: telefone.replace(/\D/g, '') || undefined }; // sem lead: ao menos pré-preenche o checkout
      }

      const cob = await d.cobrancas.criarCobranca({ companyId, leadId, descricao, valorCentavos });
      const base = (d.appBaseUrl ?? '').replace(/\/$/, '');
      const r = await criarLinkPagamento({
        handle, orderNsu: cob.orderNsu, itens: [{ descricao, valorCentavos }],
        redirectUrl: base ? `${base}/pago` : undefined,
        webhookUrl: base ? `${base}/webhook/infinitepay` : undefined,
        cliente,
      });
      if (!r.ok) { res.status(502).json({ erro: `Falha ao gerar link: ${r.reason}` }); return; }
      await d.cobrancas.salvarLinkCobranca(cob.id, r.url);
      res.json({ ok: true, link: r.url, cobrancaId: cob.id });
    } catch (err) {
      console.error('[dashboard/cobrancas]', err);
      res.status(500).json({ erro: 'Falha ao criar cobrança.' });
    }
  };
}

// PAR de links (repasse "na unha"): Pix no valor líquido + cartão N× com a
// taxa da MAQUININHA embutida (JUROS_CARTAO_SERVICO — fonte única). Preço
// calculado NO SERVIDOR (nunca confia na conta do navegador).
export function rotaCobrancaPar(d: DepsCobrar): Handler {
  const criarLinkPagamento = d.criarLinkPagamento ?? criarLinkPadrao;
  const supabase = d.supabase;
  return async (reqBruto, res) => {
    const req = reqBruto as AuthedRequest;
    try {
      const handle = d.infinitepayHandle;
      if (!handle) { res.status(503).json({ erro: 'Cobrança não configurada (falta INFINITEPAY_HANDLE).' }); return; }
      const descricao = String(req.body?.descricao ?? '').trim();
      const liquidoReais = Number(String(req.body?.liquido ?? '').replace(/\./g, '').replace(',', '.'));
      const parcelas = Math.min(12, Math.max(2, Number(req.body?.parcelas ?? 12) || 12));
      const telefone = String(req.body?.telefone ?? '').replace(/\D/g, '');
      if (!descricao) { res.status(400).json({ erro: 'Descrição obrigatória.' }); return; }
      if (!(liquidoReais > 0)) { res.status(400).json({ erro: 'Valor inválido.' }); return; }
      const liquidoCentavos = Math.round(liquidoReais * 100);
      const companyId = req.dashUser!.companyId;

      // lead pelo telefone (mesma mágica do link único)
      let leadId: string | null = null;
      let cliente: { nome?: string; email?: string; telefone?: string } | undefined;
      if (telefone) {
        const lead = await acharLeadPorTelefone(bancoDoOperador(req, supabase), companyId, telefone);
        if (lead) { leadId = lead.id; cliente = { nome: lead.nome, email: lead.email, telefone: lead.telefone }; }
        else cliente = { telefone };
      }

      const par = montarParDeLinks(liquidoCentavos, parcelas);
      const base = (d.appBaseUrl ?? '').replace(/\/$/, '');
      const saida: { forma: string; valorCentavos: number; parcelaCentavos?: number; link: string }[] = [];
      for (const item of [
        { ...par.pix, sufixo: ' (no Pix)' },
        { ...par.cartao, sufixo: ` (no cartão em até ${parcelas}×, taxas incluídas)` },
      ]) {
        const cob = await d.cobrancas.criarCobranca({
          companyId, leadId, descricao: descricao + item.sufixo, valorCentavos: item.valorCentavos,
          formaCombinada: item.forma, taxaPct: item.taxaPct, valorLiquidoCentavos: liquidoCentavos,
        });
        const r = await criarLinkPagamento({
          handle, orderNsu: cob.orderNsu, itens: [{ descricao: descricao + item.sufixo, valorCentavos: item.valorCentavos }],
          redirectUrl: base ? `${base}/pago` : undefined,
          webhookUrl: base ? `${base}/webhook/infinitepay` : undefined,
          cliente,
        });
        if (!r.ok) { res.status(502).json({ erro: `Falha ao gerar link (${item.forma}): ${r.reason}` }); return; }
        await d.cobrancas.salvarLinkCobranca(cob.id, r.url);
        saida.push({ forma: item.forma, valorCentavos: item.valorCentavos, parcelaCentavos: item.parcelaCentavos, link: r.url });
      }
      res.json({ ok: true, liquidoCentavos, parcelas, links: saida });
    } catch (err) {
      console.error('[dashboard/cobrancas/par]', err);
      res.status(500).json({ erro: 'Falha ao criar o par de cobranças.' });
    }
  };
}

/**
 * Monta no router do painel (mesmas rotas de antes). `exigir` é o portão de
 * papel do router — R20: antes as três rotas não pediam papel nenhum (qualquer
 * usuário logado, até o papel Campo, gerava link de pagamento). Agora: ver o
 * financeiro abre a tela; gerar link pede financeiro:editar.
 */
export function montarRotasCobrar(
  router: Router,
  d: DepsCobrar,
  exigir: (area: 'financeiro', nivel: 'visualizar' | 'editar') => RequestHandler,
): void {
  router.post('/cobrancas', exigir('financeiro', 'editar'), rotaCobrancaUnica(d) as RequestHandler);
  router.post('/cobrancas/par', exigir('financeiro', 'editar'), rotaCobrancaPar(d) as RequestHandler);
  // Página simples pra gerar uma cobrança (descrição + valor → link).
  router.get('/cobrar', exigir('financeiro', 'visualizar'), rotaTelaCobrar(d) as RequestHandler);
}
