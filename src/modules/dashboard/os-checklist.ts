// src/modules/dashboard/os-checklist.ts
// Templates de checklist da OS por tipo (item 3-em-1: check/foto/medição) +
// hidratação do estado salvo, progresso e resumo. PURO — testável.

export type OSTipo = 'limpeza' | 'revisao_inversor' | 'revisao_eletrica' | 'corretiva' | 'inspecao';
export type ItemKind = 'check' | 'foto' | 'medicao';
export interface ItemChecklist { chave: string; label: string; kind: ItemKind; unidade?: string }
export interface ItemPreenchido extends ItemChecklist { valor: boolean | string | null; fotos: number }

const C = (chave: string, label: string): ItemChecklist => ({ chave, label, kind: 'check' });
const F = (chave: string, label: string): ItemChecklist => ({ chave, label, kind: 'foto' });
const M = (chave: string, label: string, unidade: string): ItemChecklist => ({ chave, label, kind: 'medicao', unidade });

const TEMPLATES: Record<OSTipo, ItemChecklist[]> = {
  revisao_inversor: [
    C('erros_alarmes', 'Leitura de erros/alarmes'),
    C('ventilacao', 'Ventilação/temperatura'),
    C('teste_geracao', 'Teste de geração'),
    M('medicao_ca', 'Medição CA (tensão/corrente)', 'V/A'),
    M('medicao_cc', 'Medição CC (strings)', 'V/A'),
    F('termografia', 'Termografia (pontos quentes)'),
  ],
  revisao_eletrica: [
    C('verificacao_quadro', 'Verificação do quadro elétrico'),
    C('aperto_bornes', 'Aperto dos bornes do quadro geral'),
    C('aterramento', 'Aterramento'),
    C('cabeamento', 'Cabeamento/isolação'),
    F('foto_quadro', 'Foto do quadro elétrico geral'),
    F('termografia', 'Termografia do quadro/conexões'),
  ],
  limpeza: [
    C('inspecao_visual', 'Inspeção visual dos módulos'),
    C('limpeza_placas', 'Limpeza das placas'),
    C('estruturas', 'Estado das estruturas'),
    F('fotos_modulos', 'Fotos de todos os módulos (antes/depois)'),
    M('geracao_antes_depois', 'Geração antes/depois', 'kWh'),
  ],
  corretiva: [
    C('diagnostico', 'Diagnóstico'),
    C('peca_trocada', 'Peça trocada'),
    C('teste_pos', 'Teste pós-conserto'),
    F('foto_conserto', 'Foto do problema/conserto'),
  ],
  inspecao: [
    C('visual_geral', 'Visual geral'),
    C('pendencias', 'Pendências encontradas'),
    F('fotos_modulos', 'Fotos dos módulos'),
    F('termografia', 'Termografia'),
    M('geracao', 'Geração', 'kWh'),
  ],
};

export function templateChecklist(tipo: OSTipo): ItemChecklist[] {
  return TEMPLATES[tipo] ?? [];
}

// Sobrepõe o estado salvo no template; foto vem com a contagem; sem valor salvo:
// check=false, medição/foto=null. Item novo do template sempre aparece.
export function hidratarChecklist(
  tipo: OSTipo,
  salvo: Record<string, boolean | string | null>,
  fotoCounts: Record<string, number>,
): ItemPreenchido[] {
  return templateChecklist(tipo).map((it) => ({
    ...it,
    valor: it.chave in salvo ? salvo[it.chave] : (it.kind === 'check' ? false : null),
    fotos: fotoCounts[it.chave] ?? 0,
  }));
}

function itemFeito(i: ItemPreenchido): boolean {
  if (i.kind === 'check') return i.valor === true;
  if (i.kind === 'foto') return i.fotos > 0;
  return typeof i.valor === 'string' && i.valor.trim().length > 0; // medicao
}

export function progressoOS(itens: ItemPreenchido[]): { feitos: number; total: number; pct: number } {
  const total = itens.length;
  const feitos = itens.filter(itemFeito).length;
  return { feitos, total, pct: total ? Math.round((feitos / total) * 100) : 0 };
}

export interface ResumoOS {
  checks: string[];
  medicoes: Array<{ chave: string; label: string; valor: string; unidade?: string }>;
  fotos: Array<{ chave: string; label: string; n: number }>;
}
export function resumoOS(itens: ItemPreenchido[]): ResumoOS {
  return {
    checks: itens.filter((i) => i.kind === 'check' && i.valor === true).map((i) => i.label),
    medicoes: itens.filter((i) => i.kind === 'medicao' && typeof i.valor === 'string' && i.valor.trim())
      .map((i) => ({ chave: i.chave, label: i.label, valor: String(i.valor), unidade: i.unidade })),
    fotos: itens.filter((i) => i.kind === 'foto' && i.fotos > 0).map((i) => ({ chave: i.chave, label: i.label, n: i.fotos })),
  };
}
