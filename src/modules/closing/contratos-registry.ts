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

export type TipoCampo = 'texto' | 'numero' | 'moeda' | 'data' | 'select' | 'textarea';

export interface CampoContrato {
  id: string; // nome do input na tela (ex.: 'titular_cpf')
  label: string;
  grupo: GrupoCampo;
  tipo: TipoCampo;
  opcoes?: Array<{ valor: string; texto: string }>;
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
  /** Grava no rascunho do contrato. Só pra campo SEM coluna (dado do negócio). */
  gravar?: (out: Partial<DadosFechamento>, valor: string) => void;
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

const leEndereco = (chave: keyof Endereco) => (d: Partial<DadosFechamento>) =>
  texto((d.titular_uc as PessoaFisica | undefined)?.endereco?.[chave] ?? d.endereco_instalacao?.[chave]);

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
  { id: 'titular_nome', label: 'Nome completo', grupo: 'Quem assina', tipo: 'texto', obrigatorio: true, coluna: 'name', ler: leTitular('nome') },
  { id: 'titular_cpf', label: 'CPF', grupo: 'Quem assina', tipo: 'texto', obrigatorio: true, coluna: 'cpf_cnpj', ler: leTitular('cpf') },
  { id: 'titular_rg', label: 'RG', grupo: 'Quem assina', tipo: 'texto', obrigatorio: true, coluna: 'rg', ler: leTitular('rg') },
  { id: 'titular_orgao', label: 'Órgão emissor', grupo: 'Quem assina', tipo: 'texto', dica: 'ex.: SSP/DF', coluna: 'orgao_emissor_rg', ler: leTitular('orgao_emissor_rg') },
  {
    id: 'titular_estado_civil', label: 'Estado civil', grupo: 'Quem assina', tipo: 'select', obrigatorio: true,
    opcoes: ESTADOS_CIVIS, coluna: 'estado_civil',
    // No PDF o estado civil sai por extenso ("Solteiro(a)"); no cadastro ele é um
    // id ("solteiro"). Aqui volta pro id, senão o campo apareceria vazio na tela.
    ler: (d) => idEstadoCivil(leTitular('estado_civil')(d)),
  },
  { id: 'titular_profissao', label: 'Profissão', grupo: 'Quem assina', tipo: 'texto', coluna: 'profissao', ler: leTitular('profissao') },
  { id: 'titular_nascimento', label: 'Data de nascimento', grupo: 'Quem assina', tipo: 'data', coluna: 'data_nascimento', ler: leTitular('data_nascimento') },
  {
    id: 'titular_telefone', label: 'Telefone', grupo: 'Quem assina', tipo: 'texto', somenteLeitura: true,
    dica: 'é a chave do WhatsApp — muda no cadastro do cliente',
    ler: leTitular('telefone'),
  },
  { id: 'titular_email', label: 'E-mail', grupo: 'Quem assina', tipo: 'texto', coluna: 'email', ler: leTitular('email') },
];

const CAMPOS_ENDERECO: CampoContrato[] = [
  { id: 'end_rua', label: 'Rua / quadra', grupo: 'Endereço', tipo: 'texto', obrigatorio: true, coluna: 'endereco_rua', ler: leEndereco('rua') },
  { id: 'end_numero', label: 'Número', grupo: 'Endereço', tipo: 'texto', obrigatorio: true, coluna: 'endereco_numero', ler: leEndereco('numero') },
  { id: 'end_complemento', label: 'Complemento', grupo: 'Endereço', tipo: 'texto', coluna: 'endereco_complemento', ler: leEndereco('complemento') },
  { id: 'end_bairro', label: 'Bairro', grupo: 'Endereço', tipo: 'texto', obrigatorio: true, coluna: 'neighborhood', ler: leEndereco('bairro') },
  { id: 'end_cidade', label: 'Cidade', grupo: 'Endereço', tipo: 'texto', obrigatorio: true, coluna: 'city', ler: leEndereco('cidade') },
  {
    id: 'end_uf', label: 'UF', grupo: 'Endereço', tipo: 'select', coluna: 'uf',
    opcoes: [{ valor: 'DF', texto: 'DF' }, { valor: 'GO', texto: 'GO' }],
    ler: leEndereco('uf'),
  },
  { id: 'end_cep', label: 'CEP', grupo: 'Endereço', tipo: 'texto', obrigatorio: true, coluna: 'cep', ler: leEndereco('cep') },
];

const CAMPOS_UC: CampoContrato[] = [
  {
    id: 'uc_numero', label: 'Unidade consumidora (nº da conta de luz)', grupo: 'Unidade consumidora', tipo: 'texto',
    obrigatorio: true, coluna: 'uc_numero',
    ler: (d) => { const v = texto(d.uc_numero); return v === 'a confirmar' ? '' : v; },
  },
  {
    id: 'concessionaria', label: 'Concessionária', grupo: 'Unidade consumidora', tipo: 'select', obrigatorio: true, coluna: 'concessionaria',
    opcoes: [{ valor: 'Neoenergia-DF', texto: 'Neoenergia (DF)' }, { valor: 'Equatorial-GO', texto: 'Equatorial (GO)' }],
    ler: (d) => texto(d.concessionaria),
  },
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
  { id: 'com_forma_pagamento', label: 'Forma de pagamento', grupo: 'O negócio', tipo: 'texto', obrigatorio: true, coluna: 'forma_pagamento', dica: 'ex.: à vista no PIX · 24x no cartão · financiamento Belenus', ler: (d) => texto(d.comercial?.forma_pagamento) },
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
    if (c.somenteLeitura) continue;
    const v = limparTexto(String(body?.[c.id] ?? ''));
    if (!v) continue;
    // select só aceita valor da própria lista (POST forjado não entra)
    if (c.tipo === 'select' && !c.opcoes?.some((o) => o.valor === v)) continue;

    if (c.coluna) {
      cadastro[c.coluna] = v;
    } else if (c.gravar) {
      try {
        c.gravar(rascunho, v);
      } catch {
        // campo problemático não derruba o resto
      }
    }
  }
  return { cadastro, rascunho };
}
