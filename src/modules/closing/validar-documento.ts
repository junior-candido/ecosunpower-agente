// src/modules/closing/validar-documento.ts
//
// 🚦 A TRAVA da saída: documento incompleto ou inválido não vira PDF, não vai
// pro zap do cliente e não é salvo no Drive.
//
// O preenchimento automático (fechamento-auto.ts) continua pondo "____" onde falta
// — é o que deixa a PRÉVIA mostrar o documento inteiro. Mas o que sai de verdade
// passa por aqui antes. Função PURA: recebe os dados e o HTML final, devolve a
// lista de problemas em português (vazia = pode sair).
import type { DadosFechamento, Endereco, PessoaFisica, PessoaJuridica } from './types.js';
import { cpfDigitoConfere } from './closing-validator.js';

export interface ResultadoValidacao {
  ok: boolean;
  problemas: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Varredura do HTML pronto
// ─────────────────────────────────────────────────────────────────────────────

/** Só o TEXTO que o cliente lê: sem <style>/<script>, comentários e tags. */
function textoVisivel(html: string): string {
  return String(html ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ');
}

const MARCADORES: Array<{ re: RegExp; descricao: string }> = [
  { re: /_{3,}/, descricao: 'espaço em branco para preencher à mão ("___")' },
  { re: /\[\[/, descricao: 'marcador de modelo não substituído ("[[")' },
  { re: /\]\]/, descricao: 'marcador de modelo não substituído ("]]")' },
  { re: /\bundefined\b/, descricao: 'valor vazio impresso como "undefined"' },
  { re: /\bnull\b/, descricao: 'valor vazio impresso como "null"' },
  { re: /\bNaN\b/, descricao: 'número inválido impresso como "NaN"' },
];

/** O que sobrou de lacuna/lixo no texto do documento. Vazio = limpo. */
export function acharMarcadores(html: string): string[] {
  const texto = textoVisivel(html);
  return MARCADORES.filter((m) => m.re.test(texto)).map((m) => m.descricao);
}

// ─────────────────────────────────────────────────────────────────────────────
// Campos obrigatórios
// ─────────────────────────────────────────────────────────────────────────────

/** Vazio de verdade: nada, só espaço, "____" do autopreenchimento ou "a confirmar". */
function vazio(v: unknown): boolean {
  const s = String(v ?? '').trim();
  if (!s) return true;
  if (s.includes('__')) return true;
  if (/^\(?a confirmar\)?$/i.test(s)) return true;
  if (s === 'undefined' || s === 'null' || s === 'NaN') return true;
  return false;
}

function numeroOk(v: unknown): boolean {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Nome, CPF/CNPJ, RG e endereço de uma pessoa. `quem` entra na mensagem. */
function faltasPessoa(p: Partial<PessoaFisica | PessoaJuridica> | undefined, quem: string): string[] {
  const x = obj(p);
  const out: string[] = [];
  if (x.tipo === 'PJ') {
    if (vazio(x.razao_social)) out.push(`Razão social ${quem}`);
    if (vazio(x.cnpj)) out.push(`CNPJ ${quem}`);
    else if (String(x.cnpj).replace(/\D/g, '').length !== 14) out.push(`CNPJ ${quem} inválido`);
    // Quem ASSINA pela empresa: o documento imprime nome, CPF e RG dele.
    const r = obj(x.representante);
    if (vazio(r.nome)) out.push('Nome do representante da empresa');
    if (vazio(r.cpf)) out.push('CPF do representante da empresa');
    else if (!cpfDigitoConfere(String(r.cpf))) out.push(`CPF do representante da empresa inválido (os dígitos não conferem: ${String(r.cpf)})`);
    if (vazio(r.rg)) out.push('RG do representante da empresa');
  } else {
    if (vazio(x.nome)) out.push(`Nome ${quem}`);
    if (vazio(x.cpf)) out.push(`CPF ${quem}`);
    else if (!cpfDigitoConfere(String(x.cpf))) out.push(`CPF ${quem} inválido (os dígitos não conferem: ${String(x.cpf)})`);
    if (vazio(x.rg)) out.push(`RG ${quem}`);
  }
  const e = obj(x.endereco) as Partial<Endereco>;
  const faltaEnd: string[] = [];
  if (vazio(e.rua)) faltaEnd.push('rua/quadra');
  if (vazio(e.numero)) faltaEnd.push('número');
  if (vazio(e.bairro)) faltaEnd.push('bairro');
  if (vazio(e.cidade)) faltaEnd.push('cidade');
  if (vazio(e.uf)) faltaEnd.push('UF');
  if (vazio(e.cep)) faltaEnd.push('CEP');
  if (faltaEnd.length) out.push(`Endereço ${quem} (${faltaEnd.join(', ')})`);
  return out;
}

function faltasUc(d: Partial<DadosFechamento>): string[] {
  const out: string[] = [];
  if (!d.ligacao_nova && vazio(d.uc_numero)) out.push('Unidade consumidora (código do cliente na conta de luz)');
  if (vazio(d.concessionaria)) out.push('Concessionária');
  return out;
}

function faltasVenda(d: Partial<DadosFechamento>): string[] {
  const out: string[] = [];
  const s = obj(d.sistema);
  const mod = obj(s.modulos);
  const inv = obj(s.inversor);
  if (!numeroOk(s.kwp)) out.push('Potência do sistema (kWp)');
  const faltaMod: string[] = [];
  if (vazio(mod.marca)) faltaMod.push('marca');
  if (!numeroOk(mod.potencia_w)) faltaMod.push('potência');
  if (!numeroOk(mod.quantidade)) faltaMod.push('quantidade');
  if (faltaMod.length) out.push(`Módulos (${faltaMod.join(', ')})`);
  const faltaInv: string[] = [];
  if (vazio(inv.marca)) faltaInv.push('marca');
  if (vazio(inv.modelo)) faltaInv.push('modelo');
  if (!numeroOk(inv.potencia_kw)) faltaInv.push('potência');
  if (faltaInv.length) out.push(`Inversor (${faltaInv.join(', ')})`);
  const c = obj(d.comercial);
  if (!numeroOk(c.valor_total_brl)) out.push('Valor total (R$)');
  if (vazio(c.forma_pagamento)) out.push('Forma de pagamento');
  return out;
}

/** CPF preenchido mas com dígito errado — vale pra qualquer documento. */
function cpfsInvalidos(d: Partial<DadosFechamento>): string[] {
  const out: string[] = [];
  const t = obj(d.titular_uc);
  if (t.tipo !== 'PJ' && !vazio(t.cpf) && !cpfDigitoConfere(String(t.cpf))) {
    out.push(`CPF do titular inválido (os dígitos não conferem: ${String(t.cpf)})`);
  }
  return out;
}

/**
 * Pode sair? `tipo` é o tipo da central ('fv' = contrato, 'procuracao', 'aditivo'...).
 * `dados` é o que vai no documento — de preferência o CRU (sem os padrões que o
 * autopreenchimento inventa, como "Neoenergia-DF"); o retrato congelado também
 * serve (os "____" dele contam como vazio). `html` é o documento final.
 */
export function validarDocumento(entrada: {
  tipo: string;
  dados: Partial<DadosFechamento>;
  html: string;
}): ResultadoValidacao {
  const { tipo, dados: d, html } = entrada;
  const problemas: string[] = [];

  if (tipo === 'fv') {
    problemas.push(...faltasPessoa(d.titular_uc, 'do titular'));
    if (d.contratante_eh_titular === false) problemas.push(...faltasPessoa(d.contratante, 'de quem assina'));
    problemas.push(...faltasUc(d));
    problemas.push(...faltasVenda(d));
  } else if (tipo === 'procuracao') {
    problemas.push(...faltasPessoa(d.titular_uc, 'do titular'));
    problemas.push(...faltasUc(d));
  } else {
    problemas.push(...cpfsInvalidos(d));
  }

  for (const m of acharMarcadores(html)) problemas.push(`O documento ainda tem ${m}`);

  const unicos = [...new Set(problemas)];
  return { ok: unicos.length === 0, problemas: unicos };
}

/**
 * Os problemas SEM dado pessoal — pro que vai pro fluxo de eventos (Elo). A
 * página de bloqueio pode mostrar "CPF inválido (os dígitos não conferem: …)" pro
 * operador; o evento guarda só "CPF do titular inválido". Tira o detalhe entre
 * parênteses que traz ":" (é onde o valor digitado aparece) e qualquer sequência
 * longa de dígitos que tenha sobrado.
 */
export function problemasSemDados(problemas: string[]): string[] {
  return problemas.map((p) => String(p ?? '')
    .replace(/\s*\([^()]*:[^()]*\)/g, '')
    .replace(/\d[\d.\-/]{6,}\d/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim());
}
