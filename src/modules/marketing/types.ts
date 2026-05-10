// src/modules/marketing/types.ts

export type CategoriaPortfolio =
  | 'on_grid_residencial'
  | 'on_grid_comercial'
  | 'hibrido'
  | 'off_grid'
  | 'ev_charger'
  | 'manutencao';

export interface Persona {
  id: number;
  codigo: string;
  nome: string;
  categoria_portfolio: CategoriaPortfolio;
  descricao: string;
  conta_minima_brl: number;
  consumo_minimo_kwh: number;
  regiao_alvo: string;
  palavras_proibidas: string[];
  contexto_marca: { tom?: string; exemplos?: string[]; valores?: string[] };
}

export interface CreativeCopy {
  length: 'curto' | 'medio' | 'longo';
  headline: string;
  body: string;
  cta: string;
}

export interface CreativeImage {
  url: string;
  style: 'fotorealista' | 'grafico' | 'depoimento';
  prompt_used: string;
}

export interface CreativePackage {
  briefing: string;
  persona_id: number;
  imagens: CreativeImage[];
  copies: CreativeCopy[];
  cta_primario: string;
  justificativa: string;
}

export interface FilterResult {
  passed: boolean;
  reason?: string;
}

export interface CreativeFilterResults {
  blocklist: FilterResult;
  marca: FilterResult;
  criterio_700: FilterResult;
  overall_passed: boolean;
}
