import { CAMPOS_USINA, CAMPOS_NOVO, type CampoUsina, type CampoNovo } from './types.js';

function vazio(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

// Recebe a linha do sistema (getSistemaById) e retorna os campos da usina vazios.
export function camposVaziosUsina(sistema: Record<string, unknown>): CampoUsina[] {
  return CAMPOS_USINA.filter((c) => vazio(sistema[c]));
}

export function proximoCampoNovo(campo: CampoNovo): CampoNovo | 'fim' {
  const i = CAMPOS_NOVO.indexOf(campo);
  return i < 0 || i >= CAMPOS_NOVO.length - 1 ? 'fim' : CAMPOS_NOVO[i + 1];
}

export function campoObrigatorioNovo(campo: CampoNovo): boolean {
  return campo === 'name' || campo === 'phone';
}

const PERGUNTAS_NOVO: Record<CampoNovo, string> = {
  name: 'Nome completo do cliente?',
  phone: 'Telefone com DDD? (ex: 61 99999-8888)',
  email: 'E-mail? (ou responda *pular*)',
  city: 'Cidade? (ou *pular*)',
  uf: 'UF? (2 letras, ou *pular*)',
  cep: 'CEP? (ou *pular*)',
};
export function perguntaNovo(campo: CampoNovo): string { return PERGUNTAS_NOVO[campo]; }

const PERGUNTAS_USINA: Record<CampoUsina, string> = {
  apelido: 'Qual o apelido/nome da usina? (ex: Casa do Henrique)',
  potencia_kwp: 'Potência da usina em kWp? (ex: 8.2 — ou *pular*)',
  cidade: 'Cidade da usina? (ou *pular*)',
  uf: 'UF da usina? (2 letras, ou *pular*)',
  data_instalacao: 'Data de instalação? (AAAA-MM-DD, ou *pular*)',
  inversor_modelo: 'Modelo do inversor? (ex: Sungrow SG5.0RS-L, ou *pular*)',
  observacoes: 'Alguma observação sobre a usina? (ou *pular*)',
};
export function perguntaUsina(campo: CampoUsina): string { return PERGUNTAS_USINA[campo]; }

// "pular" tolerante a acento/caixa.
export function ehPular(texto: string): boolean {
  return /^pular$/i.test(texto.trim());
}
