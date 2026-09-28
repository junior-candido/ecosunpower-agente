// src/modules/dashboard/atendimento-dados.ts
// Tela de Atendimento (Leads › Conversas, 28/09/2026) — funções PURAS que
// traduzem o que o banco guarda em inglês/JSON para PORTUGUÊS de gente.
// Regra do Junior: nada de JSON cru na tela. Chave conhecida → rótulo certo;
// chave nova (a assistente pode gravar outras) → rótulo "humanizado" a partir
// do nome; chave interna (datas de controle, fonte) → não aparece.
//
// Chaves de energy_data que o código grava hoje: monthly_bill, consumption_kwh,
// group, subgroup, contracted_demand_kw, tariff_type (Eva/dossier.ts),
// conta_faixa, tipo_imovel, fonte (formulário do anúncio — leadgen-form-respostas.ts),
// shared_coordinates/shared_maps_url (localização enviada), reengagement_sent_at.
// Colunas do lead (migration 033) têm prioridade: conta_media_brl, consumo_medio_kwh,
// concessionaria (ver dadosDoLead).
// Chaves de opportunities: solar, battery, bess, free_market, diesel_replacement,
// ev_charging (dossier.ts) + last_reactivation_sent_at (controle interno).

export interface ItemDado { rotulo: string; valor: string }

const fmtInt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const fmtDec = (n: number, casas = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
const fmtReais = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Número de verdade (aceita "780", "780,50", 780). null quando não é número. */
export function comoNumero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/^R\$\s*/i, '');
  if (!/^-?[\d.,]+$/.test(t)) return null;
  // "1.234,56" (pt-BR) ou "1234.56"
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

type Formatador = (v: unknown) => string | null;

const texto: Formatador = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (typeof v === 'number') return Number.isFinite(v) ? fmtDec(v) : null;
  if (typeof v === 'string') return v.trim() ? v.trim() : null;
  if (Array.isArray(v)) {
    const partes = v.map((x) => texto(x)).filter((x): x is string => !!x);
    return partes.length ? partes.join(', ') : null;
  }
  return null; // objeto aninhado: não vira texto cru (nada de JSON na tela)
};
const reais: Formatador = (v) => { const n = comoNumero(v); return n === null ? texto(v) : fmtReais(n); };
const kwhMes: Formatador = (v) => { const n = comoNumero(v); return n === null ? texto(v) : `${fmtInt(n)} kWh/mês`; };
const kw: Formatador = (v) => { const n = comoNumero(v); return n === null ? texto(v) : `${fmtDec(n)} kW`; };
const grupo: Formatador = (v) => { const t = texto(v); return t ? `Grupo ${t.replace(/^grupo\s*/i, '').toUpperCase()}` : null; };

const TIPO_IMOVEL: Record<string, string> = {
  residencial: 'Residencial', comercial: 'Comercial', rural: 'Rural', industrial: 'Industrial',
  condominio: 'Condomínio', empresa: 'Empresa',
};
const imovel: Formatador = (v) => { const t = texto(v); return t ? (TIPO_IMOVEL[t.toLowerCase()] ?? t) : null; };

/** energy_data: chave → [rótulo, formatador]. A ORDEM aqui é a ordem na tela. */
const ENERGIA: Array<[string, string, Formatador]> = [
  ['monthly_bill', 'Conta de luz', reais],
  ['conta_faixa', 'Faixa da conta', texto],
  ['consumption_kwh', 'Consumo', kwhMes],
  ['concessionaria', 'Concessionária', texto],
  ['distribuidora', 'Concessionária', texto],
  ['distributor', 'Concessionária', texto],
  ['tipo_imovel', 'Tipo de imóvel', imovel],
  ['group', 'Grupo tarifário', grupo],
  ['subgroup', 'Subgrupo', texto],
  ['tariff_type', 'Modalidade tarifária', texto],
  ['contracted_demand_kw', 'Demanda contratada', kw],
];
/** Chaves de controle que nunca aparecem (não é informação do cliente). */
const ENERGIA_OCULTAS = new Set([
  'fonte', 'source', 'updated_at', 'created_at', 'reengagement_sent_at',
  // Localização que o cliente mandou no zap: vira o mapa da Parte 3, não texto cru.
  'shared_coordinates', 'shared_maps_url',
]);

/** "consumo_ponta_kwh" → "Consumo ponta kwh" (chave nova que a assistente gravou). */
export function humanizarChave(chave: string): string {
  const t = chave.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : chave;
}

/** Dados de energia do lead em português, na ordem de leitura. Sem dado → lista vazia. */
export function dadosDeEnergia(energy: unknown): ItemDado[] {
  if (!energy || typeof energy !== 'object' || Array.isArray(energy)) return [];
  const ed = energy as Record<string, unknown>;
  const out: ItemDado[] = [];
  const usados = new Set<string>();
  const rotulosUsados = new Set<string>();
  for (const [chave, rotulo, fmt] of ENERGIA) {
    usados.add(chave);
    if (!(chave in ed) || rotulosUsados.has(rotulo)) continue;
    const valor = fmt(ed[chave]);
    if (valor) { out.push({ rotulo, valor }); rotulosUsados.add(rotulo); }
  }
  for (const [chave, v] of Object.entries(ed)) {
    if (usados.has(chave) || ENERGIA_OCULTAS.has(chave)) continue;
    const valor = texto(v);
    if (valor) out.push({ rotulo: humanizarChave(chave), valor });
  }
  return out;
}

/** opportunities: chave → interesse em português. */
const INTERESSES: Record<string, string> = {
  solar: 'Energia solar',
  battery: 'Bateria',
  bess: 'Bateria (armazenamento)',
  free_market: 'Mercado livre de energia',
  diesel_replacement: 'Trocar gerador a diesel',
  ev_charging: 'Carro elétrico / carregador',
  ar_condicionado: 'Ar-condicionado',
};
const INTERESSES_OCULTOS = /(^last_|_at$|_sent$|^fonte$)/;
const NEGATIVO = new Set(['false', 'nao', 'não', 'no', '0', '']);

/** Interesses do lead (chips). Só entra o que é "sim"/verdadeiro/"talvez"; nunca data de controle. */
export function interessesDoLead(opp: unknown): string[] {
  if (!opp || typeof opp !== 'object' || Array.isArray(opp)) return [];
  const out: string[] = [];
  for (const [chave, v] of Object.entries(opp as Record<string, unknown>)) {
    if (INTERESSES_OCULTOS.test(chave)) continue;
    if (v === null || v === undefined || v === false) continue;
    if (typeof v === 'string' && NEGATIVO.has(v.trim().toLowerCase())) continue;
    if (typeof v === 'object') continue;
    const rotulo = INTERESSES[chave] ?? humanizarChave(chave);
    const talvez = typeof v === 'string' && /talvez|futur/i.test(v);
    out.push(talvez ? `${rotulo} (talvez)` : rotulo);
  }
  return out;
}

/** Origem do lead em português (acquisition_source vem com nome técnico). */
export function rotuloOrigem(src: string | null | undefined): string | null {
  if (!src || !src.trim()) return null;
  const s = src.trim();
  const l = s.toLowerCase();
  if (l.includes('meta') || l.includes('facebook') || l.includes('instagram') || l.startsWith('campanha')) return 'Anúncio Meta';
  if (l.includes('google')) return 'Google';
  if (l.includes('indica')) return 'Indicação';
  if (l === 'manual_dashboard') return 'Cadastro manual';
  if (l.includes('site') || l.includes('calculadora')) return 'Site';
  if (l.includes('whatsapp') || l === 'organico' || l === 'orgânico') return 'WhatsApp direto';
  return /[_-]/.test(s) && s === l ? humanizarChave(s) : s;
}

/** Perfil (residencial/comercial…) em português. */
export function rotuloPerfil(p: string | null | undefined): string | null {
  if (!p || !p.trim()) return null;
  return TIPO_IMOVEL[p.trim().toLowerCase()] ?? p.trim();
}

/** Colunas do próprio lead (migration 033) que valem mais que o energy_data. */
export interface ColunasEnergiaLead {
  conta_media_brl?: unknown;
  consumo_medio_kwh?: unknown;
  concessionaria?: unknown;
  energy_data?: unknown;
}

/** Dados de energia do lead: colunas do cadastro primeiro, energy_data completa o que faltar. */
export function dadosDoLead(l: ColunasEnergiaLead): ItemDado[] {
  const doCadastro: ItemDado[] = [];
  const c = reais(l.conta_media_brl); if (c) doCadastro.push({ rotulo: 'Conta de luz', valor: c });
  const k = kwhMes(l.consumo_medio_kwh); if (k) doCadastro.push({ rotulo: 'Consumo', valor: k });
  const d = texto(l.concessionaria); if (d) doCadastro.push({ rotulo: 'Concessionária', valor: d });
  const jaTem = new Set(doCadastro.map((x) => x.rotulo));
  return [...doCadastro, ...dadosDeEnergia(l.energy_data).filter((x) => !jaTem.has(x.rotulo))];
}
