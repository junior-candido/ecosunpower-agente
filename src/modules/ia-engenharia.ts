import type Anthropic from '@anthropic-ai/sdk';
import { medirIa } from './custos/ia-metering.js';

export interface DadosEngenharia {
  nomeCliente?: string;
  consumoMensalKwh: number;
  potenciaKwp: number;
  geracaoMensalKwh: number;
  economiaMensalRs: number;
  investimentoRs: number;
  paybackAnos: number | null;
}

export function montarPromptEngenharia(dados: DadosEngenharia): string {
  const fmtRs = (n: number) =>
    'R$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  const saudacao = dados.nomeCliente ? `o cliente ${dados.nomeCliente}` : 'o cliente';
  const paybackTxt = dados.paybackAnos !== null
    ? `${dados.paybackAnos.toFixed(1)} anos`
    : 'não calculado (economia insuficiente)';

  return [
    `Você é um assistente de engenharia solar da EcoSunPower.`,
    `Explique de forma simples e amigável para ${saudacao} os números do sistema solar proposto.`,
    ``,
    `Dados do sistema:`,
    `- Consumo atual: ${dados.consumoMensalKwh} kWh/mês`,
    `- Sistema proposto: ${dados.potenciaKwp} kWp`,
    `- Geração estimada: ${Math.round(dados.geracaoMensalKwh)} kWh/mês`,
    `- Economia mensal: ${fmtRs(dados.economiaMensalRs)}/mês`,
    `- Investimento: ${fmtRs(dados.investimentoRs)}`,
    `- Payback estimado: ${paybackTxt}`,
    ``,
    `Use linguagem clara, sem jargão técnico. Máximo 3 parágrafos curtos. Foco no benefício financeiro.`,
  ].join('\n');
}

export async function explicarEconomia(
  anthropic: Anthropic,
  dados: DadosEngenharia,
): Promise<string> {
  const prompt = montarPromptEngenharia(dados);
  const resp = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });
  medirIa({ modelo: 'claude-haiku-4-5-20251001', origem: 'ia-engenharia', usage: resp.usage });
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');
}
