import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { SupabaseClient } from '@supabase/supabase-js';

const GRAPH_API = 'https://graph.facebook.com/v21.0';

export interface LeadgenWebhookEntry {
  id: string; // page id
  changes: Array<{
    field: string;
    value: {
      leadgen_id: string;
      ad_id?: string;
      adgroup_id?: string;
      form_id?: string;
      page_id?: string;
      created_time?: number;
    };
  }>;
}

export interface LeadgenPayload {
  object: 'page';
  entry: LeadgenWebhookEntry[];
}

interface LeadFieldData {
  name: string;
  values: string[];
}

export interface LeadDetails {
  leadgen_id: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  form_name?: string;
  created_time?: string;
  field_data: LeadFieldData[];
}

export interface NormalizedLead {
  phone: string | null;
  name: string | null;
  email: string | null;
  city: string | null;
  extraFields: Record<string, string>;
  source: 'ad_ig_leadform' | 'ad_fb_leadform';
}

export class MetaLeadgenService {
  constructor(
    private appSecret: string,
    private verifyToken: string,
    private getPageToken: () => Promise<string>,
    private supabase: SupabaseClient,
    private anthropic: Anthropic,
  ) {}

  // Valida challenge inicial do Meta (subscribe do webhook).
  validateChallenge(mode: string, token: string): boolean {
    return mode === 'subscribe' && token === this.verifyToken;
  }

  // Valida HMAC da requisicao de evento. Meta envia signature no header
  // X-Hub-Signature-256 como 'sha256=<hex>'. Se nao bater, rejeita.
  validateSignature(rawBody: string, signatureHeader: string | undefined): boolean {
    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
    const expected = signatureHeader.slice(7);
    // SHA-256 em hex = 64 chars. Checa formato ANTES do timingSafeEqual pra
    // evitar buffers de tamanho diferente que jogam excecao.
    if (!/^[0-9a-f]{64}$/i.test(expected)) return false;
    const computed = crypto
      .createHmac('sha256', this.appSecret)
      .update(rawBody)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(computed, 'hex'),
    );
  }

  // Busca dados completos do lead via Graph API. Meta nao envia field_data
  // no webhook (GDPR) — temos que fazer esse GET apos receber o leadgen_id.
  async fetchLeadDetails(leadgenId: string): Promise<LeadDetails> {
    const pageToken = await this.getPageToken();
    const fields = [
      'id',
      'ad_id',
      'ad_name',
      'adset_id',
      'adset_name',
      'campaign_id',
      'campaign_name',
      'form_id',
      'created_time',
      'field_data',
    ].join(',');
    const res = await fetch(
      `${GRAPH_API}/${leadgenId}?fields=${fields}&access_token=${pageToken}`,
    );
    const data = await res.json() as Record<string, unknown> & { error?: { message: string } };
    if (!res.ok || data.error) {
      throw new Error(`Failed to fetch lead details: ${data.error?.message ?? res.statusText}`);
    }
    return {
      leadgen_id: leadgenId,
      ad_id: data.ad_id as string | undefined,
      ad_name: data.ad_name as string | undefined,
      adset_id: data.adset_id as string | undefined,
      adset_name: data.adset_name as string | undefined,
      campaign_id: data.campaign_id as string | undefined,
      campaign_name: data.campaign_name as string | undefined,
      form_id: data.form_id as string | undefined,
      created_time: data.created_time as string | undefined,
      field_data: (data.field_data as LeadFieldData[] | undefined) ?? [],
    };
  }

  // Extrai phone/name/email/city do field_data. Nomes dos campos do form
  // variam muito (pt/en, snake/kebab), entao tentamos varios matches.
  normalize(details: LeadDetails, platform: 'facebook' | 'instagram'): NormalizedLead {
    const fd: Record<string, string> = {};
    for (const f of details.field_data) {
      fd[f.name.toLowerCase()] = (f.values?.[0] ?? '').trim();
    }

    const pick = (...keys: string[]): string | null => {
      for (const k of keys) {
        const v = fd[k];
        if (v) return v;
      }
      return null;
    };

    const rawPhone = pick('phone_number', 'phone', 'telefone', 'celular', 'whatsapp');
    const phone = rawPhone ? normalizeBrazilianPhone(rawPhone) : null;

    const name = pick('full_name', 'first_name', 'name', 'nome', 'nome_completo');
    const email = pick('email', 'email_address', 'e-mail');
    const city = pick('city', 'cidade', 'municipio');

    // Qualquer outro campo (ex: "conta_de_luz", "tipo_de_imovel") vai pro extraFields
    // pra Eva usar na primeira mensagem.
    const known = new Set([
      'phone_number', 'phone', 'telefone', 'celular', 'whatsapp',
      'full_name', 'first_name', 'name', 'nome', 'nome_completo',
      'email', 'email_address', 'e-mail',
      'city', 'cidade', 'municipio',
    ]);
    const extraFields: Record<string, string> = {};
    for (const [k, v] of Object.entries(fd)) {
      if (!known.has(k) && v) extraFields[k] = v;
    }

    return {
      phone,
      name,
      email,
      city,
      extraFields,
      source: platform === 'instagram' ? 'ad_ig_leadform' : 'ad_fb_leadform',
    };
  }

  // Grava evento bruto em meta_leadgen_events (idempotente via unique index
  // em leadgen_id). Retorna `{ isNew }` pra chamador decidir se processa.
  async recordEvent(details: LeadDetails, rawPayload: unknown): Promise<{ isNew: boolean }> {
    const row = {
      leadgen_id: details.leadgen_id,
      ad_id: details.ad_id ?? null,
      ad_name: details.ad_name ?? null,
      adset_id: details.adset_id ?? null,
      adset_name: details.adset_name ?? null,
      campaign_id: details.campaign_id ?? null,
      campaign_name: details.campaign_name ?? null,
      form_id: details.form_id ?? null,
      raw_payload: rawPayload,
      processed: false,
    };
    const { error } = await this.supabase
      .from('meta_leadgen_events')
      .insert(row);
    if (error) {
      if (error.code === '23505') {
        // Ja tinha — webhook retry, ignora
        return { isNew: false };
      }
      throw new Error(`Failed to record leadgen event: ${error.message}`);
    }
    return { isNew: true };
  }

  async markEventProcessed(leadgenId: string, leadId: string): Promise<void> {
    await this.supabase
      .from('meta_leadgen_events')
      .update({ processed: true, lead_id: leadId })
      .eq('leadgen_id', leadgenId);
  }

  async markEventFailed(leadgenId: string, errorMessage: string): Promise<void> {
    await this.supabase
      .from('meta_leadgen_events')
      .update({ processed: false, error_message: errorMessage })
      .eq('leadgen_id', leadgenId);
  }

  // Gera primeira mensagem proativa pra Eva mandar. Curta, humana, sem
  // parecer script automatizado. Usa os dados do form pra personalizar.
  async generateWelcome(lead: NormalizedLead, details: LeadDetails, knowledgeBase: string): Promise<string> {
    const firstName = lead.name?.split(' ')[0] ?? '';
    const adContext = details.ad_name ? `anuncio: "${details.ad_name}"` : 'anuncio da Ecosunpower';
    const extras = Object.entries(lead.extraFields)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    const kbSnippet = knowledgeBase.slice(0, 2000); // primeiros chars pro contexto

    const prompt = `Voce e o Junior da Ecosunpower Energia Solar (Brasilia/DF e Goias). Um contato acabou de preencher o formulario do ${adContext} no ${lead.source === 'ad_ig_leadform' ? 'Instagram' : 'Facebook'} e voce vai mandar a PRIMEIRA mensagem pelo WhatsApp.

Dados do lead:
- Nome: ${lead.name ?? 'nao informado'}
- Cidade: ${lead.city ?? 'nao informada'}
${extras ? `- Outros dados do form:\n${extras}` : ''}

Contexto da empresa (use como referencia, nao copie):
${kbSnippet}

Regras estritas:
- MAXIMO 3-4 linhas curtas, tom WhatsApp natural
- Primeira pessoa, como se o Junior tivesse escrito
- Nao parece robo — "opa [nome]", "fala [nome]" funciona bem
- Mencione que viu o interesse pelo anuncio de forma leve
- Termine com UMA pergunta aberta pra conversa fluir (ex: "qual ta sendo sua conta de luz hoje?" ou "me conta rapidinho como e teu imovel")
- Sem emoji, sem asterisco, sem markdown, sem ponto final em toda frase
- Nao dizer "vai zerar conta"
- Use ${firstName || 'o primeiro nome'} UMA vez, no maximo
- Nao introduza LGPD nesta primeira mensagem (vira na resposta, se for o caso)

Gere APENAS o texto da mensagem, sem explicacao.`;

    const res = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
  }
}

// Normaliza telefone BR pra formato Evolution: 55DDNNNNNNNNN (sem +, espaco, -, parentese).
// Adiciona 55 de pais quando faltar. So adiciona o 9 de celular quando o
// primeiro digito pos-DDD e 6/7/8/9 (faixa de celular) — fixo (2/3/4/5) fica
// como esta. Resolve casos como "+55 61 98765-4321", "061 98765-4321",
// "0061 98765-4321" e fixo "61 3321-4567".
export function normalizeBrazilianPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return null;

  let normalized = digits;

  // Remove TODOS os zeros a esquerda (casos como "0061..." internacional e "061..." local)
  while (normalized.startsWith('0')) normalized = normalized.slice(1);

  // Se nao comecar com 55 e tem 10 ou 11 digitos, adiciona 55
  if (!normalized.startsWith('55') && (normalized.length === 10 || normalized.length === 11)) {
    normalized = '55' + normalized;
  }

  // Agora deve ter 12 (55+DD+8) ou 13 (55+DD+9) digitos
  if (normalized.length !== 12 && normalized.length !== 13) return null;

  // Se tiver 12 digitos, pode ser fixo (mantem) ou celular sem o 9 (precisa
  // inserir). Detecta pelo primeiro digito apos DDD: 2-5 = fixo, 6-9 = celular.
  if (normalized.length === 12) {
    const firstAfterDdd = normalized[4];
    if (firstAfterDdd && '6789'.includes(firstAfterDdd)) {
      // Celular sem o 9 — adiciona
      normalized = normalized.slice(0, 4) + '9' + normalized.slice(4);
    }
    // Se for fixo (2-5), mantem 12 digitos e segue
  }

  return normalized;
}
