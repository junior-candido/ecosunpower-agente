// src/modules/empresa-config.ts
// Fonte ÚNICA dos dados da empresa (EcoSof Kit Clone). A EcoSunPower é o
// cliente nº 0: EMPRESA_DEFAULTS são os dados reais dela e servem de fallback
// quando a tabela ainda não existe (deploy antes da migration 049) — o
// comportamento fica idêntico ao hardcode antigo.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface EmpresaConfig {
  razaoSocial: string; nomeFantasia: string; cnpj: string;
  endereco: string; cidade: string; uf: string; cep: string | null;
  email: string; siteUrl: string; atuacaoDesde: number;
  descricaoCurta: string; regiaoAtuacao: string;
  nomeAtendente: string; telefoneAtendente: string | null;
  rtNome: string; rtTitulo: string; rtCpf: string | null; rtRg: string | null; rtRegistro: string | null;
  pixChave: string | null;
  criterioLeadValor: number; criterioLeadKwh: number;
  marcasPermitidas: string[]; marcasBloqueadas: string[];
  garantiaInstalacaoMeses: number; fatorPerdaPadrao: number; belenusAtivo: boolean;
  logoStoragePath: string | null;
  // região técnica (fallback quando UF do cliente não está no solar-params)
  hspPadrao: number | null;       // ex.: 5.40; null = usa o resolver atual por UF
  tarifaPadrao: number | null;    // ex.: 1.050; null = resolver atual
  concessionariaPadrao: string | null; // ex.: 'CEMIG-MG'; null = resolver atual
}

export const EMPRESA_DEFAULTS: EmpresaConfig = {
  razaoSocial: 'ECOSUNPOWER ENERGIA SOLAR LTDA',
  nomeFantasia: 'EcoSunPower',
  cnpj: '33.020.459/0001-06',
  endereco: 'SHA Conjunto 01 Chácara 44C Lote 6 - Arniqueira',
  cidade: 'Brasília', uf: 'DF', cep: '71993-150',
  email: 'junior@ecosunpower.eng.br',
  siteUrl: 'https://ecosunpower.eng.br',
  atuacaoDesde: 2019,
  descricaoCurta: 'empresa de engenharia em energia com atuação em Brasília-DF e Goiás desde 2019',
  regiaoAtuacao: 'Brasília e Entorno (DF) e cidades de Goiás até ~100 km (Águas Lindas, Valparaíso, Luziânia, Anápolis, Goiânia)',
  nomeAtendente: 'Eva',
  telefoneAtendente: '5561996978781',
  rtNome: 'ANTONIO CANDIDO RODRIGUES JUNIOR',
  rtTitulo: 'Responsável Técnico CREA/CFT',
  rtCpf: '989.404.571-53', rtRg: '2.202.520 SSP-DF', rtRegistro: '98940457153',
  pixChave: '33.020.459/0001-06',
  criterioLeadValor: 700, criterioLeadKwh: 700,
  marcasPermitidas: ['Trina Solar','JA Solar','Risen','Jinko Solar','LONGi','Honor','SolarEdge','Deye','Sungrow','Huawei','Hoymiles','Enphase','FoxESS','NEP','Solis','SolaX'],
  marcasBloqueadas: ['Growatt'],
  garantiaInstalacaoMeses: 12, fatorPerdaPadrao: 0.78, belenusAtivo: true,
  logoStoragePath: null,
  hspPadrao: null, tarifaPadrao: null, concessionariaPadrao: null,
};
// Congelado: dezenas de call sites vão ler isto — mutação acidental corromperia a config global.
Object.freeze(EMPRESA_DEFAULTS);
Object.freeze(EMPRESA_DEFAULTS.marcasPermitidas);
Object.freeze(EMPRESA_DEFAULTS.marcasBloqueadas);

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
  const result: EmpresaConfig = {
    razaoSocial: s(row.razao_social, D.razaoSocial),
    nomeFantasia: s(row.nome_fantasia, D.nomeFantasia),
    cnpj: s(row.cnpj, D.cnpj),
    endereco: s(row.endereco, D.endereco),
    cidade: s(row.cidade, D.cidade), uf: s(row.uf, D.uf), cep: sn(row.cep) ?? D.cep,
    email: s(row.email, D.email), siteUrl: s(row.site_url, D.siteUrl),
    atuacaoDesde: n(row.atuacao_desde, D.atuacaoDesde),
    descricaoCurta: s(row.descricao_curta, D.descricaoCurta),
    regiaoAtuacao: s(row.regiao_atuacao, D.regiaoAtuacao),
    nomeAtendente: s(row.nome_atendente, D.nomeAtendente),
    telefoneAtendente: sn(row.telefone_atendente) ?? D.telefoneAtendente,
    rtNome: s(row.rt_nome, D.rtNome), rtTitulo: s(row.rt_titulo, D.rtTitulo),
    rtCpf: sn(row.rt_cpf) ?? D.rtCpf, rtRg: sn(row.rt_rg) ?? D.rtRg,
    rtRegistro: sn(row.rt_registro) ?? D.rtRegistro,
    pixChave: sn(row.pix_chave) ?? D.pixChave,
    criterioLeadValor: n(row.criterio_lead_valor, D.criterioLeadValor),
    criterioLeadKwh: n(row.criterio_lead_kwh, D.criterioLeadKwh),
    marcasPermitidas: arr(row.marcas_permitidas, D.marcasPermitidas),
    marcasBloqueadas: arr(row.marcas_bloqueadas, D.marcasBloqueadas),
    garantiaInstalacaoMeses: n(row.garantia_instalacao_meses, D.garantiaInstalacaoMeses),
    fatorPerdaPadrao: n(row.fator_perda_padrao, D.fatorPerdaPadrao),
    belenusAtivo: b(row.belenus_ativo, D.belenusAtivo),
    logoStoragePath: sn(row.logo_storage_path),
    hspPadrao: nn(row.hsp_padrao),
    tarifaPadrao: nn(row.tarifa_kwh_padrao),
    concessionariaPadrao: sn(row.concessionaria_padrao),
  };
  Object.freeze(result.marcasPermitidas);
  Object.freeze(result.marcasBloqueadas);
  return Object.freeze(result);
}

// Placeholders de empresa pra prompts/textos. Mantém desconhecidos intactos.
export function interpolarEmpresa(texto: string, e: EmpresaConfig): string {
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
    rt_nome: e.rtNome,
    rt_titulo: e.rtTitulo,
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

export function listaMarcasTexto(e: EmpresaConfig): string {
  const base = `Trabalhamos com: ${e.marcasPermitidas.join(', ')}.`;
  if (e.marcasBloqueadas.length === 0) return base;
  return `${base} Não trabalhamos com ${e.marcasBloqueadas.join(', ')}.`;
}

// ---------------------------------------------------------------------------
// Cache + loader (I/O fino). init no boot; getter síncrono pro resto do app.
// ---------------------------------------------------------------------------
let cache: Readonly<EmpresaConfig> = EMPRESA_DEFAULTS;
// Flag: true após o primeiro carregamento bem-sucedido do banco.
let carregadaDoBanco = false;

export function empresa(): Readonly<EmpresaConfig> { return cache; }

/** Apenas para testes — reseta estado interno do módulo entre casos. */
export function _resetEstadoParaTeste(): void {
  cache = EMPRESA_DEFAULTS;
  carregadaDoBanco = false;
}

export async function carregarEmpresaConfig(client: SupabaseClient): Promise<{ ok: boolean; config: Readonly<EmpresaConfig> }> {
  try {
    const { data, error } = await client.from('empresa_config').select('*').eq('id', 1).maybeSingle();
    if (error || !data) {
      console.warn('[empresa-config] tabela ausente/vazia — usando defaults EcoSun:', error?.message ?? 'sem linha');
      // Erro em RELOAD mantém a config anterior — num clone, rebaixar pra defaults EcoSun seria vazar a marca de outro tenant.
      if (!carregadaDoBanco) cache = EMPRESA_DEFAULTS;
      return { ok: false, config: cache };
    }
    cache = normalizarEmpresaRow(data as Record<string, unknown>);
    carregadaDoBanco = true;
    console.log(`[empresa-config] carregada: ${cache.nomeFantasia} (atendente: ${cache.nomeAtendente})`);
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
