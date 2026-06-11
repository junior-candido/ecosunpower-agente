import {
  qualifyByConta,
  qualifyByRegion,
  qualifyByPerfil,
} from './ig-qualifier-filters.js';
import { empresa } from '../empresa-config.js';

export type QualifyStep =
  | 'start'
  | 'await_tipo'
  | 'await_cidade'
  | 'await_conta'
  | 'await_handoff'
  | 'handed_off'
  | 'disqualified'
  | 'escalated_human';

export interface QualifyState {
  step: QualifyStep;
  data: { tipo?: string; cidade?: string; faixa_conta?: string; tag?: string };
}

export interface NextStepResult {
  next: QualifyState;
  message: string;
  quickReplies?: { title: string; payload: string }[];
}

const ESCALATION_KEYWORDS = [
  'quero falar com uma pessoa',
  'humano',
  'reclamacao',
  'reclamação',
  'aneel',
  'processo',
  'advogado',
];

function shouldEscalate(text: string): boolean {
  const t = text.toLowerCase();
  return ESCALATION_KEYWORDS.some((k) => t.includes(k));
}

// [ECOSOF] Telefone do WhatsApp do negócio vem da empresa_config (lido em
// runtime no handoff — função, não const capturada no load).
// Retorna null quando telefone não configurado (clone sem chip) — caller deve omitir o link.
const waPhone = () => empresa().telefoneAtendente;

export function nextStep(state: QualifyState, input: string): NextStepResult {
  if (shouldEscalate(input) && state.step !== 'start') {
    return {
      next: { ...state, step: 'escalated_human' },
      message: 'Claro! Vou avisar nossa equipe pra te atender.',
    };
  }

  switch (state.step) {
    case 'start':
      return {
        next: { step: 'await_tipo', data: {} },
        message:
          `Oi! 👋 Aqui é a ${empresa().nomeAtendente} da ${empresa().nomeFantasia}. Você quer reduzir a conta de luz da sua CASA, do seu COMÉRCIO ou tem uma situação diferente?`,
        quickReplies: [
          { title: '🏠 Casa', payload: 'casa' },
          { title: '🏪 Comércio', payload: 'comercio' },
          { title: '🏞️ Sítio', payload: 'sitio' },
          { title: '⚡ Outro', payload: 'outro' },
        ],
      };

    case 'await_tipo': {
      const perfil = qualifyByPerfil(input);
      if (!perfil.qualified)
        return {
          next: { ...state, step: 'disqualified' },
          message:
            'Entendi. Hoje nosso foco é instalação de painéis em casas, comércios e sítios. Não trabalhamos com aluguel/arrendamento de terra. Obrigada pelo contato!',
        };

      const tipo = input.toLowerCase().trim();
      return {
        next: { step: 'await_cidade', data: { ...state.data, tipo } },
        message:
          'Top! Você está em qual cidade? (Atendemos Brasília-DF e Goiás até 100 km do Entorno)',
      };
    }

    case 'await_cidade': {
      const r = qualifyByRegion(input);
      if (!r.qualified)
        return {
          next: { ...state, step: 'disqualified' },
          message: r.reason ?? 'Fora da nossa região hoje.',
        };

      return {
        next: { step: 'await_conta', data: { ...state.data, cidade: input } },
        message: 'Perfeito, atendemos! Quanto vem por mês mais ou menos sua conta de luz?',
        quickReplies: [
          { title: `até R$ ${empresa().criterioLeadValor}`, payload: 'ate_700' },
          { title: `R$ ${empresa().criterioLeadValor}-1500`, payload: '700_1500' },
          { title: 'R$ 1500-3000', payload: '1500_3000' },
          { title: 'acima R$ 3000', payload: 'acima_3000' },
        ],
      };
    }

    case 'await_conta': {
      const r = qualifyByConta(input);
      if (!r.qualified) {
        return {
          next: { ...state, step: 'disqualified' },
          message:
            `Pro seu perfil de consumo hoje, o solar não trás economia que justifique o investimento. Quando sua conta passar de R$ ${empresa().criterioLeadValor}/mês, pode chegar de novo que a gente faz o estudo. Por enquanto, recomendo focar em economizar (LED, geladeira A+, etc).`,
        };
      }
      return {
        next: { step: 'await_handoff', data: { ...state.data, faixa_conta: input, tag: r.tag } },
        message:
          'Show, esse perfil tem economia muito boa. Pra eu te enviar uma simulação personalizada em 5 minutos com fotos do material que usamos, posso continuar o atendimento no WhatsApp?',
        quickReplies: [
          { title: '✅ Pode sim', payload: 'sim' },
          { title: '❌ Prefiro aqui', payload: 'nao' },
        ],
      };
    }

    case 'await_handoff': {
      if (input.toLowerCase().includes('sim') || input === 'sim') {
        const ctxText = `Vim do Instagram. Tipo: ${state.data.tipo}, Cidade: ${state.data.cidade}, Faixa: ${state.data.faixa_conta}`;
        const phone = waPhone();
        const linkMsg = phone
          ? `Clica aqui pra continuar no WhatsApp:\nhttps://wa.me/${phone}?text=${encodeURIComponent(ctxText)}\n\nVou te aguardar lá.`
          : 'Vou pedir pro nosso time te chamar no WhatsApp em breve!';
        return {
          next: { ...state, step: 'handed_off' },
          message: `Perfeito! ${linkMsg}`,
        };
      }
      return {
        next: { ...state, step: 'escalated_human' },
        message: 'Sem problema! Vou pedir pro Junior te atender por aqui mesmo. Aguarda só um momento.',
      };
    }

    default:
      return { next: state, message: 'Conversa encerrada.' };
  }
}
