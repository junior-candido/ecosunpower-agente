// src/modules/email/captura-email.ts
//
// CAPTURA DE E-MAIL NA CONVERSA DO WHATSAPP.
//
// Por que existe (auditoria de 07/09/2026): a máquina de e-mail funciona bem —
// 744 enviados, zero falha, inscrição automática em 263 ms — mas só alcança
// **171 dos 705 leads**. Os outros 534 não têm e-mail. E o motivo é simples:
// todo e-mail que a base tem veio do formulário do Meta. A assistente nunca
// pediu e-mail na conversa, e ninguém percebia quando o lead mandava um.
//
// Isso aqui é a rede passiva: se a pessoa escrever um e-mail em QUALQUER
// momento da conversa, a gente guarda. Não depende da IA lembrar de pedir nem
// de emitir ação nenhuma — é o caminho que não falha. O pedido explícito
// (instrução no prompt) é o complemento, não o alicerce.
//
// Roda no caminho de TODA mensagem recebida, então a regra é: NUNCA lançar.
// Derrubar o atendimento pra tentar salvar um e-mail seria péssimo negócio.

/**
 * Endereços que NÃO são do cliente, mesmo aparecendo na mensagem dele.
 * O caso real: a pessoa cola o e-mail que RECEBEU da gente ("veio de
 * contato@news...") — gravar isso faria a jornada mandar e-mail pra nós mesmos.
 */
const REMETENTES_AUTOMATICOS = /^(no-?reply|nao-?responda|contato@news\.|noreply)/i;

/** Extrai o primeiro e-mail de verdade da mensagem. Null se não houver. */
export function extrairEmailDoTexto(texto: string): string | null {
  const t = String(texto ?? '');
  if (!t) return null;

  // Exige algo antes do @ (evita casar "@ecosunpower" de rede social) e um
  // TLD de pelo menos 2 letras.
  const achados = t.match(/[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}/g);
  if (!achados) return null;

  for (const bruto of achados) {
    // Pontuação grudada no fim ("ana@x.com." / "ana@x.com,") nao faz parte.
    const limpo = bruto.replace(/[.,;:!?)\]}>'"]+$/, '').toLowerCase();
    const local = limpo.split('@')[0];
    if (REMETENTES_AUTOMATICOS.test(limpo) || REMETENTES_AUTOMATICOS.test(local)) continue;
    return limpo;
  }
  return null;
}

export type CapturaDeps = {
  leadJaTemEmail: (leadId: string) => Promise<boolean>;
  salvarEmail: (leadId: string, email: string, origem: string) => Promise<boolean>;
  inscreverNaJornada: (leadId: string) => Promise<void>;
  /** Empresa dona da jornada de e-mail (os modelos, a logo, a assinatura). */
  empresaDaJornada: string;
};

export type ResultadoCaptura = {
  capturado: boolean;
  inscrito?: boolean;
  email?: string;
  motivo?: 'sem_email' | 'ja_tinha' | 'sem_lead' | 'erro';
};

/**
 * Guarda o e-mail que o lead escreveu na conversa e, quando for lead da
 * empresa dona da jornada, inscreve na régua de e-mail.
 *
 * 🔒 A trava de empresa é o ponto mais importante daqui. Os 6 modelos da
 * jornada, a logo e a assinatura são da EcoSunPower. Inscrever lead de outro
 * tenant (Conquista Solar, por exemplo) faria os clientes da Jimena receberem
 * e-mail da EcoSunPower — vazamento de marca e de base de uma vez só. O
 * e-mail é salvo na ficha (é dado dela, e útil), mas a jornada não roda.
 */
export async function capturarEmailDaConversa(
  deps: CapturaDeps,
  entrada: { leadId: string; texto: string; companyId?: string | null },
): Promise<ResultadoCaptura> {
  try {
    if (!entrada.leadId) return { capturado: false, motivo: 'sem_lead' };

    const email = extrairEmailDoTexto(entrada.texto);
    if (!email) return { capturado: false, motivo: 'sem_email' };

    // Não sobrescreve: o e-mail que já está lá pode ter vindo do formulário do
    // anúncio, e a pessoa pode estar citando o de outra pessoa na conversa.
    if (await deps.leadJaTemEmail(entrada.leadId)) return { capturado: false, motivo: 'ja_tinha' };

    const salvou = await deps.salvarEmail(entrada.leadId, email, 'conversa');
    if (!salvou) return { capturado: false, motivo: 'erro' };

    // companyId ausente = comportamento de sempre (EcoSun).
    const daJornada = !entrada.companyId || entrada.companyId === deps.empresaDaJornada;
    if (!daJornada) {
      console.log(`[captura-email] ${email} salvo, mas SEM jornada (empresa ${entrada.companyId})`);
      return { capturado: true, inscrito: false, email };
    }

    try {
      await deps.inscreverNaJornada(entrada.leadId);
      console.log(`[captura-email] ${email} capturado na conversa e inscrito na jornada`);
      return { capturado: true, inscrito: true, email };
    } catch (err) {
      // E-mail salvo é o que importa; a inscrição tem um sweep de hora em hora
      // que pega esse lead depois (inscreverLeadsElegiveisEmail).
      console.warn('[captura-email] salvou mas nao inscreveu:', (err as Error)?.message);
      return { capturado: true, inscrito: false, email };
    }
  } catch (err) {
    console.warn('[captura-email] falhou (ignorado):', (err as Error)?.message);
    return { capturado: false, motivo: 'erro' };
  }
}
