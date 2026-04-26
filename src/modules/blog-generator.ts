import Anthropic from '@anthropic-ai/sdk';
import { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Blog Generator — gera drafts de posts pro blog ecosunpower.eng.br baseados
 * em artigos do Canal Solar + perspectiva EcoSunPower (Brasilia/DF, mercado
 * Greener 2026, expertise tecnica). Sai 1 draft a cada 3 dias por padrao,
 * Junior aprova via WhatsApp ("publicar") e o publish-via-github-api commita
 * direto no repo do site (auto-deploy Cloudflare em ~2 min).
 */

export interface BlogDraft {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: 'tecnico' | 'tecnologia' | 'mercado' | 'regulacao' | 'casos' | 'tutorial';
  tags: string[];
  contentMd: string; // markdown completo (frontmatter + body)
  readingTime: number;
  sourceAttribution?: string;
  generatedAt: string;
  approvedAt?: string;
  publishedAt?: string;
  status: 'pending' | 'approved' | 'published' | 'discarded' | 'failed';
}

interface ParsedArticle {
  title: string;
  date: string;
  link: string;
  summary: string;
}

const TOPIC_ROTATION: Array<BlogDraft['category']> = [
  'mercado',     // dia 0
  'tecnico',     // dia 3
  'tecnologia',  // dia 6
  'regulacao',   // dia 9
  'tutorial',    // dia 12
  'casos',       // dia 15
];

export class BlogGenerator {
  private articlesCache: ParsedArticle[] = [];
  private articlesLoadedAt = 0;

  constructor(
    private anthropic: Anthropic,
    private supabase: SupabaseClient,
    private knowledgeBaseDir: string,
  ) {}

  /**
   * Carrega artigos do canal-solar.md (atualizados pelo scheduler de
   * canal-solar.ts a cada 3 dias).
   */
  private loadCanalSolarArticles(): ParsedArticle[] {
    const ttlMs = 6 * 60 * 60 * 1000; // 6h cache
    if (this.articlesCache.length > 0 && Date.now() - this.articlesLoadedAt < ttlMs) {
      return this.articlesCache;
    }
    try {
      const path = join(this.knowledgeBaseDir, 'especializado', 'canal-solar.md');
      if (!existsSync(path)) {
        console.warn('[blog-generator] canal-solar.md nao encontrado em', path);
        return [];
      }
      const content = readFileSync(path, 'utf-8');
      this.articlesCache = this.parseArticles(content);
      this.articlesLoadedAt = Date.now();
      console.log(`[blog-generator] Loaded ${this.articlesCache.length} artigos do Canal Solar`);
      return this.articlesCache;
    } catch (err) {
      console.error('[blog-generator] Erro lendo canal-solar.md:', (err as Error).message);
      return [];
    }
  }

  private parseArticles(md: string): ParsedArticle[] {
    const articles: ParsedArticle[] = [];
    // Formato: ## TITULO\nData: ...\nLink: ...\nResumo: ...
    const sections = md.split(/^##\s+/m).slice(1);
    for (const section of sections) {
      const lines = section.split('\n').filter(Boolean);
      const title = lines[0]?.trim();
      if (!title) continue;
      const dateMatch = section.match(/Data:\s*(.+)/i);
      const linkMatch = section.match(/Link:\s*(.+)/i);
      const summaryMatch = section.match(/Resumo:\s*([\s\S]+?)(?=\n##|\n---|$)/i);
      articles.push({
        title,
        date: dateMatch?.[1]?.trim() ?? '',
        link: linkMatch?.[1]?.trim() ?? '',
        summary: summaryMatch?.[1]?.trim() ?? '',
      });
    }
    return articles;
  }

  /**
   * Gera 1 draft de blog post pronto pra publicar. Retorna o draft completo
   * com markdown frontmatter+body. Pode falhar se nao houver artigos
   * disponiveis ou se a API do Claude falhar (raro).
   */
  async generateDraft(opts?: { category?: BlogDraft['category']; topicHint?: string }): Promise<BlogDraft> {
    const articles = this.loadCanalSolarArticles();
    if (articles.length === 0) {
      throw new Error('Nenhum artigo disponivel no Canal Solar pra basear o post');
    }

    const category = opts?.category ?? this.pickRotatedCategory();
    const topArticles = articles.slice(0, 5); // top 5 mais recentes

    const systemPrompt = this.buildSystemPrompt(category);
    const userPrompt = this.buildUserPrompt(topArticles, category, opts?.topicHint);

    const response = await this.anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 8000,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    if (!text) throw new Error('Resposta vazia do Claude');

    const draft = this.parseGeneratedPost(text);
    const id = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const blogDraft: BlogDraft = {
      id,
      ...draft,
      category,
      generatedAt: new Date().toISOString(),
      status: 'pending',
    };

    // Salva no Supabase pra Junior aprovar depois
    await this.saveDraft(blogDraft);

    return blogDraft;
  }

  private pickRotatedCategory(): BlogDraft['category'] {
    const daysSinceEpoch = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    const idx = Math.floor(daysSinceEpoch / 3) % TOPIC_ROTATION.length;
    return TOPIC_ROTATION[idx];
  }

  private buildSystemPrompt(category: BlogDraft['category']): string {
    const categoryDesc: Record<typeof category, string> = {
      tecnico: 'tecnico — dimensionamento, ROI, instalacao, calculos praticos',
      tecnologia: 'tecnologia — TOPCon, HJT, baterias LFP, microinversores, otimizadores',
      mercado: 'mercado — precos Greener, tendencias, comparativos por regiao',
      regulacao: 'regulacao — Lei 14.300, ANEEL, MMGD, fio B, normas',
      casos: 'casos praticos — exemplos reais aplicaveis a Brasilia/DF e Goias',
      tutorial: 'tutorial — passo-a-passo (ler conta, escolher equipamento, etc)',
    };

    return `Voce e Junior Candido Rodrigues, engenheiro responsavel da Ecosunpower Energia Solar (Brasilia-DF e Goias). Escreve um post de blog tecnico e profissional pro site ecosunpower.eng.br.

CATEGORIA DESTE POST: ${categoryDesc[category]}

REGRAS DE ESCRITA:
1. **Portugues brasileiro CORRETO** com TODOS os acentos, til, cedilhas. Cliente de alto padrao avalia pela escrita.
2. **Original**, nunca copia o artigo fonte. Reescreve com perspectiva EcoSunPower e dados do mercado de Brasilia/Goias.
3. **1500-1800 palavras**, denso, util. Sem fluff ou repeticao.
4. **Estrutura SEO:** H1 (titulo), H2 (5-7 secoes principais), H3 quando precisar. Listas e tabelas quando ajudar.
5. **Dados especificos** sempre que possivel: preco R$/kWp Greener jan/2026, tarifa Neoenergia-DF (R$ 1,05/kWh medio), HSP Brasilia 5,2h, payback 3,5-5 anos.
6. **Internal links** pra outros conceitos: "veja nosso outro post sobre X" (use links relativos hipoteticos /blog/slug).
7. **CTA suave** ao final mencionando WhatsApp da EcoSunPower e atendimento em Brasilia + Entorno (ate 100km de Goias).
8. **NAO use emojis no body**. Apenas linguagem profissional.
9. **NAO se apresenta** ("eu sou Junior..."). O autor ja aparece nos metadados.
10. **Cita a fonte** com link no final ("Inspirado em artigo do Canal Solar: [link]").

FORMATO DE SAIDA OBRIGATORIO (JSON estrito, sem nada antes ou depois):

{
  "title": "Titulo otimizado pra SEO (60-80 chars)",
  "description": "Meta description SEO (140-160 chars). Direta, sem clickbait.",
  "slug": "slug-amigavel-com-hifens-sem-acento",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "readingTime": 8,
  "sourceAttribution": "Artigo original publicado em <data> no Canal Solar — <link>",
  "body": "## Primeira H2\\n\\nParagrafo...\\n\\n## Segunda H2\\n..."
}

O body NAO inclui a H1 (o titulo), porque o layout ja renderiza ela separadamente. Comece direto pela primeira H2.

Markdown valido, sem code blocks decorativos. Use **negrito** com moderacao.`;
  }

  private buildUserPrompt(articles: ParsedArticle[], category: BlogDraft['category'], topicHint?: string): string {
    const articlesList = articles.slice(0, 5).map((a, i) => {
      return `${i + 1}. **${a.title}** (${a.date})\n   Link: ${a.link}\n   Resumo: ${a.summary.slice(0, 500)}`;
    }).join('\n\n');

    return `Categoria do post: ${category}
${topicHint ? `Hint de topico: ${topicHint}` : ''}

Artigos recentes do Canal Solar (use 1 como base, escolha o mais relevante pra Brasilia/DF e Goias):

${articlesList}

Tarefa: escolha o artigo mais util pro publico EcoSunPower (clientes em Brasilia, residencias premium, comercios, industrias do DF e Goias) e escreva o post completo seguindo as regras do system prompt. Lembre que tarifa atual em Brasilia e Neoenergia-DF (~R$ 1,05/kWh), em Goias e Equatorial-GO. Pesquisa Greener jan/2026 traz precos R$ 3.400/kWp residencial, R$ 2.800 comercial, R$ 3.600 rural, R$ 2.200 industrial. Payback 3,5-5 anos.

Responda apenas o JSON.`;
  }

  private parseGeneratedPost(text: string): Omit<BlogDraft, 'id' | 'generatedAt' | 'status' | 'category'> {
    // Extrai JSON do texto (Claude as vezes envolve em ```json ... ```)
    let json = text.trim();
    const jsonBlockMatch = json.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
    if (jsonBlockMatch) json = jsonBlockMatch[1];
    const firstBrace = json.indexOf('{');
    const lastBrace = json.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      json = json.slice(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(json) as {
      title: string;
      description: string;
      slug: string;
      tags: string[];
      readingTime: number;
      sourceAttribution?: string;
      body: string;
    };

    // Monta o markdown completo com frontmatter
    const today = new Date().toISOString().split('T')[0];
    const frontmatter = [
      '---',
      `title: ${JSON.stringify(parsed.title)}`,
      `description: ${JSON.stringify(parsed.description)}`,
      `pubDate: ${today}`,
      `category: ${''}`, // preenchido depois
      `tags: ${JSON.stringify(parsed.tags)}`,
      `readingTime: ${parsed.readingTime}`,
      parsed.sourceAttribution ? `sourceAttribution: ${JSON.stringify(parsed.sourceAttribution)}` : '',
      'draft: false',
      '---',
      '',
      parsed.body,
    ].filter(Boolean).join('\n');

    return {
      slug: parsed.slug,
      title: parsed.title,
      description: parsed.description,
      tags: parsed.tags,
      contentMd: frontmatter,
      readingTime: parsed.readingTime,
      sourceAttribution: parsed.sourceAttribution,
    };
  }

  private async saveDraft(draft: BlogDraft): Promise<void> {
    const { error } = await this.supabase.from('blog_drafts').insert({
      id: draft.id,
      slug: draft.slug,
      title: draft.title,
      description: draft.description,
      category: draft.category,
      tags: draft.tags,
      content_md: draft.contentMd,
      reading_time: draft.readingTime,
      source_attribution: draft.sourceAttribution ?? null,
      status: draft.status,
      generated_at: draft.generatedAt,
    });
    if (error) {
      console.error('[blog-generator] Falha ao salvar draft:', error.message);
      throw error;
    }
  }

  async getPendingDrafts(): Promise<BlogDraft[]> {
    const { data, error } = await this.supabase
      .from('blog_drafts')
      .select('*')
      .eq('status', 'pending')
      .order('generated_at', { ascending: false })
      .limit(10);
    if (error) {
      console.error('[blog-generator] Falha ao listar pendings:', error.message);
      return [];
    }
    return (data ?? []).map(this.fromRow);
  }

  async getMostRecentPending(): Promise<BlogDraft | null> {
    const drafts = await this.getPendingDrafts();
    return drafts[0] ?? null;
  }

  async markApproved(draftId: string): Promise<void> {
    await this.supabase
      .from('blog_drafts')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', draftId);
  }

  async markPublished(draftId: string): Promise<void> {
    await this.supabase
      .from('blog_drafts')
      .update({ status: 'published', published_at: new Date().toISOString() })
      .eq('id', draftId);
  }

  async markDiscarded(draftId: string, reason?: string): Promise<void> {
    await this.supabase
      .from('blog_drafts')
      .update({
        status: 'discarded',
        discarded_at: new Date().toISOString(),
        discarded_reason: reason ?? null,
      })
      .eq('id', draftId);
  }

  async markFailed(draftId: string, error: string): Promise<void> {
    await this.supabase
      .from('blog_drafts')
      .update({ status: 'failed', failed_reason: error })
      .eq('id', draftId);
  }

  private fromRow(row: Record<string, unknown>): BlogDraft {
    return {
      id: row.id as string,
      slug: row.slug as string,
      title: row.title as string,
      description: row.description as string,
      category: row.category as BlogDraft['category'],
      tags: (row.tags as string[]) ?? [],
      contentMd: row.content_md as string,
      readingTime: (row.reading_time as number) ?? 8,
      sourceAttribution: (row.source_attribution as string) ?? undefined,
      generatedAt: row.generated_at as string,
      approvedAt: (row.approved_at as string) ?? undefined,
      publishedAt: (row.published_at as string) ?? undefined,
      status: row.status as BlogDraft['status'],
    };
  }
}

/**
 * Publica um draft no GitHub do site via API (commita arquivo md em
 * src/content/blog/<slug>.md). Cloudflare Pages auto-deploya em ~2 min.
 */
export async function publishDraftToGitHub(opts: {
  pat: string;
  repo: string; // formato "owner/repo"
  branch: string;
  draft: BlogDraft;
}): Promise<{ commitSha: string; url: string }> {
  const { pat, repo, branch, draft } = opts;
  const path = `src/content/blog/${draft.slug}.md`;
  const message = `feat(blog): publica "${draft.title}"`;

  // Garante que o frontmatter tem a category preenchida (foi colocada vazia no parse)
  const finalContent = draft.contentMd.replace(/^category: $/m, `category: ${draft.category}`);
  const contentBase64 = Buffer.from(finalContent, 'utf-8').toString('base64');

  // Verifica se arquivo ja existe (precisa do sha pra update)
  let sha: string | undefined;
  try {
    const checkRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`, {
      headers: { Authorization: `Bearer ${pat}`, 'User-Agent': 'ecosunpower-blog-bot' },
    });
    if (checkRes.ok) {
      const data = (await checkRes.json()) as { sha: string };
      sha = data.sha;
    }
  } catch {
    // arquivo nao existe, segue
  }

  const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${pat}`,
      'User-Agent': 'ecosunpower-blog-bot',
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
    },
    body: JSON.stringify({
      message,
      content: contentBase64,
      branch,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!putRes.ok) {
    const errText = await putRes.text();
    throw new Error(`GitHub API erro ${putRes.status}: ${errText}`);
  }

  const result = (await putRes.json()) as { commit: { sha: string; html_url: string } };
  return { commitSha: result.commit.sha, url: result.commit.html_url };
}
