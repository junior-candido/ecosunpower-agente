// src/modules/closing/closing-validator.ts
const onlyDigits = (s: string) => s.replace(/\D+/g, '');

export function isValidCPF(s: string): boolean {
  return onlyDigits(s).length === 11;
}

export function isValidCNPJ(s: string): boolean {
  return onlyDigits(s).length === 14;
}

export function isValidCEP(s: string): boolean {
  return onlyDigits(s).length === 8;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(s: string): boolean {
  return EMAIL_RE.test(s.trim());
}

export function isValidPhoneBR(s: string): boolean {
  const d = onlyDigits(s);
  // 10 dígitos (DDD + 8) ou 11 (DDD + 9) ou 12/13 com +55
  return d.length === 10 || d.length === 11 || d.length === 12 || d.length === 13;
}

export function formatCPF(s: string): string {
  const d = onlyDigits(s);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

export function formatCNPJ(s: string): string {
  const d = onlyDigits(s);
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

export function formatCEP(s: string): string {
  const d = onlyDigits(s);
  return `${d.slice(0, 5)}-${d.slice(5, 8)}`;
}

export function formatPhoneBR(s: string): string {
  const d = onlyDigits(s);
  // Pega últimos 10 ou 11 (descarta +55 se vier)
  const local = d.length > 11 ? d.slice(-11) : d;
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
}
