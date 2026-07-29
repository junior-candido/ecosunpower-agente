// src/modules/infinitepay.ts
// Cliente do Checkout Integrado da InfinitePay. Contrato confirmado AO VIVO
// (29/07): POST /links gera o link de pagamento só com o handle PÚBLICO (sem
// segredo); POST /payment_check confirma se pagou. Preços SEMPRE em centavos.
//
// ⚠️ SEGURANÇA: o webhook da InfinitePay NÃO é assinado (sem HMAC). Nunca
// confie no payload cru — `webhookConfirmado` reconfirma com o payment_check E
// exige que o valor pago bata com o esperado (senão qualquer POST forjado
// marcaria "pago").

const BASE = 'https://api.checkout.infinitepay.io';
const TIMEOUT_MS = 15_000;

type FetchLike = (url: string, init?: {
  method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal;
}) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

// tira o "$" do handle: é só o prefixo visual, a API quer sem.
const limparHandle = (h: string) => h.trim().replace(/^\$/, '');

// ============================================================================
// PUROS (testáveis sem rede)
// ============================================================================

export interface ItemCobranca { descricao: string; valorCentavos: number; quantidade?: number }
export interface CriarLinkParams {
  handle: string;
  orderNsu: string;
  itens: ItemCobranca[];
  redirectUrl?: string;
  webhookUrl?: string;
  cliente?: { nome?: string; email?: string; telefone?: string };
}

export function montarCorpoLink(p: CriarLinkParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    handle: limparHandle(p.handle),
    order_nsu: p.orderNsu,
    items: p.itens.map((i) => ({
      quantity: i.quantidade ?? 1,
      price: Math.round(i.valorCentavos),
      description: i.descricao,
    })),
  };
  if (p.redirectUrl) body.redirect_url = p.redirectUrl;
  if (p.webhookUrl) body.webhook_url = p.webhookUrl;
  if (p.cliente) {
    body.customer = { name: p.cliente.nome, email: p.cliente.email, phone_number: p.cliente.telefone };
  }
  return body;
}

export function parseRespostaLink(json: unknown): string | null {
  const url = (json as { url?: unknown } | null)?.url;
  return typeof url === 'string' && url ? url : null;
}

export interface CheckParams { handle: string; orderNsu: string; transactionNsu: string; slug: string }

export function montarCorpoCheck(p: CheckParams): Record<string, unknown> {
  return {
    handle: limparHandle(p.handle),
    order_nsu: p.orderNsu,
    transaction_nsu: p.transactionNsu,
    slug: p.slug,
  };
}

export interface ResultadoCheck { pago: boolean; valorCentavos?: number; pagoCentavos?: number; parcelas?: number; metodo?: string }

export function parseRespostaCheck(json: unknown): ResultadoCheck {
  const j = (json ?? {}) as Record<string, unknown>;
  return {
    pago: j.paid === true,
    valorCentavos: typeof j.amount === 'number' ? j.amount : undefined,
    pagoCentavos: typeof j.paid_amount === 'number' ? j.paid_amount : undefined,
    parcelas: typeof j.installments === 'number' ? j.installments : undefined,
    metodo: typeof j.capture_method === 'string' ? j.capture_method : undefined,
  };
}

// ============================================================================
// REDE
// ============================================================================

async function postJson(fetchImpl: FetchLike, path: string, corpo: Record<string, unknown>): Promise<{ ok: boolean; status: number; json: unknown }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetchImpl(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(corpo),
      signal: ctrl.signal,
    });
    const json = await resp.json().catch(() => null);
    return { ok: resp.ok, status: resp.status, json };
  } finally {
    clearTimeout(timer);
  }
}

export type CriarLinkResult = { ok: true; url: string } | { ok: false; reason: string };

export async function criarLinkPagamento(p: CriarLinkParams, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<CriarLinkResult> {
  try {
    const r = await postJson(fetchImpl, '/links', montarCorpoLink(p));
    if (!r.ok) return { ok: false, reason: `InfinitePay /links HTTP ${r.status}: ${JSON.stringify(r.json).slice(0, 160)}` };
    const url = parseRespostaLink(r.json);
    if (!url) return { ok: false, reason: 'InfinitePay /links sem url na resposta' };
    return { ok: true, url };
  } catch (err) {
    return { ok: false, reason: `network: InfinitePay ${(err as Error).message}` };
  }
}

export type VerificarResult = { ok: true } & ResultadoCheck | { ok: false; reason: string };

export async function verificarPagamento(p: CheckParams, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<VerificarResult> {
  try {
    const r = await postJson(fetchImpl, '/payment_check', montarCorpoCheck(p));
    if (!r.ok) return { ok: false, reason: `InfinitePay /payment_check HTTP ${r.status}` };
    return { ok: true, ...parseRespostaCheck(r.json) };
  } catch (err) {
    return { ok: false, reason: `network: InfinitePay ${(err as Error).message}` };
  }
}

// ============================================================================
// WEBHOOK — blindagem anti-fraude (sem HMAC → reconfirma no payment_check)
// ============================================================================

export interface WebhookInfinitePay {
  order_nsu: string;
  transaction_nsu: string;
  invoice_slug: string;
  amount?: number;
  paid_amount?: number;
  capture_method?: string;
}

export type VerificarFn = (p: { orderNsu: string; transactionNsu: string; slug: string }) =>
  Promise<{ ok: boolean; pago?: boolean; pagoCentavos?: number; metodo?: string }>;

/**
 * Confirma um webhook: reconsulta o payment_check (o webhook não é assinado) e
 * exige que o valor pago seja >= o esperado. `verificar` já vem com o handle
 * amarrado (closure sobre a config), por isso não recebe handle aqui.
 */
export async function webhookConfirmado(
  wh: WebhookInfinitePay,
  valorEsperadoCentavos: number,
  verificar: VerificarFn,
): Promise<{ confirmado: boolean; metodo?: string; pagoCentavos?: number }> {
  const r = await verificar({ orderNsu: wh.order_nsu, transactionNsu: wh.transaction_nsu, slug: wh.invoice_slug });
  if (!r.ok || !r.pago) return { confirmado: false };
  if (typeof r.pagoCentavos === 'number' && r.pagoCentavos < valorEsperadoCentavos) return { confirmado: false };
  return { confirmado: true, metodo: r.metodo, pagoCentavos: r.pagoCentavos };
}
