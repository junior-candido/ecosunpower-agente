// src/modules/cobranca-recorrente/motor.ts
// O robô da cobrança recorrente + as ações manuais da tela (28/09/2026).
// Tudo com dependências injetadas (testável sem rede/banco — ver
// tests/cobranca-recorrente-motor.test.ts); quem liga no mundo real é
// servico.ts.
//
// Régua (ciclo.ts): D−3 fatura · D−1 véspera · D+1 venceu · D+2 último aviso
// (+ Junior) · D+3 PAUSA a assistente do tenant (pausa.ts). Pagou → volta.
//
// Ordem de cada toque ao cliente:
//   1. garante o link (InfinitePay) — se recusar, NÃO gasta o toque;
//   2. RESERVA o toque na fatura (só um processo ganha) — nunca sai 2x;
//   3. WhatsApp pelo MODELO aprovado + e-mail; sem WhatsApp → Junior encaminha;
//   4. nenhum canal funcionou → solta a reserva (tenta amanhã) e conta erro.
// No fim da rodada, qualquer erro vira UM aviso pro Junior.

import {
  competenciasDevidas, proximaCompetenciaManual, acaoDaFatura, diasEntre, hojeBrasilia,
  type AcaoFatura, type StatusAssinatura,
} from './ciclo.js';
import {
  mensagemDoToque, mensagemPausa, mensagemDisparosPausados, emailReativada, avisoJuniorEncaminhar, avisoJuniorUltimo,
  avisoJuniorPausada, avisoJuniorReativada, avisoJuniorVesperaDisparos, avisoJuniorDisparosPausados, referenciaDaFatura, ROTULO_TOQUE,
  type DadosFatura, type MensagemCliente,
} from './mensagens.js';
import { decidirPausa, dataDaPausa, dataDaTravaDisparos, podePausar } from './pausa.js';
import type { FaturaRow, NovaFatura, TipoAviso } from './faturas-repo.js';

export interface AssinaturaMotor {
  id: string;
  /** Produto (ex.: 'assistente_virtual', 'monitoramento') — só a assinatura da Assistente virtual pausa a assistente. */
  produtoId?: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  valorCentavos: number;
  status: StatusAssinatura;
  diaVencimento: number | null;
  inicioEm: string | null;
  companyId: string | null;
  /** Descrição que o cliente vê (já resolvida: a da assinatura ou o nome do produto). */
  descricao: string;
  leadId: string | null;
  // Pausa da assistente por inadimplência (146)
  pausaAutomatica: boolean;
  diasPausa: number;
  pausaAdiadaAte: string | null;
  assistentePausadaEm: string | null;
  /** 2ª trava (disparos automáticos): dias depois do vencimento e desde quando está ligada. */
  diasTravaDisparos: number;
  disparosPausadosEm: string | null;
  /** Nome da empresa do painel (tenant), pros avisos do Junior. */
  empresaNome?: string | null;
}

/** Canais de saída (compartilhados com a baixa/recibo). */
export interface CanaisDeps {
  modeloAprovado(nome: string): Promise<boolean>;
  enviarModelo(telefone: string, modelo: string, params: string[]): Promise<void>;
  enviarEmail(to: string, assunto: string, html: string, ctaUrl: string | null): Promise<void>;
  avisarJunior(texto: string): Promise<void>;
  /** Log estruturado (sem telefone/e-mail — só ids). */
  log(evento: Record<string, unknown>): void;
}

/** Ligar/desligar a assistente do tenant (servico.ts → assinaturas.assistente_pausada_em). */
export interface PausaDeps {
  /** A casa (EcoSun): a assistente dela NUNCA pausa. */
  casaId: string;
  /** Link completo da tela da assinatura (dá pra tocar no WhatsApp). */
  urlAssinatura(assinaturaId: string): string;
  /** true = pausou agora (estava atendendo). Nunca pausa a casa. */
  pausarAssistente(a: AssinaturaMotor): Promise<boolean>;
  /** true = reativou agora (estava pausada). Desfaz as DUAS travas. */
  reativarAssistente(a: AssinaturaMotor): Promise<boolean>;
  /** 2ª trava: true = travou agora. Nunca a casa. */
  pausarDisparos(a: AssinaturaMotor): Promise<boolean>;
  /** Na volta: reagenda os disparos que ficaram na fila (de onde parou, com espaçamento). */
  reagendarDisparos(a: AssinaturaMotor, pausadoDesde: string): Promise<number>;
  /** Auditoria / linha do tempo. */
  auditar(ev: { assinaturaId: string; acao: string; detalhe?: string }): Promise<void>;
}

export interface MotorDeps extends CanaisDeps, PausaDeps {
  donaId: string;
  listarCobraveis(): Promise<AssinaturaMotor[]>;
  faturasDaAssinatura(assinaturaId: string): Promise<FaturaRow[]>;
  criarFatura(n: NovaFatura): Promise<FaturaRow | null>;
  /** Link de pagamento da fatura (cria cobrança + link na InfinitePay se faltar). Lança se recusar. */
  garantirLink(f: FaturaRow, a: AssinaturaMotor): Promise<string>;
  reservarAviso(faturaId: string, tipo: TipoAviso): Promise<boolean>;
  liberarAviso(faturaId: string, tipo: TipoAviso): Promise<void>;
  registrarCanal(faturaId: string, canal: string): Promise<void>;
}

export interface ResumoRodada {
  criadas: number;
  avisos: number;
  atrasos: number;
  pausas: number;
  reativacoes: number;
  erros: string[];
}

export type Canal = 'whatsapp' | 'email' | 'junior';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function dadosDaFatura(a: AssinaturaMotor, f: FaturaRow, link: string | null): DadosFatura {
  return { nome: a.nome, descricao: f.descricao, competencia: f.competencia, venceEm: f.venceEm, valorCentavos: f.valorCentavos, link };
}

/** Tenant com pausa automática ligada (o último aviso fala da assistente). */
export function ehPausavel(a: AssinaturaMotor, casaId: string): boolean {
  return podePausar(a, casaId) && a.pausaAutomatica;
}

/**
 * Manda UMA mensagem ao cliente pelos canais disponíveis. Devolve os canais
 * que funcionaram ([] = nada saiu). Não mexe em reserva — quem chama decide.
 */
export async function enviarAoCliente(
  deps: CanaisDeps,
  a: AssinaturaMotor,
  f: FaturaRow,
  m: MensagemCliente,
  rotulo: string,
  base: Record<string, unknown>,
): Promise<Canal[]> {
  const canais: Canal[] = [];
  const aprovado = a.telefone ? await deps.modeloAprovado(m.modelo).catch(() => false) : false;
  if (a.telefone && aprovado) {
    try {
      await deps.enviarModelo(a.telefone, m.modelo, m.params);
      canais.push('whatsapp');
    } catch (e) {
      deps.log({ evento: 'erro_envio', canal: 'whatsapp', ...base, erro: msg(e) });
    }
  }
  let emailEnviado = false;
  if (a.email) {
    try {
      await deps.enviarEmail(a.email, m.email.assunto, m.email.html, m.email.ctaUrl);
      canais.push('email');
      emailEnviado = true;
    } catch (e) {
      deps.log({ evento: 'erro_envio', canal: 'email', ...base, erro: msg(e) });
    }
  }
  // Sem WhatsApp pro cliente: o Junior encaminha do celular dele — a não ser
  // que o cliente nem tenha WhatsApp e o e-mail já tenha chegado.
  if (!canais.includes('whatsapp') && (a.telefone !== null || !emailEnviado)) {
    const motivo = !a.telefone ? 'sem_whatsapp' as const : aprovado ? 'zap_falhou' as const : 'modelo_pendente' as const;
    try {
      await deps.avisarJunior(avisoJuniorEncaminhar({
        ...dadosDaFatura(a, f, m.email.ctaUrl), telefone: a.telefone, email: a.email, emailEnviado, motivo, rotulo, modelo: m.modelo, texto: m.texto,
      }));
      canais.push('junior');
    } catch (e) {
      deps.log({ evento: 'erro_envio', canal: 'junior', ...base, erro: msg(e) });
    }
  }
  return canais;
}

function mensagemPara(deps: PausaDeps, a: AssinaturaMotor, f: FaturaRow, acao: AcaoFatura, link: string, hoje: string): MensagemCliente {
  const pausavel = ehPausavel(a, deps.casaId);
  return mensagemDoToque(acao, dadosDaFatura(a, f, link), {
    pausavel, hoje,
    dataPausa: pausavel ? dataDaPausa(f.venceEm, a.diasPausa, a.pausaAdiadaAte) : null,
    dataDisparos: pausavel ? dataDaTravaDisparos(f.venceEm, a.diasPausa, a.diasTravaDisparos, a.pausaAdiadaAte) : null,
  });
}

/** Dias EFETIVOS (já com o prazo dado) da 1ª e da 2ª trava — pra régua de avisos. */
export function travasDaFatura(deps: PausaDeps, a: AssinaturaMotor, f: FaturaRow): { pausaEm: number; disparosEm: number | null } {
  const pausavel = ehPausavel(a, deps.casaId);
  return {
    pausaEm: pausavel ? diasEntre(f.venceEm, dataDaPausa(f.venceEm, a.diasPausa, a.pausaAdiadaAte)) : a.diasPausa,
    disparosEm: pausavel ? diasEntre(f.venceEm, dataDaTravaDisparos(f.venceEm, a.diasPausa, a.diasTravaDisparos, a.pausaAdiadaAte)) : null,
  };
}

/** Toque do robô: link → reserva → envia → (nada saiu? solta a reserva). */
async function tocarNaRegua(deps: MotorDeps, a: AssinaturaMotor, f: FaturaRow, acao: AcaoFatura, hoje: string): Promise<boolean> {
  const link = f.linkUrl ?? await deps.garantirLink(f, a);
  if (!(await deps.reservarAviso(f.id, acao))) return false; // outro processo já mandou
  const base = { fatura_id: f.id, assinatura_id: a.id, acao };
  const canais = await enviarAoCliente(deps, a, f, mensagemPara(deps, a, f, acao, link, hoje), ROTULO_TOQUE[acao], base);
  if (canais.length === 0) {
    await deps.liberarAviso(f.id, acao);
    throw new Error(`nenhum canal funcionou (${acao} de ${f.competencia.slice(0, 7)})`);
  }
  await deps.registrarCanal(f.id, canais.join('+'));
  deps.log({ evento: 'aviso_enviado', ...base, canais });
  if (acao === 'aviso_disparos') {
    await deps.avisarJunior(avisoJuniorVesperaDisparos({
      ...dadosDaFatura(a, f, link), urlAssinatura: deps.urlAssinatura(a.id),
      dataDisparos: dataDaTravaDisparos(f.venceEm, a.diasPausa, a.diasTravaDisparos, a.pausaAdiadaAte),
    })).catch((e) => deps.log({ evento: 'erro_envio', canal: 'junior', ...base, erro: msg(e) }));
  }
  if (acao === 'ultimo_aviso') {
    const pausavel = ehPausavel(a, deps.casaId);
    await deps.avisarJunior(avisoJuniorUltimo({
      ...dadosDaFatura(a, f, link), dias: diasEntre(f.venceEm, hoje), pausavel,
      dataPausa: pausavel ? dataDaPausa(f.venceEm, a.diasPausa, a.pausaAdiadaAte) : null,
      urlAssinatura: deps.urlAssinatura(a.id),
    })).catch((e) => deps.log({ evento: 'erro_envio', canal: 'junior', ...base, erro: msg(e) }));
  }
  return true;
}

// ---------------------------------------------------------------------------
// Pausa / reativação da assistente do tenant
// ---------------------------------------------------------------------------

function faturaMaisAntigaVencida(faturas: FaturaRow[], hoje: string): FaturaRow | undefined {
  return faturas.filter((f) => f.status === 'aberta' && f.venceEm < hoje).sort((x, y) => (x.venceEm < y.venceEm ? -1 : 1))[0];
}

/** Pausa (se ainda atendendo) e avisa cliente + Junior. Nunca a casa. */
export async function pausarAssistenteDe(
  deps: CanaisDeps & PausaDeps & { garantirLink?: MotorDeps['garantirLink'] },
  a: AssinaturaMotor,
  faturas: FaturaRow[],
  hoje: string,
  origem: 'auto' | 'manual',
): Promise<boolean> {
  if (!podePausar(a, deps.casaId)) return false;
  if (!(await deps.pausarAssistente(a))) return false; // já estava pausada
  const f = faturaMaisAntigaVencida(faturas, hoje) ?? faturas.find((x) => x.status === 'aberta');
  const base = { assinatura_id: a.id, company_id: a.companyId, origem };
  deps.log({ evento: 'assistente_pausada', ...base, fatura_id: f?.id ?? null });
  await deps.auditar({ assinaturaId: a.id, acao: origem === 'auto' ? 'assistente_pausada_auto' : 'assistente_pausada_manual', detalhe: f ? f.competencia.slice(0, 7) : undefined }).catch(() => undefined);
  if (f) {
    const link = f.linkUrl ?? (deps.garantirLink ? await deps.garantirLink(f, a).catch(() => null) : null);
    await enviarAoCliente(deps, a, f, mensagemPausa(dadosDaFatura(a, f, link)), ROTULO_TOQUE.pausa, { ...base, acao: 'pausa', fatura_id: f.id });
  }
  await deps.avisarJunior(avisoJuniorPausada({
    nome: a.nome, empresa: a.empresaNome ?? null, ref: f ? referenciaDaFatura(f.descricao, f.competencia) : 'sem fatura em aberto',
    valorCentavos: f?.valorCentavos ?? a.valorCentavos, urlAssinatura: deps.urlAssinatura(a.id), manual: origem === 'manual',
  })).catch(() => undefined);
  return true;
}

/** Reativa (se pausada) e avisa cliente (e-mail) + Junior. */
export async function reativarAssistenteDe(
  deps: CanaisDeps & PausaDeps,
  a: AssinaturaMotor,
  motivo: 'pagou' | 'manual' | 'prazo',
): Promise<boolean> {
  if (!(await deps.reativarAssistente(a))) return false;
  deps.log({ evento: 'assistente_reativada', assinatura_id: a.id, company_id: a.companyId, motivo });
  // 2ª trava ligada: os disparos que ficaram na fila voltam de onde pararam, espaçados (sem enxurrada).
  if (a.disparosPausadosEm) {
    try {
      const n = await deps.reagendarDisparos(a, a.disparosPausadosEm);
      deps.log({ evento: 'disparos_reagendados', assinatura_id: a.id, company_id: a.companyId, quantidade: n });
    } catch (e) {
      deps.log({ evento: 'erro_reagendar', assinatura_id: a.id, erro: msg(e) });
    }
  }
  await deps.auditar({ assinaturaId: a.id, acao: `assistente_reativada_${motivo}` }).catch(() => undefined);
  if (a.email) {
    const e = emailReativada(a.nome);
    await deps.enviarEmail(a.email, e.assunto, e.html, null).catch((err) => deps.log({ evento: 'erro_envio', canal: 'email', acao: 'reativada', assinatura_id: a.id, erro: msg(err) }));
  }
  await deps.avisarJunior(avisoJuniorReativada({ nome: a.nome, empresa: a.empresaNome ?? null, motivo })).catch(() => undefined);
  return true;
}

/** 2ª trava: param os disparos automáticos pros clientes do tenant (ficam na fila). Nunca a casa. */
export async function pausarDisparosDe(
  deps: CanaisDeps & PausaDeps & { garantirLink?: MotorDeps['garantirLink'] },
  a: AssinaturaMotor,
  faturas: FaturaRow[],
  hoje: string,
  origem: 'auto' | 'manual',
): Promise<boolean> {
  if (!podePausar(a, deps.casaId)) return false;
  if (!(await deps.pausarDisparos(a))) return false;
  const f = faturaMaisAntigaVencida(faturas, hoje) ?? faturas.find((x) => x.status === 'aberta');
  const base = { assinatura_id: a.id, company_id: a.companyId, origem };
  deps.log({ evento: 'disparos_pausados', ...base, fatura_id: f?.id ?? null });
  await deps.auditar({ assinaturaId: a.id, acao: origem === 'auto' ? 'disparos_pausados_auto' : 'disparos_pausados_manual', detalhe: f ? f.competencia.slice(0, 7) : undefined }).catch(() => undefined);
  if (f) {
    const link = f.linkUrl ?? (deps.garantirLink ? await deps.garantirLink(f, a).catch(() => null) : null);
    await enviarAoCliente(deps, a, f, mensagemDisparosPausados(dadosDaFatura(a, f, link)), ROTULO_TOQUE.pausa_disparos, { ...base, acao: 'pausa_disparos', fatura_id: f.id });
  }
  await deps.avisarJunior(avisoJuniorDisparosPausados({
    nome: a.nome, empresa: a.empresaNome ?? null, ref: f ? referenciaDaFatura(f.descricao, f.competencia) : 'sem fatura em aberto',
    valorCentavos: f?.valorCentavos ?? a.valorCentavos, urlAssinatura: deps.urlAssinatura(a.id), manual: origem === 'manual',
  })).catch(() => undefined);
  return true;
}

// ---------------------------------------------------------------------------
// Rodada diária
// ---------------------------------------------------------------------------

export async function rodarCobrancaRecorrente(deps: MotorDeps, hoje: string): Promise<ResumoRodada> {
  const r: ResumoRodada = { criadas: 0, avisos: 0, atrasos: 0, pausas: 0, reativacoes: 0, erros: [] };
  const assinaturas = await deps.listarCobraveis();
  deps.log({ evento: 'rodada_inicio', hoje, assinaturas: assinaturas.length });

  for (const a of assinaturas) {
    try {
      const faturas = await deps.faturasDaAssinatura(a.id);
      const existentes = new Set(faturas.map((f) => f.competencia));
      for (const dev of competenciasDevidas(a, hoje, existentes)) {
        const f = await deps.criarFatura({
          assinaturaId: a.id, companyId: a.companyId, donaId: deps.donaId,
          competencia: dev.competencia, venceEm: dev.venceEm, valorCentavos: a.valorCentavos, descricao: a.descricao,
        });
        if (!f) continue; // outro processo criou no meio
        faturas.push(f);
        r.criadas++;
        deps.log({ evento: 'fatura_criada', fatura_id: f.id, assinatura_id: a.id, competencia: f.competencia, valor_centavos: f.valorCentavos });
      }

      for (const f of faturas) {
        const acao = acaoDaFatura(f, hoje, travasDaFatura(deps, a, f));
        if (!acao) continue;
        try {
          if (await tocarNaRegua(deps, a, f, acao, hoje)) {
            r.avisos++;
            if (acao === 'ultimo_aviso') r.atrasos++;
          }
        } catch (e) {
          r.erros.push(`${a.nome} (${f.competencia.slice(0, 7)}): ${msg(e)}`);
          deps.log({ evento: 'erro_fatura', fatura_id: f.id, assinatura_id: a.id, acao, erro: msg(e) });
        }
      }

      // "Se não pagar, a assistente para" — só tenant; a casa nunca.
      const decisao = decidirPausa(a, faturas, hoje, deps.casaId);
      // Cada trava só depois que o aviso da véspera saiu num dia ANTERIOR (nunca aviso e trava juntos).
      const alvo = faturaMaisAntigaVencida(faturas, hoje);
      const avisouAntes = (ts: string | null | undefined) => !!ts && hojeBrasilia(new Date(ts)) < hoje;
      if (decisao === 'pausar' && alvo && avisouAntes(alvo.avisoUltimoEm) && await pausarAssistenteDe(deps, a, faturas, hoje, 'auto')) r.pausas++;
      if (decisao === 'pausar_disparos' && alvo && avisouAntes(alvo.avisoDisparosEm) && await pausarDisparosDe(deps, a, faturas, hoje, 'auto')) r.pausas++;
      if (decisao === 'reativar' && await reativarAssistenteDe(deps, a, 'pagou')) r.reativacoes++;
    } catch (e) {
      r.erros.push(`${a.nome}: ${msg(e)}`);
      deps.log({ evento: 'erro_assinatura', assinatura_id: a.id, erro: msg(e) });
    }
  }

  deps.log({ evento: 'rodada_fim', hoje, criadas: r.criadas, avisos: r.avisos, atrasos: r.atrasos, pausas: r.pausas, reativacoes: r.reativacoes, erros: r.erros.length });
  if (r.erros.length) {
    const lista = r.erros.slice(0, 10).map((e) => `• ${e}`).join('\n');
    await deps.avisarJunior(`⚠️ Cobrança recorrente de hoje teve ${r.erros.length} problema(s):\n${lista}${r.erros.length > 10 ? '\n…' : ''}\nAbra Financeiro › Assinaturas pra ver e usar "Gerar cobrança agora" / "Reenviar link".`).catch(() => undefined);
  }
  return r;
}

// ---------------------------------------------------------------------------
// Ações manuais (tela da casa)
// ---------------------------------------------------------------------------

export type ResultadoManual =
  | { ok: true; faturaId: string; competencia: string; link: string; canais: Canal[] }
  | { ok: false; erro: string };

/** "Gerar cobrança agora": cria a próxima fatura sem esperar o D−3 e já manda. */
export async function gerarCobrancaAgora(deps: MotorDeps, a: AssinaturaMotor, hoje: string): Promise<ResultadoManual> {
  try {
    const faturas = await deps.faturasDaAssinatura(a.id);
    const prox = proximaCompetenciaManual(a, hoje, new Set(faturas.map((f) => f.competencia)));
    if (!prox) return { ok: false, erro: 'Assinatura pausada/cancelada ou sem dia de vencimento — nada pra cobrar.' };
    const f = await deps.criarFatura({
      assinaturaId: a.id, companyId: a.companyId, donaId: deps.donaId,
      competencia: prox.competencia, venceEm: prox.venceEm, valorCentavos: a.valorCentavos, descricao: a.descricao,
    });
    if (!f) return { ok: false, erro: 'A fatura deste mês acabou de ser criada — recarregue a página.' };
    deps.log({ evento: 'fatura_criada', origem: 'manual', fatura_id: f.id, assinatura_id: a.id, competencia: f.competencia, valor_centavos: f.valorCentavos });
    const link = await deps.garantirLink(f, a);
    if (!(await deps.reservarAviso(f.id, 'fatura'))) {
      return { ok: true, faturaId: f.id, competencia: f.competencia, link, canais: [] }; // o robô mandou no meio
    }
    const base = { origem: 'manual', acao: 'fatura', fatura_id: f.id, assinatura_id: a.id };
    const canais = await enviarAoCliente(deps, a, f, mensagemPara(deps, a, f, 'fatura', link, hoje), ROTULO_TOQUE.fatura, base);
    if (canais.length) await deps.registrarCanal(f.id, canais.join('+'));
    else await deps.liberarAviso(f.id, 'fatura'); // o robô tenta de novo
    deps.log({ evento: 'aviso_enviado', ...base, canais });
    return { ok: true, faturaId: f.id, competencia: f.competencia, link, canais };
  } catch (e) {
    deps.log({ evento: 'erro_manual', acao: 'gerar', assinatura_id: a.id, erro: msg(e) });
    return { ok: false, erro: msg(e) };
  }
}

/** "Reenviar link": manda de novo (pedido do Junior), com o texto do dia. */
export async function reenviarFatura(deps: MotorDeps, a: AssinaturaMotor, f: FaturaRow, hoje: string): Promise<ResultadoManual> {
  if (f.status !== 'aberta') return { ok: false, erro: 'Esta fatura não está em aberto.' };
  try {
    const link = await deps.garantirLink(f, a);
    const falta = diasEntre(hoje, f.venceEm);
    const acao: AcaoFatura = falta > 1 ? 'fatura' : falta >= 0 ? 'vespera' : 'venceu';
    // A reserva só vale pro 1º envio (se o robô ainda não tinha mandado a fatura, não manda de novo).
    const primeiraVez = !f.avisoFaturaEm && await deps.reservarAviso(f.id, 'fatura');
    const base = { origem: 'manual', acao, fatura_id: f.id, assinatura_id: a.id };
    const canais = await enviarAoCliente(deps, a, f, mensagemPara(deps, a, f, acao, link, hoje), ROTULO_TOQUE[acao], base);
    if (canais.length) await deps.registrarCanal(f.id, canais.join('+'));
    else if (primeiraVez) await deps.liberarAviso(f.id, 'fatura');
    deps.log({ evento: 'aviso_enviado', ...base, canais });
    if (!canais.length) return { ok: false, erro: 'Nenhum canal funcionou (WhatsApp/e-mail). Copie o link e mande na mão.' };
    return { ok: true, faturaId: f.id, competencia: f.competencia, link, canais };
  } catch (e) {
    deps.log({ evento: 'erro_manual', acao: 'reenviar', fatura_id: f.id, assinatura_id: a.id, erro: msg(e) });
    return { ok: false, erro: msg(e) };
  }
}
