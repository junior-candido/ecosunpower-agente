// src/modules/vendas/agendamento-pendente.ts
//
// AGENDAMENTO SÓ COM O "OK" DO DONO (28/09/2026).
//
// O furo: a Eva marcava visita técnica e Meet SOZINHA — criava o evento no
// Google Agenda e confirmava ao cliente sem o Junior saber (ex.: "Meet - Luiz
// Roberto ... - apresentacao estudo", criado 27/09 23:46 pra 28/09 15h).
//
// A regra agora: a Eva combina o dia/hora com o cliente e ANOTA a preferência.
// Quem confirma é o admin DA EMPRESA (Junior na EcoSunPower; o telefone_admin do
// tenant nos outros — nunca o Junior pra lead de tenant). Só depois do ✅ o
// evento nasce na agenda e o cliente recebe a confirmação.
//
// Onde mora o pedido: na própria tabela `visitas` (migration 102), com
// `resultado = 'pendente_confirmacao'`. Sem migration nova: a coluna é texto
// livre e o toque pós-visita só olha `resultado IS NULL`, então o pedido nunca
// dispara pós-visita. Confirmado → `resultado` volta a NULL (é uma visita
// normal a partir daí). Os detalhes que a tabela não tem (e-mail, endereço,
// resumo do lead) ficam no Redis por 15 dias; sem eles o ✅ ainda funciona com
// o que está na linha (telefone, tipo, início, fim).
//
// Idempotência: toda mudança de estado é um UPDATE condicional
// (`WHERE resultado = <estado esperado>`) — clique duplo, dois servidores ou o
// painel + o zap ao mesmo tempo: só um ganha, o outro recebe "já resolvido".

export const ST_PENDENTE = 'pendente_confirmacao';
export const ST_CONFIRMANDO = 'confirmando';
export const ST_NAO_CONFIRMADA = 'nao_confirmada';
export const ST_SUBSTITUIDA = 'substituida';
export const ST_EXPIRADA = 'expirada';

const H = 3_600_000;
export const LEMBRETE_ADMIN_MS = 3 * H;
export const AVISO_CLIENTE_MS = 24 * H;
const TTL_DETALHES_S = 15 * 24 * 3600;
const TTL_SUGESTAO_S = 15 * 60;
const TTL_ULTIMO_S = 24 * 3600;
const TZ = 'America/Sao_Paulo';

export type TipoAgendamento = 'visita' | 'meet';

export interface PedidoAgendamento {
  id: string;
  companyId: string;
  leadId: string | null;
  phone: string;
  tipo: TipoAgendamento;
  inicioISO: string;
  fimISO: string;
  resultado: string | null;
  criadoEmMs: number;
  // Detalhes (Redis) — opcionais.
  clientEmail?: string;
  clientAddress?: string;
  clientCoordinates?: string;
  notes?: string;
  resumoLead?: string;
  leadNome?: string;
  leadCidade?: string;
  leadPerfil?: string;
  contaMensal?: string;
  lembreteEmMs?: number;
  clienteAvisadoEmMs?: number;
}

export type DetalhesPedido = Omit<PedidoAgendamento, 'id' | 'companyId' | 'leadId' | 'phone' | 'tipo' | 'inicioISO' | 'fimISO' | 'resultado' | 'criadoEmMs'>;

/** Linha da tabela `visitas` como o repositório devolve. */
export interface LinhaPedido {
  id: string;
  company_id: string;
  lead_id: string | null;
  phone: string;
  tipo: string;
  inicio: string;
  fim: string;
  resultado: string | null;
  created_at: string;
  calendar_event_id?: string | null;
}

export interface RepoPedidos {
  inserir(p: { companyId: string; leadId: string | null; phone: string; tipo: TipoAgendamento; inicioISO: string; fimISO: string }): Promise<string>;
  /** Pedidos pendentes antigos do mesmo cliente viram 'substituida'. Devolve quantos. */
  substituirPendentes(companyId: string, phone: string): Promise<number>;
  buscar(id: string, companyId: string): Promise<LinhaPedido | null>;
  /** UPDATE condicional. true = esta chamada ganhou a transição. */
  transicionar(id: string, companyId: string, de: string, para: string | null, extra?: { calendarEventId?: string | null }): Promise<boolean>;
  /** Todos os pendentes (todas as empresas) — só pro relógio. */
  listarPendentes(): Promise<LinhaPedido[]>;
  /** Pendentes de UMA empresa (painel). */
  listarPendentesDaEmpresa(companyId: string, leadId?: string): Promise<LinhaPedido[]>;
}

export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

export interface EventoCriado { eventId: string; htmlLink: string; meetLink?: string }

export interface AgendaGoogle {
  isAvailable(startISO: string, endISO: string, calendarId?: string): Promise<boolean>;
  createEvent(input: {
    summary: string; description?: string; startISO: string; endISO: string;
    location?: string; withMeet?: boolean; calendarId?: string;
  }): Promise<EventoCriado>;
}

export interface EmpresaAgenda {
  companyId: string;
  ehEcosun: boolean;
  rtApelido: string;
  rtGenero?: 'm' | 'f' | string | null;
  nomeAtendente: string;
}

export interface Botao { id: string; title: string }

export interface AgendamentoDeps {
  repo: RepoPedidos;
  kv: KV;
  agenda: AgendaGoogle | null;
  /** Agenda do Google da empresa em contexto (null = não cria evento). */
  agendaDaEmpresa: () => string | null;
  empresaAtual: () => EmpresaAgenda;
  /** A empresa em contexto pode usar botões WABA? (só EcoSun com WABA). */
  temBotoes: () => boolean;
  enviarCliente: (phone: string, texto: string) => Promise<void>;
  /** Manda pro admin DA EMPRESA EM CONTEXTO. false = empresa sem admin (nada saiu). */
  enviarAdmin: (texto: string, botoes: Botao[]) => Promise<boolean>;
  /** Telefone do admin da empresa em contexto (só dígitos no uso), ou null. */
  destinoAdmin: () => string | null;
  registrarNaConversa: (leadId: string, companyId: string, texto: string) => Promise<void>;
  aoConfirmar: (p: PedidoAgendamento, evento: EventoCriado | null) => Promise<void>;
  log: (nivel: 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) => void;
  agoraMs: () => number;
}

// ---------------------------------------------------------------------------
// Textos (puros)
// ---------------------------------------------------------------------------

/** Quem confirma, do jeito que o CLIENTE lê. Tenant: "nossa equipe" (nunca o nome da casa). */
export function quemConfirma(e: EmpresaAgenda): { o: string; O: string } {
  if (!e.ehEcosun) return { o: 'nossa equipe', O: 'Nossa equipe' };
  const f = e.rtGenero === 'f';
  return { o: `${f ? 'a' : 'o'} ${e.rtApelido}`, O: `${f ? 'A' : 'O'} ${e.rtApelido}` };
}

/** "quinta (02/10), às 14h" / "às 14h30". */
export function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long' }).format(d).replace('-feira', '');
  const dm = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(d);
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(d);
  const hh = Number(partes.find(p => p.type === 'hour')?.value ?? '0') % 24;
  const mm = partes.find(p => p.type === 'minute')?.value ?? '00';
  return `${dia} (${dm}), às ${hh}h${mm === '00' ? '' : mm}`;
}

function rotuloTipo(tipo: TipoAgendamento): string {
  return tipo === 'meet' ? 'a conversa pelo Google Meet' : 'a visita técnica';
}

/** Resposta ao cliente quando ele escolhe o horário. NUNCA diz que está marcado. */
export function textoClienteAguardando(e: EmpresaAgenda, tipo: TipoAgendamento, inicioISO: string): string {
  const q = quemConfirma(e);
  return `Anotei sua preferência para ${rotuloTipo(tipo)}: ${formatarDataHora(inicioISO)}. ` +
    `${q.O} vai entrar em contato pra confirmar com você — só depois dessa confirmação o horário fica garantido, tá bom? 😊`;
}

export function textoClienteConfirmado(e: EmpresaAgenda, p: PedidoAgendamento, meetLink?: string): string {
  const q = quemConfirma(e);
  const quando = formatarDataHora(p.inicioISO);
  if (p.tipo === 'meet') {
    return [
      `Tudo certo! ✅ ${q.O} confirmou nossa conversa pelo Google Meet: ${quando}.`,
      meetLink ? `\nLink do Meet: ${meetLink}\n\nÉ só clicar no horário.` : '\nO link chega por aqui antes do horário.',
      'Se precisar mudar, é só me chamar.',
    ].join('\n');
  }
  return [
    `Tudo certo! ✅ ${q.O} confirmou a visita técnica: ${quando}.`,
    p.clientAddress ? `📍 ${p.clientAddress}` : '',
    'Se precisar mudar, é só me chamar.',
  ].filter(Boolean).join('\n');
}

export function textoClienteNaoPode(e: EmpresaAgenda, p: PedidoAgendamento): string {
  const q = quemConfirma(e);
  return `Oi! ${q.O} não vai conseguir ${formatarDataHora(p.inicioISO)} 😕\n` +
    'Qual outro dia e horário fica bom pra você? Atendemos de segunda a sexta, das 8h às 16h.';
}

export function textoClienteSugestao(e: EmpresaAgenda, p: PedidoAgendamento, sugestao: string): string {
  const q = quemConfirma(e);
  return `Oi! ${q.O} não consegue ${formatarDataHora(p.inicioISO)}, mas sugeriu: *${sugestao}*.\n` +
    'Fica bom pra você? Se não der, me diga outro dia e horário.';
}

export function textoClienteDemora(e: EmpresaAgenda, p: PedidoAgendamento): string {
  const q = quemConfirma(e);
  return `Oi! Ainda estou esperando ${q.o} confirmar o horário que você pediu (${formatarDataHora(p.inicioISO)}). ` +
    'Assim que tiver a resposta, te aviso por aqui 😊 Se preferir outro dia, é só me dizer.';
}

export function textoClienteExpirado(e: EmpresaAgenda, p: PedidoAgendamento): string {
  const q = quemConfirma(e);
  return `Oi! Desculpa a demora 🙏 ${q.O} não conseguiu confirmar ${formatarDataHora(p.inicioISO)}.\n` +
    'Qual outro dia e horário fica bom pra você? Atendemos de segunda a sexta, das 8h às 16h.';
}

export function textoAdminPedido(p: PedidoAgendamento, nomeAssistente: string, cabecalho = '📅 *Pedido de agendamento — aguardando sua confirmação*'): string {
  const tipo = p.tipo === 'meet' ? '🎥 Google Meet (30 min)' : '🚗 Visita técnica presencial (1 h)';
  const linhas: Array<string | null> = [
    cabecalho,
    '',
    `👤 ${p.leadNome || 'Cliente sem nome'}`,
    `📞 ${p.phone}`,
    tipo,
    `🕒 ${formatarDataHora(p.inicioISO)}`,
    p.tipo === 'visita' && p.clientAddress ? `📍 ${p.clientAddress}` : null,
    p.tipo === 'visita' && p.clientCoordinates ? `🗺️ https://www.google.com/maps?q=${p.clientCoordinates}` : null,
    p.leadCidade ? `🏙️ ${p.leadCidade}` : null,
    p.contaMensal ? `💡 Conta: R$ ${p.contaMensal}/mês` : null,
    p.leadPerfil ? `🏷️ Perfil: ${p.leadPerfil}` : null,
    p.clientEmail ? `📧 ${p.clientEmail}` : null,
    p.resumoLead ? `\n📝 *Resumo:* ${p.resumoLead}` : null,
    p.notes ? `🗒️ Obs.: ${p.notes}` : null,
    '',
    `_A ${nomeAssistente} disse ao cliente que você vai confirmar. Nada foi marcado na agenda ainda._`,
  ];
  return linhas.filter((l): l is string => l !== null).join('\n');
}

export function botoesPedido(id: string): { principais: Botao[]; extra: Botao[] } {
  return {
    principais: [
      { id: `evabt:agd-ok:${id}`, title: '✅ Confirmar e avisar' },
      { id: `evabt:agd-eu:${id}`, title: '📞 Eu mesmo aviso' },
      { id: `evabt:agd-nao:${id}`, title: '❌ Não posso' },
    ],
    extra: [{ id: `evabt:agd-outro:${id}`, title: '🕐 Sugerir horário' }],
  };
}

/** Versão em texto (sem botões WABA — tenant/Evolution): responde com o número. */
export const OPCOES_TEXTO = [
  'Responda só com o número:',
  '1 ✅ Confirmar e avisar o cliente',
  '2 📞 Confirmar — eu mesmo aviso o cliente',
  '3 ❌ Não posso nesse horário',
  '4 🕐 Sugerir outro horário',
].join('\n');

const ACAO_POR_NUMERO: Record<string, AcaoAdmin> = { '1': 'ok', '2': 'eu', '3': 'nao', '4': 'outro' };

export type AcaoAdmin = 'ok' | 'eu' | 'nao' | 'outro';

/** "evabt:agd-ok:<uuid>" → { acao, id }. */
export function lerBotaoAgenda(texto: string): { acao: AcaoAdmin; id: string } | null {
  const m = texto.trim().match(/^evabt:agd-(ok|eu|nao|outro):([0-9a-f-]{8,64})$/i);
  if (!m) return null;
  return { acao: m[1].toLowerCase() as AcaoAdmin, id: m[2].toLowerCase() };
}

/** Janela de horário comercial pro lembrete ao admin: seg–sex, 8h–18h (Brasília). */
export function emHorarioComercial(ms: number): boolean {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(new Date(ms));
  const dia = partes.find(p => p.type === 'weekday')?.value ?? '';
  const hora = Number(partes.find(p => p.type === 'hour')?.value ?? '0') % 24;
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(dia) && hora >= 8 && hora < 18;
}

/** Janela pra falar com CLIENTE pelo relógio: todo dia, 8h–20h. */
export function emJanelaCliente(ms: number): boolean {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).formatToParts(new Date(ms));
  const hora = Number(partes.find(p => p.type === 'hour')?.value ?? '0') % 24;
  return hora >= 8 && hora < 20;
}

/**
 * A frase PROMETE que o horário está marcado? Só pra observabilidade (log) nas
 * respostas livres da Eva — a regra de verdade está no prompt e no fluxo.
 */
export function prometeAgendamento(texto: string): boolean {
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return /\b(agendad[oa]|marcad[oa]|confirmad[oa])\b|\bte (espera|aguarda)\b|\bagendei\b|\bmarquei\b/.test(t);
}

export type PassoRelogio = 'expirar' | 'avisar_cliente' | 'lembrar_admin' | null;

/** O que o relógio faz com um pendente agora (puro). */
export function passoDoRelogio(p: PedidoAgendamento, agoraMs: number): PassoRelogio {
  if (p.resultado !== ST_PENDENTE) return null;
  const idade = agoraMs - p.criadoEmMs;
  if (Date.parse(p.inicioISO) <= agoraMs) return emJanelaCliente(agoraMs) ? 'expirar' : null;
  if (idade >= AVISO_CLIENTE_MS && !p.clienteAvisadoEmMs) return emJanelaCliente(agoraMs) ? 'avisar_cliente' : null;
  if (idade >= LEMBRETE_ADMIN_MS && !p.lembreteEmMs) return emHorarioComercial(agoraMs) ? 'lembrar_admin' : null;
  return null;
}

// ---------------------------------------------------------------------------
// Serviço
// ---------------------------------------------------------------------------

function soDigitos(v: string | null | undefined): string { return (v ?? '').replace(/\D/g, ''); }

const kDetalhes = (id: string) => `agd:pedido:${id}`;
const kSugestao = (cid: string, admin: string) => `agd:sugerir:${cid}:${soDigitos(admin)}`;
const kUltimo = (cid: string, admin: string) => `agd:ultimo:${cid}:${soDigitos(admin)}`;

export interface NovoPedido {
  leadId: string | null;
  phone: string;
  tipo: TipoAgendamento;
  inicioISO: string;
  fimISO: string;
  detalhes: DetalhesPedido;
}

export class AgendamentoPendenteService {
  constructor(private readonly d: AgendamentoDeps) {}

  private async detalhes(id: string): Promise<DetalhesPedido> {
    try {
      const raw = await this.d.kv.get(kDetalhes(id));
      return raw ? (JSON.parse(raw) as DetalhesPedido) : {};
    } catch (err) {
      this.d.log('warn', `[agenda-pendente] detalhes do pedido ${id} ilegíveis: ${(err as Error).message}`);
      return {};
    }
  }

  private async salvarDetalhes(id: string, det: DetalhesPedido): Promise<void> {
    try { await this.d.kv.set(kDetalhes(id), JSON.stringify(det), 'EX', TTL_DETALHES_S); }
    catch (err) { this.d.log('warn', `[agenda-pendente] não salvei detalhes do pedido ${id}: ${(err as Error).message}`); }
  }

  private async montar(linha: LinhaPedido): Promise<PedidoAgendamento> {
    const det = await this.detalhes(linha.id);
    return {
      ...det,
      id: linha.id,
      companyId: linha.company_id,
      leadId: linha.lead_id,
      phone: linha.phone,
      tipo: linha.tipo === 'meet' ? 'meet' : 'visita',
      inicioISO: new Date(linha.inicio).toISOString(),
      fimISO: new Date(linha.fim).toISOString(),
      resultado: linha.resultado,
      criadoEmMs: Date.parse(linha.created_at),
    };
  }

  private async enviarPedidoAoAdmin(p: PedidoAgendamento, cabecalho?: string): Promise<boolean> {
    const e = this.d.empresaAtual();
    const corpo = textoAdminPedido(p, e.nomeAtendente, cabecalho);
    if (this.d.temBotoes()) {
      const b = botoesPedido(p.id);
      const ok = await this.d.enviarAdmin(corpo.slice(0, 1024), b.principais);
      if (ok) await this.d.enviarAdmin('Prefere propor outro horário ao cliente?', b.extra);
      return ok;
    }
    const ok = await this.d.enviarAdmin(`${corpo}\n\n${OPCOES_TEXTO}`, []);
    if (ok) {
      const admin = this.d.destinoAdmin();
      if (admin) {
        try { await this.d.kv.set(kUltimo(p.companyId, admin), p.id, 'EX', TTL_ULTIMO_S); }
        catch (err) { this.d.log('warn', `[agenda-pendente] não guardei o último pedido do admin: ${(err as Error).message}`); }
      }
    }
    return ok;
  }

  /**
   * O cliente escolheu dia/hora (e confirmou que é esse): grava o PEDIDO, avisa
   * o admin da empresa com os botões e responde o cliente que vai confirmar.
   * NÃO cria evento, NÃO muda o lead pra "agendado".
   */
  async registrarPedido(n: NovoPedido): Promise<{ id: string; adminAvisado: boolean }> {
    const e = this.d.empresaAtual();
    const substituidos = await this.d.repo.substituirPendentes(e.companyId, n.phone);
    if (substituidos > 0) this.d.log('info', `[agenda-pendente] ${substituidos} pedido(s) antigo(s) de ${n.phone} substituído(s) pelo novo`);
    const id = await this.d.repo.inserir({ companyId: e.companyId, leadId: n.leadId, phone: n.phone, tipo: n.tipo, inicioISO: n.inicioISO, fimISO: n.fimISO });
    await this.salvarDetalhes(id, n.detalhes);
    const p: PedidoAgendamento = { ...n.detalhes, id, companyId: e.companyId, leadId: n.leadId, phone: n.phone, tipo: n.tipo, inicioISO: n.inicioISO, fimISO: n.fimISO, resultado: ST_PENDENTE, criadoEmMs: this.d.agoraMs() };

    await this.d.enviarCliente(n.phone, textoClienteAguardando(e, n.tipo, n.inicioISO));
    const adminAvisado = await this.enviarPedidoAoAdmin(p);
    if (!adminAvisado) {
      this.d.log('error', `[agenda-pendente] pedido ${id} da empresa ${e.companyId} SEM admin pra confirmar — fica só no painel`, { pedido_id: id });
    }
    this.d.log('info', `[agenda-pendente] pedido ${id} registrado: ${n.tipo} ${n.inicioISO} lead=${n.leadId} empresa=${e.companyId} adminAvisado=${adminAvisado}`, { pedido_id: id, tipo: n.tipo, inicio: n.inicioISO });
    return { id, adminAvisado };
  }

  /** Pedido da EMPRESA EM CONTEXTO, ou null (id de outra empresa = não existe). */
  async buscar(id: string): Promise<PedidoAgendamento | null> {
    const e = this.d.empresaAtual();
    const linha = await this.d.repo.buscar(id, e.companyId);
    if (!linha || linha.company_id !== e.companyId) return null;
    return this.montar(linha);
  }

  async listarPendentesDaEmpresa(leadId?: string): Promise<PedidoAgendamento[]> {
    const e = this.d.empresaAtual();
    const linhas = await this.d.repo.listarPendentesDaEmpresa(e.companyId, leadId);
    return Promise.all(linhas.filter(l => l.company_id === e.companyId).map(l => this.montar(l)));
  }

  /**
   * Ação do admin sobre um pedido. Devolve o texto de resposta pro admin.
   * Tudo roda no contexto da empresa (quem chama garante isso).
   */
  async responder(acao: AcaoAdmin, id: string, adminPhone: string | null): Promise<string> {
    const p = await this.buscar(id);
    if (!p) return '⚠️ Não achei esse pedido de agendamento.';
    if (p.resultado !== ST_PENDENTE) return `ℹ️ Esse pedido já foi resolvido antes (${descreverResultado(p.resultado)}). Nada mudou.`;
    switch (acao) {
      case 'ok': return this.confirmar(p, true);
      case 'eu': return this.confirmar(p, false);
      case 'nao': return this.recusar(p);
      case 'outro': {
        if (!adminPhone) return '⚠️ Pra sugerir outro horário, responda pelo WhatsApp.';
        await this.d.kv.set(kSugestao(p.companyId, adminPhone), p.id, 'EX', TTL_SUGESTAO_S);
        this.d.log('info', `[agenda-pendente] admin vai sugerir horário pro pedido ${p.id}`);
        return '🕐 Qual horário você sugere? Escreva do seu jeito (ex.: "quinta 10h" ou "sexta à tarde") — eu mando pro cliente.\nPra desistir, escreva "cancelar".';
      }
    }
  }

  private async confirmar(p: PedidoAgendamento, avisarCliente: boolean): Promise<string> {
    const e = this.d.empresaAtual();
    if (!(await this.d.repo.transicionar(p.id, p.companyId, ST_PENDENTE, ST_CONFIRMANDO))) {
      return 'ℹ️ Esse pedido já está sendo resolvido (clique repetido?). Nada mudou.';
    }
    const agendaId = this.d.agendaDaEmpresa();
    let evento: EventoCriado | null = null;
    if (this.d.agenda && agendaId) {
      // Conflito checado DE NOVO: a agenda pode ter mudado desde o pedido.
      try {
        const livre = await this.d.agenda.isAvailable(p.inicioISO, p.fimISO, agendaId);
        if (!livre) {
          await this.d.repo.transicionar(p.id, p.companyId, ST_CONFIRMANDO, ST_PENDENTE);
          this.d.log('warn', `[agenda-pendente] conflito no ✅ do pedido ${p.id} (${p.inicioISO})`);
          return `⚠️ Esse horário (${formatarDataHora(p.inicioISO)}) já está ocupado na sua agenda. Nada foi marcado.\nToque ❌ Não posso ou 🕐 Sugerir horário no pedido.`;
        }
        evento = await this.d.agenda.createEvent(montarEvento(p, agendaId));
      } catch (err) {
        await this.d.repo.transicionar(p.id, p.companyId, ST_CONFIRMANDO, ST_PENDENTE);
        this.d.log('error', `[agenda-pendente] falha na agenda ao confirmar ${p.id}: ${(err as Error).message}`, { pedido_id: p.id });
        return '⚠️ Não consegui criar o evento no Google Agenda agora. O pedido continua pendente — tente de novo em instantes.';
      }
    } else {
      this.d.log('warn', `[agenda-pendente] empresa ${p.companyId} sem agenda do Google: pedido ${p.id} confirmado sem evento`);
    }
    const gravou = await this.d.repo.transicionar(p.id, p.companyId, ST_CONFIRMANDO, null, { calendarEventId: evento?.eventId ?? null });
    if (!gravou) this.d.log('error', `[agenda-pendente] evento ${evento?.eventId ?? '-'} criado mas não gravei a confirmação do pedido ${p.id}`, { pedido_id: p.id });

    try { await this.d.aoConfirmar(p, evento); }
    catch (err) { this.d.log('warn', `[agenda-pendente] pós-confirmação falhou ${p.id}: ${(err as Error).message}`); }

    if (avisarCliente) {
      const txt = textoClienteConfirmado(e, p, evento?.meetLink);
      await this.d.enviarCliente(p.phone, txt);
      if (p.leadId) await this.d.registrarNaConversa(p.leadId, p.companyId, txt).catch(() => {});
    }
    this.d.log('info', `[agenda-pendente] pedido ${p.id} CONFIRMADO pelo admin (avisarCliente=${avisarCliente}) evento=${evento?.eventId ?? 'sem agenda'}`, { pedido_id: p.id, evento: evento?.eventId ?? null });

    return [
      avisarCliente
        ? `✅ Confirmado! A ${e.nomeAtendente} já avisou o cliente.`
        : `✅ Confirmado! A ${e.nomeAtendente} NÃO falou com o cliente — você avisa.`,
      evento?.htmlLink ? `📅 ${evento.htmlLink}` : (evento ? '' : '⚠️ Sem agenda do Google configurada: o evento não foi criado.'),
      evento?.meetLink ? `🎥 Meet: ${evento.meetLink}` : '',
      !avisarCliente ? `📞 ${p.phone}` : '',
    ].filter(Boolean).join('\n');
  }

  private async recusar(p: PedidoAgendamento): Promise<string> {
    const e = this.d.empresaAtual();
    if (!(await this.d.repo.transicionar(p.id, p.companyId, ST_PENDENTE, ST_NAO_CONFIRMADA))) {
      return 'ℹ️ Esse pedido já foi resolvido. Nada mudou.';
    }
    const txt = textoClienteNaoPode(e, p);
    await this.d.enviarCliente(p.phone, txt);
    if (p.leadId) await this.d.registrarNaConversa(p.leadId, p.companyId, txt).catch(() => {});
    this.d.log('info', `[agenda-pendente] pedido ${p.id} recusado pelo admin — cliente convidado a escolher outro horário`, { pedido_id: p.id });
    return `👍 Ok. A ${e.nomeAtendente} pediu outro dia/horário ao cliente. Quando ele escolher, chega um novo pedido pra você.`;
  }

  /**
   * Texto livre do admin. Se ele estava sugerindo horário, manda pro cliente.
   * Se era só um número (1–4) respondendo o último pedido em texto, executa.
   * Devolve a resposta pro admin, ou null quando não era com a gente.
   */
  async tratarTextoDoAdmin(adminPhone: string, texto: string): Promise<string | null> {
    const e = this.d.empresaAtual();
    const t = texto.trim();
    const btn = lerBotaoAgenda(t);
    if (btn) return this.responder(btn.acao, btn.id, adminPhone);

    let idSugestao: string | null = null;
    try { idSugestao = await this.d.kv.get(kSugestao(e.companyId, adminPhone)); } catch { idSugestao = null; }
    if (idSugestao) {
      await this.d.kv.del(kSugestao(e.companyId, adminPhone)).catch(() => {});
      if (/^(cancelar|cancela|sair)$/i.test(t)) return '👍 Ok, não mandei nada. O pedido continua aguardando você.';
      // Comando (/menu, botão de outra coisa) no meio: desiste da sugestão e deixa
      // o comando seguir o caminho dele — nunca manda comando pro cliente.
      if (/^(\/|menu$|evabt:|[a-z_]+:)/i.test(t)) {
        this.d.log('info', `[agenda-pendente] sugestão do pedido ${idSugestao} abandonada (admin mandou comando)`);
        return null;
      }
      const sugestao = t.replace(/\s+/g, ' ').slice(0, 200);
      if (!sugestao) return '⚠️ Não entendi o horário. Toque 🕐 de novo e escreva o horário.';
      const p = await this.buscar(idSugestao);
      if (!p) return '⚠️ Não achei esse pedido de agendamento.';
      if (!(await this.d.repo.transicionar(p.id, p.companyId, ST_PENDENTE, ST_NAO_CONFIRMADA))) {
        return 'ℹ️ Esse pedido já foi resolvido antes. Não mandei a sugestão.';
      }
      const txt = textoClienteSugestao(e, p, sugestao);
      await this.d.enviarCliente(p.phone, txt);
      if (p.leadId) await this.d.registrarNaConversa(p.leadId, p.companyId, txt).catch(() => {});
      this.d.log('info', `[agenda-pendente] admin sugeriu "${sugestao}" pro pedido ${p.id}`, { pedido_id: p.id });
      return `📨 Mandei sua sugestão ao cliente. Quando ele responder, chega um novo pedido pra você confirmar.`;
    }

    const acaoNum = ACAO_POR_NUMERO[t];
    if (acaoNum) {
      let ultimo: string | null = null;
      try { ultimo = await this.d.kv.get(kUltimo(e.companyId, adminPhone)); } catch { ultimo = null; }
      if (ultimo) return this.responder(acaoNum, ultimo, adminPhone);
    }
    return null;
  }

  /** Relógio (cron): lembrete ao admin (3 h), aviso ao cliente (24 h), expiração. */
  async processarPendentes(rodarNaEmpresa: <T>(companyId: string, fn: () => Promise<T>) => Promise<T>): Promise<{ lembretes: number; avisos: number; expirados: number }> {
    const r = { lembretes: 0, avisos: 0, expirados: 0 };
    const agora = this.d.agoraMs();
    const linhas = await this.d.repo.listarPendentes();
    for (const linha of linhas) {
      try {
        const p = await this.montar(linha);
        const passo = passoDoRelogio(p, agora);
        if (!passo) continue;
        await rodarNaEmpresa(p.companyId, async () => {
          const e = this.d.empresaAtual();
          if (passo === 'expirar') {
            if (!(await this.d.repo.transicionar(p.id, p.companyId, ST_PENDENTE, ST_EXPIRADA))) return;
            const txt = textoClienteExpirado(e, p);
            await this.d.enviarCliente(p.phone, txt);
            if (p.leadId) await this.d.registrarNaConversa(p.leadId, p.companyId, txt).catch(() => {});
            await this.d.enviarAdmin(`⌛ O pedido de ${p.leadNome || p.phone} para ${formatarDataHora(p.inicioISO)} passou sem confirmação. A ${e.nomeAtendente} pediu outra data ao cliente.`, []);
            this.d.log('warn', `[agenda-pendente] pedido ${p.id} EXPIROU sem confirmação`, { pedido_id: p.id });
            r.expirados++;
          } else if (passo === 'avisar_cliente') {
            const txt = textoClienteDemora(e, p);
            await this.d.enviarCliente(p.phone, txt);
            if (p.leadId) await this.d.registrarNaConversa(p.leadId, p.companyId, txt).catch(() => {});
            await this.salvarDetalhes(p.id, { ...extrairDetalhes(p), clienteAvisadoEmMs: agora, lembreteEmMs: p.lembreteEmMs ?? agora });
            await this.enviarPedidoAoAdmin(p, '⏰ *Cliente esperando há 24 h — confirme o agendamento*');
            this.d.log('warn', `[agenda-pendente] pedido ${p.id} com 24 h sem resposta — cliente avisado, admin lembrado`, { pedido_id: p.id });
            r.avisos++;
          } else {
            await this.salvarDetalhes(p.id, { ...extrairDetalhes(p), lembreteEmMs: agora });
            await this.enviarPedidoAoAdmin(p, '⏰ *Lembrete — pedido de agendamento sem resposta*');
            this.d.log('info', `[agenda-pendente] lembrete (3 h) do pedido ${p.id} ao admin`, { pedido_id: p.id });
            r.lembretes++;
          }
        });
      } catch (err) {
        this.d.log('error', `[agenda-pendente] relógio falhou no pedido ${linha.id}: ${(err as Error).message}`);
      }
    }
    return r;
  }
}

function extrairDetalhes(p: PedidoAgendamento): DetalhesPedido {
  const { id: _i, companyId: _c, leadId: _l, phone: _p, tipo: _t, inicioISO: _s, fimISO: _f, resultado: _r, criadoEmMs: _m, ...det } = p;
  return det;
}

export function descreverResultado(r: string | null): string {
  if (r === null) return 'confirmado';
  if (r === ST_CONFIRMANDO) return 'sendo confirmado agora';
  if (r === ST_NAO_CONFIRMADA) return 'recusado / outro horário sugerido';
  if (r === ST_SUBSTITUIDA) return 'o cliente pediu outro horário depois';
  if (r === ST_EXPIRADA) return 'expirou sem resposta';
  return r;
}

/** Evento no Google do jeito que era criado antes (Meet com link / visita com endereço e Maps). */
export function montarEvento(p: PedidoAgendamento, calendarId: string): {
  summary: string; description: string; startISO: string; endISO: string; location?: string; withMeet: boolean; calendarId: string;
} {
  const isMeet = p.tipo === 'meet';
  const nome = p.leadNome || p.phone;
  const summary = isMeet
    ? `Meet - ${nome} - apresentacao estudo`
    : `Visita tecnica - ${nome} - ${p.leadCidade ?? ''}`.trim().replace(/ -$/, '');
  const description = [
    `Tipo: ${isMeet ? 'Google Meet (online)' : 'Visita tecnica presencial'}`,
    `Cliente: ${p.leadNome || 'Nao informado'}`,
    `WhatsApp: ${p.phone}`,
    `Cidade: ${p.leadCidade || 'Nao informada'}`,
    `Perfil: ${p.leadPerfil || 'indefinido'}`,
    p.contaMensal ? `Conta: R$ ${p.contaMensal}/mes` : '',
    p.clientEmail ? `Email cliente: ${p.clientEmail}` : '',
    !isMeet && p.clientAddress ? `Endereco: ${p.clientAddress}` : '',
    !isMeet && p.clientCoordinates ? `Coordenadas: ${p.clientCoordinates}` : '',
    !isMeet && p.clientCoordinates ? `Maps: https://www.google.com/maps?q=${p.clientCoordinates}` : '',
    p.resumoLead ? `\nResumo: ${p.resumoLead}` : '',
    p.notes ? `\nObservacoes: ${p.notes}` : '',
    '\nConfirmado pelo responsavel antes de marcar.',
  ].filter(Boolean).join('\n');
  const location = isMeet
    ? undefined
    : (p.clientCoordinates
      ? (p.clientAddress ? `${p.clientAddress} (${p.clientCoordinates})` : p.clientCoordinates)
      : (p.clientAddress || undefined));
  return { summary, description, startISO: p.inicioISO, endISO: p.fimISO, location, withMeet: isMeet, calendarId };
}

// ---------------------------------------------------------------------------
// Repositório Supabase (tabela `visitas`) — sempre filtrando company_id.
// ---------------------------------------------------------------------------

type ClienteSupabase = { from: (t: string) => any };

const COLUNAS = 'id, company_id, lead_id, phone, tipo, inicio, fim, resultado, created_at, calendar_event_id';

export function repoSupabase(client: ClienteSupabase): RepoPedidos {
  return {
    async inserir(p) {
      const { data, error } = await client.from('visitas').insert({
        company_id: p.companyId, lead_id: p.leadId, phone: p.phone, tipo: p.tipo,
        inicio: p.inicioISO, fim: p.fimISO, calendar_event_id: null, resultado: ST_PENDENTE,
      }).select('id').single();
      if (error || !data?.id) throw new Error(`visitas insert: ${error?.message ?? 'sem id'}`);
      return data.id as string;
    },
    async substituirPendentes(companyId, phone) {
      const { data, error } = await client.from('visitas').update({ resultado: ST_SUBSTITUIDA })
        .eq('company_id', companyId).eq('phone', phone).eq('resultado', ST_PENDENTE).select('id');
      if (error) throw new Error(`visitas substituir: ${error.message}`);
      return (data ?? []).length;
    },
    async buscar(id, companyId) {
      const { data, error } = await client.from('visitas').select(COLUNAS).eq('id', id).eq('company_id', companyId).maybeSingle();
      if (error) throw new Error(`visitas buscar: ${error.message}`);
      return (data ?? null) as LinhaPedido | null;
    },
    async transicionar(id, companyId, de, para, extra) {
      const patch: Record<string, unknown> = { resultado: para };
      if (extra && 'calendarEventId' in extra) patch.calendar_event_id = extra.calendarEventId ?? null;
      const { data, error } = await client.from('visitas').update(patch)
        .eq('id', id).eq('company_id', companyId).eq('resultado', de).select('id');
      if (error) throw new Error(`visitas transicionar: ${error.message}`);
      return (data ?? []).length > 0;
    },
    async listarPendentes() {
      const { data, error } = await client.from('visitas').select(COLUNAS).eq('resultado', ST_PENDENTE).order('created_at', { ascending: true }).limit(200);
      if (error) throw new Error(`visitas listar: ${error.message}`);
      return (data ?? []) as LinhaPedido[];
    },
    async listarPendentesDaEmpresa(companyId, leadId) {
      let q = client.from('visitas').select(COLUNAS).eq('company_id', companyId).eq('resultado', ST_PENDENTE);
      if (leadId) q = q.eq('lead_id', leadId);
      const { data, error } = await q.order('inicio', { ascending: true }).limit(50);
      if (error) throw new Error(`visitas listar empresa: ${error.message}`);
      return (data ?? []) as LinhaPedido[];
    },
  };
}
