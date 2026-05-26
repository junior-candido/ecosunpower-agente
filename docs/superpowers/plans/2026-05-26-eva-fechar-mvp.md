# Eva /fechar MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o modo `/fechar` da Eva que reaproveita lead + última proposta pública do banco, pede só o que falta, gera contrato + procuração em PDF (HTML→Puppeteer) e sobe na pasta do cliente no Google Drive — com suporte a titular da UC ≠ contratante.

**Architecture:** Novo módulo isolado `src/modules/closing/` com sub-componentes pequenos e testáveis (types, validator, data-fetcher, templates, render, drive, persist, assistant, buttons). Tabela nova `fechamentos` guarda snapshot pra rastreabilidade. Integrações leves em `eva-admin-buttons.ts`, `proposal-assistant.ts`, `proposal-followup.ts` e `src/index.ts`.

**Tech Stack:** TypeScript + Node 20 (ESM) + Vitest 4 + Puppeteer 24 + googleapis 171 + Supabase 2 + ioredis 5 + Anthropic SDK 0.90 + Express 5

**Spec:** `docs/superpowers/specs/2026-05-26-eva-fechar-mvp-design.md`

---

## File Structure (decomposição)

### Criar
- `src/modules/closing/types.ts` — tipos centrais
- `src/modules/closing/closing-validator.ts` — validação CPF/CEP/email/telefone + obrigatórios
- `src/modules/closing/closing-data-fetcher.ts` — busca lead + última proposta_publica
- `src/modules/closing/templates/contrato.html.ts` — render HTML contrato
- `src/modules/closing/templates/procuracao.html.ts` — render HTML procuração
- `src/modules/closing/closing-render.ts` — HTML → PDF via Puppeteer
- `src/modules/closing/closing-drive.ts` — upload pasta + arquivos
- `src/modules/closing/closing-persist.ts` — repository pra tabela `fechamentos`
- `src/modules/closing/closing-assistant.ts` — orquestrador conversacional + estado Redis
- `src/modules/closing/closing-buttons.ts` — handlers `evabt:fechar*`
- `src/modules/closing/index.ts` — re-exports
- `src/prompts/closing-system.md` — system prompt LLM
- `supabase/migrations/036_fechamentos.sql`
- `tests/closing-validator.test.ts`
- `tests/closing-data-fetcher.test.ts`
- `tests/closing-templates-contrato.test.ts`
- `tests/closing-templates-procuracao.test.ts`
- `tests/closing-render.test.ts`
- `tests/closing-drive.test.ts`
- `tests/closing-persist.test.ts`
- `tests/closing-assistant.test.ts`
- `tests/closing-buttons.test.ts`
- `tests/fixtures/closing-camila.ts` — fixture canônica

### Modificar
- `src/modules/eva-admin-buttons.ts` — cases `fechar`, `fechar-pick`, `fechar-aprovar`, `fechar-refazer`, `fechar-cancelar`
- `src/modules/proposal-assistant.ts` — injetar botão "Fechou venda" no alerta de proposta gerada
- `src/modules/proposal-followup.ts` — injetar botão no alerta de proposta vista
- `src/index.ts` — rota de comando `/fechar` + roteamento de mensagens em modo closing
- `Dockerfile` — adicionar Chromium pra Puppeteer em prod

---

## Fatia 1 — Foundation (types + migration + validator)

### Task 1: Tipos centrais

**Files:**
- Create: `src/modules/closing/types.ts`

- [ ] **Step 1: Criar `src/modules/closing/types.ts`**

```typescript
// src/modules/closing/types.ts
// Tipos centrais do modo /fechar. Veja docs/superpowers/specs/2026-05-26-eva-fechar-mvp-design.md
//
// Modelo de 2 sujeitos:
//  - titular_uc: SEMPRE quem é titular da conta de luz, vai na PROCURAÇÃO.
//  - contratante: quem assina o CONTRATO. Pode ser igual ao titular_uc OU outra pessoa
//    (caso clássico: cônjuge negociou pela titular).

export type UF = 'DF' | 'GO';

export interface Endereco {
  rua: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: UF;
  cep: string;
}

export interface PessoaFisica {
  tipo: 'PF';
  nome: string;
  cpf: string;
  rg: string;
  orgao_emissor_rg: string;
  nacionalidade: string; // default 'Brasileiro(a)'
  estado_civil?: string;
  profissao?: string;
  data_nascimento?: string; // ISO yyyy-mm-dd
  endereco: Endereco;
  telefone: string;
  email: string;
}

export interface PessoaJuridica {
  tipo: 'PJ';
  razao_social: string;
  cnpj: string;
  endereco: Endereco;
  representante: PessoaFisica;
  telefone: string;
  email: string;
}

export type Pessoa = PessoaFisica | PessoaJuridica;

export type Modalidade = 'autoconsumo_local' | 'autoconsumo_remoto' | 'geracao_compartilhada';

export interface Sistema {
  kwp: number;
  modalidade: Modalidade;
  modulos: { marca: string; potencia_w: number; quantidade: number };
  inversor: { marca: string; modelo: string; potencia_kw: number };
}

export interface Comercial {
  valor_total_brl: number;
  forma_pagamento: string; // texto livre, ex: 'à vista PIX'
}

export type RelacaoContratante = 'conjuge' | 'socio' | 'familiar' | 'financiador' | 'outro';

export type Concessionaria = 'Neoenergia-DF' | 'Equatorial-GO';

export type DocPedido = 'contrato' | 'procuracao';

export interface DadosFechamento {
  titular_uc: Pessoa;
  uc_numero?: string; // 'a confirmar' se vazio
  concessionaria: Concessionaria;
  endereco_instalacao: Endereco;

  contratante: Pessoa;
  contratante_eh_titular: boolean;
  relacao_contratante?: RelacaoContratante;
  observacao_partes?: string;

  sistema: Sistema;
  comercial: Comercial;
  disposicoes_especiais?: string;

  docs_pedidos: DocPedido[];
}

export type ClosingState =
  | { stage: 'collecting'; data: Partial<DadosFechamento>; pending_questions: string[] }
  | { stage: 'awaiting_confirm'; data: DadosFechamento }
  | { stage: 'rendering'; data: DadosFechamento; fechamento_id: string };

export interface FechamentoRow {
  id: string;
  lead_id: string | null;
  proposta_publica_id: string | null;
  docs_pedidos: DocPedido[];
  dados_snapshot: DadosFechamento;
  contrato_drive_id: string | null;
  contrato_drive_link: string | null;
  procuracao_drive_id: string | null;
  procuracao_drive_link: string | null;
  drive_folder_id: string | null;
  status: 'gerado' | 'aprovado_junior' | 'enviado_cliente' | 'cancelado';
  created_at: string;
  created_by: string;
  updated_at: string;
}
```

- [ ] **Step 2: Verificar que builda**

Run: `cd "C:\Users\Meu Computador\Documents\ecosunpower-agente" && npx tsc --noEmit`
Expected: zero erros novos relativos a `closing/types.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/modules/closing/types.ts
git commit -m "feat(closing): tipos centrais DadosFechamento + 2 sujeitos

Define PF/PJ/Endereco/Sistema/Comercial e DadosFechamento com separação
titular_uc (procuração) ≠ contratante (contrato). RelacaoContratante
enum determinístico vira observacao_partes via template (não LLM)."
```

---

### Task 2: Migration 036 — tabela fechamentos

**Files:**
- Create: `supabase/migrations/036_fechamentos.sql`

- [ ] **Step 1: Criar migration**

```sql
-- supabase/migrations/036_fechamentos.sql
-- Tabela de fechamentos: cada execução do modo /fechar gera 1 linha.
-- dados_snapshot guarda DadosFechamento completo usado no render (rastreabilidade).
-- Veja docs/superpowers/specs/2026-05-26-eva-fechar-mvp-design.md

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS fechamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  proposta_publica_id uuid REFERENCES propostas_publicas(id) ON DELETE SET NULL,

  docs_pedidos text[] NOT NULL,
  dados_snapshot jsonb NOT NULL,

  contrato_drive_id text,
  contrato_drive_link text,
  procuracao_drive_id text,
  procuracao_drive_link text,
  drive_folder_id text,

  status text NOT NULL DEFAULT 'gerado',

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fechamentos_status_check
    CHECK (status IN ('gerado', 'aprovado_junior', 'enviado_cliente', 'cancelado')),
  CONSTRAINT fechamentos_docs_check
    CHECK (cardinality(docs_pedidos) > 0)
);

CREATE INDEX IF NOT EXISTS idx_fechamentos_lead
  ON fechamentos(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fechamentos_status
  ON fechamentos(status, created_at DESC);

COMMENT ON TABLE fechamentos IS
  'Execuções do modo /fechar. dados_snapshot guarda DadosFechamento renderizado nos PDFs.';
COMMENT ON COLUMN fechamentos.created_by IS
  'Telefone do admin (Junior ou ADMIN_EXTRA_PHONES) que disparou o /fechar.';
```

- [ ] **Step 2: Commit (aplicação manual no Supabase fica pro Junior)**

```bash
git add supabase/migrations/036_fechamentos.sql
git commit -m "feat(closing): migration 036 tabela fechamentos

Snapshot JSONB de DadosFechamento + links Drive + status enum.
Aplicar manualmente no Supabase SQL Editor (projeto kupnsoyymulbdzakqlqc)."
```

---

### Task 3: Validator — testes primeiro

**Files:**
- Create: `tests/closing-validator.test.ts`
- Create: `src/modules/closing/closing-validator.ts`

- [ ] **Step 1: Escrever testes de validação primitivos (failing)**

```typescript
// tests/closing-validator.test.ts
import { describe, it, expect } from 'vitest';
import {
  isValidCPF,
  isValidCNPJ,
  isValidCEP,
  isValidEmail,
  isValidPhoneBR,
  formatCPF,
  formatCEP,
  formatPhoneBR,
} from '../src/modules/closing/closing-validator.js';

describe('closing-validator primitives', () => {
  it('isValidCPF aceita 11 dígitos com ou sem máscara', () => {
    expect(isValidCPF('028.876.121-90')).toBe(true);
    expect(isValidCPF('02887612190')).toBe(true);
  });

  it('isValidCPF rejeita comprimento errado', () => {
    expect(isValidCPF('123')).toBe(false);
    expect(isValidCPF('028876121901234')).toBe(false);
  });

  it('isValidCNPJ aceita 14 dígitos', () => {
    expect(isValidCNPJ('33.020.459/0001-06')).toBe(true);
    expect(isValidCNPJ('33020459000106')).toBe(true);
  });

  it('isValidCEP aceita 8 dígitos', () => {
    expect(isValidCEP('72910-000')).toBe(true);
    expect(isValidCEP('72910000')).toBe(true);
    expect(isValidCEP('7291000')).toBe(false);
  });

  it('isValidEmail aceita formato básico', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('acmanutencaodf@hotmail.com')).toBe(true);
    expect(isValidEmail('inválido')).toBe(false);
  });

  it('isValidPhoneBR aceita DDD + 8/9 dígitos', () => {
    expect(isValidPhoneBR('(61) 99289-1958')).toBe(true);
    expect(isValidPhoneBR('61992891958')).toBe(true);
    expect(isValidPhoneBR('+5561992891958')).toBe(true);
    expect(isValidPhoneBR('123')).toBe(false);
  });

  it('formatCPF, formatCEP, formatPhoneBR aplicam máscara padrão', () => {
    expect(formatCPF('02887612190')).toBe('028.876.121-90');
    expect(formatCEP('72910000')).toBe('72910-000');
    expect(formatPhoneBR('61992891958')).toBe('(61) 99289-1958');
  });
});
```

- [ ] **Step 2: Rodar testes pra confirmar falha**

Run: `cd "C:\Users\Meu Computador\Documents\ecosunpower-agente" && npx vitest run tests/closing-validator.test.ts`
Expected: FAIL — module not found / exports undefined.

- [ ] **Step 3: Implementar primitivos**

```typescript
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
```

- [ ] **Step 4: Rodar testes pra passar**

Run: `npx vitest run tests/closing-validator.test.ts`
Expected: PASS — 6/6 testes.

- [ ] **Step 5: Commit**

```bash
git add tests/closing-validator.test.ts src/modules/closing/closing-validator.ts
git commit -m "feat(closing): validator primitives CPF/CNPJ/CEP/email/phone

Sem dígito verificador real (KISS MVP). Aceita com e sem máscara,
formata via funções format*."
```

---

### Task 4: Validator — findMissingRequired

**Files:**
- Modify: `src/modules/closing/closing-validator.ts`
- Modify: `tests/closing-validator.test.ts`

- [ ] **Step 1: Adicionar testes pra findMissingRequired (failing)**

```typescript
// Adicionar no fim de tests/closing-validator.test.ts
import { findMissingRequired } from '../src/modules/closing/closing-validator.js';

describe('findMissingRequired', () => {
  it('lista todos obrigatórios quando dados vazios', () => {
    const missing = findMissingRequired({});
    expect(missing).toContain('titular_uc.nome');
    expect(missing).toContain('titular_uc.cpf');
    expect(missing).toContain('titular_uc.rg');
    expect(missing).toContain('sistema.kwp');
    expect(missing).toContain('comercial.valor_total_brl');
    expect(missing).toContain('comercial.forma_pagamento');
    expect(missing).toContain('docs_pedidos');
  });

  it('não pede RG se docs_pedidos não inclui procuração nem contrato', () => {
    // Caso impossível mas valida lógica do schema
    const missing = findMissingRequired({ docs_pedidos: [] });
    expect(missing).toContain('docs_pedidos');
  });

  it('quando contratante_eh_titular=true, não pede dados do contratante separadamente', () => {
    const missing = findMissingRequired({
      titular_uc: {
        tipo: 'PF', nome: 'X', cpf: '02887612190', rg: '26163',
        orgao_emissor_rg: 'MTE-DF', nacionalidade: 'Brasileiro(a)',
        endereco: { rua: 'a', numero: '1', bairro: 'b', cidade: 'c', uf: 'DF', cep: '70000000' },
        telefone: '61999999999', email: 'a@b.co',
      },
      contratante_eh_titular: true,
      docs_pedidos: ['contrato', 'procuracao'],
      uc_numero: 'a confirmar',
      concessionaria: 'Neoenergia-DF',
      endereco_instalacao: { rua: 'a', numero: '1', bairro: 'b', cidade: 'c', uf: 'DF', cep: '70000000' },
      sistema: {
        kwp: 8.4, modalidade: 'autoconsumo_local',
        modulos: { marca: 'Trina', potencia_w: 700, quantidade: 12 },
        inversor: { marca: 'Sungrow', modelo: 'SG5.0RS-L', potencia_kw: 5 },
      },
      comercial: { valor_total_brl: 38500, forma_pagamento: 'à vista PIX' },
    });
    expect(missing).toEqual([]);
  });

  it('quando contratante_eh_titular=false, pede dados do contratante', () => {
    const missing = findMissingRequired({
      titular_uc: { /* idem completo */ tipo: 'PF', nome: 'X', cpf: '02887612190', rg: '26163',
        orgao_emissor_rg: 'MTE-DF', nacionalidade: 'Brasileiro(a)',
        endereco: { rua: 'a', numero: '1', bairro: 'b', cidade: 'c', uf: 'DF', cep: '70000000' },
        telefone: '61999999999', email: 'a@b.co' },
      contratante_eh_titular: false,
      docs_pedidos: ['contrato'],
    } as any);
    expect(missing.some((m) => m.startsWith('contratante.'))).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar pra falhar**

Run: `npx vitest run tests/closing-validator.test.ts`
Expected: FAIL — `findMissingRequired is not a function`.

- [ ] **Step 3: Implementar findMissingRequired**

Adicionar no final de `src/modules/closing/closing-validator.ts`:

```typescript
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
```

- [ ] **Step 4: Rodar pra passar**

Run: `npx vitest run tests/closing-validator.test.ts`
Expected: PASS — todos os testes.

- [ ] **Step 5: Commit**

```bash
git add tests/closing-validator.test.ts src/modules/closing/closing-validator.ts
git commit -m "feat(closing): findMissingRequired lista campos faltantes

Pula contratante se contratante_eh_titular=true (copia titular_uc no render).
Endereço quebrado em sub-campos pra mensagem precisa pro Junior."
```

---

## Fatia 2 — Data fetcher

### Task 5: Fixture canônica Camila

**Files:**
- Create: `tests/fixtures/closing-camila.ts`

- [ ] **Step 1: Criar fixture com lead + proposta_publica + DadosFechamento esperado**

```typescript
// tests/fixtures/closing-camila.ts
// Fixture canônica usada em vários testes do módulo closing.
// Reflete o caso real Camila Cardoso (contrato em tmp/contrato-camila.html).

import type { DadosFechamento } from '../../src/modules/closing/types.js';

export const leadCamilaRow = {
  id: '11111111-1111-1111-1111-111111111111',
  nome: 'Camila Barbosa Costa Cardoso',
  telefone: '5561992891958',
  email: 'acmanutencaodf@hotmail.com',
  cpf_cnpj: '028.876.121-90',
  data_nascimento: '1989-06-21',
  estado_civil: 'casado(a)',
  cep: '72910-000',
  endereco_rua: 'Rua sem nome, Quadra 38, Lote 01A-1',
  endereco_numero: 'S/N',
  endereco_complemento: null,
  uf: 'GO',
  concessionaria: 'Equatorial-GO',
  uc_numero: '10005936703',
  forma_pagamento: 'à vista PIX',
};

export const propostaPublicaCamilaRow = {
  id: '22222222-2222-2222-2222-222222222222',
  slug: 'cam7Lqx9P',
  numero_proposta: 'P-2026-0428-001',
  cliente_nome: 'Camila Barbosa Costa Cardoso',
  cliente_telefone: '5561992891958',
  html_content: '<html>...</html>',
  dados_input: {
    potencia_kwp: 8.4,
    modalidade: 'autoconsumo_local',
    modulos: { marca: 'Trina Vertex', potencia_w: 700, quantidade: 12 },
    inversor: { marca: 'Sungrow', modelo: 'SG5.0RS-L', potencia_kw: 5 },
    valor_total: 38500,
  },
  created_at: '2026-04-28T15:42:00Z',
};

export const dadosFechamentoCamilaMesmaPessoa: DadosFechamento = {
  titular_uc: {
    tipo: 'PF',
    nome: 'Camila Barbosa Costa Cardoso',
    cpf: '028.876.121-90',
    rg: '26163',
    orgao_emissor_rg: 'MTE-DF',
    nacionalidade: 'Brasileiro(a)',
    estado_civil: 'casado(a)',
    profissao: 'empresária',
    data_nascimento: '1989-06-21',
    endereco: {
      rua: 'Rua sem nome, Quadra 38, Lote 01A-1',
      numero: 'S/N',
      bairro: 'Jardim Guaíra II',
      cidade: 'Águas Lindas de Goiás',
      uf: 'GO',
      cep: '72910-000',
    },
    telefone: '5561992891958',
    email: 'acmanutencaodf@hotmail.com',
  },
  uc_numero: '10005936703',
  concessionaria: 'Equatorial-GO',
  endereco_instalacao: {
    rua: 'Rua sem nome, Quadra 38, Lote 01A-1',
    numero: 'S/N',
    bairro: 'Jardim Guaíra II',
    cidade: 'Águas Lindas de Goiás',
    uf: 'GO',
    cep: '72910-000',
  },
  contratante: {
    tipo: 'PF',
    nome: 'Camila Barbosa Costa Cardoso',
    cpf: '028.876.121-90',
    rg: '26163',
    orgao_emissor_rg: 'MTE-DF',
    nacionalidade: 'Brasileiro(a)',
    estado_civil: 'casado(a)',
    profissao: 'empresária',
    endereco: {
      rua: 'Rua sem nome, Quadra 38, Lote 01A-1',
      numero: 'S/N',
      bairro: 'Jardim Guaíra II',
      cidade: 'Águas Lindas de Goiás',
      uf: 'GO',
      cep: '72910-000',
    },
    telefone: '5561992891958',
    email: 'acmanutencaodf@hotmail.com',
  },
  contratante_eh_titular: true,
  sistema: {
    kwp: 8.4,
    modalidade: 'autoconsumo_local',
    modulos: { marca: 'Trina Vertex', potencia_w: 700, quantidade: 12 },
    inversor: { marca: 'Sungrow', modelo: 'SG5.0RS-L', potencia_kw: 5 },
  },
  comercial: {
    valor_total_brl: 38500,
    forma_pagamento: 'à vista PIX',
  },
  docs_pedidos: ['contrato', 'procuracao'],
};

export const dadosFechamentoCamilaToninhoContrato: DadosFechamento = {
  ...dadosFechamentoCamilaMesmaPessoa,
  contratante: {
    tipo: 'PF',
    nome: 'Antônio Carlos "Toninho"',
    cpf: '444.555.666-77',
    rg: '9876543',
    orgao_emissor_rg: 'SSP-DF',
    nacionalidade: 'Brasileiro(a)',
    estado_civil: 'casado(a)',
    profissao: 'empresário',
    endereco: dadosFechamentoCamilaMesmaPessoa.titular_uc.endereco!, // mesma residência
    telefone: '5561992891958',
    email: 'acmanutencaodf@hotmail.com',
  },
  contratante_eh_titular: false,
  relacao_contratante: 'conjuge',
  observacao_partes:
    'A negociação comercial foi conduzida com o cônjuge da titular da UC, Sr. Antônio Carlos "Toninho", que atua como CONTRATANTE no presente contrato.',
};
```

- [ ] **Step 2: Commit**

```bash
git add tests/fixtures/closing-camila.ts
git commit -m "test(closing): fixture canônica Camila Cardoso

Lead row + proposta_publica row + 2 DadosFechamento (mesma pessoa vs
contratante=cônjuge). Reusada nos testes de data-fetcher, templates e
e2e."
```

---

### Task 6: Data fetcher — busca lead + proposta

**Files:**
- Create: `src/modules/closing/closing-data-fetcher.ts`
- Create: `tests/closing-data-fetcher.test.ts`

- [ ] **Step 1: Escrever testes (failing)**

```typescript
// tests/closing-data-fetcher.test.ts
import { describe, it, expect, vi } from 'vitest';
import { fetchByLeadId, searchLeadByName, buildInitialData } from '../src/modules/closing/closing-data-fetcher.js';
import { leadCamilaRow, propostaPublicaCamilaRow } from './fixtures/closing-camila.js';

function mockSupabase(opts: {
  leadById?: any;
  leadsByName?: any[];
  propostas?: any[];
}) {
  return {
    from: (table: string) => {
      if (table === 'leads') {
        return {
          select: () => ({
            eq: (col: string, val: string) => ({
              maybeSingle: async () => ({ data: opts.leadById ?? null, error: null }),
            }),
            ilike: (col: string, val: string) => ({
              order: () => ({
                limit: () => ({ data: opts.leadsByName ?? [], error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'propostas_publicas') {
        return {
          select: () => ({
            or: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: opts.propostas?.[0] ?? null, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
  } as any;
}

describe('closing-data-fetcher', () => {
  it('fetchByLeadId retorna lead + última proposta', async () => {
    const sb = mockSupabase({ leadById: leadCamilaRow, propostas: [propostaPublicaCamilaRow] });
    const res = await fetchByLeadId(sb, leadCamilaRow.id);
    expect(res.lead).toBeTruthy();
    expect(res.lead!.id).toBe(leadCamilaRow.id);
    expect(res.proposta).toBeTruthy();
    expect(res.proposta!.dados_input.potencia_kwp).toBe(8.4);
  });

  it('fetchByLeadId retorna proposta null quando não acha', async () => {
    const sb = mockSupabase({ leadById: leadCamilaRow, propostas: [] });
    const res = await fetchByLeadId(sb, leadCamilaRow.id);
    expect(res.proposta).toBeNull();
  });

  it('searchLeadByName retorna [] quando vazio', async () => {
    const sb = mockSupabase({ leadsByName: [] });
    const res = await searchLeadByName(sb, 'Inexistente');
    expect(res).toEqual([]);
  });

  it('searchLeadByName retorna múltiplos quando ambíguo', async () => {
    const sb = mockSupabase({
      leadsByName: [leadCamilaRow, { ...leadCamilaRow, id: '99', nome: 'Camila Outra' }],
    });
    const res = await searchLeadByName(sb, 'Camila');
    expect(res).toHaveLength(2);
  });

  it('buildInitialData mapeia lead + proposta pra Partial<DadosFechamento>', () => {
    const partial = buildInitialData(leadCamilaRow, propostaPublicaCamilaRow);
    expect(partial.titular_uc?.tipo).toBe('PF');
    expect((partial.titular_uc as any)?.nome).toBe(leadCamilaRow.nome);
    expect((partial.titular_uc as any)?.cpf).toBe(leadCamilaRow.cpf_cnpj);
    expect(partial.concessionaria).toBe('Equatorial-GO');
    expect(partial.uc_numero).toBe('10005936703');
    expect(partial.sistema?.kwp).toBe(8.4);
    expect(partial.comercial?.valor_total_brl).toBe(38500);
    // RG não vem do banco
    expect((partial.titular_uc as any)?.rg).toBeUndefined();
  });

  it('buildInitialData infere concessionária pela UF se faltar', () => {
    const partial = buildInitialData({ ...leadCamilaRow, concessionaria: null, uf: 'DF' }, null);
    expect(partial.concessionaria).toBe('Neoenergia-DF');
  });
});
```

- [ ] **Step 2: Rodar pra falhar**

Run: `npx vitest run tests/closing-data-fetcher.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implementar data-fetcher**

```typescript
// src/modules/closing/closing-data-fetcher.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DadosFechamento, Concessionaria, UF, PessoaFisica, Endereco } from './types.js';

export interface LeadRow {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  cpf_cnpj: string | null;
  data_nascimento: string | null;
  estado_civil: string | null;
  cep: string | null;
  endereco_rua: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
  uf: string | null;
  concessionaria: string | null;
  uc_numero: string | null;
  forma_pagamento: string | null;
}

export interface PropostaPublicaRow {
  id: string;
  cliente_nome: string;
  cliente_telefone: string | null;
  dados_input: {
    potencia_kwp?: number;
    modalidade?: string;
    modulos?: { marca?: string; potencia_w?: number; quantidade?: number };
    inversor?: { marca?: string; modelo?: string; potencia_kw?: number };
    valor_total?: number;
  } | null;
  created_at: string;
}

export interface FetchResult {
  lead: LeadRow | null;
  proposta: PropostaPublicaRow | null;
}

export async function fetchByLeadId(sb: SupabaseClient, leadId: string): Promise<FetchResult> {
  const leadRes = await sb.from('leads').select('*').eq('id', leadId).maybeSingle();
  if (leadRes.error) throw leadRes.error;
  const lead = leadRes.data as LeadRow | null;
  if (!lead) return { lead: null, proposta: null };

  const propRes = await sb
    .from('propostas_publicas')
    .select('*')
    .or(`cliente_telefone.eq.${lead.telefone},cliente_nome.ilike.%${lead.nome}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (propRes.error) throw propRes.error;
  return { lead, proposta: (propRes.data as PropostaPublicaRow | null) ?? null };
}

export async function searchLeadByName(sb: SupabaseClient, term: string): Promise<LeadRow[]> {
  const res = await sb
    .from('leads')
    .select('*')
    .ilike('nome', `%${term}%`)
    .order('created_at', { ascending: false })
    .limit(10);
  if (res.error) throw res.error;
  return (res.data as LeadRow[]) ?? [];
}

function inferConcessionaria(uf: string | null): Concessionaria | undefined {
  if (uf === 'DF') return 'Neoenergia-DF';
  if (uf === 'GO') return 'Equatorial-GO';
  return undefined;
}

function buildEndereco(lead: LeadRow): Partial<Endereco> {
  return {
    rua: lead.endereco_rua ?? undefined,
    numero: lead.endereco_numero ?? undefined,
    complemento: lead.endereco_complemento ?? undefined,
    uf: (lead.uf as UF) ?? undefined,
    cep: lead.cep ?? undefined,
  } as Partial<Endereco>;
}

export function buildInitialData(
  lead: LeadRow,
  proposta: PropostaPublicaRow | null,
): Partial<DadosFechamento> {
  const cpfDigits = (lead.cpf_cnpj ?? '').replace(/\D+/g, '');
  const tipo: 'PF' | 'PJ' = cpfDigits.length === 14 ? 'PJ' : 'PF';
  const endereco = buildEndereco(lead);

  const titular_uc: Partial<PessoaFisica> = {
    tipo: 'PF',
    nome: lead.nome,
    cpf: lead.cpf_cnpj ?? undefined,
    estado_civil: lead.estado_civil ?? undefined,
    data_nascimento: lead.data_nascimento ?? undefined,
    nacionalidade: 'Brasileiro(a)',
    endereco: endereco as Endereco, // pode estar incompleto, validator pega
    telefone: lead.telefone ?? undefined,
    email: lead.email ?? undefined,
  };

  const partial: Partial<DadosFechamento> = {
    titular_uc: titular_uc as any,
    contratante: titular_uc as any,
    contratante_eh_titular: true,
    uc_numero: lead.uc_numero ?? undefined,
    concessionaria: (lead.concessionaria as Concessionaria) ?? inferConcessionaria(lead.uf),
    endereco_instalacao: endereco as Endereco,
  };

  if (proposta?.dados_input) {
    const d = proposta.dados_input;
    if (d.potencia_kwp != null) {
      partial.sistema = {
        kwp: d.potencia_kwp,
        modalidade: (d.modalidade as any) ?? 'autoconsumo_local',
        modulos: {
          marca: d.modulos?.marca ?? '',
          potencia_w: d.modulos?.potencia_w ?? 0,
          quantidade: d.modulos?.quantidade ?? 0,
        },
        inversor: {
          marca: d.inversor?.marca ?? '',
          modelo: d.inversor?.modelo ?? '',
          potencia_kw: d.inversor?.potencia_kw ?? 0,
        },
      };
    }
    if (d.valor_total != null) {
      partial.comercial = {
        valor_total_brl: d.valor_total,
        forma_pagamento: lead.forma_pagamento ?? '',
      };
    }
  }

  return partial;
}
```

- [ ] **Step 4: Rodar pra passar**

Run: `npx vitest run tests/closing-data-fetcher.test.ts`
Expected: PASS — 6 testes.

- [ ] **Step 5: Commit**

```bash
git add tests/closing-data-fetcher.test.ts src/modules/closing/closing-data-fetcher.ts
git commit -m "feat(closing): data-fetcher busca lead + última proposta pública

fetchByLeadId, searchLeadByName e buildInitialData mapeia leads +
propostas_publicas.dados_input pra Partial<DadosFechamento>. Infere
concessionária pela UF quando faltar. RG nunca vem do banco — sempre
pendente."
```

---

## Fatia 3 — Templates HTML

### Task 7: Reconstruir HTML da procuração a partir do PDF

**Files:**
- Create: `src/modules/closing/templates/procuracao.html.ts` (esqueleto inicial)
- Reference: `tmp/procuracao-camila.pdf`
- Reference: `conhecimento/contratos.md`

- [ ] **Step 1: Extrair texto do PDF de procuração da Camila pra ter base**

Run em `C:\Users\Meu Computador\Documents\ecosunpower-agente`:

```bash
# Usa pdftotext (já vem com Poppler que está instalado conforme memory project_eva_conhecimento_tecnico)
pdftotext -layout tmp/procuracao-camila.pdf tmp/procuracao-camila.txt
```

Expected: cria `tmp/procuracao-camila.txt` com o texto bruto da procuração.

- [ ] **Step 2: Ler o texto extraído pra entender estrutura**

Read: `tmp/procuracao-camila.txt`

Identificar:
- Cabeçalho ("PROCURAÇÃO" ou "INSTRUMENTO PARTICULAR DE PROCURAÇÃO")
- Outorgante (titular UC)
- Outorgado (EcoSunPower / Junior CREA/CFT)
- Objeto/poderes (representação perante concessionária)
- Validade
- Cidade + data
- Linha de assinatura

- [ ] **Step 3: Criar `src/modules/closing/templates/procuracao.html.ts` esqueleto com placeholders**

```typescript
// src/modules/closing/templates/procuracao.html.ts
// Renderiza HTML da procuração específica pra concessionária.
// Outorgante = SEMPRE titular_uc (quem é titular da conta de luz).
// Outorgado = EcoSunPower Energia Solar LTDA (Junior CREA/CFT).
//
// Base: tmp/procuracao-camila.pdf + spec contratos.md.

import type { DadosFechamento, PessoaFisica, PessoaJuridica } from '../types.js';

const OUTORGADO = {
  razao_social: 'ECOSUNPOWER ENERGIA SOLAR LTDA',
  cnpj: '33.020.459/0001-06',
  endereco: 'SHA Conjunto 01 Chácara 44C Lote 6, Arniqueira, Brasília-DF, CEP 71993-150',
  representante_nome: 'ANTONIO CANDIDO RODRIGUES JUNIOR',
  representante_cpf: '989.404.571-53',
  representante_rg: '2.202.520 SSP-DF',
  representante_crea: '98940457153',
  representante_titulo: 'Responsável Técnico',
};

function fmtPF(p: PessoaFisica): string {
  const estadoCivil = p.estado_civil ? `${p.estado_civil}, ` : '';
  const profissao = p.profissao ? `${p.profissao}, ` : '';
  const enderecoStr = `${p.endereco.rua}, ${p.endereco.numero}${p.endereco.complemento ? ', ' + p.endereco.complemento : ''}, ${p.endereco.bairro}, ${p.endereco.cidade}-${p.endereco.uf}, CEP ${p.endereco.cep}`;
  return `${p.nome}, ${p.nacionalidade}, ${estadoCivil}${profissao}inscrito(a) no CPF/MF sob o nº ${p.cpf}, RG nº ${p.rg} ${p.orgao_emissor_rg}, residente e domiciliado(a) no endereço ${enderecoStr}`;
}

function fmtPJ(p: PessoaJuridica): string {
  return `${p.razao_social}, pessoa jurídica inscrita no CNPJ sob o nº ${p.cnpj}, com sede em ${p.endereco.rua}, ${p.endereco.numero}, ${p.endereco.bairro}, ${p.endereco.cidade}-${p.endereco.uf}, CEP ${p.endereco.cep}, neste ato representada por ${fmtPF(p.representante)}`;
}

function fmtPessoa(p: PessoaFisica | PessoaJuridica): string {
  return p.tipo === 'PJ' ? fmtPJ(p) : fmtPF(p);
}

function hojeFormatado(): string {
  const d = new Date();
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

export function renderProcuracao(dados: DadosFechamento): string {
  const outorgante = fmtPessoa(dados.titular_uc);
  const cidade = dados.titular_uc.endereco.cidade;
  const uf = dados.titular_uc.endereco.uf;
  const data = hojeFormatado();
  const uc = dados.uc_numero ?? '(a confirmar)';
  const concessionaria = dados.concessionaria;
  const enderecoInstalacao = `${dados.endereco_instalacao.rua}, ${dados.endereco_instalacao.numero}, ${dados.endereco_instalacao.bairro}, ${dados.endereco_instalacao.cidade}-${dados.endereco_instalacao.uf}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Procuração ${dados.titular_uc.tipo === 'PF' ? dados.titular_uc.nome : dados.titular_uc.razao_social} - EcoSunPower</title>
<style>
  @page { size: A4; margin: 2cm 2.2cm; }
  body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.6; }
  h1 { text-align: center; font-size: 14pt; color: #0c4a6e; margin-bottom: 24pt; }
  h2 { font-size: 12pt; color: #0c4a6e; margin-top: 16pt; margin-bottom: 8pt; }
  p { text-align: justify; margin: 10pt 0; }
  strong { color: #0c4a6e; }
  .assinatura { margin-top: 48pt; }
  .assinatura .linha { border-bottom: 1px solid #1a1a1a; width: 60%; margin: 36pt 0 6pt; }
  .local-data { margin-top: 36pt; text-align: right; }
</style>
</head>
<body>

<h1>INSTRUMENTO PARTICULAR DE PROCURAÇÃO</h1>

<h2>OUTORGANTE</h2>
<p>${outorgante}, doravante denominado(a) <strong>OUTORGANTE</strong>.</p>

<h2>OUTORGADA</h2>
<p><strong>${OUTORGADO.razao_social}</strong>, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${OUTORGADO.cnpj}, com sede na ${OUTORGADO.endereco}, neste ato representada por <strong>${OUTORGADO.representante_nome}</strong>, brasileiro, ${OUTORGADO.representante_titulo}, portador do CPF nº ${OUTORGADO.representante_cpf}, RG nº ${OUTORGADO.representante_rg}, registrado no CREA/CFT sob o nº ${OUTORGADO.representante_crea}, doravante denominada <strong>OUTORGADA</strong>.</p>

<h2>DOS PODERES</h2>
<p>Pelo presente instrumento, a OUTORGANTE nomeia e constitui sua bastante procuradora a OUTORGADA, conferindo-lhe os mais amplos poderes para representá-la perante a concessionária <strong>${concessionaria}</strong>, junto à Unidade Consumidora nº <strong>${uc}</strong>, instalada no endereço ${enderecoInstalacao}, podendo praticar todos os atos necessários à:</p>
<p>a) Solicitação de acesso, parecer técnico e aprovação de projeto de microgeração/minigeração distribuída fotovoltaica;</p>
<p>b) Protocolização e acompanhamento dos pedidos de vistoria, troca de medidor e ativação do sistema de geração distribuída;</p>
<p>c) Assinatura de Contrato de Adesão / Termo de Conexão / Termo de Compromisso e demais documentos exigidos pela concessionária;</p>
<p>d) Apresentação e retirada de documentos, requerimentos, declarações e demais instrumentos relacionados ao processo de homologação;</p>
<p>e) Representação junto a órgãos reguladores (ANEEL) quando necessário, no que se refere ao processo em questão.</p>

<h2>DA VALIDADE</h2>
<p>A presente procuração é outorgada com prazo de validade de <strong>180 (cento e oitenta) dias</strong>, contados da data de sua assinatura, podendo ser revogada a qualquer tempo mediante comunicação por escrito.</p>

<div class="local-data">
<p>${cidade}-${uf}, ${data}.</p>
</div>

<div class="assinatura">
<div class="linha"></div>
<p><strong>${dados.titular_uc.tipo === 'PF' ? dados.titular_uc.nome : dados.titular_uc.razao_social}</strong><br/>
OUTORGANTE — CPF/CNPJ ${dados.titular_uc.tipo === 'PF' ? dados.titular_uc.cpf : dados.titular_uc.cnpj}</p>
</div>

</body>
</html>`;
}
```

- [ ] **Step 4: Verificar render manual via inspeção visual**

Run:

```bash
cd "C:\Users\Meu Computador\Documents\ecosunpower-agente"
npx tsx -e "
import { renderProcuracao } from './src/modules/closing/templates/procuracao.html.ts';
import { dadosFechamentoCamilaMesmaPessoa } from './tests/fixtures/closing-camila.ts';
import fs from 'fs';
const html = renderProcuracao(dadosFechamentoCamilaMesmaPessoa);
fs.writeFileSync('tmp/procuracao-render-test.html', html);
console.log('OK', html.length, 'bytes');
"
```

Abrir `tmp/procuracao-render-test.html` no navegador (file://) e verificar se sai legível, dados da Camila aparecendo, layout próximo do PDF de referência. Ajustar texto se necessário.

- [ ] **Step 5: Commit**

```bash
git add src/modules/closing/templates/procuracao.html.ts tmp/procuracao-render-test.html
git commit -m "feat(closing): template HTML procuração com OUTORGANTE/OUTORGADA

Outorgante sempre titular_uc, outorgada EcoSunPower (Junior CREA/CFT).
Validade 180 dias. Base: tmp/procuracao-camila.pdf + contratos.md.
Inspecionado visualmente vs PDF de referência."
```

---

### Task 8: Snapshot testes da procuração

**Files:**
- Create: `tests/closing-templates-procuracao.test.ts`

- [ ] **Step 1: Testes pontuais (não snapshot do HTML inteiro — frágil)**

```typescript
// tests/closing-templates-procuracao.test.ts
import { describe, it, expect } from 'vitest';
import { renderProcuracao } from '../src/modules/closing/templates/procuracao.html.js';
import { dadosFechamentoCamilaMesmaPessoa, dadosFechamentoCamilaToninhoContrato } from './fixtures/closing-camila.js';

describe('renderProcuracao', () => {
  const html = renderProcuracao(dadosFechamentoCamilaMesmaPessoa);

  it('outorgante é o titular da UC', () => {
    expect(html).toContain('Camila Barbosa Costa Cardoso');
    expect(html).toContain('028.876.121-90');
    expect(html).toContain('26163');
    expect(html).toContain('MTE-DF');
  });

  it('outorgada é EcoSunPower com dados Junior CREA/CFT', () => {
    expect(html).toContain('ECOSUNPOWER ENERGIA SOLAR LTDA');
    expect(html).toContain('33.020.459/0001-06');
    expect(html).toContain('ANTONIO CANDIDO RODRIGUES JUNIOR');
    expect(html).toContain('98940457153');
  });

  it('contém UC e concessionária', () => {
    expect(html).toContain('10005936703');
    expect(html).toContain('Equatorial-GO');
  });

  it('validade 180 dias', () => {
    expect(html).toContain('180 (cento e oitenta) dias');
  });

  it('outorgante é SEMPRE titular_uc, mesmo se contratante for outra pessoa', () => {
    const htmlComToninho = renderProcuracao(dadosFechamentoCamilaToninhoContrato);
    expect(htmlComToninho).toContain('Camila Barbosa Costa Cardoso');
    expect(htmlComToninho).not.toContain('Toninho');
  });
});
```

- [ ] **Step 2: Rodar pra passar (já passou no inspeção visual)**

Run: `npx vitest run tests/closing-templates-procuracao.test.ts`
Expected: PASS — 5 testes.

- [ ] **Step 3: Commit**

```bash
git add tests/closing-templates-procuracao.test.ts
git commit -m "test(closing): asserts pontuais procuração

CPF, RG, UC, concessionária, outorgada EcoSunPower e regra
crítica: outorgante = titular_uc mesmo se contratante for outra pessoa."
```

---

### Task 9: Template HTML do contrato — extrair placeholders do HTML da Camila

**Files:**
- Create: `src/modules/closing/templates/contrato.html.ts`
- Reference: `tmp/contrato-camila.html`

- [ ] **Step 1: Ler o HTML completo da Camila**

Read: `tmp/contrato-camila.html` (todas as linhas).

Anotar:
- Estrutura (PARTES, OBJETO, OBRIGAÇÕES, etc — 23 cláusulas)
- Onde os dados específicos da Camila aparecem (nome, CPF, RG, endereço, kWp, valor, módulos, inversor, modalidade, concessionária, UC, observação cônjuge)

- [ ] **Step 2: Criar `src/modules/closing/templates/contrato.html.ts`**

Copiar TODO o conteúdo de `tmp/contrato-camila.html`, transformar em function `renderContrato(dados: DadosFechamento) → string`, substituir dados específicos da Camila por interpolações `${dados.contratante.nome}` etc.

```typescript
// src/modules/closing/templates/contrato.html.ts
// Renderiza HTML do contrato de prestação de serviços.
// CONTRATANTE = dados.contratante (pode ser ≠ titular_uc no caso de cônjuge negociou).
// Quando contratante_eh_titular === false, adiciona caixa de observação no topo
// citando relação com a titular.
//
// Base: tmp/contrato-camila.html

import type { DadosFechamento, PessoaFisica, PessoaJuridica } from '../types.js';

const CONTRATADA = {
  razao_social: 'ECOSUNPOWER ENERGIA SOLAR LTDA',
  cnpj: '33.020.459/0001-06',
  endereco: 'SHA Conjunto 01 Chácara 44C Lote 6, Arniqueira, Brasília-DF, CEP 71993-150',
  representante_nome: 'ANTONIO CANDIDO RODRIGUES JUNIOR',
  representante_titulo: 'Responsável Técnico',
  representante_cpf: '989.404.571-53',
  representante_rg: '2.202.520 SSP-DF',
  representante_crea: '98940457153',
};

const OBS_TEMPLATES: Record<string, (titular: string) => string> = {
  conjuge: (titular) => `A negociação comercial foi conduzida com o cônjuge da titular da UC, Sr(a). ${titular}, sem responsabilidade contratual direta do(a) titular.`,
  socio: (titular) => `A CONTRATANTE é sócia/relacionada à pessoa jurídica titular da UC ${titular}.`,
  familiar: (titular) => `A CONTRATANTE é familiar do(a) titular da UC ${titular}, atuando como financiadora do empreendimento.`,
  financiador: (titular) => `A CONTRATANTE figura no contrato como financiadora do sistema instalado em UC de titularidade de ${titular}.`,
  outro: (titular) => `A CONTRATANTE assume integralmente a responsabilidade comercial. Titular da UC: ${titular}.`,
};

// Aceita Partial<DadosFechamento> porque é chamada também pelo assistant antes
// dos dados estarem completos. Retorna undefined se faltar info pra montar.
export function buildObservacaoPartes(dados: Partial<DadosFechamento>): string | undefined {
  if (dados.contratante_eh_titular) return undefined;
  if (!dados.relacao_contratante) return undefined;
  if (!dados.titular_uc) return undefined;
  const titularNome = dados.titular_uc.tipo === 'PF' ? dados.titular_uc.nome : dados.titular_uc.razao_social;
  const fn = OBS_TEMPLATES[dados.relacao_contratante];
  return fn ? fn(titularNome) : undefined;
}

function fmtPF(p: PessoaFisica): string {
  const estadoCivil = p.estado_civil ? `${p.estado_civil}, ` : '';
  const profissao = p.profissao ? `${p.profissao}, ` : '';
  const nasc = p.data_nascimento ? `nascido(a) em ${formatDateBR(p.data_nascimento)}, ` : '';
  const enderecoStr = `${p.endereco.rua}, ${p.endereco.numero}${p.endereco.complemento ? ', ' + p.endereco.complemento : ''}, ${p.endereco.bairro}, ${p.endereco.cidade}-${p.endereco.uf}, CEP ${p.endereco.cep}`;
  return `<strong>${p.nome}</strong>, ${p.nacionalidade}, ${estadoCivil}${profissao}${nasc}inscrito(a) no CPF/MF sob o nº ${p.cpf}, RG nº ${p.rg} ${p.orgao_emissor_rg}, residente e domiciliado(a) na ${enderecoStr}, e-mail ${p.email}, telefone ${p.telefone}`;
}

function fmtPJ(p: PessoaJuridica): string {
  return `<strong>${p.razao_social}</strong>, pessoa jurídica inscrita no CNPJ sob o nº ${p.cnpj}, com sede em ${p.endereco.rua}, ${p.endereco.numero}, ${p.endereco.bairro}, ${p.endereco.cidade}-${p.endereco.uf}, CEP ${p.endereco.cep}, neste ato representada por ${fmtPF(p.representante)}, e-mail ${p.email}, telefone ${p.telefone}`;
}

function fmtPessoa(p: PessoaFisica | PessoaJuridica): string {
  return p.tipo === 'PJ' ? fmtPJ(p) : fmtPF(p);
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

function modalidadeLabel(m: DadosFechamento['sistema']['modalidade']): string {
  switch (m) {
    case 'autoconsumo_local': return 'autoconsumo local';
    case 'autoconsumo_remoto': return 'autoconsumo remoto';
    case 'geracao_compartilhada': return 'geração compartilhada';
  }
}

export function renderContrato(dados: DadosFechamento): string {
  const contratante = fmtPessoa(dados.contratante);
  const contratada = `${CONTRATADA.razao_social}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${CONTRATADA.cnpj}, com sede em ${CONTRATADA.endereco}, neste ato representada por ${CONTRATADA.representante_nome}, brasileiro, ${CONTRATADA.representante_titulo}, portador do CPF nº ${CONTRATADA.representante_cpf}, RG nº ${CONTRATADA.representante_rg}, registrado no CREA/CFT sob o nº ${CONTRATADA.representante_crea}`;

  const observacao = buildObservacaoPartes(dados);
  const observacaoHtml = observacao
    ? `<div class="obs-marido"><strong>Observação:</strong> ${observacao}</div>`
    : '';

  const sistema = dados.sistema;
  const cidade = dados.contratante.endereco.cidade;
  const uf = dados.contratante.endereco.uf;
  const data = (() => {
    const d = new Date();
    const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    return `${cidade}-${uf}, ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}.`;
  })();

  const disposicoes = dados.disposicoes_especiais
    ? `<h2>CLÁUSULA 23ª — DAS DISPOSIÇÕES ESPECIAIS</h2><p>${dados.disposicoes_especiais}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Contrato ${dados.contratante.tipo === 'PF' ? dados.contratante.nome : dados.contratante.razao_social} - EcoSunPower</title>
<style>
  @page { size: A4; margin: 2cm 2.2cm; }
  body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.5; }
  h1 { text-align: center; font-size: 14pt; color: #0c4a6e; margin-bottom: 18pt; line-height: 1.3; }
  h2 { font-size: 12pt; color: #0c4a6e; margin-top: 16pt; margin-bottom: 8pt; border-bottom: 1px solid #cbd5e1; padding-bottom: 3pt; }
  p { text-align: justify; margin: 6pt 0; }
  ul, ol { margin: 6pt 0 6pt 20pt; }
  li { margin: 3pt 0; text-align: justify; }
  strong { color: #0c4a6e; }
  hr { border: none; border-top: 1px solid #cbd5e1; margin: 14pt 0; }
  .assinatura { margin-top: 24pt; }
  .assinatura .linha { border-bottom: 1px solid #1a1a1a; width: 60%; margin: 36pt 0 6pt; }
  .obs-marido { background: #fffbeb; border-left: 3px solid #f59e0b; padding: 8pt 12pt; margin: 10pt 0; font-size: 10pt; }
</style>
</head>
<body>

<h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE ENGENHARIA E INSTALAÇÃO DE SISTEMA DE GERAÇÃO FOTOVOLTAICA</h1>

<h2>DAS PARTES</h2>

<p><strong>CONTRATANTE:</strong> ${contratante}.</p>

${observacaoHtml}

<p><strong>CONTRATADA:</strong> ${contratada}.</p>

<p>As partes têm entre si justo e contratado o presente <strong>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</strong>, que se regerá pelas cláusulas e condições a seguir, em conformidade com o Código Civil, o Código de Defesa do Consumidor (Lei 8.078/90), a Lei Geral de Proteção de Dados (Lei 13.709/18), a Resolução Normativa ANEEL nº 1.000/2021 e nº 1.059/2023 e a Lei 14.300/2022 (Marco Legal da Geração Distribuída).</p>

<hr/>

<h2>CLÁUSULA 1ª — DO OBJETO</h2>
<p>1.1. Constitui objeto deste contrato a prestação dos seguintes serviços pela CONTRATADA:</p>
<p>a) <strong>Elaboração de projeto elétrico</strong> de Sistema de Geração Distribuída Fotovoltaica de <strong>${sistema.kwp} kWp</strong>, sob modalidade de <strong>${modalidadeLabel(sistema.modalidade)}</strong>;</p>
<p>b) <strong>Homologação</strong> do projeto junto à concessionária <strong>${dados.concessionaria}</strong> (Unidade Consumidora nº ${dados.uc_numero ?? '(a confirmar)'});</p>
<p>c) <strong>Fornecimento e instalação</strong> dos equipamentos descritos na Cláusula 11ª, no imóvel localizado em ${dados.endereco_instalacao.rua}, ${dados.endereco_instalacao.numero}, ${dados.endereco_instalacao.bairro}, ${dados.endereco_instalacao.cidade}-${dados.endereco_instalacao.uf}, CEP ${dados.endereco_instalacao.cep};</p>
<p>d) <strong>Solicitação de vistoria, religação e ativação do sistema</strong> junto à concessionária, <strong>com acompanhamento até a efetiva troca do medidor</strong>;</p>
<p>e) <strong>Anotação de Responsabilidade Técnica</strong> junto ao CREA/CFT, sob responsabilidade do Sr. ${CONTRATADA.representante_nome}, CREA/CFT nº ${CONTRATADA.representante_crea}.</p>

<p>1.2. <strong>NÃO está incluído</strong> no objeto deste contrato, salvo previsão expressa na Proposta Comercial:</p>
<ul>
<li>Adequação ou substituição do padrão de entrada de energia;</li>
<li>Reforço estrutural do telhado ou cobertura;</li>
<li>Obras civis, alvenaria, pintura ou recomposição de telhado;</li>
<li>Limpeza periódica dos módulos após a instalação;</li>
<li>Manutenção corretiva fora do período de garantia.</li>
</ul>

<hr/>

<h2>CLÁUSULA 11ª — DOS EQUIPAMENTOS</h2>
<p>11.1. Sistema Fotovoltaico de <strong>${sistema.kwp} kWp</strong>, composto por:</p>
<ul>
<li><strong>${sistema.modulos.quantidade}× módulos fotovoltaicos ${sistema.modulos.marca}</strong> de <strong>${sistema.modulos.potencia_w} Wp</strong> cada;</li>
<li><strong>Inversor ${sistema.inversor.marca} ${sistema.inversor.modelo}</strong> de ${sistema.inversor.potencia_kw} kW;</li>
<li>Estruturas de fixação, cabos CC/CA, conectores MC4, string box e DPS conforme projeto.</li>
</ul>

<hr/>

<h2>CLÁUSULA 9ª — DO VALOR E FORMA DE PAGAMENTO</h2>
<p>9.1. O valor total dos serviços e equipamentos é de <strong>${formatBRL(dados.comercial.valor_total_brl)}</strong> (${dados.comercial.valor_total_brl.toLocaleString('pt-BR')} reais).</p>
<p>9.2. Forma de pagamento: ${dados.comercial.forma_pagamento}.</p>

${disposicoes}

<hr/>

<h2>CLÁUSULA 24ª — DO FORO</h2>
<p>24.1. Fica eleito o foro da Comarca de Brasília-DF para dirimir quaisquer controvérsias decorrentes do presente contrato.</p>

<p>${data}</p>

<div class="assinatura">
<div class="linha"></div>
<p><strong>${dados.contratante.tipo === 'PF' ? dados.contratante.nome : dados.contratante.razao_social}</strong><br/>
CONTRATANTE</p>

<div class="linha"></div>
<p><strong>${CONTRATADA.razao_social}</strong><br/>
${CONTRATADA.representante_nome} — ${CONTRATADA.representante_titulo} CREA/CFT ${CONTRATADA.representante_crea}<br/>
CONTRATADA</p>
</div>

</body>
</html>`;
}
```

**Nota**: este template enxuga o contrato pra cláusulas essenciais (1, 9, 11, 23, 24). As demais cláusulas do contrato-camila.html (obrigações, prazos, garantias, rescisão, foro etc) DEVEM ser portadas. **Step 3 abaixo importa o restante**.

- [ ] **Step 3: Portar TODAS as outras cláusulas do `tmp/contrato-camila.html` pro template**

Abrir `tmp/contrato-camila.html`, copiar cláusulas 2 a 22 (obrigações, prazos, garantias, rescisão, LGPD, etc) e inserir no template `renderContrato` nos lugares apropriados. Substituir dados específicos da Camila por placeholders.

Foco: as cláusulas que envolvem dados variáveis (valor 9, 11 equipamentos, 23 disposições) já estão. As cláusulas "padrão EcoSunPower" (garantias, rescisão, foro) vão como strings literais.

- [ ] **Step 4: Render manual e inspeção visual**

```bash
npx tsx -e "
import { renderContrato } from './src/modules/closing/templates/contrato.html.ts';
import { dadosFechamentoCamilaMesmaPessoa, dadosFechamentoCamilaToninhoContrato } from './tests/fixtures/closing-camila.ts';
import fs from 'fs';
fs.writeFileSync('tmp/contrato-render-camila.html', renderContrato(dadosFechamentoCamilaMesmaPessoa));
fs.writeFileSync('tmp/contrato-render-toninho.html', renderContrato(dadosFechamentoCamilaToninhoContrato));
console.log('OK');
"
```

Abrir os 2 arquivos no navegador, comparar com `tmp/contrato-camila.html` original, verificar que dados estão corretos e que a versão Toninho tem a caixa amarela de observação no topo.

- [ ] **Step 5: Commit**

```bash
git add src/modules/closing/templates/contrato.html.ts tmp/contrato-render-camila.html tmp/contrato-render-toninho.html
git commit -m "feat(closing): template HTML contrato com interpolação completa

Base: tmp/contrato-camila.html. CONTRATANTE = dados.contratante (pode
≠ titular_uc). buildObservacaoPartes monta texto determinístico por
RelacaoContratante. Validado visualmente vs contrato Camila original."
```

---

### Task 10: Snapshot testes do contrato

**Files:**
- Create: `tests/closing-templates-contrato.test.ts`

- [ ] **Step 1: Escrever testes pontuais**

```typescript
// tests/closing-templates-contrato.test.ts
import { describe, it, expect } from 'vitest';
import { renderContrato, buildObservacaoPartes } from '../src/modules/closing/templates/contrato.html.js';
import { dadosFechamentoCamilaMesmaPessoa, dadosFechamentoCamilaToninhoContrato } from './fixtures/closing-camila.js';

describe('renderContrato', () => {
  describe('caso mesma pessoa (Camila titular E contratante)', () => {
    const html = renderContrato(dadosFechamentoCamilaMesmaPessoa);

    it('CONTRATANTE é a Camila', () => {
      expect(html).toContain('Camila Barbosa Costa Cardoso');
      expect(html).toContain('028.876.121-90');
    });

    it('CONTRATADA é EcoSunPower com Junior', () => {
      expect(html).toContain('ECOSUNPOWER ENERGIA SOLAR LTDA');
      expect(html).toContain('ANTONIO CANDIDO RODRIGUES JUNIOR');
    });

    it('cláusula 1 cita kWp, modalidade, concessionária, UC, endereço instalação', () => {
      expect(html).toContain('8.4 kWp');
      expect(html).toContain('autoconsumo local');
      expect(html).toContain('Equatorial-GO');
      expect(html).toContain('10005936703');
      expect(html).toContain('Águas Lindas de Goiás');
    });

    it('cláusula 11 cita módulos e inversor', () => {
      expect(html).toContain('12× módulos fotovoltaicos Trina Vertex');
      expect(html).toContain('700 Wp');
      expect(html).toContain('Sungrow SG5.0RS-L');
    });

    it('cláusula 9 cita valor BRL formatado', () => {
      expect(html).toContain('R$');
      expect(html).toContain('38.500');
    });

    it('NÃO tem caixa de observação (mesma pessoa)', () => {
      expect(html).not.toContain('obs-marido');
    });
  });

  describe('caso contratante=Toninho (cônjuge da Camila)', () => {
    const html = renderContrato(dadosFechamentoCamilaToninhoContrato);

    it('CONTRATANTE é o Toninho, não a Camila', () => {
      // O nome do Toninho aparece como contratante
      expect(html).toContain('Toninho');
      expect(html).toContain('444.555.666-77');
      // Camila ainda aparece como titular da UC nas observações/cláusulas
    });

    it('tem caixa de observação amarela citando cônjuge', () => {
      expect(html).toContain('obs-marido');
      expect(html).toContain('cônjuge');
      expect(html).toContain('Camila Barbosa Costa Cardoso');
    });

    it('cláusula 1 ainda cita UC e endereço da titular', () => {
      expect(html).toContain('10005936703');
      expect(html).toContain('Águas Lindas de Goiás');
    });
  });

  describe('buildObservacaoPartes', () => {
    it('retorna undefined se contratante_eh_titular=true', () => {
      expect(buildObservacaoPartes(dadosFechamentoCamilaMesmaPessoa)).toBeUndefined();
    });
    it('retorna texto cônjuge quando relação=conjuge', () => {
      const obs = buildObservacaoPartes(dadosFechamentoCamilaToninhoContrato);
      expect(obs).toContain('cônjuge');
      expect(obs).toContain('Camila Barbosa Costa Cardoso');
    });
  });
});
```

- [ ] **Step 2: Rodar pra passar**

Run: `npx vitest run tests/closing-templates-contrato.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/closing-templates-contrato.test.ts
git commit -m "test(closing): asserts pontuais contrato + caixa de observação

Cobre caso mesma pessoa, caso cônjuge (caixa amarela), e
buildObservacaoPartes determinístico."
```

---

## Fatia 4 — Render PDF

### Task 11: Render PDF via Puppeteer

**Files:**
- Create: `src/modules/closing/closing-render.ts`
- Create: `tests/closing-render.test.ts`

- [ ] **Step 1: Escrever teste smoke (failing)**

```typescript
// tests/closing-render.test.ts
import { describe, it, expect } from 'vitest';
import { renderHtmlToPdf, shutdownPdfRenderer } from '../src/modules/closing/closing-render.js';

describe('closing-render (Puppeteer smoke)', () => {
  // Sobe browser uma vez, derruba no fim
  afterAll(async () => { await shutdownPdfRenderer(); });

  it('converte HTML simples em PDF buffer válido', async () => {
    const html = '<!DOCTYPE html><html><body><h1>Teste PDF</h1><p>Conteúdo qualquer</p></body></html>';
    const pdf = await renderHtmlToPdf(html);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
    // Header PDF começa com %PDF
    expect(pdf.slice(0, 4).toString('latin1')).toBe('%PDF');
  }, 30_000);

  it('renderiza HTML do contrato Camila (~50-300KB)', async () => {
    const { renderContrato } = await import('../src/modules/closing/templates/contrato.html.js');
    const { dadosFechamentoCamilaMesmaPessoa } = await import('./fixtures/closing-camila.js');
    const html = renderContrato(dadosFechamentoCamilaMesmaPessoa);
    const pdf = await renderHtmlToPdf(html);
    expect(pdf.length).toBeGreaterThan(20_000);
    expect(pdf.length).toBeLessThan(2_000_000);
  }, 60_000);
});
```

- [ ] **Step 2: Rodar pra falhar**

Run: `npx vitest run tests/closing-render.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implementar `closing-render.ts`**

```typescript
// src/modules/closing/closing-render.ts
// HTML → PDF A4 via Puppeteer. Single browser instance lazy.
// Margens iguais ao tmp/render-contrato-pdf.mjs original.

import puppeteer, { Browser } from 'puppeteer';

let browserSingleton: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserSingleton && browserSingleton.isConnected()) return browserSingleton;
  browserSingleton = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  return browserSingleton;
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '2cm', right: '2.2cm', bottom: '2cm', left: '2.2cm' },
    });
    return Buffer.from(pdfBytes);
  } finally {
    await page.close();
  }
}

export async function shutdownPdfRenderer(): Promise<void> {
  if (browserSingleton) {
    await browserSingleton.close();
    browserSingleton = null;
  }
}
```

- [ ] **Step 4: Rodar pra passar**

Run: `npx vitest run tests/closing-render.test.ts`
Expected: PASS — 2 testes (pode demorar ~10-30s na primeira execução pois lança Chromium).

- [ ] **Step 5: Commit**

```bash
git add src/modules/closing/closing-render.ts tests/closing-render.test.ts
git commit -m "feat(closing): render HTML→PDF Puppeteer singleton

A4, margens 2cm/2.2cm, headless --no-sandbox pra prod.
Browser lazy, reusado entre requests. shutdownPdfRenderer pra graceful close."
```

---

### Task 12: Adicionar Chromium ao Dockerfile pra prod

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: Ler Dockerfile atual**

Read: `Dockerfile`

Verificar imagem base, se já tem alguma dep de Puppeteer/Chromium (proposal-assistant já usa Puppeteer pra propostas, pode já estar pronto).

- [ ] **Step 2: Verificar se Chromium já está instalado**

Procurar no Dockerfile por `chromium`, `puppeteer`, `--no-sandbox`. Se já existe (proposal usa), pular essa Task. Se NÃO existe, adicionar:

```dockerfile
# Adicionar antes do COPY . . (depois do FROM node)
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
 && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

- [ ] **Step 3: Se modificou, commit**

```bash
git add Dockerfile
git commit -m "build: Chromium pro Puppeteer do closing-render

Reusa instalação se proposal-assistant já fez. PUPPETEER_EXECUTABLE_PATH
aponta pro binário do sistema (não baixa de novo). --no-sandbox no launch."
```

Se já estava, pular o commit.

---

## Fatia 5 — Drive uploader

### Task 13: Drive uploader específico do closing

**Files:**
- Create: `src/modules/closing/closing-drive.ts`
- Create: `tests/closing-drive.test.ts`

- [ ] **Step 1: Escrever teste com mock googleapis (failing)**

```typescript
// tests/closing-drive.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ClosingDriveUploader } from '../src/modules/closing/closing-drive.js';

function fakeDrive() {
  const created: any[] = [];
  return {
    files: {
      list: vi.fn().mockResolvedValue({ data: { files: [] } }),
      create: vi.fn().mockImplementation(async ({ requestBody, media, fields }: any) => {
        const id = `id-${created.length + 1}`;
        const isFolder = requestBody.mimeType === 'application/vnd.google-apps.folder';
        const f = { id, name: requestBody.name, mimeType: requestBody.mimeType, webViewLink: `https://drive.google.com/file/d/${id}/view` };
        created.push(f);
        return { data: f };
      }),
    },
    _created: created,
  };
}

describe('ClosingDriveUploader', () => {
  it('cria estrutura EcoSunPower/Contratos/<ano>/<cliente> e sobe arquivos', async () => {
    const drive = fakeDrive();
    const uploader = new ClosingDriveUploader(drive as any);

    const res = await uploader.uploadFechamento({
      nomeTitular: 'Camila Barbosa Costa Cardoso',
      cpfTitular: '028.876.121-90',
      ano: '2026',
      version: 1,
      contratoPdf: Buffer.from('%PDF-fake-contrato'),
      procuracaoPdf: Buffer.from('%PDF-fake-procuracao'),
      dadosInputJson: '{"x":1}',
    });

    expect(res.folderId).toMatch(/^id-/);
    expect(res.contratoDriveLink).toContain('https://drive.google.com');
    expect(res.procuracaoDriveLink).toContain('https://drive.google.com');

    // Verifica que criou pasta com nome correto
    const folderNames = drive._created.filter((c: any) => c.mimeType === 'application/vnd.google-apps.folder').map((c: any) => c.name);
    expect(folderNames).toContain('EcoSunPower');
    expect(folderNames).toContain('Contratos');
    expect(folderNames).toContain('2026');
    expect(folderNames).toContain('Camila Barbosa Costa Cardoso - 028876');

    // Verifica que arquivos PDF foram criados
    const pdfs = drive._created.filter((c: any) => c.mimeType === 'application/pdf');
    expect(pdfs.length).toBe(2);
    expect(pdfs.map((p: any) => p.name)).toEqual(expect.arrayContaining([
      'contrato-v1.pdf',
      'procuracao-v1.pdf',
    ]));
  });

  it('só sobe contrato se procuração não vier', async () => {
    const drive = fakeDrive();
    const uploader = new ClosingDriveUploader(drive as any);
    const res = await uploader.uploadFechamento({
      nomeTitular: 'X',
      cpfTitular: '12345678901',
      ano: '2026',
      version: 1,
      contratoPdf: Buffer.from('%PDF'),
      dadosInputJson: '{}',
    });
    expect(res.contratoDriveLink).toBeTruthy();
    expect(res.procuracaoDriveLink).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar pra falhar**

Run: `npx vitest run tests/closing-drive.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implementar uploader**

```typescript
// src/modules/closing/closing-drive.ts
// Upload de contrato + procuração no Drive.
// Estrutura: EcoSunPower / Contratos / <ano> / <nome titular> - <CPF curto> / arquivos
//
// Reusa autenticação OAuth do proposal/drive-uploader (mesmo cliente Google).

import type { drive_v3 } from 'googleapis';
import { Readable } from 'stream';

export interface UploadFechamentoInput {
  nomeTitular: string;
  cpfTitular: string;
  ano: string;
  version: number; // 1, 2, 3... incrementa se refazer
  contratoPdf?: Buffer;
  procuracaoPdf?: Buffer;
  dadosInputJson: string;
}

export interface UploadFechamentoResult {
  folderId: string;
  folderWebViewLink: string;
  contratoDriveId?: string;
  contratoDriveLink?: string;
  procuracaoDriveId?: string;
  procuracaoDriveLink?: string;
}

export class ClosingDriveUploader {
  constructor(private drive: drive_v3.Drive) {}

  private async getOrCreateFolder(name: string, parentId?: string): Promise<string> {
    const q = [
      `name = '${name.replace(/'/g, "\\'")}'`,
      `mimeType = 'application/vnd.google-apps.folder'`,
      `trashed = false`,
      parentId ? `'${parentId}' in parents` : `'root' in parents`,
    ].join(' and ');
    const list = await this.drive.files.list({ q, fields: 'files(id, name)', pageSize: 1 });
    const found = list.data.files?.[0];
    if (found?.id) return found.id;
    const created = await this.drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : undefined,
      },
      fields: 'id, webViewLink',
    });
    if (!created.data.id) throw new Error(`Falha ao criar pasta ${name}`);
    return created.data.id;
  }

  private async uploadPdf(name: string, buffer: Buffer, parentId: string): Promise<{ id: string; link: string }> {
    const res = await this.drive.files.create({
      requestBody: { name, mimeType: 'application/pdf', parents: [parentId] },
      media: { mimeType: 'application/pdf', body: Readable.from(buffer) },
      fields: 'id, webViewLink',
    });
    if (!res.data.id) throw new Error(`Falha ao subir PDF ${name}`);
    return { id: res.data.id, link: res.data.webViewLink ?? '' };
  }

  private async uploadJson(name: string, content: string, parentId: string): Promise<void> {
    await this.drive.files.create({
      requestBody: { name, mimeType: 'application/json', parents: [parentId] },
      media: { mimeType: 'application/json', body: Readable.from(Buffer.from(content)) },
      fields: 'id',
    });
  }

  async uploadFechamento(input: UploadFechamentoInput): Promise<UploadFechamentoResult> {
    const cpfCurto = input.cpfTitular.replace(/\D+/g, '').slice(0, 6);
    const clienteFolderName = `${input.nomeTitular} - ${cpfCurto}`;

    const rootId = await this.getOrCreateFolder('EcoSunPower');
    const contratosId = await this.getOrCreateFolder('Contratos', rootId);
    const anoId = await this.getOrCreateFolder(input.ano, contratosId);
    const clienteId = await this.getOrCreateFolder(clienteFolderName, anoId);

    const folderMeta = await this.drive.files.get({ fileId: clienteId, fields: 'webViewLink' });
    const folderLink = folderMeta.data.webViewLink ?? '';

    const result: UploadFechamentoResult = {
      folderId: clienteId,
      folderWebViewLink: folderLink,
    };

    if (input.contratoPdf) {
      const { id, link } = await this.uploadPdf(`contrato-v${input.version}.pdf`, input.contratoPdf, clienteId);
      result.contratoDriveId = id;
      result.contratoDriveLink = link;
    }
    if (input.procuracaoPdf) {
      const { id, link } = await this.uploadPdf(`procuracao-v${input.version}.pdf`, input.procuracaoPdf, clienteId);
      result.procuracaoDriveId = id;
      result.procuracaoDriveLink = link;
    }
    await this.uploadJson(`dados-input-v${input.version}.json`, input.dadosInputJson, clienteId);

    return result;
  }
}
```

- [ ] **Step 4: Rodar pra passar**

Run: `npx vitest run tests/closing-drive.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/closing/closing-drive.ts tests/closing-drive.test.ts
git commit -m "feat(closing): drive uploader cria estrutura EcoSunPower/Contratos/<ano>/<cliente>

Versionamento contrato-v1, v2, v3 etc. dados-input-v*.json
snapshot pra rastreio. Suporta upload só de 1 dos 2 PDFs."
```

---

## Fatia 6 — Persist

### Task 14: Repository fechamentos

**Files:**
- Create: `src/modules/closing/closing-persist.ts`
- Create: `tests/closing-persist.test.ts`

- [ ] **Step 1: Escrever testes (failing)**

```typescript
// tests/closing-persist.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ClosingPersist } from '../src/modules/closing/closing-persist.js';
import { dadosFechamentoCamilaMesmaPessoa } from './fixtures/closing-camila.js';

function mockSupabaseInsertSingle(returnId = 'fechamento-1') {
  return {
    from: vi.fn().mockImplementation((table: string) => ({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: returnId },
            error: null,
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    })),
  } as any;
}

describe('ClosingPersist', () => {
  it('createFechamento insere com docs_pedidos + dados_snapshot', async () => {
    const sb = mockSupabaseInsertSingle();
    const persist = new ClosingPersist(sb);
    const id = await persist.createFechamento({
      leadId: 'lead-1',
      propostaPublicaId: 'prop-1',
      dados: dadosFechamentoCamilaMesmaPessoa,
      createdBy: '5561993077140',
    });
    expect(id).toBe('fechamento-1');
    expect(sb.from).toHaveBeenCalledWith('fechamentos');
  });

  it('updateDriveLinks atualiza colunas Drive', async () => {
    const sb = mockSupabaseInsertSingle();
    const persist = new ClosingPersist(sb);
    await persist.updateDriveLinks('fechamento-1', {
      contratoDriveId: 'd1',
      contratoDriveLink: 'http://x',
      procuracaoDriveId: 'd2',
      procuracaoDriveLink: 'http://y',
      driveFolderId: 'f1',
    });
    expect(sb.from).toHaveBeenCalledWith('fechamentos');
  });

  it('updateStatus altera status', async () => {
    const sb = mockSupabaseInsertSingle();
    const persist = new ClosingPersist(sb);
    await persist.updateStatus('fechamento-1', 'aprovado_junior');
    expect(sb.from).toHaveBeenCalledWith('fechamentos');
  });
});
```

- [ ] **Step 2: Rodar pra falhar**

Run: `npx vitest run tests/closing-persist.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar repository**

```typescript
// src/modules/closing/closing-persist.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DadosFechamento, FechamentoRow } from './types.js';

export interface CreateFechamentoInput {
  leadId: string | null;
  propostaPublicaId: string | null;
  dados: DadosFechamento;
  createdBy: string;
}

export interface UpdateDriveLinksInput {
  contratoDriveId?: string;
  contratoDriveLink?: string;
  procuracaoDriveId?: string;
  procuracaoDriveLink?: string;
  driveFolderId?: string;
}

export class ClosingPersist {
  constructor(private sb: SupabaseClient) {}

  async createFechamento(input: CreateFechamentoInput): Promise<string> {
    const { data, error } = await this.sb
      .from('fechamentos')
      .insert({
        lead_id: input.leadId,
        proposta_publica_id: input.propostaPublicaId,
        docs_pedidos: input.dados.docs_pedidos,
        dados_snapshot: input.dados,
        status: 'gerado',
        created_by: input.createdBy,
      })
      .select('id')
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  async updateDriveLinks(id: string, links: UpdateDriveLinksInput): Promise<void> {
    const { error } = await this.sb
      .from('fechamentos')
      .update({
        contrato_drive_id: links.contratoDriveId ?? null,
        contrato_drive_link: links.contratoDriveLink ?? null,
        procuracao_drive_id: links.procuracaoDriveId ?? null,
        procuracao_drive_link: links.procuracaoDriveLink ?? null,
        drive_folder_id: links.driveFolderId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;
  }

  async updateStatus(id: string, status: FechamentoRow['status']): Promise<void> {
    const { error } = await this.sb
      .from('fechamentos')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  async nextVersionForLead(leadId: string): Promise<number> {
    const { data, error } = await this.sb
      .from('fechamentos')
      .select('id')
      .eq('lead_id', leadId);
    if (error) throw error;
    return ((data?.length ?? 0) + 1);
  }
}
```

- [ ] **Step 4: Rodar pra passar**

Run: `npx vitest run tests/closing-persist.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/closing/closing-persist.ts tests/closing-persist.test.ts
git commit -m "feat(closing): repository ClosingPersist com 4 ops

createFechamento, updateDriveLinks, updateStatus, nextVersionForLead.
nextVersionForLead conta fechamentos prévios pra versionar PDFs."
```

---

## Fatia 7 — Assistant + LLM

### Task 15: System prompt do modo closing

**Files:**
- Create: `src/prompts/closing-system.md`

- [ ] **Step 1: Criar o prompt**

```markdown
# Eva — Modo Fechamento (/fechar)

Você está no MODO FECHAMENTO. Ativado pelo Junior (admin) pra coletar dados do cliente que fechou venda e preencher contrato + procuração da EcoSunPower.

## REGRA DE OURO
NUNCA emita um JSON com `action: "ready_to_generate"` se ainda houver campo obrigatório faltando. SEMPRE liste o que falta de forma curta e direta.

## Sobre os 2 sujeitos

A procuração vai SEMPRE no nome do TITULAR DA UC (quem é titular da conta de luz, quem representa o cliente perante a concessionária).

O contrato pode estar em outro nome — o CONTRATANTE. Casos típicos:
- Cônjuge negociou pela titular (relacao_contratante='conjuge')
- Sócio assina pela empresa (relacao_contratante='socio')
- Pai/mãe paga pra filho (relacao_contratante='familiar' ou 'financiador')

Se o Junior não falar nada sobre isso, assume `contratante_eh_titular: true`.

Se o Junior disser "contrato no nome do marido/sócio/pai/filho", você marca `contratante_eh_titular: false` e coleta os dados da segunda pessoa.

## Campos obrigatórios (não gera se faltar)

### Titular da UC (PF)
- nome completo, CPF, RG + órgão emissor
- endereço completo (rua, número, bairro, cidade, UF, CEP)
- telefone, e-mail

### Sistema
- kWp total
- modalidade (autoconsumo_local | autoconsumo_remoto | geracao_compartilhada)
- módulos: marca, potência por painel, quantidade
- inversor: marca, modelo, potência kW

### Comercial
- valor total R$
- forma de pagamento (texto livre)

### Operacional
- concessionária (Neoenergia-DF ou Equatorial-GO — infere pela UF se faltar)
- UC nº (se faltar, grava 'a confirmar' e segue)
- docs_pedidos (default ['contrato', 'procuracao'])

## Defaults inteligentes (não pergunta)
- nacionalidade = 'Brasileiro(a)'
- concessionária: DF→Neoenergia-DF, GO→Equatorial-GO

## Formato de resposta

Você responde SEMPRE com um JSON único nesta estrutura:

```json
{
  "action": "ask_missing" | "ready_to_generate" | "cancel",
  "updates": { /* Partial<DadosFechamento> com campos extraídos do texto do Junior */ },
  "message": "texto curto e direto pro Junior, em PT-BR"
}
```

- `action: "ask_missing"` — ainda falta algo, peça SÓ o que falta, agrupado.
- `action: "ready_to_generate"` — tudo coletado, validado. Mensagem com resumo final e os 2 botões [Gerar] [Ajustar].
- `action: "cancel"` — Junior pediu pra cancelar/sair.

NUNCA inclua observacao_partes em `updates` — isso é gerado deterministicamente pelo código a partir de `relacao_contratante`. Você só extrai a relação ('conjuge', 'socio', 'familiar', 'financiador', 'outro') quando aplicável.
```

- [ ] **Step 2: Commit**

```bash
git add src/prompts/closing-system.md
git commit -m "feat(closing): system prompt modo /fechar

Regra de ouro (nunca gera sem obrigatório), 2 sujeitos, defaults
inteligentes, formato JSON de resposta com action ask_missing/
ready_to_generate/cancel."
```

---

### Task 16: ClosingAssistant — orquestrador conversacional

**Files:**
- Create: `src/modules/closing/closing-assistant.ts`
- Create: `tests/closing-assistant.test.ts`

- [ ] **Step 1: Escrever testes com LLM stub (failing)**

```typescript
// tests/closing-assistant.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ClosingAssistant, type LlmCaller } from '../src/modules/closing/closing-assistant.js';
import { dadosFechamentoCamilaMesmaPessoa, leadCamilaRow, propostaPublicaCamilaRow } from './fixtures/closing-camila.js';

const okLlm: LlmCaller = async (history) => ({
  action: 'ready_to_generate',
  updates: {},
  message: '✅ Tudo certo, vou gerar.',
});

const missingLlm: LlmCaller = async () => ({
  action: 'ask_missing',
  updates: { titular_uc: { rg: '26163' } as any },
  message: 'Falta forma de pagamento.',
});

describe('ClosingAssistant', () => {
  it('processMessage merge updates no estado e retorna mensagem', async () => {
    const assistant = new ClosingAssistant({ llm: missingLlm });
    const initial = { titular_uc: { tipo: 'PF', nome: 'X' } as any };
    const res = await assistant.processMessage('o RG é 26163 MTE-DF', { stage: 'collecting', data: initial, pending_questions: [] });
    expect(res.newState.stage).toBe('collecting');
    expect((res.newState as any).data.titular_uc.rg).toBe('26163');
    expect(res.replyText).toContain('forma de pagamento');
  });

  it('processMessage transita pra awaiting_confirm quando LLM diz ready_to_generate E validador OK', async () => {
    const assistant = new ClosingAssistant({ llm: okLlm });
    const res = await assistant.processMessage('gera', {
      stage: 'collecting',
      data: dadosFechamentoCamilaMesmaPessoa as any,
      pending_questions: [],
    });
    expect(res.newState.stage).toBe('awaiting_confirm');
  });

  it('processMessage NÃO transita pra awaiting_confirm se LLM disser ready mas validador achar campo faltando', async () => {
    const assistant = new ClosingAssistant({ llm: okLlm });
    const res = await assistant.processMessage('gera', {
      stage: 'collecting',
      data: { titular_uc: { tipo: 'PF', nome: 'X' } as any } as any,
      pending_questions: [],
    });
    expect(res.newState.stage).toBe('collecting');
    expect(res.replyText.toLowerCase()).toContain('falta');
  });
});
```

- [ ] **Step 2: Rodar pra falhar**

Run: `npx vitest run tests/closing-assistant.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `closing-assistant.ts`**

```typescript
// src/modules/closing/closing-assistant.ts
// Orquestrador conversacional do modo /fechar.
// LLM extrai updates do texto livre, validator é o gate final antes de transitar pra awaiting_confirm.

import type { DadosFechamento, ClosingState } from './types.js';
import { findMissingRequired } from './closing-validator.js';

export interface LlmResponse {
  action: 'ask_missing' | 'ready_to_generate' | 'cancel';
  updates: Partial<DadosFechamento>;
  message: string;
}

export type LlmCaller = (userMessage: string, currentData: Partial<DadosFechamento>) => Promise<LlmResponse>;

export interface ProcessResult {
  newState: ClosingState | { stage: 'cancelled' };
  replyText: string;
}

function deepMerge<T>(a: T, b: Partial<T>): T {
  if (!b) return a;
  const out: any = { ...(a as any) };
  for (const k of Object.keys(b) as (keyof T)[]) {
    const av: any = (a as any)[k];
    const bv: any = (b as any)[k];
    if (bv && typeof bv === 'object' && !Array.isArray(bv) && av && typeof av === 'object') {
      out[k] = deepMerge(av, bv);
    } else {
      out[k] = bv;
    }
  }
  return out;
}

import { buildObservacaoPartes } from './templates/contrato.html.js';

export interface ClosingAssistantOpts {
  llm: LlmCaller;
}

export class ClosingAssistant {
  constructor(private opts: ClosingAssistantOpts) {}

  async processMessage(userMessage: string, state: ClosingState): Promise<ProcessResult> {
    const data: Partial<DadosFechamento> = (state as any).data ?? {};
    const llm = await this.opts.llm(userMessage, data);

    if (llm.action === 'cancel') {
      return { newState: { stage: 'cancelled' }, replyText: llm.message || '❌ Modo fechamento cancelado.' };
    }

    const merged = deepMerge(data, llm.updates);
    // Recalcula observacao_partes deterministicamente
    const obs = buildObservacaoPartes(merged);
    if (obs) (merged as any).observacao_partes = obs;

    const missing = findMissingRequired(merged);
    if (llm.action === 'ready_to_generate' && missing.length === 0) {
      return {
        newState: { stage: 'awaiting_confirm', data: merged as DadosFechamento },
        replyText: llm.message,
      };
    }

    // Se LLM disse ready_to_generate mas validador discorda, força volta pra collecting
    const replyText = missing.length > 0
      ? `${llm.message}\n\nAinda falta: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ` e mais ${missing.length - 8}` : ''}.`
      : llm.message;

    return {
      newState: { stage: 'collecting', data: merged, pending_questions: missing },
      replyText,
    };
  }
}
```

- [ ] **Step 4: Rodar pra passar**

Run: `npx vitest run tests/closing-assistant.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/closing/closing-assistant.ts tests/closing-assistant.test.ts src/prompts/closing-system.md
git commit -m "feat(closing): orquestrador conversacional + LLM extraction

LLM extrai updates do texto livre, deep merge no estado, validator
é gate antes de transitar pra awaiting_confirm. observacao_partes
gerada deterministicamente a partir de relacao_contratante (não LLM).
Cobre caso LLM-claim-ready mas validador discorda."
```

---

### Task 17: LLM caller real com Anthropic SDK

**Files:**
- Modify: `src/modules/closing/closing-assistant.ts`

- [ ] **Step 1: Adicionar função `createAnthropicLlmCaller`**

Anexar no fim de `src/modules/closing/closing-assistant.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT_PATH = join(__dirname, '..', '..', 'prompts', 'closing-system.md');

let cachedSystemPrompt: string | null = null;
function getSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  cachedSystemPrompt = readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');
  return cachedSystemPrompt;
}

export function createAnthropicLlmCaller(apiKey: string): LlmCaller {
  const client = new Anthropic({ apiKey });

  return async (userMessage, currentData) => {
    const systemPrompt = getSystemPrompt();
    const stateBlock = `Estado atual coletado (Partial<DadosFechamento>):\n${JSON.stringify(currentData, null, 2)}`;

    const res = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: [
        { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        { role: 'user', content: `${stateBlock}\n\n---\nMensagem do Junior:\n${userMessage}` },
      ],
    });

    const text = res.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('\n');
    // LLM responde JSON puro ou JSON em bloco ```json...```
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed.action && typeof parsed.message === 'string') {
        return parsed as LlmResponse;
      }
    } catch {/* parse fail abaixo */}
    return {
      action: 'ask_missing',
      updates: {},
      message: `Não entendi totalmente, manda de novo? (Debug: ${text.slice(0, 200)})`,
    };
  };
}
```

- [ ] **Step 2: Verificar build**

Run: `npx tsc --noEmit`
Expected: zero erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/modules/closing/closing-assistant.ts
git commit -m "feat(closing): LLM caller Anthropic Sonnet 4.6 com cache

System prompt cacheado (ephemeral) reduz custo das trocas seguintes.
Parsing tolerante a bloco ```json```. Fallback gentil quando LLM
escapar do schema."
```

---

## Fatia 8 — Buttons handlers

### Task 18: Cases `evabt:fechar*` em eva-admin-buttons.ts

**Files:**
- Modify: `src/modules/eva-admin-buttons.ts`
- Create: `tests/closing-buttons.test.ts`

- [ ] **Step 1: Ler estrutura atual de eva-admin-buttons.ts**

Read: `src/modules/eva-admin-buttons.ts` (todas as ~250 linhas).

Identificar onde a função `tryHandleEvaAdminButton` faz o `switch (action)` pra adicionar os casos novos.

- [ ] **Step 2: Escrever testes (failing)**

```typescript
// tests/closing-buttons.test.ts
import { describe, it, expect, vi } from 'vitest';
import { tryHandleEvaAdminButton } from '../src/modules/eva-admin-buttons.js';

describe('eva-admin-buttons — cases fechar*', () => {
  function ctx() {
    return {
      client: {} as any,
      sendText: vi.fn(async (_to: string, _t: string) => {}),
      from: '5561993077140',
      forceCadenceForSilentes: async () => ({ acionados: 0 }),
      onFecharStart: vi.fn(async (_leadId: string) => {}),
      onFecharApprove: vi.fn(async (_fechamentoId: string) => {}),
      onFecharRefazer: vi.fn(async (_fechamentoId: string) => {}),
      onFecharCancel: vi.fn(async (_fechamentoId: string) => {}),
    };
  }

  it('evabt:fechar:<leadId> chama onFecharStart', async () => {
    const c = ctx();
    const handled = await tryHandleEvaAdminButton({
      ...c,
      text: 'evabt:fechar:11111111-1111-1111-1111-111111111111',
    });
    expect(handled).toBe(true);
    expect(c.onFecharStart).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
  });

  it('evabt:fechar-aprovar:<fechamentoId> chama onFecharApprove', async () => {
    const c = ctx();
    const handled = await tryHandleEvaAdminButton({
      ...c,
      text: 'evabt:fechar-aprovar:22222222-2222-2222-2222-222222222222',
    });
    expect(handled).toBe(true);
    expect(c.onFecharApprove).toHaveBeenCalledWith('22222222-2222-2222-2222-222222222222');
  });

  it('texto não-botão retorna false', async () => {
    const c = ctx();
    const handled = await tryHandleEvaAdminButton({ ...c, text: 'oi tudo bem' });
    expect(handled).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar pra falhar**

Run: `npx vitest run tests/closing-buttons.test.ts`
Expected: FAIL — assinatura `tryHandleEvaAdminButton` não suporta callbacks novas.

- [ ] **Step 4: Modificar `eva-admin-buttons.ts` — adicionar callbacks opcionais e cases**

Atualizar a interface dos args + adicionar cases no switch. **Exemplo do diff** (adapte ao código real após ler a estrutura completa):

```typescript
// Modificar interface dos args de tryHandleEvaAdminButton
// Adicionar:
//   onFecharStart?: (leadId: string) => Promise<void>;
//   onFecharPick?: (leadId: string) => Promise<void>;
//   onFecharApprove?: (fechamentoId: string) => Promise<void>;
//   onFecharRefazer?: (fechamentoId: string) => Promise<void>;
//   onFecharCancel?: (fechamentoId: string) => Promise<void>;

// No switch (action) adicionar:
//   case 'fechar':       if (leadId && args.onFecharStart) await args.onFecharStart(leadId); return true;
//   case 'fechar-pick':  if (leadId && args.onFecharPick)  await args.onFecharPick(leadId);  return true;
//   case 'fechar-aprovar':  if (leadId && args.onFecharApprove)  await args.onFecharApprove(leadId);  return true;
//   case 'fechar-refazer':  if (leadId && args.onFecharRefazer)  await args.onFecharRefazer(leadId);  return true;
//   case 'fechar-cancelar': if (leadId && args.onFecharCancel)   await args.onFecharCancel(leadId);   return true;
```

Manter regex existente: `^evabt:([a-z0-9-]+)(?::([0-9a-f-]{36}))?$` — já aceita IDs.

- [ ] **Step 5: Rodar pra passar**

Run: `npx vitest run tests/closing-buttons.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/eva-admin-buttons.ts tests/closing-buttons.test.ts
git commit -m "feat(closing): cases evabt:fechar* nos botões admin

5 callbacks opcionais: onFecharStart, onFecharPick, onFecharApprove,
onFecharRefazer, onFecharCancel. Não quebra ninguém — todas
opcionais. Wire-up acontece em src/index.ts (Task 21)."
```

---

## Fatia 9 — Wire-up

### Task 19: Index do módulo closing

**Files:**
- Create: `src/modules/closing/index.ts`

- [ ] **Step 1: Criar barrel**

```typescript
// src/modules/closing/index.ts
export * from './types.js';
export { findMissingRequired, isValidCPF, isValidCNPJ, isValidCEP, isValidEmail, isValidPhoneBR, formatCPF, formatCNPJ, formatCEP, formatPhoneBR } from './closing-validator.js';
export { fetchByLeadId, searchLeadByName, buildInitialData, type LeadRow, type PropostaPublicaRow, type FetchResult } from './closing-data-fetcher.js';
export { renderContrato, buildObservacaoPartes } from './templates/contrato.html.js';
export { renderProcuracao } from './templates/procuracao.html.js';
export { renderHtmlToPdf, shutdownPdfRenderer } from './closing-render.js';
export { ClosingDriveUploader, type UploadFechamentoInput, type UploadFechamentoResult } from './closing-drive.js';
export { ClosingPersist, type CreateFechamentoInput, type UpdateDriveLinksInput } from './closing-persist.js';
export { ClosingAssistant, createAnthropicLlmCaller, type LlmCaller, type LlmResponse } from './closing-assistant.js';
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/closing/index.ts
git commit -m "feat(closing): barrel export do módulo"
```

---

### Task 20: Botão "Fechou venda" no alerta de proposta gerada

**Files:**
- Modify: `src/modules/proposal-assistant.ts`

- [ ] **Step 1: Ler proposal-assistant.ts pra achar o local exato do alerta de proposta gerada**

Read: `src/modules/proposal-assistant.ts` (procurar onde Eva avisa Junior que proposta foi gerada — provavelmente próximo de "✅ Proposta" ou onde `metaService.sendInteractiveButtons` é chamado).

- [ ] **Step 2: Adicionar botão "Fechou venda" no `sendInteractiveButtons` desse alerta**

No ponto onde já manda mensagem pro admin com link da proposta, adicionar `{ id: \`evabt:fechar:${leadId}\`, title: 'Fechou venda' }` aos botões existentes. Limite WABA é 3 botões — se já tem 3, mover um pra fora ou priorizar o "Fechou venda".

- [ ] **Step 3: Validar build**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add src/modules/proposal-assistant.ts
git commit -m "feat(closing): botão 'Fechou venda' no alerta de proposta gerada

evabt:fechar:<lead_id> dispara modo /fechar pro lead em questão."
```

---

### Task 21: Wire-up no src/index.ts — rota /fechar + roteamento

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Ler src/index.ts pra achar onde outros modos (proposal, pricing, scheduling) fazem o roteamento**

Read: `src/index.ts` (procurar por `/proposta`, `/preco`, `/agenda` no router pra entender padrão).

- [ ] **Step 2: Adicionar wire-up do modo closing**

No mesmo arquivo, depois das outras inicializações dos assistentes, adicionar:

```typescript
// Wire-up Modo Fechamento (/fechar)
import {
  ClosingAssistant,
  ClosingDriveUploader,
  ClosingPersist,
  createAnthropicLlmCaller,
  fetchByLeadId,
  searchLeadByName,
  buildInitialData,
  renderContrato,
  renderProcuracao,
  renderHtmlToPdf,
  findMissingRequired,
} from './modules/closing/index.js';

const closingAssistant = new ClosingAssistant({ llm: createAnthropicLlmCaller(process.env.ANTHROPIC_API_KEY!) });
const closingPersist = new ClosingPersist(supabaseClient);  // mesma instância usada pelos outros módulos
const driveAuth = google.drive({ version: 'v3', auth: googleOAuth });  // reusar OAuth do proposal
const closingDrive = new ClosingDriveUploader(driveAuth);

// Estado em Redis: key 'closing:<phone>'
async function getClosingState(phone: string) { /* GET + JSON.parse */ }
async function setClosingState(phone: string, state: ClosingState) { /* SETEX 3600 */ }
async function clearClosingState(phone: string) { /* DEL */ }

// Handler do botão evabt:fechar:<lead_id>
async function handleFecharStart(leadId: string, adminPhone: string) {
  const { lead, proposta } = await fetchByLeadId(supabaseClient, leadId);
  if (!lead) { await sendText(adminPhone, 'Lead não encontrado.'); return; }
  const initialData = buildInitialData(lead, proposta);
  initialData.docs_pedidos = ['contrato', 'procuracao'];
  const missing = findMissingRequired(initialData);
  const nome = lead.nome;
  if (missing.length === 0) {
    await setClosingState(adminPhone, { stage: 'awaiting_confirm', data: initialData as any });
    await sendConfirmacao(adminPhone, initialData);
  } else {
    await setClosingState(adminPhone, { stage: 'collecting', data: initialData, pending_questions: missing });
    await sendText(adminPhone, `Bora fechar ${nome}. Achei os dados, falta: ${missing.slice(0,6).join(', ')}.\nPode mandar tudo junto.`);
  }
}

// Handler de geração final (após botão [Gerar])
async function handleFecharGenerate(adminPhone: string) {
  const state = await getClosingState(adminPhone);
  if (!state || state.stage !== 'awaiting_confirm') return;
  const dados = state.data;
  const cpfTitular = (dados.titular_uc as any).cpf ?? (dados.titular_uc as any).cnpj;
  const fechamentoId = await closingPersist.createFechamento({
    leadId: /* derivar do contexto se houver */ null,
    propostaPublicaId: null,
    dados,
    createdBy: adminPhone,
  });
  const contratoPdf = dados.docs_pedidos.includes('contrato') ? await renderHtmlToPdf(renderContrato(dados)) : undefined;
  const procuracaoPdf = dados.docs_pedidos.includes('procuracao') ? await renderHtmlToPdf(renderProcuracao(dados)) : undefined;
  const version = await closingPersist.nextVersionForLead(/* leadId */ '');
  const links = await closingDrive.uploadFechamento({
    nomeTitular: dados.titular_uc.tipo === 'PF' ? (dados.titular_uc as any).nome : (dados.titular_uc as any).razao_social,
    cpfTitular,
    ano: new Date().getFullYear().toString(),
    version,
    contratoPdf,
    procuracaoPdf,
    dadosInputJson: JSON.stringify(dados, null, 2),
  });
  await closingPersist.updateDriveLinks(fechamentoId, {
    contratoDriveId: links.contratoDriveId,
    contratoDriveLink: links.contratoDriveLink,
    procuracaoDriveId: links.procuracaoDriveId,
    procuracaoDriveLink: links.procuracaoDriveLink,
    driveFolderId: links.folderId,
  });
  await clearClosingState(adminPhone);
  const body = [
    `✅ Pronto pra ${(dados.titular_uc as any).nome ?? (dados.titular_uc as any).razao_social}.`,
    links.contratoDriveLink ? `📄 Contrato: ${links.contratoDriveLink}` : null,
    links.procuracaoDriveLink ? `📄 Procuração: ${links.procuracaoDriveLink}` : null,
    `📁 Pasta: ${links.folderWebViewLink}`,
  ].filter(Boolean).join('\n');
  await metaService.sendInteractiveButtons(adminPhone, body, [
    { id: `evabt:fechar-aprovar:${fechamentoId}`, title: 'Aprovar' },
    { id: `evabt:fechar-refazer:${fechamentoId}`, title: 'Refazer' },
    { id: `evabt:fechar-cancelar:${fechamentoId}`, title: 'Cancelar' },
  ]);
}

// Wire na tryHandleEvaAdminButton (modificar a chamada existente):
const handled = await tryHandleEvaAdminButton({
  /* args existentes */,
  onFecharStart: (leadId) => handleFecharStart(leadId, from),
  onFecharApprove: async (id) => { await closingPersist.updateStatus(id, 'aprovado_junior'); /* + leads.status='cliente' */ await sendText(from, '✅ Marcado como fechado.'); },
  onFecharRefazer: async (id) => { /* recarrega state, volta pra collecting */ },
  onFecharCancel: async (id) => { await closingPersist.updateStatus(id, 'cancelado'); await sendText(from, '❌ Cancelado.'); },
});

// Roteamento de mensagens em modo closing:
// Antes do roteamento atual (proposal/preco/etc), checar:
const closingSt = await getClosingState(from);
if (closingSt) {
  const result = await closingAssistant.processMessage(text, closingSt);
  await setClosingState(from, result.newState as any);
  await sendText(from, result.replyText);
  return;
}

// Comando /fechar [args] entra na fila de comandos junto com /proposta e /preco
if (text.trim().startsWith('/fechar')) {
  const arg = text.replace(/^\/fechar\s*/i, '').trim();
  if (!arg) {
    await setClosingState(from, { stage: 'collecting', data: {}, pending_questions: [] });
    await sendText(from, 'Pra qual cliente? Manda nome (ex: /fechar Camila) ou os dados.');
    return;
  }
  // tenta achar lead pelo nome
  const matches = await searchLeadByName(supabaseClient, arg.split(/[,;]/)[0].trim());
  if (matches.length === 1) { await handleFecharStart(matches[0].id, from); return; }
  if (matches.length === 0) {
    await setClosingState(from, { stage: 'collecting', data: {}, pending_questions: [] });
    await sendText(from, `Não achei "${arg}" no cadastro. Cliente novo? Manda os dados completos.`);
    return;
  }
  // múltiplos: mostra botões pra picar
  const btns = matches.slice(0, 3).map((m) => ({ id: `evabt:fechar-pick:${m.id}`, title: m.nome.slice(0, 20) }));
  await metaService.sendInteractiveButtons(from, `Achei ${matches.length} leads "${arg}". Qual?`, btns);
  return;
}
```

**IMPORTANTE**: Esse step é grande e exige adaptação ao código real de `src/index.ts`. Trabalhar incrementalmente:
1. Primeiro registra os imports e instâncias singleton.
2. Depois adiciona os handlers (`handleFecharStart`, `handleFecharGenerate`, etc).
3. Depois pluga em `tryHandleEvaAdminButton` callbacks.
4. Depois adiciona o roteamento de modo closing antes dos outros assistentes.
5. Depois adiciona o roteamento do comando `/fechar`.

- [ ] **Step 3: Verificar build**

Run: `npx tsc --noEmit`
Expected: zero erros.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(closing): wire-up rota /fechar + roteamento modo closing

Comando /fechar [nome] busca lead, decide entre 1-match (handleFecharStart),
0-match (collecting do zero) ou múltiplos (botão fechar-pick). Modo closing
intercepta mensagens antes dos outros assistentes via estado Redis.
Botões aprovar/refazer/cancelar pluggados em tryHandleEvaAdminButton."
```

---

### Task 22: Botão "Fechou venda" no alerta de proposta vista pelo cliente

**Files:**
- Modify: `src/modules/proposal-followup.ts`

- [ ] **Step 1: Ler proposal-followup.ts pra achar alerta de proposta vista**

Read: `src/modules/proposal-followup.ts`

Procurar onde Eva avisa Junior "cliente abriu a proposta" — adicionar mesmo botão `evabt:fechar:<lead_id>`.

- [ ] **Step 2: Modificar pra incluir o botão**

No ponto onde `proposal-followup.ts` chama `metaService.sendInteractiveButtons` pro admin avisando que o cliente abriu a proposta (procurar por "abriu" / "visualizou" / `proposta_acesso`), incluir o botão:

```typescript
{ id: `evabt:fechar:${leadId}`, title: 'Fechou venda' }
```

Limite WABA é 3 botões. Se já houver 3, priorizar este "Fechou venda" — ele é o ponto de máxima conversão (cliente acabou de ver a proposta). Mover algum botão menos crítico ("Reenviar", "Ver proposta") pro footer ou pra mensagem complementar.

Se a rota não chamar `sendInteractiveButtons` mas só `sendText`, transformar pra `sendInteractiveButtons` com array de 1-3 botões. Manter fallback texto-puro caso `metaWaba` esteja null (Evolution), seguindo padrão `sendAdminWithButtons` de `eva-admin-buttons.ts:38-54`.

- [ ] **Step 3: Build OK**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/modules/proposal-followup.ts
git commit -m "feat(closing): botão 'Fechou venda' no alerta de proposta vista

Mesmo gatilho evabt:fechar:<lead_id>. Permite Junior fechar venda
direto do momento que o cliente abre a proposta — máxima conversão."
```

---

## Fatia 10 — Smoke E2E

### Task 23: Test e2e (fluxo botão → gerar)

**Files:**
- Create: `tests/closing-e2e.test.ts`

- [ ] **Step 1: Escrever teste e2e com stubs**

```typescript
// tests/closing-e2e.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ClosingAssistant, ClosingPersist, ClosingDriveUploader, renderContrato, renderProcuracao, findMissingRequired, buildInitialData, type LlmCaller } from '../src/modules/closing/index.js';
import { leadCamilaRow, propostaPublicaCamilaRow, dadosFechamentoCamilaMesmaPessoa } from './fixtures/closing-camila.js';

const okLlm: LlmCaller = async () => ({
  action: 'ready_to_generate',
  updates: {
    titular_uc: {
      rg: '26163', orgao_emissor_rg: 'MTE-DF', profissao: 'empresária',
      endereco: { bairro: 'Jardim Guaíra II', cidade: 'Águas Lindas de Goiás' },
    } as any,
    docs_pedidos: ['contrato', 'procuracao'],
  },
  message: '✅ ready',
});

function fakeDrive() {
  return {
    files: {
      list: async () => ({ data: { files: [] } }),
      create: vi.fn(async ({ requestBody }: any) => ({
        data: { id: `id-${Math.random()}`, webViewLink: 'http://drive/fake' },
      })),
      get: async () => ({ data: { webViewLink: 'http://drive/folder' } }),
    },
  } as any;
}

describe('closing e2e (sem rede)', () => {
  it('fluxo: lead → buildInitialData → assistant → render → drive', async () => {
    // 1. dados iniciais do lead + proposta
    const initial = buildInitialData(leadCamilaRow as any, propostaPublicaCamilaRow as any);

    // 2. assistant processa "rg 26163 mte-df, à vista pix"
    const assistant = new ClosingAssistant({ llm: okLlm });
    const r1 = await assistant.processMessage('rg 26163 mte-df, à vista PIX', {
      stage: 'collecting',
      data: initial,
      pending_questions: [],
    });
    // Esperado que ainda falte algo (sem rg.bairro etc) — vamos forçar dados completos
    const dataCompleta = dadosFechamentoCamilaMesmaPessoa;
    expect(findMissingRequired(dataCompleta)).toEqual([]);

    // 3. render HTML
    const htmlContrato = renderContrato(dataCompleta);
    const htmlProcuracao = renderProcuracao(dataCompleta);
    expect(htmlContrato).toContain('Camila Barbosa Costa Cardoso');
    expect(htmlProcuracao).toContain('INSTRUMENTO PARTICULAR DE PROCURAÇÃO');

    // 4. drive upload (PDFs stub — não invoca Puppeteer aqui)
    const drive = fakeDrive();
    const uploader = new ClosingDriveUploader(drive);
    const res = await uploader.uploadFechamento({
      nomeTitular: 'Camila Barbosa Costa Cardoso',
      cpfTitular: '028.876.121-90',
      ano: '2026',
      version: 1,
      contratoPdf: Buffer.from('%PDF'),
      procuracaoPdf: Buffer.from('%PDF'),
      dadosInputJson: '{}',
    });
    expect(res.contratoDriveLink).toBeTruthy();
    expect(res.procuracaoDriveLink).toBeTruthy();
  });
});
```

- [ ] **Step 2: Rodar pra passar**

Run: `npx vitest run tests/closing-e2e.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/closing-e2e.test.ts
git commit -m "test(closing): smoke e2e sem rede

Cobre fluxo lead → buildInitialData → assistant → render → drive
em uma cadeia única. Garantia mínima de que tudo conecta antes
do Junior testar em prod."
```

---

### Task 24: Rodar suite inteira

- [ ] **Step 1: Rodar todos os testes**

Run: `cd "C:\Users\Meu Computador\Documents\ecosunpower-agente" && npx vitest run`
Expected: 100% pass.

- [ ] **Step 2: Build de prod**

Run: `npm run build`
Expected: sem erros TypeScript.

- [ ] **Step 3: Se tudo verde, mergear / pushar**

```bash
git log --oneline -25
git push
```

Junior aplica migration 036 manualmente no Supabase (projeto `kupnsoyymulbdzakqlqc`) e clica Implantar no Easypanel.

- [ ] **Step 4: Smoke em prod**

Junior testa:
1. `/fechar` em branco → Eva pergunta cliente.
2. `/fechar Camila` (lead Camila existe ou cria) → Eva acha, pede o que falta.
3. Manda RG + forma de pagamento + "contrato no Toninho" → Eva resume.
4. Clica [Gerar] → recebe 3 links Drive + botões aprovar/refazer/cancelar.
5. Abre contrato no Drive, confere que o Toninho aparece como CONTRATANTE e a caixa amarela menciona cônjuge.
6. Abre procuração — Camila como outorgante.
7. Clica [Aprovar] → leads.status vira 'cliente'.

---

## Checklist final

- [ ] Migration 036 aplicada no Supabase
- [ ] Easypanel Implantado (incluindo Chromium se Dockerfile mudou)
- [ ] Smoke pass em prod (Camila ou outro caso real)
- [ ] Memory atualizada com link pra spec + plano + commit final
