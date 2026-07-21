// Follow-up automatico de proposta:
// Quando cliente abre o link publico /p/:slug:
//   - PRIMEIRA abertura (acessosAntes === 0):
//       1. Lock NX por slug — evita abertura CONCORRENTE mandar 2x (o increment de
//          acessos nao eh atomico, e o WhatsApp pre-carrega o link + clique = abre
//          a URL varias vezes; nao eh raro).
//       2. A Eva ABORDA o cliente na hora (template aprovado eva_proposta_aberta_v1
//          — se apresenta como consultora do Junior). Sem delay/timer na memoria.
//       3. Marca followup_sent_at (idempotencia) + grava a abordagem na conversa do
//          cliente (aparece no dashboard, igual o lead — quando ele responder, o
//          Brain continua na MESMA conversa) + avisa o Junior ("abriu e ja abordei").
//   - RE-ABERTURAS (acessosAntes > 0):
//       1. Throttle 5min por slug — so RE-AVISA o Junior que voltou (NAO re-aborda).
//          [Fatia 2 futura: abordagens inteligentes/variadas na conversa entram aqui.]
//
// Preview admin (?eu=<token>) NAO chega aqui — endpoint nao incrementa acesso.
// O cliente vira lead (getOrCreateLeadByPhone), entao tem conversa no dash e pode
// entrar em cadencia se ficar em silencio.

import type { Redis } from 'ioredis';
import type { SupabaseService } from './supabase.js';
import type { MetaWhatsAppService } from './meta-whatsapp.js';
import { enviarTemplateInicial, primeiroNome } from './template-inicial.js';

// Cópia do corpo do template aprovado `eva_proposta_aberta_v1` — o texto real fica
// na Meta (mandamos só pelo NOME), então guardamos aqui pra GRAVAR no dashboard
// exatamente o que o cliente recebeu (com o 1º nome preenchido). Se editar o
// template na Meta, atualizar este texto também pra continuar batendo.
function textoAbordagemProposta(nome: string): string {
  return (
    `Oi, ${nome}! 😊 Aqui é a Eva, consultora da EcoSunPower (trabalho com o Junior). ` +
    `Vi que você abriu a proposta de energia solar que recebeu — posso te ajudar a entender ` +
    `os números e tirar suas dúvidas? Se quiser, comparo as opções com você por aqui. ` +
    `👉 Salva meu contato que eu fico à disposição pra te ajudar!`
  );
}

// Throttle entre notificacoes de re-abertura pro mesmo slug. 5min suficiente
// pra evitar spam quando cliente recarrega/volta varias vezes seguidas.
const REOPEN_THROTTLE_SECONDS = 5 * 60;

// [Fatia 2 — Parte B] Limites da reabordagem inteligente, pra NUNCA martelar o
// cliente (que pode reabrir o link em rajada): no máximo 1 a cada 12h e no máximo
// 3 por proposta no total. As chaves de contador vivem 30 dias.
const REABORDA_COOLDOWN_SECONDS = 12 * 60 * 60;
const MAX_REABORDAGENS = 3;
const REABORDA_KEY_TTL_SECONDS = 60 * 60 * 24 * 30;

interface FollowupDeps {
  supabase: SupabaseService;
  metaService: MetaWhatsAppService | null;
  sendText: (to: string, text: string) => Promise<void>;
  engineerPhone: string;
  // Base das URLs publicas de proposta (config.publicProposalBaseUrl).
  // [ECOSOF] paridade: com o env da EcoSun o valor é o mesmo do hardcode antigo.
  proposalBaseUrl: string;
  // Redis pra throttle de notificacao em re-aberturas. Se null, throttle desligado.
  redis?: Redis | null;
  // Atraso entre 1ª visualizacao e mensagem pro cliente. Default 60s — tempo
  // suficiente pro cliente ler o resumo da proposta sem ficar invasivo.
  delayMs?: number;
  // Nome do template aprovado de abordagem de proposta (porta de entrada fria —
  // cliente recebeu a proposta do outro numero do Junior, nunca falou com a Eva).
  // Confirmado pelo Junior ao criar na Meta. Fallback reativacao_lead_v1 se 132001.
  templateAbordagem: string;
  // [Fatia 2 — Parte B] Checa se a janela 24h WABA está aberta (cliente respondeu
  // nas últimas ~23h). Free text pro cliente só é permitido com a janela aberta.
  janela24hAberta?: (phone: string) => Promise<boolean>;
  // [Fatia 2 — Parte B] Gera UMA mensagem inteligente/variada de reabordagem (IA,
  // com os números da proposta). Retorna null em falha → cai no "só notifica".
  gerarAbordagemInteligente?: (slug: string, telefone: string) => Promise<string | null>;
}

export class ProposalFollowupService {
  private supabase: SupabaseService;
  private metaService: MetaWhatsAppService | null;
  private sendText: (to: string, text: string) => Promise<void>;
  private engineerPhone: string;
  private proposalBaseUrl: string;
  private redis: Redis | null;
  private delayMs: number;
  private templateAbordagem: string;
  private janela24hAberta?: (phone: string) => Promise<boolean>;
  private gerarAbordagemInteligente?: (slug: string, telefone: string) => Promise<string | null>;

  constructor(deps: FollowupDeps) {
    this.supabase = deps.supabase;
    this.metaService = deps.metaService;
    this.sendText = deps.sendText;
    this.engineerPhone = deps.engineerPhone;
    this.proposalBaseUrl = deps.proposalBaseUrl.replace(/\/$/, '');
    this.redis = deps.redis ?? null;
    this.delayMs = deps.delayMs ?? 60_000;
    this.templateAbordagem = deps.templateAbordagem;
    this.janela24hAberta = deps.janela24hAberta;
    this.gerarAbordagemInteligente = deps.gerarAbordagemInteligente;
  }

  // Chamado pelo endpoint /p/:slug a cada visualizacao do cliente
  // (preview admin nao chega aqui — endpoint filtra).
  // NAO bloqueia a resposta HTTP — fire-and-forget.
  triggerOnView(slug: string, acessosAntes: number, canal: 'web' | 'pdf' = 'web'): void {
    if (acessosAntes === 0) {
      this.runFollowupAsync(slug, canal).catch((err) => {
        console.error('[proposal-followup] erro:', (err as Error).message);
      });
    } else {
      this.runReaberturaAsync(slug, acessosAntes, canal).catch((err) => {
        console.error('[proposal-followup] reabertura erro:', (err as Error).message);
      });
    }
  }

  // Reabertura. Casos:
  // (a) Cliente que NUNCA foi abordado (abriu antes do recurso existir → a 1ª
  //     abertura dele já passou sem abordagem): aborda agora, no momento de
  //     interesse (ele voltou). Reusa runFollowupAsync (trava + idempotência).
  // (b) Já abordado + JÁ respondeu (janela 24h aberta) → [Fatia 2 Parte B] a Eva
  //     pode REABORDAR com mensagem inteligente/variada, ALTERNANDO (uma sim, outra
  //     não) pra não ser repetitiva.
  // (c) Já abordado, janela fechada OU vez "não" da alternância → só re-avisa o
  //     Junior que o cliente voltou (throttle 5min por slug).
  private async runReaberturaAsync(slug: string, acessosAntes: number, canal: 'web' | 'pdf' = 'web'): Promise<void> {
    const proposta = await this.loadPropostaParaFollowup(slug);
    if (!proposta) return;

    // (a) Nunca abordado → aborda agora. runFollowupAsync trava contra concorrência
    // e re-checa followup_sent_at, então é seguro chamar daqui. Repassa o canal pra
    // o aviso do Junior sair certo ("abriu a web" vs "baixou o PDF").
    if (!proposta.followup_sent_at) {
      await this.runFollowupAsync(slug, canal);
      return;
    }

    // (b) Reabordagem inteligente alternada. Só roda se: tem telefone + janela 24h
    // ABERTA (cliente respondeu → free text permitido) + gerador disponível. A
    // alternância é um contador Redis por slug: vez ÍMPAR reaborda, PAR só notifica.
    const telefone = this.normalizarTelefone(proposta.cliente_telefone);
    if (
      telefone &&
      this.redis &&
      this.janela24hAberta &&
      this.gerarAbordagemInteligente &&
      (await this.janela24hAberta(telefone).catch(() => false))
    ) {
      let contador = 0;
      try {
        contador = await this.redis.incr(`proposal:reopen-count:${slug}`);
        await this.redis.expire(`proposal:reopen-count:${slug}`, REABORDA_KEY_TTL_SECONDS);
      } catch (err) {
        console.warn('[proposal-followup] contador reabertura falhou:', (err as Error).message);
      }
      // Reaborda só na vez ÍMPAR (uma sim, outra não) E dentro do teto + cooldown
      // (podeReabordar) — senão a Eva martelaria quem reabre o link em rajada.
      if (contador % 2 === 1 && (await this.podeReabordar(slug))) {
        const msg = await this.gerarAbordagemInteligente(slug, telefone).catch(() => null);
        if (msg && msg.trim()) {
          await this.sendText(telefone, msg.trim()).catch((err) =>
            console.warn('[proposal-followup] envio reabordagem falhou:', (err as Error).message),
          );
          await this.registrarMensagemEvaNaConversa(telefone, proposta.cliente_nome, msg.trim()).catch(
            (err) => console.warn('[proposal-followup] gravar reabordagem falhou:', (err as Error).message),
          );
          await this.sendText(
            this.engineerPhone,
            canal === 'pdf'
              ? `💬 *${proposta.cliente_nome}* baixou o PDF da proposta de novo — a Eva reabordou! 🤝`
              : `💬 *${proposta.cliente_nome}* reabriu a proposta — a Eva reabordou! 🤝`,
          ).catch(() => {});
          try {
            await this.redis.incr(`proposal:reabordada-count:${slug}`);
            await this.redis.expire(`proposal:reabordada-count:${slug}`, REABORDA_KEY_TTL_SECONDS);
          } catch { /* contador best-effort */ }
          return; // reabordou → não cai no notify padrão
        }
        // gerador falhou/vazio → segue pro notify padrão abaixo (degrada).
      }
      // vez PAR / teto batido / cooldown ativo → segue pro notify padrão.
    }

    // (c) Só notifica (throttle 5min pra não encher o saco do Junior).
    if (this.redis) {
      const throttleKey = `proposal:notify-throttle:${slug}`;
      try {
        const acquired = await this.redis.set(throttleKey, '1', 'EX', REOPEN_THROTTLE_SECONDS, 'NX');
        if (acquired === null) {
          console.log(`[proposal-followup] reabertura slug=${slug} em throttle, skip`);
          return;
        }
      } catch (err) {
        console.warn('[proposal-followup] throttle redis falhou, segue:', (err as Error).message);
      }
    }

    const ordinal = `${acessosAntes + 1}ª`;
    const linhaTelefone = proposta.cliente_telefone
      ? `📞 ${this.normalizarTelefone(proposta.cliente_telefone) ?? proposta.cliente_telefone}`
      : '📞 (sem telefone cadastrado)';
    const msg = [
      `📣 *${proposta.cliente_nome}* voltou na proposta agora — ${ordinal} vez!`,
      linhaTelefone,
      ``,
      `🔗 ${this.proposalBaseUrl}/p/${slug}`,
    ].join('\n');
    await this.notifyJuniorComBotaoFechar(msg, proposta.cliente_telefone);
  }

  // Manda alerta pro Junior com botão "Fechou venda" quando dá pra resolver o
  // lead pelo telefone do cliente. Se não der (sem WABA, sem lead match), cai
  // pro sendText puro.
  private async notifyJuniorComBotaoFechar(body: string, clienteTelefone: string | null): Promise<void> {
    if (!this.metaService || !clienteTelefone) {
      await this.sendText(this.engineerPhone, body).catch((err) =>
        console.warn('[proposal-followup] notify falhou:', err.message),
      );
      return;
    }
    try {
      const lead = await this.supabase.getLeadByPhone(clienteTelefone).catch(() => null);
      const leadId = (lead as { id?: string } | null)?.id;
      if (!leadId) {
        await this.sendText(this.engineerPhone, body);
        return;
      }
      await this.metaService.sendInteractiveButtons(
        this.engineerPhone,
        body,
        [{ id: `evabt:fechar:${leadId}`, title: 'Fechou venda' }],
      );
    } catch (err) {
      console.warn('[proposal-followup] botão fechar falhou, fallback texto:', (err as Error).message);
      await this.sendText(this.engineerPhone, body).catch(() => {});
    }
  }

  // 1ª abertura: a Eva ABORDA o cliente na hora (template aprovado — assim o
  // cliente já sabe que a Eva é a consultora do Junior). executarEnvio manda,
  // marca followup_sent_at, grava a conversa no dashboard e avisa o Junior.
  private async runFollowupAsync(slug: string, canal: 'web' | 'pdf' = 'web'): Promise<void> {
    // Trava NX contra abertura CONCORRENTE: o increment de acessos não é atômico,
    // então 2 aberturas no mesmo instante poderiam ler followup_sent_at=null e
    // abordar 2x. Só o 1º adquire o lock; o resto sai. (WhatsApp abre o link
    // várias vezes — pré-carregamento + clique — então isso acontece de verdade.)
    if (this.redis) {
      try {
        const lock = await this.redis.set(`proposal:abordagem-lock:${slug}`, '1', 'EX', 120, 'NX');
        if (lock === null) {
          console.log(`[proposal-followup] abordagem slug=${slug} em lock concorrente, skip`);
          return;
        }
      } catch (err) {
        console.warn('[proposal-followup] lock redis falhou, segue:', (err as Error).message);
      }
    }

    const proposta = await this.loadPropostaParaFollowup(slug);
    if (!proposta) return;
    if (proposta.followup_sent_at) {
      console.log(`[proposal-followup] slug=${slug} ja teve abordagem, skip`);
      return;
    }
    const clienteNome = proposta.cliente_nome;
    const clienteTelefone = this.normalizarTelefone(proposta.cliente_telefone);
    if (!clienteTelefone) {
      await this.notifyJunior(clienteNome, null, slug)
        .catch((err) => console.warn('[proposal-followup] notify junior:', err.message));
      await this.markSkipped(slug, 'cliente_sem_telefone');
      return;
    }
    if (!this.metaService) {
      await this.notifyJunior(clienteNome, clienteTelefone, slug)
        .catch((err) => console.warn('[proposal-followup] notify junior:', err.message));
      await this.markSkipped(slug, 'waba_indisponivel');
      return;
    }
    await this.executarEnvio(slug, clienteNome, clienteTelefone, canal);
  }

  // Executa o envio da abordagem (auto, na 1ª abertura) e avisa o Junior.
  private async executarEnvio(
    slug: string,
    clienteNome: string,
    clienteTelefone: string,
    canal: 'web' | 'pdf' = 'web',
  ): Promise<void> {
    const ok = await this.enviarAbordagem(slug, clienteNome, clienteTelefone);
    const acao = canal === 'pdf' ? 'baixou o PDF da sua proposta' : 'abriu sua proposta';
    await this.sendText(
      this.engineerPhone,
      ok
        ? `📣 *${clienteNome}* ${acao} — a Eva já abordou! 🤝`
        : `⚠️ Nao consegui abordar ${clienteNome} sobre a proposta. Contata manualmente: ${clienteTelefone}`,
    ).catch(() => {});
  }

  // Núcleo da abordagem: manda o template + marca enviado + grava no dashboard.
  // Retorna true se mandou. NÃO avisa o Junior (quem chama decide o aviso) — assim
  // serve tanto pro auto (executarEnvio) quanto pro manual (abordarManual).
  // Abordagem por TEMPLATE: o cliente recebeu a proposta do outro número do Junior,
  // então nunca falou com a Eva => janela 24h fechada => texto livre falha (131047).
  // Template é a porta de entrada (funciona frio ou quente).
  private async enviarAbordagem(
    slug: string,
    clienteNome: string,
    clienteTelefone: string,
  ): Promise<boolean> {
    if (!this.metaService) {
      await this.markSkipped(slug, 'waba_indisponivel');
      return false;
    }
    try {
      const { templateUsado } = await enviarTemplateInicial(
        this.metaService,
        clienteTelefone,
        clienteNome,
        this.templateAbordagem,
      );
      await this.markFollowupSent(slug);
      // Grava a abordagem na conversa do cliente → aparece no dashboard (igual o
      // lead), pro Junior acompanhar como a Eva tá se portando. Best-effort.
      await this.registrarAbordagemNaConversa(clienteTelefone, clienteNome, templateUsado).catch((err) =>
        console.warn('[proposal-followup] gravar conversa falhou:', (err as Error).message),
      );
      console.log(
        `[proposal-followup] abordagem (${templateUsado}) enviada pra ${clienteNome} (${clienteTelefone}) slug=${slug}`,
      );
      return true;
    } catch (err) {
      console.warn(
        `[proposal-followup] falha ao abordar cliente ${clienteTelefone}:`,
        (err as Error).message,
      );
      await this.markSkipped(slug, 'envio_falhou');
      return false;
    }
  }

  // Comando manual "abordar <nome>": acha a proposta MAIS RECENTE do cliente pelo
  // nome e dispara a abordagem na hora — independente de o cliente ter aberto ou
  // não. Serve pros clientes que abriram a proposta ANTES do automático existir
  // (a 1ª abertura deles já passou, então o auto não dispara mais). Retorna a
  // mensagem de resposta pro Junior. NÃO checa followup_sent_at de propósito:
  // Junior pode querer re-abordar (ex: cliente sumiu) — ele decidiu mandar.
  async abordarManual(nomeBusca: string): Promise<string> {
    const termo = (nomeBusca ?? '').trim();
    if (termo.length < 2) return '🤔 Me diz o nome do cliente. Ex: *abordar João*';
    const proposta = await this.buscarPropostaPorNome(termo);
    if (!proposta) {
      return `🤔 Não achei proposta pra *${termo}*. Confere o nome (ou parte dele).`;
    }
    const telefone = this.normalizarTelefone(proposta.cliente_telefone);
    if (!telefone) {
      return `⚠️ A proposta de *${proposta.cliente_nome}* não tem telefone cadastrado, não dá pra abordar.`;
    }
    const ok = await this.enviarAbordagem(proposta.slug, proposta.cliente_nome, telefone);
    return ok
      ? `✅ Mandei a abordagem pra *${proposta.cliente_nome}* (${telefone})! A conversa já tá no painel — se ele sumir, é só pedir cadência. 🤝`
      : `⚠️ Tentei abordar *${proposta.cliente_nome}* mas não rolou (template/WABA). Olha os logs.`;
  }

  // Busca a proposta MAIS RECENTE cujo nome do cliente casa (parcial, sem ligar
  // pra maiúscula). Devolve slug + nome + telefone (com fallback no dados_input).
  private async buscarPropostaPorNome(
    nome: string,
  ): Promise<{ slug: string; cliente_nome: string; cliente_telefone: string | null } | null> {
    try {
      const termo = nome.replace(/[%_\\]/g, '\\$&'); // escapa curingas do ilike
      const { data, error } = await this.supabase.getClient()
        .from('propostas_publicas')
        .select('slug, cliente_nome, cliente_telefone, dados_input')
        .ilike('cliente_nome', `%${termo}%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) {
        if (error) console.warn('[proposal-followup] buscarPropostaPorNome erro:', error.message);
        return null;
      }
      const telefone =
        data.cliente_telefone ??
        data.dados_input?.telefoneCliente ??
        data.dados_input?.telefone ??
        null;
      return { slug: data.slug, cliente_nome: data.cliente_nome, cliente_telefone: telefone };
    } catch (err) {
      console.warn('[proposal-followup] buscarPropostaPorNome:', (err as Error).message);
      return null;
    }
  }

  // Grava a abordagem na conversa do cliente (acha/cria o lead pelo telefone) pra
  // a conversa aparecer no /dashboard/leads igual o lead. Quando o cliente
  // responder, o Brain continua escrevendo na MESMA conversa.
  private async registrarAbordagemNaConversa(
    telefone: string,
    nome: string,
    templateUsado: string,
  ): Promise<void> {
    // Grava o TEXTO REAL que o cliente recebeu (com o 1º nome), pro Junior ver no
    // dashboard a mensagem de verdade — não um rótulo. Se caiu no fallback (template
    // de abordagem indisponível), registra qual foi, sem mentir o conteúdo.
    const conteudo =
      templateUsado === this.templateAbordagem
        ? textoAbordagemProposta(primeiroNome(nome))
        : `📨 Eva enviou a mensagem de abertura pro cliente (template "${templateUsado}").`;
    await this.registrarMensagemEvaNaConversa(telefone, nome, conteudo);
  }

  // [Fatia 2 — Parte B] Teto + cooldown da reabordagem inteligente: no máximo
  // MAX_REABORDAGENS por proposta E 1 a cada REABORDA_COOLDOWN_SECONDS. Consome o
  // cooldown (SET NX) só se liberar — isso TAMBÉM serializa reaberturas concorrentes
  // (só a 1ª pega o NX). Prioriza anti-spam: o cooldown é consumido ANTES de gerar,
  // então uma falha rara do gerador "gasta" a janela de 12h (silêncio conservador,
  // o Junior ainda é notificado). Qualquer erro de Redis → false (não reaborda).
  private async podeReabordar(slug: string): Promise<boolean> {
    if (!this.redis) return false;
    try {
      const ja = Number(await this.redis.get(`proposal:reabordada-count:${slug}`)) || 0;
      if (ja >= MAX_REABORDAGENS) return false;
      const cooldownLivre = await this.redis.set(
        `proposal:reabordada-cooldown:${slug}`,
        '1',
        'EX',
        REABORDA_COOLDOWN_SECONDS,
        'NX',
      );
      return cooldownLivre !== null;
    } catch {
      return false;
    }
  }

  // Grava uma mensagem da Eva (assistant) na conversa do cliente → aparece no
  // dashboard. Usado pela abordagem (texto do template) e pela reabordagem
  // inteligente (Parte B). Acha/cria o lead+conversa pelo telefone.
  private async registrarMensagemEvaNaConversa(
    telefone: string,
    nome: string,
    texto: string,
  ): Promise<void> {
    const leadId = await this.supabase.getOrCreateLeadByPhone(telefone, nome);
    const conv = await this.supabase.getOrCreateConversation(leadId);
    await this.supabase.updateConversation(conv.id, {
      messages: [
        ...conv.messages,
        {
          role: 'assistant' as const,
          content: texto,
          timestamp: new Date().toISOString(),
        },
      ],
      message_count: conv.message_count + 1,
    });
  }

  // Hook chamado quando Junior toca o botao [✅ Eva manda]. Re-busca proposta
  // e dispara envio. Idempotente: se ja foi enviado, no-op.
  triggerEnvioPorBotao(slug: string): void {
    this.triggerEnvioPorBotaoAsync(slug).catch((err) => {
      console.error('[proposal-followup] triggerEnvioPorBotao:', err.message);
    });
  }

  private async triggerEnvioPorBotaoAsync(slug: string): Promise<void> {
    const proposta = await this.loadPropostaParaFollowup(slug);
    if (!proposta) return;
    if (proposta.followup_sent_at) {
      await this.sendText(this.engineerPhone, '🤔 Ja tinha mandado essa antes, ignorei.').catch(() => {});
      return;
    }
    const clienteTelefone = this.normalizarTelefone(proposta.cliente_telefone);
    if (!clienteTelefone) {
      await this.markSkipped(slug, 'cliente_sem_telefone');
      return;
    }
    await this.executarEnvio(slug, proposta.cliente_nome, clienteTelefone);
  }

  // Hook chamado quando Junior toca o botao [👤 Eu mando]. Marca como skipped
  // pra anti-duplicacao e nao dispara mais.
  marcarJuniorVaiContatar(slug: string): void {
    this.marcarJuniorVaiContatarAsync(slug).catch((err) => {
      console.warn('[proposal-followup] marcarJuniorVaiContatar:', err.message);
    });
  }

  private async marcarJuniorVaiContatarAsync(slug: string): Promise<void> {
    await this.markSkipped(slug, 'junior_atendendo');
    await this.sendText(
      this.engineerPhone,
      '👍 Beleza, fica na sua mão. Eva nao vai mandar nada pra esse cliente.',
    ).catch(() => {});
  }

  // Hook chamado quando Junior toca [⏰ Esperar 1h]. Re-pergunta dali a 1h.
  postergarFollowup(slug: string): void {
    setTimeout(() => {
      this.runFollowupAsync(slug).catch((err) => {
        console.error('[proposal-followup] reschedule:', err.message);
      });
    }, 60 * 60 * 1000);
    this.sendText(
      this.engineerPhone,
      '⏰ Beleza, te pergunto de novo daqui 1h.',
    ).catch(() => {});
  }

  // Loader: junta proposta + dados_input pra extrair telefone do cliente
  private async loadPropostaParaFollowup(slug: string): Promise<{
    cliente_nome: string;
    cliente_telefone: string | null;
    followup_sent_at: string | null;
    modo_envio: 'junior_envia' | 'eva_envia' | null;
    dados_input: any;
  } | null> {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('propostas_publicas')
        .select('cliente_nome, cliente_telefone, followup_sent_at, modo_envio, dados_input')
        .eq('slug', slug)
        .maybeSingle();
      if (error || !data) {
        if (error) console.warn('[proposal-followup] load erro:', error.message);
        return null;
      }
      // Telefone pode estar no campo direto OU dentro de dados_input
      const telefone =
        data.cliente_telefone ??
        data.dados_input?.telefoneCliente ??
        data.dados_input?.telefone ??
        null;
      return {
        cliente_nome: data.cliente_nome,
        cliente_telefone: telefone,
        followup_sent_at: data.followup_sent_at,
        modo_envio: data.modo_envio ?? null,
        dados_input: data.dados_input,
      };
    } catch (err) {
      console.warn('[proposal-followup] loadPropostaParaFollowup:', (err as Error).message);
      return null;
    }
  }

  // Normaliza telefone pro formato WABA (E.164 sem + ou caracteres especiais).
  // Aceita: "61987654321", "+5561987654321", "(61) 98765-4321"
  // Devolve: "5561987654321"
  private normalizarTelefone(input: string | null | undefined): string | null {
    if (!input) return null;
    let digits = input.replace(/\D/g, '');
    if (digits.length === 0) return null;
    // Adiciona DDI 55 se nao comecar com ele
    if (!digits.startsWith('55') && digits.length >= 10 && digits.length <= 11) {
      digits = '55' + digits;
    }
    if (digits.length < 12 || digits.length > 13) return null;
    return digits;
  }

  // Caso eva_envia ou cliente sem telefone/sem WABA: so notifica Junior por
  // texto, sem perguntar nada (Eva ja vai mandar / nao consegue mandar).
  private async notifyJunior(
    clienteNome: string,
    clienteTelefone: string | null,
    slug: string,
  ): Promise<void> {
    const linha = clienteTelefone
      ? `📞 ${clienteTelefone}`
      : `📞 (sem telefone — Eva nao vai conseguir mandar follow-up)`;
    const msg = [
      `📣 *${clienteNome}* abriu a proposta agora!`,
      linha,
      ``,
      clienteTelefone
        ? `Vou aguardar 1 minuto e mandar follow-up pra ele perguntando se ficou alguma dúvida.`
        : `Sem telefone do cliente, follow-up automático nao acontece. Contata manualmente.`,
      ``,
      `🔗 ${this.proposalBaseUrl}/p/${slug}`,
    ].join('\n');
    await this.notifyJuniorComBotaoFechar(msg, clienteTelefone);
  }

  // Caso junior_envia: cliente NAO conhece o numero da Eva. Pergunta a Junior
  // antes de mandar (botoes interativos). Junior decide caso a caso.
  private async notifyJuniorComBotoes(
    clienteNome: string,
    clienteTelefone: string,
    slug: string,
  ): Promise<void> {
    const body = [
      `📣 *${clienteNome}* abriu a proposta agora!`,
      `📞 ${clienteTelefone}`,
      ``,
      `Voce mandou a proposta pelo seu numero comercial — cliente NAO conhece o numero da Eva.`,
      ``,
      `Como prossigo?`,
      `🔗 ${this.proposalBaseUrl}/p/${slug}`,
    ].join('\n');

    if (this.metaService) {
      try {
        await this.metaService.sendInteractiveButtons(
          this.engineerPhone,
          body,
          [
            { id: `prop:fwup-eva:${slug}`, title: '✅ Eva manda' },
            { id: `prop:fwup-junior:${slug}`, title: '👤 Eu mando' },
            { id: `prop:fwup-esperar:${slug}`, title: '⏰ Esperar 1h' },
          ],
          'Toque pra responder',
        );
        return;
      } catch (err) {
        console.warn('[proposal-followup] botoes falharam, fallback texto:', (err as Error).message);
      }
    }
    // Fallback texto puro
    await this.sendText(
      this.engineerPhone,
      `${body}\n\n💡 Responda:\n• "eva ${slug}" pra Eva mandar\n• "eu ${slug}" pra voce contatar manualmente`,
    ).catch(() => {});
  }

  private async markFollowupSent(slug: string): Promise<void> {
    // Loga se a marca de idempotência falhar — senão um reenvio (botão/reschedule)
    // poderia mandar o template 2x pro cliente sem rastro.
    const { error } = await this.supabase.getClient()
      .from('propostas_publicas')
      .update({ followup_sent_at: new Date().toISOString() })
      .eq('slug', slug);
    if (error) console.warn(`[proposal-followup] markFollowupSent falhou slug=${slug}:`, error.message);
  }

  private async markSkipped(slug: string, reason: string): Promise<void> {
    const { error } = await this.supabase.getClient()
      .from('propostas_publicas')
      .update({
        followup_sent_at: new Date().toISOString(),
        followup_skipped_reason: reason,
      })
      .eq('slug', slug);
    if (error) console.warn(`[proposal-followup] markSkipped falhou slug=${slug}:`, error.message);
  }

  // Hook chamado pelo brain quando recebe mensagem de cliente que tem
  // proposta com followup_sent_at recente e cliente_respondeu_at NULL.
  // Marca como respondido. NAO BLOQUEIA — fire-and-forget.
  // [MT fatia 3d] `db` injetavel: caminho da MENSAGEM passa o SupabaseService
  // do crachá (flag RLS_EVA); triggers HTTP/crons seguem no singleton (default).
  markClienteRespondeu(telefone: string, db: SupabaseService = this.supabase): void {
    this.markClienteRespondeuAsync(telefone, db).catch((err) => {
      console.warn('[proposal-followup] markClienteRespondeu:', err.message);
    });
  }

  private async markClienteRespondeuAsync(telefone: string, db: SupabaseService = this.supabase): Promise<void> {
    const normalizado = this.normalizarTelefone(telefone);
    if (!normalizado) return;

    // Pega proposta(s) com followup ja enviado e cliente_respondeu_at NULL
    // pra esse telefone. Marca tudo como respondido.
    const { data, error } = await db.getClient()
      .from('propostas_publicas')
      .select('id, cliente_telefone, dados_input')
      .not('followup_sent_at', 'is', null)
      .is('cliente_respondeu_at', null)
      .eq('revoked', false)
      .order('followup_sent_at', { ascending: false })
      .limit(20);

    if (error || !data || data.length === 0) return;

    // Filtra os que batem com o telefone do remetente
    const idsParaMarcar: string[] = [];
    for (const p of data) {
      const tel = p.cliente_telefone ?? p.dados_input?.telefoneCliente ?? p.dados_input?.telefone;
      if (this.normalizarTelefone(tel) === normalizado) {
        idsParaMarcar.push(p.id);
      }
    }

    if (idsParaMarcar.length === 0) return;

    await db.getClient()
      .from('propostas_publicas')
      .update({ cliente_respondeu_at: new Date().toISOString() })
      .in('id', idsParaMarcar);

    console.log(
      `[proposal-followup] cliente ${normalizado} respondeu (${idsParaMarcar.length} proposta(s) marcada(s))`,
    );
  }
}
