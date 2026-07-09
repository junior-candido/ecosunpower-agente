// Retry pra erros PASSAGEIROS (transitórios) dos fabricantes.
//
// Problema real: quando o servidor da marca dá um tropeço momentâneo (502/503/
// 504, queda de rede), o adapter registra `ultimo_erro` e a usina fica "com
// erro" até o próximo ciclo do cron — que pra micro (NEP) é 1× por dia. Um
// blip de 2 minutos deles = 24h no vermelho pra nós, sem nenhuma re-tentativa.
//
// Este helper repete a operação algumas vezes, com espera crescente (backoff),
// ENQUANTO o resultado for classificado como transitório pelo `isTransient`.
// Para assim que estabiliza (sucesso ou erro definitivo, ex: 401) ou esgota as
// tentativas — devolvendo o último resultado (o caller trata como sempre).
//
// Opera sobre o RESULTADO (não sobre exceção) porque os adapters de monitoramento
// nunca lançam: eles capturam o erro e retornam `{ ok: false, ... }`. Assim o
// caller (nepPost, deye, etc) continua com a mesma forma de retorno.

// Status HTTP que indicam tropeço PASSAGEIRO do servidor do fabricante (vale
// re-tentar): 429 = rate limit; 500/502/503/504 = backend indisponível / gateway
// sem upstream. 401/403 NÃO entram aqui (é credencial — cada adapter tem seu
// fluxo de refresh de token).
export const TRANSIENT_HTTP_STATUS = new Set([429, 500, 502, 503, 504]);

// Classificador PADRÃO de falha passageira, compartilhado por todos os adapters
// de monitoramento. Um resultado é passageiro (vale repetir) quando NÃO é de
// credencial e é 5xx/429 OU queda de rede/timeout (reason começa com "network:").
// Os adapters devolvem `{ ok:false, status?, reason?, invalidCredentials? }` —
// pra 5xx pegarem, o adapter precisa setar `status` no ramo de erro HTTP.
export function isTransientFailure(r: {
  ok: boolean;
  status?: number;
  reason?: string;
  invalidCredentials?: boolean;
}): boolean {
  if (r.ok) return false;
  if (r.invalidCredentials) return false;
  if (typeof r.status === 'number' && TRANSIENT_HTTP_STATUS.has(r.status)) return true;
  return typeof r.reason === 'string' && r.reason.startsWith('network:');
}

export interface RetryOpts {
  /** Nº de RE-tentativas após a 1ª execução. Default 2 → até 3 execuções. */
  retries?: number;
  /** Atraso (ms) antes da re-tentativa `tentativa` (0-based). Default: backoff exponencial 500ms→1s→2s. */
  delayMs?: (tentativa: number) => number;
  /** Injetável pra teste (evita esperar de verdade). Default: setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const defaultDelay = (tentativa: number): number => 500 * 2 ** tentativa;

export async function retryTransient<T>(
  fn: () => Promise<T>,
  isTransient: (result: T) => boolean,
  opts: RetryOpts = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const delayMs = opts.delayMs ?? defaultDelay;
  const sleep = opts.sleep ?? defaultSleep;

  let resultado = await fn();
  for (let tentativa = 0; tentativa < retries && isTransient(resultado); tentativa++) {
    await sleep(delayMs(tentativa));
    resultado = await fn();
  }
  return resultado;
}
