// src/modules/dashboard/central-atencao-fontes.ts
// Adaptadores PUROS da Central de Atenção: cada fonte que já existe no sistema
// vira EventoAtencao. Reusa as regras de cada módulo (não reinventa):
//   - usinas: estado calculado com classificarSistema (command-center-calc.ts);
//   - leads esperando: critério do Cockpit (CRITERIO_LEAD_ESPERANDO);
//   - SLA: tarefas de lead_tarefas vencidas (sla-rules / sla-notifier);
//   - créditos GD: tipoAvisoVencimento (a mesma regra da tela e do PDF);
//   - manutenção: statusAgendaItem (manutencao-motor);
//   - contas a pagar: alertasDoDia (financeiro/alertas-vencimento).
// Nenhum número inventado: sem kWp ou sem tarifa, sem R$.

import type { EventoAtencao } from './central-atencao.js';
import type { UsinaResumo } from './command-center-calc.js';
import { statusAgendaItem } from './manutencao-motor.js';
import { alertasDoDia, type ContaAberta } from '../financeiro/alertas-vencimento.js';
import { tipoAvisoVencimento } from '../gd/demonstrativos-tela.js';
import { mesCurto } from '../gd/demonstrativo-cruzamento.js';

const brl0 = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const brl2 = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const kwhFmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function diasDesde(iso: string | null | undefined, agoraMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((agoraMs - t) / 86_400_000));
}

function listaNomes(nomes: string[], max = 3): string {
  if (nomes.length <= 1) return nomes.join('');
  if (nomes.length <= max) return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
  return `${nomes.slice(0, max).join(', ')} e mais ${nomes.length - max}`;
}

function maisAntigoIso(isos: Array<string | null | undefined>): string | null {
  let melhor: { t: number; iso: string } | null = null;
  for (const iso of isos) {
    if (!iso) continue;
    const t = Date.parse(iso);
    if (Number.isFinite(t) && (!melhor || t < melhor.t)) melhor = { t, iso };
  }
  return melhor?.iso ?? null;
}

// ---------------------------------------------------------------------------
// Usinas
// ---------------------------------------------------------------------------

export function eventosDeUsinas(
  usinas: readonly UsinaResumo[],
  o: { tarifaRsKwh: (u: UsinaResumo) => number | null },
): EventoAtencao[] {
  const out: EventoAtencao[] = [];
  for (const u of usinas) {
    if (u.estado !== 'critico' && u.estado !== 'atencao') continue;
    const tarifa = o.tarifaRsKwh(u);
    const perdaKwhDia = u.esperadoDiaKwh !== null ? Math.max(0, u.esperadoDiaKwh - u.real7Kwh / 7) : null;
    const impacto = perdaKwhDia !== null && tarifa !== null && tarifa > 0 ? Math.round(perdaKwhDia * tarifa) : null;
    const critico = u.estado === 'critico';
    out.push({
      id: `usina:${u.id}`,
      severidade: critico ? 'critico' : 'atencao',
      area: 'usinas',
      titulo: critico ? `${u.apelido} está sem gerar` : `${u.apelido} gerando abaixo do esperado`,
      contexto: `Usinas${u.cidade ? ` · ${u.cidade}` : ''}`,
      detalhe: u.alertaTexto ?? undefined,
      impactoRs: impacto,
      impactoTexto: impacto !== null ? `Perda estimada ${brl0(impacto)}/dia` : undefined,
      acao: { rotulo: critico ? 'Abrir usina' : 'Ver usina', href: `/dashboard/monitoramento/${encodeURIComponent(u.id)}` },
      desde: null,
    });
  }

  const semSinal = usinas.filter((u) => u.estado === 'sem_comunicacao');
  if (semSinal.length) {
    const uma = semSinal.length === 1 ? semSinal[0] : null;
    out.push({
      id: 'usinas:sem-comunicacao',
      severidade: 'atencao',
      area: 'usinas',
      titulo: uma ? `${uma.apelido} sem comunicação` : `${semSinal.length} usinas sem comunicação`,
      contexto: 'Usinas · monitoramento',
      detalhe: uma ? (uma.alertaTexto ?? undefined) : listaNomes(semSinal.map((u) => u.apelido)),
      // Sem dado de geração não há como dizer quanto se perde.
      impactoRs: null,
      acao: uma
        ? { rotulo: 'Abrir usina', href: `/dashboard/monitoramento/${encodeURIComponent(uma.id)}` }
        : { rotulo: 'Ver usinas', href: '/dashboard/monitoramento' },
      desde: maisAntigoIso(semSinal.map((u) => u.ultimaSincronizacao)),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Comercial
// ---------------------------------------------------------------------------

export interface ContagemComMaisAntigo { total: number; maisAntigo: string | null }

/** Leads parados há mais de 24 h (mesmo critério do Cockpit). */
export function eventosDeLeadsEsperando(c: ContagemComMaisAntigo | null, agoraMs: number): EventoAtencao[] {
  if (!c || c.total <= 0) return [];
  const dias = diasDesde(c.maisAntigo, agoraMs);
  return [{
    id: 'leads:esperando-24h',
    severidade: 'atencao',
    area: 'comercial',
    titulo: `${plural(c.total, 'lead esperando', 'leads esperando')} resposta há mais de 24 h`,
    contexto: 'Comercial · atendimento',
    detalhe: dias !== null && dias >= 1 ? `O mais antigo está parado há ${plural(dias, 'dia', 'dias')}` : undefined,
    acao: { rotulo: 'Ver leads', href: '/dashboard/leads' },
    desde: c.maisAntigo,
  }];
}

/** Tarefas de SLA (lead_tarefas) pendentes com o prazo já passado. */
export function eventosDeSlaVencido(c: ContagemComMaisAntigo | null, agoraMs: number): EventoAtencao[] {
  if (!c || c.total <= 0) return [];
  const dias = diasDesde(c.maisAntigo, agoraMs);
  return [{
    id: 'leads:sla-vencido',
    severidade: 'critico',
    area: 'comercial',
    titulo: `${plural(c.total, 'tarefa', 'tarefas')} de lead com prazo vencido`,
    contexto: 'Comercial · prazos do funil',
    detalhe: dias !== null && dias >= 1 ? `A mais atrasada venceu há ${plural(dias, 'dia', 'dias')}` : undefined,
    acao: { rotulo: 'Abrir funil', href: '/dashboard/leads/kanban' },
    desde: c.maisAntigo,
  }];
}

export const HORAS_PROPOSTA_PARADA = 72;

export interface PropostaParaAtencao {
  id: string;
  created_at: string;
  sent_to_client_at: string | null;
  ultimo_acesso_at: string | null;
  cliente_respondeu_at: string | null;
  revoked: boolean;
  expires_at: string | null;
  valorTotal: number | null;
  /** O lead já fechou (contrato) ou foi perdido — proposta não está mais "parada". */
  leadEncerrado: boolean;
}

/** Última interação = a mais recente entre criar, enviar e o cliente abrir o link. */
function ultimaInteracao(p: PropostaParaAtencao): number {
  return Math.max(...[p.created_at, p.sent_to_client_at, p.ultimo_acesso_at]
    .map((x) => (x ? Date.parse(x) : NaN)).filter(Number.isFinite), Number.NEGATIVE_INFINITY);
}

export function eventosDePropostas(rows: readonly PropostaParaAtencao[], agoraMs: number, horas = HORAS_PROPOSTA_PARADA): EventoAtencao[] {
  const limite = agoraMs - horas * 3_600_000;
  const paradas = rows.filter((p) => {
    if (p.revoked || p.cliente_respondeu_at || p.leadEncerrado) return false;
    if (p.expires_at && Date.parse(p.expires_at) <= agoraMs) return false;
    const u = ultimaInteracao(p);
    return Number.isFinite(u) && u < limite;
  });
  if (paradas.length === 0) return [];
  const emJogo = paradas.reduce((s, p) => s + (typeof p.valorTotal === 'number' && Number.isFinite(p.valorTotal) ? p.valorTotal : 0), 0);
  const maisAntiga = maisAntigoIso(paradas.map((p) => new Date(ultimaInteracao(p)).toISOString()));
  const dias = diasDesde(maisAntiga, agoraMs);
  return [{
    id: 'propostas:paradas-72h',
    severidade: 'atencao',
    area: 'comercial',
    titulo: `${plural(paradas.length, 'proposta parada', 'propostas paradas')} há mais de ${horas} h`,
    contexto: 'Comercial · follow-up',
    detalhe: `Sem resposta do cliente${dias !== null ? ` · a mais antiga há ${plural(dias, 'dia', 'dias')}` : ''}`,
    // Valor em jogo é oportunidade, não perda por dia: vai no texto, fora da ordenação.
    impactoRs: null,
    impactoTexto: emJogo > 0 ? `${brl0(emJogo)} em jogo` : undefined,
    acao: { rotulo: 'Ver propostas', href: '/dashboard/propostas' },
    desde: maisAntiga,
  }];
}

// ---------------------------------------------------------------------------
// Clientes — créditos GD a vencer
// ---------------------------------------------------------------------------

export interface CreditoGdParaAtencao {
  instalacao: string;
  clienteNome: string;
  proximoExpirarKwh: number | null;
  cicloExpirar: string | null;
}

export function eventosDeCreditosGd(itens: readonly CreditoGdParaAtencao[], hojeIso: string): EventoAtencao[] {
  const aVencer = itens.filter((i) => tipoAvisoVencimento(i.proximoExpirarKwh, i.cicloExpirar, hojeIso) === 'alerta');
  if (aVencer.length === 0) return [];
  const primeiro = [...aVencer].sort((a, b) => String(a.cicloExpirar).localeCompare(String(b.cicloExpirar)))[0];
  if (aVencer.length === 1) {
    const i = aVencer[0];
    return [{
      id: `gd:${i.instalacao}`,
      severidade: 'acompanhar',
      area: 'clientes',
      titulo: `${i.clienteNome}: ${kwhFmt(i.proximoExpirarKwh as number)} kWh de crédito vencem em ${mesCurto(i.cicloExpirar as string)}`,
      contexto: 'Clientes · demonstrativos GD',
      detalhe: 'Avise o cliente para usar o crédito antes de vencer',
      acao: { rotulo: 'Ver demonstrativo', href: `/dashboard/demonstrativos/${encodeURIComponent(i.instalacao)}` },
    }];
  }
  const total = aVencer.reduce((s, i) => s + (i.proximoExpirarKwh as number), 0);
  return [{
    id: 'gd:creditos-a-vencer',
    severidade: 'acompanhar',
    area: 'clientes',
    titulo: `Créditos GD de ${aVencer.length} clientes vencem nos próximos 6 meses`,
    contexto: 'Clientes · demonstrativos GD',
    detalhe: `${kwhFmt(total)} kWh no total · o primeiro vence em ${mesCurto(primeiro.cicloExpirar as string)}`,
    acao: { rotulo: 'Ver clientes', href: '/dashboard/demonstrativos' },
  }];
}

// ---------------------------------------------------------------------------
// O&M — manutenção vencida
// ---------------------------------------------------------------------------

export function eventosDeManutencao(itens: ReadonlyArray<{ data_agendada: string | null }>, hojeIso: string): EventoAtencao[] {
  // statusAgendaItem compara em UTC: meio-dia do dia de Brasília nunca pula de data.
  const hoje = new Date(`${hojeIso}T12:00:00Z`);
  const vencidas = itens.filter((i) => statusAgendaItem(i.data_agendada, hoje) === 'vencida');
  if (vencidas.length === 0) return [];
  const antiga = vencidas.map((v) => v.data_agendada as string).sort()[0];
  return [{
    id: 'manutencao:vencidas',
    severidade: 'atencao',
    area: 'om',
    titulo: `${plural(vencidas.length, 'manutenção vencida', 'manutenções vencidas')}`,
    contexto: 'O&M · agenda de manutenção',
    detalhe: `A mais antiga era para ${dataBr(antiga)}`,
    acao: { rotulo: 'Ver agenda', href: '/dashboard/manutencao' },
    desde: `${antiga}T12:00:00Z`,
  }];
}

// ---------------------------------------------------------------------------
// Financeiro — contas a pagar
// ---------------------------------------------------------------------------

export function eventosDeContas(contas: readonly ContaAberta[], hojeIso: string): EventoAtencao[] {
  // alertasDoDia pula o que já foi lembrado HOJE no WhatsApp — a tela mostra sempre.
  const semLembrete = contas.map((c) => ({ ...c, lembretes: [] }));
  const porId = new Map(contas.map((c) => [c.id, c]));
  return alertasDoDia(semLembrete, hojeIso).map((a) => {
    const c = porId.get(a.contaId) as ContaAberta;
    const titulo = a.tipo === 'atraso'
      ? `${c.descricao} atrasada há ${plural(a.dias, 'dia', 'dias')}`
      : a.tipo === 'hoje' ? `${c.descricao} vence hoje` : `${c.descricao} vence em 3 dias`;
    const valor = Number.isFinite(c.valor) ? c.valor : null;
    return {
      id: `conta:${a.contaId}`,
      severidade: a.tipo === 'atraso' ? 'critico' : a.tipo === 'hoje' ? 'atencao' : 'acompanhar',
      area: 'financeiro',
      titulo,
      contexto: `Financeiro · contas a pagar (${c.mundo})`,
      detalhe: `Vencimento ${dataBr(c.vencimento)}`,
      impactoRs: valor,
      impactoTexto: valor !== null ? brl2(valor) : undefined,
      acao: { rotulo: 'Pagar', href: '/dashboard/financeiro' },
      desde: `${c.vencimento}T12:00:00Z`,
    } satisfies EventoAtencao;
  });
}
