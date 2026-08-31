import Anthropic from '@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildSystemBlocks } from './system-blocks.js';
import { formatCacheUsage } from './cache-log.js';
import { registrarUsoIa } from './custos/ia-metering.js';
import { empresa, interpolarEmpresa } from './empresa-config.js';
import { promptFileDoModo } from './eva-modo.js';

// Client Supabase dedicado ao medidor de custos de IA. Lazy + memoizado:
// criado sob demanda a partir das mesmas envs do SupabaseService. Em
// teste/build (sem env) fica null → registrarUsoIa vira no-op best-effort.
// Assim o medidor liga em prod sem refatorar o construtor do Brain nem o
// index.ts (o Brain hoje só recebe apiKey + reviewLink).
let _custosClient: SupabaseClient | null | undefined;
function getCustosClient(): SupabaseClient | null {
  if (_custosClient !== undefined) return _custosClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  _custosClient = url && key ? createClient(url, key) : null;
  return _custosClient;
}

interface MessageEntry {
  role: 'user' | 'assistant';
  content: string;
}

interface ActionPayload {
  action: string;
  data: Record<string, unknown>;
}

export interface BrainResponse {
  text: string;
  displayText: string;
  displayMessages: string[];
  action: ActionPayload | null;
  actions: ActionPayload[];
}

// Converte markdown -> formatação que o WhatsApp realmente renderiza.
// WhatsApp NÃO tem #/##/headers, --- régua, ** (negrito é *1 asterisco*),
// > blockquote. O modelo espelha o estilo do prompt (md) e vazava tudo
// literal pro cliente (ex conversa Alessandro). Defesa em profundidade —
// roda em todo retorno do brain via getDisplayText.
export function toWhatsAppText(text: string): string {
  if (!text) return '';
  let t = text;
  // 1. **negrito** -> *negrito* (par fechado, sem * nem \n no meio)
  t = t.replace(/\*\*([^\n*]+?)\*\*/g, '*$1*');
  // 2. Header markdown (# … ######) -> linha em *negrito*. Tira TODOS os *
  // do texto (header com **preço** dentro nao pode virar * aninhado); se
  // sobrar vazio (header so de simbolos), nao emite nada.
  t = t.replace(/^[ \t]*#{1,6}[ \t]+(.+?)[ \t]*$/gm, (_m, h: string) => {
    const clean = h.replace(/\*+/g, ' ').replace(/\s+/g, ' ').trim();
    return clean ? `*${clean}*` : '';
  });
  // 3. Régua horizontal (--- *** ___ ===) some (linha + quebra)
  t = t.replace(/^[ \t]*([-*_=])\1{2,}[ \t]*\n?/gm, '');
  // 4. Blockquote "> " no início da linha some
  t = t.replace(/^[ \t]*>[ \t]?/gm, '');
  // 5. Colapsa excesso de linha em branco e apara
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

export class Brain {
  private client: Anthropic;
  private systemPrompt: string;
  private residencialPrompt: string;
  private reviewLink: string;

  constructor(apiKey: string, reviewLink = '') {
    this.client = new Anthropic({ apiKey });

    const promptsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts');
    // Modo solar → system-prompt.md; modo vitrine_ecosof → system-prompt-vitrine.md.
    this.systemPrompt = readFileSync(join(promptsDir, promptFileDoModo()), 'utf-8');
    this.residencialPrompt = readFileSync(join(promptsDir, 'residencial.md'), 'utf-8');
    this.reviewLink = reviewLink;
  }

  async processMessage(
    userMessage: string,
    history: MessageEntry[],
    knowledgeBase: string,
    summary: string | null,
    qualificationStep: string
  ): Promise<BrainResponse> {
    // review_link substituido aqui (estavel por processo) -> prefixo cacheavel.
    // [ECOSOF] Placeholders de empresa ({{nome_atendente}}, {{empresa_nome}}, ...)
    // interpolados POR CHAMADA: o systemPrompt cru fica cacheado no construtor
    // (o ARQUIVO nao muda), mas empresa() e lida aqui na hora — assim o
    // /recarregar-config surte efeito sem restart. Enquanto a config nao muda,
    // a string resultante e byte-identica entre chamadas, entao o prompt
    // caching da Anthropic continua valendo.
    const emp = empresa();
    const stableSystem = interpolarEmpresa(
      this.systemPrompt.replaceAll('{{review_link}}', this.reviewLink),
      emp,
    );
    const system = buildSystemBlocks({
      systemPrompt: stableSystem,
      knowledgeBase,
      // residencial.md também tem placeholders de empresa ({{rt_apelido}}): sem
      // interpolar, o cliente veria "{{rt_apelido}}" cru na resposta.
      residencialPrompt: interpolarEmpresa(this.residencialPrompt, emp),
      qualificationStep,
      summary,
      now: new Date(),
    });

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...history,
      { role: 'user', content: userMessage },
    ];

    const response = await this.client.messages.create({
      // Sonnet (não Haiku): conversa mais esperta e natural, segue a regra de não
      // ecoar/cravar preço que o Haiku ignorava. Cálculo certo já é garantido pela
      // calculadora + trava-número, independente do modelo.
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      messages,
    });

    // Prova do prompt caching em prod (commit 71c8583).
    console.log(formatCacheUsage(response.usage));

    // Medidor de custo de IA (best-effort, nunca derruba a resposta). A Eva é
    // o maior consumidor de tokens — grava tokens + custo estimado em BRL na
    // custos_ia_uso. Sem await pra não somar latência na resposta ao cliente.
    void registrarUsoIa(getCustosClient(), {
      modelo: 'claude-sonnet-4-6',
      origem: 'eva',
      usage: response.usage,
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');

    const actions = this.parseActions(text);
    const displayText = this.getDisplayText(text);
    return {
      text,
      displayText,
      displayMessages: this.getDisplayMessages(displayText),
      action: actions[0] ?? null,
      actions,
    };
  }

  parseAction(responseText: string): ActionPayload | null {
    return this.parseActions(responseText)[0] ?? null;
  }

  parseActions(responseText: string): ActionPayload[] {
    const re = /```json\s*([\s\S]*?)\s*```/g;
    const actions: ActionPayload[] = [];
    let match: RegExpExecArray | null;
    while ((match = re.exec(responseText)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && typeof item.action === 'string') actions.push(item as ActionPayload);
          }
        } else if (parsed && typeof parsed.action === 'string') {
          actions.push(parsed as ActionPayload);
        }
      } catch {
        // skip invalid block
      }
    }
    return actions;
  }

  getDisplayText(responseText: string): string {
    // Tira o bloco de action, depois converte markdown -> WhatsApp-safe
    // (sem #/##/**/---/> vazando pro cliente). toWhatsAppText ja apara.
    return toWhatsAppText(
      responseText.replace(/```json\s*[\s\S]*?\s*```/g, ''),
    );
  }

  // Splits a response into WhatsApp-sized messages. If Eva used the
  // [MENSAGEM N] markers, split on those. Otherwise return as a single
  // message for backwards compatibility.
  getDisplayMessages(cleanedText: string): string[] {
    const text = cleanedText.trim();
    if (!text) return [];
    const markerRe = /\[MENSAGEM\s*\d+\]/gi;
    if (!markerRe.test(text)) return [text];

    const parts = text.split(/\[MENSAGEM\s*\d+\]/gi);
    const msgs = parts
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    return msgs.length > 0 ? msgs : [text];
  }
}
