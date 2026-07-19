import crypto from 'crypto';
import type { Config } from '../config.js';
import type { IncomingMessage } from './evolution.js';

const GRAPH_API = 'https://graph.facebook.com/v21.0';

// Reaproveita IncomingMessage do EvolutionService pra o restante do codigo
// (router, brain, etc) nao precisar mudar nada — drop-in replacement.
export type { IncomingMessage } from './evolution.js';

export interface TemplateComponent {
  type: 'header' | 'body' | 'button' | 'footer';
  sub_type?: 'quick_reply' | 'url' | 'flow';
  index?: number;
  parameters?: Array<{
    type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video' | 'payload';
    text?: string;
    image?: { link: string };
    document?: { link: string; filename?: string };
    video?: { link: string };
    payload?: string;
  }>;
}

export interface MetaStatusUpdate {
  messageId: string;       // wamid do Meta
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
  recipientPhone: string;  // E.164 sem +
  errorCode?: number;
  errorTitle?: string;
}

export class MetaWhatsAppService {
  private phoneNumberId: string;
  private accessToken: string;
  private appSecret: string;
  private verifyToken: string;
  private businessAccountId: string;

  constructor(config: Pick<Config,
    | 'metaWabaPhoneNumberId'
    | 'metaWabaAccessToken'
    | 'metaWabaBusinessAccountId'
    | 'metaAppSecret'
    | 'metaWabaVerifyToken'
  >) {
    if (!config.metaWabaPhoneNumberId) throw new Error('META_WABA_PHONE_NUMBER_ID nao configurado');
    if (!config.metaWabaAccessToken) throw new Error('META_WABA_ACCESS_TOKEN nao configurado');
    if (!config.metaAppSecret) throw new Error('META_APP_SECRET nao configurado (necessario pra HMAC do webhook)');
    if (!config.metaWabaVerifyToken) throw new Error('META_WABA_VERIFY_TOKEN nao configurado');
    this.phoneNumberId = config.metaWabaPhoneNumberId;
    this.accessToken = config.metaWabaAccessToken;
    this.businessAccountId = config.metaWabaBusinessAccountId ?? '';
    this.appSecret = config.metaAppSecret;
    this.verifyToken = config.metaWabaVerifyToken;
  }

  // ===== Envio de mensagens =====

  async sendText(to: string, text: string, _delayMs?: number): Promise<{ messageId: string }> {
    // delayMs do Evolution nao tem equivalente direto na Cloud API. Mantemos
    // a assinatura compativel mas ignoramos. Quem quiser delay simula com
    // setTimeout antes de chamar.
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text, preview_url: false },
    };
    return this.postMessage(body);
  }

  async sendMedia(
    to: string,
    mediaUrl: string,
    caption: string,
    mediatype: 'image' | 'video' = 'image',
  ): Promise<{ messageId: string }> {
    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to,
      type: mediatype,
    };
    body[mediatype] = { link: mediaUrl, caption };
    return this.postMessage(body);
  }

  async sendDocument(
    to: string,
    mediaUrl: string,
    filename: string,
    caption?: string,
  ): Promise<{ messageId: string }> {
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: { link: mediaUrl, filename, ...(caption ? { caption } : {}) },
    };
    return this.postMessage(body);
  }

  // Envia lista interativa (Interactive List Message — ate 10 rows totais
  // distribuidos em ate 10 sections). Quando usuario toca uma row, o webhook
  // chega como interactive.list_reply.id (nosso webhook converte pra texto =
  // row id). Limites WABA aplicados via slice(): header 60, body 1024,
  // buttonText 20, section.title 24, row.title 24, row.description 72,
  // row.id 200. Use isso pra escolhas com 4+ opcoes (acima do limite de 3
  // botoes do sendInteractiveButtons).
  async sendInteractiveList(
    to: string,
    opts: {
      header?: string;
      body: string;
      buttonText: string;
      footer?: string;
      sections: Array<{
        title: string;
        rows: Array<{ id: string; title: string; description?: string }>;
      }>;
    },
  ): Promise<{ messageId: string }> {
    if (opts.sections.length === 0) {
      throw new Error('sendInteractiveList: precisa de pelo menos 1 section');
    }
    const totalRows = opts.sections.reduce((acc, s) => acc + s.rows.length, 0);
    if (totalRows === 0 || totalRows > 10) {
      throw new Error(`sendInteractiveList: total de rows deve ser 1-10 (recebido ${totalRows})`);
    }
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        ...(opts.header ? { header: { type: 'text', text: opts.header.slice(0, 60) } } : {}),
        body: { text: opts.body.slice(0, 1024) },
        ...(opts.footer ? { footer: { text: opts.footer.slice(0, 60) } } : {}),
        action: {
          button: opts.buttonText.slice(0, 20),
          sections: opts.sections.map(s => ({
            title: s.title.slice(0, 24),
            rows: s.rows.map(r => ({
              id: r.id.slice(0, 200),
              title: r.title.slice(0, 24),
              ...(r.description ? { description: r.description.slice(0, 72) } : {}),
            })),
          })),
        },
      },
    };
    return this.postMessage(payload);
  }

  // Envia mensagem com botoes interativos (ate 3 botoes "reply").
  // Cada botao tem id (callback) e title (texto exibido, max 20 chars).
  // Quando usuario clica, vem webhook tipo "interactive.button_reply.id".
  async sendInteractiveButtons(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
    footer?: string,
  ): Promise<{ messageId: string }> {
    if (buttons.length === 0 || buttons.length > 3) {
      throw new Error('sendInteractiveButtons: precisa de 1 a 3 botoes');
    }
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body.slice(0, 1024) },
        ...(footer ? { footer: { text: footer.slice(0, 60) } } : {}),
        action: {
          buttons: buttons.map(b => ({
            type: 'reply',
            reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) },
          })),
        },
      },
    };
    return this.postMessage(payload);
  }

  // Botão de URL (Call-To-Action). Mostra um botão que ABRE o link no navegador —
  // diferente de sendInteractiveButtons (reply, que só devolve um id). A WABA
  // permite 1 botão cta_url por mensagem. Limites: display_text 20, body 1024.
  async sendCtaUrlButton(
    to: string,
    body: string,
    buttonText: string,
    url: string,
  ): Promise<{ messageId: string }> {
    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: { text: body.slice(0, 1024) },
        action: {
          name: 'cta_url',
          parameters: { display_text: buttonText.slice(0, 20), url },
        },
      },
    };
    return this.postMessage(payload);
  }

  // Upload media buffer to Meta Cloud API and return media_id.
  // Useful when we have a Buffer (e.g. PDF gerado in-memory) instead of a public URL.
  async uploadMedia(buffer: Buffer, mimeType: string, filename: string): Promise<{ mediaId: string }> {
    const url = `${GRAPH_API}/${this.phoneNumberId}/media`;
    // Buffer extends Uint8Array — Blob aceita Uint8Array como BlobPart sem ambiguidade.
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    const form = new FormData();
    form.set('messaging_product', 'whatsapp');
    form.set('type', mimeType);
    form.set('file', blob, filename);

    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.accessToken}` },
      body: form,
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`Meta uploadMedia falhou (${resp.status}): ${errBody.slice(0, 300)}`);
    }
    const json = await resp.json() as { id: string };
    return { mediaId: json.id };
  }

  // Envia documento usando media_id (ja foi feito upload via uploadMedia).
  async sendDocumentById(
    to: string,
    mediaId: string,
    filename: string,
    caption?: string,
  ): Promise<{ messageId: string }> {
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: { id: mediaId, filename, ...(caption ? { caption } : {}) },
    };
    return this.postMessage(body);
  }

  // Envia imagem usando media_id (apos uploadMedia com mimeType image/png ou image/jpeg).
  async sendImageById(
    to: string,
    mediaId: string,
    caption?: string,
  ): Promise<{ messageId: string }> {
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: { id: mediaId, ...(caption ? { caption } : {}) },
    };
    return this.postMessage(body);
  }

  async sendAudio(to: string, mediaUrl: string): Promise<{ messageId: string }> {
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'audio',
      audio: { link: mediaUrl },
    };
    return this.postMessage(body);
  }

  // Template messages — necessario pra iniciar conversa apos 24h sem interacao
  // ou pra contatos novos (cadencia, leadgen reengajamento, etc).
  async sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    components: TemplateComponent[] = [],
  ): Promise<{ messageId: string }> {
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length ? { components } : {}),
      },
    };
    return this.postMessage(body);
  }

  // Marca mensagem recebida como lida (boa pratica de UX, opcional).
  async markAsRead(messageId: string): Promise<void> {
    await this.postMessage({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  }

  // ===== Webhook =====

  // Validacao do challenge GET inicial (subscribe do webhook).
  // Meta chama: GET /webhook?hub.mode=subscribe&hub.verify_token=X&hub.challenge=Y
  validateChallenge(mode: string, token: string): boolean {
    return mode === 'subscribe' && token === this.verifyToken;
  }

  // Validacao HMAC-SHA256 dos webhooks recebidos. Identica a do meta-leadgen
  // mas duplicada aqui pra encapsular — assim o handler nao precisa importar
  // de outro modulo so pra validar.
  validateSignature(rawBody: string, signatureHeader: string | undefined): boolean {
    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
    const expected = signatureHeader.slice(7);
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

  // Parse do payload de mensagens recebidas (formato WABA Cloud API). Retorna
  // null pra payloads que nao sao mensagens (ex: status updates, account_update).
  // Use parseStatusUpdates() em separado pra status (delivered/read/failed).
  //
  // Estrutura WABA:
  //   { object: 'whatsapp_business_account',
  //     entry: [{ id, changes: [{ field: 'messages', value: { messages: [...], contacts: [...] } }] }] }
  parseWebhook(payload: Record<string, unknown>): IncomingMessage | null {
    const entry = (payload.entry as Array<Record<string, unknown>> | undefined) ?? [];
    for (const e of entry) {
      const changes = (e.changes as Array<Record<string, unknown>> | undefined) ?? [];
      for (const ch of changes) {
        if (ch.field !== 'messages') continue;
        const value = ch.value as Record<string, unknown> | undefined;
        if (!value) continue;
        const messages = (value.messages as Array<Record<string, unknown>> | undefined) ?? [];
        if (messages.length === 0) continue;
        // Pegamos a primeira mensagem do batch. Webhook normalmente entrega
        // 1 mensagem por evento, mas Meta pode bufferar — o handler que chama
        // pode iterar manualmente se precisar de todas.
        const msg = messages[0];
        if (!msg) continue;
        const contacts = (value.contacts as Array<Record<string, unknown>> | undefined) ?? [];
        const contact = contacts[0];
        const profile = contact?.profile as Record<string, string> | undefined;
        // metadata.phone_number_id = ID do numero que RECEBEU a msg. Base do
        // multi-tenant (fatia 1). Ausente em payloads antigos → undefined.
        const metadata = value.metadata as { phone_number_id?: string } | undefined;
        return this.parseMessage(msg, profile?.name, metadata?.phone_number_id);
      }
    }
    return null;
  }

  // Parse de UM evento de mensagem (entry.changes[].value.messages[i]).
  private parseMessage(msg: Record<string, unknown>, pushName?: string, phoneNumberId?: string): IncomingMessage | null {
    const from = (msg.from as string) ?? '';
    const messageId = (msg.id as string) ?? '';
    const timestampSec = Number(msg.timestamp ?? 0);
    const timestamp = new Date(timestampSec * 1000);
    const type = (msg.type as string) ?? '';

    // Extrai referral CTWA (Click-to-WhatsApp Ad). Presente na 1a msg do lead
    // que clicou no botao "Send Message" de um anuncio Meta. Permite mapping
    // ad_id -> template pra A/B test sem precisar de tag no body.
    let referral: IncomingMessage['referral'];
    const rawReferral = msg.referral as Record<string, unknown> | undefined;
    if (rawReferral && typeof rawReferral === 'object') {
      referral = {
        sourceId: rawReferral.source_id as string | undefined,
        sourceUrl: rawReferral.source_url as string | undefined,
        sourceType: rawReferral.source_type as string | undefined,
        headline: rawReferral.headline as string | undefined,
        body: rawReferral.body as string | undefined,
        mediaType: rawReferral.media_type as string | undefined,
        ctwaClid: rawReferral.ctwa_clid as string | undefined,
      };
    }

    const base = { from, timestamp, messageId, fromMe: false, pushName, referral, phoneNumberId };

    switch (type) {
      case 'text': {
        const text = (msg.text as { body?: string } | undefined)?.body ?? '';
        return { ...base, type: 'text', content: text };
      }
      case 'image': {
        const img = msg.image as { id?: string; caption?: string } | undefined;
        return {
          ...base,
          type: 'image',
          // No WABA o conteudo e media_id (nao URL direta). Pra baixar chamar
          // getMediaBase64(media_id) — ele faz GET /v21.0/{media-id} e depois
          // GET na URL retornada.
          content: img?.id ?? '',
          caption: img?.caption,
        };
      }
      case 'video': {
        const vid = msg.video as { id?: string; caption?: string } | undefined;
        return {
          ...base,
          type: 'video',
          content: vid?.id ?? '',
          caption: vid?.caption,
        };
      }
      case 'audio': {
        const aud = msg.audio as { id?: string } | undefined;
        return { ...base, type: 'audio', content: aud?.id ?? '' };
      }
      case 'document': {
        const doc = msg.document as { id?: string; mime_type?: string; filename?: string } | undefined;
        return {
          ...base,
          type: 'document',
          // content = media_id (consistente com image/video). mime_type vai em mimeType.
          content: doc?.id ?? '',
          caption: doc?.filename,
          mimeType: doc?.mime_type,
        };
      }
      case 'location': {
        const loc = msg.location as { latitude?: number; longitude?: number } | undefined;
        return {
          ...base,
          type: 'location',
          content: JSON.stringify({ lat: loc?.latitude, lng: loc?.longitude }),
        };
      }
      // Botoes interativos (Eva manda mensagem com botoes, Junior clica).
      // Tratamos como uma mensagem de texto cujo conteudo eh o button_id (ex:
      // "approve:abc-123"). O handler downstream interpreta o prefixo.
      case 'interactive': {
        const ia = msg.interactive as { type?: string; button_reply?: { id?: string }; list_reply?: { id?: string } } | undefined;
        const id = ia?.button_reply?.id ?? ia?.list_reply?.id ?? '';
        if (!id) return null;
        return { ...base, type: 'text', content: id };
      }
      // Quick reply de TEMPLATE (ex. eva_monitoramento_v1) chega como type
      // 'button', não 'interactive'. Sem este case o clique do cliente em
      // [Pode contar] era descartado e a Eva o ignorava.
      case 'button': {
        const btn = msg.button as { text?: string; payload?: string } | undefined;
        const content = btn?.text ?? btn?.payload ?? '';
        if (!content) return null;
        return { ...base, type: 'text', content };
      }
      // Tipos nao suportados (contacts, sticker, system...)
      default:
        return null;
    }
  }

  // Parse separado pra status updates (sent/delivered/read/failed). Util pra
  // tracking de entrega da cadencia. Retorna array porque um webhook pode
  // trazer varios updates de uma vez.
  parseStatusUpdates(payload: Record<string, unknown>): MetaStatusUpdate[] {
    const updates: MetaStatusUpdate[] = [];
    const entry = (payload.entry as Array<Record<string, unknown>> | undefined) ?? [];
    for (const e of entry) {
      const changes = (e.changes as Array<Record<string, unknown>> | undefined) ?? [];
      for (const ch of changes) {
        if (ch.field !== 'messages') continue;
        const value = ch.value as Record<string, unknown> | undefined;
        const statuses = (value?.statuses as Array<Record<string, unknown>> | undefined) ?? [];
        for (const s of statuses) {
          const errors = (s.errors as Array<Record<string, unknown>> | undefined) ?? [];
          const firstErr = errors[0];
          updates.push({
            messageId: (s.id as string) ?? '',
            status: (s.status as MetaStatusUpdate['status']) ?? 'sent',
            timestamp: new Date(Number(s.timestamp ?? 0) * 1000),
            recipientPhone: (s.recipient_id as string) ?? '',
            errorCode: firstErr ? Number(firstErr.code) : undefined,
            errorTitle: firstErr ? String(firstErr.title) : undefined,
          });
        }
      }
    }
    return updates;
  }

  // ===== Download de midia =====

  // Baixa midia recebida em base64. Espelha a interface do EvolutionService
  // pra os modulos que ja usam (transcriber, vision) nao precisarem mudar.
  // Implementacao WABA: 2 chamadas (GET /v21.0/{media-id} → URL; depois GET na URL).
  async getMediaBase64(mediaId: string): Promise<{ base64: string; mimetype: string } | null> {
    try {
      // Passo 1: pegar URL temporaria da midia
      // Nota: tentamos primeiro SEM phone_number_id (formato padrao v18+);
      // alguns setups antigos exigem ele na query string.
      const metaUrl = `${GRAPH_API}/${mediaId}?phone_number_id=${this.phoneNumberId}`;
      const metaRes = await fetch(metaUrl, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      if (!metaRes.ok) {
        const errBody = await metaRes.text().catch(() => '<no body>');
        console.error(`[meta-whatsapp] getMediaBase64 metadata failed: ${metaRes.status} url=${metaUrl} body=${errBody.slice(0, 500)}`);
        return null;
      }
      const meta = await metaRes.json() as { url?: string; mime_type?: string };
      if (!meta.url || !meta.mime_type) {
        console.error('[meta-whatsapp] getMediaBase64: metadata sem url/mime_type');
        return null;
      }
      // Passo 2: baixar bytes da midia (URL é assinada, mas tambem precisa Bearer token)
      const binRes = await fetch(meta.url, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      if (!binRes.ok) {
        const errBody = await binRes.text().catch(() => '<no body>');
        console.error(`[meta-whatsapp] getMediaBase64 download failed: ${binRes.status} body=${errBody.slice(0, 500)}`);
        return null;
      }
      const buf = Buffer.from(await binRes.arrayBuffer());
      return { base64: buf.toString('base64'), mimetype: meta.mime_type };
    } catch (error) {
      console.error('[meta-whatsapp] getMediaBase64 error:', error);
      return null;
    }
  }

  // ===== Compatibilidade com EvolutionService =====

  // EvolutionService.validateWebhookToken — WABA usa HMAC, nao token simples.
  // Mantemos o metodo retornando true pra nao quebrar quem chama, mas a
  // validacao real e via validateSignature() acima. O handler do webhook
  // deve usar validateSignature(), nao esse aqui.
  validateWebhookToken(_token: string): boolean {
    return true;
  }

  // Cloud API nao expoe lista de contatos da agenda do telefone (so contatos
  // que ja conversaram com o numero). Retorna array vazio pra manter
  // compatibilidade. Quem precisar de "todos os contatos" tem que migrar pra
  // outra fonte (lista propria no Supabase, importada do Evolution antes da
  // migracao).
  async findContacts(): Promise<Array<{
    jid: string;
    phone: string;
    pushName?: string;
    name?: string;
  }>> {
    return [];
  }

  // ===== Helpers privados =====

  private async postMessage(body: Record<string, unknown>): Promise<{ messageId: string }> {
    const url = `${GRAPH_API}/${this.phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Meta WABA API ${res.status}: ${errText}`);
    }
    const data = await res.json() as {
      messages?: Array<{ id: string }>;
    };
    const messageId = data.messages?.[0]?.id ?? '';
    return { messageId };
  }

  // ===== Util pra setup inicial =====

  // Lista templates aprovados na WABA. Usar em scripts/admin pra ver o que
  // ja ta liberado pra envio. Requer business account ID configurado.
  async listTemplates(): Promise<Array<{ name: string; status: string; language: string; category: string }>> {
    if (!this.businessAccountId) {
      throw new Error('META_WABA_BUSINESS_ACCOUNT_ID nao configurado — necessario pra listar templates');
    }
    const url = `${GRAPH_API}/${this.businessAccountId}/message_templates?limit=100`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`listTemplates ${res.status}: ${await res.text()}`);
    }
    const data = await res.json() as {
      data?: Array<{ name: string; status: string; language: string; category: string }>;
    };
    return data.data ?? [];
  }
}
