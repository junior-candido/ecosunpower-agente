// Medidor de custo de IA (Claude). Cada chamada de modelo pode gravar 1 linha
// em custos_ia_uso com os tokens usados + o custo estimado em CENTAVOS DE REAL.
//
// A conta é feita aqui, no código, porque só aqui a gente tem os preços por
// modelo e a cotação do dólar do momento. O banco só guarda o número final.
//
// REGRA DE OURO: gravar custo é best-effort. Um erro aqui (banco fora, usage
// malformado, etc.) NUNCA pode derrubar a resposta da Eva/Elo. Tudo em try/catch.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { canalAtual } from '../canal-contexto.js';
import { empresa, temContextoDeEmpresa } from '../empresa-config.js';

// Preços oficiais Anthropic, em USD por MILHÃO de tokens (cache 2026-06-24).
// input = tokens de entrada "frescos"; output = tokens gerados.
// Cache é derivado do input do próprio modelo (não hardcode separado):
//   leitura do cache (cache hit)      = 0.10 × input
//   escrita no cache (janela de 5min) = 1.25 × input
interface PrecoModelo {
  input: number; // USD / 1M tokens
  output: number; // USD / 1M tokens
  /** Leitura de cache como fração do input. Padrão 0,1×; o Opus 5.5 é 0,05×
   *  (US$ 0,20 por milhão). */
  cacheRead?: number;
}

const PRECOS_USD_POR_MILHAO: Record<string, PrecoModelo> = {
  sonnet: { input: 3.0, output: 15.0 },
  // Sonnet 5 (claude-sonnet-5): mais barato que o Sonnet 4.6.
  sonnet5: { input: 2.0, output: 10.0 },
  haiku: { input: 1.0, output: 5.0 },
  opus: { input: 5.0, output: 25.0 },
  // Opus 5.5 (claude-opus-5-5): US$ 4 / 20, leitura de cache US$ 0,20
  // (tabela oficial da Anthropic, conferida 29/09/2026). Antes caía no "opus"
  // genérico e o custo saía 25% acima do real.
  opus55: { input: 4.0, output: 20.0, cacheRead: 0.05 },
};

// Fallback razoável quando o modelo não é reconhecido: preços do Sonnet (o
// modelo padrão da Eva). Nunca quebra — só estima com o preço do meio.
const PRECO_FALLBACK: PrecoModelo = PRECOS_USD_POR_MILHAO.sonnet;

// Multiplicadores de cache, derivados do input de cada modelo.
const MULT_CACHE_READ = 0.1; // leitura = 0.1 × input
const MULT_CACHE_WRITE = 1.25; // escrita (5min) = 1.25 × input
const MULT_CACHE_WRITE_1H = 2; // escrita (1 hora) = 2 × input

// Cotação aproximada — ajustar quando variar muito.
export const USD_BRL = 5.4;

// Usage no formato que a SDK da Anthropic devolve (response.usage). Campos
// aceitam null porque a SDK usa null quando não houve cache.
export interface IaUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  /** Quebra da escrita de cache por TTL (a SDK devolve quando há cache).
   *  Escrita de 1 hora custa 2× o input; a de 5 min, 1,25×. */
  cache_creation?: {
    ephemeral_5m_input_tokens?: number | null;
    ephemeral_1h_input_tokens?: number | null;
  } | null;
}

// Normaliza o nome do modelo (ex.: 'claude-haiku-4-5-20251001' → 'haiku') e
// devolve o preço. Modelo desconhecido → fallback (sonnet), sem quebrar.
function precoDoModelo(modelo: string): PrecoModelo {
  const m = String(modelo ?? '').toLowerCase();
  if (m.startsWith('claude-haiku-4-5') || m.includes('haiku')) return PRECOS_USD_POR_MILHAO.haiku;
  if (m.startsWith('claude-opus-5-5')) return PRECOS_USD_POR_MILHAO.opus55;
  if (m.startsWith('claude-opus-4-8') || m.includes('opus')) return PRECOS_USD_POR_MILHAO.opus;
  if (m.startsWith('claude-sonnet-5')) return PRECOS_USD_POR_MILHAO.sonnet5;
  if (m.startsWith('claude-sonnet-4-6') || m.includes('sonnet')) return PRECOS_USD_POR_MILHAO.sonnet;
  return PRECO_FALLBACK;
}

/**
 * Custo de uma chamada de IA em CENTAVOS DE BRL (inteiro, arredondado).
 *
 * Fórmula:
 *   usd   = (input*pIn + output*pOut + cacheRead*pCacheRead + cacheWrite*pCacheWrite) / 1_000_000
 *   cents = round(usd × USD_BRL × 100)
 * onde pCacheRead = 0.10 × pIn (Opus 5.5: 0.05×) e pCacheWrite = 1.25 × pIn (1 h: 2×).
 */
export function custoCentsBRL(modelo: string, usage: IaUsage): number {
  return Math.round(custoCentavosExato(modelo, usage));
}

/** Mesma conta, SEM arredondar (centavos com fração). A coluna custo_cents é
 *  inteira: chamada pequena (corretor, resumo) gravava 0 — a tela soma por aqui. */
export function custoCentavosExato(modelo: string, usage: IaUsage): number {
  const preco = precoDoModelo(modelo);
  const precoCacheRead = preco.input * (preco.cacheRead ?? MULT_CACHE_READ);
  const precoCacheWrite = preco.input * MULT_CACHE_WRITE;

  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  // Parte da escrita que foi pro cache de 1 hora (preço 2×). O resto é 5 min.
  const write1h = Math.min(cacheWrite, Math.max(0, usage.cache_creation?.ephemeral_1h_input_tokens ?? 0));
  const write5m = cacheWrite - write1h;

  const usd =
    (input * preco.input +
      output * preco.output +
      cacheRead * precoCacheRead +
      write5m * precoCacheWrite +
      write1h * preco.input * MULT_CACHE_WRITE_1H) /
    1_000_000;

  return usd * USD_BRL * 100;
}

// ---------------------------------------------------------------------------
// DE QUEM É O CUSTO (28/09/2026). Antes daqui nada dizia a empresa e o DEFAULT
// da coluna (migration 077) jogava TUDO na casa — o gasto da Clara (Conquista
// Solar) aparecia como da Eva. Ordem de quem responde:
//   1. companyId explícito na chamada;
//   2. canal da mensagem (a fila roda cada job dentro de comCanal({companyId}));
//   3. empresa em contexto (comEmpresaDe);
//   4. login do painel (o contexto mais EXTERNO: só vale quando nada mais
//      específico diz — admin da casa agindo no canal de um tenant = tenant).
// Nada disso → grava na casa (default) mas MARCA a origem com '#sem-empresa'
// e avisa no log: é assim que a gente acha os buracos que faltam.
// ---------------------------------------------------------------------------
export const SUFIXO_SEM_EMPRESA = '#sem-empresa';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const valido = (id: unknown): id is string => typeof id === 'string' && UUID.test(id);

const alsCusto = new AsyncLocalStorage<string | null>();

/** Roda `fn` dizendo de qual empresa é o custo de IA de tudo que rodar dentro
 *  (awaits inclusos). Só mexe na MEDIÇÃO — não muda empresa() nem nada da tela. */
export function comEmpresaDoCusto<T>(companyId: string | null | undefined, fn: () => T): T {
  return alsCusto.run(valido(companyId) ? companyId.toLowerCase() : null, fn);
}

/** Empresa do custo pelo contexto (sem o explícito). null = ninguém disse. */
export function empresaDoCustoNoContexto(): string | null {
  const doCanal = canalAtual()?.companyId;
  if (valido(doCanal)) return doCanal.toLowerCase();
  if (temContextoDeEmpresa()) {
    const id = empresa().companyId;
    if (valido(id)) return id.toLowerCase();
  }
  const doPainel = alsCusto.getStore();
  if (valido(doPainel)) return doPainel;
  return null;
}

// Aviso de "sem empresa" no máximo 1× por origem a cada 10 min (não inunda o log).
const ultimoAviso = new Map<string, number>();
function avisarSemEmpresa(origem: string): void {
  const agora = Date.now();
  if ((ultimoAviso.get(origem) ?? -Infinity) > agora - 10 * 60_000) return;
  ultimoAviso.set(origem, agora);
  console.warn(`[custos] IA sem empresa (origem=${origem}) — gravado na casa; passe companyId ou rode no contexto da empresa`);
}

// ---------------------------------------------------------------------------
// ORIGEM PADRONIZADA: 'tipo:detalhe'. tipo = conversa | midia | resumo |
// reativacao | escrita | admin. A tela "Custo de IA" agrupa por aqui.
// ---------------------------------------------------------------------------
export type TipoUsoIa = 'conversa' | 'midia' | 'resumo' | 'reativacao' | 'escrita' | 'admin';

export const ORIGENS_IA = {
  'conversa:lead': 'Conversa com lead/cliente (assistente)',
  'conversa:leadgen': 'Primeira mensagem de lead de formulário',
  'midia:imagem': 'Leitura de foto enviada',
  'midia:pdf': 'Leitura de PDF enviado',
  'midia:tabela-precos': 'Leitura de print da tabela de preços',
  'midia:docs-contrato': 'Leitura de documentos do contrato',
  'midia:leitor-conta': 'Leitor de conta (Gerador de Relatórios)',
  'midia:geracao-print': 'Leitura de print de geração (importar usina sem integração)',
  'resumo:lead': 'Resumo do lead no painel',
  'resumo:bi': 'Resumo de métricas (BI)',
  'resumo:usina-previsto': 'Analisar usina com IA (Energy Studio)',
  'reativacao:followup': 'Follow-up de lead parado',
  'reativacao:followup-proposta': 'Follow-up da proposta',
  'reativacao:reabordagem-proposta': 'Reabordagem quando reabre a proposta',
  'reativacao:cadencia': 'Cadência de mensagens',
  'reativacao:reengajamento': 'Reengajamento de base',
  'reativacao:manutencao': 'Lembrete de manutenção',
  'reativacao:pos-instalacao': 'Mensagem pós-instalação',
  'escrita:blog': 'Artigo do blog',
  'escrita:copy': 'Texto de anúncio',
  'escrita:email': 'E-mail',
  'escrita:email-campanha': 'Campanha de e-mail',
  'escrita:marketing': 'Marketing',
  'escrita:corretor': 'Corretor de texto',
  'escrita:abordagem-monitoramento': 'Abordagem do monitoramento',
  'admin:agenda': 'Agenda do dono',
  'admin:agendamento': 'Agendamento de visita',
  'admin:proposta': 'Assistente de proposta',
  'admin:preco': 'Assistente de preço',
  'admin:fechamento': 'Assistente de fechamento',
  'admin:contratos': 'Revisão de contrato',
  'admin:financeiro': 'Lançamentos do financeiro',
  'admin:elo': 'Elo (cérebro do painel)',
  'admin:copiloto-pos-venda': 'Copiloto de pós-venda',
  'admin:ia-comercial': 'IA comercial',
  'admin:ia-copiloto': 'Copiloto',
  'admin:ia-engenharia': 'IA de engenharia',
  'admin:rh': 'RH (busca e triagem)',
} as const satisfies Record<string, string>;

export type OrigemIa = keyof typeof ORIGENS_IA;

// Nomes ANTIGOS (gravados até 28/09/2026) → catálogo novo. Assim a tela lê
// setembro inteiro certinho, sem reescrever o banco.
const LEGADO: Record<string, OrigemIa> = {
  eva: 'conversa:lead', leadgen: 'conversa:leadgen',
  'tabela-precos-print': 'midia:tabela-precos',
  'lead-synthesis': 'resumo:lead', bi: 'resumo:bi',
  followup: 'reativacao:followup', 'followup-vivo': 'reativacao:followup-proposta',
  cadence: 'reativacao:cadencia', maintenance: 'reativacao:manutencao',
  blog: 'escrita:blog', copy: 'escrita:copy', email: 'escrita:email', corretor: 'escrita:corretor',
  monitoramento: 'escrita:abordagem-monitoramento',
  agenda: 'admin:agenda', closing: 'admin:fechamento', central_contratos: 'admin:contratos',
  financeiro: 'admin:financeiro', elo: 'admin:elo', 'pos-venda': 'admin:copiloto-pos-venda',
  'ia-comercial': 'admin:ia-comercial', 'ia-copiloto': 'admin:ia-copiloto', 'ia-engenharia': 'admin:ia-engenharia',
};

const TIPOS: ReadonlySet<string> = new Set(['conversa', 'midia', 'resumo', 'reativacao', 'escrita', 'admin']);

/** Traduz a origem gravada (nova, antiga ou com '#sem-empresa') pro uso da tela. */
export function usoDaOrigem(origem: string | null | undefined): {
  chave: string; rotulo: string; tipo: TipoUsoIa; semEmpresa: boolean;
} {
  let o = String(origem ?? '').trim();
  const semEmpresa = o.endsWith(SUFIXO_SEM_EMPRESA);
  if (semEmpresa) o = o.slice(0, -SUFIXO_SEM_EMPRESA.length);
  if (!o || o === 'sem-origem') return { chave: 'sem-origem', rotulo: 'Sem origem', tipo: 'admin', semEmpresa };
  const chave: string = LEGADO[o] ?? (o.startsWith('leitor-ia') ? 'midia:leitor-conta' : o);
  const rotulo = (ORIGENS_IA as Record<string, string>)[chave] ?? chave;
  const prefixo = chave.split(':')[0];
  const tipo = (TIPOS.has(prefixo) ? prefixo : 'admin') as TipoUsoIa;
  return { chave, rotulo, tipo, semEmpresa };
}

/**
 * Grava 1 linha em custos_ia_uso com os tokens + o custo estimado em centavos
 * de BRL + a EMPRESA dona do gasto. Best-effort: qualquer erro é engolido (log)
 * e a função nunca lança.
 *
 * @param client Client Supabase (service role). Se null/undefined, não faz nada.
 */
export async function registrarUsoIa(
  client: any,
  args: { modelo: string; origem?: OrigemIa | string; usage: IaUsage; companyId?: string | null },
): Promise<void> {
  try {
    if (!client) return;
    const { modelo } = args;
    const usage: IaUsage = args.usage ?? {};
    // Resolve a empresa ANTES de qualquer await (o contexto é o de quem chamou).
    const companyId = valido(args.companyId) ? args.companyId.toLowerCase() : empresaDoCustoNoContexto();
    let origem: string = args.origem ?? 'sem-origem';
    if (!companyId) {
      avisarSemEmpresa(origem);
      origem += SUFIXO_SEM_EMPRESA;
    }
    const custo_cents = custoCentsBRL(modelo, usage);
    await client.from('custos_ia_uso').insert({
      modelo,
      origem,
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      cache_read_tokens: usage.cache_read_input_tokens ?? 0,
      cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
      custo_cents,
      // Sem empresa → não manda: o DEFAULT da coluna (casa) segura.
      ...(companyId ? { company_id: companyId } : {}),
    });
  } catch (err) {
    // Best-effort: medir custo nunca pode derrubar o fluxo da IA.
    console.error('[custos] registrarUsoIa falhou (best-effort):', (err as Error)?.message);
  }
}

// Client Supabase dedicado ao medidor de custos de IA. Lazy + memoizado:
// criado sob demanda a partir das mesmas envs do SupabaseService. Em
// teste/build (sem env) fica null → registrarUsoIa vira no-op best-effort.
// Assim qualquer módulo mede sem precisar receber um client no construtor.
let _custosClient: SupabaseClient | null | undefined;
export function getCustosClient(): SupabaseClient | null {
  if (_custosClient !== undefined) return _custosClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  _custosClient = url && key ? createClient(url, key) : null;
  return _custosClient;
}

/**
 * Conveniência best-effort pra medir uma chamada de IA de qualquer módulo,
 * sem precisar de um client Supabase à mão. Resolve o client lazy e dispara
 * registrarUsoIa sem esperar (fire-and-forget). Nunca lança, nunca bloqueia.
 */
export function medirIa(args: { modelo: string; origem: OrigemIa | `leitor-ia:${string}`; usage: any; companyId?: string | null }): void {
  // Roda no caminho da resposta da Eva: medir NUNCA pode lançar.
  try {
    // Empresa resolvida AQUI (síncrono, no contexto de quem chamou).
    const companyId = valido(args.companyId) ? args.companyId : empresaDoCustoNoContexto();
    void registrarUsoIa(getCustosClient(), { ...args, companyId });
  } catch (err) {
    console.warn('[custos] medirIa falhou (best-effort):', (err as Error)?.message);
  }
}
