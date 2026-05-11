export interface QualifyResult {
  qualified: boolean;
  reason?: string;
  tag?: 'padrao' | 'premium' | 'comercial_alto_consumo';
}

export function qualifyByConta(faixa: string): QualifyResult {
  switch (faixa) {
    case 'ate_700':
      return { qualified: false, reason: 'Conta abaixo R$ 700/mes — fora do criterio minimo' };
    case '700_1500':
      return { qualified: true, tag: 'padrao' };
    case '1500_3000':
      return { qualified: true, tag: 'premium' };
    case 'acima_3000':
      return { qualified: true, tag: 'comercial_alto_consumo' };
    default:
      return { qualified: false, reason: `Faixa desconhecida: ${faixa}` };
  }
}

const CIDADES_DF = [
  'brasilia',
  'plano piloto',
  'aguas claras',
  'taguatinga',
  'ceilandia',
  'samambaia',
  'sobradinho',
  'planaltina',
  'gama',
  'santa maria',
  'recanto das emas',
  'riacho fundo',
  'candangolandia',
  'cruzeiro',
  'guara',
  'nucleo bandeirante',
  'park way',
  'itapoa',
  'sao sebastiao',
  'jardim botanico',
  'vicente pires',
  'arniqueira',
  'sudoeste',
  'octogonal',
  'lago sul',
  'lago norte',
];

const CIDADES_GO_ENTORNO = [
  'anapolis',
  'luziania',
  'formosa',
  'planaltina de goias',
  'aguas lindas',
  'novo gama',
  'valparaiso',
  'cidade ocidental',
  'padre bernardo',
  'santo antonio do descoberto',
  'cocalzinho',
  'pirenopolis',
  'goianesia',
  'alexania',
  'corumba de goias',
  'abadiania',
];

export function qualifyByRegion(cidade: string): QualifyResult {
  const c = cidade.toLowerCase().trim();
  if (CIDADES_DF.some((x) => c.includes(x))) return { qualified: true };
  if (CIDADES_GO_ENTORNO.some((x) => c.includes(x))) return { qualified: true };
  return {
    qualified: false,
    reason: `Hoje atendemos so DF e Goias ate 100km do Entorno. Recebemos seu contato pra futuro.`,
  };
}

const PROIBIDAS_PERFIL = [
  'alugar terra',
  'arrendar',
  'fazenda solar',
  'alugar fazenda',
  'usina solar grande',
];

export function qualifyByPerfil(texto: string): QualifyResult {
  const t = texto.toLowerCase();
  for (const p of PROIBIDAS_PERFIL) {
    if (t.includes(p)) return { qualified: false, reason: `Detectado interesse em ${p} — fora do nosso atendimento` };
  }
  return { qualified: true };
}
