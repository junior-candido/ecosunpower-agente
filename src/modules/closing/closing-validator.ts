// src/modules/closing/closing-validator.ts
const onlyDigits = (s: unknown): string => {
  if (typeof s !== 'string') return '';
  return s.replace(/\D+/g, '');
};

export function isValidCPF(s: unknown): boolean {
  if (typeof s !== 'string') return false;
  return onlyDigits(s).length === 11;
}

export function isValidCNPJ(s: unknown): boolean {
  if (typeof s !== 'string') return false;
  return onlyDigits(s).length === 14;
}

export function isValidCEP(s: unknown): boolean {
  if (typeof s !== 'string') return false;
  return onlyDigits(s).length === 8;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(s: unknown): boolean {
  if (typeof s !== 'string') return false;
  return EMAIL_RE.test(s.trim());
}

export function isValidPhoneBR(s: unknown): boolean {
  if (typeof s !== 'string') return false;
  const d = onlyDigits(s);
  // 10 dígitos (DDD + 8) ou 11 (DDD + 9) ou 12/13 com +55
  return d.length === 10 || d.length === 11 || d.length === 12 || d.length === 13;
}

export function formatCPF(s: unknown): string {
  if (typeof s !== 'string') return '';
  const d = onlyDigits(s);
  if (d.length !== 11) return s;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

export function formatCNPJ(s: unknown): string {
  if (typeof s !== 'string') return '';
  const d = onlyDigits(s);
  if (d.length !== 14) return s;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

export function formatCEP(s: unknown): string {
  if (typeof s !== 'string') return '';
  const d = onlyDigits(s);
  if (d.length !== 8) return s;
  return `${d.slice(0, 5)}-${d.slice(5, 8)}`;
}

export function formatPhoneBR(s: unknown): string {
  if (typeof s !== 'string') return '';
  const d = onlyDigits(s);
  // Pega últimos 10 ou 11 (descarta +55 se vier)
  const local = d.length > 11 ? d.slice(-11) : d;
  if (local.length !== 10 && local.length !== 11) return s;
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
}

import type { DadosFechamento, PessoaFisica, PessoaJuridica, Endereco } from './types.js';

const REQUIRED_ENDERECO: (keyof Endereco)[] = ['rua', 'numero', 'bairro', 'cidade', 'uf', 'cep'];

function missingPessoa(prefix: string, p: Partial<PessoaFisica | PessoaJuridica> | undefined): string[] {
  if (!p) return [`${prefix}.nome`, `${prefix}.cpf`, `${prefix}.rg`, `${prefix}.endereco`, `${prefix}.telefone`, `${prefix}.email`];
  const miss: string[] = [];
  if (p.tipo === 'PJ') {
    if (!('razao_social' in p) || !p.razao_social) miss.push(`${prefix}.razao_social`);
    if (!('cnpj' in p) || !p.cnpj) miss.push(`${prefix}.cnpj`);
  } else {
    if (!('nome' in p) || !p.nome) miss.push(`${prefix}.nome`);
    if (!('cpf' in p) || !p.cpf) miss.push(`${prefix}.cpf`);
    if (!('rg' in p) || !p.rg) miss.push(`${prefix}.rg`);
    if (!('orgao_emissor_rg' in p) || !p.orgao_emissor_rg) miss.push(`${prefix}.orgao_emissor_rg`);
  }
  const end = (p as { endereco?: Partial<Endereco> }).endereco;
  if (!end) miss.push(`${prefix}.endereco`);
  else for (const k of REQUIRED_ENDERECO) if (!end[k]) miss.push(`${prefix}.endereco.${k}`);
  if (!p.telefone) miss.push(`${prefix}.telefone`);
  if (!p.email) miss.push(`${prefix}.email`);
  return miss;
}

export function findMissingRequired(d: Partial<DadosFechamento>): string[] {
  const miss: string[] = [];
  const docs = d.docs_pedidos ?? [];
  if (docs.length === 0) miss.push('docs_pedidos');

  const wantsContrato = docs.includes('contrato');
  const wantsProcuracao = docs.includes('procuracao');

  // Pessoa titular UC: sempre obrigatorio (nome/cpf/rg/endereco/UF/CEP)
  // — pega de missingPessoa mas filtra email/telefone se SO procuracao
  const titularMiss = missingPessoa('titular_uc', d.titular_uc);
  if (!wantsContrato && wantsProcuracao) {
    miss.push(...titularMiss.filter(m => m !== 'titular_uc.email' && m !== 'titular_uc.telefone'));
  } else {
    miss.push(...titularMiss);
  }

  if (!d.concessionaria) miss.push('concessionaria');
  if (!d.endereco_instalacao) miss.push('endereco_instalacao');

  // UC: obrigatorio pra procuracao (e ambos)
  if (wantsProcuracao && (!d.uc_numero || !d.uc_numero.trim())) {
    miss.push('uc_numero');
  }

  // Contratante (distinto): so importa pra contrato
  if (wantsContrato && d.contratante_eh_titular === false) {
    miss.push(...missingPessoa('contratante', d.contratante));
  }

  // Sistema + comercial: SO contrato
  if (wantsContrato) {
    if (!d.sistema) {
      miss.push('sistema.kwp', 'sistema.modalidade', 'sistema.modulos', 'sistema.inversor');
    } else {
      if (!d.sistema.kwp) miss.push('sistema.kwp');
      if (!d.sistema.modalidade) miss.push('sistema.modalidade');
      if (!d.sistema.modulos?.marca) miss.push('sistema.modulos');
      if (!d.sistema.inversor?.modelo) miss.push('sistema.inversor');
    }
    if (!d.comercial?.valor_total_brl) miss.push('comercial.valor_total_brl');
    if (!d.comercial?.forma_pagamento) miss.push('comercial.forma_pagamento');
  }

  return [...new Set(miss)]; // dedup
}

// Mapeia campo técnico (titular_uc.cpf etc) pra label amigável em PT-BR
// usada nas mensagens "falta X" mandadas pro Junior no zap.
const FIELD_LABELS: Record<string, string> = {
  'docs_pedidos': 'Quais docs (contrato, procuração ou ambos)',
  'uc_numero': 'Número da UC (na conta de luz)',
  'concessionaria': 'Concessionária',
  'endereco_instalacao': 'Endereço da instalação',
  'titular_uc.nome': 'Nome completo do titular',
  'titular_uc.cpf': 'CPF do titular',
  'titular_uc.cnpj': 'CNPJ do titular',
  'titular_uc.rg': 'RG do titular',
  'titular_uc.orgao_emissor_rg': 'Órgão emissor do RG',
  'titular_uc.razao_social': 'Razão social',
  'titular_uc.telefone': 'Telefone do titular',
  'titular_uc.email': 'E-mail do titular',
  'titular_uc.endereco': 'Endereço completo do titular',
  'contratante.nome': 'Nome do contratante',
  'contratante.cpf': 'CPF do contratante',
  'contratante.cnpj': 'CNPJ do contratante',
  'contratante.rg': 'RG do contratante',
  'contratante.orgao_emissor_rg': 'Órgão emissor RG contratante',
  'contratante.razao_social': 'Razão social do contratante',
  'contratante.telefone': 'Telefone do contratante',
  'contratante.email': 'E-mail do contratante',
  'contratante.endereco': 'Endereço do contratante',
  'sistema.kwp': 'Potência total (kWp)',
  'sistema.modalidade': 'Modalidade (autoconsumo local, remoto ou compartilhada)',
  'sistema.modulos': 'Módulos (marca + potência por painel + qtd)',
  'sistema.inversor': 'Inversor (marca + modelo)',
  'comercial.valor_total_brl': 'Valor total (R$)',
  'comercial.forma_pagamento': 'Forma de pagamento (à vista, parcelado, financiado)',
};

const ENDERECO_LABELS: Record<string, string> = {
  rua: 'rua', numero: 'nº', bairro: 'bairro',
  cidade: 'cidade', uf: 'UF', cep: 'CEP', complemento: 'complemento',
};

/**
 * Converte lista de campos técnicos faltantes em bullets PT-BR.
 * Agrupa sub-campos de endereço em uma linha só ("Endereço (rua, nº, ...)").
 */
export function humanizeMissing(missing: string[]): string {
  // Agrupar endereço por prefixo (titular_uc.endereco.* / contratante.endereco.* / endereco_instalacao.*)
  const grupos = new Map<string, string[]>();
  const naoAgrupados: string[] = [];

  for (const m of missing) {
    const enderecoMatch = m.match(/^(titular_uc|contratante|endereco_instalacao)\.endereco\.(\w+)$/);
    const instalacaoMatch = m.match(/^endereco_instalacao\.(\w+)$/);
    if (enderecoMatch) {
      const prefix = enderecoMatch[1];
      const subcampo = enderecoMatch[2];
      const arr = grupos.get(prefix) ?? [];
      arr.push(ENDERECO_LABELS[subcampo] ?? subcampo);
      grupos.set(prefix, arr);
    } else if (instalacaoMatch) {
      const arr = grupos.get('endereco_instalacao') ?? [];
      arr.push(ENDERECO_LABELS[instalacaoMatch[1]] ?? instalacaoMatch[1]);
      grupos.set('endereco_instalacao', arr);
    } else {
      naoAgrupados.push(m);
    }
  }

  const bullets: string[] = [];
  for (const m of naoAgrupados) {
    bullets.push(`• ${FIELD_LABELS[m] ?? m}`);
  }
  for (const [prefix, subs] of grupos) {
    const label = prefix === 'titular_uc' ? 'Endereço do titular'
                : prefix === 'contratante' ? 'Endereço do contratante'
                : 'Endereço da instalação';
    bullets.push(`• ${label} (${subs.join(', ')})`);
  }

  return bullets.join('\n');
}
