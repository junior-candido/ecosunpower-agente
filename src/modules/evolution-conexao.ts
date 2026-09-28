// src/modules/evolution-conexao.ts
// Conexão self-service do WhatsApp do tenant (fatia "Conectar WhatsApp", 28/08).
// Fala direto com a Evolution API pra (1) saber o estado da instância e
// (2) pedir um QR novo (+ pairing code quando o número é conhecido). Puro:
// recebe fetch injetável pra teste e NUNCA expõe a apikey pra fora.
//
// Lição do onboarding da Conquista (28/08): pairing code só funciona com o
// número EXATO do WhatsApp (com/sem 9º dígito), e o "Get Pairing Code" do
// Manager gera sem número → sempre inválido. Aqui o QR é o caminho principal;
// o pairing code é extra, gerado com o número que o tenant informou.

// 'inexistente' = a Evolution não conhece a instância (404) · 'erro' = 401/5xx/timeout.
export type EstadoConexao = 'open' | 'connecting' | 'close' | 'inexistente' | 'erro' | 'desconhecido';

export interface ConexaoEvolutionDeps {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export interface QrConexao {
  base64?: string;       // "data:image/png;base64,..." pronto pro <img>
  pairingCode?: string;  // só quando `numero` foi informado e a Evolution devolveu
  estado: EstadoConexao;
}

const NOME_INSTANCIA_OK = /^[a-zA-Z0-9_-]{1,64}$/;

export function instanciaValida(instancia: string | undefined | null): instancia is string {
  return typeof instancia === 'string' && NOME_INSTANCIA_OK.test(instancia);
}

// Número pra pairing code: só dígitos, DDI+DDD+número (10 a 15 dígitos).
export function normalizarNumeroPairing(bruto: string | undefined | null): string | undefined {
  const d = String(bruto ?? '').replace(/\D/g, '');
  return d.length >= 10 && d.length <= 15 ? d : undefined;
}

function normalizarEstado(v: unknown): EstadoConexao {
  return v === 'open' || v === 'connecting' || v === 'close' ? v : 'desconhecido';
}

export async function estadoConexao(deps: ConexaoEvolutionDeps, instancia: string): Promise<EstadoConexao> {
  if (!instanciaValida(instancia)) return 'desconhecido';
  const f = deps.fetchImpl ?? fetch;
  let r: Response;
  try {
    r = await f(`${deps.baseUrl.replace(/\/$/, '')}/instance/connectionState/${encodeURIComponent(instancia)}`, {
      headers: { apikey: deps.apiKey },
      signal: AbortSignal.timeout(8000),
    });
  } catch { return 'erro'; }
  if (r.status === 404) return 'inexistente';
  if (!r.ok) return 'erro';
  const j = (await r.json().catch(() => null)) as { instance?: { state?: unknown } } | null;
  return normalizarEstado(j?.instance?.state);
}

// GET /instance/connect/{instancia}[?number=...] — a Evolution devolve
// { pairingCode, code, base64, count } enquanto NÃO está conectada; quando já
// está "open" devolve outra coisa (ou 4xx) — aí só reportamos o estado.
export async function obterQrConexao(
  deps: ConexaoEvolutionDeps,
  instancia: string,
  numero?: string,
): Promise<QrConexao> {
  if (!instanciaValida(instancia)) return { estado: 'desconhecido' };
  const estado = await estadoConexao(deps, instancia);
  if (estado === 'open' || estado === 'inexistente' || estado === 'erro') return { estado };
  const f = deps.fetchImpl ?? fetch;
  const qs = numero ? `?number=${encodeURIComponent(numero)}` : '';
  let r: Response;
  try {
    r = await f(`${deps.baseUrl.replace(/\/$/, '')}/instance/connect/${encodeURIComponent(instancia)}${qs}`, {
      headers: { apikey: deps.apiKey },
      signal: AbortSignal.timeout(8000),
    });
  } catch { return { estado: 'erro' }; }
  if (r.status === 404) return { estado: 'inexistente' };
  if (!r.ok) return { estado };
  const j = (await r.json().catch(() => null)) as { base64?: unknown; pairingCode?: unknown; instance?: { state?: unknown } } | null;
  // Conectou entre as duas chamadas: a Evolution responde o connectionState.
  if (j?.instance?.state === 'open') return { estado: 'open' };
  const base64 = typeof j?.base64 === 'string' && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(j.base64) ? j.base64 : undefined;
  const pairingCode = typeof j?.pairingCode === 'string' && /^[A-Z0-9]{8}$/i.test(j.pairingCode) ? j.pairingCode.toUpperCase() : undefined;
  return { base64, pairingCode, estado: 'connecting' };
}

// ---------------------------------------------------------------------------
// Atendimento P2b (28/09/2026): o WhatsApp PESSOAL do dono também entra por QR.
// Aqui só se CRIA a instância na Evolution (e, se der, o webhook dela). O QR e
// o estado usam as mesmas funções de cima. Nunca expõe a apikey.
// ---------------------------------------------------------------------------

export type ResultadoCriacao =
  | { ok: true; jaExistia: boolean; webhook: 'ok' | 'falhou' | 'nao_pedido' }
  | { ok: false; motivo: 'nome_invalido' | 'erro' };

/**
 * POST /instance/create (Evolution v2: integração Baileys + QR). Instância que
 * já existe (403/409 "already in use") conta como pronta. Com `webhookUrl`,
 * também aponta o webhook dela (POST /webhook/set) — se falhar, a tela avisa e
 * vale o webhook global da Evolution (o mesmo das instâncias dos tenants).
 */
export async function criarInstancia(
  deps: ConexaoEvolutionDeps,
  instancia: string,
  webhookUrl?: string,
  webhookToken?: string,
): Promise<ResultadoCriacao> {
  if (!instanciaValida(instancia)) return { ok: false, motivo: 'nome_invalido' };
  const f = deps.fetchImpl ?? fetch;
  const base = deps.baseUrl.replace(/\/$/, '');
  let jaExistia = false;
  try {
    const r = await f(`${base}/instance/create`, {
      method: 'POST',
      headers: { apikey: deps.apiKey, 'Content-Type': 'application/json' },
      // syncFullHistory: ao ler o QR o celular manda o histórico (messages.set) —
      // o número pessoal importa os últimos 90 dias (numero-pessoal-historico.ts).
      body: JSON.stringify({ instanceName: instancia, qrcode: true, integration: 'WHATSAPP-BAILEYS', syncFullHistory: true }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      if ((r.status === 403 || r.status === 409) && /already|exist|in use/i.test(txt)) jaExistia = true;
      else return { ok: false, motivo: 'erro' };
    }
  } catch {
    return { ok: false, motivo: 'erro' };
  }
  if (!webhookUrl) return { ok: true, jaExistia, webhook: 'nao_pedido' };
  return { ok: true, jaExistia, webhook: await apontarWebhook(deps, instancia, webhookUrl, webhookToken) };
}

/** Eventos que o número pessoal assina: mensagem nova + o HISTÓRICO que chega ao ler o QR. */
export const EVENTOS_PESSOAL = ['MESSAGES_UPSERT', 'MESSAGES_SET'] as const;

/** POST /webhook/set — token no CABEÇALHO (nunca na URL: log do proxy, tela da Evolution). */
export async function apontarWebhook(deps: ConexaoEvolutionDeps, instancia: string, webhookUrl: string, webhookToken?: string): Promise<'ok' | 'falhou'> {
  if (!instanciaValida(instancia)) return 'falhou';
  const f = deps.fetchImpl ?? fetch;
  try {
    const w = await f(`${deps.baseUrl.replace(/\/$/, '')}/webhook/set/${encodeURIComponent(instancia)}`, {
      method: 'POST',
      headers: { apikey: deps.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhook: {
        enabled: true, url: webhookUrl, byEvents: false, base64: false, events: [...EVENTOS_PESSOAL],
        ...(webhookToken ? { headers: { 'x-webhook-token': webhookToken } } : {}),
      } }),
      signal: AbortSignal.timeout(15000),
    });
    return w.ok ? 'ok' : 'falhou';
  } catch {
    return 'falhou';
  }
}

// ---------------------------------------------------------------------------
// Histórico do número pessoal (28/09/2026). O WhatsApp só manda o histórico
// quando o aparelho é CONECTADO (leitura do QR) com a sincronização completa
// ligada. Então "Buscar histórico" = ligar a opção, assinar o evento e
// desconectar — o dono lê o QR de novo UMA vez. Evolution v2:
//   POST /settings/set/{inst}   (todos os campos obrigatórios: lê os atuais antes)
//   POST /webhook/set/{inst}    (MESSAGES_UPSERT + MESSAGES_SET)
//   DELETE /instance/logout/{inst}
// ---------------------------------------------------------------------------

export type ResultadoPedidoHistorico =
  | { ok: true; webhook: 'ok' | 'falhou' | 'nao_pedido'; desconectou: boolean }
  | { ok: false; motivo: 'nome_invalido' | 'config_falhou' };

const AJUSTES_PADRAO = { rejectCall: false, groupsIgnore: false, alwaysOnline: false, readMessages: false, readStatus: false };

export async function pedirHistoricoCompleto(
  deps: ConexaoEvolutionDeps,
  instancia: string,
  webhookUrl?: string,
  webhookToken?: string,
): Promise<ResultadoPedidoHistorico> {
  if (!instanciaValida(instancia)) return { ok: false, motivo: 'nome_invalido' };
  const f = deps.fetchImpl ?? fetch;
  const base = deps.baseUrl.replace(/\/$/, '');
  const inst = encodeURIComponent(instancia);
  // 1) Liga a sincronização completa SEM mexer nos outros ajustes do dono (o
  //    schema da v2 exige todos: lê os atuais; sem leitura, valores neutros —
  //    readMessages=false: nunca marca como lida no celular dele).
  let atuais: Record<string, unknown> = {};
  try {
    const r = await f(`${base}/settings/find/${inst}`, { headers: { apikey: deps.apiKey }, signal: AbortSignal.timeout(8000) });
    if (r.ok) atuais = ((await r.json().catch(() => null)) as Record<string, unknown> | null) ?? {};
  } catch { /* segue com o padrão */ }
  const bool = (k: keyof typeof AJUSTES_PADRAO) => (typeof atuais[k] === 'boolean' ? atuais[k] as boolean : AJUSTES_PADRAO[k]);
  const ajustes: Record<string, unknown> = {
    rejectCall: bool('rejectCall'), groupsIgnore: bool('groupsIgnore'), alwaysOnline: bool('alwaysOnline'),
    readMessages: bool('readMessages'), readStatus: bool('readStatus'), syncFullHistory: true,
  };
  if (typeof atuais.msgCall === 'string' && atuais.msgCall) ajustes.msgCall = atuais.msgCall;
  try {
    const r = await f(`${base}/settings/set/${inst}`, {
      method: 'POST',
      headers: { apikey: deps.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(ajustes),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return { ok: false, motivo: 'config_falhou' };
  } catch {
    return { ok: false, motivo: 'config_falhou' };
  }
  // 2) Assina o evento do histórico.
  const webhook = webhookUrl ? await apontarWebhook(deps, instancia, webhookUrl, webhookToken) : 'nao_pedido' as const;
  // 3) Desconecta: o QR aparece de novo e, ao ler, o celular manda o histórico.
  let desconectou = false;
  try {
    const r = await f(`${base}/instance/logout/${inst}`, { method: 'DELETE', headers: { apikey: deps.apiKey }, signal: AbortSignal.timeout(15000) });
    // Já desconectada também serve (a Evolution responde 4xx "not connected").
    desconectou = r.ok || r.status === 400 || r.status === 404;
  } catch { /* a tela mostra o estado real */ }
  return { ok: true, webhook, desconectou };
}

/**
 * Mensagens que a Evolution JÁ GUARDOU desta instância (POST /chat/findMessages,
 * paginado; mais novas primeiro). Traz o que chegou antes de o webhook assinar o
 * histórico — a Evolution NÃO reenvia no messages.set o que ela já guardou.
 * `null` = a Evolution não respondeu.
 */
export async function mensagensGuardadas(
  deps: ConexaoEvolutionDeps,
  instancia: string,
  p: { desdeIso: string; ateIso: string; pagina: number; porPagina: number },
): Promise<{ registros: Array<Record<string, unknown>>; paginas: number } | null> {
  if (!instanciaValida(instancia)) return null;
  const f = deps.fetchImpl ?? fetch;
  try {
    const r = await f(`${deps.baseUrl.replace(/\/$/, '')}/chat/findMessages/${encodeURIComponent(instancia)}`, {
      method: 'POST',
      headers: { apikey: deps.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ where: { messageTimestamp: { gte: p.desdeIso, lte: p.ateIso } }, page: p.pagina, offset: p.porPagina }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return null;
    const j = (await r.json().catch(() => null)) as { messages?: { pages?: unknown; records?: unknown } } | null;
    const registros = Array.isArray(j?.messages?.records) ? (j!.messages!.records as Array<Record<string, unknown>>) : [];
    const paginas = typeof j?.messages?.pages === 'number' ? j.messages.pages : 0;
    return { registros, paginas };
  } catch {
    return null;
  }
}

