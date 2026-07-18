// src/modules/email/campanha.ts
// "Campanha via Eva": o Junior manda /campanha no WhatsApp → a Eva gera o e-mail
// de campanha (copy do Claude + imagem hero do FLUX com a logo da marca) → manda
// um preview pro Junior no zap com botões (aprovar/refazer/descartar) → ao
// aprovar, dispara pra TODA a base elegível (campanha é avulsa, diferente da
// régua automática da email_sequencia).
//
// Espelha os padrões já existentes: geração igual MarketingService.generateDraft
// (Claude JSON puro + FLUX + applyBrandLogo + upload no bucket público), moldura
// igual a jornada (montarMolduraEmail + dicaDoDia + notícias do blog), envio via
// EmailSender e registro na espinha do Elo (registrarEvento).

import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import type { ImageGenerator } from '../image-gen.js';
import type { EmailSender } from './resend-client.js';
import { applyBrandLogo } from '../marketing/branded-frame.js';
import { montarMolduraEmail, type NoticiaBlog } from './email-moldura.js';
import { buscarNoticiasBlog } from './blog-noticias.js';
import { dicaDoDia } from './dicas-de-ouro.js';
import { registrarEvento } from '../elo/eventos.js';

const RSS_URL_PADRAO = 'https://www.ecosunpower.eng.br/rss.xml';

// Temas rotativos (plano aprovado). Rotação determinística pelo dia (mesmo dia =
// mesmo tema; testável), a menos que o Junior passe um tema livre no /campanha.
export const TEMAS_ROTATIVOS = [
  'quanto dá pra economizar',
  'caso de sucesso',
  'explicação técnica simples',
  'erros comuns na instalação',
  'financiamento',
  'condição especial',
];

export function temaRotativo(agora: Date = new Date()): string {
  const dias = Math.floor(agora.getTime() / (24 * 60 * 60 * 1000));
  return TEMAS_ROTATIVOS[dias % TEMAS_ROTATIVOS.length]!;
}

// Botões do preview no WhatsApp (WABA: no máx 3, título ≤ 20 chars). Fonte única
// usada pelo index (enviarPreview) e pelos testes. Ações: camp-ok/camp-re/camp-x.
export function botoesPreviewCampanha(id: string): Array<{ id: string; title: string }> {
  return [
    { id: `evabt:camp-ok:${id}`, title: '✅ Aprovar e enviar' },
    { id: `evabt:camp-re:${id}`, title: '🔄 Refazer' },
    { id: `evabt:camp-x:${id}`, title: '🗑️ Descartar' },
  ];
}

// Regras de imagem copiadas do SYSTEM_PROMPT do marketing.ts (marketing.ts:72):
// imagem SEM texto/número/símbolo monetário, fotográfica cinematográfica.
const REGRAS_IMAGEM =
  'REGRAS: composição cinematográfica, fotográfica realista (tipo Getty/Unsplash de alto padrão), ' +
  'iluminação natural golden hour, cores quentes naturais, profundidade de campo rasa. Cenas: painel solar em close, ' +
  'telhado com painéis, paisagem do cerrado com usina, casa de classe média brasileira, fazenda com irrigação solar. ' +
  'EVITE multidões, famílias grandes, crianças, fundos urbanos confusos. REGRA CRÍTICA DE TEXTO: a imagem NUNCA pode ' +
  "conter texto, letras, números, dígitos, símbolos monetários, letreiros, placas ou marcas d'água. Inclua SEMPRE no " +
  "prompt 'no text, no letters, no numbers, no digits, no currency symbols, no dollar signs, no signage, no watermark, " +
  "no typography, no writing of any kind' para forçar imagem limpa.";

const SYSTEM_PROMPT = `Você escreve o e-mail de campanha da EcoSunPower (energia solar, Brasília/DF e Goiás).
Responda SÓ JSON válido, sem markdown, sem comentários, com estes campos:
{
  "tema": "o tema desta campanha (string curta)",
  "assunto": "assunto do e-mail, 35 a 55 caracteres, direto, sem clickbait, sem número inventado",
  "kicker": "3 a 5 palavras em MAIÚSCULAS suaves (linha pequena acima do título)",
  "titulo": "título forte da campanha",
  "corpo_html": "2 a 3 parágrafos em HTML, cada um <p style=\\"margin:0 0 14px;\\">...</p>, linguagem simples, foco em POR QUE vale a pena (economia na conta, retorno, valorização do imóvel). SEM número inventado, SEM preço. Pode usar {{nome}} uma vez pra chamar a pessoa pelo primeiro nome.",
  "cta_label": "chamada curta do botão (ex: Quero economizar, Falar com a gente)",
  "image_prompt": "descrição EM INGLÊS da imagem hero (FLUX, cena solar fotográfica cinematográfica, sem texto/números). ${REGRAS_IMAGEM}"
}
Escreva em português brasileiro correto, com TODA a acentuação e a cedilha. Nunca prometa "zerar a conta". Nunca minta número ou prazo.`;

export interface CampanhaConteudo {
  tema: string;
  assunto: string;
  kicker: string;
  titulo: string;
  corpo_html: string;
  cta_label: string;
  image_prompt: string;
}

export interface CampanhaGerada {
  id: string;
  tema: string;
  assunto: string;
  kicker: string;
  titulo: string;
  corpo_html: string;
  cta_label: string;
  image_url: string;
}

export interface DestinatarioCampanha {
  id: string;
  email: string;
  name: string;
}

export interface CampanhaDeps {
  anthropic: Anthropic;
  imageGen: ImageGenerator;
  // SupabaseClient cru: usado nas operações diretas na tabela email_campanhas,
  // no Storage e como client do registrarEvento (que só precisa de .from()).
  supabase: SupabaseClient;
  sender: EmailSender;
  // Lista a base elegível pra campanha (reusa supabase.listarDestinatariosCampanha).
  listarDestinatarios: (max?: number) => Promise<DestinatarioCampanha[]>;
  // Manda o preview pro Junior no WhatsApp (imagem + botões). Injetado pelo index.
  enviarPreview: (c: CampanhaGerada) => Promise<void>;
  baseUrl: string;      // base do link de descadastro (/e/descadastro?lid=...)
  siteUrl?: string;     // URL do CTA/rodapé
  rssUrl?: string;      // feed do blog pra seção "Do nosso blog"
  empresa?: string;
  now?: () => Date;
}

// Corta a string no último espaço antes de `max` (não corta palavra no meio).
export function truncarNoLimiteDePalavra(s: string, max: number): string {
  const txt = String(s ?? '').trim();
  if (txt.length <= max) return txt;
  const corte = txt.slice(0, max);
  const ultimoEspaco = corte.lastIndexOf(' ');
  return (ultimoEspaco > 0 ? corte.slice(0, ultimoEspaco) : corte).trim();
}

// Parse defensivo do JSON da IA (mesma ideia do parseJsonIA/marketing): pega do
// primeiro '{' ao último '}', tenta parsear, e devolve SÓ os campos da whitelist
// (campo extra é descartado), com o assunto truncado em 70 no limite de palavra.
export function sanitizarCampanhaJson(raw: string): CampanhaConteudo {
  const texto = String(raw ?? '');
  const ini = texto.indexOf('{');
  const fim = texto.lastIndexOf('}');
  if (ini === -1 || fim === -1 || fim <= ini) {
    throw new Error('IA não devolveu JSON de campanha');
  }
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(texto.slice(ini, fim + 1)) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`JSON de campanha inválido: ${(err as Error).message}`);
  }
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  return {
    tema: str(obj.tema),
    assunto: truncarNoLimiteDePalavra(str(obj.assunto), 70),
    kicker: str(obj.kicker),
    titulo: str(obj.titulo),
    corpo_html: str(obj.corpo_html),
    cta_label: str(obj.cta_label) || 'Falar com a gente',
    image_prompt: str(obj.image_prompt),
  };
}

// DB row (email_campanhas) → objeto de campanha usado pra montar o e-mail.
function rowParaCampanha(row: any): CampanhaGerada {
  return {
    id: row.id,
    tema: row.tema ?? '',
    assunto: row.assunto ?? '',
    kicker: row.kicker ?? '',
    titulo: row.titulo ?? '',
    corpo_html: row.corpo_html ?? '',
    cta_label: row.cta_label ?? 'Falar com a gente',
    image_url: row.image_url ?? '',
  };
}

export class CampanhaService {
  constructor(private deps: CampanhaDeps) {}

  private agora(): Date {
    return (this.deps.now ?? (() => new Date()))();
  }

  // Gera uma campanha nova: Claude escreve o e-mail, FLUX gera a imagem hero (com
  // logo), grava a linha em email_campanhas (pendente) e manda o preview pro Junior.
  async gerar(temaOpcional?: string): Promise<{ id: string }> {
    const tema = (temaOpcional && temaOpcional.trim()) || temaRotativo(this.agora());

    const userPrompt = `Crie a campanha de e-mail com o tema: "${tema}".\nRetorne apenas o JSON, sem explicações.`;
    const response = await this.deps.anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const text = (response.content as any[])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    const conteudo = sanitizarCampanhaJson(text);

    // Imagem hero 16:9 (proporção de topo de e-mail) + logo da marca no canto.
    const { url } = await this.deps.imageGen.generate({
      prompt: conteudo.image_prompt,
      aspectRatio: '16:9',
      outputFormat: 'jpg',
      outputQuality: 95,
    });
    const dl = await this.deps.imageGen.downloadImage(url);
    const bytes = applyBrandLogo(dl.bytes, { width: 1280, height: 720 });
    const filename = `campanha-${Date.now()}-${randomBytes(4).toString('hex')}.png`;
    const { error: upErr } = await this.deps.supabase.storage
      .from('marketing-images')
      .upload(filename, bytes, { contentType: 'image/png', upsert: false });
    if (upErr) throw new Error(`Falha ao subir imagem da campanha: ${upErr.message}`);
    const imageUrl = this.deps.supabase.storage.from('marketing-images').getPublicUrl(filename).data.publicUrl;

    const ctaUrl = this.deps.siteUrl ?? 'https://www.ecosunpower.eng.br';
    const { data: inserted, error: insErr } = await this.deps.supabase
      .from('email_campanhas')
      .insert({
        status: 'pendente',
        tema: conteudo.tema || tema,
        assunto: conteudo.assunto,
        kicker: conteudo.kicker,
        titulo: conteudo.titulo,
        corpo_html: conteudo.corpo_html,
        cta_label: conteudo.cta_label,
        cta_url: ctaUrl,
        image_url: imageUrl,
      })
      .select('id, tema, assunto, kicker, titulo, corpo_html, cta_label, image_url')
      .single();
    if (insErr || !inserted) throw new Error(`Falha ao salvar campanha: ${insErr?.message}`);

    const campanha = rowParaCampanha(inserted);
    await this.deps.enviarPreview(campanha);
    return { id: campanha.id };
  }

  // Monta o HTML final do e-mail pra UM lead (moldura aprovada + imagem hero +
  // dica do dia + notícias). {{nome}} vira o primeiro nome (fallback "Olá!").
  montarHtmlParaLead(campanha: CampanhaGerada, lead: DestinatarioCampanha, noticias: NoticiaBlog[] = []): string {
    const primeiroNome = (lead.name || '').trim().split(/\s+/)[0] || 'Olá!';
    const corpoHtml = (campanha.corpo_html || '').split('{{nome}}').join(primeiroNome);
    const linkDescadastro = `${this.deps.baseUrl}/e/descadastro?lid=${lead.id}`;
    const ctaUrl = this.deps.siteUrl ?? 'https://www.ecosunpower.eng.br';
    return montarMolduraEmail({
      conteudoHtml: corpoHtml,
      linkDescadastro,
      noticias,
      empresa: this.deps.empresa,
      siteUrl: this.deps.siteUrl,
      heroImageUrl: campanha.image_url,
      kicker: campanha.kicker,
      titulo: campanha.titulo,
      ctaLabel: campanha.cta_label,
      ctaUrl,
      dica: dicaDoDia(this.agora()),
    });
  }

  // Aprova e dispara: carrega a campanha pendente, lista a base, busca notícias 1x,
  // e envia lead a lead (erro num lead não para o loop). Marca 'enviada' no fim.
  async aprovar(id: string): Promise<{ enviados: number }> {
    const { data: row, error } = await this.deps.supabase
      .from('email_campanhas')
      .select('id, status, tema, assunto, kicker, titulo, corpo_html, cta_label, image_url')
      .eq('id', id)
      .single();
    if (error || !row) throw new Error(`Campanha ${id} não encontrada`);
    if (row.status !== 'pendente') throw new Error(`Campanha ${id} não está pendente (status=${row.status})`);

    const campanha = rowParaCampanha(row);
    const leads = await this.deps.listarDestinatarios(1000);
    const noticias = await buscarNoticiasBlog(this.deps.rssUrl ?? RSS_URL_PADRAO).catch(() => []);

    let enviados = 0;
    let falhas = 0;
    for (const lead of leads) {
      try {
        const html = this.montarHtmlParaLead(campanha, lead, noticias);
        const msgId = await this.deps.sender.enviar({ to: lead.email, subject: campanha.assunto, html });
        await registrarEvento(this.deps.supabase, {
          tipo: 'email_enviado',
          leadId: lead.id,
          canal: 'email',
          departamento: 'marketing',
          origem: 'email-campanha',
          payload: { campanha_id: id, subject: campanha.assunto, provider_message_id: msgId },
        });
        enviados++;
      } catch (err) {
        falhas++;
        console.warn(`[campanha] falhou pro lead ${lead.id} (${lead.email}):`, (err as Error)?.message);
      }
      await new Promise((r) => setTimeout(r, 150));
    }

    await this.deps.supabase
      .from('email_campanhas')
      .update({ status: 'enviada', enviados, atualizado_em: new Date().toISOString() })
      .eq('id', id);
    console.log(`[campanha] ${id}: enviados=${enviados}, falhas=${falhas} (de ${leads.length} elegíveis)`);
    return { enviados };
  }

  // Refaz: descarta a atual e gera uma nova (com novo preview).
  async refazer(id: string): Promise<{ id: string }> {
    await this.descartar(id);
    return this.gerar();
  }

  // Descarta: só marca como descartada (não envia nada).
  async descartar(id: string): Promise<void> {
    await this.deps.supabase
      .from('email_campanhas')
      .update({ status: 'descartada', atualizado_em: new Date().toISOString() })
      .eq('id', id);
  }
}
