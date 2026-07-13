// src/modules/pdf-guard.ts
// Guarda pra PDF pesado não TRAVAR a Eva. O Claude aceita PDF até ~32MB/100
// páginas, mas um PDF "com muita coisa" (base64 enorme) faz a chamada demorar
// demais — e sem timeout o SDK fica esperando minutos, deixando a Eva parada.
// Aqui: (1) barramos PDF acima de um limite prático e (2) expomos um timeout
// curto pras chamadas de IA falharem rápido em vez de pendurar a mensagem.

// Conta de luz / comprovante real é bem pequeno (< 2MB). 12MB deixa folga pra
// contas escaneadas pesadas, mas barra catálogos/manuais gigantes que travam.
export const PDF_MAX_BYTES = 12 * 1024 * 1024;

// Timeout por chamada de IA com PDF. Passado como request option do SDK
// (client.messages.create(body, { timeout })). Melhor errar rápido e avisar do
// que deixar a Eva muda.
export const PDF_TIMEOUT_MS = 90_000;

/** Tamanho aproximado (em bytes) de um conteúdo base64, sem decodificar. */
export function tamanhoBase64Bytes(base64: string | null | undefined): number {
  if (!base64) return 0;
  const s = String(base64);
  const len = s.length;
  const padding = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((len * 3) / 4) - padding);
}

/** true se o PDF é grande demais pra ler com segurança (evita travar a Eva). */
export function pdfGrandeDemais(base64: string | null | undefined, maxBytes = PDF_MAX_BYTES): boolean {
  return tamanhoBase64Bytes(base64) > maxBytes;
}

/** Bytes em MB, arredondado, pra mensagens amigáveis. */
export function bytesParaMB(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}
