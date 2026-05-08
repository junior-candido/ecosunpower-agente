// Follow-up automatico de proposta:
// quando cliente abre o link publico /p/:slug pela PRIMEIRA vez, dispara:
//   1. Notifica Junior no zap dele ("📣 Antonio Carlos abriu agora!")
//   2. Aguarda 60s (deixa cliente terminar de ler)
//   3. Manda mensagem pro CLIENTE perguntando se ficou alguma duvida
//   4. Marca followup_sent_at no banco (nao manda 2x)
//
// Depois disso, qualquer resposta do cliente entra no fluxo NORMAL da Eva
// (Brain ja tem dossier, conhecimento, etc — V1 nao precisa de modo especial).
//
// Quando cliente responder, marcar cliente_respondeu_at via outro hook
// (handler de mensagem do brain).

import type { SupabaseService } from './supabase.js';
import type { MetaWhatsAppService } from './meta-whatsapp.js';

interface FollowupDeps {
  supabase: SupabaseService;
  metaService: MetaWhatsAppService | null;
  sendText: (to: string, text: string) => Promise<void>;
  engineerPhone: string;
  // Atraso entre 1ª visualizacao e mensagem pro cliente. Default 60s — tempo
  // suficiente pro cliente ler o resumo da proposta sem ficar invasivo.
  delayMs?: number;
}

export class ProposalFollowupService {
  private supabase: SupabaseService;
  private metaService: MetaWhatsAppService | null;
  private sendText: (to: string, text: string) => Promise<void>;
  private engineerPhone: string;
  private delayMs: number;

  constructor(deps: FollowupDeps) {
    this.supabase = deps.supabase;
    this.metaService = deps.metaService;
    this.sendText = deps.sendText;
    this.engineerPhone = deps.engineerPhone;
    this.delayMs = deps.delayMs ?? 60_000;
  }

  // Chamado pelo endpoint /p/:slug quando detecta acessosAntes === 0.
  // NAO bloqueia a resposta HTTP — fire-and-forget.
  triggerOnFirstView(slug: string): void {
    this.runFollowupAsync(slug).catch((err) => {
      console.error('[proposal-followup] erro:', (err as Error).message);
    });
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

    // 3. SEMPRE notifica Junior (nao depende do cliente ter telefone valido)
    await this.notifyJunior(clienteNome, clienteTelefone, slug)
      .catch((err) => console.warn('[proposal-followup] notify junior falhou:', err.message));

    // 4. Se cliente nao tem telefone valido OU WABA indisponivel,
    //    marca skipped e sai. Junior pode contatar manualmente.
    if (!clienteTelefone) {
      await this.markSkipped(slug, 'cliente_sem_telefone');
      return;
    }
    if (!this.metaService) {
      await this.markSkipped(slug, 'waba_indisponivel');
      return;
    }

    // 5. Aguarda delay (deixa cliente ler a proposta antes de incomodar)
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));

    // 6. Manda mensagem pro cliente
    const mensagem = this.montarMensagemCliente(clienteNome);
    try {
      await this.metaService.sendText(clienteTelefone, mensagem);
      await this.markFollowupSent(slug);
      console.log(
        `[proposal-followup] enviado pra ${clienteNome} (${clienteTelefone}) slug=${slug}`,
      );
      // Avisa Junior que mandou
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
      // Erro 24h-window vai cair aqui — cliente nao mandou nada nas ultimas 24h.
      const reason = /131047|24.?hour|re-engagement/i.test(msg)
        ? 'fora_janela_24h'
        : 'envio_falhou';
      await this.markSkipped(slug, reason);
      // Avisa Junior pra contatar manualmente
      await this.sendText(
        this.engineerPhone,
        `⚠️ Nao consegui mandar follow-up pra ${clienteNome} (${reason}). Contata manualmente: ${clienteTelefone}`,
      ).catch(() => {});
    }
  }

  // Loader: junta proposta + dados_input pra extrair telefone do cliente
  private async loadPropostaParaFollowup(slug: string): Promise<{
    cliente_nome: string;
    cliente_telefone: string | null;
    followup_sent_at: string | null;
    dados_input: any;
  } | null> {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('propostas_publicas')
        .select('cliente_nome, cliente_telefone, followup_sent_at, dados_input')
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
      `Vou aguardar 1 minuto e mandar follow-up pra ele perguntando se ficou alguma dúvida. Se preferir contatar manualmente antes, fica à vontade.`,
      ``,
      `🔗 https://propostas.ecosunpower.eng.br/p/${slug}`,
    ].join('\n');
    await this.sendText(this.engineerPhone, msg);
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
