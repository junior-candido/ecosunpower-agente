// src/modules/dashboard/servicos-zap.ts
// Textos do WhatsApp do Diário de Serviços — usados no aviso automático da
// atribuição (#182) e no botão 📤 Enviar pelo zap. Funções puras, sem banco.
import type { ServicoRow } from './servicos-store.js';
import { GUIAS_FOTOS } from './servicos-views.js';

const dataBr = (iso: string) => iso.split('-').reverse().join('/');

/** Aviso pro atribuído (mesmo texto do zap automático da atribuição). */
export function textoAvisoServico(s: ServicoRow, linkServico: string | null): string {
  return `🔧 Novo serviço pra você: ${s.tipoNome} — ${s.clienteNome}, dia ${dataBr(s.dataServico)}.` +
    (linkServico ? `\nAbra pra ver o guia de fotos: ${linkServico}` : '\nAbra a tela Serviços no dashboard pra ver o guia.');
}

// ===== Template aprovado pro aviso (bug 05/08) =====
// Fora da janela 24h a Cloud API aceita texto livre e DESCARTA em silêncio
// (tela verde, celular mudo). Funcionário de campo quase nunca tem janela
// aberta com o número da Eva → aviso por TEMPLATE chega sempre.

export const TEMPLATE_AVISO_SERVICO = 'aviso_servico_v1';

/** Parâmetros {{1}}..{{3}} do corpo (o link vai no BOTÃO de URL dinâmico). */
export function paramsTemplateAvisoServico(s: ServicoRow): string[] {
  return [s.tipoNome, s.clienteNome, dataBr(s.dataServico)];
}

export interface ComponenteTemplateAviso {
  type: 'body' | 'button';
  sub_type?: 'url';
  index?: number;
  parameters: Array<{ type: 'text'; text: string }>;
}

export interface CanaisAviso {
  sendText: (to: string, text: string) => Promise<unknown>;
  sendTemplate?: (
    to: string,
    name: string,
    lang: string,
    components: ComponenteTemplateAviso[],
  ) => Promise<unknown>;
}

/**
 * Envia o aviso pro time: template quando o canal é a API oficial; texto
 * normal quando não há template (Evolution) ou como fallback se o template
 * falhar (ex.: ainda não aprovado pela Meta). O template tem botão de URL
 * dinâmico ("Guia de fotos e vídeos") — o id do serviço é OBRIGATÓRIO como
 * parâmetro do botão, senão a Meta recusa o envio.
 */
export async function enviarAvisoServico(
  canais: CanaisAviso,
  tel: string,
  s: ServicoRow,
  linkServico: string | null,
): Promise<void> {
  if (canais.sendTemplate) {
    try {
      await canais.sendTemplate(tel, TEMPLATE_AVISO_SERVICO, 'pt_BR', [
        {
          type: 'body',
          parameters: paramsTemplateAvisoServico(s).map((t) => ({ type: 'text' as const, text: t })),
        },
        {
          type: 'button',
          sub_type: 'url',
          index: 0,
          parameters: [{ type: 'text' as const, text: s.id }],
        },
      ]);
      return;
    } catch (err) {
      console.warn('[servicos] template do aviso falhou, caindo pro texto livre:', (err as Error).message);
    }
  }
  await canais.sendText(tel, textoAvisoServico(s, linkServico));
}

/** "Só as informações" (sem acesso): tipo, cliente, endereço e o guia numerado. */
export function textoInfoServico(s: ServicoRow, endereco: string | null): string {
  const guia = GUIAS_FOTOS[s.tipoId];
  return `🔧 Serviço: ${s.tipoNome}\n👤 Cliente: ${s.clienteNome}\n📅 Dia ${dataBr(s.dataServico)}` +
    (endereco ? `\n📍 ${endereco}` : '') +
    (s.observacoes ? `\n📝 ${s.observacoes}` : '') +
    (guia ? `\n\n📷 Fotos pra tirar:\n${guia.map((i, n) => `${n + 1}. ${i}`).join('\n')}` : '');
}
