// Casos do Comercial II (renovação do miolo, R21): Contratos & Procurações,
// Fechou!, formulário do contrato do lead (+ documento travado), Recados,
// Comparador de Lojas e "O que a assistente sabe".
// Dados FICTÍCIOS: nomes inventados, nunca cliente real.
import { renderContratosPage, type TipoContratoItem } from '../../src/modules/dashboard/contratos-views.js';
import { renderFecharVendaPage } from '../../src/modules/dashboard/vendas-views.js';
import { renderContratoFormPage, renderDocBloqueadoPage, type ContratoFormInput } from '../../src/modules/dashboard/contrato-form-views.js';
import { telaRecados } from '../../src/modules/dashboard/recados-views.js';
import { renderLojasPage, type LojasPageInput } from '../../src/modules/dashboard/lojas-views.js';
import { telaConhecimento } from '../../src/modules/dashboard/conhecimento-views.js';
import { getContrato, CONTRATOS } from '../../src/modules/closing/contratos-registry.js';
import type { ItemCatalogo } from '../../src/modules/vendas/lojas/catalogo-loja.js';
import { USER_CASA, USER_TENANT } from './miolo-leads.js';

const L1 = '11111111-2222-4333-8444-555555555555';
const L2 = '22222222-2222-4333-8444-555555555555';
const TIPOS: TipoContratoItem[] = CONTRATOS.map((c) => ({ tipo: c.tipo, nome: c.nome, emoji: c.emoji, descricao: c.descricao }));
const RECENTES = [
  { leadId: L1, nome: "Ana D'Ávila", status: 'contrato_assinado' },
  { leadId: L2, nome: 'Bruno <script>x</script>', status: 'instalado' },
  { leadId: '33333333-2222-4333-8444-555555555555', nome: 'Carla Fictícia', status: null },
];

const contratos = (over: Partial<Parameters<typeof renderContratosPage>[0]> = {}, user: unknown = USER_CASA) =>
  renderContratosPage({ q: '', buscou: false, resultados: [], recentes: RECENTES, tipos: TIPOS, user, ...over });

const fv = getContrato('fv')!;
const tiposForm = CONTRATOS.map((c) => ({ tipo: c.tipo, nome: c.nome, emoji: c.emoji }));
const valoresCheios: Record<string, string> = Object.fromEntries(fv.campos.map((c) => [c.id, c.tipo === 'data' ? '2026-09-28' : c.tipo === 'select' ? (c.opcoes?.[0]?.valor ?? '') : `Valor ${c.id}`]));
const form = (over: Partial<ContratoFormInput> = {}): string => renderContratoFormPage({
  leadId: L1, nome: "Ana D'Ávila", def: fv, tipos: tiposForm, valores: {}, faltando: fv.campos.filter((c) => c.obrigatorio),
  problemas: ['CPF do titular', 'Forma de pagamento'], temProposta: true, user: USER_CASA, ...over,
});
const primeiroObrigatorio = fv.campos.find((c) => c.obrigatorio && !c.somenteLeitura)!;

const item = (i: number, over: Partial<ItemCatalogo> = {}): ItemCatalogo => ({
  fonte: (['belenus', 'solfacil', 'fortlev'] as const)[i % 3], categoria: i % 2 ? 'inversor_string' : 'modulo',
  sku: `sku${i}`, marca: i % 2 ? 'Marca Inversor' : 'Marca Módulo', modelo: `M${i}`, descricao: `Produto fictício <b>${i}</b>`,
  potenciaW: i % 2 ? 8000 : 615, precoUnitario: 500 + i * 37.5, precoCheio: null, estoque: null, datasheet: null, rsPorWp: null,
  atualizadoEmMs: Date.parse('2026-09-28T10:00:00Z'), ...over,
});
const CATALOGO = Array.from({ length: 6 }, (_, i) => item(i));
const COT = { servicoRsPorWp: 0.85, impostoPct: 6, margemAlvoPct: 25, margemMinimaPct: 12 };
const kit = (fonte: string, total: number, faltando: string[] = []) => ({
  fonte, modulo: { marca: 'Marca Módulo', modelo: 'M', descricao: 'Módulo fictício 615W', potenciaW: 615, preco: 700 }, moduloQtd: 12, moduloTotal: 8400,
  inversor: faltando.length ? null : { marca: 'Marca Inversor', modelo: 'I', descricao: 'Inversor fictício 8kW', potenciaW: 8000, preco: 4000 },
  inversorTotal: faltando.length ? 0 : 4000, estruturaRsPorModulo: 90, estruturaTotal: 1080, total, faltando,
});
const lojasBase: LojasPageInput = {
  totalItens: 6, contagemPorFonte: { belenus: 2, solfacil: 2, fortlev: 2 }, atualizadoEmMs: Date.now() - 3 * 3600_000,
  kitSpec: null, kits: [], cotacao: null, cotParams: COT, precoManual: null, margemManual: null, melhorFonte: null,
  catalogo: CATALOGO, catSel: '', fonteSel: '', mostrarGrandes: false,
  marcasModulo: ['Marca Módulo'], marcasInversor: ['Marca Inversor'], marcaMod: '', marcaInv: '', user: USER_CASA,
};
const SPEC = { modulos: 12, wpModulo: 615, inversorKw: 8, marcaModulo: null, marcaInversor: null, estruturaRsPorModulo: 90 };
const COTACAO = { custoMateriais: 13480, custoServico: 6273, custoTotal: 19753, precoSugerido: 28625.5, impostoValor: 1717.53, lucro: 7154.97, lucroPct: 25, precoMinimo: 24100, descontoMaxRs: 4525.5, descontoMaxPct: 15.8 };

const CONHECIMENTO = [
  { chave: 'o_que_vende', titulo: 'O que a empresa vende', conteudo: 'Sistemas fotovoltaicos <script>x</script> e "manutenção".', ordem: 1 },
  { chave: 'garantia', titulo: 'Garantia', conteudo: '', ordem: 2 },
];
const RECADOS = [
  { id: 'r1', nome: '<img src=x onerror=alert(1)>', telefone: '5561999990001', mensagem: '<script>roubar()</script> passa na obra amanhã?', criado_em: '2026-09-28T13:00:00Z', lido_em: null },
  { id: 'r2', nome: 'Lázaro Exemplo', telefone: '5561988887777', mensagem: 'Chegou o material do cliente Fictício.', criado_em: '2026-09-27T18:30:00Z', lido_em: null },
];

export const CASOS_COMERCIAL2: Record<string, () => string> = {
  // Contratos & Procurações
  'contratos': () => contratos(),
  'contratos-vazio': () => contratos({ recentes: [] }),
  'contratos-busca': () => contratos({ q: "Ana <x>", buscou: true, resultados: RECENTES.slice(0, 2) }),
  'contratos-busca-vazia': () => contratos({ q: 'ninguém', buscou: true, resultados: [] }),
  'contratos-selecionado': () => contratos({ selecionado: RECENTES[1], tipoSel: 'procuracao', docsResultado: '3', envioResultado: 'semzap', driveResultado: 'off' }),
  'contratos-avisos': () => contratos({ novoResultado: 'faltou', docsResultado: 'erro', envioResultado: 'ok-cliente', driveResultado: 'ok' }),
  'contratos-novo-erro': () => contratos({ novoResultado: 'erro', docsResultado: 'vazio', envioResultado: 'erro', driveResultado: 'erro' }),
  'contratos-tenant': () => contratos({ selecionado: RECENTES[0], docsResultado: 'off', envioResultado: 'ok-eu' }, USER_TENANT),
  // Fechou!
  'fechou': () => renderFecharVendaPage({ q: '', buscou: false, resultados: [], hoje: '2026-09-28', user: USER_CASA }),
  'fechou-resultados': () => renderFecharVendaPage({
    q: "Ana <b>", buscou: true, hoje: '2026-09-28', user: USER_CASA, ok: { nome: 'Bruno <script>' },
    resultados: [
      { leadId: L1, propostaId: '44444444-2222-4333-8444-555555555555', clienteNome: "Ana D'Ávila", numeroProposta: 'P-2026-091', createdAt: '2026-09-20T12:00:00Z', jaVenda: false },
      { leadId: L2, propostaId: null, clienteNome: 'Bruno Sem Proposta', numeroProposta: null, createdAt: null, jaVenda: false },
      { leadId: '33333333-2222-4333-8444-555555555555', propostaId: 'p9', clienteNome: 'Carla Já Cliente', numeroProposta: null, createdAt: '2026-08-01T12:00:00Z', jaVenda: true },
    ],
  }),
  'fechou-vazio': () => renderFecharVendaPage({ q: 'ninguém', buscou: true, resultados: [], hoje: '2026-09-28', user: USER_CASA }),
  'fechou-tenant': () => renderFecharVendaPage({ q: 'Ana', buscou: true, hoje: '2026-09-28', user: USER_TENANT, resultados: [
    { leadId: L1, propostaId: null, clienteNome: 'Ana Tenant', numeroProposta: null, createdAt: null, jaVenda: false },
  ] }),
  // Formulário do contrato do lead
  'form-faltando': () => form(),
  'form-cheio': () => form({ valores: valoresCheios, faltando: [], problemas: [], salvo: true }),
  'form-ia': () => form({
    iaRodou: true, sugestoes: { [primeiroObrigatorio.id]: { valor: 'Sugestão <b>IA</b>', fonte: 'conversa', trecho: 'meu "cpf" é tal' } as any },
    achados: [{ gravidade: 'alto', texto: 'Valor <diferente>' }, { gravidade: 'medio', texto: 'Data estranha' }, { gravidade: 'baixo', texto: 'Detalhe' }] as any,
    parcelamento: { valor: 30000, linhas: [{ parcelas: 12, parcela: 2700, total: 32400, frase: "12x de R$ 2.700,00 no cartão (total R$ 32.400,00)" }] },
  }),
  'form-ia-falhou': () => form({ iaRodou: true, iaFalhou: true, parcelamentoSemValor: true }),
  'form-ia-off': () => form({ iaIndisponivel: true }),
  'form-congelado': () => form({ valores: valoresCheios, faltando: [], problemas: [], vigente: { congeladoEm: '2026-09-10T12:00:00Z', valor: 38500, formaPagamento: 'PIX à vista' }, congelou: true }),
  'form-sem-proposta': () => form({
    temProposta: false, vinculoResultado: 'erro', propostaExpiradaEm: '2026-08-10T12:00:00Z',
    propostasOrfas: [{ id: '55555555-2222-4333-8444-555555555555', cliente_nome: 'Ana <b>x</b>', numero_proposta: 'P-7', created_at: '2026-09-01T12:00:00Z' }],
    docsResultado: '2', envioResultado: 'ok-cliente', driveResultado: 'ok',
  }),
  'form-aditivo': () => form({ def: getContrato('aditivo') ?? fv, valores: {}, faltando: [], problemas: [], vinculoResultado: 'ok' }),
  'form-procuracao-tenant': () => form({ def: getContrato('procuracao') ?? fv, user: USER_TENANT }),
  'bloqueado-enviar': () => renderDocBloqueadoPage({
    leadId: L1, nome: 'Maria <script>', acao: 'enviar', tipoForm: 'fv', user: USER_CASA,
    blocos: [{ documento: 'Contrato — Sistema fotovoltaico', problemas: ['CPF do titular'], congeladoEm: '2026-09-10T12:00:00Z' }, { documento: 'Procuração', problemas: ['RG <b>'] }],
  }),
  'bloqueado-pdf-tenant': () => renderDocBloqueadoPage({ leadId: L1, nome: 'Ana', acao: 'pdf', tipoForm: 'procuracao', user: USER_TENANT, blocos: [{ documento: 'Procuração', problemas: ['CPF'] }] }),
  // Recados
  'recados': () => telaRecados(RECADOS, USER_CASA),
  'recados-vazio': () => telaRecados([], USER_CASA),
  'recados-tenant': () => telaRecados(RECADOS.slice(1), USER_TENANT),
  // Comparador de Lojas
  'lojas': () => renderLojasPage(lojasBase),
  'lojas-kit': () => renderLojasPage({ ...lojasBase, kitSpec: SPEC, kits: [kit('belenus', 13480), kit('solfacil', 14100), kit('fortlev', 9480, ['inversor'])], cotacao: COTACAO, melhorFonte: 'belenus', precoManual: 22000, margemManual: { precoVenda: 22000, impostoValor: 1320, lucro: 927, lucroPct: 4.2, abaixoDoCusto: false }, catSel: 'modulo', fonteSel: 'belenus', mostrarGrandes: true, marcaMod: 'Marca Módulo' }),
  'lojas-kit-prejuizo': () => renderLojasPage({ ...lojasBase, kitSpec: SPEC, kits: [kit('belenus', 13480)], cotacao: COTACAO, melhorFonte: 'belenus', precoManual: 15000, margemManual: { precoVenda: 15000, impostoValor: 900, lucro: -5653, lucroPct: -37.7, abaixoDoCusto: true } }),
  'lojas-kit-sem-loja': () => renderLojasPage({ ...lojasBase, kitSpec: SPEC, kits: [], catalogo: [] }),
  'lojas-vazio': () => renderLojasPage({ ...lojasBase, totalItens: 0, contagemPorFonte: { belenus: 0, solfacil: 0, fortlev: 0 }, atualizadoEmMs: null, catalogo: [] }),
  'lojas-tenant': () => renderLojasPage({ ...lojasBase, user: USER_TENANT }),
  // O que a assistente sabe
  'conhecimento': () => telaConhecimento(CONHECIMENTO, 'Eva', USER_CASA),
  'conhecimento-ok': () => telaConhecimento(CONHECIMENTO.map((c) => ({ ...c, conteudo: c.conteudo || 'Texto.' })), 'Eva', USER_CASA, 'Salvo. A assistente já está usando este texto.'),
  'conhecimento-vazio': () => telaConhecimento([], 'Eva', USER_CASA),
  'conhecimento-tenant': () => telaConhecimento(CONHECIMENTO, 'Clara', USER_TENANT),
};
