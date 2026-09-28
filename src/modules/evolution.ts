import { instanciaEvolutionAtual } from './canal-contexto.js';
import { lerCorpoComLimite } from './http-limite.js';
import type { Config } from '../config.js';

export interface IncomingMessage {
  type: 'text' | 'audio' | 'image' | 'video' | 'location' | 'document';
  from: string;
  /** Veio de grupo? O padrao continua sendo IGNORAR — quem decide o que fazer
   *  e o webhook. Existe pra assistente poder APRENDER do grupo da equipe. */
  deGrupo?: boolean;
  /** JID do grupo (so quando deGrupo). Em grupo, `from` e a PESSOA que falou. */
  grupoId?: string;
  content: string;
  timestamp: Date;
  messageId: string;
  fromMe: boolean;
  pushName?: string;
  caption?: string; // legenda em imagem/video
  mimeType?: string; // mime do anexo (preenchido em document; tambem populado em image/video se vier no payload)
  /** Nome do arquivo (documento), quando o WhatsApp manda. W1 mídia no painel. */
  nomeArquivo?: string;
  /** Tamanho do arquivo (bytes), quando o WhatsApp manda — W1: não baixa o que passa do limite. */
  tamanhoBytes?: number;
  /** W2: esta mensagem RESPONDE outra (id do WhatsApp da citada). */
  citandoId?: string;
  /** W2: pedacinho do texto citado, quando o WhatsApp manda junto (Evolution). */
  citandoTexto?: string;
  // ID do NÚMERO que RECEBEU a mensagem (value.metadata.phone_number_id no
  // webhook WABA). Base do multi-tenant: mapeia pro company_id via companies.
  // waba_phone_number_id (migration 081). So o canal WABA preenche.
  phoneNumberId?: string;
  // BSUID (business-scoped user ID) da Meta — so o canal WABA preenche.
  // Formato 'BR.1234…' / 'US.1349…'. Quando o usuario esconde o telefone atras
  // de um @username, a Meta OMITE `from`: ai `from` fica '' e so sobra isto.
  // NUNCA copie o BSUID pra `from` (from e sempre telefone). Ver docs/whatsapp-bsuid.md.
  fromUserId?: string;
  fromParentUserId?: string;
  /** @username do WhatsApp (contacts[0].profile.username), quando existe. */
  username?: string;
  // Click-to-WhatsApp Ad (CTWA) referral. Presente APENAS na 1a msg do lead
  // que veio clicando num anuncio Meta. Permite mapping ad_id -> template
  // pra A/B test sem precisar de tag no body do anuncio.
  // So o canal WABA preenche (Evolution nao expoe esse campo).
  referral?: {
    sourceId?: string;       // ad_id Meta (ex: '120249029179580385')
    sourceUrl?: string;
    sourceType?: string;     // 'ad' | 'post' etc
    headline?: string;
    body?: string;
    mediaType?: string;
    ctwaClid?: string;
  };
}

/**
 * Uma mensagem da Evolution (o `data` do messages.upsert, ou cada item do
 * histórico messages.set / chat/findMessages — mesmo formato) → IncomingMessage.
 * PURA. Tipo que não conhecemos (figurinha, reação, enquete…) → null.
 */
export function lerMensagemEvolution(data: Record<string, unknown> | undefined | null): IncomingMessage | null {
  if (!data || typeof data !== 'object') return null;

  const key = data.key as Record<string, string> | undefined;
  const message = data.message as Record<string, unknown> | undefined;
  const timestamp = data.messageTimestamp as number;

  if (!key || !message) return null;

  // GRUPO: nao descarta mais aqui. Em grupo o remoteJid e o GRUPO e quem
  // falou vem em key.participant — sem participante nao da pra saber se e
  // gente da equipe, entao ai sim descarta.
  const deGrupo = Boolean(key.remoteJid?.endsWith('@g.us'));
  const grupoId = deGrupo ? key.remoteJid : undefined;
  if (deGrupo && !key.participant) return null;

  const fromMe = Boolean(key.fromMe);
  const from = (deGrupo ? key.participant : key.remoteJid)?.replace('@s.whatsapp.net', '') ?? '';
  const messageId = key.id ?? '';
  const pushName = (data.pushName as string) || undefined;

  // W2: mensagem que responde outra (contextInfo em qualquer tipo de mensagem).
  const cit = citacaoEvolution(message, data);
  const base = { from, timestamp: new Date(timestamp * 1000), messageId, fromMe, pushName, deGrupo, grupoId, ...cit };

  if (message.conversation || message.extendedTextMessage) {
    const text = (message.conversation as string)
      ?? (message.extendedTextMessage as Record<string, string>)?.text
      ?? '';
    return { ...base, type: 'text', content: text };
  }

  // mimetype só entra quando vem (mensagem antiga/teste sem ele fica igual).
  const mime = (m: Record<string, unknown>) => ({
    ...(typeof m.mimetype === 'string' && m.mimetype ? { mimeType: m.mimetype } : {}),
    ...(tamanhoDoArquivo(m.fileLength) ? { tamanhoBytes: tamanhoDoArquivo(m.fileLength)! } : {}),
  });

  if (message.audioMessage) {
    const audio = message.audioMessage as Record<string, string>;
    return { ...base, type: 'audio', content: audio.url ?? '', ...mime(audio) };
  }

  if (message.imageMessage) {
    const image = message.imageMessage as Record<string, string>;
    return {
      ...base,
      type: 'image',
      content: image.url ?? '',
      caption: image.caption ?? undefined,
      ...mime(image),
    };
  }

  if (message.videoMessage) {
    const video = message.videoMessage as Record<string, string>;
    return {
      ...base,
      type: 'video',
      content: video.url ?? '',
      caption: video.caption ?? undefined,
      ...mime(video),
    };
  }

  // Documento com legenda chega como documentWithCaptionMessage.message.documentMessage.
  const docComLegenda = (message.documentWithCaptionMessage as { message?: { documentMessage?: Record<string, string> } } | undefined)?.message?.documentMessage;
  if (message.documentMessage || docComLegenda) {
    const doc = (message.documentMessage ?? docComLegenda) as Record<string, string>;
    return {
      ...base, type: 'document', content: doc.mimetype ?? '', ...mime(doc),
      ...(doc.fileName ? { nomeArquivo: doc.fileName } : {}),
      ...(doc.caption ? { caption: doc.caption } : {}),
    };
  }

  if (message.locationMessage) {
    const loc = message.locationMessage as Record<string, number>;
    return { ...base, type: 'location', content: JSON.stringify({ lat: loc.degreesLatitude, lng: loc.degreesLongitude }) };
  }

  return null;
}

/** Texto de uma mensagem citada (quotedMessage) — só texto/legenda, curto. PURA. */
function textoCitado(q: Record<string, unknown> | undefined): string | undefined {
  if (!q) return undefined;
  const t = (q.conversation as string | undefined)
    ?? (q.extendedTextMessage as { text?: string } | undefined)?.text
    ?? (q.imageMessage as { caption?: string } | undefined)?.caption
    ?? (q.videoMessage as { caption?: string } | undefined)?.caption
    ?? (q.documentMessage as { fileName?: string } | undefined)?.fileName
    ?? (q.audioMessage ? '[áudio]' : q.imageMessage ? '[imagem]' : q.videoMessage ? '[vídeo]' : undefined);
  return typeof t === 'string' && t.trim() ? t.trim().slice(0, 300) : undefined;
}

/** W2: { citandoId, citandoTexto } quando a mensagem responde outra. PURA. */
function citacaoEvolution(message: Record<string, unknown>, data: Record<string, unknown>): { citandoId?: string; citandoTexto?: string } {
  let ctx: Record<string, unknown> | undefined = data.contextInfo as Record<string, unknown> | undefined;
  if (!ctx?.stanzaId) {
    for (const v of Object.values(message)) {
      const c = v && typeof v === 'object' ? (v as { contextInfo?: Record<string, unknown> }).contextInfo : undefined;
      if (c?.stanzaId) { ctx = c; break; }
    }
  }
  const id = typeof ctx?.stanzaId === 'string' ? ctx.stanzaId : '';
  if (!id) return {};
  const texto = textoCitado(ctx?.quotedMessage as Record<string, unknown> | undefined);
  return { citandoId: id, ...(texto ? { citandoTexto: texto } : {}) };
}

/** W2: reação recebida (reactionMessage) — emoji vazio = a pessoa tirou a reação. PURA. */
export interface ReacaoRecebida { from: string; fromMe: boolean; alvo: string; emoji: string; wamid: string; timestamp: Date; deGrupo: boolean }
export function lerReacaoEvolution(data: Record<string, unknown> | undefined | null): ReacaoRecebida | null {
  if (!data || typeof data !== 'object') return null;
  const key = data.key as Record<string, unknown> | undefined;
  const r = (data.message as Record<string, unknown> | undefined)?.reactionMessage as { key?: { id?: string }; text?: string } | undefined;
  if (!key || !r?.key?.id) return null;
  const remote = String(key.remoteJid ?? '');
  const deGrupo = remote.endsWith('@g.us');
  return {
    from: remote.replace('@s.whatsapp.net', ''), fromMe: Boolean(key.fromMe), alvo: String(r.key.id),
    emoji: typeof r.text === 'string' ? r.text : '', wamid: String(key.id ?? ''),
    timestamp: new Date(Number(data.messageTimestamp ?? 0) * 1000), deGrupo,
  };
}

/** fileLength do Baileys: número, texto ou Long ({low, high}). PURA. */
export function tamanhoDoArquivo(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
  if (v && typeof v === 'object' && typeof (v as { low?: unknown }).low === 'number') {
    const { low, high } = v as { low: number; high?: number };
    return (high ?? 0) * 4294967296 + (low >>> 0);
  }
  return null;
}

/** Maior documento (PDF) que mandamos pelo WhatsApp: 10 MB. */
export const LIMITE_DOCUMENTO_BYTES = 10 * 1024 * 1024;

export class EvolutionService {
  private baseUrl: string;
  private apiKey: string;
  private instance: string;
  private webhookToken: string;

  constructor(config: Pick<Config, 'evolutionApiUrl' | 'evolutionApiKey' | 'evolutionInstance' | 'webhookToken'>) {
    this.baseUrl = config.evolutionApiUrl;
    this.apiKey = config.evolutionApiKey;
    this.instance = config.evolutionInstance;
    this.webhookToken = config.webhookToken;
  }

  // Instância usada AGORA: a do tenant em contexto (canal-contexto, tenant
  // conectado por QR numa instância própria) ou a padrão do env (Eva).
  private instanciaAtual(): string {
    return instanciaEvolutionAtual(this.instance);
  }

  async sendText(to: string, text: string, delayMs?: number): Promise<{ messageId: string }> {
    const body: Record<string, unknown> = { number: to, text };
    if (delayMs && delayMs > 0) body.delay = delayMs;
    const response = await fetch(
      `${this.baseUrl}/message/sendText/${this.instanciaAtual()}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.apiKey,
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Evolution API sendText failed: ${response.status} ${error}`);
    }

    try {
      const data = await response.json() as Record<string, unknown>;
      const key = (data.key ?? (data as { data?: { key?: Record<string, string> } }).data?.key) as
        | Record<string, string>
        | undefined;
      return { messageId: key?.id ?? '' };
    } catch {
      return { messageId: '' };
    }
  }

  parseWebhook(payload: Record<string, unknown>): IncomingMessage | null {
    return lerMensagemEvolution(payload.data as Record<string, unknown> | undefined);
  }

  async sendMedia(to: string, mediaUrl: string, caption: string, mediatype: 'image' | 'video' = 'image'): Promise<{ messageId: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(
        `${this.baseUrl}/message/sendMedia/${this.instanciaAtual()}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: this.apiKey,
          },
          body: JSON.stringify({
            number: to,
            mediatype,
            media: mediaUrl,
            caption,
            fileName: mediatype === 'video' ? 'post.mp4' : 'post.jpg',
          }),
          signal: controller.signal,
        },
      );
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Evolution sendMedia ${res.status}: ${err}`);
      }
      const data = await res.json() as Record<string, unknown>;
      const key = (data.key ?? (data as { data?: { key?: Record<string, string> } }).data?.key) as
        | Record<string, string>
        | undefined;
      return { messageId: key?.id ?? '' };
    } finally {
      clearTimeout(timer);
    }
  }

  // Arquivo (PDF) em base64 como DOCUMENTO — o relatório mensal da usina vai
  // anexo pela instância do tenant (canal-contexto). Base64 no corpo: não
  // depende de a Evolution conseguir baixar uma URL do nosso storage.
  async sendDocument(
    to: string,
    base64: string,
    fileName: string,
    caption: string,
    mimetype = 'application/pdf',
  ): Promise<{ messageId: string }> {
    // PDF grande trava a Evolution/WhatsApp e some em silêncio: nem tenta.
    const bytes = Buffer.byteLength(base64, 'base64');
    if (bytes > LIMITE_DOCUMENTO_BYTES) {
      throw new Error(`pdf_grande_demais: ${(bytes / 1024 / 1024).toFixed(1)} MB (limite 10 MB)`);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(`${this.baseUrl}/message/sendMedia/${this.instanciaAtual()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: this.apiKey },
        body: JSON.stringify({ number: to, mediatype: 'document', mimetype, media: base64, fileName, caption }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Evolution sendDocument ${res.status}: ${err}`);
      }
      const data = await res.json() as Record<string, unknown>;
      const key = (data.key ?? (data as { data?: { key?: Record<string, string> } }).data?.key) as
        | Record<string, string>
        | undefined;
      return { messageId: key?.id ?? '' };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * W1 — mídia do painel (foto, vídeo, documento) em base64 pela instância em
   * contexto (número pessoal do dono ou assistente do tenant). Base64 no corpo:
   * não depende de a Evolution alcançar o nosso storage.
   */
  async sendMediaBase64(
    to: string,
    m: { mediatype: 'image' | 'video' | 'document'; mimetype: string; base64: string; fileName: string; caption?: string; citada?: { id: string; texto?: string | null; fromMe?: boolean } },
  ): Promise<{ messageId: string }> {
    const body: Record<string, unknown> = { number: to, mediatype: m.mediatype, mimetype: m.mimetype, media: m.base64, fileName: m.fileName, caption: m.caption ?? '' };
    if (m.citada) body.quoted = await this.citacao(to, m.citada);
    return this.postarMidia('sendMedia', body);
  }

  /** W2 — texto RESPONDENDO outra mensagem (quoted). */
  async sendTextQuoted(to: string, text: string, citada: { id: string; texto?: string | null; fromMe?: boolean }): Promise<{ messageId: string }> {
    return this.postarMidia('sendText', { number: to, text, quoted: await this.citacao(to, citada) });
  }

  /**
   * `quoted` da Evolution: o WhatsApp mostra QUEM foi citado pelo remoteJid +
   * fromMe da chave (sem eles a citação sai sem autor). JID não achado → só o id.
   */
  private async citacao(to: string, c: { id: string; texto?: string | null; fromMe?: boolean }): Promise<Record<string, unknown>> {
    const jid = await this.jidDoNumero(to);
    return {
      key: { id: c.id, ...(jid ? { remoteJid: jid } : {}), ...(typeof c.fromMe === 'boolean' ? { fromMe: c.fromMe } : {}) },
      message: { conversation: (c.texto ?? '').slice(0, 300) },
    };
  }

  /**
   * W2 — reagir a uma mensagem. A reação precisa do JID exato da conversa
   * (o 9º dígito do celular varia): pergunta à Evolution qual é.
   */
  async sendReactionTo(to: string, alvo: { id: string; fromMe: boolean }, emoji: string): Promise<{ messageId: string }> {
    const jid = await this.jidDoNumero(to);
    if (!jid) throw new Error('numero_sem_whatsapp');
    return this.postarMidia('sendReaction', { key: { remoteJid: jid, fromMe: alvo.fromMe, id: alvo.id }, reaction: emoji });
  }

  /** JID do WhatsApp para este número (null = não tem WhatsApp / erro). */
  async jidDoNumero(to: string): Promise<string | null> {
    try {
      const res = await fetch(`${this.baseUrl}/chat/whatsappNumbers/${this.instanciaAtual()}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: this.apiKey },
        body: JSON.stringify({ numbers: [to] }), signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;
      const lista = await res.json() as Array<{ exists?: boolean; jid?: string }>;
      const r = Array.isArray(lista) ? lista[0] : null;
      return r?.exists && typeof r.jid === 'string' ? r.jid : null;
    } catch {
      return null;
    }
  }

  /** W1 — áudio como MENSAGEM DE VOZ (a Evolution converte para o formato do WhatsApp). */
  async sendWhatsAppAudio(to: string, base64: string, citada?: { id: string; texto?: string | null; fromMe?: boolean }): Promise<{ messageId: string }> {
    return this.postarMidia('sendWhatsAppAudio', { number: to, audio: base64, ...(citada ? { quoted: await this.citacao(to, citada) } : {}) });
  }

  private async postarMidia(rota: 'sendMedia' | 'sendWhatsAppAudio' | 'sendText' | 'sendReaction', body: Record<string, unknown>): Promise<{ messageId: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(`${this.baseUrl}/message/${rota}/${this.instanciaAtual()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: this.apiKey },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`Evolution ${rota} ${res.status}: ${err.slice(0, 300)}`);
      }
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      const key = (data.key ?? (data as { data?: { key?: Record<string, string> } }).data?.key) as Record<string, string> | undefined;
      return { messageId: key?.id ?? '' };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * `limiteBytes` (W1): tamanho máximo do ARQUIVO; a resposta (base64 em JSON)
   * é lida só até ~4/3 disso + folga, com prazo — mídia gigante não derruba o processo.
   */
  async getMediaBase64(messageId: string, opts: { limiteBytes?: number; tempoMaxMs?: number } = {}): Promise<{ base64: string; mimetype: string } | null> {
    const controller = new AbortController();
    const timer = opts.tempoMaxMs || opts.limiteBytes ? setTimeout(() => controller.abort(), opts.tempoMaxMs ?? 45_000) : null;
    try {
      const response = await fetch(
        `${this.baseUrl}/chat/getBase64FromMediaMessage/${this.instanciaAtual()}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': this.apiKey,
          },
          body: JSON.stringify({
            message: { key: { id: messageId } },
            convertToMp4: false,
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        console.error(`[evolution] getMediaBase64 failed: ${response.status}`);
        return null;
      }

      if (opts.limiteBytes) {
        const corpo = await lerCorpoComLimite(response, Math.ceil(opts.limiteBytes * 4 / 3) + 64 * 1024);
        if (!corpo) { console.warn('[evolution] getMediaBase64: arquivo acima do limite — não baixado'); return null; }
        return JSON.parse(corpo.toString('utf-8')) as { base64: string; mimetype: string };
      }
      const data = await response.json() as { base64: string; mimetype: string };
      return data;
    } catch (error) {
      console.error('[evolution] getMediaBase64 error:', (error as Error).message);
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  validateWebhookToken(token: string): boolean {
    return token === this.webhookToken;
  }

  /**
   * Lista todos os contatos sincronizados do WhatsApp do Junior via Evolution API.
   * Retorna JID (numero@s.whatsapp.net), pushName (nome de perfil do contato) e,
   * quando disponivel, o 'name' salvo na agenda do telefone do Junior.
   *
   * Usado pro comando "eva ativar nome <termo>" que ativa Eva em massa pra um
   * grupo de contatos identificados pelo nome salvo na agenda.
   */
  async findContacts(): Promise<Array<{
    jid: string;
    phone: string;
    pushName?: string;
    name?: string;
  }>> {
    try {
      const response = await fetch(
        `${this.baseUrl}/chat/findContacts/${this.instanciaAtual()}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': this.apiKey,
          },
          body: JSON.stringify({ where: {} }),
        }
      );

      if (!response.ok) {
        const err = await response.text();
        console.error(`[evolution] findContacts failed: ${response.status} ${err}`);
        return [];
      }

      const data = await response.json() as Array<Record<string, unknown>>;
      if (!Array.isArray(data)) {
        console.warn('[evolution] findContacts: response nao eh array');
        return [];
      }

      return data
        .map((raw) => {
          const jid = String(raw.id ?? raw.remoteJid ?? raw.jid ?? '');
          if (!jid) return null;
          // Ignora grupos e status
          if (jid.includes('-') || jid.endsWith('@g.us') || jid.endsWith('@broadcast')) return null;
          const phone = jid.replace(/@.*$/, '');
          return {
            jid,
            phone,
            pushName: raw.pushName ? String(raw.pushName) : undefined,
            name: raw.name ? String(raw.name) : (raw.verifiedName ? String(raw.verifiedName) : undefined),
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);
    } catch (error) {
      console.error('[evolution] findContacts error:', error);
      return [];
    }
  }
}
