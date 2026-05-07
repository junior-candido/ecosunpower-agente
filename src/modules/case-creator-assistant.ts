// Eva Case Creator Assistant — comando /novo-case.
// Fluxo conversacional pra Junior cadastrar uma obra (case) inteira via WhatsApp.
// Estado em Redis. Ao /pronto: faz upload de fotos/videos pro Supabase Storage,
// extrai frame de video com ffmpeg, commita JSON no repo do site via GitHub API,
// dispara rebuild Cloudflare.

import Redis from 'ioredis';
import { writeFile, readFile, unlink, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawn } from 'child_process';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MetaWhatsAppService } from './meta-whatsapp.js';
import type { SiteDeployService } from './site-deploy.js';

const IORedis = (Redis as any).default ?? Redis;
const STATE_TTL_SECONDS = 60 * 60; // 1h pra completar cadastro
const REDIS_PREFIX = 'case-creator:state:';
const CASES_BUCKET = 'cases-videos'; // mesmo bucket que /cases.json + proposta usam

type CaseTipo = 'residencial' | 'comercial' | 'industrial' | 'rural' | 'hibrido' | 'usina';

const TIPO_LABELS: Record<string, CaseTipo> = {
  '1': 'residencial', residencial: 'residencial',
  '2': 'comercial', comercial: 'comercial',
  '3': 'industrial', industrial: 'industrial', industria: 'industrial',
  '4': 'rural', rural: 'rural',
  '5': 'hibrido', hibrido: 'hibrido', 'híbrido': 'hibrido', bateria: 'hibrido',
  '6': 'usina', usina: 'usina', investimento: 'usina',
};

type Step = 'cliente' | 'cidade' | 'tipo' | 'kwp' | 'economia' | 'inversor' | 'modulo' | 'descricao' | 'midia';

interface PendingMedia {
  mediaId: string;
  type: 'image' | 'video';
  receivedAt: number;
}

interface State {
  step: Step;
  cliente?: string;
  cidade?: string;
  uf?: 'DF' | 'GO';
  tipo?: CaseTipo;
  kwp?: number;
  economiaMensalBrl?: number;
  inversorMarca?: string;
  moduloMarca?: string;
  descCurta?: string;
  midias: PendingMedia[];
}

interface AssistantOpts {
  redisHost: string;
  redisPort: number;
  redisPassword?: string;
  supabase: SupabaseClient;
  metaService: MetaWhatsAppService;
  siteDeploy: SiteDeployService;
  githubPat: string;
  githubRepo: string;        // ex: junior-candido/ecosunpower-site
  githubBranch: string;      // main
}

export class CaseCreatorAssistant {
  private redis: any;
  private supabase: SupabaseClient;
  private meta: MetaWhatsAppService;
  private siteDeploy: SiteDeployService;
  private githubPat: string;
  private githubRepo: string;
  private githubBranch: string;

  constructor(opts: AssistantOpts) {
    this.redis = new IORedis({
      host: opts.redisHost,
      port: opts.redisPort,
      password: opts.redisPassword,
      maxRetriesPerRequest: null,
    });
    this.supabase = opts.supabase;
    this.meta = opts.metaService;
    this.siteDeploy = opts.siteDeploy;
    this.githubPat = opts.githubPat;
    this.githubRepo = opts.githubRepo;
    this.githubBranch = opts.githubBranch;
  }

  static isCaseCreatorTrigger(text: string): boolean {
    return /^\/novo-?case\b/i.test(text.trim());
  }

  async isInCreatorMode(phone: string): Promise<boolean> {
    return !!(await this.redis.get(REDIS_PREFIX + phone));
  }

  async cancel(phone: string): Promise<void> {
    await this.redis.del(REDIS_PREFIX + phone);
  }

  private async loadState(phone: string): Promise<State | null> {
    const raw = await this.redis.get(REDIS_PREFIX + phone);
    if (!raw) return null;
    try { return JSON.parse(raw) as State; } catch { return null; }
  }

  private async saveState(phone: string, state: State): Promise<void> {
    await this.redis.set(REDIS_PREFIX + phone, JSON.stringify(state), 'EX', STATE_TTL_SECONDS);
  }

  async startMode(phone: string): Promise<string> {
    const state: State = { step: 'cliente', midias: [] };
    await this.saveState(phone, state);
    return [
      '🏗️ *Cadastrar nova obra no site*',
      '',
      'Vou perguntar dados da obra um por um. Pra cancelar a qualquer momento, manda */cancelar-case*.',
      '',
      'Qual o nome do cliente? (ou /pular se preferir não publicar)',
    ].join('\n');
  }

  // Recebe texto do Junior. Retorna mensagem que Eva deve enviar de volta.
  async processMessage(phone: string, text: string): Promise<string> {
    const state = await this.loadState(phone);
    if (!state) return '⚠️ Sessão expirou. Manda /novo-case pra recomeçar.';

    const trimmed = text.trim();

    if (trimmed === '/cancelar-case' || trimmed === '/cancelar') {
      await this.cancel(phone);
      return '❌ Cadastro cancelado. Nada foi salvo.';
    }

    if (trimmed === '/pronto') {
      if (state.step !== 'midia' && !this.hasMinimumData(state)) {
        return '⚠️ Ainda faltam dados básicos. Continua respondendo as perguntas.';
      }
      if (state.midias.length === 0) {
        return '⚠️ Você precisa mandar pelo menos 1 foto ou vídeo da obra antes de finalizar.';
      }
      return await this.finalize(phone, state);
    }

    if (trimmed === '/pular') {
      return await this.handlePular(phone, state);
    }

    return await this.handleStep(phone, state, trimmed);
  }

  // Recebe midia (foto ou video) do Junior. Retorna mensagem.
  async processMedia(phone: string, mediaId: string, type: 'image' | 'video'): Promise<string> {
    const state = await this.loadState(phone);
    if (!state) return '';
    if (state.step !== 'midia') {
      return 'Quando terminar de responder os dados, me manda as fotos/vídeos da obra.';
    }
    state.midias.push({ mediaId, type, receivedAt: Date.now() });
    await this.saveState(phone, state);
    return `✅ Recebi ${type === 'video' ? 'o vídeo' : 'a foto'}. Manda mais ou */pronto* pra finalizar (${state.midias.length} já recebido${state.midias.length > 1 ? 's' : ''}).`;
  }

  private hasMinimumData(state: State): boolean {
    return !!(state.cliente && state.cidade && state.uf && state.tipo && state.kwp && state.descCurta);
  }

  private async handlePular(phone: string, state: State): Promise<string> {
    // /pular ignora apenas campos opcionais (cliente, economia, inversor, modulo)
    const optional: Step[] = ['cliente', 'economia', 'inversor', 'modulo'];
    if (!optional.includes(state.step)) {
      return 'Esse campo é obrigatório, não dá pra pular.';
    }
    return await this.advance(phone, state, undefined);
  }

  private async handleStep(phone: string, state: State, input: string): Promise<string> {
    switch (state.step) {
      case 'cliente':
        return await this.advance(phone, state, input.slice(0, 80));

      case 'cidade': {
        // Aceita "Brasília-DF" ou "Brasília, DF" ou "Brasília DF"
        const match = input.match(/^(.+?)[\s,\-—]+([A-Z]{2})$/i);
        if (!match) return 'Formato esperado: *Cidade-UF*. Exemplo: Brasília-DF ou Goiânia-GO';
        const ufRaw = match[2].toUpperCase();
        if (ufRaw !== 'DF' && ufRaw !== 'GO') return 'Atendemos só DF e GO. Confirma a UF.';
        state.cidade = match[1].trim().slice(0, 60);
        state.uf = ufRaw;
        return await this.advance(phone, state);
      }

      case 'tipo': {
        const key = input.toLowerCase().trim();
        const tipo = TIPO_LABELS[key];
        if (!tipo) return 'Não entendi. Responde 1, 2, 3, 4, 5 ou 6 (ou o nome).';
        return await this.advance(phone, state, tipo);
      }

      case 'kwp': {
        const num = this.parseNumber(input);
        if (num === null || num <= 0) return 'kWp inválido. Manda só o número (ex: 8.4)';
        return await this.advance(phone, state, num);
      }

      case 'economia': {
        const num = this.parseNumber(input);
        if (num === null) return 'Valor inválido. Manda só o número (ex: 1200) ou /pular';
        return await this.advance(phone, state, num);
      }

      case 'inversor':
        return await this.advance(phone, state, input.slice(0, 50));

      case 'modulo':
        return await this.advance(phone, state, input.slice(0, 50));

      case 'descricao': {
        const desc = input.trim();
        if (desc.length < 20) return 'Descrição muito curta. Manda no mínimo 20 caracteres.';
        if (desc.length > 300) return 'Descrição muito longa (máx 300). Reduz um pouco.';
        return await this.advance(phone, state, desc);
      }

      case 'midia':
        if (input.length > 0) {
          return 'Manda foto ou vídeo da obra agora. Quando terminar, manda */pronto*.';
        }
        return '';
    }
  }

  // Avança 1 passo no fluxo, salvando o valor do step atual.
  private async advance(phone: string, state: State, value?: string | number | CaseTipo): Promise<string> {
    if (value !== undefined) {
      switch (state.step) {
        case 'cliente': state.cliente = value as string; break;
        case 'tipo': state.tipo = value as CaseTipo; break;
        case 'kwp': state.kwp = value as number; break;
        case 'economia': state.economiaMensalBrl = value as number; break;
        case 'inversor': state.inversorMarca = value as string; break;
        case 'modulo': state.moduloMarca = value as string; break;
        case 'descricao': state.descCurta = value as string; break;
      }
    }

    const nextSteps: Record<Step, Step> = {
      cliente: 'cidade', cidade: 'tipo', tipo: 'kwp', kwp: 'economia',
      economia: 'inversor', inversor: 'modulo', modulo: 'descricao',
      descricao: 'midia', midia: 'midia',
    };
    state.step = nextSteps[state.step];
    await this.saveState(phone, state);

    return this.questionForStep(state.step);
  }

  private questionForStep(step: Step): string {
    switch (step) {
      case 'cliente': return 'Qual o nome do cliente? (ou /pular)';
      case 'cidade': return 'Cidade-UF da obra? (ex: Brasília-DF)';
      case 'tipo': return [
        'Tipo da obra? Responde:',
        '1) residencial',
        '2) comercial',
        '3) industrial',
        '4) rural',
        '5) híbrido (com bateria)',
        '6) usina (investimento)',
      ].join('\n');
      case 'kwp': return 'Quantos kWp tem o sistema? (ex: 8.4)';
      case 'economia': return 'Economia mensal estimada (R$)? (ex: 1200) ou /pular';
      case 'inversor': return 'Marca do inversor? (Sungrow, Solis, Deye, FoxESS, SolarEdge, GoodWe, Hoymiles...) ou /pular';
      case 'modulo': return 'Marca do módulo? (Trina, JA Solar, LONGi, Jinko, DAH, Risen...) ou /pular';
      case 'descricao': return 'Descreva a obra em 1 frase pra aparecer no card (20-300 letras). Ex: "Sistema solar residencial premium em Águas Claras com inversor Sungrow."';
      case 'midia': return 'Pronto! Agora me manda *fotos e/ou vídeos* da obra. Pode mandar várias. Quando terminar, manda */pronto*.';
    }
  }

  private parseNumber(input: string): number | null {
    const cleaned = input.replace(/[^\d.,\-]/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  // Etapa final: faz tudo (uploads, frame, commit, rebuild) e responde.
  private async finalize(phone: string, state: State): Promise<string> {
    if (!this.hasMinimumData(state) || state.midias.length === 0) {
      return '⚠️ Faltam dados ou mídias. Continua o cadastro.';
    }

    try {
      // 1) Slug do case + numero sequencial (com fallback timestamp se GitHub indisponivel)
      const slug = this.makeSlug(state);
      const numero = await this.nextCaseNumber();
      // Se nextCaseNumber retornou fallback (-1) usa timestamp pra garantir unicidade
      const slugWithNum = numero > 0
        ? `${String(numero).padStart(2, '0')}-${slug}`
        : `${slug}-${Date.now()}`;

      // 2) Baixar e processar cada midia
      const fotos: string[] = [];
      let videoUrl: string | undefined;
      let coverPath: string | undefined;

      for (const m of state.midias) {
        const downloaded = await this.meta.getMediaBase64(m.mediaId);
        if (!downloaded) {
          console.warn(`[case-creator] Falha ao baixar media ${m.mediaId}, pulando`);
          continue;
        }
        const buf = Buffer.from(downloaded.base64, 'base64');
        const ext = this.extFromMime(downloaded.mimetype);

        if (m.type === 'video') {
          // Upload do video pro Supabase
          const videoKey = `${slugWithNum}/video.${ext}`;
          const url = await this.uploadToSupabase(videoKey, buf, downloaded.mimetype);
          if (!videoUrl) videoUrl = url;

          // Extrai frame se ainda nao tem cover
          if (!coverPath) {
            const frame = await this.extractFrameFromVideo(buf);
            if (frame) {
              const frameKey = `${slugWithNum}/cover.jpg`;
              coverPath = await this.uploadToSupabase(frameKey, frame, 'image/jpeg');
            }
          }
        } else {
          // Upload da foto
          const fotoKey = `${slugWithNum}/${fotos.length === 0 && !coverPath ? 'cover' : `foto-${fotos.length + 1}`}.${ext}`;
          const url = await this.uploadToSupabase(fotoKey, buf, downloaded.mimetype);
          if (!coverPath) coverPath = url;
          else fotos.push(url);
        }
      }

      if (!coverPath) {
        await this.cancel(phone);
        return '⚠️ Nenhuma das mídias pôde ser processada. Tenta de novo com /novo-case.';
      }

      // 3) Monta JSON do case
      const caseJson = {
        slug,
        titulo: this.makeTitulo(state),
        ...(state.cliente ? { cliente: state.cliente } : {}),
        cidade: state.cidade!,
        uf: state.uf!,
        tipo: state.tipo!,
        kwp: state.kwp!,
        ...(state.economiaMensalBrl ? { economiaMensalBrl: state.economiaMensalBrl } : {}),
        descCurta: state.descCurta!,
        fotoPrincipal: coverPath,
        fotos,
        ...(videoUrl ? { videoUrl } : {}),
        featured: false,
        ...(state.inversorMarca ? { inversorMarca: state.inversorMarca } : {}),
        ...(state.moduloMarca ? { moduloMarca: state.moduloMarca } : {}),
        ...(state.uf ? { concessionaria: state.uf === 'DF' ? 'Neoenergia-DF' : 'Equatorial-GO' } : {}),
        dataInstalacao: new Date().toISOString().slice(0, 7),
      };

      // 4) Commit no GitHub
      const path = `src/content/cases/${slugWithNum}.json`;
      const message = `feat(cases): adiciona "${caseJson.titulo}" via WhatsApp Eva`;
      await this.commitJsonToGithub(path, JSON.stringify(caseJson, null, 2) + '\n', message);

      // 5) Dispara rebuild Cloudflare
      const rebuildOk = await this.siteDeploy.dispatchRebuild();

      // 6) Limpa estado
      await this.cancel(phone);

      const rebuildLine = rebuildOk
        ? 'Site rebuildando... fica pronto em ~2min em ecosunpower.eng.br/portfolio'
        : 'Site não rebuildou automaticamente — manda /aprovar-review fake-id pra disparar, ou eu posso configurar o deploy hook depois.';

      return [
        `✅ *Case "${caseJson.titulo}" cadastrado!*`,
        ``,
        `🏠 ${caseJson.cidade}-${caseJson.uf} · ${caseJson.tipo} · ${caseJson.kwp} kWp`,
        ...(caseJson.economiaMensalBrl ? [`💰 Economia mensal: R$ ${caseJson.economiaMensalBrl}`] : []),
        `📸 ${state.midias.length} mídia(s) salva(s)`,
        ``,
        rebuildLine,
      ].join('\n');
    } catch (err) {
      const msg = (err as Error).message;
      console.error('[case-creator] finalize error:', msg);
      return `⚠️ Erro ao finalizar: ${msg.slice(0, 200)}\n\nO estado foi mantido. Tenta /pronto de novo, ou /cancelar-case pra abortar.`;
    }
  }

  private makeSlug(state: State): string {
    // Slug = tipo + cliente (se tiver) + cidade simplificada
    const parts = [state.tipo, state.cliente, state.cidade].filter(Boolean) as string[];
    return parts
      .join(' ')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
  }

  private makeTitulo(state: State): string {
    if (state.cliente) return state.cliente;
    const tipoLabels: Record<CaseTipo, string> = {
      residencial: 'Residencial',
      comercial: 'Comercial',
      industrial: 'Industrial',
      rural: 'Rural',
      hibrido: 'Sistema Híbrido com Bateria',
      usina: 'Usina de Investimento',
    };
    return `${tipoLabels[state.tipo!]} ${state.cidade}`;
  }

  private extFromMime(mime: string): string {
    if (mime.includes('mp4')) return 'mp4';
    if (mime.includes('quicktime') || mime.includes('mov')) return 'mov';
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
    if (mime.includes('png')) return 'png';
    if (mime.includes('webp')) return 'webp';
    return 'bin';
  }

  // Conta cases existentes pra gerar próximo número (para slug NN-xxx).
  // Retorna -1 se nao conseguiu listar — chamador usa fallback timestamp pra evitar
  // sobrescrever case existente (sera de qualquer numero).
  private async nextCaseNumber(): Promise<number> {
    try {
      const url = `https://api.github.com/repos/${this.githubRepo}/contents/src/content/cases?ref=${this.githubBranch}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.githubPat}`, 'User-Agent': 'ecosunpower-case-bot' },
      });
      if (!res.ok) {
        console.warn(`[case-creator] GitHub API HTTP ${res.status} ao listar cases — usando fallback timestamp`);
        return -1;
      }
      const items = (await res.json()) as Array<{ name: string }>;
      const maxNum = items.reduce((max, it) => {
        const m = it.name.match(/^(\d+)-/);
        return m ? Math.max(max, parseInt(m[1])) : max;
      }, 0);
      return maxNum + 1;
    } catch (err) {
      console.warn('[case-creator] erro listando cases:', (err as Error).message);
      return -1;
    }
  }

  private async uploadToSupabase(key: string, buf: Buffer, contentType: string): Promise<string> {
    const { error } = await this.supabase.storage
      .from(CASES_BUCKET)
      .upload(key, buf, { contentType, upsert: true });
    if (error) throw new Error(`Supabase upload falhou: ${error.message}`);
    const { data } = this.supabase.storage.from(CASES_BUCKET).getPublicUrl(key);
    return data.publicUrl;
  }

  // Extrai 1 frame (segundo 5) do video usando ffmpeg local. Retorna Buffer JPEG.
  private async extractFrameFromVideo(videoBuf: Buffer): Promise<Buffer | null> {
    let tempDir: string | undefined;
    try {
      tempDir = await mkdtemp(join(tmpdir(), 'case-frame-'));
      const inputPath = join(tempDir, 'input.mp4');
      const outputPath = join(tempDir, 'cover.jpg');
      await writeFile(inputPath, videoBuf);

      // Tenta segundo 5 primeiro; se falhar (video curto), tenta segundo 1
      const tryAt = async (ts: string) => new Promise<boolean>((resolve) => {
        const args = ['-y', '-ss', ts, '-i', inputPath, '-vframes', '1', '-vf', 'scale=1600:-2', '-q:v', '3', outputPath];
        const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
        p.on('error', () => resolve(false));
        p.on('close', code => resolve(code === 0));
      });

      let ok = await tryAt('00:00:05');
      if (!ok) ok = await tryAt('00:00:01');
      if (!ok) ok = await tryAt('00:00:00');
      if (!ok) return null;

      return await readFile(outputPath);
    } catch (err) {
      console.error('[case-creator] frame extract erro:', (err as Error).message);
      return null;
    } finally {
      if (tempDir) {
        try {
          await unlink(join(tempDir, 'input.mp4')).catch(() => {});
          await unlink(join(tempDir, 'cover.jpg')).catch(() => {});
        } catch {}
      }
    }
  }

  private async commitJsonToGithub(path: string, content: string, message: string): Promise<void> {
    const apiUrl = `https://api.github.com/repos/${this.githubRepo}/contents/${path}`;
    const contentBase64 = Buffer.from(content, 'utf-8').toString('base64');

    // Verifica sha existente (caso esteja sobrescrevendo — improvável mas safe)
    let sha: string | undefined;
    try {
      const checkRes = await fetch(`${apiUrl}?ref=${this.githubBranch}`, {
        headers: { Authorization: `Bearer ${this.githubPat}`, 'User-Agent': 'ecosunpower-case-bot' },
      });
      if (checkRes.ok) {
        const data = (await checkRes.json()) as { sha: string };
        sha = data.sha;
      }
    } catch {}

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.githubPat}`,
        'User-Agent': 'ecosunpower-case-bot',
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
      },
      body: JSON.stringify({
        message,
        content: contentBase64,
        branch: this.githubBranch,
        ...(sha ? { sha } : {}),
      }),
    });

    if (!putRes.ok) {
      const err = await putRes.text();
      throw new Error(`GitHub commit falhou (${putRes.status}): ${err.slice(0, 200)}`);
    }
  }
}
