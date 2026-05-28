// Fetch com timeout dedicado pros adapters de monitoramento.
//
// Antes: cada adapter (deye, solaredge, nep) duplicava ~12 linhas de
// AbortController + setTimeout + try/finally pra evitar travar o cron quando
// o portal da marca está lento. Agora todos chamam este helper.
//
// Comportamento — preserva exatamente o que os adapters faziam antes:
//   - 30s default (configurável via param ms)
//   - aborta via AbortController quando timer dispara
//   - timer sempre limpo (finally), mesmo em throw
//   - rejeições são re-lançadas pelo caller (cada adapter trata o erro do seu
//     jeito, com mensagens em português + classificação invalidCredentials).

export const DEFAULT_TIMEOUT_MS = 30_000;

export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  ms: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
