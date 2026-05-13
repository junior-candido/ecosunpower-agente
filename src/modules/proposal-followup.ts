// Follow-up automatico de proposta:
// Quando cliente abre o link publico /p/:slug:
//   - PRIMEIRA visualizacao (acessosAntes === 0):
//       1. Notifica Junior no zap ("📣 Antonio abriu agora!")
//       2. Aguarda 60s (deixa cliente ler)
//       3. Manda mensagem pro CLIENTE perguntando se ficou alguma duvida
//       4. Marca followup_sent_at no banco (nao manda 2x)
//   - RE-ABERTURAS (acessosAntes > 0):
//       1. Notifica Junior ("📣 Antonio abriu de novo — Xª vez")
//       2. NAO manda mensagem pro cliente (idempotencia via followup_sent_at)
//       3. Throttle 5min por slug — recarregar 3x em 1min = 1 notificacao
//
// Preview admin (?eu=<token>) NAO chega aqui — endpoint nao incrementa acesso.
//
// Depois disso, qualquer resposta do cliente entra no fluxo NORMAL da Eva
// (Brain ja tem dossier, conhecimento, etc — V1 nao precisa de modo especial).
//
// Quando cliente responder, marcar cliente_respondeu_at via outro hook
// (handler de mensagem do brain).

import type { Redis } from 'ioredis';
import type { SupabaseService } from './supabase.js';
import type { MetaWhatsAppService } from './meta-whatsapp.js';

// Throttle entre notificacoes de re-abertura pro mesmo slug. 5min suficiente
// pra evitar spam quando cliente recarrega/volta varias vezes seguidas.
const REOPEN_THROTTLE_SECONDS = 5 * 60;

interface FollowupDeps {
  supabase: SupabaseService;
  metaService: MetaWhatsAppService | null;
  sendText: (to: string, text: string) => Promise<void>;
  engineerPhone: string;
  // Redis pra throttle de notificacao em re-aberturas. Se null, throttle desligado.
  redis?: Redis | null;
  // Atraso entre 1ª visualizacao e mensagem pro cliente. Default 60s — tempo
  // suficiente pro cliente ler o resumo da proposta sem ficar invasivo.
  delayMs?: number;
}

export class ProposalFollowupService {
  private supabase: SupabaseService;
  private metaService: MetaWhatsAppService | null;
  private sendText: (to: string, text: string) => Promise<void>;
  private engineerPhone: string;
  private redis: Redis | null;
  private delayMs: number;

  constructor(deps: FollowupDeps) {
    this.supabase = deps.supabase;
    this.metaService = deps.metaService;
    this.sendText = deps.sendText;
    this.engineerPhone = deps.engineerPhone;
    this.redis = deps.redis ?? null;
    this.delayMs = deps.delayMs ?? 60_000;
  }

  // Chamado pelo endpoint /p/:slug a cada visualizacao do cliente
  // (preview admin nao chega aqui — endpoint filtra).
  // NAO bloqueia a resposta HTTP — fire-and-forget.
  triggerOnView(slug: string, acessosAntes: number): void {
    if (acessosAntes === 0) {
      this.runFollowupAsync(slug).catch((err) => {
        console.error('[proposal-followup] erro:', (err as Error).message);
      });
    } else {
      this.runReaberturaAsync(slug, acessosAntes).catch((err) => {
        console.error('[proposal-followup] reabertura erro:', (err as Error).message);
      });
    }
  }

  // Notifica Junior sobre re-abertura, com throttle Redis 5min por slug.
  // Nao manda mensagem pro cliente (idempotencia: followup_sent_at ja existe).
  private async runReaberturaAsync(slug: string, acessosAntes: number): Promise<void> {
    if (this.redis) {
      // SET key NX EX 300 — se ja existe, devolve null (estamos no throttle).
      const throttleKey = `proposal:notify-throttle:${slug}`;
      try {
        const acquired = await this.redis.set(
          throttleKey,
          '1',
          'EX',
          REOPEN_THROTTLE_SECONDS,
          'NX',
        );
        if (acquired === null) {
          console.log(`[proposal-followup] reabertura slug=${slug} em throttle, skip`);
          return;
        }
      } catch (err) {
        console.warn('[proposal-followup] throttle redis falhou, segue:', (err as Error).message);
      }
    }

    const proposta = await this.loadPropostaParaFollowup(slug);
    if (!proposta) return;

    const totalAcessos = acessosAntes + 1;
    const ordinal = `${totalAcessos}ª`;
    const linhaTelefone = proposta.cliente_telefone
      ? `📞 ${this.normalizarTelefone(proposta.cliente_telefone) ?? proposta.cliente_telefone}`
      : '📞 (sem telefone cadastrado)';
    const msg = [
      `📣 *${proposta.cliente_nome}* voltou na proposta agora — ${ordinal} vez!`,
      linhaTelefone,
      ``,
      `🔗 https://propostas.ecosunpower.eng.br/p/${slug}`,
    ].join('\n');
    await this.sendText(this.engineerPhone, msg).catch((err) =>
      console.warn('[proposal-followup] notify reabertura falhou:', err.message),
    );
  }

  private async runFollowupAsync(slug: string): Promise<void> {
    // 1. Carrega proposta com tudo que precisamos
    const proposta = await this.loadPropostaParaFollowup(slug);
    if (!proposta) return;

    // 2. Idempotencia: ja mandou?
    if (proposta.followup_sent_at) {
      console.log(`[proposal-followup] slug=${slug} ja teve followup, skip`);
      return;
    }

    const clienteNome = proposta.cliente_nome;
    const clienteTelefone = this.normalizarTelefone(proposta.cliente_telefone);
    const modoEnvio = proposta.modo_envio ?? 'junior_envia';

    // 3. Se cliente nao tem telefone valido, so notifica Junior
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

    // 4. CAMINHO A — junior_envia: cliente NAO conhece o numero da Eva.
    //    Pergunta a Junior antes de mandar (botoes interativos).
    if (modoEnvio === 'junior_envia') {
      await this.notifyJuniorComBotoes(clienteNome, clienteTelefone, slug);
      console.log(`[proposal-followup] junior_envia: aguardando decisao do Junior slug=${slug}`);
      return;
    }

    // 5. CAMINHO B — eva_envia: cliente JA conhece o numero da Eva (recebeu
    //    proposta dele). Mandar follow-up direto sem perguntar.
    await this.notifyJunior(clienteNome, clienteTelefone, slug)
      .catch((err) => console.warn('[proposal-followup] notify junior:', err.message));
    // Aguarda delay (deixa cliente ler a proposta antes de incomodar)
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    await this.executarEnvio(slug, clienteNome, clienteTelefone);
  }

  // Executa o envio da mensagem de followup pro cliente.
  // Chamado em 2 lugares: (a) auto, modo eva_envia; (b) Junior tocou [Eva manda].
  private async executarEnvio(
    slug: string,
    clienteNome: string,
    clienteTelefone: string,
  ): Promise<void> {
    if (!this.metaService) {
      await this.markSkipped(slug, 'waba_indisponivel');
      return;
    }
    const mensagem = this.montarMensagemCliente(clienteNome);
    try {
      await this.metaService.sendText(clienteTelefone, mensagem);
      await this.markFollowupSent(slug);
      console.log(
        `[proposal-followup] enviado pra ${clienteNome} (${clienteTelefone}) slug=${slug}`,
      );
      await this.sendText(
        this.engineerPhone,
        `✅ Eva mandou follow-up pra ${clienteNome}.`,
      ).catch(() => {});
    } catch (err) {
      const msg = (err as Error).message;
      console.warn(
        `[proposal-followup] falha ao enviar pra cliente ${clienteTelefone}:`,
        msg,
      );
      const reason = /131047|24.?hour|re-engagement/i.test(msg)
        ? 'fora_janela_24h'
        : 'envio_falhou';
      await this.markSkipped(slug, reason);
      await this.sendText(
        this.engineerPhone,
        `⚠️ Nao consegui mandar follow-up pra ${clienteNome} (${reason}). Contata manualmente: ${clienteTelefone}`,
      ).catch(() => {});
    }
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

  // Mensagem inicial pro cliente. Curta, humana, sem pressao de venda.
  private montarMensagemCliente(nome: string): string {
    const primeiroNome = nome.trim().split(/\s+/)[0] ?? nome;
    return [
      `Oi ${primeiroNome}, aqui é a Eva da EcoSunPower 👋`,
      ``,
      `Vi que você acabou de abrir a proposta de energia solar que o Junior te enviou.`,
      ``,
      `Ficou alguma dúvida sobre o sistema, equipamentos ou financiamento? Posso te explicar tudo por aqui mesmo, sem compromisso 😊`,
    ].join('\n');
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
      `🔗 https://propostas.ecosunpower.eng.br/p/${slug}`,
    ].join('\n');
    await this.sendText(this.engineerPhone, msg);
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
      `🔗 https://propostas.ecosunpower.eng.br/p/${slug}`,
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
    await this.supabase.getClient()
      .from('propostas_publicas')
      .update({ followup_sent_at: new Date().toISOString() })
      .eq('slug', slug);
  }

  private async markSkipped(slug: string, reason: string): Promise<void> {
    await this.supabase.getClient()
      .from('propostas_publicas')
      .update({
        followup_sent_at: new Date().toISOString(),
        followup_skipped_reason: reason,
      })
      .eq('slug', slug);
  }

  // Hook chamado pelo brain quando recebe mensagem de cliente que tem
  // proposta com followup_sent_at recente e cliente_respondeu_at NULL.
  // Marca como respondido. NAO BLOQUEIA — fire-and-forget.
  markClienteRespondeu(telefone: string): void {
    this.markClienteRespondeuAsync(telefone).catch((err) => {
      console.warn('[proposal-followup] markClienteRespondeu:', err.message);
    });
  }

  private async markClienteRespondeuAsync(telefone: string): Promise<void> {
    const normalizado = this.normalizarTelefone(telefone);
    if (!normalizado) return;

    // Pega proposta(s) com followup ja enviado e cliente_respondeu_at NULL
    // pra esse telefone. Marca tudo como respondido.
    const { data, error } = await this.supabase.getClient()
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

    await this.supabase.getClient()
      .from('propostas_publicas')
      .update({ cliente_respondeu_at: new Date().toISOString() })
      .in('id', idsParaMarcar);

    console.log(
      `[proposal-followup] cliente ${normalizado} respondeu (${idsParaMarcar.length} proposta(s) marcada(s))`,
    );
  }
}
