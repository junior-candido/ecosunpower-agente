// src/modules/empresa-config.ts
// Fonte ÚNICA dos dados da empresa (EcoSof Kit Clone). A EcoSunPower é o
// cliente nº 0: EMPRESA_DEFAULTS são os dados reais dela e servem de fallback
// quando a tabela ainda não existe (deploy antes da migration 049) — o
// comportamento fica idêntico ao hardcode antigo.
import type { SupabaseClient } from '@supabase/supabase-js';
import { AsyncLocalStorage } from 'node:async_hooks';

/** Um destino de encaminhamento: "quando for X, manda pro telefone Y". */
export interface CanalAtendimento {
  /** Quando usar, em linguagem simples ("manutenção de aquecimento/piscina"). */
  assunto: string;
  /** Nome do setor que aparece pro cliente ("Setor de engenharia"). */
  rotulo: string;
  telefone: string;
}

export interface EmpresaConfig {
  /** Dono desta config. Deixa o resto do app perguntar "sou a EcoSun?" sem
   *  carregar o companyId à parte — usado pelo escopo da base de conhecimento. */
  companyId: string;
  razaoSocial: string; nomeFantasia: string; cnpj: string;
  endereco: string; cidade: string; uf: string; cep: string | null;
  email: string; siteUrl: string; atuacaoDesde: number;
  linkPagamento: string | null; // EcoSof: link de pagamento recorrente ({{link_pagamento}})
  descricaoCurta: string; regiaoAtuacao: string;
  nomeAtendente: string; telefoneAtendente: string | null;
  rtNome: string; rtTitulo: string; rtCpf: string | null; rtRg: string | null; rtRegistro: string | null;
  /** Como a assistente CHAMA o dono na conversa ("Junior", "Dr. Paulo", "Jimena").
   *  rtNome é o nome jurídico em caixa alta — ficaria formal demais no zap.
   *  Sem valor no banco, cai no PRIMEIRO NOME do rtNome DO PRÓPRIO tenant
   *  (nunca no apelido de outra empresa — era o vazamento do prompt). */
  rtApelido: string;
  /** Gênero de como se FALA de quem recebe o lead — define os artigos e
   *  contrações do prompt: 'm' → o/do/pro/pelo Junior · 'f' → a/da/pra/pela
   *  nossa equipe. Sem isso a assistente de uma empresa com vendedoras diria
   *  "o Jimena", "pro nossa equipe". */
  rtGenero: 'm' | 'f';
  pixChave: string | null;
  /** Canais pra onde a assistente MANDA quem não é venda (pós-venda, suporte,
   *  manutenção, financeiro). Lista vazia = fluxo normal (a EcoSun atende tudo
   *  pelo mesmo número). Com canais, ela para de qualificar e encaminha. */
  canaisAtendimento: CanalAtendimento[];
  /** Texto livre da EMPRESA descrevendo QUEM chega no número dela e como
   *  reconhecer cada tipo (parceria, produto A, produto B, cliente antigo...).
   *  Cada empresa tem a sua realidade — modelar isso em código não escala. */
  politicaTriagem: string | null;
  criterioLeadValor: number; criterioLeadKwh: number;
  marcasPermitidas: string[]; marcasBloqueadas: string[];
  garantiaInstalacaoMeses: number; fatorPerdaPadrao: number; belenusAtivo: boolean;
  logoStoragePath: string | null;
  /** Cor da marca em hex (#RRGGBB) — painel e DANFSe. NULL = a da casa. */
  corMarca: string | null;
  // Link "Pedir avaliações" do Google Meu Negócio — usado na Pasta Digital
  // do Cliente (página + mensagem do zap). null = blocos de avaliação somem.
  googleReviewUrl: string | null;
  // região técnica (fallback quando UF do cliente não está no solar-params)
  hspPadrao: number | null;       // ex.: 5.40; null = usa o resolver atual por UF
  tarifaPadrao: number | null;    // ex.: 1.050; null = resolver atual
  concessionariaPadrao: string | null; // ex.: 'CEMIG-MG'; null = resolver atual
  // 085: régua do aviso de geração baixa (% do esperado que acende o amarelo).
  // 70 = padrão histórico; tenant pode afrouxar (ex.: Sabion 60).
  reguaAtencaoPct: number;
}

export const EMPRESA_DEFAULTS: EmpresaConfig = {
  companyId: '00000000-0000-0000-0000-000000000001',
  razaoSocial: 'ECOSUNPOWER ENERGIA SOLAR LTDA',
  nomeFantasia: 'EcoSunPower',
  cnpj: '33.020.459/0001-06',
  endereco: 'SHA Conjunto 01 Chácara 44C Lote 6, Arniqueira',
  cidade: 'Brasília', uf: 'DF', cep: '71993-150',
  email: 'junior@ecosunpower.eng.br',
  siteUrl: 'https://ecosunpower.eng.br',
  linkPagamento: null,
  atuacaoDesde: 2019,
  descricaoCurta: 'empresa de engenharia em energia com atuação em Brasília-DF e Goiás desde 2019',
  regiaoAtuacao: 'Brasília e Entorno (DF) e cidades de Goiás até ~100 km (Águas Lindas, Valparaíso, Luziânia, Anápolis, Goiânia)',
  nomeAtendente: 'Eva',
  telefoneAtendente: '5561996978781',
  rtNome: 'ANTONIO CANDIDO RODRIGUES JUNIOR',
  rtApelido: 'Junior',
  rtGenero: 'm',
  rtTitulo: 'Responsável Técnico CREA/CFT',
  rtCpf: '989.404.571-53', rtRg: '2.202.520 SSP-DF', rtRegistro: '98940457153',
  pixChave: '33.020.459/0001-06',
  canaisAtendimento: [], politicaTriagem: null,
  criterioLeadValor: 700, criterioLeadKwh: 700,
  marcasPermitidas: ['Trina Solar','JA Solar','Risen','Jinko Solar','LONGi','Honor','SolarEdge','Deye','Sungrow','Huawei','Hoymiles','Enphase','FoxESS','NEP','Solis','SolaX'],
  marcasBloqueadas: ['Growatt'],
  garantiaInstalacaoMeses: 12, fatorPerdaPadrao: 0.78, belenusAtivo: true,
  logoStoragePath: null,
  corMarca: null,
  googleReviewUrl: 'https://g.page/r/CWB5ipa57HzhEAI/review',
  hspPadrao: null, tarifaPadrao: null, concessionariaPadrao: null,
  reguaAtencaoPct: 70,
};
// Congelado: dezenas de call sites vão ler isto — mutação acidental corromperia a config global.
Object.freeze(EMPRESA_DEFAULTS);
Object.freeze(EMPRESA_DEFAULTS.marcasPermitidas);
Object.freeze(EMPRESA_DEFAULTS.marcasBloqueadas);

/** jsonb do banco → lista de canais. Descarta entrada sem telefone (o campo
 *  vira texto de prompt: melhor não ter canal do que ter canal quebrado). */
export function normalizarCanais(valor: unknown): CanalAtendimento[] {
  if (!Array.isArray(valor)) return [];
  const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  return valor
    .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
    .map((c) => ({ assunto: txt(c.assunto).slice(0, 200), rotulo: txt(c.rotulo).slice(0, 60), telefone: txt(c.telefone).slice(0, 30) }))
    .filter((c) => c.telefone !== '' && c.assunto !== '')
    .slice(0, 6); // teto: prompt não vira lista telefônica
}

// Row snake_case do banco → EmpresaConfig; null/ausente cai no default (nunca
// undefined chegando em template/prompt).
export function normalizarEmpresaRow(row: Record<string, unknown>): Readonly<EmpresaConfig> {
  const s = (v: unknown, d: string): string => (typeof v === 'string' && v.trim() ? v : d);
  const sn = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
  // M3: string vazia não vira 0 — exige v.trim() !== '' antes de converter.
  const n = (v: unknown, d: number): number => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)) ? Number(v) : d);
  const nn = (v: unknown): number | null => {
    if (v == null) return null;
    if (typeof v === 'number' && isFinite(v)) return v;
    // M3: string vazia não vira 0
    if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) return Number(v);
    return null;
  };
  const arr = (v: unknown, d: string[]): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : d);
  const b = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
  const D = EMPRESA_DEFAULTS;
  // ⚖️ LGPD (31/08/2026) — IDENTIDADE NÃO SE HERDA.
  // Cada empresa da plataforma é um CONTROLADOR de dados diferente. Antes, uma
  // coluna vazia caía no default de código, que é o da EcoSunPower: um tenant
  // sem telefone cadastrado ficava com o WhatsApp PESSOAL do Junior, e sem CNPJ
  // ficava com o CNPJ e o CPF do RT dele — em proposta e contrato. Agora, campo
  // de identidade vazio fica VAZIO pra quem não é a EcoSun.
  const ehEcosun = s(row.company_id, D.companyId) === D.companyId;
  /** Identidade (texto): tenant sem valor fica vazio; só a EcoSun usa o default. */
  const sid = (v: unknown, d: string): string => (typeof v === 'string' && v.trim() ? v : ehEcosun ? d : '');
  /** Identidade (opcional): tenant sem valor fica null; só a EcoSun usa o default. */
  const sidn = (v: unknown, d: string | null): string | null => (typeof v === 'string' && v.trim() ? v : ehEcosun ? d : null);
  const result: EmpresaConfig = {
    // Linha histórica id=1 (pré-082) não tem company_id → é a EcoSun.
    companyId: s(row.company_id, D.companyId),
    razaoSocial: sid(row.razao_social, D.razaoSocial),
    nomeFantasia: sid(row.nome_fantasia, D.nomeFantasia),
    cnpj: sid(row.cnpj, D.cnpj),
    endereco: sid(row.endereco, D.endereco),
    cidade: sid(row.cidade, D.cidade), uf: sid(row.uf, D.uf), cep: sidn(row.cep, D.cep),
    email: sid(row.email, D.email), siteUrl: sid(row.site_url, D.siteUrl),
    linkPagamento: sidn(row.link_pagamento, D.linkPagamento),
    atuacaoDesde: n(row.atuacao_desde, D.atuacaoDesde),
    // Campos que entram em prompt — cap defensivo (espelha os CHECKs da
    // migration 049; protege mesmo se a coluna for alterada via SQL Editor).
    descricaoCurta: sid(row.descricao_curta, D.descricaoCurta).slice(0, 500),
    regiaoAtuacao: sid(row.regiao_atuacao, D.regiaoAtuacao).slice(0, 500),
    // "Eva" é a marca da assistente da EcoSunPower. Tenant que não deu nome fica
    // com o genérico — nunca com o nome da assistente de outra empresa.
    nomeAtendente: s(row.nome_atendente, ehEcosun ? D.nomeAtendente : 'Assistente').slice(0, 40),
    telefoneAtendente: sidn(row.telefone_atendente, D.telefoneAtendente),
    rtNome: sid(row.rt_nome, D.rtNome), rtTitulo: s(row.rt_titulo, D.rtTitulo).slice(0, 80),
    // ⚠️ fallback é o PRIMEIRO NOME do rtNome DESTA linha — nunca D.rtApelido,
    // senão a assistente de um tenant chamaria o dono de outro ("Junior").
    rtApelido: s(row.rt_apelido, primeiroNome(sid(row.rt_nome, D.rtNome))).slice(0, 40),
    rtGenero: row.rt_genero === 'f' ? 'f' : 'm',
    rtCpf: sidn(row.rt_cpf, D.rtCpf), rtRg: sidn(row.rt_rg, D.rtRg),
    rtRegistro: sidn(row.rt_registro, D.rtRegistro),
    pixChave: sidn(row.pix_chave, D.pixChave),
    // Tenant sem canais fica com lista vazia (não herda nada da EcoSun).
    canaisAtendimento: normalizarCanais(row.canais_atendimento),
    // Texto vai direto pro prompt: cap defensivo pra não estourar o contexto.
    politicaTriagem: sn(row.politica_triagem)?.slice(0, 3000) ?? null,
    criterioLeadValor: n(row.criterio_lead_valor, D.criterioLeadValor),
    criterioLeadKwh: n(row.criterio_lead_kwh, D.criterioLeadKwh),
    marcasPermitidas: arr(row.marcas_permitidas, D.marcasPermitidas),
    marcasBloqueadas: arr(row.marcas_bloqueadas, D.marcasBloqueadas),
    garantiaInstalacaoMeses: n(row.garantia_instalacao_meses, D.garantiaInstalacaoMeses),
    fatorPerdaPadrao: n(row.fator_perda_padrao, D.fatorPerdaPadrao),
    belenusAtivo: b(row.belenus_ativo, D.belenusAtivo),
    logoStoragePath: sn(row.logo_storage_path),
    corMarca: sn(row.cor_marca),
    // Tenant sem link cai no null (não herda o da EcoSun — avaliação é da empresa dela);
    // a EcoSun (row sem a coluna OU singleton default) usa o default de código.
    googleReviewUrl: 'google_review_url' in row ? sn(row.google_review_url) : D.googleReviewUrl,
    hspPadrao: nn(row.hsp_padrao),
    tarifaPadrao: nn(row.tarifa_kwh_padrao),
    concessionariaPadrao: sn(row.concessionaria_padrao),
    reguaAtencaoPct: n(row.regua_atencao_pct, D.reguaAtencaoPct),
  };
  Object.freeze(result.marcasPermitidas);
  Object.freeze(result.marcasBloqueadas);
  return Object.freeze(result);
}

// Placeholders de empresa pra prompts/textos. Mantém desconhecidos intactos.
export function interpolarEmpresa(texto: string, e: EmpresaConfig): string {
  // Artigo/contração de quem recebe o lead. Sem isso o prompt (escrito no
  // masculino) faria a assistente de uma empresa com vendedoras dizer
  // "o Jimena", "pro nossa equipe".
  const f = e.rtGenero === 'f';
  const mapa: Record<string, string> = {
    nome_atendente: e.nomeAtendente,
    empresa_nome: e.nomeFantasia,
    empresa_razao_social: e.razaoSocial,
    empresa_cnpj: e.cnpj,
    empresa_descricao: e.descricaoCurta,
    empresa_regiao: e.regiaoAtuacao,
    empresa_endereco: `${e.endereco}, ${e.cidade}-${e.uf}${e.cep ? `, CEP ${e.cep}` : ''}`,
    empresa_site: e.siteUrl,
    empresa_email: e.email,
    empresa_desde: String(e.atuacaoDesde),
    link_pagamento: e.linkPagamento ?? '',
    rt_nome: nomeTituloCase(e.rtNome),
    rt_apelido: e.rtApelido,
    rt_o: `${f ? 'a' : 'o'} ${e.rtApelido}`,
    rt_O: `${f ? 'A' : 'O'} ${e.rtApelido}`,
    rt_do: `${f ? 'da' : 'do'} ${e.rtApelido}`,
    rt_pro: `${f ? 'pra' : 'pro'} ${e.rtApelido}`,
    rt_pelo: `${f ? 'pela' : 'pelo'} ${e.rtApelido}`,
    rt_titulo: e.rtTitulo,
    rt_nosso_titulo: `${f ? 'nossa' : 'nosso'} ${e.rtTitulo}`,
    rt_O_titulo: `${f ? 'A' : 'O'} ${e.rtTitulo}`,
    criterio_lead_valor: String(e.criterioLeadValor),
    criterio_lead_kwh: String(e.criterioLeadKwh),
    marcas_texto: listaMarcasTexto(e),
    garantia_meses: String(e.garantiaInstalacaoMeses),
  };
  let out = texto;
  for (const [k, v] of Object.entries(mapa)) {
    // () => v: valor com "$&"/"$'" do banco não pode virar padrão de substituição.
    // Encadeamento ({{x}} dentro de valor) NÃO é suportado de propósito — dado é
    // admin-controlled e 1 passada é previsível.
    out = out.replaceAll(`{{${k}}}`, () => v);
  }
  return out;
}

// Nome em Title Case pra contextos visuais (banner, persona de blog) — o
// rt_nome é armazenado em CAIXA ALTA (padrão jurídico) e ficaria gritado.
// Ex.: "ANTONIO CANDIDO RODRIGUES JUNIOR" -> "Antonio Candido Rodrigues Junior".
export function nomeTituloCase(nome: string): string {
  return nome.toLowerCase().replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

/** Primeiro nome em Title Case — fallback do apelido do dono quando o tenant
 *  não preencheu rt_apelido. "MARIA SILVA SANTOS" -> "Maria". */
export function primeiroNome(nomeCompleto: string): string {
  const primeiro = nomeCompleto.trim().split(/\s+/)[0] ?? '';
  return primeiro ? nomeTituloCase(primeiro) : '';
}

export function listaMarcasTexto(e: EmpresaConfig): string {
  const base = `Trabalhamos com: ${e.marcasPermitidas.join(', ')}.`;
  if (e.marcasBloqueadas.length === 0) return base;
  return `${base} Não trabalhamos com ${e.marcasBloqueadas.join(', ')}.`;
}

// ---------------------------------------------------------------------------
// Cache + loader (I/O fino). init no boot; getter síncrono pro resto do app.
// [Fase 2 B1a] O cofre virou MULTI-EMPRESA por baixo: o loader carrega TODAS
// as linhas (migration 082: 1 linha por company) e o resto do app continua
// lendo empresa() (EcoSun) idêntico — call sites migram pra empresaDe(companyId)
// nas fatias B1b+ (proposta/contrato/Eva com a marca do tenant).
// ---------------------------------------------------------------------------
const ECOSUN_COMPANY = '00000000-0000-0000-0000-000000000001';
let cache: Readonly<EmpresaConfig> = EMPRESA_DEFAULTS;
// Flag: true após o primeiro carregamento bem-sucedido do banco.
let carregadaDoBanco = false;
// Config por empresa (companyId → config). EcoSun também mora aqui.
let cachePorEmpresa = new Map<string, Readonly<EmpresaConfig>>();

// [Fase 2 B1b] Contexto assíncrono: código rodando dentro de comEmpresaDe(...)
// vê empresa() responder pela EMPRESA DAQUELE CONTEXTO — os ~25 call sites do
// caminho da proposta (template, cartão, pagamento, logo) viram tenant-aware
// sem mudar assinatura nenhuma. Fora de contexto = cache global (EcoSun/clone).
const alsEmpresa = new AsyncLocalStorage<Readonly<EmpresaConfig>>();

export function empresa(): Readonly<EmpresaConfig> {
  return alsEmpresa.getStore() ?? cache;
}

/**
 * A empresa da vez é a EcoSunPower (dona da instalação)? Fora de contexto de
 * tenant também é true — o comportamento histórico. Usado pelo escopo da base
 * de conhecimento: tenant só enxerga o material técnico comum.
 */
export function ehEcosun(e: Readonly<EmpresaConfig> = empresa()): boolean {
  return e.companyId === ECOSUN_COMPANY;
}

/**
 * [B1a] Config da EMPRESA pedida. Miss (tenant sem linha na 082 ainda) devolve
 * os DEFAULTS EcoSun — nunca a linha de OUTRO tenant. Sync (cache do boot),
 * mesmo contrato do empresa().
 */
export function empresaDe(companyId?: string | null): Readonly<EmpresaConfig> {
  if (!companyId || companyId === ECOSUN_COMPANY) return cache;
  return cachePorEmpresa.get(companyId) ?? EMPRESA_DEFAULTS;
}

/**
 * [B1b] Roda `fn` com empresa() respondendo pela empresa do companyId — vale
 * pra tudo que rodar DENTRO (awaits inclusos, é AsyncLocalStorage). EcoSun ou
 * companyId ausente = mesmo cache global de sempre (byte-idêntico).
 */
/**
 * Todas as empresas que o boot carregou (a casa + os tenants). Usada pela
 * trava-marca-alheia pra saber quem NAO pode ser citado numa conversa —
 * assim cliente novo entra ja protegido, sem cadastrar nada.
 */
export function todasEmpresasConhecidas(): Readonly<EmpresaConfig>[] {
  return [cache, ...cachePorEmpresa.values()];
}

export function comEmpresaDe<T>(companyId: string | null | undefined, fn: () => T): T {
  return alsEmpresa.run(empresaDe(companyId), fn);
}

/** Apenas para testes — reseta estado interno do módulo entre casos. */
export function _resetEstadoParaTeste(): void {
  cache = EMPRESA_DEFAULTS;
  carregadaDoBanco = false;
  cachePorEmpresa = new Map();
}

export async function carregarEmpresaConfig(client: SupabaseClient): Promise<{ ok: boolean; config: Readonly<EmpresaConfig> }> {
  try {
    // [B1a] carrega TODAS as linhas (uma por empresa). Antes da 082 o select
    // devolve só a linha id=1 sem company_id → cai no ramo EcoSun (idêntico).
    const { data, error } = await client.from('empresa_config').select('*');
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (error || rows.length === 0) {
      console.warn('[empresa-config] tabela ausente/vazia — usando defaults EcoSun:', error?.message ?? 'sem linha');
      // Erro em RELOAD mantém a config anterior — num clone, rebaixar pra defaults EcoSun seria vazar a marca de outro tenant.
      if (!carregadaDoBanco) cache = EMPRESA_DEFAULTS;
      return { ok: false, config: cache };
    }
    const novoMapa = new Map<string, Readonly<EmpresaConfig>>();
    for (const row of rows) {
      const cfg = normalizarEmpresaRow(row);
      // Linha sem dono = a histórica id=1 (pré-082) = EcoSun.
      const dono = (typeof row.company_id === 'string' && row.company_id) ? row.company_id : ECOSUN_COMPANY;
      novoMapa.set(dono, cfg);
    }
    cachePorEmpresa = novoMapa;
    cache = novoMapa.get(ECOSUN_COMPANY) ?? cache;
    carregadaDoBanco = true;
    console.log(`[empresa-config] carregada: ${cache.nomeFantasia} (atendente: ${cache.nomeAtendente})${novoMapa.size > 1 ? ` · +${novoMapa.size - 1} tenant(s)` : ''}`);
    return { ok: true, config: cache };
  } catch (err) {
    console.warn('[empresa-config] falha ao carregar — defaults EcoSun:', (err as Error).message);
    // Erro em RELOAD mantém a config anterior — num clone, rebaixar pra defaults EcoSun seria vazar a marca de outro tenant.
    if (!carregadaDoBanco) cache = EMPRESA_DEFAULTS;
    return { ok: false, config: cache };
  }
}

export interface KitComercial {
  ordem: number; kwp: number; modulos: number; microinversores: number | null;
  geracaoKwhMes: number; precoBrl: number; descricao: string | null;
}

export async function carregarKits(client: SupabaseClient): Promise<KitComercial[]> {
  try {
    const { data, error } = await client.from('empresa_kits')
      .select('ordem, kwp, modulos, microinversores, geracao_kwh_mes, preco_brl, descricao')
      .eq('ativo', true).order('ordem');
    if (error) {
      console.warn('[empresa-config] carregarKits falhou:', error.message);
      return [];
    }
    if (!data || data.length === 0) return [];
    return (data as Array<Record<string, unknown>>).map((k) => ({
      ordem: Number(k.ordem), kwp: Number(k.kwp), modulos: Number(k.modulos),
      microinversores: k.microinversores == null ? null : Number(k.microinversores),
      geracaoKwhMes: Number(k.geracao_kwh_mes), precoBrl: Number(k.preco_brl),
      descricao: typeof k.descricao === 'string' ? k.descricao : null,
    }));
  } catch (err) {
    console.warn('[empresa-config] carregarKits falhou:', (err as Error).message);
    return [];
  }
}
