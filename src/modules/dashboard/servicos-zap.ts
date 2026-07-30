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

/** "Só as informações" (sem acesso): tipo, cliente, endereço e o guia numerado. */
export function textoInfoServico(s: ServicoRow, endereco: string | null): string {
  const guia = GUIAS_FOTOS[s.tipoId];
  return `🔧 Serviço: ${s.tipoNome}\n👤 Cliente: ${s.clienteNome}\n📅 Dia ${dataBr(s.dataServico)}` +
    (endereco ? `\n📍 ${endereco}` : '') +
    (s.observacoes ? `\n📝 ${s.observacoes}` : '') +
    (guia ? `\n\n📷 Fotos pra tirar:\n${guia.map((i, n) => `${n + 1}. ${i}`).join('\n')}` : '');
}
