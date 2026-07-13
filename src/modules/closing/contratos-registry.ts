// src/modules/closing/contratos-registry.ts
//
// 🏛️ CENTRAL DE CONTRATOS DE ENERGIA — o registro dos tipos.
//
// A ideia (visão do Junior): a tela de Contratos não gera "o" contrato, ela gera
// QUALQUER contrato de energia. Cada tipo se cadastra aqui dizendo: quem é, QUAIS
// CAMPOS pergunta (o formulário se monta sozinho a partir daqui) e como vira PDF.
// Somar um contrato novo (locação de usina, O&M, mercado livre, cooperativa...) =
// escrever o template + acrescentar um item nesta lista.
//
// ECOSSISTEMA — onde cada campo vai parar (o ponto que o Junior bateu o martelo):
//   • Campo de CADASTRO (nome, CPF, RG, estado civil, endereço, UC, forma de
//     pagamento...) grava na COLUNA do lead — o mesmo lugar que a IA preenche
//     quando lê a conta de luz e a CNH. Preencheu uma vez, vale pra TODO contrato,
//     pra procuração, pra Eva e pro CRM. Nada de silo por documento.
//   • Campo do NEGÓCIO daquele contrato (valor combinado, dados do sistema,
//     combinados à parte) grava no rascunho `leads.contrato_dados[tipo]`, porque
//     só faz sentido naquele documento.
//
// Regra de ouro da sessão: NUNCA trava. Campo vazio não impede nada — vira espaço
// em branco no PDF (completarComPlaceholders) e aparece destacado na tela.
import type { DadosFechamento, Endereco, PessoaFisica } from './types.js';
import { renderContrato } from './templates/contrato.html.js';
import { renderProcuracao } from './templates/procuracao.html.js';

export type GrupoCampo = string;

// 'select' = só as opções da lista valem. 'texto_sugerido' = a lista é um atalho,
// mas o operador pode escrever qualquer coisa (é o caso da forma de pagamento:
// tem as de sempre, e tem o que foi combinado na unha com o cliente).
export type TipoCampo = 'texto' | 'numero' | 'moeda' | 'data' | 'select' | 'texto_sugerido' | 'textarea';

export interface CampoContrato {
  id: string; // nome do input na tela (ex.: 'titular_cpf')
  label: string;
  grupo: GrupoCampo;
  tipo: TipoCampo;
  opcoes?: Array<{ valor: string; texto: string }>;
  /** Atalhos de 'texto_sugerido': aparecem numa lista, mas não obrigam a nada. */
  sugestoes?: string[];
  dica?: string;
  /** Obrigatório = se ficar vazio, sai em branco no PDF → destaca na tela. */
  obrigatorio?: boolean;
  /**
   * Coluna do lead onde esse campo mora. Quem tem coluna é dado de CADASTRO:
   * salvar aqui atualiza o cliente pro ecossistema inteiro, não só pro contrato.
   */
  coluna?: string;
  /** Mostra na tela mas não deixa editar (ex.: telefone = chave do WhatsApp). */
  somenteLeitura?: boolean;
  /** Lê o valor atual (cadastro + proposta + IA + rascunho) pra preencher o input. */
  ler: (d: Partial<DadosFechamento>) => string;
  /**
   * Escreve o valor no documento. Campo COM coluna usa isto só pra montar a
   * PRÉVIA (o que vale mesmo é a coluna do lead); campo sem coluna grava no
   * rascunho do contrato.
   */
  gravar: (out: Partial<DadosFechamento>, valor: string) => void;
}

export interface DefinicaoContrato {
  tipo: string;
  nome: string;
  emoji: string;
  descricao: string;
  /** Começo do nome do arquivo que o cliente recebe (nunca o id interno). */
  arquivo: string;
  campos: CampoContrato[];
  render: (d: DadosFechamento) => string;
}

/** O que o formulário devolve: o que vai pro cadastro e o que vai pro rascunho. */
export interface FormularioParseado {
  cadastro: Record<string, unknown>;
  rascunho: Partial<DadosFechamento>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ajudantes
// ─────────────────────────────────────────────────────────────────────────────

/** Número do jeito que brasileiro digita: "R$ 65.000,00" → 65000, "5,72" → 5.72. */
export function numeroBR(raw: string): number | undefined {
  let s = String(raw ?? '').replace(/[R$\s]/gi, '').trim();
  if (!s) return undefined;
  if (s.includes(',')) {
    // tem vírgula → o ponto é separador de milhar
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "35.000" / "1.234.567" → milhar. Já "19.6" e "6.215" com um ponto só e
    // qualquer quantidade de casas seguem decimais (o campo é escrito em pt-BR,
    // então ponto de milhar sempre vem em grupos de 3 completos).
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Tira sinal de HTML do texto digitado. O template do contrato injeta os dados
 * cru no HTML que o Puppeteer renderiza — sem isso, um `<img onerror=...>` salvo
 * num campo viraria código rodando no servidor na hora de gerar o PDF.
 */
export function limparTexto(raw: string): string {
  return String(raw ?? '').replace(/[<>]/g, '').trim().slice(0, 2000);
}

/** Mostra número pro brasileiro: 6.215 kWp vira "6,215" e 65000 vira "65.000". */
function mostrarNumero(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

/** Texto que veio do banco. Placeholder ("____") nunca vai pro formulário. */
function texto(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s || s.includes('___')) return '';
  return s;
}

function titular(out: Partial<DadosFechamento>): Partial<PessoaFisica> {
  if (!out.titular_uc) out.titular_uc = { tipo: 'PF' } as PessoaFisica;
  return out.titular_uc as Partial<PessoaFisica>;
}

function sistema(out: Partial<DadosFechamento>): any {
  if (!out.sistema) out.sistema = {} as any;
  const s = out.sistema as any;
  if (!s.modulos) s.modulos = {};
  if (!s.inversor) s.inversor = {};
  return s;
}

function comercial(out: Partial<DadosFechamento>): any {
  if (!out.comercial) out.comercial = {} as any;
  return out.comercial;
}

const leTitular = (chave: keyof PessoaFisica) => (d: Partial<DadosFechamento>) =>
  texto((d.titular_uc as Partial<PessoaFisica> | undefined)?.[chave]);

const gravaTitular = (chave: keyof PessoaFisica) => (out: Partial<DadosFechamento>, v: string) => {
  (titular(out) as any)[chave] = v;
};

const leEndereco = (chave: keyof Endereco) => (d: Partial<DadosFechamento>) =>
  texto((d.titular_uc as PessoaFisica | undefined)?.endereco?.[chave] ?? d.endereco_instalacao?.[chave]);

// O endereço da tela é um só, e vale pros dois lugares do documento (o do titular
// e o da instalação) — hoje o cadastro guarda um endereço só mesmo.
const gravaEndereco = (chave: keyof Endereco) => (out: Partial<DadosFechamento>, v: string) => {
  const t = titular(out);
  if (!t.endereco) t.endereco = {} as Endereco;
  if (!out.endereco_instalacao) out.endereco_instalacao = {} as Endereco;
  (t.endereco as any)[chave] = v;
  (out.endereco_instalacao as any)[chave] = v;
};

const gravaNumero = (aplicar: (out: Partial<DadosFechamento>, n: number) => void) =>
  (out: Partial<DadosFechamento>, v: string) => {
    const n = numeroBR(v);
    if (n != null) aplicar(out, n);
  };

// ─────────────────────────────────────────────────────────────────────────────
// Blocos de campos reusáveis
// ─────────────────────────────────────────────────────────────────────────────

// Mesmos valores do cadastro de clientes (leads.estado_civil) — se a lista aqui
// fosse diferente, o dado já salvo não casaria com nenhuma opção e o campo
// apareceria vazio na tela.
const ESTADOS_CIVIS = [
  { valor: 'solteiro', texto: 'Solteiro(a)' },
  { valor: 'casado', texto: 'Casado(a)' },
  { valor: 'uniao_estavel', texto: 'União estável' },
  { valor: 'divorciado', texto: 'Divorciado(a)' },
  { valor: 'separado', texto: 'Separado(a)' },
  { valor: 'viuvo', texto: 'Viúvo(a)' },
];

/**
 * O cadastro antigo tem estado civil escrito à mão ("casada", "Solteiro(a)", o
 * que a IA leu da CNH). Traz tudo isso pro id do cadastro novo — senão o campo
 * apareceria vazio na tela mesmo com o dado no banco.
 */
export function idEstadoCivil(raw: string): string {
  const s = String(raw ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // tira acento
    .toLowerCase().replace(/\(a\)/g, '').replace(/[\s_-]+/g, ' ').trim();
  if (!s) return '';
  if (s.startsWith('uniao')) return 'uniao_estavel';
  if (s.startsWith('solteir')) return 'solteiro';
  if (s.startsWith('casad')) return 'casado';
  if (s.startsWith('divorciad')) return 'divorciado';
  if (s.startsWith('separad')) return 'separado';
  if (s.startsWith('viuv')) return 'viuvo';
  return '';
}

const CAMPOS_PESSOA: CampoContrato[] = [
  { id: 'titular_nome', label: 'Nome completo', grupo: 'Quem assina', tipo: 'texto', obrigatorio: true, coluna: 'name', ler: leTitular('nome'), gravar: gravaTitular('nome') },
  { id: 'titular_cpf', label: 'CPF', grupo: 'Quem assina', tipo: 'texto', obrigatorio: true, coluna: 'cpf_cnpj', ler: leTitular('cpf'), gravar: gravaTitular('cpf') },
  { id: 'titular_rg', label: 'RG', grupo: 'Quem assina', tipo: 'texto', obrigatorio: true, coluna: 'rg', ler: leTitular('rg'), gravar: gravaTitular('rg') },
  { id: 'titular_orgao', label: 'Órgão emissor', grupo: 'Quem assina', tipo: 'texto', dica: 'ex.: SSP/DF', coluna: 'orgao_emissor_rg', ler: leTitular('orgao_emissor_rg'), gravar: gravaTitular('orgao_emissor_rg') },
  {
    id: 'titular_estado_civil', label: 'Estado civil', grupo: 'Quem assina', tipo: 'select', obrigatorio: true,
    opcoes: ESTADOS_CIVIS, coluna: 'estado_civil',
    // No PDF o estado civil sai por extenso ("Solteiro(a)"); no cadastro ele é um
    // id ("solteiro"). Aqui volta pro id, senão o campo apareceria vazio na tela.
    ler: (d) => idEstadoCivil(leTitular('estado_civil')(d)),
    gravar: (out, v) => { (titular(out) as any).estado_civil = ESTADOS_CIVIS.find((o) => o.valor === v)?.texto ?? v; },
  },
  { id: 'titular_profissao', label: 'Profissão', grupo: 'Quem assina', tipo: 'texto', coluna: 'profissao', ler: leTitular('profissao'), gravar: gravaTitular('profissao') },
  { id: 'titular_nascimento', label: 'Data de nascimento', grupo: 'Quem assina', tipo: 'data', coluna: 'data_nascimento', ler: leTitular('data_nascimento'), gravar: gravaTitular('data_nascimento') },
  {
    id: 'titular_telefone', label: 'Telefone', grupo: 'Quem assina', tipo: 'texto', somenteLeitura: true,
    dica: 'é a chave do WhatsApp — muda no cadastro do cliente',
    ler: leTitular('telefone'), gravar: gravaTitular('telefone'),
  },
  { id: 'titular_email', label: 'E-mail', grupo: 'Quem assina', tipo: 'texto', coluna: 'email', ler: leTitular('email'), gravar: gravaTitular('email') },
];

const CAMPOS_ENDERECO: CampoContrato[] = [
  { id: 'end_rua', label: 'Rua / quadra', grupo: 'Endereço', tipo: 'texto', obrigatorio: true, coluna: 'endereco_rua', ler: leEndereco('rua'), gravar: gravaEndereco('rua') },
  { id: 'end_numero', label: 'Número', grupo: 'Endereço', tipo: 'texto', obrigatorio: true, coluna: 'endereco_numero', ler: leEndereco('numero'), gravar: gravaEndereco('numero') },
  { id: 'end_complemento', label: 'Complemento', grupo: 'Endereço', tipo: 'texto', coluna: 'endereco_complemento', ler: leEndereco('complemento'), gravar: gravaEndereco('complemento') },
  { id: 'end_bairro', label: 'Bairro', grupo: 'Endereço', tipo: 'texto', obrigatorio: true, coluna: 'neighborhood', ler: leEndereco('bairro'), gravar: gravaEndereco('bairro') },
  { id: 'end_cidade', label: 'Cidade', grupo: 'Endereço', tipo: 'texto', obrigatorio: true, coluna: 'city', ler: leEndereco('cidade'), gravar: gravaEndereco('cidade') },
  {
    id: 'end_uf', label: 'UF', grupo: 'Endereço', tipo: 'select', coluna: 'uf',
    opcoes: [{ valor: 'DF', texto: 'DF' }, { valor: 'GO', texto: 'GO' }],
    ler: leEndereco('uf'), gravar: gravaEndereco('uf'),
  },
  { id: 'end_cep', label: 'CEP', grupo: 'Endereço', tipo: 'texto', obrigatorio: true, coluna: 'cep', ler: leEndereco('cep'), gravar: gravaEndereco('cep') },
];

const CAMPOS_UC: CampoContrato[] = [
  {
    id: 'uc_numero', label: 'Unidade consumidora (nº da conta de luz)', grupo: 'Unidade consumidora', tipo: 'texto',
    obrigatorio: true, coluna: 'uc_numero',
    ler: (d) => { const v = texto(d.uc_numero); return v === 'a confirmar' ? '' : v; },
    gravar: (out, v) => { out.uc_numero = v; },
  },
  {
    id: 'concessionaria', label: 'Concessionária', grupo: 'Unidade consumidora', tipo: 'select', obrigatorio: true, coluna: 'concessionaria',
    opcoes: [{ valor: 'Neoenergia-DF', texto: 'Neoenergia (DF)' }, { valor: 'Equatorial-GO', texto: 'Equatorial (GO)' }],
    ler: (d) => texto(d.concessionaria),
    gravar: (out, v) => { out.concessionaria = v as DadosFechamento['concessionaria']; },
  },
];

// As formas de pagamento que a EcoSun mais usa. É atalho, não camisa de força:
// o campo continua livre pra escrever o que foi acertado com o cliente.
const FORMAS_DE_PAGAMENTO = [
  'À vista no PIX',
  'Entrada + saldo na entrega',
  'Cartão de crédito — 12x',
  'Cartão de crédito — 18x',
  'Cartão de crédito — 24x',
  'Financiamento Belenus',
  'Boleto bancário',
];

// Do NEGÓCIO daquele contrato — não é cadastro do cliente, então fica no rascunho.
const CAMPOS_SISTEMA: CampoContrato[] = [
  { id: 'sis_kwp', label: 'Potência do sistema (kWp)', grupo: 'A usina', tipo: 'numero', obrigatorio: true, ler: (d) => mostrarNumero(d.sistema?.kwp), gravar: gravaNumero((o, n) => { sistema(o).kwp = n; }) },
  {
    id: 'sis_modalidade', label: 'Modalidade', grupo: 'A usina', tipo: 'select',
    opcoes: [
      { valor: 'autoconsumo_local', texto: 'Autoconsumo local' },
      { valor: 'autoconsumo_remoto', texto: 'Autoconsumo remoto' },
      { valor: 'geracao_compartilhada', texto: 'Geração compartilhada' },
    ],
    ler: (d) => texto(d.sistema?.modalidade), gravar: (o, v) => { sistema(o).modalidade = v; },
  },
  { id: 'sis_mod_marca', label: 'Módulos — marca', grupo: 'A usina', tipo: 'texto', obrigatorio: true, ler: (d) => texto(d.sistema?.modulos?.marca), gravar: (o, v) => { sistema(o).modulos.marca = v; } },
  { id: 'sis_mod_potencia_w', label: 'Módulos — potência (W)', grupo: 'A usina', tipo: 'numero', obrigatorio: true, ler: (d) => mostrarNumero(d.sistema?.modulos?.potencia_w), gravar: gravaNumero((o, n) => { sistema(o).modulos.potencia_w = n; }) },
  { id: 'sis_mod_qtd', label: 'Módulos — quantidade', grupo: 'A usina', tipo: 'numero', obrigatorio: true, ler: (d) => mostrarNumero(d.sistema?.modulos?.quantidade), gravar: gravaNumero((o, n) => { sistema(o).modulos.quantidade = n; }) },
  { id: 'sis_inv_marca', label: 'Inversor — marca', grupo: 'A usina', tipo: 'texto', obrigatorio: true, ler: (d) => texto(d.sistema?.inversor?.marca), gravar: (o, v) => { sistema(o).inversor.marca = v; } },
  { id: 'sis_inv_modelo', label: 'Inversor — modelo', grupo: 'A usina', tipo: 'texto', obrigatorio: true, ler: (d) => texto(d.sistema?.inversor?.modelo), gravar: (o, v) => { sistema(o).inversor.modelo = v; } },
  { id: 'sis_inv_potencia_kw', label: 'Inversor — potência (kW)', grupo: 'A usina', tipo: 'numero', obrigatorio: true, ler: (d) => mostrarNumero(d.sistema?.inversor?.potencia_kw), gravar: gravaNumero((o, n) => { sistema(o).inversor.potencia_kw = n; }) },
  { id: 'sis_inv_qtd', label: 'Inversor — quantidade', grupo: 'A usina', tipo: 'numero', ler: (d) => mostrarNumero(d.sistema?.inversor?.quantidade), gravar: gravaNumero((o, n) => { sistema(o).inversor.quantidade = n; }) },
];

const CAMPOS_COMERCIAL: CampoContrato[] = [
  { id: 'com_valor', label: 'Valor total (R$)', grupo: 'O negócio', tipo: 'moeda', obrigatorio: true, dica: 'só mexe se fechou por um valor diferente do da proposta', ler: (d) => mostrarNumero(d.comercial?.valor_total_brl), gravar: gravaNumero((o, n) => { comercial(o).valor_total_brl = n; }) },
  {
    id: 'com_forma_pagamento', label: 'Forma de pagamento', grupo: 'O negócio', tipo: 'texto_sugerido',
    obrigatorio: true, coluna: 'forma_pagamento',
    // As de sempre ficam a um clique — mas o campo é livre: o que foi combinado
    // com o cliente entra do jeito que foi combinado, e é isso que vai pro contrato.
    sugestoes: FORMAS_DE_PAGAMENTO,
    dica: 'escolhe uma ou escreve o que foi combinado',
    ler: (d) => texto(d.comercial?.forma_pagamento),
    gravar: (o, v) => { comercial(o).forma_pagamento = v; },
  },
  { id: 'disposicoes_especiais', label: 'Combinados à parte (entra no contrato)', grupo: 'O negócio', tipo: 'textarea', dica: 'o que foi combinado fora do padrão — prazo, brinde, condição...', ler: (d) => texto(d.disposicoes_especiais), gravar: (o, v) => { o.disposicoes_especiais = v; } },
];

// ─────────────────────────────────────────────────────────────────────────────
// Os tipos de contrato da central
// ─────────────────────────────────────────────────────────────────────────────

export const CONTRATOS: DefinicaoContrato[] = [
  {
    tipo: 'fv',
    nome: 'Contrato — Sistema fotovoltaico',
    emoji: '☀️',
    descricao: 'Venda e instalação da usina solar (o de sempre).',
    arquivo: 'contrato',
    campos: [...CAMPOS_PESSOA, ...CAMPOS_ENDERECO, ...CAMPOS_UC, ...CAMPOS_SISTEMA, ...CAMPOS_COMERCIAL],
    render: renderContrato,
  },
  {
    tipo: 'procuracao',
    nome: 'Procuração — acesso na concessionária',
    emoji: '🖊️',
    descricao: 'Poderes pra dar entrada no acesso/homologação junto à distribuidora.',
    arquivo: 'procuracao',
    campos: [...CAMPOS_PESSOA, ...CAMPOS_ENDERECO, ...CAMPOS_UC],
    render: renderProcuracao,
  },
];

export function getContrato(tipo: string): DefinicaoContrato | undefined {
  return CONTRATOS.find((c) => c.tipo === tipo);
}

/**
 * Os campos que a IA PODE sugerir: só dado de cadastro (quem é o cliente).
 *
 * Valor, dados do sistema e "combinados à parte" ficam DE FORA de propósito: a
 * conversa do zap é uma das fontes da IA, e o cliente escreve nela. Se ele mandar
 * "combinado então R$ 30.000, e vocês trocam o padrão", a IA acharia isso
 * "literalmente na fonte" e viraria o valor e a Cláusula 23ª de um contrato
 * assinado. Sobre dinheiro e cláusula a IA só pode AVISAR (achado), nunca preencher.
 */
export function camposQueIaPodeSugerir(def: DefinicaoContrato): CampoContrato[] {
  return def.campos.filter((c) => !!c.coluna && !c.somenteLeitura);
}

/** Os grupos na ordem em que aparecem nos campos do tipo (sem lista paralela). */
export function gruposDoContrato(def: DefinicaoContrato): GrupoCampo[] {
  const vistos: GrupoCampo[] = [];
  for (const c of def.campos) if (!vistos.includes(c.grupo)) vistos.push(c.grupo);
  return vistos;
}

/** Valores pra preencher os inputs da tela. Placeholder ("____") vira vazio. */
export function valoresDoFormulario(def: DefinicaoContrato, dados: Partial<DadosFechamento>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of def.campos) {
    try {
      out[c.id] = c.ler(dados) ?? '';
    } catch {
      out[c.id] = ''; // nunca trava por causa de um campo
    }
  }
  return out;
}

/** Os obrigatórios que ficaram vazios — vão sair em branco no PDF. */
export function camposFaltando(def: DefinicaoContrato, dados: Partial<DadosFechamento>): CampoContrato[] {
  const vals = valoresDoFormulario(def, dados);
  return def.campos.filter((c) => c.obrigatorio && !vals[c.id]);
}

/**
 * O que o operador digitou vira dois pacotes:
 *  - `cadastro`: colunas do lead (vale pro ecossistema inteiro);
 *  - `rascunho`: o que é só daquele contrato (valor, sistema, combinados).
 *
 * Campo em branco fica DE FORA dos dois — assim salvar nunca apaga o que já
 * existia no cadastro nem o que veio da proposta.
 */
export function parseFormulario(def: DefinicaoContrato, body: Record<string, unknown>): FormularioParseado {
  const cadastro: Record<string, unknown> = {};
  const rascunho: Partial<DadosFechamento> = {};

  for (const c of def.campos) {
    const v = valorDoCampo(c, body);
    if (!v) continue;
    if (c.coluna) {
      cadastro[c.coluna] = v; // dado do cliente → coluna do lead (vale pro ecossistema)
    } else {
      try {
        c.gravar(rascunho, v); // dado do negócio → rascunho daquele contrato
      } catch {
        // campo problemático não derruba o resto
      }
    }
  }
  return { cadastro, rascunho };
}

/** O valor limpo e conferido de um campo, ou '' se não deve entrar. */
function valorDoCampo(c: CampoContrato, body: Record<string, unknown>): string {
  if (c.somenteLeitura) return '';
  const v = limparTexto(String(body?.[c.id] ?? ''));
  if (!v) return '';
  // select só aceita valor da própria lista (POST forjado não entra)
  if (c.tipo === 'select' && !c.opcoes?.some((o) => o.valor === v)) return '';
  return v;
}

/**
 * O documento como ele ficaria com o que está DIGITADO na tela agora — mesmo o
 * que ainda não foi salvo. É o que alimenta a prévia ("ver como vai ficar").
 */
export function dadosDaTela(def: DefinicaoContrato, body: Record<string, unknown>): Partial<DadosFechamento> {
  const out: Partial<DadosFechamento> = {};
  for (const c of def.campos) {
    const v = valorDoCampo(c, body);
    if (!v) continue;
    try {
      c.gravar(out, v);
    } catch {
      // campo problemático não derruba a prévia
    }
  }
  return out;
}
