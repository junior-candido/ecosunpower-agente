// Casos do Financeiro II (renovação do miolo, R20): Notas fiscais (lista,
// nova, editar, detalhe em cada situação, configuração), Cobrar cliente e
// Assinaturas. Dados FICTÍCIOS: nomes, CNPJ e chaves inventados.
import { renderNotasPage, renderNovaNotaPage, renderNotaDetalhe, renderConfigFiscalPage } from '../../src/modules/dashboard/fiscal-views.js';
import type { ConfigInfo, ServicoOpt } from '../../src/modules/dashboard/fiscal-views.js';
import type { NotaLinha } from '../../src/modules/financeiro/fiscal/notas-repo.js';
import { renderCobrarPage } from '../../src/modules/dashboard/cobrar-views.js';
import { telaAssinaturasCasa, telaAssinaturaDetalhe } from './telas-cobranca.js';
import { USER_CASA, USER_TENANT } from './miolo-leads.js';

export const NOTA_ID = '44444444-5555-4666-8777-888888888888';

export const nota = (over: Partial<NotaLinha> = {}): NotaLinha => ({
  id: NOTA_ID, companyId: USER_CASA.companyId, status: 'preparada', numero: null, competencia: '2026-09-15',
  descricao: 'Limpeza de módulos fotovoltaicos', servicoId: 's1',
  tomador: { tipo: 'PJ', doc: '11222333000144', nome: 'Condomínio <b>Exemplo</b> Norte', im: '0799999900', endereco: 'Rua Fictícia, 10', email: 'adm@exemplo.invalid', municipio: 'Brasília', uf: 'DF', cep: '70000000', logradouro: 'Rua Fictícia', numero: '10', bairro: 'Asa Norte', codMunIbge: '5300108' },
  valorBruto: 1500, valorIss: 75, issRetido: true, valorLiquido: 1425,
  pdfStoragePath: null, contaReceberId: null, chaveAcesso: null, ambienteEmissao: null, xmlNfse: null,
  ...over,
});

const NOTAS: NotaLinha[] = [
  nota({ id: '55555555-5555-4666-8777-888888888888', status: 'autorizada', numero: '84', chaveAcesso: '53260911222333000144000000000000084', ambienteEmissao: 'producao', xmlNfse: '<x/>', pdfStoragePath: 'fiscal/a.pdf', contaReceberId: 'c1' }),
  nota(),
  nota({ id: '66666666-5555-4666-8777-888888888888', status: 'enviada', tomador: { ...nota().tomador, nome: "Ana D'Ávila", tipo: 'PF', doc: '12345678900', im: null }, issRetido: false, valorIss: 50, valorBruto: 1000, valorLiquido: 1000 }),
  nota({ id: '77777777-5555-4666-8777-888888888888', status: 'cancelada', numero: '80' }),
];

export const CONFIG_OK: ConfigInfo = {
  cnpj: '99888777000166', inscricao_municipal: '0712345600', razao_social: 'Empresa Fictícia Ltda', cert_validade: '2099-08-31',
  ambiente: 'producao', serie_dps: '1', proximo_ndps: 42, cert_storage_path: 'fiscal/cert.pfx',
};
const CONFIG_VENCENDO: ConfigInfo = { ...CONFIG_OK, cert_validade: '2020-01-31', ambiente: 'homologacao' };
const CONFIG_SEM_CERT: ConfigInfo = { ...CONFIG_OK, cert_validade: null, cert_storage_path: null, ambiente: 'homologacao' };

export const SERVICOS: ServicoOpt[] = [
  { id: 's1', nome: 'Limpeza de módulos', cod_trib_nacional: '070101', descricao_padrao: 'Limpeza de "módulos" <fotovoltaicos>', aliquota_iss: 0.05 },
  { id: 's2', nome: 'Manutenção elétrica', cod_trib_nacional: '140101', descricao_padrao: 'Manutenção', aliquota_iss: 0.02 },
];

const PREFILL_EDITAR = {
  notaId: NOTA_ID, nome: 'Condomínio <b>Exemplo</b> Norte', doc: '11222333000144', tipo: 'PJ' as const, im: '0799999900',
  endereco: 'Rua Fictícia, 10', municipio: 'Brasília', uf: 'DF', email: 'adm@exemplo.invalid', cep: '70000000',
  logradouro: 'Rua Fictícia', numero: '10', bairro: 'Asa Norte', codMunIbge: '5300108', servicoId: 's2',
  descricao: 'Manutenção "preventiva"', competencia: '2026-09-15', valor: 1500, issRetido: true,
};

export const CASOS_FINANCEIRO2: Record<string, () => string> = {
  // Notas fiscais — lista
  'notas': () => renderNotasPage(NOTAS, CONFIG_OK, USER_CASA),
  'notas-cert-vencendo': () => renderNotasPage(NOTAS.slice(0, 2), CONFIG_VENCENDO, USER_CASA),
  'notas-vazio-sem-config': () => renderNotasPage([], null, USER_CASA),
  'notas-tenant': () => renderNotasPage(NOTAS.slice(1, 3), CONFIG_SEM_CERT, USER_TENANT),
  // Nova / editar
  'nota-nova': () => renderNovaNotaPage(SERVICOS, {}, USER_CASA),
  'nota-nova-do-fechamento': () => renderNovaNotaPage(SERVICOS, { fechamentoId: 'f-1', leadId: 'l-1', erro: 'Preencha <tomador>, serviço, valor e competência.' }, USER_CASA),
  'nota-nova-sem-servico': () => renderNovaNotaPage([], {}, USER_TENANT),
  'nota-editar': () => renderNovaNotaPage(SERVICOS, PREFILL_EDITAR, USER_CASA),
  // Detalhe em cada situação
  'nota-preparada-com-cert': () => renderNotaDetalhe(nota(), CONFIG_OK, USER_CASA),
  'nota-preparada-homologacao': () => renderNotaDetalhe(nota(), CONFIG_VENCENDO, USER_CASA),
  'nota-preparada-sem-cert': () => renderNotaDetalhe(nota({ issRetido: false }), CONFIG_SEM_CERT, USER_CASA, { tipo: 'erro', texto: 'E0235: <endereço> faltando' }),
  'nota-teste-homologacao': () => renderNotaDetalhe(nota({ chaveAcesso: '53260911222333000144000000000000001', ambienteEmissao: 'homologacao', xmlNfse: '<x/>' }), CONFIG_VENCENDO, USER_CASA, { tipo: 'ok', texto: '🧪 Teste de homologação passou — a nota continua preparada pra emissão real.' }),
  'nota-enviada': () => renderNotaDetalhe(nota({ status: 'enviada' }), CONFIG_OK, USER_CASA),
  'nota-autorizada': () => renderNotaDetalhe(NOTAS[0], CONFIG_OK, USER_CASA, { tipo: 'ok', texto: '✅ NFS-e emitida — nº 84.' }),
  'nota-cancelada': () => renderNotaDetalhe(NOTAS[3], null, USER_TENANT),
  // Configuração
  'fiscal-config': () => renderConfigFiscalPage(CONFIG_OK, { tipo: 'ok', texto: '✅ Configuração salva.' }, USER_CASA),
  'fiscal-config-teste': () => renderConfigFiscalPage(CONFIG_SEM_CERT, { tipo: 'erro', texto: 'Informe a senha <do> certificado.' }, USER_CASA),
  'fiscal-config-vazia': () => renderConfigFiscalPage(null, undefined, USER_TENANT),
  // Cobrar cliente
  'cobrar': () => renderCobrarPage({ off: false, user: USER_CASA }),
  'cobrar-sem-infinitepay': () => renderCobrarPage({ off: true, user: USER_CASA }),
  'cobrar-tenant': () => renderCobrarPage({ off: false, user: USER_TENANT }),
  // Assinaturas (já nasceram no padrão cc- — #339; aqui só travam o contrato)
  'assinaturas': () => telaAssinaturasCasa(),
  'assinatura-detalhe': () => telaAssinaturaDetalhe(),
};
