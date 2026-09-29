// src/modules/cobranca-recorrente/motor.ts
// O robô da cobrança recorrente + as ações manuais da tela (28/09/2026).
// Tudo com dependências injetadas (testável sem rede/banco — ver
// tests/cobranca-recorrente-motor.test.ts); quem liga no mundo real é
// servico.ts.
//
// Ordem de cada aviso ao cliente:
//   1. garante o link (InfinitePay) — se recusar, NÃO gasta o aviso;
//   2. RESERVA o aviso na fatura (só um processo ganha) — nunca sai 2x;
//   3. WhatsApp pelo MODELO aprovado + e-mail; sem WhatsApp → Junior encaminha;
//   4. nenhum canal funcionou → solta a reserva (tenta amanhã) e conta erro.
// No fim da rodada, qualquer erro vira UM aviso pro Junior.

import {
  competenciasDevidas, proximaCompetenciaManual, acaoDaFatura, diasEntre,
  type AcaoFatura, type StatusAssinatura,
} from './ciclo.js';
import {
  MODELO_COBRANCA, paramsModeloCobranca, emailCobranca, avisoJuniorEncaminhar, avisoJuniorAtraso,
  type DadosFatura,
} from './mensagens.js';
import type { FaturaRow, NovaFatura, TipoAviso } from './faturas-repo.js';

export interface AssinaturaMotor {
  id: string;
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

export interface MotorDeps extends CanaisDeps {
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
  erros: string[];
}

type AcaoCliente = Exclude<AcaoFatura, 'atraso_junior'>;
export type Canal = 'whatsapp' | 'email' | 'junior';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function dados(a: AssinaturaMotor, f: FaturaRow, link: string | null): DadosFatura {
  return { nome: a.nome, descricao: f.descricao, competencia: f.competencia, venceEm: f.venceEm, valorCentavos: f.valorCentavos, link };
}

/**
 * Manda UM aviso ao cliente pelos canais disponíveis. Devolve os canais que
 * funcionaram ([] = nada saiu). Não mexe em reserva — quem chama decide.
 */
export async function enviarAvisoCliente(
  deps: CanaisDeps,
  a: AssinaturaMotor,
  f: FaturaRow,
  acao: AcaoCliente,
  link: string,
): Promise<Canal[]> {
  const canais: Canal[] = [];
  const d = dados(a, f, link);
  const base = { fatura_id: f.id, assinatura_id: a.id, acao };

  const aprovado = a.telefone ? await deps.modeloAprovado(MODELO_COBRANCA).catch(() => false) : false;
  if (a.telefone && aprovado) {
    try {
      await deps.enviarModelo(a.telefone, MODELO_COBRANCA, paramsModeloCobranca(d));
      canais.push('whatsapp');
    } catch (e) {
      deps.log({ evento: 'erro_envio', canal: 'whatsapp', ...base, erro: msg(e) });
    }
  }

  let emailEnviado = false;
  if (a.email) {
    try {
      const em = emailCobranca(acao, d);
      await deps.enviarEmail(a.email, em.assunto, em.html, em.ctaUrl);
      canais.push('email');
      emailEnviado = true;
    } catch (e) {
      deps.log({ evento: 'erro_envio', canal: 'email', ...base, erro: msg(e) });
    }
  }

  // Sem WhatsApp pro cliente: o Junior encaminha do celular dele — a não ser
  // que o cliente nem tenha WhatsApp e o e-mail já tenha chegado.
  const precisaJunior = !canais.includes('whatsapp') && (a.telefone !== null || !emailEnviado);
  if (precisaJunior) {
    const motivo = !a.telefone ? 'sem_whatsapp' as const : aprovado ? 'zap_falhou' as const : 'modelo_pendente' as const;
    try {
      await deps.avisarJunior(avisoJuniorEncaminhar({ ...d, telefone: a.telefone, email: a.email, emailEnviado, motivo, acao }));
      canais.push('junior');
    } catch (e) {
      deps.log({ evento: 'erro_envio', canal: 'junior', ...base, erro: msg(e) });
    }
  }
  return canais;
}

/** Aviso do robô: link → reserva → envia → (nada saiu? solta a reserva). */
async function avisarNaRegua(deps: MotorDeps, a: AssinaturaMotor, f: FaturaRow, acao: AcaoCliente): Promise<boolean> {
  const link = f.linkUrl ?? await deps.garantirLink(f, a);
  if (!(await deps.reservarAviso(f.id, acao))) return false; // outro processo já mandou
  const canais = await enviarAvisoCliente(deps, a, f, acao, link);
  if (canais.length === 0) {
    await deps.liberarAviso(f.id, acao);
    throw new Error(`nenhum canal funcionou (${acao} de ${f.competencia.slice(0, 7)})`);
  }
  await deps.registrarCanal(f.id, canais.join('+'));
  deps.log({ evento: 'aviso_enviado', acao, fatura_id: f.id, assinatura_id: a.id, canais });
  return true;
}

// ---------------------------------------------------------------------------
// Rodada diária
// ---------------------------------------------------------------------------

export async function rodarCobrancaRecorrente(deps: MotorDeps, hoje: string): Promise<ResumoRodada> {
  const r: ResumoRodada = { criadas: 0, avisos: 0, atrasos: 0, erros: [] };
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
        const acao = acaoDaFatura(f, hoje);
        if (!acao) continue;
        try {
          if (acao === 'atraso_junior') {
            if (!(await deps.reservarAviso(f.id, acao))) continue;
            try {
              await deps.avisarJunior(avisoJuniorAtraso({ ...dados(a, f, f.linkUrl), dias: diasEntre(f.venceEm, hoje), assinaturaId: a.id }));
            } catch (e) {
              await deps.liberarAviso(f.id, acao);
              throw e;
            }
            r.atrasos++;
            deps.log({ evento: 'atraso_avisado', fatura_id: f.id, assinatura_id: a.id, dias: diasEntre(f.venceEm, hoje) });
            continue;
          }
          if (await avisarNaRegua(deps, a, f, acao)) r.avisos++;
        } catch (e) {
          r.erros.push(`${a.nome} (${f.competencia.slice(0, 7)}): ${msg(e)}`);
          deps.log({ evento: 'erro_fatura', fatura_id: f.id, assinatura_id: a.id, acao, erro: msg(e) });
        }
      }
    } catch (e) {
      r.erros.push(`${a.nome}: ${msg(e)}`);
      deps.log({ evento: 'erro_assinatura', assinatura_id: a.id, erro: msg(e) });
    }
  }

  deps.log({ evento: 'rodada_fim', hoje, criadas: r.criadas, avisos: r.avisos, atrasos: r.atrasos, erros: r.erros.length });
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
    await deps.reservarAviso(f.id, 'fatura');
    const canais = await enviarAvisoCliente(deps, a, f, 'fatura', link);
    if (canais.length) await deps.registrarCanal(f.id, canais.join('+'));
    deps.log({ evento: 'aviso_enviado', origem: 'manual', acao: 'fatura', fatura_id: f.id, assinatura_id: a.id, canais });
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
    const acao: AcaoCliente = falta > 0 ? 'fatura' : falta === 0 ? 'lembrete_d0' : 'lembrete_d3';
    await deps.reservarAviso(f.id, 'fatura'); // se era a 1ª vez, o robô não repete
    const canais = await enviarAvisoCliente(deps, a, f, acao, link);
    if (canais.length) await deps.registrarCanal(f.id, canais.join('+'));
    deps.log({ evento: 'aviso_enviado', origem: 'manual', acao, fatura_id: f.id, assinatura_id: a.id, canais });
    if (!canais.length) return { ok: false, erro: 'Nenhum canal funcionou (WhatsApp/e-mail). Copie o link e mande na mão.' };
    return { ok: true, faturaId: f.id, competencia: f.competencia, link, canais };
  } catch (e) {
    deps.log({ evento: 'erro_manual', acao: 'reenviar', fatura_id: f.id, assinatura_id: a.id, erro: msg(e) });
    return { ok: false, erro: msg(e) };
  }
}
