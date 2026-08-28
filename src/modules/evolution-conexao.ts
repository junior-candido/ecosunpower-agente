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
