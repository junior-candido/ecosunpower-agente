# EcoSof Parametrização por Empresa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo dado "da EcoSunPower" chumbado no código (CNPJ, endereço, RT, nome da atendente, critério de lead, marcas, kits/preços, logo, região) passa a vir da tabela `empresa_config`/`empresa_kits` do banco — a instância da EcoSun vira "cliente nº 0" com seed dos dados reais e comportamento IDÊNTICO.

**Architecture:** Migration 049 cria as 2 tabelas com seed EcoSun. Módulo novo `empresa-config.ts` carrega no boot (cache em memória, getter síncrono, fallback = defaults EcoSun hardcoded — banco sem a tabela continua funcionando). O system-prompt ganha placeholders `{{...}}` resolvidos pelo mecanismo que JÁ existe no brain (`replaceAll('{{review_link}}')`). Templates jurídicos/proposta/relatórios/mensagens leem do getter. Kits saem do array hardcoded pro banco. **Critério de paridade: com o seed aplicado, NENHUM output muda** (mesmo contrato, mesma proposta, mesmo prompt).

**Tech Stack:** TypeScript + Express, Supabase, Zod (validação do config), Vitest.

**Referências obrigatórias:** `docs/ecosof/01-inventario-clone.md` (seções B e C = a lista de troca, com arquivo:linha), `src/config.ts` (camada env existente — NÃO mexer no que é infra), `src/modules/brain.ts:61-76` (carregamento do prompt + replaceAll).

**Regras do projeto:** branch `feat/ecosof-kit-clone` (já ativa); commits PT-BR; `git add` por caminho; NUNCA push sem autorização; suite `npx vitest run` (2 falhas pré-existentes `supabase-vincular-novo` alheias); `npx tsc --noEmit` limpo; migration vira arquivo na Área de Trabalho.

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/049_empresa_config.sql` | Criar | `empresa_config` (singleton) + `empresa_kits` + seed EcoSun |
| `src/modules/empresa-config.ts` | Criar | Tipos + defaults EcoSun + loader/cache + `empresa()` síncrono + `interpolarEmpresa()` puro |
| `src/prompts/system-prompt.md` | Modificar | Trechos da empresa viram placeholders `{{...}}` |
| `src/modules/brain.ts` | Modificar | `replaceAll` dos placeholders novos (junto do review_link) |
| `src/modules/closing/templates/{contrato,procuracao}.html.ts` | Modificar | Dados da contratada/outorgado ← `empresa()` |
| `src/modules/proposal/{template.ts,service-payment.ts}` + `proposal-assistant.ts` | Modificar | CNPJ/site/PIX/nome atendente ← `empresa()` |
| `src/modules/monitoring/relatorio/template.ts` + `src/modules/relatorios/pos-instalacao/template.ts` | Modificar | Rodapés/garantia ← `empresa()` |
| `src/index.ts` | Modificar | FAQ empresa, página inicial, wa.me, critério de lead, marcas, kits |
| `src/modules/{eva-sender,eva-alerts,ig-qualifier-brain,blog-generator}.ts` | Modificar | Nome atendente/telefone/persona ← `empresa()` |
| `src/modules/marketing/banner-tabela-kits*.ts` | Modificar | RT default + kits ← banco |
| `src/modules/proposal/assets/logo-base64.ts` (+ quem usa) | Modificar | Logo: Storage com fallback base64 |
| `tests/empresa-config.test.ts` | Criar | Defaults, interpolação, paridade |

---

### Task 1: Migration 049 — `empresa_config` + `empresa_kits` com seed EcoSun

**Files:**
- Create: `supabase/migrations/049_empresa_config.sql`
- Create: `C:\Users\Meu Computador\Desktop\migration-049-empresa-config.sql` (cópia)

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/049_empresa_config.sql
-- EcoSof Kit Clone: parametrização por empresa. A instância da EcoSunPower é o
-- "cliente nº 0" — o seed abaixo são os dados REAIS dela e o comportamento não
-- muda em nada. Num clone, a implantação edita esta linha (e os kits).
-- Inventário do que isso substitui: docs/ecosof/01-inventario-clone.md

CREATE TABLE IF NOT EXISTS empresa_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- identidade
  razao_social text NOT NULL,
  nome_fantasia text NOT NULL,
  cnpj text NOT NULL,
  endereco text NOT NULL,
  cidade text NOT NULL,
  uf text NOT NULL,
  cep text,
  email text NOT NULL,
  site_url text NOT NULL,
  atuacao_desde int NOT NULL DEFAULT 2019,
  descricao_curta text NOT NULL,            -- "empresa de engenharia em energia..."
  regiao_atuacao text NOT NULL,             -- texto pro prompt ("Brasília e Entorno (DF) + GO até 100km...")
  -- atendente IA
  nome_atendente text NOT NULL DEFAULT 'Eva',
  telefone_atendente text,                  -- chip do WhatsApp do negócio (wa.me)
  -- responsável técnico
  rt_nome text NOT NULL,
  rt_titulo text NOT NULL DEFAULT 'Responsável Técnico CREA/CFT',
  rt_cpf text,
  rt_rg text,
  rt_registro text,
  -- comercial
  pix_chave text,
  criterio_lead_valor numeric(10,2) NOT NULL DEFAULT 700,
  criterio_lead_kwh numeric(10,2) NOT NULL DEFAULT 700,
  marcas_permitidas text[] NOT NULL DEFAULT '{}',
  marcas_bloqueadas text[] NOT NULL DEFAULT '{}',
  garantia_instalacao_meses int NOT NULL DEFAULT 12,
  fator_perda_padrao numeric(4,2) NOT NULL DEFAULT 0.78,
  belenus_ativo boolean NOT NULL DEFAULT false,  -- tabela de cartão específica da EcoSun
  -- região técnica (fallback quando a UF do cliente NÃO está no solar-params)
  hsp_padrao numeric(4,2),                   -- ex.: 5.40; null = usa o resolver atual por UF
  tarifa_kwh_padrao numeric(6,3),            -- ex.: 1.050; null = resolver atual
  concessionaria_padrao text,                -- ex.: 'CEMIG-MG'; null = resolver atual
  -- branding
  logo_storage_path text,                    -- bucket 'branding'; null = logo embutida (fallback)
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO empresa_config (
  id, razao_social, nome_fantasia, cnpj, endereco, cidade, uf, cep, email, site_url,
  atuacao_desde, descricao_curta, regiao_atuacao, nome_atendente, telefone_atendente,
  rt_nome, rt_titulo, rt_cpf, rt_rg, rt_registro, pix_chave,
  criterio_lead_valor, criterio_lead_kwh, marcas_permitidas, marcas_bloqueadas,
  garantia_instalacao_meses, fator_perda_padrao, belenus_ativo
) VALUES (
  1,
  'ECOSUNPOWER ENERGIA SOLAR LTDA',
  'EcoSunPower',
  '33.020.459/0001-06',
  'SHA Conjunto 01 Chácara 44C Lote 6 - Arniqueira',
  'Brasília', 'DF', '71993-150',
  'junior@ecosunpower.eng.br',
  'https://ecosunpower.eng.br',
  2019,
  'empresa de engenharia em energia com atuação em Brasília-DF e Goiás desde 2019',
  'Brasília e Entorno (DF) e cidades de Goiás até ~100 km (Águas Lindas, Valparaíso, Luziânia, Anápolis, Goiânia)',
  'Eva',
  '5561996978781',
  'ANTONIO CANDIDO RODRIGUES JUNIOR',
  'Responsável Técnico CREA/CFT',
  '989.404.571-53', '2.202.520 SSP-DF', '98940457153',
  '33.020.459/0001-06',
  700, 700,
  ARRAY['Trina Solar','JA Solar','Risen','Jinko Solar','LONGi','Honor','SolarEdge','Deye','Sungrow','Huawei','Hoymiles','Enphase','FoxESS','NEP','Solis','SolaX'],
  ARRAY['Growatt'],
  12, 0.78, true
) ON CONFLICT (id) DO NOTHING;

-- Kits comerciais (preço é DO CLIENTE — hoje hardcoded em index.ts:2754)
CREATE TABLE IF NOT EXISTS empresa_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem int NOT NULL,
  kwp numeric(6,2) NOT NULL,
  modulos int NOT NULL,
  microinversores int,
  geracao_kwh_mes numeric(8,1) NOT NULL,
  preco_brl numeric(12,2) NOT NULL,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed = os 6 kits OnGrid atuais (valores EXATOS de src/index.ts:2754-2760 —
-- o implementador DEVE conferir no código e copiar fielmente os 6)
INSERT INTO empresa_kits (ordem, kwp, modulos, microinversores, geracao_kwh_mes, preco_brl)
SELECT * FROM (VALUES
  (1, 5.67::numeric, 9, 3, 700::numeric, 15800.61::numeric)
  -- [IMPLEMENTADOR]: adicionar os outros 5 kits com os valores reais do index.ts
) AS v(ordem, kwp, modulos, microinversores, geracao_kwh_mes, preco_brl)
WHERE NOT EXISTS (SELECT 1 FROM empresa_kits);
```

⚠️ O `[IMPLEMENTADOR]` acima é a ÚNICA lacuna intencional: os valores dos 6 kits moram em `src/index.ts:2754-2760` — copie EXATOS (são preços reais da EcoSun).

- [ ] **Step 2: Copiar pra Área de Trabalho** — `Copy-Item supabase\migrations\049_empresa_config.sql "C:\Users\Meu Computador\Desktop\migration-049-empresa-config.sql"`

- [ ] **Step 3: Commit** — `git add supabase/migrations/049_empresa_config.sql` + `git commit -m "feat(ecosof): migration 049 — empresa_config + empresa_kits com seed EcoSunPower"`

---

### Task 2: Módulo `empresa-config.ts` (TDD)

**Files:**
- Create: `src/modules/empresa-config.ts`
- Test: `tests/empresa-config.test.ts`

- [ ] **Step 1: Testes (falhando)**

```typescript
// tests/empresa-config.test.ts
import { describe, it, expect } from 'vitest';
import {
  EMPRESA_DEFAULTS, normalizarEmpresaRow, interpolarEmpresa, listaMarcasTexto,
} from '../src/modules/empresa-config.js';

describe('empresa-config: defaults EcoSun (fallback sem banco)', () => {
  it('defaults têm os dados reais da EcoSunPower', () => {
    expect(EMPRESA_DEFAULTS.cnpj).toBe('33.020.459/0001-06');
    expect(EMPRESA_DEFAULTS.nomeAtendente).toBe('Eva');
    expect(EMPRESA_DEFAULTS.criterioLeadValor).toBe(700);
    expect(EMPRESA_DEFAULTS.marcasBloqueadas).toContain('Growatt');
    expect(EMPRESA_DEFAULTS.rtNome).toContain('ANTONIO CANDIDO');
  });
});

describe('empresa-config: normalização de row do banco', () => {
  it('row completa vira EmpresaConfig camelCase', () => {
    const e = normalizarEmpresaRow({
      razao_social: 'SOLARCORP LTDA', nome_fantasia: 'SolarCorp', cnpj: '11.111.111/0001-11',
      endereco: 'Rua X', cidade: 'Uberlândia', uf: 'MG', cep: null,
      email: 'a@b.com', site_url: 'https://solarcorp.com.br', atuacao_desde: 2021,
      descricao_curta: 'empresa de MG', regiao_atuacao: 'Triângulo Mineiro',
      nome_atendente: 'Marina', telefone_atendente: '5534999999999',
      rt_nome: 'FULANO', rt_titulo: 'Responsável Técnico CREA', rt_cpf: null, rt_rg: null, rt_registro: null,
      pix_chave: null, criterio_lead_valor: 400, criterio_lead_kwh: 350,
      marcas_permitidas: ['Trina Solar'], marcas_bloqueadas: [],
      garantia_instalacao_meses: 12, fator_perda_padrao: 0.78, belenus_ativo: false,
      logo_storage_path: null,
    });
    expect(e.nomeAtendente).toBe('Marina');
    expect(e.criterioLeadValor).toBe(400);
    expect(e.belenusAtivo).toBe(false);
  });
  it('campos null/ausentes caem no default (nunca undefined no template)', () => {
    const e = normalizarEmpresaRow({ razao_social: 'X' } as never);
    expect(e.nomeAtendente).toBe('Eva');
    expect(e.rtTitulo).toBe('Responsável Técnico CREA/CFT');
    expect(e.razaoSocial).toBe('X');
  });
});

describe('empresa-config: interpolação de placeholders', () => {
  it('substitui todos os {{...}} de empresa num texto', () => {
    const out = interpolarEmpresa(
      'Sou a {{nome_atendente}} da {{empresa_nome}} ({{empresa_descricao}}). RT: {{rt_nome}}, {{rt_titulo}}. Região: {{empresa_regiao}}. Critério: R$ {{criterio_lead_valor}} ou {{criterio_lead_kwh}} kWh. Site: {{empresa_site}}.',
      EMPRESA_DEFAULTS,
    );
    expect(out).toContain('Sou a Eva da EcoSunPower');
    expect(out).toContain('700');
    expect(out).not.toContain('{{');
  });
  it('placeholder desconhecido fica intacto (não explode)', () => {
    expect(interpolarEmpresa('{{nao_existe}}', EMPRESA_DEFAULTS)).toBe('{{nao_existe}}');
  });
});

describe('empresa-config: lista de marcas pro prompt', () => {
  it('monta texto com permitidas e bloqueio', () => {
    const t = listaMarcasTexto(EMPRESA_DEFAULTS);
    expect(t).toContain('Trina Solar');
    expect(t).toContain('Não trabalhamos com');
    expect(t).toContain('Growatt');
  });
  it('sem bloqueadas, sem frase de bloqueio', () => {
    expect(listaMarcasTexto({ ...EMPRESA_DEFAULTS, marcasBloqueadas: [] })).not.toContain('Não trabalhamos');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/empresa-config.test.ts`

- [ ] **Step 3: Implementar**

```typescript
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
};

// Row snake_case do banco → EmpresaConfig; null/ausente cai no default (nunca
// undefined chegando em template/prompt).
export function normalizarEmpresaRow(row: Record<string, unknown>): EmpresaConfig {
  const s = (v: unknown, d: string): string => (typeof v === 'string' && v.trim() ? v : d);
  const sn = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
  const n = (v: unknown, d: number): number => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && isFinite(Number(v)) ? Number(v) : d);
  const arr = (v: unknown, d: string[]): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : d);
  const b = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
  const D = EMPRESA_DEFAULTS;
  return {
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
  };
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
  for (const [k, v] of Object.entries(mapa)) out = out.replaceAll(`{{${k}}}`, v);
  return out;
}

export function listaMarcasTexto(e: EmpresaConfig): string {
  const base = `Trabalhamos com: ${e.marcasPermitidas.join(', ')}.`;
  if (e.marcasBloqueadas.length === 0) return base;
  return `${base} Não trabalhamos com ${e.marcasBloqueadas.join(', ')}.`;
}

// ---------------------------------------------------------------------------
// Cache + loader (I/O fino). init no boot; getter síncrono pro resto do app.
// ---------------------------------------------------------------------------
let cache: EmpresaConfig = EMPRESA_DEFAULTS;

export function empresa(): EmpresaConfig { return cache; }

export async function carregarEmpresaConfig(client: SupabaseClient): Promise<EmpresaConfig> {
  try {
    const { data, error } = await client.from('empresa_config').select('*').eq('id', 1).maybeSingle();
    if (error || !data) {
      console.warn('[empresa-config] tabela ausente/vazia — usando defaults EcoSun:', error?.message ?? 'sem linha');
      cache = EMPRESA_DEFAULTS;
      return cache;
    }
    cache = normalizarEmpresaRow(data as Record<string, unknown>);
    console.log(`[empresa-config] carregada: ${cache.nomeFantasia} (atendente: ${cache.nomeAtendente})`);
    return cache;
  } catch (err) {
    console.warn('[empresa-config] falha ao carregar — defaults EcoSun:', (err as Error).message);
    cache = EMPRESA_DEFAULTS;
    return cache;
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
    if (error || !data || data.length === 0) return [];
    return (data as Array<Record<string, unknown>>).map((k) => ({
      ordem: Number(k.ordem), kwp: Number(k.kwp), modulos: Number(k.modulos),
      microinversores: k.microinversores == null ? null : Number(k.microinversores),
      geracaoKwhMes: Number(k.geracao_kwh_mes), precoBrl: Number(k.preco_brl),
      descricao: typeof k.descricao === 'string' ? k.descricao : null,
    }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: PASS** → **Step 5: Commit** — `git add src/modules/empresa-config.ts tests/empresa-config.test.ts` + `git commit -m "feat(ecosof): modulo empresa-config (defaults EcoSun, cache, interpolacao)"`

---

### Task 3: Boot + comando `/recarregar-config`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1:** No boot (perto de onde `brain`/serviços são inicializados, ANTES do primeiro uso): `const { carregarEmpresaConfig } = await import('./modules/empresa-config.js'); await carregarEmpresaConfig(supabase.getClient());` (ou import estático no topo — siga o padrão do arquivo; falha não derruba o boot, o módulo já degrada pra defaults).
- [ ] **Step 2:** Comando admin novo `recarregar-config` / `/recarregar-config` (junto dos outros comandos admin, gateado em `isAdminPhone`): chama `carregarEmpresaConfig` de novo e responde `⚙️ Config recarregada: <nomeFantasia> (atendente: <nomeAtendente>)`. Editou a tabela no SQL Editor → roda o comando → sem redeploy.
- [ ] **Step 3:** tsc + suite → **Step 4: Commit** — `git commit -m "feat(ecosof): carga da empresa_config no boot + /recarregar-config"`

---

### Task 4: Placeholders no system-prompt + brain

**Files:**
- Modify: `src/prompts/system-prompt.md`
- Modify: `src/modules/brain.ts:74` (onde já existe `replaceAll('{{review_link}}')`)

- [ ] **Step 1:** Em `brain.ts`, onde monta `stableSystem`: depois do replace do review_link, aplicar `interpolarEmpresa(stableSystem, empresa())` (import do módulo novo). ⚠️ O prompt é cacheado? Se `stableSystem` for computado a cada chamada, ok; se for no construtor, mover a interpolação pra um getter que leia `empresa()` na hora (o /recarregar-config precisa surtir efeito sem restart — verifique no código e documente a escolha).
- [ ] **Step 2:** Em `system-prompt.md`, trocar os trechos da empresa por placeholders. Mapa das trocas (linhas do inventário; ache pelo TEXTO, as linhas podem ter shiftado):
  - Identidade (l.182-186): "Você e a Eva, consultora de energia solar da Ecosunpower..." → `Você e a {{nome_atendente}}, consultora de energia solar da {{empresa_nome}} ({{empresa_descricao}}). O {{rt_titulo}} da empresa é {{rt_nome}}.`
  - Apresentações (l.339, 445): "Sou a Eva, consultora da Ecosunpower" → `Sou a {{nome_atendente}}, consultora da {{empresa_nome}}`
  - Região (l.14-29): bloco de cidades → `{{empresa_regiao}}` (manter a estrutura da seção)
  - Endereço (l.20-22): → `{{empresa_endereco}}`
  - Critério (l.353, 401-402): "≥ R$ 700/mês OU ≥ 700 kWh" → `≥ R$ {{criterio_lead_valor}}/mês OU ≥ {{criterio_lead_kwh}} kWh`
  - Marcas (l.63 e seção 7095-equivalente se estiver no prompt): lista fixa → `{{marcas_texto}}` onde fizer sentido (a frase tier-1 técnica pode ficar)
  - Garantia "mão de obra 1 ano" → `garantia de instalação de {{garantia_meses}} meses`
  - Site (l.307): → `{{empresa_site}}`
  - ⚠️ NÃO trocar menções a "Junior" que são OPERACIONAIS (transferir pro Junior = papel de admin/dono): trocar por uma forma neutra `{{rt_nome}}`/"o responsável" SÓ onde for texto pro cliente; onde for instrução interna de fluxo ("avisa o Junior"), trocar por "avisa o dono" — decisão: usar `{{rt_nome}}` apenas em texto voltado ao cliente; instruções internas usam "o responsável (admin)". Documente cada troca no commit.
- [ ] **Step 3 (teste de paridade):** teste novo em `tests/empresa-config.test.ts`:

```typescript
import { readFileSync } from 'fs';
describe('system-prompt: placeholders resolvem com o seed EcoSun', () => {
  it('nenhum {{placeholder de empresa}} fica sem resolver', () => {
    const prompt = readFileSync('src/prompts/system-prompt.md', 'utf-8');
    const out = interpolarEmpresa(prompt, EMPRESA_DEFAULTS);
    const sobras = out.match(/\{\{(?!review_link)[a-z_]+\}\}/g) ?? [];
    expect(sobras).toEqual([]);
  });
  it('com defaults, o prompt volta a falar Eva/EcoSunPower/700', () => {
    const prompt = readFileSync('src/prompts/system-prompt.md', 'utf-8');
    const out = interpolarEmpresa(prompt, EMPRESA_DEFAULTS);
    expect(out).toContain('Eva');
    expect(out).toContain('Ecosunpower');  // ajuste pra grafia usada no prompt
    expect(out).toContain('700');
  });
});
```

- [ ] **Step 4:** tsc + suite (TODOS os testes que citavam texto fixo do prompt podem quebrar — ajuste-os pra usar a versão interpolada) → **Step 5: Commit** — `git commit -m "feat(ecosof): system-prompt parametrizado por empresa_config (placeholders)"`

---

### Task 5: Templates jurídicos e proposta

**Files:**
- Modify: `src/modules/closing/templates/contrato.html.ts` (CNPJ l.13, bloco contratada l.50-76)
- Modify: `src/modules/closing/templates/procuracao.html.ts` (outorgado l.6/16, CNPJ l.18, e-mail footer)
- Modify: `src/modules/proposal-assistant.ts` (l.299 "Eva...EcoSunPower", l.522 CNPJ)
- Modify: `src/modules/proposal/template.ts` (l.67-70 cnpj/site; "Eva, sua consultora EcoSunPower"; "gerada por Eva")
- Modify: `src/modules/proposal/service-payment.ts` (l.7 PIX)
- Modify: `src/modules/monitoring/relatorio/template.ts` (l.23 fone, l.96 rodapé) e `src/modules/relatorios/pos-instalacao/template.ts` (l.112 garantia/RT)

- [ ] **Step 1:** Em cada arquivo: `import { empresa } from '../<caminho>/empresa-config.js';` e trocar o literal pelo campo (`empresa().cnpj`, `empresa().razaoSocial`, `empresa().rtNome`, `empresa().rtTitulo`, `empresa().email`, `empresa().pixChave ?? empresa().cnpj`, `empresa().nomeAtendente`, `empresa().siteUrl.replace('https://','')`, `${empresa().garantiaInstalacaoMeses} meses pelo ${empresa().rtTitulo} da ${empresa().nomeFantasia}`, rodapé `${empresa().nomeFantasia} Energia... → ${empresa().razaoSocial} · CNPJ ${empresa().cnpj} · ${empresa().cidade}-${empresa().uf}`). ⚠️ Templates são funções chamadas em runtime — `empresa()` DENTRO da função (nunca capturar no módulo-load, senão /recarregar-config não pega).
- [ ] **Step 2 (paridade):** rode a suite — os testes existentes de contrato/proposta que conferem CNPJ/nomes devem CONTINUAR passando (defaults = mesmos valores). Qualquer ajuste de teste = sinal amarelo, investigue.
- [ ] **Step 3: Commit** — `git commit -m "feat(ecosof): contrato, procuracao, proposta e relatorios leem empresa_config"`

---

### Task 6: index.ts + módulos de mensagem (identidade e critério)

**Files:**
- Modify: `src/index.ts` — FAQ empresa (l.6911/6916: CNPJ, razão, descrição), página inicial (l.116-132: nome + wa.me com `empresa().telefoneAtendente`), rodapé l.7732, e-mail l.7043, persona blog l.764-area, critério de lead (l.3850-3857, 4019, 4098, 4428: `>= empresa().criterioLeadValor` / `criterioLeadKwh`), marcas (l.7095: usar `listaMarcasTexto(empresa())`), título páginas l.113
- Modify: `src/modules/eva-alerts.ts:270` (critério no texto do alerta)
- Modify: `src/modules/eva-sender.ts` ("Sou a Eva, consultora da EcoSunPower" → nome/empresa da config)
- Modify: `src/modules/marketing/ig-qualifier-brain.ts:43` (WA_PHONE → `empresa().telefoneAtendente`)
- Modify: `src/modules/blog-generator.ts:180` (persona → `${empresa().rtNome}, ${empresa().rtTitulo} da ${empresa().nomeFantasia}`)
- Modify: `src/modules/marketing/banner-tabela-kits.ts:25` + `banner-tabela-kits-html.ts:559` (RT default → `empresa().rtNome`)
- Modify: `src/modules/dashboard/views.ts:250` (placeholder login → `empresa().email`)

- [ ] **Step 1:** trocas acima, sempre `empresa()` em runtime. Critério: ⚠️ os números 700 aparecem em comparações — troque TODOS os 4 pontos do inventário (3850+, 4019, 4098, 4428) e grep por `700` no index pra não deixar irmão perdido (cuidado: 700 também aparece em kWh de kit — só os de CRITÉRIO).
- [ ] **Step 1b (strings "Eva" espalhadas):** `grep -rn "Eva" src/ --include=*.ts` e troque por `empresa().nomeAtendente` TODA string voltada a CLIENTE ou que apresente a atendente (eva-digest, mensagens de followup/cadência, intro, reengagement, monitoramento/abordagem FOOTER "Monitoramento · Eva" etc.). NÃO mexer em: nomes de arquivo/módulo (eva-*.ts), ids de botão (evabt:), comentários, nomes de tabela (eva_cadence), logs internos. Liste no commit as trocas feitas.
- [ ] **Step 1c (região técnica fallback):** em `src/modules/solar-params.ts` (resolver de HSP/tarifa/concessionária por UF): quando a UF não resolver pelo mapa atual, usar `empresa().hspPadrao`/`tarifaKwhPadrao`/`concessionariaPadrao` se setados (senão o default conservador atual). Adicionar os 3 campos no `EmpresaConfig`/`normalizarEmpresaRow`/`EMPRESA_DEFAULTS` (null pros 3 — EcoSun usa o resolver DF/GO de sempre) + teste de normalização.
- [ ] **Step 2:** tsc + suite → **Step 3: Commit** — `git commit -m "feat(ecosof): identidade, criterio de lead e marcas vindos da empresa_config"`

---

### Task 7: Kits do banco

**Files:**
- Modify: `src/index.ts:2754-2760` (array hardcoded) e o comando `/banner-kits` que o consome

- [ ] **Step 1:** Substituir o array por `await carregarKits(supabase.getClient())`; lista vazia → mensagem ao admin `⚠️ Nenhum kit cadastrado em empresa_kits — cadastre no banco e rode /recarregar-config.` (sem fallback hardcoded: kit é preço, preço é do cliente).
- [ ] **Step 2:** Conferir os 6 kits do seed da migration (Task 1) contra o array ANTES de apagar — os valores precisam estar idênticos no SQL.
- [ ] **Step 3:** tsc + suite → **Step 4: Commit** — `git commit -m "feat(ecosof): kits comerciais saem do banco (empresa_kits)"`

---

### Task 8: Logo via Storage com fallback

**Files:**
- Modify: `src/modules/proposal/assets/logo-base64.ts` e quem usa (grep `logo-base64`/`logoBase64`)

- [ ] **Step 1:** Criar função `obterLogoBase64(client): Promise<string>` no próprio arquivo: se `empresa().logoStoragePath` setado → baixa do bucket `branding` (privado; `client.storage.from('branding').download(path)` → buffer → base64), com cache em memória (path como chave); falha/null → retorna a constante embutida atual (logo EcoSun). Quem usa passa a chamar a função (são pontos de geração de PDF — async ok).
- [ ] **Step 2:** Adicionar bucket `branding` ao checklist `setup/buckets-storage.md` (criado pelo instalador — edite o arquivo).
- [ ] **Step 3:** tsc + suite → **Step 4: Commit** — `git commit -m "feat(ecosof): logo da proposta via Storage com fallback embutido"`

---

### Task 9: Belenus atrás de flag + defaults perigosos sem default

**Files:**
- Modify: `src/modules/proposal-assistant.ts` (tabela/`enforceCartaoBelenus`)
- Modify: `src/config.ts:51,63` (defaults com identidade EcoSun)

- [ ] **Step 1:** Onde a tabela Belenus é aplicada (`enforceCartaoBelenus` e prompt que cita Belenus): gate em `empresa().belenusAtivo` — false → cai no comportamento genérico de cartão (12x maquininha do service-payment). EcoSun (seed true) = comportamento atual.
- [ ] **Step 2:** Em `config.ts`: `metaCapiDatasetId` perde o default `'1053629086258723'` (vira optional — ⚠️ grep usos e proteja com `if (config.metaCapiDatasetId)`); `githubSiteRepo` perde o default EcoSun (vira optional; gate nos usos — blog OFF sem repo). `publicProposalBaseUrl`/`siteUrl` MANTÊM default EcoSun por ora (a EcoSun usa env em prod; clone preenche) — só adicionar comentário `// [CLONE] obrigatório no .env do clone`.
- [ ] **Step 3:** tsc + suite → **Step 4: Commit** — `git commit -m "feat(ecosof): belenus atras de flag + defaults de identidade removidos do config"`

---

### Task 10: Verificação de paridade final + marker

**Files:**
- Modify: `src/build-info.ts` → `'ECOSOF-PARAMETRIZACAO-2026-06-12'`; `Dockerfile` cache bust → `2026-06-12-ecosof`

- [ ] **Step 1:** `npx tsc --noEmit` → 0; `npx vitest run` COMPLETO → verde (2 pré-existentes alheias). Grep final de paridade: `grep -rn "33.020.459" src/` deve sobrar SÓ em `empresa-config.ts` (defaults) e na migration; `grep -rn "ANTONIO CANDIDO" src/` idem; `grep -rni "ecosunpower" src/ --include=*.ts | grep -v empresa-config` — analise cada sobra (comentários ok; string de produto não). E `grep -rn '"Sou a Eva\|consultora da Eco\|· Eva' src/` → zero sobras client-facing.
- [ ] **Step 2: Commit** — `git add src/build-info.ts Dockerfile` + `git commit -m "chore(ecosof): build marker ECOSOF-PARAMETRIZACAO-2026-06-12"`

---

## Pós-implementação

1. **3 reviews finais** (regra do Junior): 🐞 correção (paridade: com seed EcoSun, contrato/proposta/prompt batem byte a byte com o antigo? `empresa()` chamado em runtime, nunca capturado no load?), ♻️ regressão (suite + grep de sobras + nada de comportamento novo pro cliente), 🔒 segurança (dados PII do RT na tabela — RLS-padrão do projeto ok; logo download sem path traversal; placeholders não interpolam input de cliente).
2. **Pedir autorização de push.**
3. **Deploy EcoSun (cliente nº 0):** migration 049 no SQL Editor (arquivo na Área de Trabalho — completar os 6 kits!) → Implantar → `/health` → smoke: gerar proposta/contrato de teste e conferir que está IGUAL; `/recarregar-config` responde.
4. **Atualizar `docs/ecosof/01-inventario-clone.md`** (seção F: item 3 ✅) e o roteiro de implantação ganha: "editar empresa_config + empresa_kits + upload logo no bucket branding".

## Riscos / decisões

- **Paridade é o critério de aceite nº 1**: seed = dados reais; qualquer teste ajustado pra passar é red flag.
- **`empresa()` é getter síncrono de cache** — simples e suficiente; troca exige `/recarregar-config` ou restart (documentado).
- **Kits sem fallback hardcoded** (preço é do cliente; vazio = aviso, não inventa preço).
- **Conhecimento (`conhecimento/*.md`) NÃO entra neste plano** — é conteúdo por cliente, tratado no roteiro de implantação (copiar genéricos + regravar [EMPRESA]).
- **Eva vitrine da EcoSof** = instância própria com config própria (nome_atendente='Eva') — nada especial neste plano.
