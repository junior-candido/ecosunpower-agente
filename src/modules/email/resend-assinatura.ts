// Confere a assinatura svix que a Resend manda em todo webhook.
// Sem isso, qualquer um que descobrisse a URL poderia forjar um "e-mail
// recebido" — agora que o webhook grava demonstrativo de GD (consumo e credito
// do cliente), isso deixa de ser aceitavel. Padrao svix:
//   assinado = `${svix-id}.${svix-timestamp}.${corpo bruto}`
//   assinatura = base64(HMAC-SHA256(chave, assinado)), chave = base64 do segredo sem "whsec_"
//   cabecalho svix-signature = "v1,<assinatura> v1,<outra>" (rotacao de segredo)

import { createHmac, timingSafeEqual } from 'node:crypto';

export type ResultadoAssinatura = 'ok' | 'sem_segredo' | 'invalida';

const TOLERANCIA_S = 5 * 60;

export function conferirAssinaturaResend(p: {
  segredo: string | undefined;
  corpoBruto: string | undefined;
  headers: Record<string, string | string[] | undefined>;
  agoraS?: number;
}): ResultadoAssinatura {
  if (!p.segredo) return 'sem_segredo';
  const h = (k: string) => {
    const v = p.headers[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const id = h('svix-id');
  const ts = h('svix-timestamp');
  const sig = h('svix-signature');
  if (!id || !ts || !sig || p.corpoBruto === undefined) return 'invalida';

  const agora = p.agoraS ?? Math.floor(Date.now() / 1000);
  const tsN = Number(ts);
  if (!Number.isFinite(tsN) || Math.abs(agora - tsN) > TOLERANCIA_S) return 'invalida';

  let chave: Buffer;
  try {
    chave = Buffer.from(p.segredo.replace(/^whsec_/, ''), 'base64');
  } catch {
    return 'invalida';
  }
  const esperado = createHmac('sha256', chave).update(`${id}.${ts}.${p.corpoBruto}`).digest();

  for (const parte of sig.split(' ')) {
    const [versao, valor] = parte.split(',');
    if (versao !== 'v1' || !valor) continue;
    const recebido = Buffer.from(valor, 'base64');
    if (recebido.length === esperado.length && timingSafeEqual(recebido, esperado)) return 'ok';
  }
  return 'invalida';
}
