// src/modules/dashboard/pos-venda-copiloto.ts
// Cérebro do copiloto de PÓS-VENDA. Espelha ia-copiloto.ts, mas com tom de
// relacionamento e a base conhecimento/pos-venda.md. Módulo puro (testável);
// só responderCopilotoPosVenda faz I/O (chamada à API).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type Anthropic from '@anthropic-ai/sdk';

let _cache: string | null = null;
/** Lê conhecimento/pos-venda.md (com cache). Vazio se não achar. */
export function carregarConhecimentoPosVenda(): string {
  if (_cache !== null) return _cache;
  // este arquivo fica em (src|dist)/modules/dashboard -> sobe 3 níveis até a raiz
  const here = dirname(fileURLToPath(import.meta.url));
  const candidatos = [
    join(here, '..', '..', '..', 'conhecimento', 'pos-venda.md'),
    join(process.cwd(), 'conhecimento', 'pos-venda.md'),
  ];
  for (const p of candidatos) {
    try { _cache = readFileSync(p, 'utf-8'); return _cache; } catch { /* próximo */ }
  }
  _cache = '';
  return _cache;
}

export interface ContextoPosVenda {
  nome?: string;
  cidade?: string;
  potenciaKwp?: number;
  marcaInversor?: string;
  dataInstalacao?: string;
  temMonitoramento: boolean;   // false = usina sem monitoramento na plataforma
  geracaoResumo?: string;      // ex: "Últimos 30 dias: 450 kWh". Só quando há dados reais.
  jaTeveDepoimento?: boolean;
}

export interface MensagemCopiloto { role: 'user' | 'assistant'; conteudo: string; }

/** System prompt: Eva consultora de pós-venda + dados da usina + regra de texto limpo. PURA. */
export function montarSystemPromptPosVenda(ctx: ContextoPosVenda, conhecimento?: string): string {
  const dados = [
    ctx.nome ? `- Cliente: ${ctx.nome}` : null,
    ctx.cidade ? `- Cidade: ${ctx.cidade}` : null,
    ctx.potenciaKwp ? `- Usina: ${ctx.potenciaKwp} kWp` : null,
    ctx.marcaInversor ? `- Inversor: ${ctx.marcaInversor}` : null,
    ctx.dataInstalacao ? `- Instalada em: ${ctx.dataInstalacao}` : null,
    ctx.geracaoResumo ? `- Geração REAL (do monitoramento): ${ctx.geracaoResumo}` : null,
    ctx.jaTeveDepoimento != null ? `- Já deu depoimento: ${ctx.jaTeveDepoimento ? 'sim' : 'não'}` : null,
  ].filter((l): l is string => l !== null);

  const linhas = [
    `Você é a Eva, consultora de pós-venda da EcoSunPower (energia solar), ajudando a EQUIPE (o operador) a cuidar de um cliente que JÁ tem usina instalada.`,
    `Quando pedirem uma mensagem pro cliente, entregue PRONTA pra enviar no WhatsApp: curta, calorosa, tom de relacionamento (não de venda).`,
    `REGRA ABSOLUTA DE FORMATO: texto natural de WhatsApp. NUNCA use asterisco (*) e NUNCA use colchete ([ ]). Nada de markdown nem campos pra preencher.`,
    `REGRA DE OURO (VERACIDADE): NUNCA invente nem afirme número de geração ou economia. Só use número que esteja nos dados abaixo OU que o OPERADOR tenha colado nesta conversa (se ele colou antes, use e diga de quando é).`,
    ctx.temMonitoramento && ctx.geracaoResumo
      ? `Há geração REAL acima. Use esses números: se a geração estiver boa, parabenize citando-os; se caiu, NÃO parabenize — ofereça ajuda (limpeza/visita) mencionando a queda real.`
      : `ATENÇÃO: você NÃO tem os números reais de geração desta usina ${ctx.temMonitoramento ? '(o monitoramento não trouxe dados recentes)' : '(usina sem monitoramento na plataforma)'}. Se pedirem relatório/parabéns e o operador AINDA NÃO colou os dados nesta conversa, NÃO escreva mensagem pro cliente. Em vez disso, responda PRO OPERADOR exatamente: "Não tenho os números reais dessa usina aqui. Dá uma olhada no monitoramento nativo do inversor, pega os dados reais e cola aqui que eu monto a mensagem pro cliente." Só depois que ele colar os números, escreva a mensagem usando o que ele colou.`,
    ``,
    dados.length ? `Dados do cliente/usina:` : `Sem dados detalhados da usina.`,
    ...dados,
  ].filter((l): l is string => l !== null);
  const base = linhas.join('\n');
  if (conhecimento && conhecimento.trim()) {
    return `${conhecimento.trim()}\n\n====================================\n${base}`;
  }
  return base;
}

/**
 * Rede de segurança da regra "mensagem limpa": tira asterisco (negrito markdown)
 * e colchete (placeholders tipo [nome]), mantendo o conteúdo de dentro. Garante
 * o texto natural de WhatsApp no código, não só no prompt. PURA.
 */
export function limparMensagem(texto: string): string {
  return texto
    .replace(/\*+/g, '')               // remove asteriscos
    .replace(/\[([^\]]*)\]/g, '$1')    // [algo] -> algo
    .replace(/[ \t]{2,}/g, ' ')        // colapsa espaços que sobraram
    .replace(/ +\n/g, '\n')            // tira espaço antes de quebra de linha
    .trim();
}

/** Conversa com a IA: contexto (system) + histórico + pergunta. Haiku 4.5. */
export async function responderCopilotoPosVenda(
  anthropic: Anthropic,
  input: { contexto: ContextoPosVenda; historico: MensagemCopiloto[]; pergunta: string; conhecimento?: string },
): Promise<string> {
  const system = montarSystemPromptPosVenda(input.contexto, input.conhecimento);
  const messages = [
    ...input.historico.map((m) => ({ role: m.role, content: m.conteudo })),
    { role: 'user' as const, content: input.pergunta },
  ];
  const resp = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system,
    messages: messages as Anthropic.MessageParam[],
  });
  const texto = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return limparMensagem(texto);
}

/** Mapeia os campos do PosVendaLinha (ou equivalente) pro contexto, null->undefined. */
export function montarContextoPosVenda(l: {
  nome?: string; cidade?: string | null; potenciaKwp?: number | null;
  marcaInversor?: string | null; dataInstalacao?: string | null;
  temMonitoramento: boolean; geracaoResumo?: string | null; jaTeveDepoimento?: boolean;
}): ContextoPosVenda {
  return {
    nome: l.nome || undefined,
    cidade: l.cidade ?? undefined,
    potenciaKwp: l.potenciaKwp ?? undefined,
    marcaInversor: l.marcaInversor ?? undefined,
    dataInstalacao: l.dataInstalacao ?? undefined,
    temMonitoramento: l.temMonitoramento,
    geracaoResumo: l.geracaoResumo ?? undefined,
    jaTeveDepoimento: l.jaTeveDepoimento,
  };
}
