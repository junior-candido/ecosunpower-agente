# Energy Command Center — Plano de implementação (fases A e B detalhadas; C–I em roteiro)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** transformar o painel no "Energy Command Center" do protótipo aprovado, sem mudar a marca EcoSun, com número sempre real e multi-tenant, fase por fase (cada fase = 1 PR que sai sozinho).

**Architecture:** design system em `src/modules/dashboard/ui/` (funções puras que devolvem HTML escapado + CSS com prefixo `cc-`), menu por área em `menu-areas.ts` (puro, reusa `estadoDoItem` da vitrine), casca nova no `renderLayout` (`views.ts`). A partir da fase B, cada bloco do Command Center lê de consultas escopadas por `company_id` e o motor da Central de Atenção (`central-atencao.ts`) é puro, alimentado por adaptadores testados isoladamente.

**Tech Stack:** TypeScript ESM (imports `.js`), Express server-rendered, Tailwind CDN (telas antigas) + CSS próprio `cc-` (telas novas), Google Fonts (Inter + Space Grotesk), Supabase via `bancoDoOperador(req, supabase)`, vitest.

**Spec:** `docs/superpowers/specs/2026-09-27-command-center-design.md`.

**Regras do projeto:** branch própria; `git add` por nome; nunca `push` sem o Junior; commit em português terminando com `Co-Authored-By:`; `npx tsc --noEmit` + `npx vitest run` verdes; nada de `supabase.from(` cru novo no `router.ts` (teste-teto `tests/tenant-rota-guard.test.ts`); número inventado nunca — sem dado = "—".

---

## FASE A — design system + casca nova + rota `/command-center` (FEITA nesta branch)

### Mapa de arquivos (fase A)

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/modules/dashboard/ui/html.ts` | Criar | **Puro.** `escapeHtml` (fonte única, `views.ts` reexporta), `fmtNumero`, `fmtCompacto`, `hrefSeguro`, `SEM_DADO` |
| `src/modules/dashboard/ui/icones.ts` | Criar (gerado do protótipo) | `ICONES` (traço Lucide) + `SPRITE_ICONES` |
| `src/modules/dashboard/ui/componentes.ts` | Criar | **Puro.** `pilulaStatus`, `pontoStatus`, `icone`, `kpiCard`, `faixaKpis`, `cartaoSecao`, `tabela`, `selo`, `sparkline`, `estadoVazio`, `cabecalhoPagina`, `filtroGlobal`, `TONS` |
| `src/modules/dashboard/ui/estilo.ts` | Criar | `FONTES_HEAD`, `CSS_TOKENS` (escuro + `.cc-claro`), `CSS_CASCA`, `CSS_COMPONENTES`, `CSS_DESIGN_SYSTEM` |
| `src/modules/dashboard/ui/logo-negativa-wide.ts` | Criar (gerado) | logo oficial negativa-wide (80 KB; a antiga `LOGO_ECOSUNPOWER_DARK_BASE64` tinha 4858 px e ia em toda página) |
| `src/modules/dashboard/menu-areas.ts` | Criar | **Puro.** `MENU_AREAS` (IA nova), `montarMenu`, `ehChaveDeMenu` |
| `src/modules/dashboard/views.ts` | Modificar | `renderLayout` novo (`ChaveAtiva`, `largo`, `selos`); `escapeHtml` reexportado |
| `src/modules/dashboard/command-center-views.ts` | Criar | `renderCommandCenterPage`, `renderModoTvPage`, `saudacao`, `carimboAoVivo` |
| `src/modules/dashboard/router.ts` | Modificar | `GET /command-center` (só EcoSun na fase A) e `GET /tv` |
| `cadencia-views.ts`, `usuarios-views.ts`, `proposta-form-view.ts`, `conhecer-views.ts` | Modificar | chaves `active` corrigidas |
| `tests/cc-ui-componentes.test.ts`, `tests/cc-menu-areas.test.ts`, `tests/cc-casca.test.ts`, `tests/cc-chaves-ativas.test.ts`, `tests/cc-command-center-view.test.ts` | Criar | testes |

### Task A1: base (`ui/html.ts`) + componentes (`ui/componentes.ts`)

- [x] **Step 1: teste falhando** — `tests/cc-ui-componentes.test.ts` (28 casos): escape dos 5 caracteres; `fmtNumero(null|NaN|Infinity) === '—'`; `fmtCompacto(284800) → {numero:'284,8', sufixo:'mil'}`; cada tom com emoji 🔴🟠🟡🟢🔵 e "Sem dado"; `kpiCard({valor:null})` sem nenhum dígito e com "sem dado"; `href` perigoso descartado; `tabela` com célula `{html}` crua e `null → —`; `selo(0) === ''`; `sparkline` com <2 pontos → "sem dado", série constante sem `NaN`, cor inválida → padrão; `estadoVazio({tipo:'construcao'})` → "Em construção — próxima entrega"; `cabecalhoPagina` com trilha/filtros/ações.
- [x] **Step 2:** `npx vitest run tests/cc-ui-componentes.test.ts` → FAIL (módulo não existe).
- [x] **Step 3: implementação** — ver os arquivos. Contrato de todos os componentes:

```ts
// texto comum → SEMPRE escapado; campo terminado em `Html` → HTML confiável (saída de outro componente)
export type Tom = 'critico' | 'atencao' | 'acompanhar' | 'oportunidade' | 'info' | 'normal' | 'sem_dado';
export interface KpiInput {
  rotulo: string; valor: number | null | undefined; casas?: number; unidade?: string; prefixo?: string;
  compacto?: boolean; detalhe?: string; tendencia?: { texto: string; direcao: 'sobe' | 'desce' };
  destaque?: boolean; href?: string; semDadoTexto?: string;
}
export function kpiCard(k: KpiInput): string;
export function faixaKpis(kpis: KpiInput[], opts?: { classe?: string }): string;
export function cartaoSecao(c: { titulo: string; dica?: string; acoesHtml?: string; corpoHtml: string; classe?: string; id?: string }): string;
export function tabela(t: { colunas: Array<{ titulo: string; alinhar?: 'dir'; num?: boolean; casas?: number }>; linhas: Celula[][]; hrefs?: Array<string | null | undefined>; vazio?: string }): string;
export function selo(valor: number | string | null | undefined, tom?: 'neutro' | 'critico' | 'dourado'): string;
export function sparkline(valores: Array<number | null | undefined>, opts?: { cor?: string; largura?: number; altura?: number }): string;
export function estadoVazio(e?: { tipo?: 'construcao' | 'vazio' | 'sem_dado'; titulo?: string; texto?: string; icone?: NomeIcone; compacto?: boolean }): string;
export function cabecalhoPagina(c: { titulo: string; subtitulo?: string; trilha?: Array<{ rotulo: string; href?: string }>; aoVivo?: string; seloHtml?: string; filtrosHtml?: string; acoesHtml?: string }): string;
```

- [x] **Step 4:** teste verde (28/28).
- [x] **Step 5:** commit.

### Task A2: menu por área (`menu-areas.ts`)

- [x] **Step 1: teste falhando** — `tests/cc-menu-areas.test.ts`: as 36 rotas do menu antigo continuam no menu novo; `/dashboard/command-center` presente; chaves e hrefs únicos; ordem dos grupos = protótipo; `montarMenu` com EcoSun admin (sem itens `soTenant`), grupo do item ativo aberto, tenant com item sem área escondido e módulo não contratado `bloqueado`, grupo todo bloqueado = `trancado`, selos no grupo certo.
- [x] **Step 2:** FAIL.
- [x] **Step 3: implementação** (núcleo):

```ts
export function montarMenu(user, ativo, ecosunCompanyId, podeNaArea, selos = {}): GrupoMontado[] {
  const out: GrupoMontado[] = [];
  for (const g of MENU_AREAS) {
    const itens: ItemMontado[] = [];
    for (const it of g.itens) {
      const estado = estadoDoItem(it, user, ecosunCompanyId, podeNaArea); // mesma regra da vitrine
      if (estado === 'escondido') continue;
      itens.push({ ...it, estado, ativo: it.key === ativo });
    }
    if (itens.length === 0) continue;                 // grupo vazio some (ex.: Relatórios até a fase G)
    const temAtivo = itens.some((i) => i.ativo);
    out.push({ id: g.id, titulo: g.titulo, icone: g.icone, separarAntes: g.separarAntes, itens,
      ativo: temAtivo, aberto: temAtivo, trancado: itens.every((i) => i.estado === 'bloqueado'), selo: selos[g.id] });
  }
  return out;
}
```

- [x] **Step 4:** verde (11/11). **Step 5:** commit.

### Task A3: casca nova (`renderLayout`) + estilo

- [x] **Step 1: teste falhando** — `tests/cc-casca.test.ts` (14 casos): fontes/tokens/sprite no `<head>`; Command Center antes de Comercial; logo negativa-wide com link pra `/dashboard/home` (teste antigo `dashboard-logo-home` continua); grupo ativo `open` e item `cc-on`; `dark` → `<div class="cc-shell cc-escuro">`, sem `dark` → `cc-claro`; `<body>` mantém as classes antigas (`ecosun-body`, `ecosun-body-dark bg-slate-950 text-slate-100` — teste `monitoramento-render` exige); cartão do usuário escapado + Sair; Modo TV; barra do celular com `sidebar-open`; selos; `largo`; tenant sem logo/CNPJ da casa e sem Command Center; vitrine `/conhecer/marketing`.
- [x] **Step 2:** FAIL.
- [x] **Step 3:** reescrever `renderLayout` (ver `views.ts`) usando `montarMenu`, `SPRITE_ICONES`, `CSS_DESIGN_SYSTEM`, `FONTES_HEAD`, `LOGO_NEGATIVA_WIDE_BASE64`. Cuidados que custaram retrabalho e ficam registrados:
  - classe do subtítulo é `cc-subt` (a `cc-sub` é o submenu — colisão desenhava uma barra vertical no título);
  - o `<body>` mantém exatamente as classes antigas; o tema do design system vai na `div.cc-shell`;
  - a casca não usa `<b>` (teste `contrato-bloqueio-views` proíbe `<b>` na página inteira) → `<strong>`.
- [x] **Step 4:** verde, e os testes antigos de layout (`dashboard-*`, `menu-tenant-areas`, `whatsapp-views`, `monitoramento-render`) seguem verdes. **Step 5:** commit.

### Task A4: chaves `active` corrigidas

- [x] **Step 1: teste** `tests/cc-chaves-ativas.test.ts`: Cadência acende `/cadencia` (não `/marketing`); Usuários acende `/usuarios`; vitrine acende o próprio módulo (`cc-lock cc-on`); chave desconhecida não quebra.
- [x] **Step 3:** `cadencia-views.ts` → `'cadencia'`; `usuarios-views.ts` (2×) → `'usuarios'`; `proposta-form-view.ts` (2×) → `'propostas'`; `conhecer-views.ts` → `chaveAtiva(chave)` (`ehChaveDeMenu ? chave : 'home'`). OS fica em `'manutencao'` (nasce da tela de Manutenção, que está em O&M).
- [x] **Step 5:** commit.

### Task A5: `/command-center` e `/tv`

- [x] **Step 1: teste** `tests/cc-command-center-view.test.ts` (11 casos): `saudacao` pelo relógio de Brasília (11:42 → "Bom dia"; 23:30 → "Boa noite"); `carimboAoVivo` por extenso; estrutura do protótipo; casca larga e escura com o item aceso; números reais (212/47/9/5); **nenhum número do protótipo vaza** (`912`, `4,12`, `Atacadão`, `R$ 164`…); sem dados → nenhum dígito na faixa de KPIs; nome escapado; legenda das 5 severidades com `—`; cartões de área linkam telas existentes; Modo TV.
- [x] **Step 3:** `command-center-views.ts` + rotas. A rota só atende a EcoSun (tenant → `/dashboard/home`) porque `fetchDashboardKpis` ainda não filtra `company_id` no código. Nenhum `supabase.from(` cru novo.
- [x] **Step 4:** verde. **Step 5:** commit.

### Task A6: conferência visual

- [x] Script de render **fora do repo** (pasta temporária) chamando as views com dados fictícios + print do Chrome headless (desktop 1440 px) e Playwright (celular 375 px — o Chrome headless tem largura mínima de janela e corta a tela de 390 px, dá falso "estouro").
- [x] Prints em `Desktop\COMMAND-CENTER-FASE-A\` (Command Center desktop/celular/sem dados, menu aberto no celular, Modo TV e 8 telas antigas dentro da casca nova: Home, Leads, Propostas, Monitoramento EcoSun escuro, Monitoramento tenant claro, Demonstrativos, Financeiro, Pastas).

---

## FASE B — Command Center com dado real + motor da Central de Atenção

### Mapa de arquivos (fase B)

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/modules/dashboard/central-atencao.ts` | Criar | **Puro.** tipo `EventoAtencao`, `priorizar`, `contarPorSeveridade`, `topoDaHome` |
| `src/modules/dashboard/central-atencao-fontes.ts` | Criar | **Puro.** adaptadores: `eventosDeUsinas`, `eventosDePropostas`, `eventosDeContas`, `eventosDeManutencao`, `eventosDeCreditosGd`, `eventoCertificado` |
| `src/modules/dashboard/command-center-queries.ts` | Criar | leituras com `.eq('company_id', companyId)` explícito (dupla tranca com o RLS) |
| `src/modules/dashboard/command-center-views.ts` | Modificar | KPIs reais, Central de Atenção com eventos, selos, `/atencao` |
| `src/modules/dashboard/menu-areas.ts` | Modificar | item `command_center` ganha `area: 'relatorios'` (tenant vê pela vitrine) e novo item `atencao` |
| `src/modules/dashboard/router.ts` | Modificar | `/command-center` aberto a tenant; `GET /atencao` |
| `tests/cc-central-atencao.test.ts`, `tests/cc-central-atencao-fontes.test.ts`, `tests/cc-command-center-queries.test.ts` | Criar | testes |

### Task B1: motor puro da Central de Atenção

**Files:** Create `src/modules/dashboard/central-atencao.ts`; Test `tests/cc-central-atencao.test.ts`.

- [ ] **Step 1: teste falhando**

```ts
import { describe, it, expect } from 'vitest';
import { priorizar, contarPorSeveridade, topoDaHome, type EventoAtencao } from '../src/modules/dashboard/central-atencao.js';

const ev = (p: Partial<EventoAtencao>): EventoAtencao => ({
  id: p.id ?? Math.random().toString(36), severidade: 'info', area: 'usinas', titulo: 't', contexto: 'c',
  acao: { rotulo: 'Ver', href: '/dashboard/monitoramento' }, ...p,
});

describe('priorizar', () => {
  it('ordena por severidade, depois impacto em R$ (maior primeiro), depois o mais antigo', () => {
    const r = priorizar([
      ev({ id: 'a', severidade: 'atencao', impactoRs: 10 }),
      ev({ id: 'b', severidade: 'critico', impactoRs: 5 }),
      ev({ id: 'c', severidade: 'critico', impactoRs: 164 }),
      ev({ id: 'd', severidade: 'atencao', impactoRs: 10, desde: '2026-09-01T00:00:00Z' }),
      ev({ id: 'e', severidade: 'info' }),
    ]);
    expect(r.map((e) => e.id)).toEqual(['c', 'b', 'd', 'a', 'e']);
  });
  it('sem impacto vai depois de quem tem impacto na mesma severidade', () => {
    expect(priorizar([ev({ id: 'x', severidade: 'critico' }), ev({ id: 'y', severidade: 'critico', impactoRs: 1 })]).map((e) => e.id)).toEqual(['y', 'x']);
  });
  it('remove duplicado pelo id (fica o de maior severidade)', () => {
    const r = priorizar([ev({ id: 'u1', severidade: 'atencao' }), ev({ id: 'u1', severidade: 'critico' })]);
    expect(r).toHaveLength(1);
    expect(r[0].severidade).toBe('critico');
  });
});

describe('contarPorSeveridade / topoDaHome', () => {
  it('conta as 5 severidades (zero quando não há)', () => {
    expect(contarPorSeveridade([ev({ severidade: 'critico' }), ev({ severidade: 'critico' }), ev({ severidade: 'info' })]))
      .toEqual({ critico: 2, atencao: 0, acompanhar: 0, oportunidade: 0, info: 1 });
  });
  it('a Home mostra só os N primeiros já priorizados', () => {
    const evs = Array.from({ length: 12 }, (_, i) => ev({ id: String(i), severidade: i % 2 ? 'info' : 'critico' }));
    const top = topoDaHome(evs, 8);
    expect(top).toHaveLength(8);
    expect(top.slice(0, 6).every((e) => e.severidade === 'critico')).toBe(true);
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/cc-central-atencao.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3: implementação**

```ts
// src/modules/dashboard/central-atencao.ts
// Motor ÚNICO da Central de Atenção (spec §7). Puro: recebe eventos já montados
// pelos adaptadores (central-atencao-fontes.ts) e decide a ORDEM. A Home mostra
// só o que tem mais impacto; /atencao mostra tudo.

export type Severidade = 'critico' | 'atencao' | 'acompanhar' | 'oportunidade' | 'info';
export type AreaEvento = 'usinas' | 'comercial' | 'marketing' | 'instalacoes' | 'om' | 'financeiro' | 'clientes';

export interface EventoAtencao {
  id: string;                 // estável: `${fonte}:${chave}` — dedupe
  severidade: Severidade;
  area: AreaEvento;
  titulo: string;             // frase curta em pt-BR simples
  contexto: string;           // "Usinas · há 4 dias"
  impactoRs?: number | null;  // perda/ganho estimado em R$ (ordena dentro da severidade)
  impactoTexto?: string;      // "Perda estimada R$ 164/dia"
  acao: { rotulo: string; href: string };
  desde?: string | null;      // ISO — o mais antigo sobe no empate
}

export const ORDEM_SEVERIDADE: Severidade[] = ['critico', 'atencao', 'acompanhar', 'oportunidade', 'info'];
const PESO: Record<Severidade, number> = { critico: 0, atencao: 1, acompanhar: 2, oportunidade: 3, info: 4 };

function temImpacto(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function priorizar(eventos: EventoAtencao[]): EventoAtencao[] {
  const porId = new Map<string, EventoAtencao>();
  for (const e of eventos) {
    const ja = porId.get(e.id);
    if (!ja || PESO[e.severidade] < PESO[ja.severidade]) porId.set(e.id, e);
  }
  return [...porId.values()].sort((a, b) => {
    const s = PESO[a.severidade] - PESO[b.severidade];
    if (s) return s;
    const ia = temImpacto(a.impactoRs), ib = temImpacto(b.impactoRs);
    if (ia && ib && a.impactoRs !== b.impactoRs) return (b.impactoRs as number) - (a.impactoRs as number);
    if (ia !== ib) return ia ? -1 : 1;
    const da = a.desde ? Date.parse(a.desde) : Number.POSITIVE_INFINITY;
    const db = b.desde ? Date.parse(b.desde) : Number.POSITIVE_INFINITY;
    return da - db;
  });
}

export function contarPorSeveridade(eventos: EventoAtencao[]): Record<Severidade, number> {
  const c: Record<Severidade, number> = { critico: 0, atencao: 0, acompanhar: 0, oportunidade: 0, info: 0 };
  for (const e of eventos) c[e.severidade] += 1;
  return c;
}

export function topoDaHome(eventos: EventoAtencao[], n = 8): EventoAtencao[] {
  return priorizar(eventos).slice(0, n);
}
```

- [ ] **Step 4:** verde. **Step 5:** `git add src/modules/dashboard/central-atencao.ts tests/cc-central-atencao.test.ts && git commit -m "feat(command-center): motor da Central de Atenção (prioridade por severidade e R$)"`.

### Task B2: adaptadores das fontes (puros)

**Files:** Create `src/modules/dashboard/central-atencao-fontes.ts`; Test `tests/cc-central-atencao-fontes.test.ts`.

- [ ] **Step 1: teste falhando**

```ts
import { describe, it, expect } from 'vitest';
import {
  eventosDeUsinas, eventosDePropostas, eventosDeContas, eventosDeManutencao, eventosDeCreditosGd, eventoCertificado,
} from '../src/modules/dashboard/central-atencao-fontes.js';

const AGORA = Date.parse('2026-09-27T14:42:00Z');

describe('usinas', () => {
  const base = { id: 's1', apelido: 'Chácara VP', potencia_kwp: 10, uf: 'DF', ativo: true, geracao_7d_kwh: 70, alertaTexto: 'Sem comunicação há 3 dias', ultima_sincronizacao: '2026-09-24T10:00:00Z' };
  it('urgente → crítico, aviso → atenção, ok/info → nada', () => {
    const r = eventosDeUsinas([
      { ...base, nivel: 'urgente' }, { ...base, id: 's2', nivel: 'aviso' }, { ...base, id: 's3', nivel: 'ok' },
    ], { tarifaRsKwh: null });
    expect(r.map((e) => e.severidade)).toEqual(['critico', 'atencao']);
    expect(r[0]).toMatchObject({ id: 'usina:s1', area: 'usinas', acao: { href: '/dashboard/monitoramento/s1' } });
  });
  it('perda em R$ só com tarifa conhecida (sem tarifa → sem número)', () => {
    const sem = eventosDeUsinas([{ ...base, nivel: 'urgente' }], { tarifaRsKwh: null });
    expect(sem[0].impactoRs).toBeNull();
    const com = eventosDeUsinas([{ ...base, nivel: 'urgente', geracao_7d_kwh: 0 }], { tarifaRsKwh: 1 });
    expect(com[0].impactoRs).toBeGreaterThan(0);
  });
  it('usina inativa não gera evento', () => {
    expect(eventosDeUsinas([{ ...base, nivel: 'urgente', ativo: false }], { tarifaRsKwh: 1 })).toEqual([]);
  });
});

describe('propostas paradas', () => {
  const p = (id: string, criada: string, extra = {}) => ({ id, created_at: criada, revoked: false, cliente_respondeu_at: null, valorTotal: 20000, ...extra });
  it('agrupa em UM evento as propostas sem resposta há mais de 72 h, com o valor em jogo', () => {
    const r = eventosDePropostas([
      p('a', '2026-09-20T12:00:00Z'), p('b', '2026-09-22T12:00:00Z'),
      p('c', '2026-09-27T12:00:00Z'), // recente
      p('d', '2026-09-10T12:00:00Z', { cliente_respondeu_at: '2026-09-11T12:00:00Z' }),
      p('e', '2026-09-10T12:00:00Z', { revoked: true }),
    ], AGORA);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ severidade: 'atencao', area: 'comercial', impactoRs: 40000 });
    expect(r[0].titulo).toBe('2 propostas sem resposta há mais de 72 h');
  });
  it('nenhuma parada → nenhum evento', () => {
    expect(eventosDePropostas([p('c', '2026-09-27T12:00:00Z')], AGORA)).toEqual([]);
  });
});

describe('contas a pagar (alertasDoDia)', () => {
  it('atraso → crítico; hoje → atenção; 3 dias → acompanhar', () => {
    const r = eventosDeContas([
      { contaId: 'x', tipo: 'atraso', dias: 2, texto: 'DAS atrasado' },
      { contaId: 'y', tipo: 'hoje', dias: 0, texto: 'Aluguel vence hoje' },
      { contaId: 'z', tipo: '3d', dias: 3, texto: 'Internet vence em 3 dias' },
    ], new Map([['x', 2418], ['y', 3000], ['z', 150]]));
    expect(r.map((e) => e.severidade)).toEqual(['critico', 'atencao', 'acompanhar']);
    expect(r[0]).toMatchObject({ id: 'conta:x', impactoRs: 2418, acao: { href: '/dashboard/financeiro' } });
  });
});

describe('manutenção vencida', () => {
  it('agrupa as vencidas num evento de atenção', () => {
    const hoje = new Date('2026-09-27T12:00:00Z');
    const r = eventosDeManutencao([{ data_agendada: '2026-09-01' }, { data_agendada: '2026-09-10' }, { data_agendada: '2026-12-01' }], hoje);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ severidade: 'atencao', area: 'om', titulo: '2 manutenções vencidas' });
  });
});

describe('créditos GD a vencer', () => {
  it('cada alerta de vencimento vira "acompanhar"', () => {
    const r = eventosDeCreditosGd([{ instalacao: '937758', clienteNome: 'Socorro', alertaVencimento: '410 kWh vencem em 45 dias' }, { instalacao: '1', clienteNome: 'X', alertaVencimento: null }]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ severidade: 'acompanhar', area: 'clientes', acao: { href: '/dashboard/demonstrativos/937758' } });
  });
});

describe('certificado A1', () => {
  it('≤ 15 dias crítico, ≤ 45 atenção, senão info; sem data → nada', () => {
    expect(eventoCertificado(10)?.severidade).toBe('critico');
    expect(eventoCertificado(40)?.severidade).toBe('atencao');
    expect(eventoCertificado(338)?.severidade).toBe('info');
    expect(eventoCertificado(null)).toBeNull();
  });
});
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: implementação**

```ts
// src/modules/dashboard/central-atencao-fontes.ts
// Adaptadores PUROS: cada fonte do sistema → EventoAtencao. Reusa as regras que
// já existem (classificarSistema já gravou `nivel`; alertasDoDia; statusAgendaItem;
// alertaVencimento dos demonstrativos). Nenhum número inventado: sem tarifa, sem R$.
import type { EventoAtencao } from './central-atencao.js';
import { esperadoDiaKwh } from '../monitoring/classificacao.js';
import { statusAgendaItem } from './manutencao-motor.js';
import type { AlertaVenc } from '../financeiro/alertas-vencimento.js';

const brl0 = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export interface UsinaParaAtencao {
  id: string; apelido: string; potencia_kwp: number | null; uf: string | null; ativo: boolean;
  geracao_7d_kwh: number; nivel: 'urgente' | 'aviso' | 'info' | 'ok'; alertaTexto: string | null;
  ultima_sincronizacao: string | null;
}

export function eventosDeUsinas(rows: UsinaParaAtencao[], o: { tarifaRsKwh: number | null }): EventoAtencao[] {
  const out: EventoAtencao[] = [];
  for (const r of rows) {
    if (!r.ativo || (r.nivel !== 'urgente' && r.nivel !== 'aviso')) continue;
    const esperado = esperadoDiaKwh(r.potencia_kwp, r.uf);
    const perdaKwhDia = esperado > 0 ? Math.max(0, esperado - r.geracao_7d_kwh / 7) : null;
    const impacto = perdaKwhDia !== null && o.tarifaRsKwh !== null ? Math.round(perdaKwhDia * o.tarifaRsKwh) : null;
    out.push({
      id: `usina:${r.id}`,
      severidade: r.nivel === 'urgente' ? 'critico' : 'atencao',
      area: 'usinas',
      titulo: `${r.apelido}: ${r.alertaTexto ?? 'precisa de atenção'}`,
      contexto: 'Usinas · monitoramento',
      impactoRs: impacto,
      impactoTexto: impacto !== null ? `Perda estimada ${brl0(impacto)}/dia` : 'Perda em R$: sem tarifa cadastrada',
      acao: { rotulo: r.nivel === 'urgente' ? 'Abrir usina' : 'Ver usina', href: `/dashboard/monitoramento/${r.id}` },
      desde: r.ultima_sincronizacao,
    });
  }
  return out;
}

export interface PropostaParaAtencao { id: string; created_at: string; revoked: boolean; cliente_respondeu_at: string | null; valorTotal?: number | null }

export function eventosDePropostas(rows: PropostaParaAtencao[], agoraMs: number, horas = 72): EventoAtencao[] {
  const limite = agoraMs - horas * 3600_000;
  const paradas = rows.filter((p) => !p.revoked && !p.cliente_respondeu_at && Date.parse(p.created_at) < limite);
  if (paradas.length === 0) return [];
  const emJogo = paradas.reduce((s, p) => s + (typeof p.valorTotal === 'number' ? p.valorTotal : 0), 0);
  const maisAntiga = paradas.map((p) => p.created_at).sort()[0];
  return [{
    id: 'propostas:paradas-72h',
    severidade: 'atencao',
    area: 'comercial',
    titulo: `${paradas.length} ${paradas.length === 1 ? 'proposta' : 'propostas'} sem resposta há mais de ${horas} h`,
    contexto: 'Comercial · follow-up',
    impactoRs: emJogo > 0 ? emJogo : null,
    impactoTexto: emJogo > 0 ? `${brl0(emJogo)} em jogo` : undefined,
    acao: { rotulo: 'Ver propostas', href: '/dashboard/propostas' },
    desde: maisAntiga,
  }];
}

export function eventosDeContas(alertas: AlertaVenc[], valorPorConta: Map<string, number>): EventoAtencao[] {
  return alertas.map((a) => {
    const valor = valorPorConta.get(a.contaId) ?? null;
    return {
      id: `conta:${a.contaId}`,
      severidade: a.tipo === 'atraso' ? 'critico' : a.tipo === 'hoje' ? 'atencao' : 'acompanhar',
      area: 'financeiro',
      titulo: a.texto,
      contexto: 'Financeiro · contas a pagar',
      impactoRs: valor,
      impactoTexto: valor !== null ? brl0(valor) : undefined,
      acao: { rotulo: 'Pagar', href: '/dashboard/financeiro' },
    } satisfies EventoAtencao;
  });
}

export function eventosDeManutencao(itens: Array<{ data_agendada: string | null }>, hoje: Date): EventoAtencao[] {
  const vencidas = itens.filter((i) => statusAgendaItem(i.data_agendada, hoje) === 'vencida');
  if (vencidas.length === 0) return [];
  return [{
    id: 'manutencao:vencidas',
    severidade: 'atencao',
    area: 'om',
    titulo: `${vencidas.length} ${vencidas.length === 1 ? 'manutenção vencida' : 'manutenções vencidas'}`,
    contexto: 'O&M · preventivas',
    acao: { rotulo: 'Ver agenda', href: '/dashboard/manutencao' },
    desde: vencidas.map((v) => v.data_agendada ?? '').sort()[0] || null,
  }];
}

export function eventosDeCreditosGd(itens: Array<{ instalacao: string; clienteNome: string; alertaVencimento: string | null }>): EventoAtencao[] {
  return itens.filter((i) => i.alertaVencimento).map((i) => ({
    id: `gd:${i.instalacao}`,
    severidade: 'acompanhar' as const,
    area: 'clientes' as const,
    titulo: `${i.clienteNome}: ${i.alertaVencimento}`,
    contexto: 'Demonstrativos GD',
    acao: { rotulo: 'Avisar cliente', href: `/dashboard/demonstrativos/${encodeURIComponent(i.instalacao)}` },
  }));
}

export function eventoCertificado(diasRestantes: number | null): EventoAtencao | null {
  if (diasRestantes === null) return null;
  return {
    id: 'fiscal:certificado-a1',
    severidade: diasRestantes <= 15 ? 'critico' : diasRestantes <= 45 ? 'atencao' : 'info',
    area: 'financeiro',
    titulo: `Certificado A1 vence em ${diasRestantes} dias`,
    contexto: 'Fiscal',
    acao: { rotulo: 'Detalhes', href: '/dashboard/fiscal/config' },
  };
}
```

- [ ] **Step 4:** verde. **Step 5:** commit `feat(command-center): adaptadores das fontes da Central de Atenção`.

### Task B3: consultas escopadas (`command-center-queries.ts`)

**Files:** Create `src/modules/dashboard/command-center-queries.ts`; Test `tests/cc-command-center-queries.test.ts`.

Regra: **toda** consulta leva `.eq('company_id', companyId)` além do RLS (dupla tranca). Consultas da casa (contas a pagar, certificado A1 — tabelas fora da 079) só rodam quando `companyId === ECOSUN_COMPANY_ID`.

- [ ] **Step 1: teste falhando** (cliente falso que registra os filtros)

```ts
import { describe, it, expect } from 'vitest';
import { carregarCommandCenter } from '../src/modules/dashboard/command-center-queries.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const TENANT = 'aaaa1111-2222-3333-4444-555566667777';

function fakeDb(dados: Record<string, unknown[]>) {
  const chamadas: Array<{ tabela: string; filtros: Array<[string, string, unknown]> }> = [];
  const client = {
    from(tabela: string) {
      const reg = { tabela, filtros: [] as Array<[string, string, unknown]> };
      chamadas.push(reg);
      const q: any = {
        select: () => q, order: () => q, limit: () => q,
        eq: (c: string, v: unknown) => { reg.filtros.push(['eq', c, v]); return q; },
        gte: (c: string, v: unknown) => { reg.filtros.push(['gte', c, v]); return q; },
        lt: (c: string, v: unknown) => { reg.filtros.push(['lt', c, v]); return q; },
        in: (c: string, v: unknown) => { reg.filtros.push(['in', c, v]); return q; },
        then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: dados[tabela] ?? [], error: null }).then(ok),
      };
      return q;
    },
  };
  return { client: client as never, chamadas };
}

describe('carregarCommandCenter', () => {
  it('TODA consulta filtra company_id da sessão', async () => {
    const { client, chamadas } = fakeDb({});
    await carregarCommandCenter(client, TENANT, new Date('2026-09-27T14:42:00Z'));
    expect(chamadas.length).toBeGreaterThan(0);
    for (const c of chamadas) expect(c.filtros, c.tabela).toContainEqual(['eq', 'company_id', TENANT]);
  });

  it('tenant não consulta tabelas da casa (contas a pagar)', async () => {
    const { client, chamadas } = fakeDb({});
    await carregarCommandCenter(client, TENANT, new Date());
    expect(chamadas.map((c) => c.tabela)).not.toContain('financeiro_contas_a_pagar');
  });

  it('conta leads/propostas/vendas do mês e soma a potência das usinas ativas', async () => {
    const { client } = fakeDb({
      leads: [{ id: 1, status: 'novo' }, { id: 2, status: 'contrato_assinado' }],
      propostas_publicas: [{ id: 'p', created_at: '2026-09-10T00:00:00Z', revoked: false, cliente_respondeu_at: null, dados_input: null }],
      sistemas_clientes: [{ id: 's', apelido: 'A', potencia_kwp: 6.2, ativo: true }, { id: 't', apelido: 'B', potencia_kwp: 3.8, ativo: true }],
    });
    const r = await carregarCommandCenter(client, ECOSUN, new Date('2026-09-27T14:42:00Z'));
    expect(r.kpis.leadsMes).toBe(2);
    expect(r.kpis.propostasMes).toBe(1);
    expect(r.kpis.potenciaKwp).toBeCloseTo(10);
    expect(r.kpis.usinasAtivas).toBe(2);
  });

  it('erro numa fonte vira null naquele número (não derruba a tela)', async () => {
    const client = { from() { throw new Error('caiu'); } } as never;
    const r = await carregarCommandCenter(client, ECOSUN, new Date());
    expect(r.kpis.leadsMes).toBeNull();
    expect(r.eventos).toEqual([]);
  });
});
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3: implementação** — `carregarCommandCenter(db, companyId, agora)` devolve `{ kpis: { leadsMes, propostasMes, vendasMes, potenciaKwp, usinasAtivas, usinasForaDoAr, energiaHojeKwh, energiaMesKwh }, eventos: EventoAtencao[] }`, cada leitura num `try/catch` próprio que devolve `null`/`[]` (sem dado = "—"). Fontes: `leads` (created_at ≥ início do mês em Brasília), `propostas_publicas` (idem + lista das últimas 200 para `eventosDePropostas`), `sistemas_clientes` + `geracao_diaria` (dia/mês), `manutencoes` (agenda), `demonstrativos_gd` via `demonstrativos-tela-repo` já escopado, e — só EcoSun — `financeiro_contas_a_pagar` (`alertasDoDia`) e o certificado A1 (`alerta-certificado.ts`). Todas com `.eq('company_id', companyId)`.
- [ ] **Step 4:** verde. **Step 5:** commit `feat(command-center): consultas do Command Center escopadas por empresa`.

### Task B4: tela com dado real + rota aberta ao tenant

**Files:** Modify `command-center-views.ts`, `router.ts`, `menu-areas.ts`; Test `tests/cc-command-center-view.test.ts` (novos casos).

- [ ] **Step 1: testes novos** — `CommandCenterDados` ganha `kpis` (B3) e `eventos`; a faixa mostra energia/potência/usinas reais; a Central de Atenção lista `topoDaHome(eventos, 8)` com a classe da severidade (`cc-ev cc-ev-critico`), o impacto e o botão de ação (href do evento, escapado); a legenda conta por severidade (`Crítico <b>2</b>`); "Ver os N" leva a `/dashboard/atencao`; lista vazia → estado "Tudo em dia por aqui" (não "em construção"). Números do protótipo continuam proibidos.
- [ ] **Step 3:** substituir os blocos "em construção" que agora têm fonte; o que ainda não tem (curva real × esperada intradiária, mapa) continua "em construção". Rota: tirar o redirect do tenant e trocar `fetchDashboardKpis` por `carregarCommandCenter(bancoDoOperador(req, supabase), user.companyId, agora)`. Menu: item `command_center` ganha `area: 'relatorios'` (tenant sem o módulo vê pela vitrine).
- [ ] **Step 4:** `npx vitest run` + print novo. **Step 5:** commit.

### Task B5: `/dashboard/atencao` (lista completa)

- [ ] **Step 1: teste** `renderCentralAtencaoPage({ eventos, filtro: { area?, severidade? } })`: trilha "Command Center › Central de Atenção"; filtros por área e severidade (links `?area=`), contagem por severidade, tabela com todos os eventos priorizados; filtro com valor desconhecido é ignorado.
- [ ] **Step 3:** view + rota `GET /atencao` (mesma carga do B3) + item `atencao` no grupo Command Center.
- [ ] **Step 5:** commit.

### Task B6: selos do menu com número real

- [ ] Selos só nas telas do Command Center e da Central (onde a carga já existe): `selos: { usinas: {valor: críticos+atenção de usinas, tom:'critico'}, comercial: {...}, om: {...} }`. Selos em TODAS as telas ficam para depois (exigem cache por empresa de ~60 s — anotar no roteiro).

---

## Fases C–I (roteiro — detalhar num plano próprio quando a fase anterior sair)

| Fase | Primeiro passo (TDD) | Reuso |
|---|---|---|
| **C · Usinas** | `perdaRsDia(usina, tarifa)` puro + ordenação por criticidade × perda; tabela da frota com `tabela()` | `monitoring/usinas-queries.ts`, `classificacao.ts`, `solar-params.ts` |
| **D · Clientes** | `montarFicha360(lead, usinas, propostas, docs)` puro; portal com token assinado | `clientes-queries.ts`, `pasta-da-empresa.ts`, `garantia.ts` |
| **E · Comercial/Marketing** | funil Novo→Pós-venda a partir de `pipeline.ts`; atribuição campanha→contrato | `bi-*.ts`, `metricas-vendas.ts`, `marketing-queries.ts` |
| **F · Instalações/O&M** | SLA por etapa da obra (`usina-etapas.ts`); prioridade O&M = energia + R$ + tempo + SLA | `usinas-kanban-views.ts`, `manutencao-motor.ts`, `os-queries.ts` |
| **G · Financeiro/Relatórios** | hub `/relatorios` (grupo aparece no menu) | `financeiro-queries.ts`, `relatorios/`, `demonstrativos-views.ts` |
| **H · IA · Eva** | tabela `resumos_diarios` (migration — combinar número) + gerador 1×/dia com fonte de cada frase | `ai-summary.ts`, `lead-synthesis.ts`, `eva-alerts.ts` |
| **I · Modo TV** | rotação 30 s entre 3 vistas, token de TV por empresa | componentes da fase A |
