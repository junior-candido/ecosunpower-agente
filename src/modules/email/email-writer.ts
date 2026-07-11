import { aplicarTravaPreco } from './price-lock.js';

export type WriterCtx = {
  step: number;
  tema: string;
  nome?: string;
  cidade?: string;
  oQuePediu?: string;
  empresa?: string; // CLONE-READY: nome/descritor da empresa vem da config, nao hardcoded
};

/**
 * Gera assunto + abertura personalizados via Claude Haiku, com trava de preco:
 * se a IA cravar preco/parcela/valor, cai pro texto padrao (seguro).
 */
export async function gerarAssuntoAbertura(
  anthropic: any,
  ctx: WriterCtx,
  assuntoPadrao: string,
): Promise<{ assunto: string; abertura: string }> {
  const empresa = ctx.empresa && ctx.empresa.trim() ? ctx.empresa.trim() : 'a empresa de energia solar';
  const system =
    `Voce escreve e-mails curtos e humanos para ${empresa}. ` +
    'NUNCA cite preco, valor em reais, parcelas ou numeros de economia. ' +
    'Responda EXATAMENTE no formato:\nASSUNTO: <ate 60 caracteres>\nABERTURA: <1 frase>';
  const user =
    `Tema do e-mail (step ${ctx.step}): ${ctx.tema}\n` +
    `Lead: nome=${ctx.nome ?? ''}, cidade=${ctx.cidade ?? ''}, pediu=${ctx.oQuePediu ?? ''}`;

  let assunto = assuntoPadrao;
  let abertura = '';
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const txt = (resp.content.find((b: any) => b.type === 'text')?.text ?? '') as string;
    const mA = txt.match(/ASSUNTO:\s*(.+)/i);
    const mB = txt.match(/ABERTURA:\s*(.+)/i);
    if (mA) assunto = mA[1].trim();
    if (mB) abertura = mB[1].trim();
  } catch (err) {
    console.warn('[email-writer] IA falhou, usando padrao:', (err as Error)?.message);
  }

  // Trava de preco: se a IA cravou valor, cai pro seguro.
  assunto = aplicarTravaPreco(assunto, assuntoPadrao);
  abertura = aplicarTravaPreco(abertura, '');

  return { assunto, abertura };
}
