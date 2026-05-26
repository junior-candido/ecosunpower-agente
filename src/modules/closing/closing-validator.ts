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
  if (!d.docs_pedidos || d.docs_pedidos.length === 0) miss.push('docs_pedidos');
  miss.push(...missingPessoa('titular_uc', d.titular_uc));
  if (!d.concessionaria) miss.push('concessionaria');
  if (!d.endereco_instalacao) miss.push('endereco_instalacao');
  if (d.contratante_eh_titular === false) {
    miss.push(...missingPessoa('contratante', d.contratante));
  }
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
  return miss;
}
