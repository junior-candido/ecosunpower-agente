import Anthropic from '@anthropic-ai/sdk';
import Redis from 'ioredis';
import { readFileSync } from 'fs';
import { join } from 'path';

const IORedis = (Redis as any).default ?? Redis;

// Modo precificação fica ativo por 1h. Junior pode sair antes com /sair.
const PRICING_MODE_TTL_SECONDS = 60 * 60;

interface PricingMessage {
  role: 'user' | 'assistant';
  content: string;
}

// System prompt da Eva Precificadora — combinacao das knowledges relevantes
// pra calculos de custo + comparacao Greener + recomendacao estrategica.
function buildSystemPrompt(precificacaoKnowledge: string, greenerKnowledge: string, marcasKnowledge: string): string {
  return `Você é a Eva, assistente de precificação da EcoSunPower. Está conversando com Junior (engenheiro proprietário, 5+ anos de experiência) pra ajudar a precificar projetos.

TOM: direto, técnico, sem ladainha. Junior conhece tudo. Vá pros números.

# KNOWLEDGE: PRECIFICAÇÃO

${precificacaoKnowledge}

# KNOWLEDGE: MERCADO GREENER 2026

${greenerKnowledge}

# KNOWLEDGE: MARCAS OFICIAIS ECOSUNPOWER

${marcasKnowledge}

# REGRAS CRÍTICAS

1. Use APENAS marcas da lista oficial. NUNCA Growatt.
2. Concessionárias: Brasília=Neoenergia-DF, Goiás=Equatorial-GO. NUNCA CEB ou Celg/Enel.
3. Se Junior mandar valor numérico ambíguo, pergunte 1 coisa só (não enche).
4. Se Junior mandar "muda margem pra 40", "troca kit pra X", "aumenta admin pra Y" — recalcule TUDO mantendo os outros valores anteriores e responda o breakdown atualizado.
5. Use formatação WhatsApp: emojis pontuais, separadores ─────────────, linhas curtas.
6. Sempre que tiver kWp + valor final, mostre R$/Wp e compare com Greener.
7. Para sistemas com bateria: NÃO comparar R$/Wp com Greener tabela solar pura — bateria muda tudo. Use referência híbrido residencial: R$ 8-12/Wp.
8. Para carregador VE e padrão de entrada: NÃO comparar com Greener (escopo diferente). Mostre só lucro líquido.
9. Imposto é por dentro (gross-up): imposto_rs = subtotal_com_margem * (imp_pct / (100 - imp_pct)).

# FORMATO DE SAÍDA PADRÃO

Após calcular, devolva APENAS o breakdown formatado (não explicações longas), seguindo o template em precificacao.md. Termine sempre com "Quer ajustar algo?" pra abrir refinamento.

Se faltar dado, pergunte de forma curta e objetiva listando o que falta.

Se Junior digitar "/sair" ou "sair" ou "fechar", responda apenas: "👍 Saiu do modo precificação."

Se Junior digitar "/preco ajuda" ou "ajuda", mostre 1 exemplo curto e os tipos de sistema disponíveis.`;
}

export class PricingAssistant {
  private client: Anthropic;
  private redis: any;
  private systemPrompt: string;

  constructor(
    apiKey: string,
    redisHost: string,
    redisPort: number,
    redisPassword: string | undefined,
    knowledgeBaseDir: string,
  ) {
    this.client = new Anthropic({ apiKey });
    this.redis = new IORedis({ host: redisHost, port: redisPort, password: redisPassword, maxRetriesPerRequest: null });

    const precificacao = readFileSync(join(knowledgeBaseDir, 'precificacao.md'), 'utf-8');
    const greener = readFileSync(join(knowledgeBaseDir, 'mercado-greener-2026.md'), 'utf-8');
    let marcas = '';
    try {
      marcas = readFileSync(join(knowledgeBaseDir, 'produtos.md'), 'utf-8');
    } catch {
      marcas = 'Marcas: Trina, JA Solar, LONGi, Jinko, DAH, Risen (placas); Sungrow, Solis, Deye, FoxESS, SolarEdge, Hoymiles, NEP (inversores). NUNCA Growatt.';
    }

    this.systemPrompt = buildSystemPrompt(precificacao, greener, marcas);
  }

  // Junior digitou /preco, palavra solta ou linguagem natural?
  // Cobre: texto livre ("preço", "precificar"), comando barra ("/preco solar 11.2"),
  // verbos diretos ("orçar", "calcular preço") e áudio transcrito (gera texto natural).
  // Pontuação e acentos são tolerados (remove tudo que não é letra antes de comparar).
  static isPricingTrigger(text: string): boolean {
    const raw = text.toLowerCase().trim();
    if (!raw) return false;

    // Normaliza: remove acentos + sinais de pontuação no início pra pegar "preço!", "preço?" etc
    const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    let norm = stripAccents(raw).replace(/[^\w\s\/]/g, '').trim();

    // Tolera prefixo "eva ", "eva, " no inicio (Junior costuma chamar pelo nome)
    norm = norm.replace(/^eva[\s,]+/, '').trim();

    // Comando barra com ou sem args
    if (/^\/(preco|precificar|preci?o|orcar|calcular)(\s|$)/.test(norm)) return true;

    // Palavra solta (texto OU áudio transcrito)
    const palavrasSoltas = ['preco', 'precos', 'precificar', 'precificacao', 'orcar', 'orcamento', 'orcamentos'];
    if (palavrasSoltas.includes(norm)) return true;

    // Verbos no início + algum complemento
    if (/^(preciso |quero |me ajuda a |vou )?(precificar|orcar|calcular preco|fazer um orcamento)(\s|$)/.test(norm)) return true;

    // "calcular sistema/projeto" no início
    if (/^calcular (sistema|projeto|preco|orcamento)(\s|$)/.test(norm)) return true;

    return false;
  }

  // Junior digitou /sair ou similar pra sair do modo?
  static isExitTrigger(text: string): boolean {
    const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const norm = stripAccents(text.toLowerCase().trim()).replace(/[^\w\s\/]/g, '').trim();
    return [
      '/sair', '/exit', '/preco off', '/precificar off',
      'sair', 'fechar', 'parar', 'parar precificacao',
      'sair do modo', 'sair do preco', 'finalizar', 'encerrar',
    ].includes(norm);
  }

  async isInPricingMode(phone: string): Promise<boolean> {
    const result = await this.redis.get(`pricing:${phone}`);
    return result !== null;
  }

  // Inicia modo. Limpa historico antigo e devolve menu.
  async startPricingMode(phone: string, initialMessage?: string): Promise<string> {
    await this.redis.setex(`pricing:${phone}`, PRICING_MODE_TTL_SECONDS, '1');
    await this.redis.del(`pricing:history:${phone}`);

    // Se Junior ja descreveu o que quer junto com o trigger (ex: "preço solar 11.2 kit 16987",
    // "/preco solar...", "preciso precificar 11.2..."), vai direto pro Claude calcular.
    // Senao, mostra o menu padrao.
    const stripped = (initialMessage ?? '')
      .replace(/^\/(preco|precificar|preço|preci?o|orcar|calcular)\s*/i, '')
      .replace(/^(preciso |quero |me ajuda a |vou )?(precificar|orçar|orcar|precificacao|orcamento|calcular preço|calcular preco|fazer um orcamento|fazer um orçamento)\s*/i, '')
      .replace(/^(preço|preco|orcamento|orçamento)\s*/i, '')
      .trim();
    if (stripped.length > 5) {
      return await this.processPricingMessage(phone, stripped);
    }

    return [
      '🧮 *Modo Precificação ATIVO*',
      '',
      'O que vai orçar?',
      '1️⃣ Solar convencional',
      '2️⃣ Solar + bateria (híbrido)',
      '3️⃣ Carregador VE',
      '4️⃣ Padrão de entrada',
      '5️⃣ Combo (descreve)',
      '',
      'Pode mandar tudo de uma vez. Ex:',
      '_"solar 11.2 kit 16987 mat 1200 mo 2500 adm 800 margem 30"_',
      '',
      'Pra sair: `/sair`',
    ].join('\n');
  }

  async exitPricingMode(phone: string): Promise<void> {
    await this.redis.del(`pricing:${phone}`);
    await this.redis.del(`pricing:history:${phone}`);
  }

  // Processa mensagem do Junior dentro do modo precificacao.
  // Mantem historico em Redis pra Claude ter contexto de refinamento.
  async processPricingMessage(phone: string, message: string): Promise<string> {
    if (PricingAssistant.isExitTrigger(message)) {
      await this.exitPricingMode(phone);
      return '👍 Saiu do modo precificação.';
    }

    // Recupera historico
    const histRaw = await this.redis.get(`pricing:history:${phone}`);
    const history: PricingMessage[] = histRaw ? JSON.parse(histRaw) : [];

    // Adiciona msg do user
    history.push({ role: 'user', content: message });

    // Chama Claude com prompt caching no system (knowledge base nao muda durante sessao,
    // economiza ~80-90% do input cost em refinamentos multi-turno).
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: [
        { type: 'text', text: this.systemPrompt, cache_control: { type: 'ephemeral' } },
      ],
      messages: history,
    });

    const reply = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();

    // Salva resposta no historico
    history.push({ role: 'assistant', content: reply });

    // Limita historico a ultimas 20 mensagens (evita crescer infinito num loop longo)
    const trimmed = history.slice(-20);
    await this.redis.setex(
      `pricing:history:${phone}`,
      PRICING_MODE_TTL_SECONDS,
      JSON.stringify(trimmed),
    );

    // Renova TTL do modo ativo
    await this.redis.setex(`pricing:${phone}`, PRICING_MODE_TTL_SECONDS, '1');

    return reply;
  }

}
