// src/modules/monitoring/abordagem/escada.ts
// PURO: o "roteiro" de cada situação. Cada degrau diz ao redator O QUE a
// mensagem precisa alcançar — o texto em si é escrito pela IA com os dados
// reais e as regras de treino do Junior.
import type { AbordagemTipo } from './tipos.js';
import { empresa, interpolarEmpresa } from '../../empresa-config.js';

export interface Degrau { etapa: number; objetivo: string }

// [ECOSOF] Os objetivos usam placeholders {{nome_atendente}}/{{empresa_nome}},
// resolvidos em objetivoDoDegrau() com a empresa() lida em RUNTIME (a const de
// módulo nunca captura o nome da empresa).
export const ESCADAS: Record<AbordagemTipo, Degrau[]> = {
  depoimento: [
    { etapa: 1, objetivo: 'Primeira geração acima do esperado da vida da usina: comemorar com o cliente usando os números reais e pedir, com leveza, um depoimento (áudio, texto ou vídeo) sobre a experiência com a {{empresa_nome}}.' },
  ],
  parabens: [
    { etapa: 1, objetivo: 'Parabéns trimestral: contar quanto a usina gerou no trimestre (kWh) e quanto isso representa de economia (R$ — números fornecidos, NUNCA calcular), agradecer a confiança na {{empresa_nome}} e lembrar que a {{nome_atendente}} é o canal de suporte: qualquer dúvida, é só chamar aqui.' },
  ],
  queda: [
    { etapa: 1, objetivo: 'Apresentar-se como consultora da {{empresa_nome}} que acompanha o monitoramento, avisar que a geração caiu (usar o % real fornecido) e fazer perguntas de diagnóstico: faz tempo que não limpa as placas? Teve obra, sombra nova ou algum problema que saiba? Tom de cuidado, não de cobrança.' },
    { etapa: 2, objetivo: 'Com base na resposta, explicar que limpeza costuma recuperar boa parte da geração e oferecer o serviço da {{empresa_nome}} — SEM falar valor. Se o cliente topar, avisar que vai passar pro Junior fechar os detalhes.' },
    { etapa: 3, objetivo: 'Lembrete educado e curto: retomar a conversa sobre a queda de geração sem repetir tudo, perguntando se pode ajudar. Uma vez só.' },
  ],
  offline: [
    { etapa: 1, objetivo: 'Avisar que a usina está sem enviar dados há X dias (número real fornecido) e guiar pelas causas comuns (internet nova, senha do wifi trocada, luz do aparelhinho perto do inversor apagada), fazendo UMA pergunta por mensagem, começando pela mais provável. Se houver causa raiz de outra vez, começar por ela.' },
    { etapa: 2, objetivo: 'Os passos simples não resolveram: oferecer visita técnica da {{empresa_nome}} (SEM falar valor), explicando com simplicidade por que o monitoramento ligado protege a geração e o investimento do cliente.' },
    { etapa: 3, objetivo: 'Lembrete educado e curto: a usina segue sem monitorar, perguntar se conseguiu olhar os passos ou se quer ajuda. Uma vez só.' },
  ],
};

export function objetivoDoDegrau(tipo: AbordagemTipo, etapa: number): string {
  const escada = ESCADAS[tipo];
  const d = escada.find((x) => x.etapa === etapa);
  return interpolarEmpresa((d ?? escada[escada.length - 1]).objetivo, empresa());
}
