// src/modules/dashboard/pos-venda-mensagens.ts
// Redação manual dos botões de pós-venda: (a) o OBJETIVO que entra no prompt do
// redator da Eva e (b) uma mensagem de FALLBACK pronta (caso a IA falhe/offline),
// sempre nos números reais do cliente. PURO — testável.
import type { AcaoManual } from './pos-venda-saude.js';
import { empresa } from '../empresa-config.js';

const OBJETIVOS: Record<Exclude<AcaoManual, 'contato'>, string> = {
  parabens: 'Parabenizar pelo marco/aniversário da usina e reforçar que estamos por perto.',
  relatorio: 'Mandar o resumo do período: quanto a usina gerou e quanto isso representou de economia.',
  limpeza: 'Oferecer uma limpeza/manutenção preventiva das placas pra manter a geração no talo.',
  depoimento: 'Pedir, com leveza, um depoimento/avaliação sobre a experiência com a usina.',
  upgrade: 'Sondar interesse em ampliar o sistema (mais placas/bateria/carregador) com base no consumo atual.',
};

export function objetivoManual(tipo: Exclude<AcaoManual, 'contato'>): string {
  return OBJETIVOS[tipo];
}

export interface CtxMensagem {
  nome: string;
  trimestre: { kwh: number; reais: number } | null;
}

const primeiroNome = (n: string) => (n.trim().split(/\s+/)[0] || 'tudo bem');
const assinatura = () => `${empresa().nomeAtendente}, da ${empresa().nomeFantasia}`;

// Mensagens de segurança (a IA é tentada antes; isto cobre falha/offline).
// REGRA: nunca falar preço de serviço; só usar números que vieram prontos.
export function fallbackMensagem(tipo: Exclude<AcaoManual, 'contato'>, c: CtxMensagem): string {
  const nome = primeiroNome(c.nome);
  switch (tipo) {
    case 'parabens':
      return `Oi ${nome}! 🎉 Passando só pra comemorar mais um marco da sua usina com a gente. Tá tudo certo por aí com a geração? Qualquer coisa é só chamar. — ${assinatura()}`;
    case 'relatorio':
      return c.trimestre
        ? `Oi ${nome}! ☀️ No período sua usina gerou ${c.trimestre.kwh} kWh, o que representou cerca de R$ ${c.trimestre.reais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} de economia. Tô à disposição se quiser entender algum detalhe. — ${assinatura()}`
        : `Oi ${nome}! ☀️ Passando pra te mandar um resumo de como sua usina vem rendendo. Quer que eu te explique os números do período? — ${assinatura()}`;
    case 'limpeza':
      return `Oi ${nome}! 🧹 Notei que pode ser um bom momento pra uma limpeza/manutenção preventiva das placas, pra manter a geração no talo. Posso te explicar como funciona? — ${assinatura()}`;
    case 'depoimento':
      return `Oi ${nome}! ⭐ Se a experiência com a sua usina tem sido boa, você toparia deixar um depoimento rapidinho? Ajuda demais outras famílias a decidirem. — ${assinatura()}`;
    case 'upgrade':
      return `Oi ${nome}! 🔋 Reparei que seu consumo cresceu — talvez valha a pena pensar em ampliar o sistema (placas, bateria ou carregador). Quer que eu te mostre as opções? — ${assinatura()}`;
  }
}
