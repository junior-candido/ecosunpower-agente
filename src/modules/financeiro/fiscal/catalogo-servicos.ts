// src/modules/financeiro/fiscal/catalogo-servicos.ts
// Catálogo de serviços da NFS-e com os códigos COPIADOS das notas reais emitidas
// pelo portal do ISS-DF (fonte da verdade, não achismo):
//   - nota 82 (Superbom, 25/08/2026): 14.01.01 · NBS 1.2001.60.00 · cIndOp 050102 · 000/000001
//   - nota 83 (Spazio Verde, 26/08/2026): 31.01.02 · NBS 1.1415.00.00 · cIndOp 100301 · 200/200052 (red. 30%)
//   - nota 85 (União Adventista, 22/09/2026): 14.01.01 · NBS 1.1803.29.00 · cIndOp 050101 · 000/000001
//
// O que vai na DPS (manual NotaControl v1.01, grupo IBSCBS): finNFSe, cIndOp,
// indDest e gIBSCBS{CST, cClassTrib}. As ALÍQUOTAS NÃO vão na DPS — o fisco
// calcula com as alíquotas "parametrizadas no sistema" e devolve na NFS-e. As
// alíquotas daqui servem só pra PRÉVIA (tela/PDF de teste) quando ainda não
// existe o XML autorizado; na nota autorizada o PDF lê do XML do fisco.
//
// O código de tributação MUNICIPAL (cTribMun) NÃO está aqui de propósito: é um
// número do cadastro do ISS.net de cada empresa (na homologação eram 1/4/6/7).
// Ele fica em fiscal_servicos.cod_trib_municipal e é conferido na tela de
// configuração com o botão "Consultar atividades no fisco".
//
// Multi-tenant: é tabela nacional/DF, sem nada de uma empresa. Serviço que não
// está aqui usa o padrão da nota 82 (IBSCBS_PADRAO).

export interface IbsCbsServico {
  /** Código de Situação Tributária do IBS/CBS (3 dígitos). */
  cst: string;
  /** Código de Classificação Tributária do IBS/CBS (6 dígitos). */
  cClassTrib: string;
  /** Código indicador da operação de fornecimento (6 dígitos). */
  cIndOp: string;
  /** Alíquotas em % (prévia; a oficial vem na NFS-e). */
  pCBS: number; pIBSUF: number; pIBSMun: number;
  /** Redução de alíquota em % (cClassTrib 200052 = 30%). */
  pRedAliq: number;
}

export interface ServicoCatalogo {
  nome: string;
  codTribNacional: string;
  atividadeMunicipal: string;
  descAtividade: string;
  nbs: string;
  descricaoPadrao: string;
  aliquotaIss: number;
  /** Nas notas reais o ISS saiu retido pelo tomador PJ do DF. Nem todo PJ retém
   *  (a nota 85, de entidade religiosa, saiu "Não Retido") — a tela só sugere. */
  issRetidoPjDf: boolean;
  ibscbs: IbsCbsServico;
  fonte: string;
}

const DESC_1401 = 'Lubrificação, limpeza, lustração, revisão, carga e recarga, conserto, restauração, blindagem, manutenção e conservação de máquinas, veículos, aparelhos, equipamentos, motores, elevadores ou de qualquer objeto (exceto peças e partes empregadas, que ficam sujeitas ao ICMS).';
const DESC_3101 = 'Serviços técnicos em edificações, eletrônica, eletrotécnica, mecânica, telecomunicações e congêneres.';

/** Padrão = nota 82 (a mais comum: tributação integral). */
export const IBSCBS_PADRAO: Readonly<IbsCbsServico> = Object.freeze({
  cst: '000', cClassTrib: '000001', cIndOp: '050102', pCBS: 0.9, pIBSUF: 0.1, pIBSMun: 0, pRedAliq: 0,
});

export const CATALOGO_SERVICOS: ReadonlyArray<ServicoCatalogo> = [
  {
    nome: 'Manutenção preventiva e limpeza de geração de energia',
    codTribNacional: '14.01.01', atividadeMunicipal: '14.01', descAtividade: DESC_1401,
    nbs: '1.2001.60.00',
    descricaoPadrao: 'serviços de manutenção preventiva em equipamentos de geração de energia e limpeza',
    aliquotaIss: 0.05, issRetidoPjDf: true,
    ibscbs: { ...IBSCBS_PADRAO },
    fonte: 'nota 82 (Superbom, 25/08/2026)',
  },
  {
    nome: 'Serviços elétricos gerais',
    codTribNacional: '31.01.02', atividadeMunicipal: '31.01', descAtividade: DESC_3101,
    nbs: '1.1415.00.00',
    descricaoPadrao: 'prestação de serviços eletricos gerais',
    aliquotaIss: 0.05, issRetidoPjDf: true,
    ibscbs: { cst: '200', cClassTrib: '200052', cIndOp: '100301', pCBS: 0.9, pIBSUF: 0.1, pIBSMun: 0, pRedAliq: 30 },
    fonte: 'nota 83 (Spazio Verde, 26/08/2026)',
  },
  {
    nome: 'Manutenção preventiva em sistemas fotovoltaicos',
    codTribNacional: '14.01.01', atividadeMunicipal: '14.01', descAtividade: DESC_1401,
    nbs: '1.1803.29.00',
    descricaoPadrao: 'manutenção preventiva em sistemas fotovoltaicos',
    aliquotaIss: 0.05, issRetidoPjDf: false,
    ibscbs: { ...IBSCBS_PADRAO, cIndOp: '050101' },
    fonte: 'nota 85 (União Adventista, 22/09/2026)',
  },
];

const digitos = (s: string | null | undefined) => String(s ?? '').replace(/\D/g, '');

/** Serviço do catálogo pelo código nacional (com ou sem pontos); o NBS desempata. */
export function servicoDoCatalogo(codTribNacional: string, nbs: string | null | undefined): ServicoCatalogo | null {
  const cod = digitos(codTribNacional);
  const candidatos = CATALOGO_SERVICOS.filter((s) => digitos(s.codTribNacional) === cod);
  if (candidatos.length === 0) return null;
  const n = digitos(nbs);
  return (n && candidatos.find((s) => digitos(s.nbs) === n)) || candidatos[0];
}

export function ibsCbsDoServico(codTribNacional: string, nbs: string | null | undefined): IbsCbsServico {
  return { ...(servicoDoCatalogo(codTribNacional, nbs)?.ibscbs ?? IBSCBS_PADRAO) };
}

const SITUACAO: Record<string, string> = {
  '000': 'Tributação integral',
  '010': 'Tributação com alíquotas uniformes',
  '011': 'Tributação com alíquotas uniformes reduzidas',
  '200': 'Alíquota reduzida',
  '410': 'Imunidade e não incidência',
};
export function situacaoTributariaIbsCbs(cst: string): string {
  return SITUACAO[cst] ?? cst;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ContaIbsCbs {
  vBC: number;
  pAliqEfetCBS: number; vCBS: number;
  pAliqEfetUF: number; vIBSUF: number;
  pAliqEfetMun: number; vIBSMun: number;
  vIBSTot: number;
}

/** Prévia do IBS/CBS como o fisco calcula em 2026 (manual v1.01, TCRTCValoresIBSCBS):
 *  vBC = vServ − vISSQN (o ISS sai da base mesmo quando NÃO é retido — nota 85);
 *  alíquota efetiva = alíquota × (1 − redução). Conferido com as notas 82/83/85. */
export function calcularIbsCbs(vServ: number, vIssqn: number, ib: IbsCbsServico): ContaIbsCbs {
  const vBC = r2(vServ - vIssqn);
  const fator = 1 - (ib.pRedAliq || 0) / 100;
  const pAliqEfetCBS = ib.pCBS * fator, pAliqEfetUF = ib.pIBSUF * fator, pAliqEfetMun = ib.pIBSMun * fator;
  const vCBS = r2(vBC * pAliqEfetCBS / 100);
  const vIBSUF = r2(vBC * pAliqEfetUF / 100);
  const vIBSMun = r2(vBC * pAliqEfetMun / 100);
  return { vBC, pAliqEfetCBS, vCBS, pAliqEfetUF, vIBSUF, pAliqEfetMun, vIBSMun, vIBSTot: r2(vIBSUF + vIBSMun) };
}
