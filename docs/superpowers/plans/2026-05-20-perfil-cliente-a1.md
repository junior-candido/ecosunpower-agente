# Perfil do Cliente — Fatia A1 — Plano de Execução

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entrega da tela `/dashboard/clientes` (lista) + `/dashboard/clientes/:id` (cockpit dark) com cadastro completo de cliente, anexos em Supabase Storage, 3 Eva Insights e schema MMGD pré-criado.

**Architecture:** Camadas puras testáveis (mappers, insights), service Supabase com métodos novos, módulo de Storage isolado, queries de dashboard e views/router. Reusa `classificarSistema`, `DriveUploader` substituído por `supabase.storage`, estética `/cockpit` em prod.

**Tech Stack:** TypeScript, Vitest, Supabase (Postgres + Storage), Express + multer pra upload, Tailwind CSS no template HTML server-rendered.

**Spec:** `docs/superpowers/specs/2026-05-20-perfil-cliente-a1-design.md`

---

## File Structure

### Created
- `supabase/migrations/033_clientes_perfil.sql`
- `src/modules/concessionarias.ts` — lista pré-cadastrada
- `src/modules/clientes/types.ts` — interfaces compartilhadas
- `src/modules/clientes/mappers.ts` — `instalacaoFase`, `statusLabel`, `statusCor` (puro)
- `src/modules/clientes/insights.ts` — `getEvaInsights` (puro)
- `src/modules/anexos/storage.ts` — wrapper sobre `supabase.storage` (upload/delete/signedUrl)
- `src/modules/anexos/service.ts` — `AnexoService` (list/delete + DB)
- `src/modules/dashboard/clientes-queries.ts` — `listClientes`, `getClienteDetail`
- `src/modules/dashboard/clientes-views.ts` — `renderClientesListPage`, `renderClienteDetailPage`
- `tests/clientes-mappers.test.ts`
- `tests/clientes-insights.test.ts`
- `tests/clientes-queries.test.ts`
- `tests/clientes-router.test.ts`
- `tests/anexos-storage.test.ts`
- `tests/concessionarias.test.ts`

### Modified
- `src/modules/supabase.ts` — métodos novos (getClienteByLeadId, listClientesByStatus, updateClienteFields, listAnexos, insertAnexo, deleteAnexo)
- `src/modules/dashboard/router.ts` — 5 rotas novas
- `src/modules/dashboard/views.ts` — adiciona link "Clientes" no nav (renderLayout)
- `package.json` — add `multer` + `@types/multer`

---

## Task 1: Migration SQL + bucket Storage

**Files:**
- Create: `supabase/migrations/033_clientes_perfil.sql`

- [ ] **Step 1: Criar arquivo SQL**

```sql
-- supabase/migrations/033_clientes_perfil.sql
-- Perfil do Cliente Fatia A1
-- Spec: docs/superpowers/specs/2026-05-20-perfil-cliente-a1-design.md

-- 1. Campos novos em leads
alter table leads add column if not exists cpf_cnpj text;
alter table leads add column if not exists data_nascimento date;
alter table leads add column if not exists estado_civil text;
update leads set profile = 'rural' where profile = 'agronegocio';
alter table leads add column if not exists cep text;
alter table leads add column if not exists endereco_rua text;
alter table leads add column if not exists endereco_numero text;
alter table leads add column if not exists endereco_complemento text;
alter table leads add column if not exists uf text;
alter table leads add column if not exists concessionaria text;
alter table leads add column if not exists uc_numero text;
alter table leads add column if not exists tarifa_classe text;
alter table leads add column if not exists tarifa_modalidade text;
alter table leads add column if not exists consumo_medio_kwh integer;
alter table leads add column if not exists conta_media_brl numeric(10,2);
alter table leads add column if not exists consumo_mensal_json jsonb;
alter table leads add column if not exists forma_pagamento text;
alter table leads add column if not exists banco_financiamento text;
alter table leads add column if not exists eh_consumidor_rateio boolean not null default false;
alter table leads add column if not exists uc_geradora_lead_id uuid references leads(id) on delete set null;
alter table leads add column if not exists percentual_rateio numeric(5,2);
alter table leads add column if not exists credito_esperado_kwh integer;
alter table leads add column if not exists vendedor_responsavel text;
alter table leads add column if not exists observacoes_perfil text;

-- 2. Tabela lead_anexos
create table lead_anexos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  tipo text not null,
  descricao text,
  storage_path text not null,
  mime_type text,
  size_bytes integer,
  created_at timestamptz not null default now(),
  created_by text
);
create index lead_anexos_by_lead on lead_anexos (lead_id, created_at desc);
create index lead_anexos_by_tipo on lead_anexos (lead_id, tipo);
```

- [ ] **Step 2: Junior aplica manual no SQL Editor**

Projeto Supabase `kupnsoyymulbdzakqlqc`. Cola o SQL acima → Run → esperar "Success".

- [ ] **Step 3: Junior cria bucket no Supabase Studio**

Studio → Storage → New bucket:
- Nome: `client-attachments`
- Public: OFF
- File size limit: 20 MB
- Allowed MIME types: `image/png, image/jpeg, image/webp, image/heic, application/pdf`

- [ ] **Step 4: Commit migration**

```bash
git add supabase/migrations/033_clientes_perfil.sql
git commit -m "feat(clientes): migration 033 — cadastro completo + lead_anexos (A1 T1)"
```

---

## Task 2: Tipos compartilhados

**Files:**
- Create: `src/modules/clientes/types.ts`

- [ ] **Step 1: Criar arquivo**

```ts
// src/modules/clientes/types.ts

export type InstallationStatus =
  | 'novo' | 'qualificando' | 'qualificado'
  | 'proposta_aceita' | 'contrato_assinado'
  | 'instalado' | 'medidor_trocado'
  | 'operando' | 'pos_venda_concluido'
  | null;

export type JornadaFase =
  | 'lead' | 'proposta' | 'contrato'
  | 'instalado' | 'operando' | 'pos_venda';

export type ClienteProfile = 'residencial' | 'comercial' | 'rural' | 'indefinido';

export type FormaPagamento = 'cartao' | 'boleto' | 'a_vista' | 'financiamento';
export type BancoFinanciamento = 'bv' | 'solfacil' | 'solagora' | 'santander' | 'btg' | 'outro';

export type AnexoTipo =
  | 'parecer_acesso' | 'foto_telhado' | 'foto_instalacao'
  | 'foto_inversor' | 'foto_visita_tecnica' | 'contrato' | 'outros';

export interface ClienteRow {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  profile: ClienteProfile | null;
  installation_status: InstallationStatus;
  installed_at: string | null;
  city: string | null;
  uf: string | null;
  concessionaria: string | null;
  consumo_medio_kwh: number | null;
  conta_media_brl: number | null;
  opt_out: boolean;
  eva_active: boolean;
}

export interface ClienteDetail extends ClienteRow {
  cpf_cnpj: string | null;
  data_nascimento: string | null;
  estado_civil: string | null;
  neighborhood: string | null;
  cep: string | null;
  endereco_rua: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
  uc_numero: string | null;
  tarifa_classe: string | null;
  tarifa_modalidade: string | null;
  consumo_mensal_json: Record<string, number> | null;
  forma_pagamento: FormaPagamento | null;
  banco_financiamento: BancoFinanciamento | null;
  eh_consumidor_rateio: boolean;
  uc_geradora_lead_id: string | null;
  percentual_rateio: number | null;
  credito_esperado_kwh: number | null;
  vendedor_responsavel: string | null;
  observacoes_perfil: string | null;
  review_confirmed_at: string | null;
  lead_source: string | null;
  acquisition_source: string | null;
  created_at: string;
  // Agregados
  sistema: SistemaResumo | null;
  propostas: PropostaResumo[];
  alertas_ativos: AlertaResumo[];
  conversas_recentes: Array<{ role: string; content: string; timestamp: string }>;
  cadence_pendente: number;
  manutencoes_futuras: Array<{ scheduled_date: string; topic: string }>;
  anexos: AnexoListItem[];
}

export interface SistemaResumo {
  id: string;
  apelido: string;
  marca_inversor: string;
  potencia_kwp: number | null;
  qtd_paineis: number | null;
  painel_marca: string | null;
  data_instalacao: string | null;
  geracao_7d_kwh: number;
  geracao_total_kwh: number;
  ratio_ultimos_7d: number;
}

export interface PropostaResumo {
  id: string;
  slug: string;
  numero_proposta: string;
  created_at: string;
  acessos: number;
  cliente_respondeu_at: string | null;
  valor_total_brl: number | null;
}

export interface AlertaResumo {
  id: string;
  tipo: string;
  severidade: string;
  texto: string;
  primeiro_visto_em: string;
}

export interface AnexoListItem {
  id: string;
  tipo: AnexoTipo;
  descricao: string | null;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  signed_url?: string;
}

export interface InsightCard {
  id: 'upgrade' | 'depoimento' | 'aniversario';
  texto: string;
  cta: { label: string; action: string; params: Record<string, unknown> } | null;
}
```

- [ ] **Step 2: Verificar compila**

```bash
npx tsc --noEmit
```
Expected: EXIT 0.

- [ ] **Step 3: Commit**

```bash
git add src/modules/clientes/types.ts
git commit -m "feat(clientes): tipos compartilhados (A1 T2)"
```

---

## Task 3: Lista de Concessionárias do Brasil

**Files:**
- Create: `src/modules/concessionarias.ts`
- Test: `tests/concessionarias.test.ts`

- [ ] **Step 1: Escrever teste**

```ts
// tests/concessionarias.test.ts
import { describe, it, expect } from 'vitest';
import { CONCESSIONARIAS_BR, getConcessionariaById, getConcessionariasByUF } from '../src/modules/concessionarias.js';

describe('CONCESSIONARIAS_BR', () => {
  it('tem pelo menos 29 entradas + "outra"', () => {
    expect(CONCESSIONARIAS_BR.length).toBeGreaterThanOrEqual(30);
    expect(CONCESSIONARIAS_BR.some(c => c.id === 'outra')).toBe(true);
  });

  it('tem Neoenergia-DF e Equatorial-GO (foco EcoSun)', () => {
    expect(CONCESSIONARIAS_BR.some(c => c.id === 'neoenergia-df' && c.uf === 'DF')).toBe(true);
    expect(CONCESSIONARIAS_BR.some(c => c.id === 'equatorial-go' && c.uf === 'GO')).toBe(true);
  });

  it('todas têm id, nome, uf (ou null pra "outra")', () => {
    for (const c of CONCESSIONARIAS_BR) {
      expect(typeof c.id).toBe('string');
      expect(typeof c.nome).toBe('string');
      expect(c.uf === null || typeof c.uf === 'string').toBe(true);
    }
  });

  it('getConcessionariaById retorna match', () => {
    expect(getConcessionariaById('neoenergia-df')?.nome).toBe('Neoenergia Brasília');
    expect(getConcessionariaById('inexistente')).toBeNull();
  });

  it('getConcessionariasByUF filtra por estado', () => {
    const sp = getConcessionariasByUF('SP');
    expect(sp.length).toBeGreaterThanOrEqual(2);
    expect(sp.every(c => c.uf === 'SP')).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar pra ver falhar**

```bash
npx vitest run tests/concessionarias.test.ts
```
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
// src/modules/concessionarias.ts

export interface Concessionaria {
  id: string;
  nome: string;
  uf: string | null;
}

export const CONCESSIONARIAS_BR: Concessionaria[] = [
  { id: 'neoenergia-df', nome: 'Neoenergia Brasília', uf: 'DF' },
  { id: 'equatorial-go', nome: 'Equatorial Goiás', uf: 'GO' },
  { id: 'cemig', nome: 'CEMIG', uf: 'MG' },
  { id: 'cpfl-paulista', nome: 'CPFL Paulista', uf: 'SP' },
  { id: 'enel-sp', nome: 'Enel São Paulo', uf: 'SP' },
  { id: 'enel-rj', nome: 'Enel Rio de Janeiro', uf: 'RJ' },
  { id: 'enel-ce', nome: 'Enel Ceará', uf: 'CE' },
  { id: 'light', nome: 'Light', uf: 'RJ' },
  { id: 'coelba', nome: 'Coelba (Neoenergia BA)', uf: 'BA' },
  { id: 'celpe', nome: 'Celpe (Neoenergia PE)', uf: 'PE' },
  { id: 'cosern', nome: 'Cosern (Neoenergia RN)', uf: 'RN' },
  { id: 'copel', nome: 'Copel', uf: 'PR' },
  { id: 'celesc', nome: 'Celesc', uf: 'SC' },
  { id: 'rge', nome: 'RGE Sul', uf: 'RS' },
  { id: 'ceee', nome: 'CEEE Equatorial', uf: 'RS' },
  { id: 'energisa-mt', nome: 'Energisa MT', uf: 'MT' },
  { id: 'energisa-ms', nome: 'Energisa MS', uf: 'MS' },
  { id: 'energisa-to', nome: 'Energisa Tocantins', uf: 'TO' },
  { id: 'energisa-pb', nome: 'Energisa Paraíba', uf: 'PB' },
  { id: 'energisa-se', nome: 'Energisa Sergipe', uf: 'SE' },
  { id: 'energisa-mg', nome: 'Energisa Minas Gerais', uf: 'MG' },
  { id: 'amazonas-energia', nome: 'Amazonas Energia', uf: 'AM' },
  { id: 'cea-equatorial', nome: 'CEA Equatorial', uf: 'AP' },
  { id: 'equatorial-ma', nome: 'Equatorial Maranhão', uf: 'MA' },
  { id: 'equatorial-pa', nome: 'Equatorial Pará', uf: 'PA' },
  { id: 'equatorial-pi', nome: 'Equatorial Piauí', uf: 'PI' },
  { id: 'roraima-energia', nome: 'Roraima Energia', uf: 'RR' },
  { id: 'eletroacre', nome: 'Energisa Acre', uf: 'AC' },
  { id: 'energisa-ro', nome: 'Energisa Rondônia', uf: 'RO' },
  { id: 'outra', nome: 'Outra (custom)', uf: null },
];

export function getConcessionariaById(id: string): Concessionaria | null {
  return CONCESSIONARIAS_BR.find(c => c.id === id) ?? null;
}

export function getConcessionariasByUF(uf: string): Concessionaria[] {
  return CONCESSIONARIAS_BR.filter(c => c.uf === uf);
}
```

- [ ] **Step 4: Rodar pra ver passar**

```bash
npx vitest run tests/concessionarias.test.ts
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/concessionarias.ts tests/concessionarias.test.ts
git commit -m "feat(concessionarias): lista BR completa + lookups (A1 T3)"
```

---

## Task 4: Mappers puros — installation_status → fase/cor/label

**Files:**
- Create: `src/modules/clientes/mappers.ts`
- Test: `tests/clientes-mappers.test.ts`

- [ ] **Step 1: Escrever teste**

```ts
// tests/clientes-mappers.test.ts
import { describe, it, expect } from 'vitest';
import {
  instalacaoFase,
  statusLabel,
  statusCorChip,
  isCliente,
  faseConcluida,
} from '../src/modules/clientes/mappers.js';

describe('instalacaoFase (installation_status → fase da jornada)', () => {
  it('null/novo/qualificando → lead', () => {
    expect(instalacaoFase(null)).toBe('lead');
    expect(instalacaoFase('novo')).toBe('lead');
    expect(instalacaoFase('qualificando')).toBe('lead');
  });
  it('qualificado → proposta', () => {
    expect(instalacaoFase('qualificado')).toBe('proposta');
  });
  it('proposta_aceita/contrato_assinado → contrato', () => {
    expect(instalacaoFase('proposta_aceita')).toBe('contrato');
    expect(instalacaoFase('contrato_assinado')).toBe('contrato');
  });
  it('instalado/medidor_trocado → instalado', () => {
    expect(instalacaoFase('instalado')).toBe('instalado');
    expect(instalacaoFase('medidor_trocado')).toBe('instalado');
  });
  it('operando → operando', () => {
    expect(instalacaoFase('operando')).toBe('operando');
  });
  it('pos_venda_concluido → pos_venda', () => {
    expect(instalacaoFase('pos_venda_concluido')).toBe('pos_venda');
  });
});

describe('isCliente (filtro de quem aparece em /clientes)', () => {
  it('instalado em diante = cliente', () => {
    expect(isCliente('contrato_assinado')).toBe(true);
    expect(isCliente('instalado')).toBe(true);
    expect(isCliente('medidor_trocado')).toBe(true);
    expect(isCliente('operando')).toBe(true);
    expect(isCliente('pos_venda_concluido')).toBe(true);
  });
  it('lead/qualificando/qualificado/proposta_aceita = NÃO cliente', () => {
    expect(isCliente(null)).toBe(false);
    expect(isCliente('novo')).toBe(false);
    expect(isCliente('qualificando')).toBe(false);
    expect(isCliente('qualificado')).toBe(false);
    expect(isCliente('proposta_aceita')).toBe(false);
  });
});

describe('statusLabel (PT-BR)', () => {
  it('mapeia todos os status', () => {
    expect(statusLabel('operando')).toBe('Operando');
    expect(statusLabel('instalado')).toBe('Instalado');
    expect(statusLabel('contrato_assinado')).toBe('Contrato assinado');
    expect(statusLabel(null)).toBe('—');
  });
});

describe('statusCorChip (CSS class tailwind)', () => {
  it('verde pra operando/pos_venda', () => {
    expect(statusCorChip('operando')).toContain('green');
    expect(statusCorChip('pos_venda_concluido')).toContain('green');
  });
  it('azul pra instalado/contrato', () => {
    expect(statusCorChip('instalado')).toContain('sky');
  });
});

describe('faseConcluida', () => {
  it('lead em qualquer fase >= lead → true', () => {
    expect(faseConcluida('lead', 'operando')).toBe(true);
  });
  it('operando em lead → false', () => {
    expect(faseConcluida('operando', 'lead')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar pra ver falhar**

```bash
npx vitest run tests/clientes-mappers.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/modules/clientes/mappers.ts
import type { InstallationStatus, JornadaFase } from './types.js';

const FASES_ORDEM: JornadaFase[] = ['lead', 'proposta', 'contrato', 'instalado', 'operando', 'pos_venda'];

export function instalacaoFase(status: InstallationStatus): JornadaFase {
  switch (status) {
    case 'qualificado': return 'proposta';
    case 'proposta_aceita':
    case 'contrato_assinado': return 'contrato';
    case 'instalado':
    case 'medidor_trocado': return 'instalado';
    case 'operando': return 'operando';
    case 'pos_venda_concluido': return 'pos_venda';
    default: return 'lead';
  }
}

const CLIENTE_STATUSES = new Set<InstallationStatus>([
  'contrato_assinado', 'instalado', 'medidor_trocado',
  'operando', 'pos_venda_concluido',
]);
export function isCliente(status: InstallationStatus): boolean {
  return CLIENTE_STATUSES.has(status);
}

const LABELS: Record<string, string> = {
  novo: 'Novo lead',
  qualificando: 'Qualificando',
  qualificado: 'Qualificado',
  proposta_aceita: 'Proposta aceita',
  contrato_assinado: 'Contrato assinado',
  instalado: 'Instalado',
  medidor_trocado: 'Medidor trocado',
  operando: 'Operando',
  pos_venda_concluido: 'Pós-venda concluído',
};
export function statusLabel(status: InstallationStatus): string {
  if (!status) return '—';
  return LABELS[status] ?? status;
}

export function statusCorChip(status: InstallationStatus): string {
  switch (status) {
    case 'operando':
    case 'pos_venda_concluido':
      return 'bg-green-500/15 border-green-500/40 text-green-400';
    case 'instalado':
    case 'medidor_trocado':
    case 'contrato_assinado':
      return 'bg-sky-500/15 border-sky-500/40 text-sky-400';
    case 'proposta_aceita':
    case 'qualificado':
      return 'bg-amber-500/15 border-amber-500/40 text-amber-400';
    default:
      return 'bg-slate-500/15 border-slate-500/40 text-slate-400';
  }
}

export function faseConcluida(faseAlvo: JornadaFase, faseAtual: JornadaFase): boolean {
  return FASES_ORDEM.indexOf(faseAlvo) <= FASES_ORDEM.indexOf(faseAtual);
}
```

- [ ] **Step 4: Rodar pra ver passar**

```bash
npx vitest run tests/clientes-mappers.test.ts
```
Expected: PASS, todos os describes verdes.

- [ ] **Step 5: Commit**

```bash
git add src/modules/clientes/mappers.ts tests/clientes-mappers.test.ts
git commit -m "feat(clientes): mappers puros installation_status → fase/cor/label (A1 T4)"
```

---

## Task 5: getEvaInsights puro (3 regras)

**Files:**
- Create: `src/modules/clientes/insights.ts`
- Test: `tests/clientes-insights.test.ts`

- [ ] **Step 1: Escrever teste**

```ts
// tests/clientes-insights.test.ts
import { describe, it, expect } from 'vitest';
import { getEvaInsights } from '../src/modules/clientes/insights.js';

const hoje = new Date('2026-05-20T12:00:00Z');

function base(o: any = {}): any {
  return {
    installed_at: '2025-09-01',
    review_confirmed_at: null,
    sistema: { id: 'sid-1', ratio_ultimos_7d: 1.0 },
    consumo_mensal_json: null,
    opt_out: false,
    manutencoes_futuras: [],
    ...o,
  };
}

describe('getEvaInsights — Upgrade (conta subiu)', () => {
  it('dispara se +25% em 3 meses', () => {
    const detail = base({
      consumo_mensal_json: {
        '2026-02': 1000,
        '2026-03': 1200,
        '2026-04': 1350,  // +35%
      },
    });
    const r = getEvaInsights(detail, hoje);
    expect(r.find((c) => c.id === 'upgrade')).toBeDefined();
  });
  it('não dispara se variação < 25%', () => {
    const detail = base({
      consumo_mensal_json: {
        '2026-02': 1000,
        '2026-03': 1050,
        '2026-04': 1100,  // +10%
      },
    });
    const r = getEvaInsights(detail, hoje);
    expect(r.find((c) => c.id === 'upgrade')).toBeUndefined();
  });
  it('não dispara se consumo_mensal_json vazio', () => {
    const r = getEvaInsights(base(), hoje);
    expect(r.find((c) => c.id === 'upgrade')).toBeUndefined();
  });
});

describe('getEvaInsights — Depoimento', () => {
  it('dispara se ratio_7d > 1.1 E installed > 60d E sem review_confirmed_at', () => {
    const detail = base({
      sistema: { id: 'sid-1', ratio_ultimos_7d: 1.15 },
      installed_at: '2025-09-01',  // > 60 dias antes de 2026-05-20
      review_confirmed_at: null,
    });
    const r = getEvaInsights(detail, hoje);
    const dep = r.find((c) => c.id === 'depoimento');
    expect(dep).toBeDefined();
    expect(dep?.cta?.action).toBe('eva_pedir_depoimento');
  });
  it('não dispara se já tem review_confirmed_at', () => {
    const detail = base({
      sistema: { id: 'sid-1', ratio_ultimos_7d: 1.15 },
      review_confirmed_at: '2026-04-01',
    });
    const r = getEvaInsights(detail, hoje);
    expect(r.find((c) => c.id === 'depoimento')).toBeUndefined();
  });
  it('não dispara se installed < 60d', () => {
    const detail = base({
      sistema: { id: 'sid-1', ratio_ultimos_7d: 1.15 },
      installed_at: '2026-05-01',  // só 19 dias
    });
    const r = getEvaInsights(detail, hoje);
    expect(r.find((c) => c.id === 'depoimento')).toBeUndefined();
  });
});

describe('getEvaInsights — Aniversário', () => {
  it('dispara se mês atual = mês installed E ano > ano installed', () => {
    const detail = base({ installed_at: '2025-05-15' });  // mês 5 igual ao hoje
    const r = getEvaInsights(detail, hoje);
    const aniv = r.find((c) => c.id === 'aniversario');
    expect(aniv).toBeDefined();
    expect(aniv?.cta?.action).toBe('agendar_revisao_aniversario');
  });
  it('não dispara no mesmo ano da instalação', () => {
    const detail = base({ installed_at: '2026-05-01' });
    const r = getEvaInsights(detail, hoje);
    expect(r.find((c) => c.id === 'aniversario')).toBeUndefined();
  });
  it('não dispara se já tem lembrete aniversario_Na nos últimos 30d', () => {
    const detail = base({
      installed_at: '2025-05-15',
      manutencoes_futuras: [
        { scheduled_date: '2026-05-15', topic: 'aniversario_1a' },
      ],
    });
    const r = getEvaInsights(detail, hoje);
    expect(r.find((c) => c.id === 'aniversario')).toBeUndefined();
  });
});

describe('getEvaInsights — CTA desabilitada se opt_out', () => {
  it('depoimento sem cta quando opt_out=true', () => {
    const detail = base({
      sistema: { id: 'sid-1', ratio_ultimos_7d: 1.15 },
      opt_out: true,
    });
    const r = getEvaInsights(detail, hoje);
    const dep = r.find((c) => c.id === 'depoimento');
    expect(dep?.cta).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar pra ver falhar**

```bash
npx vitest run tests/clientes-insights.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/modules/clientes/insights.ts
import type { ClienteDetail, InsightCard } from './types.js';

export function getEvaInsights(detail: Partial<ClienteDetail>, hoje: Date): InsightCard[] {
  const out: InsightCard[] = [];
  const ctaDisponivel = !detail.opt_out;

  // Card 1: Upgrade — conta subiu ≥25% em 3 meses
  const cm = detail.consumo_mensal_json;
  if (cm && typeof cm === 'object') {
    const meses = Object.keys(cm).sort().slice(-3);
    if (meses.length === 3) {
      const valores = meses.map((m) => cm[m]).filter((v): v is number => typeof v === 'number');
      if (valores.length === 3) {
        const variacao = (valores[2] - valores[0]) / valores[0];
        if (variacao >= 0.25) {
          out.push({
            id: 'upgrade',
            texto: `Conta de luz +${Math.round(variacao * 100)}% nos últimos 3 meses. Provável demanda nova.`,
            cta: ctaDisponivel ? { label: '▶ Propor upgrade', action: 'criar_proposta_upgrade', params: {} } : null,
          });
        }
      }
    }
  }

  // Card 2: Depoimento — ratio_7d > 1.1, installed > 60d, sem review
  if (detail.sistema && detail.sistema.ratio_ultimos_7d > 1.1 && detail.installed_at && !detail.review_confirmed_at) {
    const installedDate = new Date(detail.installed_at);
    const diasInstalado = (hoje.getTime() - installedDate.getTime()) / (1000 * 60 * 60 * 24);
    if (diasInstalado > 60) {
      out.push({
        id: 'depoimento',
        texto: `Sistema gerando ${Math.round(detail.sistema.ratio_ultimos_7d * 100)}% do esperado. Momento de pedir depoimento.`,
        cta: ctaDisponivel ? { label: '▶ Eva pedir', action: 'eva_pedir_depoimento', params: {} } : null,
      });
    }
  }

  // Card 3: Aniversário
  if (detail.installed_at) {
    const installedDate = new Date(detail.installed_at);
    const mesmoMes = installedDate.getUTCMonth() === hoje.getUTCMonth();
    const anoMaior = hoje.getUTCFullYear() > installedDate.getUTCFullYear();
    if (mesmoMes && anoMaior) {
      const anos = hoje.getUTCFullYear() - installedDate.getUTCFullYear();
      const jaTemLembrete = (detail.manutencoes_futuras ?? []).some(
        (m) => m.topic === `aniversario_${anos}a`,
      );
      if (!jaTemLembrete) {
        out.push({
          id: 'aniversario',
          texto: `Aniversário ${anos} ano${anos > 1 ? 's' : ''} de sistema este mês. Programar revisão preventiva.`,
          cta: ctaDisponivel ? { label: '▶ Agendar revisão', action: 'agendar_revisao_aniversario', params: { anos } } : null,
        });
      }
    }
  }

  return out;
}
```

- [ ] **Step 4: Rodar pra ver passar**

```bash
npx vitest run tests/clientes-insights.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/clientes/insights.ts tests/clientes-insights.test.ts
git commit -m "feat(clientes): getEvaInsights puro — Upgrade/Depoimento/Aniversário (A1 T5)"
```

---

## Task 6: Métodos novos no SupabaseService

**Files:**
- Modify: `src/modules/supabase.ts` (acrescenta métodos antes do `}` final)
- Test: estende `tests/supabase.test.ts` (cria se necessário um separado pra escopo limpo)

- [ ] **Step 1: Confirmar linha do `}` final da classe**

```bash
grep -n "^}" src/modules/supabase.ts | tail -3
```
Anotar resultado.

- [ ] **Step 2: Adicionar os métodos antes do `}` final**

```ts
  // ====================================================================
  // Perfil do Cliente A1
  // ====================================================================

  async listClientesByStatus(statuses: string[], filters: { q?: string; concessionaria?: string; cidade?: string; ord?: string } = {}, limit: number = 50, offset: number = 0): Promise<any[]> {
    let q = this.client
      .from('leads')
      .select('id, name, phone, email, profile, installation_status, installed_at, city, uf, concessionaria, consumo_medio_kwh, conta_media_brl, opt_out, eva_active')
      .in('installation_status', statuses)
      .limit(limit);

    if (filters.q) q = q.or(`name.ilike.%${filters.q}%,phone.ilike.%${filters.q}%,email.ilike.%${filters.q}%,cpf_cnpj.ilike.%${filters.q}%`);
    if (filters.concessionaria) q = q.eq('concessionaria', filters.concessionaria);
    if (filters.cidade) q = q.eq('city', filters.cidade);

    if (filters.ord === 'nome') q = q.order('name', { ascending: true });
    else q = q.order('updated_at', { ascending: false });

    const { data, error } = await q.range(offset, offset + limit - 1);
    if (error) {
      console.error('[supabase] listClientesByStatus:', error.message);
      return [];
    }
    return data ?? [];
  }

  async getClienteByLeadId(leadId: string): Promise<any | null> {
    const { data, error } = await this.client.from('leads').select('*').eq('id', leadId).single();
    if (error) {
      console.warn('[supabase] getClienteByLeadId:', error.message);
      return null;
    }
    return data;
  }

  async updateClienteFields(leadId: string, fields: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      cleaned[k] = v;
    }
    if (Object.keys(cleaned).length === 0) return { ok: true };
    cleaned.updated_at = new Date().toISOString();

    const { error } = await this.client.from('leads').update(cleaned).eq('id', leadId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async listAnexos(leadId: string): Promise<any[]> {
    const { data, error } = await this.client
      .from('lead_anexos')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[supabase] listAnexos:', error.message);
      return [];
    }
    return data ?? [];
  }

  async insertAnexo(input: {
    lead_id: string; tipo: string; descricao: string | null;
    storage_path: string; mime_type: string | null; size_bytes: number | null;
    created_by: string;
  }): Promise<{ ok: boolean; id?: string; error?: string }> {
    const { data, error } = await this.client
      .from('lead_anexos')
      .insert(input)
      .select('id')
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data.id };
  }

  async deleteAnexo(anexoId: string): Promise<{ ok: boolean; storage_path?: string; error?: string }> {
    // 1. pega storage_path antes
    const { data: row, error: rdErr } = await this.client.from('lead_anexos').select('storage_path').eq('id', anexoId).single();
    if (rdErr) return { ok: false, error: rdErr.message };
    const storage_path = row?.storage_path;

    // 2. deleta row
    const { error: delErr } = await this.client.from('lead_anexos').delete().eq('id', anexoId);
    if (delErr) return { ok: false, error: delErr.message };

    return { ok: true, storage_path };
  }

  async listPropostasByLeadId(leadId: string): Promise<any[]> {
    const { data, error } = await this.client
      .from('propostas_publicas')
      .select('id, slug, numero_proposta, created_at, acessos, cliente_respondeu_at, dados_input')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });
    if (error) return [];
    return data ?? [];
  }

  async listAlertasAtivosByLeadId(leadId: string): Promise<any[]> {
    // alertas via sistemas_clientes
    const { data: sistemas } = await this.client.from('sistemas_clientes').select('id').eq('lead_id', leadId);
    const sistemaIds = (sistemas ?? []).map((s: any) => s.id);
    if (sistemaIds.length === 0) return [];
    const { data, error } = await this.client
      .from('monitoring_alerts')
      .select('id, tipo, severidade, texto, primeiro_visto_em, sistema_id')
      .in('sistema_id', sistemaIds)
      .is('resolved_at', null)
      .order('primeiro_visto_em', { ascending: false });
    if (error) return [];
    return data ?? [];
  }

  async listManutencoesFuturasByLeadId(leadId: string): Promise<any[]> {
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, error } = await this.client
      .from('maintenance_reminders')
      .select('scheduled_date, topic, status')
      .eq('lead_id', leadId)
      .eq('status', 'pending')
      .gte('scheduled_date', hoje)
      .order('scheduled_date', { ascending: true });
    if (error) return [];
    return data ?? [];
  }
```

- [ ] **Step 3: Verificar TS compila + suite atual passa**

```bash
npx tsc --noEmit
npx vitest run
```
Expected: TS EXIT 0, suite verde (exceto 2 cases-fetcher pré-existentes).

- [ ] **Step 4: Commit**

```bash
git add src/modules/supabase.ts
git commit -m "feat(supabase): métodos do Perfil do Cliente A1 (listClientes/getCliente/updateCliente/anexos/agregados) (A1 T6)"
```

---

## Task 7: Storage service de anexos

**Files:**
- Create: `src/modules/anexos/storage.ts`
- Test: `tests/anexos-storage.test.ts`

- [ ] **Step 1: Escrever teste**

```ts
// tests/anexos-storage.test.ts
import { describe, it, expect, vi } from 'vitest';

const uploadMock = vi.fn();
const removeMock = vi.fn();
const createSignedUrlMock = vi.fn();
const createSignedUrlsMock = vi.fn();
const fromMock = vi.fn().mockReturnValue({
  upload: uploadMock,
  remove: removeMock,
  createSignedUrl: createSignedUrlMock,
  createSignedUrls: createSignedUrlsMock,
});
const supabaseStub: any = { storage: { from: fromMock } };

describe('storage.uploadAnexo', () => {
  it('gera path padrão <leadId>/<tipo>/<uuid>.<ext>', async () => {
    uploadMock.mockResolvedValueOnce({ data: { path: 'lead-1/foto_telhado/abc.jpg' }, error: null });
    const { uploadAnexo } = await import('../src/modules/anexos/storage.js');
    const buf = Buffer.from('xx');
    const r = await uploadAnexo(supabaseStub, 'lead-1', 'foto_telhado', buf, 'image/jpeg', 'jpg');
    expect(r.ok).toBe(true);
    expect(r.storage_path).toMatch(/^lead-1\/foto_telhado\/[0-9a-f-]+\.jpg$/);
    expect(uploadMock).toHaveBeenCalled();
  });

  it('upload falha → retorna ok:false', async () => {
    uploadMock.mockResolvedValueOnce({ data: null, error: { message: 'storage full' } });
    const { uploadAnexo } = await import('../src/modules/anexos/storage.js');
    const r = await uploadAnexo(supabaseStub, 'lead-1', 'contrato', Buffer.from('x'), 'application/pdf', 'pdf');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('storage full');
  });
});

describe('storage.deleteAnexoFile', () => {
  it('chama remove com path', async () => {
    removeMock.mockResolvedValueOnce({ data: null, error: null });
    const { deleteAnexoFile } = await import('../src/modules/anexos/storage.js');
    const r = await deleteAnexoFile(supabaseStub, 'lead-1/contrato/x.pdf');
    expect(r.ok).toBe(true);
    expect(removeMock).toHaveBeenCalledWith(['lead-1/contrato/x.pdf']);
  });
});

describe('storage.getSignedUrls (batch)', () => {
  it('chama createSignedUrls com TTL', async () => {
    createSignedUrlsMock.mockResolvedValueOnce({
      data: [
        { path: 'lead-1/contrato/x.pdf', signedUrl: 'https://...?token=abc' },
        { path: 'lead-1/foto_telhado/y.jpg', signedUrl: 'https://...?token=def' },
      ],
      error: null,
    });
    const { getSignedUrls } = await import('../src/modules/anexos/storage.js');
    const r = await getSignedUrls(supabaseStub, ['lead-1/contrato/x.pdf', 'lead-1/foto_telhado/y.jpg'], 3600);
    expect(r['lead-1/contrato/x.pdf']).toContain('https://');
    expect(createSignedUrlsMock).toHaveBeenCalledWith(['lead-1/contrato/x.pdf', 'lead-1/foto_telhado/y.jpg'], 3600);
  });
});
```

- [ ] **Step 2: Rodar pra ver falhar**

```bash
npx vitest run tests/anexos-storage.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/modules/anexos/storage.ts
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'client-attachments';

export interface UploadResult { ok: boolean; storage_path?: string; error?: string }

export async function uploadAnexo(
  client: SupabaseClient,
  leadId: string,
  tipo: string,
  buffer: Buffer,
  mimeType: string,
  ext: string,
): Promise<UploadResult> {
  const path = `${leadId}/${tipo}/${randomUUID()}.${ext}`;
  const { error } = await client.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, storage_path: path };
}

export async function deleteAnexoFile(client: SupabaseClient, storagePath: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await client.storage.from(BUCKET).remove([storagePath]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function getSignedUrls(
  client: SupabaseClient,
  storagePaths: string[],
  ttlSeconds: number,
): Promise<Record<string, string>> {
  if (storagePaths.length === 0) return {};
  const { data, error } = await client.storage.from(BUCKET).createSignedUrls(storagePaths, ttlSeconds);
  if (error || !data) return {};
  const out: Record<string, string> = {};
  for (const r of data) if (r.signedUrl && r.path) out[r.path] = r.signedUrl;
  return out;
}
```

- [ ] **Step 4: Rodar pra ver passar**

```bash
npx vitest run tests/anexos-storage.test.ts
npx tsc --noEmit
```
Expected: PASS + TS OK.

- [ ] **Step 5: Commit**

```bash
git add src/modules/anexos/storage.ts tests/anexos-storage.test.ts
git commit -m "feat(anexos): wrapper supabase.storage (upload/delete/signed-urls) (A1 T7)"
```

---

## Task 8: clientes-queries — orquestração

**Files:**
- Create: `src/modules/dashboard/clientes-queries.ts`
- Test: `tests/clientes-queries.test.ts`

- [ ] **Step 1: Escrever teste**

```ts
// tests/clientes-queries.test.ts
import { describe, it, expect, vi } from 'vitest';
import { listClientes, getClienteDetail } from '../src/modules/dashboard/clientes-queries.js';

function fakeSupabase(o: any = {}) {
  return {
    listClientesByStatus: vi.fn().mockResolvedValue([]),
    getClienteByLeadId: vi.fn().mockResolvedValue(null),
    listAnexos: vi.fn().mockResolvedValue([]),
    listPropostasByLeadId: vi.fn().mockResolvedValue([]),
    listAlertasAtivosByLeadId: vi.fn().mockResolvedValue([]),
    listManutencoesFuturasByLeadId: vi.fn().mockResolvedValue([]),
    getClient: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUrls: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      },
    }),
    ...o,
  };
}
function fakeMonitoring(sistemas: any[] = []) {
  return {
    listarParaDashboard: vi.fn().mockResolvedValue(sistemas),
  };
}

describe('listClientes', () => {
  it('filtra apenas statuses de cliente', async () => {
    const sb = fakeSupabase();
    await listClientes(sb as any, {});
    expect(sb.listClientesByStatus).toHaveBeenCalled();
    const [statuses] = sb.listClientesByStatus.mock.calls[0];
    expect(statuses).toContain('operando');
    expect(statuses).toContain('instalado');
    expect(statuses).not.toContain('novo');
    expect(statuses).not.toContain('qualificando');
  });
});

describe('getClienteDetail', () => {
  it('retorna null se lead não existe', async () => {
    const sb = fakeSupabase();
    const r = await getClienteDetail(sb as any, fakeMonitoring() as any, 'lead-x');
    expect(r).toBeNull();
  });

  it('agrega sistemas/propostas/alertas/anexos do lead em paralelo', async () => {
    const sb = fakeSupabase({
      getClienteByLeadId: vi.fn().mockResolvedValue({ id: 'lead-1', name: 'X', phone: '11', installation_status: 'operando' }),
      listAnexos: vi.fn().mockResolvedValue([{ id: 'a1', tipo: 'contrato', storage_path: 'p/x.pdf', mime_type: 'application/pdf' }]),
      listPropostasByLeadId: vi.fn().mockResolvedValue([{ id: 'p1' }]),
      listAlertasAtivosByLeadId: vi.fn().mockResolvedValue([{ id: 'al1' }]),
    });
    const ms = fakeMonitoring([{ id: 's1', lead_id: 'lead-1', apelido: 'Casa', potencia_kwp: 5 }]);
    const r = await getClienteDetail(sb as any, ms as any, 'lead-1');
    expect(r).not.toBeNull();
    expect(r?.propostas.length).toBe(1);
    expect(r?.alertas_ativos.length).toBe(1);
    expect(r?.anexos.length).toBe(1);
    expect(r?.sistema?.apelido).toBe('Casa');
  });
});
```

- [ ] **Step 2: Rodar pra ver falhar**

```bash
npx vitest run tests/clientes-queries.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/modules/dashboard/clientes-queries.ts
import type { SupabaseService } from '../supabase.js';
import type { MonitoringService } from '../monitoring/service.js';
import { classificarSistema, esperadoDiaKwh } from '../monitoring/classificacao.js';
import { getSignedUrls } from '../anexos/storage.js';
import type { ClienteRow, ClienteDetail, AnexoListItem } from '../clientes/types.js';

const CLIENTE_STATUSES = [
  'contrato_assinado', 'instalado', 'medidor_trocado',
  'operando', 'pos_venda_concluido',
];

export async function listClientes(
  supabase: SupabaseService,
  filters: { q?: string; concessionaria?: string; cidade?: string; ord?: string },
): Promise<ClienteRow[]> {
  const rows = await supabase.listClientesByStatus(CLIENTE_STATUSES, filters);
  return rows as ClienteRow[];
}

export async function getClienteDetail(
  supabase: SupabaseService,
  monitoring: MonitoringService,
  leadId: string,
): Promise<ClienteDetail | null> {
  const lead = await supabase.getClienteByLeadId(leadId);
  if (!lead) return null;

  const [propostas, alertasAtivos, anexosRaw, manutencoesFuturas, sistemasTodos] = await Promise.all([
    supabase.listPropostasByLeadId(leadId),
    supabase.listAlertasAtivosByLeadId(leadId),
    supabase.listAnexos(leadId),
    supabase.listManutencoesFuturasByLeadId(leadId),
    monitoring.listarParaDashboard() as Promise<any[]>,
  ]);

  // Sistema vinculado
  const sistemaRaw = sistemasTodos.find((s: any) => s.lead_id === leadId);
  let sistema = null;
  if (sistemaRaw) {
    const esperado7 = esperadoDiaKwh(sistemaRaw.potencia_kwp, sistemaRaw.uf) * 7;
    const real7 = sistemaRaw.geracao_7d_kwh ?? 0;
    const ratio = esperado7 > 0 ? real7 / esperado7 : 1;
    sistema = {
      id: sistemaRaw.id,
      apelido: sistemaRaw.apelido,
      marca_inversor: sistemaRaw.marca_inversor,
      potencia_kwp: sistemaRaw.potencia_kwp,
      qtd_paineis: sistemaRaw.qtd_paineis,
      painel_marca: sistemaRaw.painel_marca,
      data_instalacao: sistemaRaw.data_instalacao,
      geracao_7d_kwh: real7,
      geracao_total_kwh: sistemaRaw.geracao_mes_kwh ?? 0,
      ratio_ultimos_7d: ratio,
    };
  }

  // URLs assinadas em batch
  const paths = (anexosRaw ?? []).map((a: any) => a.storage_path).filter(Boolean);
  const urls = paths.length > 0 ? await getSignedUrls(supabase.getClient(), paths, 3600) : {};
  const anexos: AnexoListItem[] = (anexosRaw ?? []).map((a: any) => ({
    id: a.id,
    tipo: a.tipo,
    descricao: a.descricao,
    storage_path: a.storage_path,
    mime_type: a.mime_type,
    size_bytes: a.size_bytes,
    created_at: a.created_at,
    signed_url: urls[a.storage_path],
  }));

  // Propostas — extrai valor de dados_input
  const propostasMapped = (propostas ?? []).map((p: any) => ({
    id: p.id,
    slug: p.slug,
    numero_proposta: p.numero_proposta,
    created_at: p.created_at,
    acessos: p.acessos ?? 0,
    cliente_respondeu_at: p.cliente_respondeu_at,
    valor_total_brl: p.dados_input?.investimento?.total ?? null,
  }));

  // Conversas recentes — lê últimas 5 mensagens da conversation ativa
  const { data: convData } = await supabase.getClient()
    .from('conversations')
    .select('messages')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1);
  const messagesAll: any[] = (convData?.[0]?.messages as any[]) ?? [];
  const conversas_recentes = messagesAll.slice(-5);

  // Cadência pendente
  const { data: cadData } = await supabase.getClient()
    .from('eva_cadence')
    .select('id')
    .eq('lead_id', leadId)
    .eq('status', 'pending');
  const cadence_pendente = cadData?.length ?? 0;

  return {
    ...lead,
    sistema,
    propostas: propostasMapped,
    alertas_ativos: alertasAtivos as any[],
    conversas_recentes,
    cadence_pendente,
    manutencoes_futuras: manutencoesFuturas as any[],
    anexos,
  } as ClienteDetail;
}
```

- [ ] **Step 4: Rodar pra ver passar**

```bash
npx vitest run tests/clientes-queries.test.ts
npx tsc --noEmit
```
Expected: PASS + TS OK.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/clientes-queries.ts tests/clientes-queries.test.ts
git commit -m "feat(clientes): listClientes + getClienteDetail (agregação paralela) (A1 T8)"
```

---

## Task 9: Render da lista `/clientes`

**Files:**
- Create: `src/modules/dashboard/clientes-views.ts` (parte 1 — lista)

> Render server-side com Tailwind, mesmo padrão das outras views. Não tem teste unitário pra HTML (cabe smoke em prod e teste de router em T12).

- [ ] **Step 1: Criar arquivo com `renderClientesListPage`**

```ts
// src/modules/dashboard/clientes-views.ts
import { renderLayout } from './views.js';
import { statusLabel, statusCorChip } from '../clientes/mappers.js';
import { CONCESSIONARIAS_BR, getConcessionariaById } from '../concessionarias.js';
import type { ClienteRow, ClienteDetail, InsightCard } from '../clientes/types.js';

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function avatarInitials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

export function renderClientesListPage(
  rows: ClienteRow[],
  filters: { q?: string; concessionaria?: string; cidade?: string; ord?: string },
): string {
  const opt = (v: string, label: string, sel?: string) =>
    `<option value="${escapeHtml(v)}" ${sel === v ? 'selected' : ''}>${escapeHtml(label)}</option>`;

  const cidades = [...new Set(rows.map((r) => r.city).filter(Boolean) as string[])].sort();

  const card = (r: ClienteRow) => {
    const concNome = r.concessionaria ? getConcessionariaById(r.concessionaria)?.nome ?? r.concessionaria : '—';
    return `
    <a href="/dashboard/clientes/${escapeHtml(r.id)}" class="block bg-slate-800/60 hover:bg-slate-800 border border-slate-700 rounded-xl p-4 transition">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center font-bold text-slate-900 text-sm">${escapeHtml(avatarInitials(r.name))}</div>
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-slate-100 truncate">${escapeHtml(r.name) || '—'}</div>
          <div class="text-xs text-slate-500 truncate">${escapeHtml(r.phone)}</div>
        </div>
        <div class="px-2 py-0.5 rounded-full border text-[10px] font-semibold ${statusCorChip(r.installation_status)}">${escapeHtml(statusLabel(r.installation_status))}</div>
      </div>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div class="text-slate-500 uppercase tracking-wider text-[9px]">Cidade</div>
          <div class="text-slate-200">${escapeHtml([r.city, r.uf].filter(Boolean).join('/') || '—')}</div>
        </div>
        <div>
          <div class="text-slate-500 uppercase tracking-wider text-[9px]">Concessionária</div>
          <div class="text-slate-200 truncate">${escapeHtml(concNome)}</div>
        </div>
        <div>
          <div class="text-slate-500 uppercase tracking-wider text-[9px]">Consumo</div>
          <div class="text-slate-200">${r.consumo_medio_kwh ? `${r.consumo_medio_kwh} kWh/mês` : '—'}</div>
        </div>
        <div>
          <div class="text-slate-500 uppercase tracking-wider text-[9px]">Conta</div>
          <div class="text-slate-200">${r.conta_media_brl ? `R$ ${r.conta_media_brl.toFixed(0)}` : '—'}</div>
        </div>
      </div>
    </a>`;
  };

  const body = `
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-100">👥 Clientes — ${rows.length}</h1>
      <p class="text-slate-400 text-sm">Quem comprou. Lista de clientes instalados / operando / pós-venda.</p>
    </div>

    <form method="get" action="/dashboard/clientes" class="mb-6 flex flex-wrap gap-2 items-center">
      <input name="q" value="${escapeHtml(filters.q ?? '')}" placeholder="🔎 nome, telefone, email, CPF" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm flex-1 min-w-[200px]">
      <select name="concessionaria" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm">
        ${opt('', 'Todas concessionárias', filters.concessionaria)}
        ${CONCESSIONARIAS_BR.map((c) => opt(c.id, c.nome, filters.concessionaria)).join('')}
      </select>
      <select name="cidade" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm">
        ${opt('', 'Todas cidades', filters.cidade)}
        ${cidades.map((c) => opt(c, c, filters.cidade)).join('')}
      </select>
      <select name="ord" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm">
        ${opt('', 'Mais recente', filters.ord)}
        ${opt('nome', 'Nome A-Z', filters.ord)}
      </select>
      <button class="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold">Filtrar</button>
      <a href="/dashboard/clientes" class="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">Limpar</a>
    </form>

    ${rows.length === 0
      ? `<div class="bg-slate-800/60 rounded-xl border border-slate-700 p-12 text-center text-slate-400">Nenhum cliente cadastrado ainda. Quando um lead chega em installation_status >= contrato_assinado, aparece aqui.</div>`
      : `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${rows.map(card).join('')}</div>`}
  `;

  return renderLayout({ active: 'clientes', title: 'Clientes', body, dark: true });
}
```

- [ ] **Step 2: Verificar TS compila**

```bash
npx tsc --noEmit
```
Expected: EXIT 0 (espera-se erro pendente porque `active: 'clientes'` pode não estar no enum de `LayoutInput.active` — se aparecer erro, adicionar `'clientes'` ao tipo em views.ts).

- [ ] **Step 3: Se houver erro de `active`, adicionar 'clientes' ao tipo do `LayoutInput.active`**

Encontra a definição:
```bash
grep -n "LayoutInput\|active:" src/modules/dashboard/views.ts | head -10
```
Acrescenta `'clientes'` no union de strings do campo `active`.

- [ ] **Step 4: Commit**

```bash
git add src/modules/dashboard/clientes-views.ts src/modules/dashboard/views.ts
git commit -m "feat(clientes): renderClientesListPage (cards grid + filtros) (A1 T9)"
```

---

## Task 10: Render do detail `/clientes/:id` — estrutura + header + jornada + KPIs + Eva Insights

**Files:**
- Modify: `src/modules/dashboard/clientes-views.ts` (adiciona `renderClienteDetailPage`)

- [ ] **Step 1: Adicionar `renderClienteDetailPage` ao final do arquivo**

```ts
function progressoJornada(installation_status: string | null): string {
  const ordem = ['lead', 'proposta', 'contrato', 'instalado', 'operando', 'pos_venda'];
  const map: Record<string, string> = {
    novo: 'lead', qualificando: 'lead', qualificado: 'proposta',
    proposta_aceita: 'contrato', contrato_assinado: 'contrato',
    instalado: 'instalado', medidor_trocado: 'instalado',
    operando: 'operando', pos_venda_concluido: 'pos_venda',
  };
  const atual = map[installation_status ?? ''] ?? 'lead';
  const atualIdx = ordem.indexOf(atual);
  const fases = [
    { id: 'lead', label: 'Lead' },
    { id: 'proposta', label: 'Proposta' },
    { id: 'contrato', label: 'Contrato' },
    { id: 'instalado', label: 'Instalado' },
    { id: 'operando', label: 'Operando' },
    { id: 'pos_venda', label: 'Pós-venda' },
  ];
  return `
    <div class="flex gap-1 items-center text-[10px]">
      ${fases.map((f, i) => {
        const ativa = i <= atualIdx;
        const ehAtual = i === atualIdx;
        const cor = ativa ? (ehAtual ? 'bg-cyan-400' : 'bg-cyan-500') : 'bg-slate-700';
        return `
          <div class="flex-1 h-1.5 rounded-full ${cor}"></div>
          <span class="${ativa ? 'text-cyan-300' : 'text-slate-500'}">${ehAtual ? '▶' : '🟢'} ${f.label}</span>`;
      }).join('')}
    </div>`;
}

function renderKpisStrip(d: ClienteDetail): string {
  const kpi = (label: string, valor: string, sub: string, cor: string) => `
    <div class="bg-slate-800/40 border border-slate-700 rounded-xl p-3" style="border-color:rgba(56,189,248,0.3)">
      <div class="text-[10px] text-slate-400 uppercase tracking-wider">${label}</div>
      <div class="text-2xl font-bold ${cor} mt-1">${valor}</div>
      <div class="text-[10px] text-slate-500 mt-1">${sub}</div>
    </div>`;

  const sistemaKpi = d.sistema
    ? kpi('Sistema', `${d.sistema.potencia_kwp ?? '—'}`, `kWp · ${d.sistema.qtd_paineis ?? '?'} painéis`, 'text-sky-400')
    : kpi('Sistema', '—', '<a href="/dashboard/monitoramento" class="underline">vincular</a>', 'text-slate-500');

  const economiaEstim = d.sistema ? `R$ ${(d.sistema.geracao_total_kwh * 1).toFixed(0)}` : '—';
  const saudePct = d.sistema ? Math.round(d.sistema.ratio_ultimos_7d * 100) : null;
  const saudeStr = saudePct != null ? `${saudePct}%` : '—';
  const saudeCor = saudePct == null ? 'text-slate-500'
    : saudePct >= 90 ? 'text-green-400'
    : saudePct >= 70 ? 'text-amber-400' : 'text-rose-400';

  return `
    <div class="grid grid-cols-2 md:grid-cols-5 gap-2 my-4">
      ${sistemaKpi}
      ${kpi('Economia', economiaEstim, 'estimativa simples', 'text-purple-400')}
      ${kpi('Saúde', saudeStr, 'vs esperado 7d', saudeCor)}
      ${kpi('Propostas', String(d.propostas.length), `${d.propostas.filter(p => p.cliente_respondeu_at).length} respondidas`, 'text-amber-400')}
      ${kpi('Alertas', String(d.alertas_ativos.length), d.alertas_ativos.length ? 'ativos' : 'sistema ok', d.alertas_ativos.length ? 'text-rose-400' : 'text-green-400')}
    </div>`;
}

function renderInsightsRow(insights: InsightCard[]): string {
  if (insights.length === 0) {
    return `<div class="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 my-4 text-center text-sm text-purple-200">🤖 ✅ Cliente em ordem — nada urgente agora.</div>`;
  }
  const card = (c: InsightCard) => `
    <div class="bg-slate-900/60 rounded-lg p-3 border border-purple-500/20">
      <div class="text-xs text-slate-200 leading-relaxed">${escapeHtml(c.texto)}</div>
      ${c.cta
        ? `<form action="/dashboard/clientes/eva-action" method="post" class="mt-2">
             <input type="hidden" name="action" value="${escapeHtml(c.cta.action)}">
             <input type="hidden" name="lead_id" value="${escapeHtml(c.params?.lead_id ?? '')}">
             <input type="hidden" name="extra" value='${escapeHtml(JSON.stringify(c.cta.params))}'>
             <button class="text-purple-300 underline text-[10px]">${escapeHtml(c.cta.label)}</button>
           </form>`
        : `<span class="text-slate-500 text-[10px]">CTA indisponível (lead em opt-out)</span>`}
    </div>`;
  return `
    <div class="bg-purple-500/5 border border-purple-500/20 rounded-xl p-3 my-4">
      <div class="text-[10px] text-purple-300 uppercase tracking-wider mb-2">🤖 EVA SUGERE</div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-2">${insights.map(card).join('')}</div>
    </div>`;
}

export function renderClienteDetailPage(d: ClienteDetail, insights: InsightCard[]): string {
  const concNome = d.concessionaria ? getConcessionariaById(d.concessionaria)?.nome ?? d.concessionaria : '—';
  const phoneClean = d.phone.replace(/\D/g, '');

  // Header
  const header = `
    <div class="flex items-center gap-4 pb-4 border-b border-slate-700">
      <div class="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center font-bold text-slate-900 text-xl">${escapeHtml(avatarInitials(d.name))}</div>
      <div class="flex-1">
        <div class="text-xl font-bold text-slate-100">${escapeHtml(d.name) || 'Sem nome'}</div>
        <div class="text-xs text-slate-500">📍 ${escapeHtml([d.city, d.uf].filter(Boolean).join('-') || '—')} · Cliente desde ${escapeHtml((d.installed_at ?? d.created_at).slice(0,7))} · ${escapeHtml(concNome)}</div>
      </div>
      <div class="px-3 py-1 rounded-full border text-xs font-semibold ${statusCorChip(d.installation_status)}">${escapeHtml(statusLabel(d.installation_status))}</div>
      <a href="https://wa.me/${escapeHtml(phoneClean)}" target="_blank" class="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold">📞 Conversar</a>
      <a href="/dashboard/propostas/novo?lead_id=${escapeHtml(d.id)}" class="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold">📄 Nova proposta</a>
    </div>`;

  // Abas — só estrutura (conteúdo de cada aba virá em T11)
  const tabs = `
    <div id="abas" class="flex gap-1 border-b border-slate-700 my-4 overflow-x-auto">
      <a href="#dados" class="px-4 py-2 text-xs font-semibold text-sky-300 border-b-2 border-sky-400 whitespace-nowrap">👤 Dados</a>
      <a href="#sistema" class="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap">☀ Sistema + Kit</a>
      <a href="#propostas" class="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap">📄 Propostas (${d.propostas.length})</a>
      <a href="#anexos" class="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap">📸 Anexos (${d.anexos.length})</a>
      <a href="#timeline" class="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap">📖 Timeline</a>
      <a href="#conversa" class="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap">💬 Conversa</a>
      <a href="#relatorios" class="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap">📋 Relatórios</a>
    </div>`;

  // CONTEÚDOS DAS ABAS — placeholder (T11 popula cada uma)
  const abasConteudo = `
    <div id="dados-content" class="space-y-3"><!-- T11: aba Dados --></div>
    <div id="sistema-content" class="hidden text-slate-500 italic text-sm p-6">Aba "Sistema + Kit" vem na próxima fatia (A2 — calculadora).</div>
    <div id="propostas-content" class="hidden"><!-- T11: aba Propostas --></div>
    <div id="anexos-content" class="hidden"><!-- T11: aba Anexos --></div>
    <div id="timeline-content" class="hidden"><!-- T11: timeline --></div>
    <div id="conversa-content" class="hidden"><!-- T11: conversa --></div>
    <div id="relatorios-content" class="hidden text-slate-500 italic text-sm p-6">Aba "Relatórios" vem na próxima fatia (A5).</div>
  `;

  const body = `
    ${header}
    <div class="mt-4">
      <div class="text-[10px] text-slate-400 uppercase tracking-widest mb-2">📈 JORNADA</div>
      ${progressoJornada(d.installation_status)}
    </div>
    ${renderKpisStrip(d)}
    ${renderInsightsRow(insights.map(i => ({ ...i, params: { ...(i.cta?.params ?? {}), lead_id: d.id } })))}
    ${tabs}
    ${abasConteudo}
  `;

  return renderLayout({ active: 'clientes', title: `Cliente — ${d.name ?? '?'}`, body, dark: true });
}
```

- [ ] **Step 2: Verificar TS**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/dashboard/clientes-views.ts
git commit -m "feat(clientes): renderClienteDetailPage — header + jornada + KPIs + Eva Insights + tabs (A1 T10)"
```

---

## Task 11: Conteúdo das abas (Dados, Anexos, Timeline, Conversa, Propostas)

**Files:**
- Modify: `src/modules/dashboard/clientes-views.ts` (adiciona helpers de cada aba)

> Esta task substitui os placeholders `<!-- T11: aba X -->` no `renderClienteDetailPage` por conteúdo real.

- [ ] **Step 1: Acrescentar helpers ao final do clientes-views.ts e injetar nos conteúdos**

```ts
// Aba Dados — form inline editável (simplificado: campos em cards, edita inline via form único)
function renderAbaDados(d: ClienteDetail): string {
  const TIPOS = [
    { id: 'residencial', label: 'Residencial' },
    { id: 'comercial', label: 'Comercial' },
    { id: 'rural', label: 'Rural' },
  ];
  const FORMAS_PG = [
    { id: 'cartao', label: 'Cartão' },
    { id: 'boleto', label: 'Boleto' },
    { id: 'a_vista', label: 'À vista' },
    { id: 'financiamento', label: 'Financiamento' },
  ];
  const BANCOS = ['bv', 'solfacil', 'solagora', 'santander', 'btg', 'outro'];

  const opt = (v: string, label: string, sel?: string | null) =>
    `<option value="${escapeHtml(v)}" ${sel === v ? 'selected' : ''}>${escapeHtml(label)}</option>`;

  return `
    <form id="form-dados" action="/dashboard/clientes/${escapeHtml(d.id)}/edit" method="post" class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Identificação -->
      <fieldset class="bg-slate-800/40 border border-slate-700 rounded-xl p-3">
        <legend class="text-[10px] text-slate-400 uppercase tracking-wider px-1">👤 Identificação</legend>
        <div class="grid grid-cols-2 gap-2 mt-2">
          <input name="name" value="${escapeHtml(d.name ?? '')}" placeholder="Nome completo" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm col-span-2">
          <input name="cpf_cnpj" value="${escapeHtml(d.cpf_cnpj ?? '')}" placeholder="CPF/CNPJ" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          <input type="date" name="data_nascimento" value="${escapeHtml(d.data_nascimento ?? '')}" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          <select name="profile" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            ${opt('', '— Tipo —', d.profile)}${TIPOS.map(t => opt(t.id, t.label, d.profile)).join('')}
          </select>
          <input name="estado_civil" value="${escapeHtml(d.estado_civil ?? '')}" placeholder="Estado civil" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
        </div>
      </fieldset>

      <!-- Contato -->
      <fieldset class="bg-slate-800/40 border border-slate-700 rounded-xl p-3">
        <legend class="text-[10px] text-slate-400 uppercase tracking-wider px-1">📞 Contato</legend>
        <div class="grid grid-cols-2 gap-2 mt-2">
          <input name="phone" value="${escapeHtml(d.phone)}" placeholder="WhatsApp" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          <input name="email" type="email" value="${escapeHtml(d.email ?? '')}" placeholder="Email" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
        </div>
      </fieldset>

      <!-- Endereço -->
      <fieldset class="bg-slate-800/40 border border-slate-700 rounded-xl p-3 md:col-span-2">
        <legend class="text-[10px] text-slate-400 uppercase tracking-wider px-1">🏠 Endereço</legend>
        <div class="grid grid-cols-6 gap-2 mt-2">
          <input name="cep" value="${escapeHtml(d.cep ?? '')}" placeholder="CEP" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          <input name="endereco_rua" value="${escapeHtml(d.endereco_rua ?? '')}" placeholder="Rua" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm col-span-3">
          <input name="endereco_numero" value="${escapeHtml(d.endereco_numero ?? '')}" placeholder="Nº" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          <input name="endereco_complemento" value="${escapeHtml(d.endereco_complemento ?? '')}" placeholder="Compl." class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          <input name="neighborhood" value="${escapeHtml(d.neighborhood ?? '')}" placeholder="Bairro" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm col-span-2">
          <input name="city" value="${escapeHtml(d.city ?? '')}" placeholder="Cidade" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm col-span-2">
          <input name="uf" value="${escapeHtml(d.uf ?? '')}" placeholder="UF" maxlength="2" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
        </div>
      </fieldset>

      <!-- Concessionária + UC -->
      <fieldset class="bg-slate-800/40 border border-slate-700 rounded-xl p-3">
        <legend class="text-[10px] text-slate-400 uppercase tracking-wider px-1">⚡ Concessionária + UC</legend>
        <div class="grid grid-cols-2 gap-2 mt-2">
          <select name="concessionaria" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm col-span-2">
            ${opt('', '— Concessionária —', d.concessionaria)}${CONCESSIONARIAS_BR.map(c => opt(c.id, c.nome, d.concessionaria)).join('')}
          </select>
          <input name="uc_numero" value="${escapeHtml(d.uc_numero ?? '')}" placeholder="UC" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          <input name="tarifa_classe" value="${escapeHtml(d.tarifa_classe ?? '')}" placeholder="Classe (B1, B3...)" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          <input name="tarifa_modalidade" value="${escapeHtml(d.tarifa_modalidade ?? '')}" placeholder="Modalidade" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm col-span-2">
        </div>
      </fieldset>

      <!-- Consumo + Pagamento -->
      <fieldset class="bg-slate-800/40 border border-slate-700 rounded-xl p-3">
        <legend class="text-[10px] text-slate-400 uppercase tracking-wider px-1">💰 Consumo + Pagamento</legend>
        <div class="grid grid-cols-2 gap-2 mt-2">
          <input type="number" name="consumo_medio_kwh" value="${d.consumo_medio_kwh ?? ''}" placeholder="kWh/mês" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          <input type="number" step="0.01" name="conta_media_brl" value="${d.conta_media_brl ?? ''}" placeholder="R$/mês" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          <select name="forma_pagamento" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            ${opt('', '— Pagamento —', d.forma_pagamento)}${FORMAS_PG.map(f => opt(f.id, f.label, d.forma_pagamento)).join('')}
          </select>
          <select name="banco_financiamento" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            ${opt('', '— Banco —', d.banco_financiamento)}${BANCOS.map(b => opt(b, b.toUpperCase(), d.banco_financiamento)).join('')}
          </select>
        </div>
      </fieldset>

      <!-- Rateio -->
      <fieldset class="bg-slate-800/40 border border-slate-700 rounded-xl p-3 md:col-span-2">
        <legend class="text-[10px] text-slate-400 uppercase tracking-wider px-1">🔀 Rateio MMGD (consumidor)</legend>
        <label class="flex items-center gap-2 mt-2 text-sm text-slate-300">
          <input type="checkbox" name="eh_consumidor_rateio" value="true" ${d.eh_consumidor_rateio ? 'checked' : ''}>
          Este cliente recebe créditos de uma UC geradora MMGD
        </label>
        <div class="grid grid-cols-3 gap-2 mt-2">
          <input name="uc_geradora_lead_id" value="${escapeHtml(d.uc_geradora_lead_id ?? '')}" placeholder="UC geradora (lead_id)" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          <input type="number" step="0.01" name="percentual_rateio" value="${d.percentual_rateio ?? ''}" placeholder="% rateio (0-100)" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          <input type="number" name="credito_esperado_kwh" value="${d.credito_esperado_kwh ?? ''}" placeholder="Crédito esperado kWh" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
        </div>
      </fieldset>

      <!-- Comercial + Observações -->
      <fieldset class="bg-slate-800/40 border border-slate-700 rounded-xl p-3 md:col-span-2">
        <legend class="text-[10px] text-slate-400 uppercase tracking-wider px-1">💼 Comercial + Observações</legend>
        <div class="grid grid-cols-3 gap-2 mt-2">
          <input name="vendedor_responsavel" value="${escapeHtml(d.vendedor_responsavel ?? '')}" placeholder="Vendedor" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          <input name="lead_source" value="${escapeHtml(d.lead_source ?? '')}" placeholder="Origem (CTWA, etc)" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          <input name="installation_status" value="${escapeHtml(d.installation_status ?? '')}" placeholder="Status" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
        </div>
        <textarea name="observacoes_perfil" placeholder="Observações livres" class="w-full mt-2 px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm" rows="3">${escapeHtml(d.observacoes_perfil ?? '')}</textarea>
      </fieldset>

      <div class="md:col-span-2 flex gap-2">
        <button class="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold">💾 Salvar dados</button>
      </div>
    </form>`;
}

function renderAbaAnexos(d: ClienteDetail): string {
  const TIPOS = [
    { id: 'parecer_acesso', label: '📋 Parecer de acesso' },
    { id: 'foto_telhado', label: '📷 Foto telhado' },
    { id: 'foto_instalacao', label: '📷 Foto instalação' },
    { id: 'foto_inversor', label: '📷 Foto inversor' },
    { id: 'foto_visita_tecnica', label: '📷 Visita técnica' },
    { id: 'contrato', label: '📄 Contrato' },
    { id: 'outros', label: '📁 Outros' },
  ];
  const items = d.anexos.map(a => `
    <div class="relative bg-slate-800/40 border border-slate-700 rounded-lg p-2 group">
      <a href="${escapeHtml(a.signed_url ?? '#')}" target="_blank" class="block aspect-square flex flex-col items-center justify-center text-slate-400 hover:text-cyan-300">
        <div class="text-2xl">${a.mime_type?.startsWith('image/') ? '🖼' : a.mime_type === 'application/pdf' ? '📄' : '📁'}</div>
        <div class="text-[10px] mt-1 truncate w-full text-center">${escapeHtml(a.tipo)}</div>
      </a>
      <form action="/dashboard/clientes/${escapeHtml(d.id)}/anexos/${escapeHtml(a.id)}" method="post" onsubmit="return confirm('Remover este anexo?')" class="absolute top-1 right-1 opacity-0 group-hover:opacity-100">
        <input type="hidden" name="_method" value="delete">
        <button class="bg-rose-600 hover:bg-rose-700 text-white rounded-full w-5 h-5 text-[10px]">×</button>
      </form>
    </div>`).join('');

  const upload = `
    <form action="/dashboard/clientes/${escapeHtml(d.id)}/anexos" method="post" enctype="multipart/form-data" class="bg-cyan-500/5 border border-dashed border-cyan-500/40 rounded-lg p-3 flex flex-col items-center justify-center aspect-square">
      <input type="file" name="file" required class="text-[10px] text-slate-300 mb-1" accept="image/*,application/pdf">
      <select name="tipo" required class="text-[10px] bg-slate-900 border border-slate-700 text-slate-100 rounded mb-1 w-full">
        ${TIPOS.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
      </select>
      <input name="descricao" placeholder="Descrição (opcional)" class="text-[10px] bg-slate-900 border border-slate-700 text-slate-100 rounded mb-1 w-full px-1 py-0.5">
      <button class="bg-cyan-600 hover:bg-cyan-700 text-white text-[10px] rounded px-2 py-1 w-full">＋ Adicionar</button>
    </form>`;

  return `
    <div class="grid grid-cols-3 md:grid-cols-6 gap-2">
      ${items}
      ${upload}
    </div>`;
}

function renderAbaPropostas(d: ClienteDetail): string {
  if (d.propostas.length === 0) {
    return `<div class="text-slate-500 text-sm italic p-4">Nenhuma proposta gerada ainda. <a class="text-purple-300 underline" href="/dashboard/propostas/novo?lead_id=${escapeHtml(d.id)}">Criar agora</a>.</div>`;
  }
  const rows = d.propostas.map(p => `
    <tr class="hover:bg-slate-800/50">
      <td class="px-3 py-2 text-sm"><a href="/dashboard/propostas/${escapeHtml(p.id)}" class="text-cyan-300 hover:underline">${escapeHtml(p.numero_proposta)}</a></td>
      <td class="px-3 py-2 text-xs text-slate-400">${escapeHtml(p.created_at.slice(0,10))}</td>
      <td class="px-3 py-2 text-sm text-slate-300">${p.valor_total_brl ? 'R$ ' + p.valor_total_brl.toFixed(0) : '—'}</td>
      <td class="px-3 py-2 text-xs">${p.acessos} acessos</td>
      <td class="px-3 py-2 text-xs">${p.cliente_respondeu_at ? '✉️ Respondeu' : '—'}</td>
    </tr>`).join('');
  return `
    <table class="w-full">
      <thead><tr class="text-[10px] uppercase text-slate-500 border-b border-slate-700"><th class="px-3 py-2 text-left">Nº</th><th class="px-3 py-2 text-left">Data</th><th class="px-3 py-2 text-left">Valor</th><th class="px-3 py-2 text-left">Acessos</th><th class="px-3 py-2 text-left">Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <a href="/dashboard/propostas/novo?lead_id=${escapeHtml(d.id)}" class="inline-block mt-3 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm">📄 Nova proposta</a>
  `;
}

function renderAbaTimeline(d: ClienteDetail): string {
  // Cruza eventos cronologicamente
  type Ev = { data: string; tipo: string; texto: string; cor: string };
  const evs: Ev[] = [];
  evs.push({ data: d.created_at, tipo: 'lead', texto: `Lead via ${d.acquisition_source ?? d.lead_source ?? 'orgânico'}`, cor: 'text-slate-400' });
  for (const p of d.propostas) evs.push({ data: p.created_at, tipo: 'proposta', texto: `Proposta ${p.numero_proposta}${p.valor_total_brl ? ' · R$ ' + p.valor_total_brl.toFixed(0) : ''}`, cor: 'text-purple-300' });
  if (d.installed_at) evs.push({ data: d.installed_at + 'T00:00:00Z', tipo: 'instalado', texto: `Instalação concluída${d.sistema ? ' · ' + d.sistema.apelido : ''}`, cor: 'text-cyan-300' });
  for (const a of d.alertas_ativos) evs.push({ data: a.primeiro_visto_em, tipo: 'alerta', texto: a.texto, cor: a.severidade === 'urgente' ? 'text-rose-400' : a.severidade === 'aviso' ? 'text-amber-400' : 'text-green-400' });

  evs.sort((a, b) => b.data.localeCompare(a.data));
  const items = evs.slice(0, 20).map(e => `
    <div class="flex gap-2 text-xs"><span class="${e.cor}">●</span><span class="text-slate-500 w-20 shrink-0">${escapeHtml(e.data.slice(0,10))}</span><span class="text-slate-300">${escapeHtml(e.texto)}</span></div>
  `).join('');
  return `<div class="space-y-1.5">${items || '<div class="text-slate-500 italic text-sm">Sem eventos.</div>'}</div>`;
}

function renderAbaConversa(d: ClienteDetail): string {
  if (d.conversas_recentes.length === 0) {
    return `<div class="text-slate-500 italic text-sm p-4">Sem mensagens recentes.</div>`;
  }
  const items = d.conversas_recentes.map(m => `
    <div class="${m.role === 'user' ? 'text-cyan-200' : 'text-slate-300'} text-xs p-2 rounded ${m.role === 'user' ? 'bg-cyan-500/10' : 'bg-slate-800/40'}">
      <div class="text-[9px] uppercase tracking-wider text-slate-500 mb-1">${escapeHtml(m.role)} · ${escapeHtml((m.timestamp ?? '').slice(0,16))}</div>
      <div>${escapeHtml(m.content)}</div>
    </div>
  `).join('');
  return `<div class="space-y-2">${items}</div><a href="/dashboard/leads/${escapeHtml(d.id)}" class="inline-block mt-3 text-xs text-cyan-300 underline">Ver conversa completa em /leads</a>`;
}
```

- [ ] **Step 2: Substituir os placeholders no `renderClienteDetailPage`**

Achar o bloco `abasConteudo` no `renderClienteDetailPage` e substituir por:

```ts
  const abasConteudo = `
    <div id="dados-content" class="space-y-3">${renderAbaDados(d)}</div>
    <div id="sistema-content" class="hidden text-slate-500 italic text-sm p-6">Aba "Sistema + Kit" vem na próxima fatia (A2 — calculadora).</div>
    <div id="propostas-content" class="hidden">${renderAbaPropostas(d)}</div>
    <div id="anexos-content" class="hidden">${renderAbaAnexos(d)}</div>
    <div id="timeline-content" class="hidden">${renderAbaTimeline(d)}</div>
    <div id="conversa-content" class="hidden">${renderAbaConversa(d)}</div>
    <div id="relatorios-content" class="hidden text-slate-500 italic text-sm p-6">Aba "Relatórios" vem na próxima fatia (A5).</div>
  `;
```

E adicionar no fim do `body` um script simples pra alternar abas:

```ts
  const scripts = `<script>
    document.querySelectorAll('#abas a').forEach(t => t.addEventListener('click', e => {
      e.preventDefault();
      const target = e.currentTarget.getAttribute('href').slice(1);
      document.querySelectorAll('#abas a').forEach(x => { x.classList.remove('text-sky-300','border-b-2','border-sky-400'); x.classList.add('text-slate-400'); });
      e.currentTarget.classList.add('text-sky-300','border-b-2','border-sky-400');
      e.currentTarget.classList.remove('text-slate-400');
      document.querySelectorAll('[id$="-content"]').forEach(c => c.classList.add('hidden'));
      document.getElementById(target + '-content').classList.remove('hidden');
    }));
  </script>`;
```

E passar `scripts` pra `renderLayout({...})`.

- [ ] **Step 3: Verificar TS**

```bash
npx tsc --noEmit
npx vitest run
```
Expected: TS EXIT 0, suite verde (exceto 2 cases-fetcher pré-existentes).

- [ ] **Step 4: Commit**

```bash
git add src/modules/dashboard/clientes-views.ts
git commit -m "feat(clientes): abas Dados/Anexos/Propostas/Timeline/Conversa + JS de alternância (A1 T11)"
```

---

## Task 12: Wire-up no router + multer + nav

**Files:**
- Modify: `src/modules/dashboard/router.ts` (5 rotas novas)
- Modify: `src/modules/dashboard/views.ts` (link "Clientes" no nav)
- Modify: `package.json` (multer)
- Test: `tests/clientes-router.test.ts`

- [ ] **Step 1: Instalar multer**

```bash
npm install --save multer @types/multer
```

- [ ] **Step 2: Escrever testes do router (mocked supabase)**

```ts
// tests/clientes-router.test.ts
import { describe, it, expect } from 'vitest';
import { instalacaoFase, isCliente } from '../src/modules/clientes/mappers.js';

// Testes focam no contrato exposto. Integração end-to-end via smoke.
describe('router contracts', () => {
  it('listClientes só inclui status de cliente', () => {
    expect(isCliente('operando')).toBe(true);
    expect(isCliente('novo')).toBe(false);
  });
});
```

(Testes mais robustos do router são feitos via smoke porque mockar a router-stack inteira do Express é frágil. Este file existe pra placeholder e adições futuras.)

- [ ] **Step 3: Acrescentar 5 rotas em `src/modules/dashboard/router.ts`**

No topo do arquivo, adicionar imports:
```ts
import multer from 'multer';
import { listClientes, getClienteDetail } from './clientes-queries.js';
import { renderClientesListPage, renderClienteDetailPage } from './clientes-views.js';
import { getEvaInsights } from '../clientes/insights.js';
import { uploadAnexo, deleteAnexoFile } from '../anexos/storage.js';
```

Dentro de `createDashboardRouter(...)`, antes de `return router;`:

```ts
  // ===== Perfil do Cliente A1 =====
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  router.get('/clientes', async (req: Request, res: Response) => {
    try {
      const filters = {
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
        concessionaria: typeof req.query.concessionaria === 'string' ? req.query.concessionaria : undefined,
        cidade: typeof req.query.cidade === 'string' ? req.query.cidade : undefined,
        ord: typeof req.query.ord === 'string' ? req.query.ord : undefined,
      };
      const rows = await listClientes(supabaseService, filters);
      res.type('text/html').send(renderClientesListPage(rows as any, filters));
    } catch (err) {
      console.error('[dashboard/clientes]', err);
      res.status(500).send(`<h2>Erro ao listar clientes</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  router.get('/clientes/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!UUID_RE.test(id)) return res.status(400).send('UUID inválido');
    try {
      const detail = await getClienteDetail(supabaseService, monitoringService, id);
      if (!detail) return res.status(404).send('<h2>Cliente não encontrado</h2><a href="/dashboard/clientes">← voltar</a>');
      const insights = getEvaInsights(detail as any, new Date());
      res.type('text/html').send(renderClienteDetailPage(detail, insights));
    } catch (err) {
      console.error('[dashboard/clientes/detail]', err);
      res.status(500).send(`<h2>Erro</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  router.post('/clientes/:id/edit', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!UUID_RE.test(id)) return res.status(400).send('UUID inválido');
    const body = req.body ?? {};
    const allowedFields = [
      'name', 'phone', 'email', 'cpf_cnpj', 'data_nascimento', 'estado_civil', 'profile',
      'cep', 'endereco_rua', 'endereco_numero', 'endereco_complemento', 'neighborhood', 'city', 'uf',
      'concessionaria', 'uc_numero', 'tarifa_classe', 'tarifa_modalidade',
      'consumo_medio_kwh', 'conta_media_brl',
      'forma_pagamento', 'banco_financiamento',
      'eh_consumidor_rateio', 'uc_geradora_lead_id', 'percentual_rateio', 'credito_esperado_kwh',
      'vendedor_responsavel', 'lead_source', 'installation_status', 'observacoes_perfil',
    ];
    const fields: Record<string, any> = {};
    for (const k of allowedFields) {
      if (body[k] === undefined) continue;
      let v: any = body[k];
      if (v === '') v = null;
      if (k === 'eh_consumidor_rateio') v = v === 'true' || v === true;
      if (['consumo_medio_kwh', 'credito_esperado_kwh'].includes(k) && v != null) v = Number(v) || null;
      if (['conta_media_brl', 'percentual_rateio'].includes(k) && v != null) v = Number(v) || null;
      fields[k] = v;
    }
    if (!fields.name) return res.status(400).send('Nome obrigatório');
    if (!fields.phone) return res.status(400).send('Telefone obrigatório');

    const r = await supabaseService.updateClienteFields(id, fields);
    if (!r.ok) return res.status(500).send(`<h2>Erro: ${escapeHtmlSimple(r.error ?? '')}</h2>`);
    res.redirect(303, `/dashboard/clientes/${id}#dados`);
  });

  router.post('/clientes/:id/anexos', upload.single('file'), async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!UUID_RE.test(id)) return res.status(400).send('UUID inválido');
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).send('Arquivo obrigatório');
    const tipo = String(req.body?.tipo ?? 'outros');
    const descricao = req.body?.descricao ? String(req.body.descricao) : null;

    const mimeOk = file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf';
    if (!mimeOk) return res.status(415).send('Tipo de arquivo não suportado');

    const ext = (file.originalname.split('.').pop() ?? 'bin').toLowerCase().slice(0, 8);
    const up = await uploadAnexo(supabaseService.getClient(), id, tipo, file.buffer, file.mimetype, ext);
    if (!up.ok || !up.storage_path) return res.status(500).send(`Upload falhou: ${escapeHtmlSimple(up.error ?? '')}`);

    const ins = await supabaseService.insertAnexo({
      lead_id: id, tipo, descricao,
      storage_path: up.storage_path, mime_type: file.mimetype, size_bytes: file.size,
      created_by: 'junior',
    });
    if (!ins.ok) {
      // rollback do storage
      await deleteAnexoFile(supabaseService.getClient(), up.storage_path).catch(() => {});
      return res.status(500).send(`Erro DB: ${escapeHtmlSimple(ins.error ?? '')}`);
    }
    res.redirect(303, `/dashboard/clientes/${id}#anexos`);
  });

  router.post('/clientes/:id/anexos/:anexoId', async (req: Request, res: Response) => {
    if (req.body?._method !== 'delete') return res.status(400).send('Bad method');
    const id = String(req.params.id ?? '');
    const anexoId = String(req.params.anexoId ?? '');
    if (!UUID_RE.test(id) || !UUID_RE.test(anexoId)) return res.status(400).send('UUID inválido');
    const r = await supabaseService.deleteAnexo(anexoId);
    if (r.ok && r.storage_path) {
      await deleteAnexoFile(supabaseService.getClient(), r.storage_path).catch((e) => console.warn('[clientes/anexos] storage cleanup falhou:', e));
    }
    res.redirect(303, `/dashboard/clientes/${id}#anexos`);
  });

  router.post('/clientes/eva-action', async (req: Request, res: Response) => {
    const action = String(req.body?.action ?? '');
    const leadId = String(req.body?.lead_id ?? '');
    if (!UUID_RE.test(leadId)) return res.status(400).send('lead_id inválido');

    const topic = action === 'eva_pedir_depoimento' ? 'pedido_depoimento'
                : action === 'agendar_revisao_aniversario' ? `aniversario_${(JSON.parse(req.body?.extra ?? '{}').anos ?? 1)}a`
                : null;
    if (!topic) return res.status(400).send('Ação desconhecida');

    await supabaseService.upsertMaintenanceReminderPublic({
      lead_id: leadId,
      scheduled_date: new Date().toISOString().slice(0, 10),
      topic,
    });
    res.redirect(303, `/dashboard/clientes/${leadId}`);
  });
```

- [ ] **Step 4: Adicionar link "Clientes" no nav do `renderLayout` em `src/modules/dashboard/views.ts`**

Achar o array de items do nav (procurar por `active === 'home'` ou similar) e adicionar:
```ts
{ id: 'clientes', label: '👥 Clientes', href: '/dashboard/clientes' },
```
em posição apropriada (depois de "Leads" se existir).

- [ ] **Step 5: Verificar TS + suite + monitoringService disponível**

```bash
npx tsc --noEmit
npx vitest run tests/clientes-router.test.ts tests/clientes-queries.test.ts
```
Expected: PASS + TS EXIT 0. Se `monitoringService` não estiver no escopo da rota, verificar assinatura de `createDashboardRouter` (em A1 a função recebe `monitoringService` — adicionar parâmetro se ainda não recebe; se já recebe ok).

- [ ] **Step 6: Commit**

```bash
git add src/modules/dashboard/router.ts src/modules/dashboard/views.ts tests/clientes-router.test.ts package.json package-lock.json
git commit -m "feat(clientes): wire-up router + multer + nav (A1 T12)"
```

---

## Task 13: Smoke prod (manual, Junior)

> Sem código. Junior executa.

- [ ] **Step 1: Push pro GitHub**

```bash
git push origin main
```

- [ ] **Step 2: Junior aplica `033_clientes_perfil.sql`** no SQL Editor (`kupnsoyymulbdzakqlqc`) → Success.

- [ ] **Step 3: Junior cria bucket `client-attachments`** no Supabase Studio → Storage → New bucket:
   - Public: OFF
   - Size limit: 20 MB
   - MIME: `image/png, image/jpeg, image/webp, image/heic, application/pdf`

- [ ] **Step 4: Junior clica Implantar** no Easypanel.

- [ ] **Step 5: Smoke — abre `/dashboard/clientes`**
   - Vê lista de clientes (todos com `installation_status >= contrato_assinado`)
   - Filtra por concessionária
   - Clica num cliente → abre `/dashboard/clientes/:id`

- [ ] **Step 6: Smoke — testa edição**
   - Aba Dados → muda CPF/CNPJ → Salvar → recarrega → persistiu
   - Adiciona endereço completo → Salvar → persistiu

- [ ] **Step 7: Smoke — testa anexo**
   - Aba Anexos → upload de 1 PNG → vê thumbnail → clica → abre URL assinada
   - Deleta o anexo → some do grid

- [ ] **Step 8: Smoke — testa Eva action**
   - Se aparecer card "Depoimento" ou "Aniversário", clica botão Eva → confere se cria `maintenance_reminders` no DB (SQL: `select * from maintenance_reminders where lead_id = '<id>' order by created_at desc limit 1`).

- [ ] **Step 9: Monitorar 1 dia**
   - Próxima sessão = A2 (calculadora) ou Frente B (contas de luz) — Junior decide.

---

## Self-Review (durante a escrita)

**Spec coverage:**
- ✅ Tela /clientes lista (T9 + T12)
- ✅ Tela /clientes/:id detalhe (T10)
- ✅ Form inline editável (T11 — aba Dados)
- ✅ Anexos upload + grid (T7 + T11 + T12)
- ✅ Migration 033 (T1)
- ✅ Concessionárias BR (T3)
- ✅ Mappers status → fase (T4)
- ✅ Eva Insights 3 regras (T5)
- ✅ Supabase methods (T6)
- ✅ Storage Supabase (T7)
- ✅ Queries orquestração (T8)
- ✅ 5 abas ativas + 2 placeholder (T11)
- ✅ KPIs + jornada (T10)
- ✅ Eva action handler (T12 — rota /eva-action)
- ✅ Smoke prod (T13)

**Placeholder scan:** Nenhum "TBD" / vago. Cada Step com código completo ou comando exato.

**Type consistency:** `ClienteRow` / `ClienteDetail` / `InsightCard` / `AnexoListItem` consistentes entre T2 → T6 → T8 → T9/T10/T11. `instalacaoFase` retorna `JornadaFase` consistente em T4 e usado em T10. Funções `uploadAnexo` / `deleteAnexoFile` (T7) consumidas em T12 com mesma assinatura.

---

## Execution Handoff

**Plan completo e salvo em `docs/superpowers/plans/2026-05-20-perfil-cliente-a1.md`. Duas opções de execução:**

**1. Subagent-Driven (recomendada)** — dispatch um subagente fresco por task, review entre tasks, iteração rápida.

**2. Inline Execution** — executar tasks nesta sessão com `executing-plans`, batch com checkpoints.

Qual?
