import Anthropic from '@anthropic-ai/sdk';
import { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { ImageGenerator } from './image-gen.js';

export type PostTopicType =
  | 'objecao_desmistificada'
  | 'dica_tecnica'
  | 'economia_antes_depois'
  | 'curiosidade_setor'
  | 'lei_regulacao'
  | 'comparativo';

export interface GeneratedDraft {
  id: string;
  topic: string;
  topic_type: PostTopicType;
  caption: string;
  image_prompt: string;
  image_url: string;
  approval_token: string;
}

const SYSTEM_PROMPT = `Voce e o gerador de conteudo de marketing da Ecosunpower Energia Solar — empresa de energia fotovoltaica em Brasilia/DF e Goias desde 2019. Seu trabalho e criar posts para Instagram e Facebook que educam, geram conexao e atraem leads.

Diretrizes de estilo:
- Tom: brasileiro, proximo, confiavel, sem ser vendedor agressivo
- Foco em DOR do cliente (conta de luz alta, quedas de energia) e SOLUCAO (solar, bateria)
- Use linguagem simples, sem jargao excessivo
- Para Instagram: 4-8 linhas, emoji ocasional e estrategico (nao exagere), hashtags relevantes no final (5-10)
- Publico-alvo: classe media e media alta de Brasilia/DF/Goias, donos de casa propria, pequenos comercios, fazendeiros

Regras obrigatorias:
- Nunca prometa "zerar conta de luz" — fale em "reducao de ate 95%"
- Nunca minta numeros ou prazos
- Sempre termine com chamada sutil pra acao (DM, link na bio, WhatsApp)
- Mencione "Ecosunpower" naturalmente, nao agressivo
- Regiao: Brasilia/Goias (menciona quando fizer sentido)

Tipos de post (rotacionamos):
- objecao_desmistificada: desmonta mito comum ("solar nao vale a pena") com dados
- dica_tecnica: explica conceito tecnico em linguagem simples (Fio B, GD, oversize, etc)
- economia_antes_depois: valor ANTES do solar vs DEPOIS (use numeros realistas pro perfil do publico)
- curiosidade_setor: fato interessante sobre solar/renovaveis (mercado, tecnologia)
- lei_regulacao: explica impacto da Lei 14.300, RN 1059, GD1/GD2/GD3
- comparativo: on-grid vs hibrido, diferentes potencias, diferentes publicos

Saida obrigatoria em JSON valido, sem markdown, sem comentarios:
{
  "topic": "string curta descrevendo o tema (5-10 palavras)",
  "topic_type": "objecao_desmistificada|dica_tecnica|economia_antes_depois|curiosidade_setor|lei_regulacao|comparativo",
  "caption": "o texto completo do post pronto pra Instagram/Facebook",
  "image_prompt": "descricao EM INGLES da imagem (FLUX 1.1 Pro). REGRAS: 1) Preferencia por composicoes cinematograficas, fotograficas realistas, tipo Getty Images ou Unsplash de alto padrao. 2) Se incluir PESSOA, seja UMA unica (retrato frontal ou 3/4), BRASILEIRA realista (nao modelo generico americano), traje casual ou camisa social casual, expressao autentica. Close-up ou plano medio. Fundo desfocado (bokeh). 3) Pra cenas sem pessoa: painel solar em close / telhado com paineis / paisagem do cerrado com usina / casa de classe media brasileira / fazenda com irrigacao solar / medidor de energia / conta de luz sobre mesa. 4) EVITE multidoes, familias grandes, varias pessoas juntas, criancas, cenas lotadas, fundos urbanos confusos. 5) Estilo: iluminacao natural golden hour, cores quentes e saturadas naturais (nao artificiais), nitidez alta no sujeito, profundidade de campo rasa quando apropriado. Nunca incluir texto em qualquer idioma dentro da imagem."
}`;

export class MarketingService {
  private anthropic: Anthropic;
  private supabase: SupabaseClient;
  private imageGen: ImageGenerator;

  constructor(anthropicApiKey: string, supabase: SupabaseClient, imageGen: ImageGenerator) {
    this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
    this.supabase = supabase;
    this.imageGen = imageGen;
  }

  async generateDraft(preferredType?: PostTopicType): Promise<GeneratedDraft> {
    // 1) Ask Claude for caption + image prompt
    const userPrompt = preferredType
      ? `Crie um post do tipo "${preferredType}". Retorne apenas o JSON, sem explicacoes.`
      : `Crie um post escolhendo um dos tipos disponiveis. Retorne apenas o JSON, sem explicacoes.`;

    const response = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Claude returned no JSON for marketing draft');

    let parsed: { topic: string; topic_type: PostTopicType; caption: string; image_prompt: string };
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (err) {
      throw new Error(`Invalid JSON from Claude: ${(err as Error).message}`);
    }

    // 2) Generate image via FLUX 1.1 Pro (photorealistic)
    const { url: tempUrl } = await this.imageGen.generate({
      prompt: parsed.image_prompt,
      aspectRatio: '1:1',
      outputFormat: 'jpg',
      outputQuality: 95,
    });

    // 3) Download and upload to Supabase Storage for permanent URL
    const { bytes, contentType } = await this.imageGen.downloadImage(tempUrl);
    const filename = `${Date.now()}-${randomBytes(4).toString('hex')}.jpg`;
    const { error: uploadErr } = await this.supabase.storage
      .from('marketing-images')
      .upload(filename, bytes, { contentType, upsert: false });
    if (uploadErr) throw new Error(`Failed to upload image: ${uploadErr.message}`);

    const { data: publicData } = this.supabase.storage
      .from('marketing-images')
      .getPublicUrl(filename);
    const imageUrl = publicData.publicUrl;

    // 4) Save draft in DB
    const approvalToken = randomBytes(16).toString('hex');
    const { data: draft, error: insertErr } = await this.supabase
      .from('marketing_drafts')
      .insert({
        topic: parsed.topic,
        caption: parsed.caption,
        image_prompt: parsed.image_prompt,
        image_url: imageUrl,
        platforms: ['instagram', 'facebook'],
        status: 'pending_approval',
        approval_token: approvalToken,
      })
      .select('id')
      .single();
    if (insertErr || !draft) throw new Error(`Failed to save draft: ${insertErr?.message}`);

    return {
      id: draft.id,
      topic: parsed.topic,
      topic_type: parsed.topic_type,
      caption: parsed.caption,
      image_prompt: parsed.image_prompt,
      image_url: imageUrl,
      approval_token: approvalToken,
    };
  }

  async getDraft(id: string) {
    const { data, error } = await this.supabase
      .from('marketing_drafts')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw new Error(`Draft not found: ${error.message}`);
    return data;
  }

  async markPublished(id: string, results: unknown) {
    const { error } = await this.supabase
      .from('marketing_drafts')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        published_results: results,
      })
      .eq('id', id);
    if (error) throw new Error(`Failed to mark published: ${error.message}`);
  }

  async markDiscarded(id: string) {
    const { error } = await this.supabase
      .from('marketing_drafts')
      .update({ status: 'discarded' })
      .eq('id', id);
    if (error) throw new Error(`Failed to discard: ${error.message}`);
  }

  // Validates a draft id + approval_token pair. Returns the draft if valid.
  async validateToken(id: string, token: string) {
    const { data, error } = await this.supabase
      .from('marketing_drafts')
      .select('*')
      .eq('id', id)
      .eq('approval_token', token)
      .single();
    if (error || !data) return null;
    return data;
  }

  // Regenerates only the image of an existing draft (keeps same caption).
  // Returns the updated draft.
  async regenerateImage(id: string) {
    const draft = await this.getDraft(id);
    if (draft.status !== 'pending_approval') {
      throw new Error(`Cannot regenerate: draft status is "${draft.status}"`);
    }
    const { url: tempUrl } = await this.imageGen.generate({
      prompt: draft.image_prompt ?? 'Fotografia profissional realista sobre energia solar',
      aspectRatio: '1:1',
      outputFormat: 'jpg',
      outputQuality: 95,
    });
    const { bytes, contentType } = await this.imageGen.downloadImage(tempUrl);
    const filename = `${Date.now()}-${randomBytes(4).toString('hex')}.jpg`;
    const { error: uploadErr } = await this.supabase.storage
      .from('marketing-images')
      .upload(filename, bytes, { contentType, upsert: false });
    if (uploadErr) throw new Error(`Failed to upload image: ${uploadErr.message}`);
    const { data: publicData } = this.supabase.storage
      .from('marketing-images')
      .getPublicUrl(filename);
    const newImageUrl = publicData.publicUrl;

    const { error: updateErr } = await this.supabase
      .from('marketing_drafts')
      .update({ image_url: newImageUrl })
      .eq('id', id);
    if (updateErr) throw new Error(`Failed to update image: ${updateErr.message}`);
    return { ...draft, image_url: newImageUrl };
  }

  // Auto-discards drafts older than N days still in pending_approval
  async autoDiscardStale(olderThanDays = 7): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.supabase
      .from('marketing_drafts')
      .update({ status: 'discarded' })
      .eq('status', 'pending_approval')
      .lt('created_at', cutoff)
      .select('id');
    if (error) throw new Error(`Failed to auto-discard: ${error.message}`);
    return data?.length ?? 0;
  }
}
