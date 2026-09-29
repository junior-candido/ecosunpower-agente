// Telas da COBRANÇA RECORRENTE (28/09/2026) com dados FICTÍCIOS — usadas pelo
// teste das telas, pelo "telas leves" e pelos prints. Nomes inventados.
import { renderAssinaturasPage, renderAssinaturaDetalhePage } from '../../src/modules/dashboard/assinaturas-views.js';
import { renderMinhaAssinaturaPage } from '../../src/modules/dashboard/minha-assinatura-views.js';
import type { AssinaturaRow } from '../../src/modules/dashboard/assinaturas-store.js';
import type { FaturaRow } from '../../src/modules/cobranca-recorrente/faturas-repo.js';
import type { DashUser } from '../../src/modules/dashboard/permissions.js';
import { USER_CASA, USER_TENANT } from './miolo-leads.js';

export const HOJE_COBRANCA = '2026-10-14';
const TENANT = USER_TENANT.companyId;

const assinatura = (o: Partial<AssinaturaRow>): AssinaturaRow => ({
  id: '11111111-1111-4111-8111-000000000001', produtoId: 'monitoramento', produtoNome: 'Monitoramento de Usinas',
  nome: 'Solar Aurora Teste', email: 'financeiro@aurora.exemplo.invalid', telefone: '5561988887777', zapConfirmado: false,
  valorCentavos: 29700, limite: 110, venceEm: '2026-10-10', status: 'ativa', companyId: TENANT,
  descricao: 'Plataforma de monitoramento', documento: '11222333000181', diaVencimento: 10, inicioEm: '2026-10-01',
  observacao: 'Paga às vezes pelo CPF, às vezes pelo CNPJ.', leadId: null, donaCompanyId: USER_CASA.companyId,
  pausaAutomatica: true, diasPausa: 3, pausaAdiadaAte: null, assistentePausadaEm: '2026-10-13T12:05:00Z', ...o,
});

let n = 0;
export const fatura = (o: Partial<FaturaRow>): FaturaRow => ({
  id: `22222222-2222-4222-8222-${String(++n).padStart(12, '0')}`, assinaturaId: '11111111-1111-4111-8111-000000000001',
  companyId: TENANT, donaCompanyId: USER_CASA.companyId, competencia: '2026-10-01', venceEm: '2026-10-10', valorCentavos: 29700,
  descricao: 'Plataforma de monitoramento', status: 'aberta', cobrancaId: 'cob-1', linkUrl: 'https://checkout.exemplo.invalid/pagar/aurora-out',
  pagoEm: null, pagoCentavos: null, taxaCentavos: null, metodo: null, formaBaixa: null, baixadoPor: null, lancamentoId: null,
  avisoFaturaEm: '2026-10-07T12:05:00Z', avisoVesperaEm: '2026-10-09T12:05:00Z', avisoVenceuEm: '2026-10-11T12:05:00Z', avisoUltimoEm: '2026-10-12T12:05:00Z',
  reciboEm: null, canalUltimoAviso: 'email+junior', criadoEm: '2026-10-07T12:05:00Z', ...o,
});

export const ASSINATURAS_FICTICIAS: AssinaturaRow[] = [
  assinatura({}),
  assinatura({ assistentePausadaEm: null, id: '11111111-1111-4111-8111-000000000002', nome: 'Condomínio Exemplo Norte', companyId: null, produtoId: 'outro', produtoNome: 'Outro serviço mensal', descricao: 'Manutenção mensal da usina', valorCentavos: 45000, diaVencimento: 20, documento: '99888777000166', telefone: '5561977776666', email: null, limite: null, observacao: null }),
  assinatura({ assistentePausadaEm: null, id: '11111111-1111-4111-8111-000000000003', nome: 'Integradora Sol Teste', companyId: null, descricao: 'Plataforma de monitoramento', valorCentavos: 19700, diaVencimento: 25, documento: null, limite: null }),
  assinatura({ assistentePausadaEm: null, id: '11111111-1111-4111-8111-000000000004', nome: 'Pousada Fictícia do Lago', companyId: null, status: 'pausada', produtoId: 'outro', produtoNome: 'Outro serviço mensal', descricao: 'Limpeza mensal dos módulos', valorCentavos: 35000, diaVencimento: 5, limite: null }),
];

export const FATURAS_FICTICIAS: FaturaRow[] = [
  fatura({}),
  fatura({ assinaturaId: '11111111-1111-4111-8111-000000000002', companyId: null, competencia: '2026-10-01', venceEm: '2026-10-20', valorCentavos: 45000, descricao: 'Manutenção mensal da usina', linkUrl: 'https://checkout.exemplo.invalid/pagar/condominio', avisoVesperaEm: null, avisoVenceuEm: null, avisoFaturaEm: null, canalUltimoAviso: null }),
  fatura({ assinaturaId: '11111111-1111-4111-8111-000000000002', companyId: null, competencia: '2026-09-01', venceEm: '2026-09-20', valorCentavos: 45000, descricao: 'Manutenção mensal da usina', status: 'paga', pagoEm: '2026-09-19T15:00:00Z', pagoCentavos: 45000, metodo: 'pix', formaBaixa: 'link', reciboEm: '2026-09-19T15:01:00Z', avisoVesperaEm: null, avisoVenceuEm: null }),
  fatura({ assinaturaId: '11111111-1111-4111-8111-000000000003', companyId: null, competencia: '2026-10-01', venceEm: '2026-10-25', valorCentavos: 19700, status: 'paga', pagoEm: '2026-10-12T15:00:00Z', pagoCentavos: 19700, metodo: 'credit_card', formaBaixa: 'link', avisoVesperaEm: null, avisoVenceuEm: null }),
];

/** Histórico da assinatura 1 (detalhe e "Minha assinatura"): outubro aberta atrasada + setembro paga por Pix direto. */
export const HISTORICO_AURORA: FaturaRow[] = [
  fatura({}),
  fatura({ competencia: '2026-09-01', venceEm: '2026-09-10', status: 'paga', pagoEm: '2026-09-09T13:00:00Z', pagoCentavos: 29700, metodo: 'pix_direto', formaBaixa: 'manual', baixadoPor: 'Dono Teste', linkUrl: null, avisoVesperaEm: null, avisoVenceuEm: null, reciboEm: '2026-09-09T13:00:10Z', canalUltimoAviso: 'email' }),
];

const EMPRESAS = [{ id: TENANT, nome: 'Solar Aurora Teste' }];
const PRODUTOS = [
  { id: 'monitoramento', nome: 'Monitoramento de Usinas', valorCentavosPadrao: 29700 },
  { id: 'calculadora', nome: 'Calculadora Solar', valorCentavosPadrao: 5700 },
  { id: 'outro', nome: 'Outro serviço mensal', valorCentavosPadrao: 10000 },
];

export function telaAssinaturasCasa(opts: { modeloAprovado?: boolean | null; aviso?: { tipo: 'ok' | 'erro'; texto: string; link?: string }; volume?: number } = {}): string {
  const extra = Array.from({ length: Math.max(0, (opts.volume ?? 0) - ASSINATURAS_FICTICIAS.length) }, (_, i) =>
    assinatura({ id: `11111111-1111-4111-8111-${String(100 + i).padStart(12, '0')}`, nome: `Cliente Fictício ${i}`, companyId: null, diaVencimento: (i % 28) + 1, valorCentavos: 10000 + i * 100 }));
  return renderAssinaturasPage({
    assinaturas: [...ASSINATURAS_FICTICIAS, ...extra], faturas: FATURAS_FICTICIAS, produtos: PRODUTOS, empresas: EMPRESAS,
    hoje: HOJE_COBRANCA, modeloAprovado: opts.modeloAprovado === undefined ? false : opts.modeloAprovado, infinitepayLigada: true,
  }, USER_CASA, opts.aviso);
}

export function telaAssinaturaDetalhe(opts: { aviso?: { tipo: 'ok' | 'erro'; texto: string; link?: string }; faturas?: FaturaRow[]; a?: Partial<AssinaturaRow> } = {}): string {
  return renderAssinaturaDetalhePage({
    assinatura: assinatura(opts.a ?? {}), faturas: opts.faturas ?? HISTORICO_AURORA, hoje: HOJE_COBRANCA,
    empresaNome: 'Solar Aurora Teste', uso: 87, modeloAprovado: false, infinitepayLigada: true,
  }, USER_CASA, opts.aviso);
}

export function telaMinhaAssinaturaComFaturas(user: DashUser = USER_TENANT, faturas: FaturaRow[] = HISTORICO_AURORA, pausada = true): string {
  const a = assinatura({});
  const aberta = faturas.find((f) => f.status === 'aberta');
  // Assistente pausada por fatura: o router põe a faixa no user (só tenant).
  const u: DashUser = pausada && aberta ? { ...user, assistentePausada: { linkPagar: aberta.linkUrl } } : user;
  return renderMinhaAssinaturaPage(a, HOJE_COBRANCA, 87, aberta?.linkUrl ?? null, u, undefined, faturas);
}

/** Pro "telas leves": a casa vê as 2 telas dela; o tenant vê a Minha assinatura com faturas. */
export function telasCobranca(nVolume: number, user: DashUser): Record<string, string> {
  if (user.companyId === USER_CASA.companyId) {
    return {
      'assinaturas-lista': telaAssinaturasCasa({ volume: nVolume }),
      'assinaturas-detalhe': telaAssinaturaDetalhe(),
    };
  }
  return { 'minha-assinatura-faturas': telaMinhaAssinaturaComFaturas(user) };
}
