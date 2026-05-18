// src/modules/monitoring/garantia.ts
// S2 — Cronômetro de garantia/vida útil. Função PURA (testável isolada).
// Regra fixa EcoSunPower: 12 meses de garantia de mão de obra/instalação
// (memória project_garantia_ecosunpower). Equipamento segue fabricante.
// NUNCA inventa prazo: sem dado do equipamento -> "informar equipamento";
// marca fora da tabela -> "consultar fabricante".

export interface GarantiaInput {
  data_instalacao: string | null;
  marca_inversor: string | null;
  painel_marca: string | null;
}

export interface GarantiaResult {
  idadeTexto: string;
  ecosun:
    | { status: 'vigente'; mesesRestantes: number }
    | { status: 'encerrada'; mesesDesdeFim: number }
    | { status: 'indefinida' };
  fabricanteInversor: string;
  fabricantePainel: string;
}

const ECOSUN_GARANTIA_MESES = 12;

// Valores PADRÃO de referência (anos). Junior valida/ajusta. Marca ausente
// => "consultar fabricante" (não inventa). Só preenchidas marcas com prazo
// padrão amplamente documentado; demais ficam fora de propósito.
const GARANTIA_INVERSOR_ANOS: Record<string, number> = {
  solaredge: 12,
  deye: 5,
};
const GARANTIA_PAINEL_ANOS_PRODUTO: Record<string, number> = {
  // preenchível depois; vazio agora => "consultar fabricante"
};

function diffMeses(de: Date, ate: Date): number {
  return (ate.getFullYear() - de.getFullYear()) * 12 + (ate.getMonth() - de.getMonth())
    - (ate.getDate() < de.getDate() ? 1 : 0);
}

function idadeTextoDe(meses: number): string {
  if (meses < 1) return 'menos de 1 mês';
  const anos = Math.floor(meses / 12);
  const m = meses % 12;
  if (anos === 0) return `${m} ${m === 1 ? 'mês' : 'meses'}`;
  const aTxt = `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
  return m === 0 ? aTxt : `${aTxt} ${m} ${m === 1 ? 'mês' : 'meses'}`;
}

export function garantiaInfo(i: GarantiaInput, hoje: Date = new Date()): GarantiaResult {
  if (!i.data_instalacao) {
    return { idadeTexto: '—', ecosun: { status: 'indefinida' }, fabricanteInversor: 'informar equipamento', fabricantePainel: 'informar equipamento' };
  }
  const di = new Date(i.data_instalacao + 'T00:00:00Z');
  if (isNaN(di.getTime())) {
    return { idadeTexto: '—', ecosun: { status: 'indefinida' }, fabricanteInversor: 'informar equipamento', fabricantePainel: 'informar equipamento' };
  }

  const marca = (i.marca_inversor ?? '').trim().toLowerCase();
  const fabricanteInversor = !marca
    ? 'informar equipamento'
    : marca in GARANTIA_INVERSOR_ANOS
      ? `${GARANTIA_INVERSOR_ANOS[marca]} anos`
      : 'consultar fabricante';
  const painel = (i.painel_marca ?? '').trim();
  const fabricantePainel = !painel
    ? 'informar equipamento'
    : painel in GARANTIA_PAINEL_ANOS_PRODUTO
      ? `${GARANTIA_PAINEL_ANOS_PRODUTO[painel]} anos`
      : 'consultar fabricante';

  const mesesIdade = Math.max(0, diffMeses(di, hoje));
  const ecosun = mesesIdade <= ECOSUN_GARANTIA_MESES
    ? { status: 'vigente' as const, mesesRestantes: Math.max(0, ECOSUN_GARANTIA_MESES - mesesIdade) }
    : { status: 'encerrada' as const, mesesDesdeFim: mesesIdade - ECOSUN_GARANTIA_MESES };

  return { idadeTexto: idadeTextoDe(mesesIdade), ecosun, fabricanteInversor, fabricantePainel };
}
