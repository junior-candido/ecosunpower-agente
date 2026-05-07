// Eva Proposta Assistant - modulo /proposta
// Coleta dados conversacionalmente, valida obrigatorios (REGRA DE OURO em propostas.md),
// gera proposta (HTML + PDF), faz upload no Drive, manda links pro Junior revisar antes
// de enviar pro cliente.

import Anthropic from '@anthropic-ai/sdk';
import Redis from 'ioredis';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { calcular, compararGreener, type ProposalInput } from './proposal/calculator.js';
import { renderProposalHTML, type ProposalData } from './proposal/template.js';
import { htmlToPdf, gerarQrCodeDataUrl } from './proposal/pdf-generator.js';
import type { DriveUploader } from './proposal/drive-uploader.js';
import type { SupabaseService } from './supabase.js';
import type { ModoEnvio, TipoProposta, AttachmentInput } from './proposal/attachments/types.js';
import { processAttachment } from './proposal/attachments/index.js';
import { getSignedUrlFromPath } from './proposal/attachments/storage-uploader.js';
import type { MetaWhatsAppService } from './meta-whatsapp.js';
import { enviarPropostaParaCliente } from './eva-sender.js';
import { CasesFetcher, type Case } from './cases-fetcher.js';
import { renderSocialProofPage } from './proposal/social-proof-page.js';

const IORedis = (Redis as any).default ?? Redis;
const PROPOSAL_MODE_TTL_SECONDS = 60 * 60;

interface ProposalMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Estado estruturado da sessao /proposta. Armazena modo de envio, tipo e anexos pendentes.
// Persistido em Redis sob a chave `proposal:state:${phone}`.
interface ProposalSessionState {
  modoEnvio?: ModoEnvio;
  tipo?: TipoProposta;
  attachments: AttachmentInput[];
  pendingMediaId?: string;     // media_id WABA aguardando legenda
  pendingMediaType?: 'foto' | 'video';
  reopenedSlug?: string;        // se setado, regenera proposta existente em vez de criar nova
}

// Estrutura JSON que o Claude retorna pra Eva entender o estado.
// Quando action='ready_to_generate', data contem ProposalData completo.
interface ClaudeResponse {
  action: 'ask_modo' | 'ask_tipo' | 'ask_more' | 'ready_to_generate' | 'confirm_generate' | 'chat';
  modoEnvio?: ModoEnvio | null;
  tipo?: TipoProposta | null;
  message: string;
  missing?: string[];
  data?: Partial<ProposalData> & {
    consumoMensalKwh?: number;
    consumoMensalKwhDistribuido?: number[];  // OPCIONAL: historico 12 meses do cliente
    geracaoMensalKwh?: number;     // override do PVSol/PVsyst, se Junior fornecer
    fatorPerda?: number;
    tarifaRsKwh?: number;
    custoDisponibilidadeMensal?: number;
  };
}

function buildSystemPrompt(propostasKnowledge: string, marcasKnowledge: string): string {
  return `Você é a Eva, assistente de geração de propostas comerciais da EcoSunPower. Está conversando com Junior (Responsável Técnico CREA/CFT, 10+ anos de experiência) pra coletar dados de um cliente e gerar uma proposta profissional em PDF e versão web.

TOM: direto, técnico, sem ladainha. Junior conhece tudo. Vá pros números.

# KNOWLEDGE: PROPOSTAS

${propostasKnowledge}

# KNOWLEDGE: MARCAS OFICIAIS ECOSUNPOWER

${marcasKnowledge}

# REGRAS CRÍTICAS

1. **REGRA DE OURO**: NUNCA prossiga pra geração com campos obrigatórios faltando. Sempre liste o que falta.
2. **Fator de perda SEMPRE pergunta** — Junior decide caso a caso (típicos: 0.75 / 0.80 / 0.85). NUNCA assume default.
3. Use APENAS marcas oficiais da lista. NUNCA Growatt.
4. Concessionária inferida do endereço: Brasília=Neoenergia-DF, Goiás=Equatorial-GO. Confirme com Junior.
5. Tarifa default: Neoenergia-DF R$ 1,05/kWh, Equatorial-GO R$ 0,98/kWh. Junior pode sobrescrever.
6. Custo disponibilidade default: monofásico R$ 50/mês, trifásico R$ 100/mês.
7. Reajuste anual energia: 10%.
8. Vida útil: 25 anos.
9. Validade da proposta: 5 dias.

# FORMATO DE RESPOSTA

Você DEVE responder SEMPRE com um único objeto JSON em uma única linha (sem markdown, sem explicação extra), seguindo este schema:

\`\`\`json
{
  "action": "ask_modo" | "ask_tipo" | "ask_more" | "ready_to_generate" | "confirm_generate" | "chat",
  "modoEnvio": "junior_envia" | "eva_envia" | null,
  "tipo": "basica" | "personalizada" | null,
  "message": "string que será mostrada pro Junior no WhatsApp",
  "missing": ["lista", "de", "campos", "faltando"],
  "data": {
    "nomeCliente": "string",
    "documentoCliente": "string",
    "enderecoCliente": "string",
    "telefoneCliente": "string",
    "emailCliente": "string",
    "potenciaKwp": 8.4,
    "fatorPerda": 0.80,
    "consumoMensalKwh": 1000,
    "consumoMensalKwhDistribuido": [1100, 1080, 1020, 950, 880, 850, 870, 920, 980, 1050, 1120, 1180],
    "geracaoMensalKwh": 1080,
    "tarifaRsKwh": 1.05,
    "custoDisponibilidadeMensal": 50,
    "tipoCliente": "residencial",
    "modalidade": "autoconsumo local",
    "concessionaria": "Neoenergia DF",
    "modulo": { "fabricante": "Trina", "modelo": "Vertex 700W", "potenciaW": 700, "quantidade": 12, "garantiaDefeito": 12, "garantiaEficiencia": 30, "tecnologia": "TOPCon N-Type Bifacial" },
    "inversor": { "fabricante": "Sungrow", "modelo": "SG5.0RS-L", "potenciaW": 5000, "quantidade": 1, "garantia": 10, "eficiencia": 0.985, "tipoInversor": "string" },
    "estruturaFixacao": { "tipo": "Telha cerâmica", "material": "Alumínio anodizado + parafusos inox", "descricao": "Ganchos com regulagem de altura" },
    "valorTotalRs": 38500,
    "formasPagamento": [
      { "tipo": "À Vista", "titulo": "PIX ou TED", "valorPrincipal": "R$ 38.500", "valorSecundario": "pagamento único", "recomendado": true, "bullets": ["Sem juros", "Início imediato", "Maior economia"] }
    ]
  }
}
\`\`\`

## QUANDO USAR CADA ACTION

- **ask_modo**: PRIMEIRA mensagem. Pergunta quem envia (Junior ou Eva). \`modoEnvio: null\`. Mensagem curta com default "você envia". Veja seção MODOS DE ENVIO no knowledge.
- **ask_tipo**: depois que modoEnvio foi capturado, pergunta básica/personalizada. \`tipo: null\`. Veja seção TIPOS DE PROPOSTA.
- **ask_more**: faltam dados obrigatórios (LEMBRE dos modos: junior_envia tem só nome+geração obrigatórios). \`missing\` lista os campos. \`message\` formato curto: "Falta:\\n• campo1\\n• campo2\\nManda tudo junto."
- **ready_to_generate**: TUDO coletado. Faz um RESUMO confirmando os dados pro Junior. \`message\` deve ser o resumo formatado (com emojis e separadores). \`data\` contém TODOS os campos.
- **confirm_generate**: Junior respondeu "gerar"/"ok"/"manda" depois do resumo. Repete \`data\` completo. \`message\` deve ser curto: "✅ Gerando proposta..."
- **chat**: conversa solta (Junior tirando dúvida sobre algo). Apenas \`message\`.

## CAMPOS OBRIGATÓRIOS

⚠️ **Lista MUDA conforme modoEnvio.** Veja seções "MODOS DE ENVIO" e "CAMPOS POR MODO DE ENVIO" no knowledge acima.

**Sempre obrigatórios (independente do modo):**
- nomeCliente
- Sistema: potenciaKwp, fatorPerda, consumoMensalKwh, tipoCliente, modalidade, concessionaria
- Equipamentos: modulo (todos), inversor (todos), estruturaFixacao (tipo)
- Comercial: valorTotalRs

**Modo \`junior_envia\` — adicionalmente OPCIONAIS (NÃO listar em missing):**
- enderecoCliente, telefoneCliente, emailCliente, documentoCliente

**Modo \`eva_envia\` — adicionalmente OBRIGATÓRIOS:**
- telefoneCliente (com validação de formato BR)
- (recomendados: emailCliente, documentoCliente, enderecoCliente)

## DEFAULTS QUE VOCÊ APLICA

- tarifaRsKwh: Neoenergia DF 1.05, Equatorial GO 0.98
- custoDisponibilidadeMensal: monofásico 50, trifásico 100
- modulo.garantiaDefeito: Trina/JA/Jinko = 12, Risen = 12
- modulo.garantiaEficiencia: TOPCon N-Type = 30, mono normal = 25
- inversor.garantia (REGRA POR TIPO):
  - **MICROINVERSOR** (Hoymiles, Enphase, NEP, APsystems): **12 anos**
  - **INVERSOR STRING** (Sungrow, Solis, Deye, Huawei, Goodwe): **10 anos**
  - **SOLAREDGE** (otimizadores): **12 anos** padrão, com nota "extensível até 20 anos sob demanda" no template
- inversor.tipoInversor: detecta pelo fabricante:
  - "hoymiles", "enphase", "nep", "apsystems" → "microinversor"
  - "solaredge" → "solaredge"
  - resto → "string"
- inversor.modelo (DEFAULTS quando Junior fala só fabricante):
  - **Hoymiles**: padrão HM-2250-4T (microinversor 2,25 kW 4 entradas — mais atual). Junior fala se for outro.
  - **Sungrow**: padrão SG5.0RS-L. Junior fala se for outro.
  - **Solis**: padrão S6-GR1P5K. Junior fala se for outro.
  - **Deye**: padrão SUN-5K-G. Junior fala se for outro.
- estruturaFixacao.tipo: Junior diz tipo do telhado/superficie. Mapeie:
  - "cerâmica/colonial/portuguesa" → "Telha cerâmica"
  - "metálica/sanduíche/zipada" → "Telha metálica"
  - "fibrocimento/eternit" → "Telha fibrocimento"
  - "laje/concreto" → "Laje"
  - "solo/chão/aterrada" → "Solo"
  - "carport/garagem/pergolado" → "Carport"
  - Se Junior não disser, ASSUMA "Telha cerâmica" mas adicione em missing pra confirmar.
- estruturaFixacao.material: default "Alumínio anodizado + parafusos inox" salvo se Junior especificar.

- formasPagamento: SEMPRE incluir 3 opções padrão:
  1. À vista PIX/TED (recomendado, sem juros)
  2. Cartão de crédito até 24× com juros (~2.5%a.m., fator total ~1.65)
  3. Financiamento até 90× com carência até 120 dias (Solfácil/Sol Agora/BV/Santander, ~1.7%a.m., fator ~2.10)
  Calcule parcelas baseadas em valorTotalRs. Se Junior pedir customização ("só à vista", "12x sem juros"), respeitar.

## EXEMPLO DE FLUXO

Junior: "/proposta Marcos Silva CPF 111.222.333-44, 8.4kWp Trina 700W, valor 38500"

Você: \`{"action":"ask_more","missing":["RG","Endereço completo","Telefone","E-mail","Modelo do inversor","Modalidade","Concessionária","Fator de perda","Consumo médio (kWh/mês)"],"message":"Beleza, Marcos Silva 8,4 kWp por R$ 38.500. Falta:\\n• RG\\n• Endereço completo\\n• Telefone e e-mail\\n• Modelo do inversor (qual?)\\n• Modalidade: autoconsumo local, remoto ou compartilhado?\\n• Concessionária: Neoenergia DF ou Equatorial GO?\\n• Fator de perda (0,75 / 0,80 / 0,85?)\\n• Consumo médio mensal em kWh\\nPode mandar tudo junto."}\`

## SAÍDA E COMANDOS

Se Junior digitar "/sair", "sair", "fechar", responda \`{"action":"chat","message":"👍 Saiu do modo proposta."}\`.

Se Junior digitar "ajuda" ou "/proposta ajuda", explique o fluxo curto.`;
}

export class ProposalAssistant {
  private client: Anthropic;
  private redis: any;
  private systemPrompt: string;
  private driveUploader: DriveUploader | null;
  private engineerPhone: string;
  private companyDefaults: ProposalData['empresa'];
  private supabaseService: SupabaseService | null;
  private publicProposalBaseUrl: string;
  private metaService: MetaWhatsAppService | null;
  private casesFetcher: CasesFetcher;
  private googleNota: string;
  private googleQtdAvaliacoes: number;

  constructor(opts: {
    apiKey: string;
    redisHost: string;
    redisPort: number;
    redisPassword: string | undefined;
    knowledgeBaseDir: string;
    driveUploader: DriveUploader | null;
    engineerPhone: string;
    companyDefaults?: Partial<ProposalData['empresa']>;
    supabaseService?: SupabaseService | null;
    publicProposalBaseUrl?: string;
    metaService?: MetaWhatsAppService | null;
    siteUrl?: string;
    googleNota?: string;
    googleQtdAvaliacoes?: number;
  }) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.redis = new IORedis({
      host: opts.redisHost,
      port: opts.redisPort,
      password: opts.redisPassword,
      maxRetriesPerRequest: null,
    });

    const propostas = readFileSync(join(opts.knowledgeBaseDir, 'propostas.md'), 'utf-8');
    let marcas = '';
    try {
      marcas = readFileSync(join(opts.knowledgeBaseDir, 'produtos.md'), 'utf-8');
    } catch {
      marcas = 'Marcas oficiais: Trina, JA Solar, LONGi, Jinko, DAH, Risen (placas); Sungrow, Solis, Deye, FoxESS, SolarEdge, Huawei, GoodWe, Hoymiles, NEP (inversores). NUNCA Growatt.';
    }

    this.systemPrompt = buildSystemPrompt(propostas, marcas);
    this.driveUploader = opts.driveUploader;
    this.engineerPhone = opts.engineerPhone;
    this.supabaseService = opts.supabaseService ?? null;
    this.publicProposalBaseUrl = (opts.publicProposalBaseUrl ?? 'https://propostas.ecosunpower.eng.br').replace(/\/$/, '');
    this.metaService = opts.metaService ?? null;

    this.companyDefaults = {
      nome: 'EcoSunPower Energia Solar LTDA',
      cnpj: '33.020.459/0001-06',
      cidade: 'Brasília-DF',
      telefone: '(61) 99697-8781',
      site: 'ecosunpower.eng.br',
      ...opts.companyDefaults,
    };

    this.casesFetcher = new CasesFetcher({
      siteUrl: opts.siteUrl ?? 'https://ecosunpower.eng.br',
    });
    this.googleNota = opts.googleNota ?? '4.9';
    this.googleQtdAvaliacoes = opts.googleQtdAvaliacoes ?? 0;
  }

  // Mapeia o tipoCliente da proposta (string livre que pode vir variada do
  // Claude) pro enum Case.tipo. Fallback pra 'residencial' se nao bater.
  private tipoToCaseTipo(tipoCliente: string | undefined): Case['tipo'] {
    const t = (tipoCliente ?? '').toLowerCase().trim();
    if (t.includes('hibrido') || t.includes('híbrido') || t.includes('bateria')) return 'hibrido';
    if (t.includes('industrial') || t.includes('industria') || t.includes('indústria')) return 'industrial';
    if (t.includes('rural') || t.includes('agro') || t.includes('fazenda')) return 'rural';
    if (t.includes('usina') || t.includes('investimento') || t.includes('gd ')) return 'usina';
    if (t.includes('comercial') || t.includes('comercio') || t.includes('comércio')) return 'comercial';
    return 'residencial';
  }

  // Busca 3 cases similares ao tipo do cliente e renderiza o HTML da pagina
  // de prova social que vai antes do CTA "fechar" no PDF/web da proposta.
  // Retorna '' se algo falhar — proposta segue sem prova social, sem quebrar.
  private async buildSocialProofHtml(tipoCliente: string | undefined): Promise<string> {
    try {
      const tipo = this.tipoToCaseTipo(tipoCliente);
      const cases = await this.casesFetcher.getByTipo(tipo, 3);
      if (cases.length === 0) return '';
      return renderSocialProofPage({
        cases,
        googleNota: this.googleNota,
        googleQtdAvaliacoes: this.googleQtdAvaliacoes,
      });
    } catch (err) {
      console.warn('[proposal/social-proof] erro montando bloco:', (err as Error).message);
      return '';
    }
  }

  // Detecta se mensagem dispara modo proposta.
  // Cobre: comando barra, palavra solta, verbos diretos, audio transcrito.
  static isProposalTrigger(text: string): boolean {
    const raw = text.toLowerCase().trim();
    if (!raw) return false;
    const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    let norm = stripAccents(raw).replace(/[^\w\s\/]/g, '').trim();
    norm = norm.replace(/^eva[\s,]+/, '').trim();

    if (/^\/(proposta|propor|gerar?\s*proposta)(\s|$)/.test(norm)) return true;

    const palavrasSoltas = ['proposta', 'propostas', 'gerar proposta', 'fazer proposta'];
    if (palavrasSoltas.includes(norm)) return true;

    if (/^(preciso |quero |vou |me ajuda a )?(gerar|fazer|montar|criar)\s+(uma\s+)?proposta(\s|$)/.test(norm)) return true;

    return false;
  }

  static isExitTrigger(text: string): boolean {
    const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const norm = stripAccents(text.toLowerCase().trim()).replace(/[^\w\s\/]/g, '').trim();
    return [
      '/sair', '/exit', '/proposta off',
      'sair', 'fechar', 'parar', 'cancelar',
      'sair do modo', 'sair da proposta', 'finalizar', 'encerrar',
    ].includes(norm);
  }

  async isInProposalMode(phone: string): Promise<boolean> {
    const result = await this.redis.get(`proposal:${phone}`);
    return result !== null;
  }

  // State helpers — sessao estruturada (modo, tipo, anexos) separada do historico de mensagens.
  private stateKey(phone: string): string {
    return `proposal:state:${phone}`;
  }

  private async loadState(phone: string): Promise<ProposalSessionState> {
    const raw = await this.redis.get(this.stateKey(phone));
    if (!raw) return { attachments: [] };
    try {
      return JSON.parse(raw);
    } catch {
      return { attachments: [] };
    }
  }

  private async saveState(phone: string, state: ProposalSessionState): Promise<void> {
    await this.redis.setex(this.stateKey(phone), PROPOSAL_MODE_TTL_SECONDS, JSON.stringify(state));
  }

  async getSessionState(phone: string): Promise<ProposalSessionState> {
    return await this.loadState(phone);
  }

  // Detecta se Junior esta em modo proposta personalizada e envia midia.
  // Salva o media_id como pendente, pede legenda. Quando legenda chegar (proxima msg de texto),
  // o processProposalMessage adiciona ao state.attachments e responde confirmacao.
  async handleIncomingMedia(
    phone: string,
    mediaId: string,
    mediaType: 'image' | 'video' | 'document',
  ): Promise<string | null> {
    const state = await this.loadState(phone);
    if (state.tipo !== 'personalizada') {
      return null; // nao esta em modo personalizada — nao processa
    }

    // Detecta categoria. Image e video sao obvios. Document pode ser foto ou video
    // dependendo do mimeType — mas a essa altura nao temos o mimeType ainda.
    // Trata document como "video se mediaType==='video' else foto" — vai validar depois quando baixar.
    // Junior costuma mandar imagens e videos como "document" pra preservar qualidade.
    // Por enquanto marcamos como tipo provavel; processAttachment valida real quando baixar.
    const tipoProvavel: 'foto' | 'video' = mediaType === 'video' ? 'video' : 'foto';

    state.pendingMediaId = mediaId;
    state.pendingMediaType = tipoProvavel;
    await this.saveState(phone, state);

    const fotosAtuais = state.attachments.filter((a) => a.tipo === 'foto').length;
    const videosAtuais = state.attachments.filter((a) => a.tipo === 'video').length;
    const numero = tipoProvavel === 'foto' ? fotosAtuais + 1 : videosAtuais + 1;
    const limite = tipoProvavel === 'foto' ? 3 : 1;

    return [
      `📎 ${tipoProvavel === 'foto' ? `Foto ${numero}/${limite}` : 'Vídeo'} recebida.`,
      '',
      `Qual a legenda? (ex: ${tipoProvavel === 'foto' ? '"Vista superior do telhado"' : '"Simulação sombreamento 7h-18h"'})`,
      '_(curta, máx 100 caracteres)_',
    ].join('\n');
  }

  async startProposalMode(phone: string, initialMessage?: string): Promise<string> {
    await this.redis.setex(`proposal:${phone}`, PROPOSAL_MODE_TTL_SECONDS, '1');
    await this.redis.del(`proposal:history:${phone}`);
    await this.saveState(phone, { attachments: [] });

    // Se Junior ja descreveu junto com o trigger, vai direto pro Claude.
    const stripped = (initialMessage ?? '')
      .replace(/^\/(proposta|propor|gerar\s*proposta)\s*/i, '')
      .replace(/^(preciso |quero |vou |me ajuda a )?(gerar|fazer|montar|criar)\s+(uma\s+)?proposta\s*/i, '')
      .trim();
    if (stripped.length > 5) {
      return await this.processProposalMessage(phone, stripped);
    }

    // Sem dados iniciais — pergunta o modo de envio (primeira pergunta do fluxo novo).
    // Semeia o historico com essa pergunta como mensagem da assistente, pra quando
    // Junior responder ("ok"/"eu"/"eva"), o Claude tenha contexto e consiga capturar
    // o modoEnvio sem confusao.
    const welcomeMessage = [
      '📋 *Modo Proposta ATIVO*',
      '',
      'Quem envia essa proposta? Você ou eu mando direto pro cliente?',
      '_(default: você envia — só responde "ok" pra ir nesse)_',
      '',
      'Pra sair: `/sair`',
    ].join('\n');

    // Seed history com formato JSON que o Claude usa nas proximas turnos
    const seededAssistantTurn = JSON.stringify({
      action: 'ask_modo',
      modoEnvio: null,
      message: welcomeMessage,
    });
    await this.redis.setex(
      `proposal:history:${phone}`,
      PROPOSAL_MODE_TTL_SECONDS,
      JSON.stringify([{ role: 'assistant', content: seededAssistantTurn }]),
    );

    return welcomeMessage;
  }

  async exitProposalMode(phone: string): Promise<void> {
    await this.redis.del(`proposal:${phone}`);
    await this.redis.del(`proposal:history:${phone}`);
    await this.redis.del(this.stateKey(phone));
  }

  async processProposalMessage(phone: string, message: string): Promise<string> {
    if (ProposalAssistant.isExitTrigger(message)) {
      await this.exitProposalMode(phone);
      return '👍 Saiu do modo proposta.';
    }

    // Intercepta legenda quando ha midia pendente esperando descricao.
    // Aceita qualquer frase: 1 ate 250 chars, ou "pula"/"sem legenda" pra deixar vazio.
    {
      const state = await this.loadState(phone);
      if (state.pendingMediaId && state.pendingMediaType) {
        let legenda = message.trim();

        // Junior pode pular: usa fallback automatico
        if (/^(pula|pular|sem legenda|nada|skip|-)$/i.test(legenda)) {
          const fotosAtuais = state.attachments.filter((a) => a.tipo === 'foto').length;
          legenda = state.pendingMediaType === 'foto'
            ? `Estudo ${fotosAtuais + 1}`
            : 'Simulação';
        }

        if (legenda.length === 0) {
          return '⚠️ Manda algum texto pra legenda — ou responde "pula" pra usar legenda padrão.';
        }
        if (legenda.length > 250) {
          legenda = legenda.slice(0, 247) + '...';
        }

        state.attachments.push({
          tipo: state.pendingMediaType,
          legenda,
          mediaIdWaba: state.pendingMediaId,
        });
        state.pendingMediaId = undefined;
        state.pendingMediaType = undefined;
        await this.saveState(phone, state);

        const fotos = state.attachments.filter((a) => a.tipo === 'foto').length;
        const videos = state.attachments.filter((a) => a.tipo === 'video').length;
        const partes: string[] = [];
        if (fotos > 0) partes.push(`${fotos}/3 fotos`);
        if (videos > 0) partes.push(`${videos}/1 vídeo`);
        return `✅ Anexado: "${legenda}"\n\nTotal: ${partes.join(' + ')}.\n\nManda mais arquivo(s) ou continue com os dados do cliente/sistema.`;
      }
    }

    // Intercepta "enviar"/"manda"/"envia" quando ha proposta gerada e modo eva_envia.
    // Isso evita ir pro Claude pra cada confirmacao — Junior diz "enviar" e Eva dispara.
    if (/^(enviar|envia|manda|mandar|mandar pro cliente|envia pro cliente|aprovado)\s*$/i.test(message.trim())) {
      const sendResult = await this.tryDispatchToClient(phone);
      if (sendResult !== null) return sendResult;
      // se retornou null, modo nao era eva_envia ou nao havia proposta — segue fluxo normal Claude
    }

    const histRaw = await this.redis.get(`proposal:history:${phone}`);
    const history: ProposalMessage[] = histRaw ? JSON.parse(histRaw) : [];
    history.push({ role: 'user', content: message });

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      system: [{ type: 'text', text: this.systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: history,
    }, { timeout: 30_000 });

    const rawReply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();

    let parsed: ClaudeResponse;
    try {
      // Aceita resposta com ou sem code fence
      const jsonMatch = rawReply.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : rawReply;
      parsed = JSON.parse(jsonStr);
    } catch (err) {
      console.warn('[proposal] Claude nao retornou JSON valido:', rawReply.slice(0, 200));
      // fallback: trata como chat puro
      parsed = { action: 'chat', message: rawReply };
    }

    history.push({ role: 'assistant', content: rawReply });
    const trimmed = history.slice(-30);
    await this.redis.setex(`proposal:history:${phone}`, PROPOSAL_MODE_TTL_SECONDS, JSON.stringify(trimmed));
    await this.redis.setex(`proposal:${phone}`, PROPOSAL_MODE_TTL_SECONDS, '1');

    // Persiste modoEnvio e tipo no estado da sessao quando Claude retornar valor concreto.
    // null/undefined nao sobrescreve (Claude usa null em ask_modo/ask_tipo).
    if (parsed.modoEnvio || parsed.tipo) {
      const state = await this.loadState(phone);
      if (parsed.modoEnvio) state.modoEnvio = parsed.modoEnvio;
      if (parsed.tipo) state.tipo = parsed.tipo;
      await this.saveState(phone, state);
    }

    if (parsed.action === 'confirm_generate' && parsed.data) {
      return await this.generateProposal(phone, parsed.data, parsed.message);
    }

    return parsed.message ?? 'Ok.';
  }

  // Quando Junior disser "enviar" (modo eva_envia), Eva dispara pro telefone
  // do cliente: saudacao + link web + PDF como documento.
  // Retorna null se contexto nao se aplica (modo errado, sem proposta salva, etc) —
  // nesse caso o handler segue o fluxo normal pro Claude.
  private async tryDispatchToClient(phone: string): Promise<string | null> {
    const state = await this.loadState(phone);
    if (state.modoEnvio !== 'eva_envia') return null;

    const lastRaw = await this.redis.get(`proposal:last:${phone}`);
    if (!lastRaw) return null;

    if (!this.metaService) {
      return '⚠️ MetaWhatsAppService nao configurado — nao consigo mandar pro cliente. Junior, manda manualmente pelo zap.';
    }

    let last: { data: any; proposalData: ProposalData; publicUrl: string | null; upload: any };
    try {
      last = JSON.parse(lastRaw);
    } catch {
      return '⚠️ Erro ao carregar proposta salva. Gera de novo, por favor.';
    }

    const telefone = last.data?.telefoneCliente;
    const nome = last.data?.nomeCliente;
    if (!telefone) return '⚠️ Telefone do cliente nao foi capturado. Re-gera a proposta com o telefone certo.';
    if (!last.publicUrl) return '⚠️ Link publico nao disponivel. Re-gera com Supabase configurado.';

    // Re-gera o PDF buffer (nao salvamos buffer no Redis pra economizar memoria).
    try {
      const calcInput = this.dataToCalculatorInput(last.data);
      const calculations = calcular(calcInput);
      const socialProofHtml = await this.buildSocialProofHtml(last.proposalData.tipoCliente);
      const html = renderProposalHTML(last.proposalData, calculations, socialProofHtml);
      const pdfBuffer = await htmlToPdf(html, { waitForChartMs: 2000 });

      const result = await enviarPropostaParaCliente(this.metaService, {
        telefoneCliente: telefone,
        nomeCliente: nome,
        linkWebPublico: last.publicUrl,
        pdfBuffer,
        pdfFilename: `Proposta-EcoSunPower-${nome.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-')}.pdf`,
      });

      if (!result.ok) {
        return `⚠️ Erro ao enviar pro cliente: ${result.reason.slice(0, 150)}`;
      }

      // Limpa estado depois do envio (sucesso = ciclo encerrado)
      await this.exitProposalMode(phone);
      return `✅ Proposta enviada pra ${nome} (${telefone}). Vou ficar de olho se ele responde.`;
    } catch (err) {
      return `⚠️ Erro ao gerar PDF pra envio: ${(err as Error).message.slice(0, 150)}`;
    }
  }

  // Processa attachments pendentes (foram salvos no Redis com mediaIdWaba + legenda).
  // Para cada um: download WABA -> validate -> upload Supabase Storage -> persist DB.
  // Retorna estrutura pronta pra o template renderizar (URLs assinadas + QR Code).
  private async processarAnexosPendentes(
    slug: string,
    attachments: AttachmentInput[],
  ): Promise<NonNullable<ProposalData['estudoPersonalizado']>> {
    if (!this.supabaseService) throw new Error('SupabaseService nao configurado');
    const supabase = this.supabaseService.getClient();
    const accessToken = process.env.META_WABA_ACCESS_TOKEN;
    if (!accessToken) throw new Error('META_WABA_ACCESS_TOKEN nao configurado');

    const fotos: Array<{ url: string; legenda: string; ordem: number }> = [];
    let video: NonNullable<ProposalData['estudoPersonalizado']>['video'] | undefined;

    let fotoCount = 0;
    let videoCount = 0;

    for (const att of attachments) {
      const result = await processAttachment(supabase, {
        mediaIdWaba: att.mediaIdWaba,
        accessToken,
        proposalSlug: slug,
        legenda: att.legenda,
        fotoCount,
        videoCount,
      });

      if (!result.ok) {
        console.warn('[proposal] processAttachment falhou:', result.reason);
        continue;
      }

      const r = result.record;
      if (r.tipo === 'foto') {
        fotoCount++;
        fotos.push({
          url: await getSignedUrlFromPath(supabase, r.storagePath),
          legenda: r.legenda,
          ordem: r.ordem,
        });
      } else {
        videoCount++;
        video = {
          thumbnailUrl: r.thumbnailPath ? await getSignedUrlFromPath(supabase, r.thumbnailPath) : '',
          legenda: r.legenda,
          webVideoUrl: await getSignedUrlFromPath(supabase, r.storagePath),
        };
      }
    }

    fotos.sort((a, b) => a.ordem - b.ordem);

    let qrCodeDataUrl: string | undefined;
    if (video) {
      const linkPublico = `${this.publicProposalBaseUrl}/p/${slug}`;
      qrCodeDataUrl = await gerarQrCodeDataUrl(linkPublico);
    }

    return { fotos, video, qrCodeDataUrl };
  }

  // Gera o PDF + HTML, faz upload no Drive, retorna links pro Junior.
  // Salva tambem em Redis pra "enviar" depois disparar pro cliente.
  private async generateProposal(
    phone: string,
    data: any,
    confirmMsg: string,
  ): Promise<string> {
    if (!this.driveUploader && !this.supabaseService) {
      return '⚠️ Nenhum destino configurado. Configure GOOGLE_REFRESH_TOKEN (Drive) ou SUPABASE_URL (web publica).';
    }

    try {
      const calcInput = this.dataToCalculatorInput(data);

      // Validacao defense-in-depth: campos numericos precisam ser finitos e > 0.
      // REGRA DE OURO ja cobre no Claude, mas se vier NaN aqui evita propagar lixo.
      const ensureNum = (name: string, v: number) => {
        if (!isFinite(v) || v <= 0) throw new Error(`Campo "${name}" inválido: ${v}`);
      };
      ensureNum('potenciaKwp', calcInput.potenciaKwp);
      ensureNum('fatorPerda', calcInput.fatorPerda);
      ensureNum('consumoMensalKwh', calcInput.consumoMensalKwh);
      ensureNum('tarifaRsKwh', calcInput.tarifaRsKwh);
      ensureNum('valorTotalRs', calcInput.valorTotalRs);

      const calculations = calcular(calcInput);

      const proposalData = this.dataToProposalData(data, calculations);

      // Slug urlsafe 96 bits de entropia (16 chars base64url) — luxo, mas zero custo.
      // Gerado ANTES do render pra que attachments referenciem este slug.
      const slug = randomBytes(12).toString('base64url');

      const sessionState = await this.loadState(phone);
      proposalData.tipo = sessionState.tipo ?? 'basica';
      const temAnexos = sessionState.tipo === 'personalizada'
        && sessionState.attachments.length > 0
        && !!this.supabaseService;

      // Pre-flight: se tem anexos, INSERT propostas_publicas STUB primeiro pra satisfazer FK.
      // O html_content sera atualizado no fim com o conteudo real (com fotos embutidas).
      // Sem essa pre-insercao, processAttachment falha com FK violation.
      if (temAnexos) {
        await this.supabaseService!.savePropostaPublica({
          slug,
          numeroProposta: proposalData.numeroProposta,
          clienteNome: data.nomeCliente,
          clienteTelefone: data.telefoneCliente,
          htmlContent: '<!doctype html><html><body>Generating...</body></html>',
          dadosInput: undefined,
          tipo: sessionState.tipo,
        });

        try {
          proposalData.estudoPersonalizado = await this.processarAnexosPendentes(
            slug,
            sessionState.attachments,
          );
        } catch (err) {
          console.warn('[proposal] Falha ao processar anexos:', (err as Error).message);
          // Segue sem anexos — proposta sai sem a secao "Estudamos seu Telhado"
        }
      }

      const socialProofHtml = await this.buildSocialProofHtml(proposalData.tipoCliente);
      const html = renderProposalHTML(proposalData, calculations, socialProofHtml);

      const pdfBuffer = await htmlToPdf(html, { waitForChartMs: 2000 });

      // Drive (PDF + HTML interno) e Supabase (HTML publico) em paralelo.
      // Supabase eh prioridade — se Drive falhar, Junior ainda tem o link web pro cliente.
      const drivePromise = this.driveUploader
        ? this.driveUploader.uploadProposal({
            nomeCliente: data.nomeCliente,
            numeroProposta: proposalData.numeroProposta,
            pdfBuffer,
            htmlContent: html,
            inputDataJson: JSON.stringify({ data, calcInput }, null, 2),
            shareWithEmail: data.emailCliente,
          })
        : Promise.reject(new Error('Drive uploader nao configurado'));

      // dados_input NAO inclui PII completa do cliente — html_content ja tem
      // os dados visiveis ao cliente. Dump completo (com CPF/RG) fica so no Drive
      // _internal/dados-*.json, que e auditado e tem retencao maior.
      // Salva apenas calcInput (numeros) + meta minima pra debugging.
      const dadosInputMinimo: Record<string, unknown> = {
        calcInput,
        sistema: {
          potenciaKwp: data.potenciaKwp,
          tipoCliente: data.tipoCliente,
          modalidade: data.modalidade,
          concessionaria: data.concessionaria,
          modulo: data.modulo,
          inversor: data.inversor,
          estruturaFixacao: data.estruturaFixacao,
        },
        comercial: { valorTotalRs: data.valorTotalRs },
      };

      const supabasePromise = this.supabaseService
        ? (temAnexos
            // Stub ja foi inserido antes; aqui so atualiza o html_content com o real.
            ? this.supabaseService.updatePropostaPublicaHtml(slug, html).then(() => ({ id: slug, expiresAt: '' }))
            : this.supabaseService.savePropostaPublica({
                slug,
                numeroProposta: proposalData.numeroProposta,
                clienteNome: data.nomeCliente,
                clienteTelefone: data.telefoneCliente,
                htmlContent: html,
                dadosInput: dadosInputMinimo,
                tipo: sessionState.tipo ?? 'basica',
              }))
        : Promise.reject(new Error('Supabase service nao configurado'));

      const [uploadResult, publicResult] = await Promise.allSettled([drivePromise, supabasePromise]);

      const upload = uploadResult.status === 'fulfilled' ? uploadResult.value : null;
      const publicSaved = publicResult.status === 'fulfilled';
      const publicUrl = publicSaved ? `${this.publicProposalBaseUrl}/p/${slug}` : null;

      if (!upload && !publicSaved) {
        const driveErr = uploadResult.status === 'rejected' ? (uploadResult.reason as Error).message : 'ok';
        const pubErr = publicResult.status === 'rejected' ? (publicResult.reason as Error).message : 'ok';
        throw new Error(`Drive: ${driveErr} | Web: ${pubErr}`);
      }
      if (!upload) {
        console.warn('[proposal] Drive upload falhou:', (uploadResult as PromiseRejectedResult).reason);
      }
      if (!publicSaved) {
        console.warn('[proposal] Save Supabase falhou:', (publicResult as PromiseRejectedResult).reason);
      }

      // Salva o estado pra Junior depois falar "enviar"
      await this.redis.setex(
        `proposal:last:${phone}`,
        PROPOSAL_MODE_TTL_SECONDS * 24,
        JSON.stringify({ data, upload, proposalData, publicUrl, slug }),
      );

      const greener = compararGreener(calcInput.potenciaKwp, calculations.rsPorWp);

      const linkLines: string[] = [];
      if (publicUrl) {
        linkLines.push(`🌐 Web (manda pro cliente): ${publicUrl}`);
      }
      if (upload) {
        linkLines.push(`📄 PDF (Drive): ${upload.pdfWebViewLink}`);
        if (!publicUrl) linkLines.push(`🌐 Web (Drive fallback): ${upload.htmlWebViewLink}`);
      }
      if (linkLines.length === 0) {
        linkLines.push('⚠️ Nenhum link disponivel — checar logs.');
      }

      return [
        '✅ Proposta gerada!',
        '',
        ...linkLines,
        '',
        `💰 R$/Wp: R$ ${calculations.rsPorWp.toFixed(2)}/Wp`,
        `🎯 Greener: R$ ${greener.rsPorWpReferencia.toFixed(2)}/Wp`,
        `${greener.rotulo} (${greener.diferencaPct >= 0 ? '+' : ''}${greener.diferencaPct.toFixed(1)}%)`,
        '',
        `📊 Payback: ${calculations.paybackAnos}a ${calculations.paybackMeses}m`,
        `📈 TIR: ${calculations.tirPercentual.toFixed(1)}%`,
        '',
        '_Manda "enviar" pra mandar pro cliente, ou "ajusta X" pra refazer._',
      ].join('\n');
    } catch (err) {
      console.error('[proposal] Generation error:', err);
      // Sanitiza mensagem pra nao vazar tokens/URLs/stack pro WhatsApp
      const raw = (err as Error).message ?? 'erro desconhecido';
      const safe = raw.length > 120 ? raw.slice(0, 120) + '...' : raw;
      const friendly = /timeout|ECONN|chromium|puppeteer/i.test(raw)
        ? 'PDF demorou demais ou Chromium falhou. Tenta de novo em 30s.'
        : /refresh|token|auth/i.test(raw)
          ? 'Token Google expirou — regerar GOOGLE_REFRESH_TOKEN com scope drive.file.'
          : safe;
      return `⚠️ Erro ao gerar proposta: ${friendly}`;
    }
  }

  // Mapeia o JSON do Claude pro formato do calculator.ts.
  // Tarifas reais 2026 + Fio B (Lei 14.300/2022).
  private dataToCalculatorInput(data: any): ProposalInput {
    const concessionaria = (data.concessionaria || '').toLowerCase();
    const isEquatorial = concessionaria.includes('equatorial');
    const tarifaDefault = isEquatorial ? 0.98 : 1.05;
    const tusdFioBDefault = isEquatorial ? 0.28 : 0.30; // R$/kWh
    const hsp = isEquatorial ? 5.3 : 5.2;

    // Cronograma Lei 14.300/2022:
    // 2024=30%, 2025=45%, 2026=60%, 2027=75%, 2028=90%, 2029+=100%
    const ano = new Date().getFullYear();
    const fioBPercentMap: Record<number, number> = {
      2024: 0.30, 2025: 0.45, 2026: 0.60, 2027: 0.75, 2028: 0.90,
    };
    const percentualFioB = fioBPercentMap[ano] ?? 1.00;

    // Fallback de consumoMensalKwh: campo critico do calculator (define payback/ROI).
    // Quando Junior passa override de geracao mas esquece consumo, derivamos:
    // 1. Se ele deu geracaoMensalKwh explicito, assume consumo == geracao (autoconsumo 100%)
    // 2. Se nao, calcula geracao a partir de potenciaKwp/HSP/fator e usa como consumo
    // 3. So depois cai em zero (quando nem kWp tem)
    const fatorPerda = Number(data.fatorPerda) || 0.80;
    const potenciaKwp = Number(data.potenciaKwp);
    let consumoMensalKwh = Number(data.consumoMensalKwh);
    if (!isFinite(consumoMensalKwh) || consumoMensalKwh <= 0) {
      const geracaoExplicita = Number(data.geracaoMensalKwh ?? data.geracaoKwh ?? data.geracao);
      if (isFinite(geracaoExplicita) && geracaoExplicita > 0) {
        consumoMensalKwh = geracaoExplicita;
      } else if (isFinite(potenciaKwp) && potenciaKwp > 0) {
        consumoMensalKwh = potenciaKwp * hsp * 30 * fatorPerda;
      }
    }

    // Override de geracao: quando Junior passa o numero do PVSol/PVsyst, respeita.
    const geracaoOverrideRaw = Number(data.geracaoMensalKwh ?? data.geracaoKwh ?? data.geracao);
    const geracaoMensalKwhOverride = (isFinite(geracaoOverrideRaw) && geracaoOverrideRaw > 0)
      ? geracaoOverrideRaw
      : undefined;

    // Override de consumo mes-a-mes: quando Junior tem historico real da conta de luz
    // dos 12 meses do cliente, passa array. Senao, usa consumoMensalKwh fixo (default).
    // Aceita data.consumoMensalKwhDistribuido ou data.consumoMensal12Meses (alias).
    const consumoArray = data.consumoMensalKwhDistribuido ?? data.consumoMensal12Meses;
    const consumoMensalKwhDistribuidoOverride = (Array.isArray(consumoArray)
      && consumoArray.length === 12
      && consumoArray.every((v: unknown) => typeof v === 'number' && isFinite(v) && v >= 0))
      ? (consumoArray as number[])
      : undefined;

    return {
      potenciaKwp,
      fatorPerda,
      hsp,
      consumoMensalKwh,
      tarifaRsKwh: Number(data.tarifaRsKwh ?? tarifaDefault),
      tusdFioBRsKwh: Number(data.tusdFioBRsKwh ?? tusdFioBDefault),
      percentualFioBVigente: Number(data.percentualFioBVigente ?? percentualFioB),
      percentualGeracaoInjetada: Number(data.percentualGeracaoInjetada ?? 0.70),
      custoIluminacaoPublica: Number(data.custoIluminacaoPublica ?? 35),
      reajusteAnualEnergia: 0.10,
      valorTotalRs: Number(data.valorTotalRs),
      vidaUtilAnos: 25,
      geracaoMensalKwhOverride,
      consumoMensalKwhDistribuidoOverride,
    };
  }

  // Mapeia o JSON do Claude pro ProposalData (template).
  // Numero unico: ano+timestamp em base36 (curto, sem colisao em ms).
  private dataToProposalData(data: any, _calc: any): ProposalData {
    const ano = new Date().getFullYear();
    const sufixo = Date.now().toString(36).toUpperCase().slice(-5);
    const numero = `${ano}-${sufixo}`;
    return {
      numeroProposta: numero,
      dataProposta: new Date().toLocaleDateString('pt-BR'),
      validadeDias: 5,
      nomeCliente: data.nomeCliente,
      documentoCliente: data.documentoCliente,
      enderecoCliente: data.enderecoCliente,
      telefoneCliente: data.telefoneCliente,
      emailCliente: data.emailCliente,
      potenciaKwp: Number(data.potenciaKwp),
      fatorPerda: Number(data.fatorPerda),
      tipoCliente: data.tipoCliente,
      modalidade: data.modalidade,
      concessionaria: data.concessionaria,
      modulo: data.modulo,
      inversor: data.inversor,
      estruturaFixacao: data.estruturaFixacao,
      valorTotalRs: Number(data.valorTotalRs),
      formasPagamento: data.formasPagamento ?? this.defaultPaymentOptions(Number(data.valorTotalRs)),
      empresa: this.companyDefaults,
    };
  }

  // Taxas reais abril/2026.
  // CARTAO BELENUS (parceria EcoSunPower): muito menor que cartao normal de mercado.
  // Calibrado pelo Junior: kit ~R$ 13k em 24x tem acrescimo R$ 1.838 sobre a vista.
  // Taxa equivalente: ~0,42% a.m. (vs 6,5% cartao comum).
  // Acrescimo a vista R$ 250 = taxa administrativa fixa Belenus.
  // FINANCIAMENTO SOLAR 2026: Santander 1,11-1,25%, BV 1,17%, Solfacil CET 1,32-1,57%.
  // Media realista 1,40% a.m. CET (cobre Solfacil/BV/Santander/Sol Agora).
  private static readonly TAXA_CARTAO_AM = 0.0042; // Belenus
  private static readonly TAXA_FINANC_AM = 0.014; // 1,4% a.m. CET medio
  private static readonly MESES_CARENCIA_FINANC = 4; // 120 dias padrao

  // Tabela Price: parcela = PV * i / (1 - (1+i)^-n).
  // Quando ha carencia, PV capitaliza durante n_carencia meses antes de comecar Price.
  private static parcelaTabelaPrice(valor: number, taxaMensal: number, parcelas: number, mesesCarencia = 0): number {
    const valorPosCarencia = valor * Math.pow(1 + taxaMensal, mesesCarencia);
    const fator = taxaMensal / (1 - Math.pow(1 + taxaMensal, -parcelas));
    return valorPosCarencia * fator;
  }

  private defaultPaymentOptions(valorRs: number): ProposalData['formasPagamento'] {
    const fmtRs = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

    const cartaoParcela = Math.round(
      ProposalAssistant.parcelaTabelaPrice(valorRs, ProposalAssistant.TAXA_CARTAO_AM, 24),
    );
    const financiamentoParcela = Math.round(
      ProposalAssistant.parcelaTabelaPrice(
        valorRs,
        ProposalAssistant.TAXA_FINANC_AM,
        90,
        ProposalAssistant.MESES_CARENCIA_FINANC,
      ),
    );

    return [
      {
        tipo: 'À Vista',
        titulo: 'PIX ou TED',
        valorPrincipal: fmtRs(valorRs),
        valorSecundario: 'pagamento único',
        recomendado: true,
        bullets: ['Sem juros, sem entrada', 'Início imediato do projeto', 'Maior economia no longo prazo'],
      },
      {
        tipo: 'Cartão Belenus',
        titulo: 'Em até 24× com juros baixos',
        valorPrincipal: fmtRs(cartaoParcela),
        valorSecundario: '24× no cartão · aprovação imediata',
        bullets: [
          'Parceria EcoSunPower x Belenus — taxa especial pra solar',
          'Muito menor que cartão tradicional',
          'Aprovação imediata, sem análise formal',
          'Comece sem espera',
        ],
      },
      {
        tipo: 'Financiamento Solar',
        titulo: 'Até 90× · carência 120 dias',
        valorPrincipal: fmtRs(financiamentoParcela),
        valorSecundario: 'por mês · 1ª parcela em até 120 dias',
        bullets: [
          'Bancos parceiros: Solfácil, Sol Agora, BV Solar, Santander',
          'CET médio ~1,40% a.m. (taxas reais abr/26)',
          'Sua geração já paga a parcela',
          'Aprovação 24-48h conforme CPF',
        ],
      },
    ];
  }
}
