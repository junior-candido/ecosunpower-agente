import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SupabaseService } from './supabase.js';
import type { TemplateComponent } from './meta-whatsapp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Cadencia de reengajamento Eva: 5 toques (0h, 15d, 30d, 45d, 60d) focados em
 * leads frios que AINDA NAO COMPRARAM com a Ecosunpower. Objetivo: ajudar o
 * cliente a tomar a decisao de adquirir um sistema solar, baseando-se em fatos
 * reais de fontes confiaveis (Canal Solar) — Eva nunca inventa dados.
 *
 * Toque 1 (0h)   — Apresentacao pessoal de Eva (sem conteudo educativo)
 * Toque 2 (15d)  — Despertar interesse: tarifa subindo, retorno do solar
 * Toque 3 (30d)  — Quebrar objecao: Lei 14.300 esclarecida, payback ainda vale
 * Toque 4 (45d)  — Caso real / prova social com numeros do mercado
 * Toque 5 (60d)  — Soft close: ultima reflexao, deixa porta aberta
 *
 * Quando cliente responde, cadencia eh cancelada e Eva entra em modo
 * conversa normal. Eva NAO presume estado do cliente: descobre primeiro
 * se ele ja tem ou nao sistema antes de sugerir bateria/manutencao/projeto.
 */

interface StepContext {
  clientName: string | null;
  step: number;
  article?: ParsedArticle;
}

interface ParsedArticle {
  title: string;
  date: string;
  link: string;
  summary: string;
}

const STEP_GUIDANCE: Record<number, string> = {
  1: `Toque 1 — Apresentacao de retomada. NAO use conteudo do Canal Solar
  neste toque (e so apresentacao pessoal). Tom leve e proximo, como quem
  se coloca a disposicao. Lembre: o cliente JA conhece o Junior pessoalmente,
  entao nao e um "novo lead" — e uma "ampliacao de atendimento". Mencione
  que voce (Eva) e a engenheira virtual da Ecosunpower e tambem ficou de apoiar o
  Junior no dia-a-dia. Mensagem curta (2-3 frases), sem pergunta obrigatoria,
  deixando a porta aberta.`,

  2: `Toque 2 — Despertar interesse pra QUEM AINDA NAO TEM SOLAR (15 dias
  depois). Use o ARTIGO do Canal Solar fornecido como base factual. Foque
  em: aumento da tarifa de luz, vantagens de gerar a propria energia,
  proteccao contra reajustes futuros, momento favoravel pra decidir.

  IMPORTANTE: NAO assuma que o cliente ja tem sistema. Fale como se ele
  estivesse pensando em adquirir. Mensagem curta (3-4 frases), termine
  deixando a porta aberta pra duvida ou simulacao.`,

  3: `Toque 3 — Quebrar objecoes/esclarecer mitos (30 dias depois). Use
  o ARTIGO do Canal Solar fornecido como base factual. Topicos comuns que
  causam duvida: Lei 14.300 (a "taxacao do sol"), payback do investimento,
  durabilidade dos paineis, garantias, regulamentacao da ANEEL.

  Eva esclarece com precisao baseada no artigo, mostra que ainda vale a
  pena. NAO invente dados — use SOMENTE o que esta no artigo. Termine
  oferecendo simulacao (pedir conta de luz pra calcular caso real).`,

  4: `Toque 4 — Prova social / contexto de mercado (45 dias depois). Use
  o ARTIGO do Canal Solar fornecido como base. Pode mencionar: crescimento
  do setor solar no Brasil, casos de empresas/regioes adotando, dados de
  potencia instalada, exemplos reais. Tom: "olha como o mercado ta
  caminhando, voce ainda nao decidiu?".

  Posicionar Ecosunpower como parceira premium (Trina, Jinko, SolarEdge,
  Deye, Sungrow). Sem pressao, deixar claro que estamos disponiveis pra
  estudo sem compromisso. Termine com soft CTA.`,

  5: `Toque 5 — Tom de "olha, ainda da tempo" (60 dias depois). Use o ARTIGO do
  Canal Solar como base. Reforce que estamos disponiveis pra estudo sem
  compromisso e que a regulamentacao e os precos atuais ainda fazem o
  investimento valer. Mensagem curta, sem pressao.`,

  // Toques 6 em diante (cadencia infinita ate cliente responder ou opt-out)
  // Espacamento: 90d, 180d, 365d, depois +1 ano cada.
  6: `Toque 6 — Tom de "ola, lembra de mim?" (90 dias depois). Reapresente-se
  rapidinho (Eva, engenheira virtual da Ecosunpower) caso o cliente tenha
  esquecido. Use o ARTIGO do Canal Solar pra trazer uma novidade do mercado.
  Mensagem curta, leve, sem pressao. Termine deixando a porta aberta.`,

  7: `Toque 7 — Tom factual e atualizado (180 dias / 6 meses depois). Use o
  ARTIGO do Canal Solar pra dar uma atualizacao do setor (tarifa, regulacao,
  tecnologia). Posicione Ecosunpower como autoridade tecnica. Sem pressao,
  apenas mantendo o contato vivo.`,

  8: `Toque 8 — Tom de "passou 1 ano, vamos ver de novo?" (365 dias / 1 ano).
  Use o ARTIGO do Canal Solar pra mostrar como o setor evoluiu nesse tempo.
  Tom: "passou um tempo desde nossa ultima conversa, queria te mostrar
  como o cenario mudou". Aberto, sem cobranca.`,

  9: `Toque 9 — Tom de novidade pontual (1+ ano depois). Use o ARTIGO do Canal
  Solar pra trazer um update relevante do mercado solar (nova tecnologia,
  mudanca regulatoria, etc). Mensagem curta, util, sem pressao.`,

  10: `Toque 10 — Tom de "soft check-in anual" (1+ ano depois). Use o ARTIGO
  do Canal Solar pra reflexao final do periodo. Tom: "olha, fica comigo
  registrado que estou aqui — quando precisar de qualquer coisa sobre solar,
  e so me chamar". Curto, sincero, sem cobranca.`,
};

/**
 * Resolve a guidance pra um step. Pra steps > 10 (cadencia infinita continua),
 * rotaciona entre as guidances 6-10 (variando o tom de check-in anual).
 */
function pickGuidanceForStep(step: number): string {
  if (step <= 10) return STEP_GUIDANCE[step];
  // Cadencia infinita pos-10: rotaciona entre guidances de check-in anual (6-10).
  const rotation = ((step - 11) % 5) + 6;
  return STEP_GUIDANCE[rotation];
}

/**
 * Adapter minimo do WABA pra cadencia poder mandar template quando janela 24h
 * estiver fechada. Recebe so o que precisa — facilita teste e desacopla do
 * cliente concreto.
 */
export interface CadenceTemplateSender {
  sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    components?: TemplateComponent[],
  ): Promise<{ messageId: string }>;
}

export class CadenceService {
  private articles: ParsedArticle[] = [];
  private articlesLoadedAt: number = 0;
  private static readonly ARTICLES_TTL_MS = 30 * 60 * 1000; // recarrega a cada 30min

  // Template aprovado pro fallback quando janela 24h fecha.
  // Aprovado pelo Meta em 13/05/2026. Body: {{1}} = primeiro nome.
  private static readonly REACTIVATION_TEMPLATE_NAME = 'reativacao_lead_v1';
  private static readonly REACTIVATION_TEMPLATE_LANG = 'pt_BR';

  constructor(
    private supabase: SupabaseService,
    private anthropic: Anthropic,
    private sendText: (to: string, text: string) => Promise<void>,
    private metaWaba: CadenceTemplateSender | null = null,
  ) {}

  /**
   * Carrega artigos do canal-solar.md se ainda nao carregou ou se expirou
   * o TTL (a base e re-ingerida a cada 3 dias pelo scheduler de canal-solar).
   */
  private loadArticles(): ParsedArticle[] {
    const now = Date.now();
    if (this.articles.length > 0 && (now - this.articlesLoadedAt) < CadenceService.ARTICLES_TTL_MS) {
      return this.articles;
    }

    try {
      const path = join(__dirname, '..', '..', 'conhecimento', 'especializado', 'canal-solar.md');
      const content = readFileSync(path, 'utf-8');
      this.articles = this.parseArticles(content);
      this.articlesLoadedAt = now;
      console.log(`[cadence] Loaded ${this.articles.length} artigos do canal-solar.md`);
    } catch (err) {
      console.error('[cadence] Erro ao ler canal-solar.md:', (err as Error).message);
      this.articles = [];
    }
    return this.articles;
  }

  /**
   * Parseia o canal-solar.md no formato:
   *   ## Titulo
   *   - Data: 2026-04-10
   *   - Link: https://...
   *   <linha em branco>
   *   Resumo do artigo.
   */
  private parseArticles(content: string): ParsedArticle[] {
    const sections = content.split(/^## /m).slice(1); // primeiro split eh o cabecalho
    const result: ParsedArticle[] = [];

    for (const section of sections) {
      const lines = section.split('\n');
      const title = lines[0].trim();
      const dateMatch = section.match(/- Data:\s*(\S+)/);
      const linkMatch = section.match(/- Link:\s*(\S+)/);

      // Resumo: tudo apos a linha em branco que vem depois do Link
      const linkLineIdx = lines.findIndex((l) => l.startsWith('- Link:'));
      const summaryLines = lines.slice(linkLineIdx + 1)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      const summary = summaryLines.join(' ').trim();

      if (title && summary) {
        result.push({
          title,
          date: dateMatch?.[1] ?? '',
          link: linkMatch?.[1] ?? '',
          summary,
        });
      }
    }

    return result;
  }

  /**
   * Seleciona 1 artigo deterministico baseado em (lead_id + step) pra que
   * dois clientes recebam artigos diferentes no mesmo dia, e o MESMO
   * cliente receba artigos diferentes em cada toque.
   */
  private pickArticle(leadId: string, step: number): ParsedArticle | undefined {
    const articles = this.loadArticles();
    if (articles.length === 0) return undefined;

    // Hash simples deterministico
    const seed = `${leadId}:${step}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % articles.length;
    return articles[idx];
  }

  /**
   * Processa todos os toques vencidos dentro do horario comercial BRT.
   * Fora de 9h-20h, nao envia (a intencao e parecer atendimento humano, nao robo 24/7).
   */
  async processCadence(): Promise<number> {
    const now = new Date();
    const brtHour = (now.getUTCHours() - 3 + 24) % 24;
    if (brtHour < 9 || brtHour >= 20) {
      return 0; // fora do horario comercial, espera proxima janela
    }

    const due = await this.supabase.getDueCadenceSteps();
    if (due.length === 0) return 0;

    let sent = 0;
    for (const row of due) {
      try {
        const locked = await this.supabase.lockCadenceForSending(row.id);
        if (!locked) {
          console.log(`[cadence] Step ${row.step} do lead ${row.lead_id} nao travado (cancelado ou outro processo)`);
          continue;
        }

        // Janela WABA 24h: se cliente NAO respondeu nas ultimas 24h, texto
        // livre vai falhar. So template aprovado chega. Toque 1 normalmente
        // tem janela aberta (lead acabou de qualificar); toques 2+ quase
        // sempre estao fora — template e a unica forma.
        //
        // `isWithin24hWindow` retorna:
        //   true  -> janela aberta (msg do user < 24h)
        //   false -> janela fechada (msg do user >= 24h)
        //   null  -> nao sabe (sem conversa, sem msg de user, erro)
        //
        // Tratamento de `null`:
        //  - Toque 1 (D+0): lead acabou de qualificar, presume aberta. Texto Claude.
        //  - Toques 2+: presume fechada (default seguro), usa template.
        const windowOpen = await this.supabase.isWithin24hWindow(row.lead_id);
        const shouldUseTemplate =
          windowOpen === false || (windowOpen === null && row.step > 1);

        let messageLog: string;
        let modo: 'texto' | 'template' = 'texto';

        if (shouldUseTemplate) {
          // Fora da janela: tem que ser template. Se nao temos metaWaba (Evolution
          // puro), nao da pra mandar template — skipa o toque sem marcar enviado
          // pra nao quebrar a continuacao. Cliente nao recebe nada hoje, proxima
          // janela tenta de novo. Eh melhor que mandar texto que vai falhar
          // silencioso e ainda agendar o proximo (perdendo o toque).
          if (!this.metaWaba) {
            console.warn(`[cadence] toque ${row.step} pra ${row.phone}: janela fechada e sem WABA — skip`);
            await this.supabase.unlockCadence(row.id).catch(() => {});
            continue;
          }
          const firstName = (row.name ?? '').split(' ')[0] || 'tudo bem';
          await this.metaWaba.sendTemplate(
            row.phone,
            CadenceService.REACTIVATION_TEMPLATE_NAME,
            CadenceService.REACTIVATION_TEMPLATE_LANG,
            [{ type: 'body', parameters: [{ type: 'text', text: firstName }] }],
          );
          messageLog = `[template:${CadenceService.REACTIVATION_TEMPLATE_NAME} {{1}}=${firstName}]`;
          modo = 'template';
        } else {
          // Janela aberta (cliente respondeu < 24h, OU toque 1 sem registro): texto Claude.
          const article = row.step >= 2 ? this.pickArticle(row.lead_id, row.step) : undefined;
          const text = await this.generateMessage({
            clientName: row.name,
            step: row.step,
            article,
          });
          await this.sendBubbles(row.phone, text);
          messageLog = text;
        }

        await this.supabase.markCadenceSent(row.id, messageLog);
        sent++;
        console.log(`[cadence] Toque ${row.step} enviado pra ${row.phone} (${row.name ?? 'sem nome'}) modo=${modo} janela24h=${windowOpen}`);

        // Cadencia infinita: apos enviar com sucesso, se nao houver mais
        // toques pendentes pra este lead, agenda o proximo (+1 ano). Continua
        // ate cliente responder (que cancela cadencia) ou opt_out.
        await this.supabase.scheduleCadenceContinuation(row.lead_id, row.step).catch((err) => {
          console.warn(`[cadence] scheduleCadenceContinuation falhou pra lead ${row.lead_id}:`, (err as Error).message);
        });

        await new Promise((r) => setTimeout(r, 1500 + Math.random() * 2500));
      } catch (err) {
        console.error(`[cadence] Falha ao enviar toque ${row.step} pra ${row.phone}:`, (err as Error).message);
        await this.supabase.unlockCadence(row.id).catch(() => {});
      }
    }

    return sent;
  }

  private async generateMessage(ctx: StepContext): Promise<string> {
    const nameHint = ctx.clientName
      ? `O nome do cliente eh "${ctx.clientName}". Chame ele pelo primeiro nome de forma natural (ex: "Oi Rodrigo,"). Evite nomes compostos ou sufixos como "CL Neemias" — use SO o primeiro nome.`
      : `Nao sabemos o nome do cliente, comece com um "Oi," informal.`;

    const articleContext = ctx.article
      ? `\n\nARTIGO DE BASE (Canal Solar — ${ctx.article.date}):
TITULO: ${ctx.article.title}
RESUMO: ${ctx.article.summary}

INSTRUCOES SOBRE O ARTIGO:
- Use APENAS as informacoes deste artigo. NAO invente dados, percentuais,
  valores ou estatisticas que nao estao explicitos acima.
- NAO mencione "Canal Solar" como fonte (Eva fala como expertise propria).
- NAO compartilhe o link cru. Se quiser referenciar, diga "vi uma materia
  recente sobre isso" ou "tava acompanhando o mercado e..."
- Adapte o conteudo ao cliente: se o artigo eh tecnico demais (ex: BESS,
  ESG, ANEEL), traduz pra linguagem de cliente final ("bateria", "governanca",
  "regras do governo").
- Se o artigo nao se encaixa bem com o objetivo do toque ${ctx.step},
  use a temantica geral mas sem forcar — pode ser uma referencia de canto.`
      : '';

    const systemPrompt = `Voce eh a Eva, engenheira virtual especialista em energia da Ecosunpower (Brasilia/DF e entorno).
Seu papel: enviar UMA mensagem curta de reengajamento em WhatsApp pra um cliente que ja conhece o Junior pessoalmente
mas AINDA NAO COMPROU sistema solar com a Ecosunpower. Objetivo: ajuda-lo a tomar a decisao de adquirir.

REGRAS OBRIGATORIAS:
- Escreva em portugues brasileiro informal, tom de conversa humana de WhatsApp.
- NUNCA use "Ola" (muito formal). Use "Oi".
- NUNCA mencione que voce eh IA, bot, ou automatizada.
- NUNCA prometa "zerar conta de luz" (proibido por lei e politica da empresa).
- NUNCA mencione a marca "Growatt" (banida na empresa).
- NUNCA presume que o cliente ja tem sistema solar — fale como quem ainda esta decidindo.
- Pode mencionar marcas premium quando fizer sentido: Trina, Jinko, SolarEdge, Deye, Sungrow.
- Mensagem deve ter 3-5 frases no maximo (em 1-2 paragrafos separados por linha em branco).
- Pode usar no maximo 1 emoji, e de forma sutil.
- Nao assine a mensagem (nao colocar "Eva" ou "Junior" no final).
- NUNCA invente percentuais, datas, valores ou estatisticas. Se for citar dado,
  use SOMENTE o que esta no artigo fornecido (se houver).

${nameHint}
${articleContext}

${pickGuidanceForStep(ctx.step)}`;

    const response = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `Gere agora a mensagem do toque ${ctx.step}.` },
      ],
    });

    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') throw new Error('Claude nao retornou texto');
    return block.text.trim();
  }

  /**
   * Envia mensagem quebrada em bolhas separadas por linha em branco,
   * com delay 0.9-2.1s entre elas pra parecer digitacao humana.
   */
  private async sendBubbles(to: string, text: string): Promise<void> {
    const bubbles = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    for (const bubble of bubbles) {
      await this.sendText(to, bubble);
      if (bubble !== bubbles[bubbles.length - 1]) {
        const delay = 900 + Math.random() * 1200;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
}
