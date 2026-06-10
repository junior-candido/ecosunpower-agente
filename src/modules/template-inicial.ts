// src/modules/template-inicial.ts
// Abertura de conversa via template aprovado WABA. Lead de formulario Meta
// NUNCA mandou mensagem pra gente => janela 24h fechada => a Cloud API rejeita
// texto livre (erro 131047). A primeira mensagem TEM que ser template aprovado.
// Mesmo padrao do auto-ack (index.ts ~3358) e da cadencia (cadence.ts ~313):
// tenta o template pedido; se a Meta devolver 132001 ("does not exist"), cai
// pro fallback aprovado `reativacao_lead_v1`. Todos os templates roteados aqui
// tem 1 variavel de body {{1}} = primeiro nome.

export const TEMPLATE_FALLBACK = 'reativacao_lead_v1';

// Subconjunto estrutural de TemplateComponent (meta-whatsapp.ts) que este
// modulo produz — so body com 1 parametro de texto. Mantido compativel por
// atribuicao estrutural pra nao acoplar no MetaWhatsAppService inteiro.
export interface TemplateBodyComponent {
  type: 'body';
  parameters: Array<{ type: 'text'; text: string }>;
}

export interface TemplateSender {
  sendTemplate(
    to: string,
    name: string,
    lang: string,
    components: TemplateBodyComponent[],
  ): Promise<{ messageId: string }>;
}

function primeiroNome(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] || 'tudo bem';
}

function isTemplateInexistente(err: unknown): boolean {
  // postMessage lanca Error, mas nao confia: string/objeto cru nao pode quebrar
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /\b132001\b|does not exist/i.test(msg);
}

export async function enviarTemplateInicial(
  sender: TemplateSender,
  phone: string,
  fullName: string | null | undefined,
  templateName: string,
): Promise<{ templateUsado: string }> {
  const components: TemplateBodyComponent[] = [
    { type: 'body', parameters: [{ type: 'text', text: primeiroNome(fullName) }] },
  ];
  try {
    await sender.sendTemplate(phone, templateName, 'pt_BR', components);
    return { templateUsado: templateName };
  } catch (err) {
    if (templateName !== TEMPLATE_FALLBACK && isTemplateInexistente(err)) {
      await sender.sendTemplate(phone, TEMPLATE_FALLBACK, 'pt_BR', components);
      return { templateUsado: TEMPLATE_FALLBACK };
    }
    throw err;
  }
}
