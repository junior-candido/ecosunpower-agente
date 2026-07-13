import type Anthropic from '@anthropic-ai/sdk';
import { medirIa } from './custos/ia-metering.js';

export type EtapaFunil =
  | 'novo'
  | 'qualificando'
  | 'qualificado'
  | 'agendado'
  | 'proposta_enviada'
  | 'negociacao';

export type TipoMensagem = 'primeiro_contato' | 'follow_up' | 'reativacao';

export interface DadosComercial {
  nomeLead: string;
  etapa: EtapaFunil;
  tipoMensagem: TipoMensagem;
  contexto?: string;
  economiaMensalRs?: number;
}

export function montarPromptComercial(dados: DadosComercial): string {
  const fmtRs = (n: number) =>
    'R$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

  const economiaLinha = dados.economiaMensalRs
    ? `- Economia mensal estimada: ${fmtRs(dados.economiaMensalRs)}/mês`
    : null;

  const contextoLinha = dados.contexto
    ? `- Contexto: ${dados.contexto}`
    : null;

  const linhas = [
    `Você é um assistente comercial da EcoSunPower especializado em energia solar.`,
    `Gere um rascunho de mensagem para o lead ${dados.nomeLead}.`,
    ``,
    `Dados:`,
    `- Etapa no funil: ${dados.etapa}`,
    `- Tipo de mensagem: ${dados.tipoMensagem}`,
    contextoLinha,
    economiaLinha,
    ``,
    `Regras:`,
    `- Tom amigável e profissional, sem pressão`,
    `- Linguagem simples, sem jargão técnico`,
    `- Máximo 5 linhas curtas (formato WhatsApp)`,
    `- Focar no benefício para o cliente, não no produto`,
    `- Não inventar números que não foram fornecidos`,
  ].filter((l): l is string => l !== null);

  return linhas.join('\n');
}

export async function gerarMensagemComercial(
  anthropic: Anthropic,
  dados: DadosComercial,
): Promise<string> {
  const prompt = montarPromptComercial(dados);
  const resp = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });
  medirIa({ modelo: 'claude-haiku-4-5-20251001', origem: 'ia-comercial', usage: resp.usage });
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');
}
