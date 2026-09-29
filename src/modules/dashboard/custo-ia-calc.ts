// src/modules/dashboard/custo-ia-calc.ts
// Contas da tela "Custo de IA" (só a casa). Puro: recebe as linhas de
// custos_ia_uso + empresas + mensalidades + leads atendidos e devolve o painel.
//  - mês atual × anterior, no horário de Brasília;
//  - por empresa e por uso (origem padronizada; nomes antigos traduzidos);
//  - custo por lead atendido e por resposta da assistente;
//  - tenant: mensalidade × custo de IA → margem, com alerta em X% (padrão 40).
import { custoCentavosExato, usoDaOrigem, type TipoUsoIa } from '../custos/ia-metering.js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';

export interface LinhaUsoIa {
  created_at: string;
  company_id: string | null;
  origem: string | null;
  modelo: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  custo_cents: number | null;
}

export interface Totais {
  chamadas: number;
  centavos: number; // com fração (soma exata)
  tokensEntrada: number; // entrada cheia + cache lido + cache escrito
  tokensSaida: number;
}

export interface UsoResumo {
  chave: string;
  rotulo: string;
  tipo: TipoUsoIa;
  atual: Totais;
  anterior: Totais;
}

export interface EmpresaCustoIa {
  companyId: string;
  nome: string;
  ehCasa: boolean;
  atual: Totais;
  anterior: Totais;
  porUso: UsoResumo[];
  /** Respostas da assistente no mês (chamadas de conversa:lead). */
  respostas: number;
  leadsAtendidos: number;
  custoPorLeadCents: number | null;
  custoPorRespostaCents: number | null;
  mensalidadeCents: number | null;
  margemCents: number | null;
  pctDaMensalidade: number | null;
  projecaoCents: number;
  pctProjecao: number | null;
  alerta: boolean;
}

export interface PainelCustoIa {
  mesAtual: string; // "setembro de 2026"
  mesAnterior: string;
  alertaPct: number;
  total: { atual: Totais; anterior: Totais };
  porEmpresa: EmpresaCustoIa[];
  porUso: UsoResumo[];
  semEmpresa: { chamadas: number; centavos: number };
  /** % da entrada da conversa que veio do cache (quanto maior, mais barato). */
  cacheConversaPct: number | null;
}

const BRT_MS = 3 * 3600_000; // Brasília = UTC-3 (sem horário de verão)

/** Início (UTC ISO) do mês atual e do anterior no horário de Brasília. */
export function janelaMeses(agora: Date): {
  inicioAtual: string; inicioAnterior: string; diasDecorridos: number; diasNoMes: number; ano: number; mes: number;
} {
  const brt = new Date(agora.getTime() - BRT_MS);
  const ano = brt.getUTCFullYear();
  const mes = brt.getUTCMonth(); // 0-11
  const inicioAtual = new Date(Date.UTC(ano, mes, 1) + BRT_MS);
  const inicioAnterior = new Date(Date.UTC(ano, mes - 1, 1) + BRT_MS);
  const diasNoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return {
    inicioAtual: inicioAtual.toISOString(),
    inicioAnterior: inicioAnterior.toISOString(),
    diasDecorridos: brt.getUTCDate(),
    diasNoMes,
    ano, mes,
  };
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = (ano: number, mes: number) => {
  const d = new Date(Date.UTC(ano, mes, 1));
  return `${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
};

const zero = (): Totais => ({ chamadas: 0, centavos: 0, tokensEntrada: 0, tokensSaida: 0 });
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

/** Custo da linha: o gravado (já conta cache de 1 hora a 2×); se gravou 0
 *  (chamada pequena arredondada), recalcula pelos tokens, com fração. */
function centavosDaLinha(l: LinhaUsoIa): number {
  const gravado = n(l.custo_cents);
  if (gravado > 0) return gravado;
  return custoCentavosExato(l.modelo ?? '', {
    input_tokens: n(l.input_tokens), output_tokens: n(l.output_tokens),
    cache_read_input_tokens: n(l.cache_read_tokens), cache_creation_input_tokens: n(l.cache_write_tokens),
  });
}

function somar(t: Totais, l: LinhaUsoIa, c: number): void {
  t.chamadas += 1;
  t.centavos += c;
  t.tokensEntrada += n(l.input_tokens) + n(l.cache_read_tokens) + n(l.cache_write_tokens);
  t.tokensSaida += n(l.output_tokens);
}

const pct = (parte: number, todo: number | null) => (todo && todo > 0 ? (parte / todo) * 100 : null);

export function montarPainelCustoIa(input: {
  linhas: LinhaUsoIa[];
  empresas: Array<{ id: string; nome: string }>;
  mensalidades: Map<string, number>;
  atendidos: Array<{ company_id: string | null; lead_id: string | null; created_at: string }>;
  agora: Date;
  alertaPct?: number;
}): PainelCustoIa {
  const j = janelaMeses(input.agora);
  const alertaPct = Math.max(1, Math.min(100, Math.round(input.alertaPct ?? 40)));
  const tIniAtual = Date.parse(j.inicioAtual);
  const tIniAnt = Date.parse(j.inicioAnterior);
  const periodo = (iso: string): 'atual' | 'anterior' | null => {
    const t = Date.parse(iso);
    if (!Number.isFinite(t) || t < tIniAnt) return null;
    return t >= tIniAtual ? 'atual' : 'anterior';
  };
  const dono = (id: string | null) => (id ? id.toLowerCase() : ECOSUN_COMPANY_ID);
  const nomes = new Map(input.empresas.map((e) => [e.id.toLowerCase(), e.nome]));

  const total = { atual: zero(), anterior: zero() };
  const semEmpresa = { chamadas: 0, centavos: 0 };
  const usoGeral = new Map<string, UsoResumo>();
  const porEmp = new Map<string, { atual: Totais; anterior: Totais; usos: Map<string, UsoResumo>; respostas: number }>();
  let cacheLido = 0; let entradaConversa = 0;

  const usoEm = (mapa: Map<string, UsoResumo>, u: ReturnType<typeof usoDaOrigem>) => {
    let r = mapa.get(u.chave);
    if (!r) { r = { chave: u.chave, rotulo: u.rotulo, tipo: u.tipo, atual: zero(), anterior: zero() }; mapa.set(u.chave, r); }
    return r;
  };

  for (const l of input.linhas) {
    const per = periodo(l.created_at);
    if (!per) continue;
    const c = centavosDaLinha(l);
    const u = usoDaOrigem(l.origem);
    const id = dono(l.company_id);
    let e = porEmp.get(id);
    if (!e) { e = { atual: zero(), anterior: zero(), usos: new Map(), respostas: 0 }; porEmp.set(id, e); }
    somar(total[per], l, c);
    somar(e[per], l, c);
    somar(usoEm(usoGeral, u)[per], l, c);
    somar(usoEm(e.usos, u)[per], l, c);
    if (per === 'atual') {
      if (u.semEmpresa) { semEmpresa.chamadas += 1; semEmpresa.centavos += c; }
      if (u.chave === 'conversa:lead') {
        e.respostas += 1;
        cacheLido += n(l.cache_read_tokens);
        entradaConversa += n(l.input_tokens) + n(l.cache_read_tokens) + n(l.cache_write_tokens);
      }
    }
  }

  // Leads distintos que a assistente atendeu no mês atual, por empresa.
  const leads = new Map<string, Set<string>>();
  for (const a of input.atendidos) {
    if (periodo(a.created_at) !== 'atual' || !a.lead_id) continue;
    const id = dono(a.company_id);
    if (!leads.has(id)) leads.set(id, new Set());
    leads.get(id)!.add(a.lead_id);
  }

  // Toda empresa com custo aparece; tenant com mensalidade aparece mesmo sem custo.
  const ids = new Set<string>([...porEmp.keys(), ...[...input.mensalidades.keys()].map((k) => k.toLowerCase())]);
  const ordenaUso = (a: UsoResumo, b: UsoResumo) => b.atual.centavos - a.atual.centavos || b.anterior.centavos - a.anterior.centavos;

  const porEmpresa: EmpresaCustoIa[] = [...ids].map((id) => {
    const e = porEmp.get(id) ?? { atual: zero(), anterior: zero(), usos: new Map<string, UsoResumo>(), respostas: 0 };
    const ehCasa = id === ECOSUN_COMPANY_ID;
    const mensal = ehCasa ? null : (input.mensalidades.get(id) ?? null);
    const projecaoCents = Math.round((e.atual.centavos / Math.max(1, j.diasDecorridos)) * j.diasNoMes);
    const pctAtual = pct(e.atual.centavos, mensal);
    const pctProj = pct(projecaoCents, mensal);
    const qtdLeads = leads.get(id)?.size ?? 0;
    return {
      companyId: id,
      nome: nomes.get(id) ?? (ehCasa ? 'EcoSunPower' : `Empresa ${id.slice(0, 8)}`),
      ehCasa,
      atual: e.atual,
      anterior: e.anterior,
      porUso: [...e.usos.values()].sort(ordenaUso),
      respostas: e.respostas,
      leadsAtendidos: qtdLeads,
      custoPorLeadCents: qtdLeads > 0 ? Math.round(e.atual.centavos / qtdLeads) : null,
      custoPorRespostaCents: e.respostas > 0 ? Math.round(e.atual.centavos / e.respostas) : null,
      mensalidadeCents: mensal,
      margemCents: mensal !== null ? Math.round(mensal - e.atual.centavos) : null,
      pctDaMensalidade: pctAtual,
      projecaoCents,
      pctProjecao: pctProj,
      alerta: mensal !== null && Math.max(pctAtual ?? 0, pctProj ?? 0) >= alertaPct,
    };
  }).sort((a, b) => b.atual.centavos - a.atual.centavos || b.anterior.centavos - a.anterior.centavos);

  return {
    mesAtual: nomeMes(j.ano, j.mes),
    mesAnterior: nomeMes(j.ano, j.mes - 1),
    alertaPct,
    total,
    porEmpresa,
    porUso: [...usoGeral.values()].sort(ordenaUso),
    semEmpresa,
    cacheConversaPct: entradaConversa > 0 ? Math.round((cacheLido / entradaConversa) * 100) : null,
  };
}
