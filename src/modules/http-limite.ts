// src/modules/http-limite.ts
// Ler a resposta de um fetch SEM estourar a memória: para no limite (W1 —
// mídia recebida no WhatsApp pode ter até 2 GB; o painel guarda até 16 MB).

/** Corpo inteiro até `limite` bytes; passou disso (ou o content-length já diz que passa) → null. */
export async function lerCorpoComLimite(res: Response, limite: number): Promise<Buffer | null> {
  const cl = Number(res.headers?.get?.('content-length'));
  if (Number.isFinite(cl) && cl > limite) {
    try { await res.body?.cancel(); } catch { /* nada */ }
    return null;
  }
  if (!res.body || typeof res.body.getReader !== 'function') {
    const b = Buffer.from(await res.arrayBuffer());
    return b.length > limite ? null : b;
  }
  const leitor = res.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      try { await leitor.cancel(); } catch { /* nada */ }
      return null;
    }
    partes.push(value);
  }
  return Buffer.concat(partes);
}
