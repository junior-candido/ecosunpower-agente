# Eva Follow-up Vivo (fatia 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda proposta enviada ao cliente passa a ter um follow-up persistente e sem fim (D0 → mensal), com guarda de horário, respeito a opt-out/takeover, retomada após silêncio e toque pós-visita 24 h — sem alterar como o Junior precifica hoje.

**Architecture:** Duas tabelas novas (`proposta_followup_vivo`, `visitas`) alimentam um serviço `FollowupVivoService` com funções puras testáveis (planejador de etapas, guarda de horário, elegibilidade) e um processador chamado por `setInterval` em `index.ts`, no mesmo padrão de `eva_cadence`. Mensagens: fatos (economia, link, validade) vêm dos dados da proposta; a IA (Haiku) só redige; fora da janela 24 h vai template aprovado. Nada de `setTimeout` em memória.

**Tech Stack:** TypeScript (ESM, imports `.js`), Express, Supabase (Postgres), ioredis, Anthropic SDK (Haiku `claude-haiku-4-5-20251001`), vitest 4.

**Spec:** `docs/superpowers/specs/2026-08-21-eva-vendedora-autonoma-design.md` §6 (follow-up vivo), §2 (regras 4–6), §8, §9.

---

## Mapa de arquivos

| Ação | Arquivo | Responsabilidade |
|---|---|---|
| Create | `supabase/migrations/101_proposta_followup_vivo.sql` | tabela de etapas do follow-up |
| Create | `supabase/migrations/102_visitas.sql` | persistência de visita/meet |
| Create | `src/modules/vendas/followup-vivo-plano.ts` | **puro**: etapas, planejador, guarda de horário, elegibilidade |
| Create | `src/modules/vendas/followup-vivo-mensagem.ts` | **puro + IA**: contexto factual da etapa → texto (Haiku) / template |
| Create | `src/modules/vendas/followup-vivo.ts` | `FollowupVivoService`: agenda, processa, pausa, retoma, cancela |
| Create | `src/modules/vendas/visitas.ts` | `VisitasService`: registra visita, processa pós-visita 24 h |
| Modify | `src/modules/supabase.ts` | nada (serviços usam `getClient()` direto, como `reengagement-cadence.ts`) |
| Modify | `src/index.ts` | wiring: instâncias, 3 ganchos (envio, resposta, visita), 1 `setInterval` |
| Test | `tests/followup-vivo-plano.test.ts`, `tests/followup-vivo-mensagem.test.ts`, `tests/followup-vivo-service.test.ts`, `tests/visitas.test.ts` | |

Convenções do repo: testes em `tests/*.test.ts`, sem `vi.mock` de módulo — deps injetadas no construtor, supabase falso com `from()` retornando chain; tempo **injetado** (`agoraMs`), não fake timers. Logs `console.*` com prefixo `[followup-vivo]`; IA medida com `medirIa`. Migrations: 3 dígitos; **⚠️ combinar os números 101/102 no grupo do WhatsApp antes de aplicar (regra do CLAUDE.md).**

---

### Task 1: Migrations

**Files:**
- Create: `supabase/migrations/101_proposta_followup_vivo.sql`
- Create: `supabase/migrations/102_visitas.sql`

- [ ] **Step 1: Escrever a migration do follow-up vivo**

```sql
-- 101_proposta_followup_vivo.sql
-- Follow-up sem fim por proposta (spec 2026-08-21 §6). Uma linha por etapa agendada.
CREATE TABLE IF NOT EXISTS public.proposta_followup_vivo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_slug   text NOT NULL REFERENCES public.propostas_publicas(slug) ON DELETE CASCADE,
  lead_id         uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  etapa           text NOT NULL,            -- D0 | A2H | NA24 | D3 | D5 | D8 | D12 | D20 | D35 | D60 | D90 | M1..Mn | POS_VISITA
  scheduled_for   timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'pending', -- pending | sending | sent | paused | cancelled | failed
  sent_at         timestamptz,
  message_sent    text,
  cancelled_reason text,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposta_slug, etapa)
);
CREATE INDEX IF NOT EXISTS idx_pfv_due ON public.proposta_followup_vivo (scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pfv_lead ON public.proposta_followup_vivo (lead_id);
```

- [ ] **Step 2: Escrever a migration de visitas**

```sql
-- 102_visitas.sql
-- Visita técnica / meet agendada pela Eva ou pelo Junior. Base do toque pós-visita (spec §6).
CREATE TABLE IF NOT EXISTS public.visitas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  phone             text NOT NULL,
  tipo              text NOT NULL DEFAULT 'visita',   -- visita | meet
  inicio            timestamptz NOT NULL,
  fim               timestamptz NOT NULL,
  calendar_event_id text,
  resultado         text,                              -- null | fechou | followup_enviado | cancelada
  pos_visita_em     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_visitas_pendentes ON public.visitas (fim) WHERE resultado IS NULL;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/101_proposta_followup_vivo.sql supabase/migrations/102_visitas.sql
git commit -m "feat(followup-vivo): migrations 101 (etapas) e 102 (visitas)"
```

---

### Task 2: Planejador puro — etapas, horário, elegibilidade

**Files:**
- Create: `src/modules/vendas/followup-vivo-plano.ts`
- Test: `tests/followup-vivo-plano.test.ts`

- [ ] **Step 1: Escrever os testes (falhando)**

```ts
// tests/followup-vivo-plano.test.ts
import { describe, it, expect } from 'vitest';
import {
  ETAPAS_FIXAS, planejarEtapas, proximoHorarioValido, dentroDoHorario,
  elegivelParaFollowup, proximaEtapaMensal,
} from '../src/modules/vendas/followup-vivo-plano.js';

// 2026-08-24 é segunda-feira. 12:00 BRT = 15:00Z
const SEG_12H_BRT = Date.UTC(2026, 7, 24, 15, 0, 0);

describe('planejarEtapas', () => {
  it('gera as etapas fixas a partir do envio, todas em horário válido', () => {
    const etapas = planejarEtapas(SEG_12H_BRT);
    expect(etapas.map(e => e.etapa)).toEqual(['NA24', 'D3', 'D5', 'D8', 'D12', 'D20', 'D35', 'D60', 'D90', 'M1']);
    for (const e of etapas) expect(dentroDoHorario(e.scheduledForMs)).toBe(true);
  });
  it('D3 cai 3 dias depois do envio (mesmo horário, se válido)', () => {
    const d3 = planejarEtapas(SEG_12H_BRT).find(e => e.etapa === 'D3')!;
    expect(d3.scheduledForMs).toBe(SEG_12H_BRT + 3 * 86_400_000);
  });
  it('M1 é 30 dias após D90; proximaEtapaMensal encadeia M2, M3…', () => {
    const m1 = planejarEtapas(SEG_12H_BRT).find(e => e.etapa === 'M1')!;
    expect(m1.scheduledForMs).toBe(proximoHorarioValido(SEG_12H_BRT + 120 * 86_400_000));
    expect(proximaEtapaMensal('M1')).toBe('M2');
    expect(proximaEtapaMensal('M7')).toBe('M8');
    expect(proximaEtapaMensal('D90')).toBe('M1');
  });
});

describe('dentroDoHorario / proximoHorarioValido (8h–20h BRT, nunca domingo)', () => {
  it('21h BRT de segunda → empurra pra terça 8h', () => {
    const seg21 = Date.UTC(2026, 7, 25, 0, 0, 0); // 24/08 21:00 BRT
    expect(dentroDoHorario(seg21)).toBe(false);
    expect(proximoHorarioValido(seg21)).toBe(Date.UTC(2026, 7, 25, 11, 0, 0)); // 25/08 08:00 BRT
  });
  it('sábado 19h ok; domingo qualquer hora → segunda 8h', () => {
    const sab19 = Date.UTC(2026, 7, 29, 22, 0, 0);
    expect(dentroDoHorario(sab19)).toBe(true);
    const dom10 = Date.UTC(2026, 7, 30, 13, 0, 0);
    expect(dentroDoHorario(dom10)).toBe(false);
    expect(proximoHorarioValido(dom10)).toBe(Date.UTC(2026, 7, 31, 11, 0, 0));
  });
  it('7h59 BRT → 8h do mesmo dia', () => {
    const seg0759 = Date.UTC(2026, 7, 24, 10, 59, 0);
    expect(proximoHorarioValido(seg0759)).toBe(Date.UTC(2026, 7, 24, 11, 0, 0));
  });
});

describe('elegivelParaFollowup', () => {
  const base = { eva_active: true, opt_out: false, status: 'proposta_enviada', contact_type: 'cliente' };
  it('lead normal sem takeover → elegível', () => {
    expect(elegivelParaFollowup(base, false)).toEqual({ ok: true });
  });
  it.each([
    [{ ...base, eva_active: false }, 'eva_off'],
    [{ ...base, opt_out: true }, 'opt_out'],
    [{ ...base, status: 'perdido' }, 'status_perdido'],
    [{ ...base, status: 'ganho' }, 'status_ganho'],
    [{ ...base, contact_type: 'inviavel' }, 'inviavel'],
  ])('bloqueia %o → %s', (lead, motivo) => {
    expect(elegivelParaFollowup(lead, false)).toEqual({ ok: false, motivo });
  });
  it('takeover do Junior → bloqueia com motivo takeover', () => {
    expect(elegivelParaFollowup(base, true)).toEqual({ ok: false, motivo: 'takeover' });
  });
});

describe('ETAPAS_FIXAS', () => {
  it('tem o argumento de cada etapa (spec §6)', () => {
    expect(ETAPAS_FIXAS.find(e => e.etapa === 'D5')!.argumento).toBe('financiamento');
    expect(ETAPAS_FIXAS.find(e => e.etapa === 'D8')!.argumento).toBe('prova_social');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/followup-vivo-plano.test.ts`
Expected: FAIL — `Cannot find module '../src/modules/vendas/followup-vivo-plano.js'`

- [ ] **Step 3: Implementar o planejador**

```ts
// src/modules/vendas/followup-vivo-plano.ts
// Funções PURAS do follow-up vivo (spec 2026-08-21 §6). Sem IO, sem Date.now() — tempo sempre injetado.

export type Argumento =
  | 'resumo' | 'duvida_ab' | 'reenvio_audio' | 'economia' | 'financiamento'
  | 'prova_social' | 'validade' | 'toque_leve' | 'pos_visita';

export interface EtapaDef { etapa: string; offsetMs: number; argumento: Argumento }

const DIA = 86_400_000;
const HORA = 3_600_000;

/** Etapas relativas ao ENVIO da proposta. A2H (abriu e não respondeu) e D0 são disparadas por evento, não pelo plano. */
export const ETAPAS_FIXAS: EtapaDef[] = [
  { etapa: 'NA24', offsetMs: 24 * HORA, argumento: 'reenvio_audio' },
  { etapa: 'D3',   offsetMs: 3 * DIA,   argumento: 'economia' },
  { etapa: 'D5',   offsetMs: 5 * DIA,   argumento: 'financiamento' },
  { etapa: 'D8',   offsetMs: 8 * DIA,   argumento: 'prova_social' },
  { etapa: 'D12',  offsetMs: 12 * DIA,  argumento: 'validade' },
  { etapa: 'D20',  offsetMs: 20 * DIA,  argumento: 'toque_leve' },
  { etapa: 'D35',  offsetMs: 35 * DIA,  argumento: 'toque_leve' },
  { etapa: 'D60',  offsetMs: 60 * DIA,  argumento: 'toque_leve' },
  { etapa: 'D90',  offsetMs: 90 * DIA,  argumento: 'toque_leve' },
  { etapa: 'M1',   offsetMs: 120 * DIA, argumento: 'toque_leve' },
];
export const INTERVALO_MENSAL_MS = 30 * DIA;
export const ARGUMENTO_POR_ETAPA: Record<string, Argumento> = Object.fromEntries(
  ETAPAS_FIXAS.map(e => [e.etapa, e.argumento]),
);
export function argumentoDaEtapa(etapa: string): Argumento {
  if (etapa === 'A2H') return 'duvida_ab';
  if (etapa === 'D0') return 'resumo';
  if (etapa === 'POS_VISITA') return 'pos_visita';
  if (/^M\d+$/.test(etapa)) return 'toque_leve';
  return ARGUMENTO_POR_ETAPA[etapa] ?? 'toque_leve';
}

export function proximaEtapaMensal(etapaAtual: string): string {
  const m = /^M(\d+)$/.exec(etapaAtual);
  if (m) return `M${Number(m[1]) + 1}`;
  return 'M1';
}

// ---- horário comercial: 8h–20h BRT (UTC-3), nunca domingo ----
const BRT_OFFSET_MS = -3 * HORA;
function brtParts(ms: number) {
  const d = new Date(ms + BRT_OFFSET_MS);
  return { hora: d.getUTCHours(), diaSemana: d.getUTCDay(), inicioDiaMs: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - BRT_OFFSET_MS };
}
export function dentroDoHorario(ms: number): boolean {
  const { hora, diaSemana } = brtParts(ms);
  return diaSemana !== 0 && hora >= 8 && hora < 20;
}
/** Menor instante >= ms que esteja dentro do horário. */
export function proximoHorarioValido(ms: number): number {
  let t = ms;
  for (let i = 0; i < 10; i++) {
    const { hora, diaSemana, inicioDiaMs } = brtParts(t);
    if (diaSemana === 0) { t = inicioDiaMs + DIA + 8 * HORA; continue; }
    if (hora < 8) { t = inicioDiaMs + 8 * HORA; continue; }
    if (hora >= 20) { t = inicioDiaMs + DIA + 8 * HORA; continue; }
    return t;
  }
  return t;
}

export interface EtapaPlanejada { etapa: string; scheduledForMs: number; argumento: Argumento }
export function planejarEtapas(enviadaEmMs: number): EtapaPlanejada[] {
  return ETAPAS_FIXAS.map(e => ({
    etapa: e.etapa,
    scheduledForMs: proximoHorarioValido(enviadaEmMs + e.offsetMs),
    argumento: e.argumento,
  }));
}

// ---- elegibilidade (spec §2 regras 3–5; predicado do mapa técnico §5) ----
export interface LeadFlags { eva_active?: boolean | null; opt_out?: boolean | null; status?: string | null; contact_type?: string | null }
const STATUS_BLOQUEADOS: Record<string, string> = {
  descartado: 'status_descartado', perdido: 'status_perdido', inativo: 'status_inativo',
  transferido: 'status_transferido', ganho: 'status_ganho',
};
export type Elegibilidade = { ok: true } | { ok: false; motivo: string };
export function elegivelParaFollowup(lead: LeadFlags, emTakeover: boolean): Elegibilidade {
  if (lead.eva_active === false) return { ok: false, motivo: 'eva_off' };
  if (lead.opt_out === true) return { ok: false, motivo: 'opt_out' };
  if (lead.contact_type === 'inviavel') return { ok: false, motivo: 'inviavel' };
  const st = lead.status ? STATUS_BLOQUEADOS[lead.status] : undefined;
  if (st) return { ok: false, motivo: st };
  if (emTakeover) return { ok: false, motivo: 'takeover' };
  return { ok: true };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/followup-vivo-plano.test.ts`
Expected: PASS (todos)

- [ ] **Step 5: Commit**

```bash
git add src/modules/vendas/followup-vivo-plano.ts tests/followup-vivo-plano.test.ts
git commit -m "feat(followup-vivo): planejador puro de etapas, guarda 8h-20h sem domingo, elegibilidade"
```

---

### Task 3: Mensagem da etapa — fatos da proposta + redação (Haiku) + template

**Files:**
- Create: `src/modules/vendas/followup-vivo-mensagem.ts`
- Test: `tests/followup-vivo-mensagem.test.ts`

Princípio (spec §2.1): números só vêm de `dados_input` da proposta; a IA recebe os fatos prontos e só escreve. Se não houver fato (ex.: economia ausente), o argumento degrada para `toque_leve`.

- [ ] **Step 1: Testes (falhando)**

```ts
// tests/followup-vivo-mensagem.test.ts
import { describe, it, expect, vi } from 'vitest';
import { montarFatos, montarPromptEtapa, gerarMensagemEtapa } from '../src/modules/vendas/followup-vivo-mensagem.js';

const proposta = {
  cliente_nome: 'Joel Lima Peres', slug: 'joel-lima-peres', created_at: '2026-08-18T12:00:00Z',
  dados_input: { economiaMensal: 743, valorTotal: 19200, potenciaKwp: 8.58, parcela18x: 1195.4, cidade: 'Brasília' },
};
const ctx = { linkProposta: 'https://ecosunpower.eng.br/p/joel-lima-peres', validadeKitDias: 15, agoraMs: Date.parse('2026-08-21T15:00:00Z') };

describe('montarFatos', () => {
  it('extrai economia, total, kWp, parcela e validade restante', () => {
    const f = montarFatos(proposta, ctx);
    expect(f.primeiroNome).toBe('Joel');
    expect(f.economiaMensal).toBe(743);
    expect(f.valorTotal).toBe(19200);
    expect(f.parcela18x).toBe(1195.4);
    expect(f.diasRestantesValidade).toBe(12); // 15 - 3 dias desde created_at
    expect(f.link).toBe(ctx.linkProposta);
  });
  it('sem economia → argumento economia vira toque_leve', () => {
    const f = montarFatos({ ...proposta, dados_input: {} }, ctx);
    expect(montarPromptEtapa('economia', f, null).argumentoEfetivo).toBe('toque_leve');
  });
});

describe('montarPromptEtapa', () => {
  it('financiamento cita a parcela exata e proíbe desconto', () => {
    const f = montarFatos(proposta, ctx);
    const p = montarPromptEtapa('financiamento', f, null);
    expect(p.prompt).toContain('R$ 1.195,40');
    expect(p.prompt).toMatch(/nunca ofere[çc]a desconto/i);
    expect(p.prompt).toMatch(/n[ãa]o invente n[úu]meros/i);
  });
  it('prova_social inclui o caso quando houver', () => {
    const f = montarFatos(proposta, ctx);
    const p = montarPromptEtapa('prova_social', f, { titulo: 'Residencial Lago Sul', cidade: 'Brasília', kwp: 9.2, fotoUrl: 'https://x/y.jpg' });
    expect(p.prompt).toContain('Residencial Lago Sul');
    expect(p.fotoUrl).toBe('https://x/y.jpg');
  });
});

describe('gerarMensagemEtapa', () => {
  it('usa a IA injetada e devolve o texto limpo', async () => {
    const ia = vi.fn().mockResolvedValue('  Oi Joel! Vi que a proposta ficou em R$ 1.195,40/mês em 18x.  ');
    const f = montarFatos(proposta, ctx);
    const out = await gerarMensagemEtapa('financiamento', f, null, ia);
    expect(ia).toHaveBeenCalledOnce();
    expect(out.texto).toBe('Oi Joel! Vi que a proposta ficou em R$ 1.195,40/mês em 18x.');
    expect(out.argumentoEfetivo).toBe('financiamento');
  });
  it('IA falha → fallback determinístico com o link', async () => {
    const ia = vi.fn().mockRejectedValue(new Error('boom'));
    const f = montarFatos(proposta, ctx);
    const out = await gerarMensagemEtapa('toque_leve', f, null, ia);
    expect(out.texto).toContain('Joel');
    expect(out.texto).toContain(ctx.linkProposta);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/followup-vivo-mensagem.test.ts`
Expected: FAIL — módulo não existe

- [ ] **Step 3: Implementar**

```ts
// src/modules/vendas/followup-vivo-mensagem.ts
import type { Argumento } from './followup-vivo-plano.js';
import { primeiroNome } from '../template-inicial.js';

export interface PropostaParaMensagem {
  cliente_nome: string; slug: string; created_at: string;
  dados_input: Record<string, unknown> | null;
}
export interface ContextoMensagem { linkProposta: string; validadeKitDias: number; agoraMs: number }
export interface Fatos {
  primeiroNome: string; link: string;
  economiaMensal: number | null; valorTotal: number | null; potenciaKwp: number | null;
  parcela18x: number | null; cidade: string | null; diasRestantesValidade: number;
}
export interface CasoSimilar { titulo: string; cidade: string; kwp?: number; fotoUrl?: string }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const brl = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function montarFatos(p: PropostaParaMensagem, ctx: ContextoMensagem): Fatos {
  const d = p.dados_input ?? {};
  const diasDesde = Math.floor((ctx.agoraMs - Date.parse(p.created_at)) / 86_400_000);
  return {
    primeiroNome: primeiroNome(p.cliente_nome),
    link: ctx.linkProposta,
    economiaMensal: num(d.economiaMensal), valorTotal: num(d.valorTotal),
    potenciaKwp: num(d.potenciaKwp), parcela18x: num(d.parcela18x),
    cidade: typeof d.cidade === 'string' ? d.cidade : null,
    diasRestantesValidade: Math.max(0, ctx.validadeKitDias - diasDesde),
  };
}

const REGRAS = `Você é a Eva, consultora da EcoSunPower (Brasília/Goiás), escrevendo no WhatsApp.
Regras inegociáveis: NÃO invente números — use só os fatos abaixo, exatamente como estão; NUNCA ofereça desconto, brinde ou condição nova;
máximo 4 linhas, sem emoji em excesso (no máximo 1), tom de gente, sem "Prezado", sem assinatura. Termine com UMA pergunta simples.`;

function fatosTexto(f: Fatos): string {
  const l = [`Nome do cliente: ${f.primeiroNome}`, `Link da proposta: ${f.link}`];
  if (f.potenciaKwp) l.push(`Sistema: ${f.potenciaKwp.toLocaleString('pt-BR')} kWp`);
  if (f.valorTotal) l.push(`Investimento: ${brl(f.valorTotal)}`);
  if (f.economiaMensal) l.push(`Economia estimada: ${brl(f.economiaMensal)} por mês`);
  if (f.parcela18x) l.push(`Parcela em 18x no cartão: ${brl(f.parcela18x)}`);
  l.push(`Validade do preço do kit: ${f.diasRestantesValidade} dias`);
  return l.join('\n');
}

const OBJETIVO: Record<Argumento, string> = {
  resumo: 'Apresentar a proposta em 3 linhas e convidar a abrir o link.',
  duvida_ab: 'O cliente abriu a proposta e não respondeu. Perguntar se ficou dúvida na opção A ou B.',
  reenvio_audio: 'O cliente não abriu em 24 h. Reenviar o link de forma curta e oferecer explicar por áudio em 1 minuto.',
  economia: 'Mostrar a economia mensal concreta (a conta de luz praticamente some) e perguntar se faz sentido.',
  financiamento: 'Mostrar que cabe no bolso: citar a parcela em 18x exatamente como nos fatos.',
  prova_social: 'Contar de uma obra parecida na região (dados do caso abaixo) e perguntar se quer ver mais fotos.',
  validade: 'Avisar com leveza que o preço do kit tem validade (dias restantes nos fatos) e perguntar se quer garantir.',
  toque_leve: 'Toque leve e educado: perguntar se ainda faz sentido pensar em energia solar agora; sem pressão.',
  pos_visita: 'O Junior esteve no imóvel ontem. Perguntar se ficou alguma dúvida depois da visita e se pode ajudar com algo.',
};

export function montarPromptEtapa(argumento: Argumento, f: Fatos, caso: CasoSimilar | null) {
  let efetivo: Argumento = argumento;
  if (argumento === 'economia' && !f.economiaMensal) efetivo = 'toque_leve';
  if (argumento === 'financiamento' && !f.parcela18x) efetivo = 'toque_leve';
  if (argumento === 'prova_social' && !caso) efetivo = 'toque_leve';
  if (argumento === 'validade' && f.diasRestantesValidade === 0) efetivo = 'toque_leve';
  const casoTxt = caso ? `\nCaso parecido: ${caso.titulo} em ${caso.cidade}${caso.kwp ? ` (${caso.kwp} kWp)` : ''}` : '';
  const prompt = `${REGRAS}\n\nOBJETIVO DESTA MENSAGEM: ${OBJETIVO[efetivo]}\n\nFATOS (use apenas estes):\n${fatosTexto(f)}${casoTxt}\n\nEscreva só a mensagem.`;
  return { prompt, argumentoEfetivo: efetivo, fotoUrl: efetivo === 'prova_social' ? caso?.fotoUrl ?? null : null };
}

export type RedatorIA = (prompt: string) => Promise<string>;

export async function gerarMensagemEtapa(argumento: Argumento, f: Fatos, caso: CasoSimilar | null, ia: RedatorIA) {
  const { prompt, argumentoEfetivo, fotoUrl } = montarPromptEtapa(argumento, f, caso);
  try {
    const texto = (await ia(prompt)).trim();
    if (texto.length >= 10) return { texto, argumentoEfetivo, fotoUrl };
  } catch (err) {
    console.warn('[followup-vivo] IA falhou, usando fallback:', (err as Error).message);
  }
  return {
    texto: `Oi ${f.primeiroNome}, tudo bem? Passando pra saber se ainda faz sentido conversar sobre a proposta: ${f.link}\nPosso te ajudar com alguma dúvida?`,
    argumentoEfetivo, fotoUrl,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/followup-vivo-mensagem.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/vendas/followup-vivo-mensagem.ts tests/followup-vivo-mensagem.test.ts
git commit -m "feat(followup-vivo): mensagem por etapa — fatos da proposta + redação IA com fallback"
```

---

### Task 4: `FollowupVivoService` — agendar, processar, pausar, retomar, cancelar

**Files:**
- Create: `src/modules/vendas/followup-vivo.ts`
- Test: `tests/followup-vivo-service.test.ts`

Contrato com o resto do sistema:
- `agendarParaProposta({ slug, leadId, enviadaEmMs })` — cria as etapas fixas (upsert `onConflict: 'proposta_slug,etapa'`), cancela `eva_cadence` e `reengagement_touches` do lead (evita duas cadências falando).
- `agendarAbriuSemResposta(slug)` — cria `A2H` para +2 h (chamado do `triggerOnView` com `acessosAntes===0`).
- `processarDevidos(agoraMs)` — varre pendentes vencidas (lote 30), checa horário + elegibilidade, gera texto, envia (texto se janela aberta; template se fechada), marca `sent`; em `M*` agenda a próxima mensal.
- `pausarPorResposta(telefone)` — `pending → paused` em todas as propostas do telefone (a conversa normal assume).
- `retomarSilenciosas(agoraMs)` — `paused → pending` quando a última mensagem da conversa é da Eva há ≥ 48 h (re-arma na próxima etapa).
- `cancelar(slug | leadId, motivo)` — `pending/paused → cancelled` (fechou, perdeu, opt-out, takeover).

- [ ] **Step 1: Testes (falhando)** — supabase falso gravando em memória

```ts
// tests/followup-vivo-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FollowupVivoService } from '../src/modules/vendas/followup-vivo.js';

type Row = Record<string, any>;
function fakeDb() {
  const tabelas: Record<string, Row[]> = { proposta_followup_vivo: [], eva_cadence: [], reengagement_touches: [], propostas_publicas: [], leads: [], conversations: [] };
  const from = (t: string) => {
    const rows = tabelas[t];
    const q: any = { _f: [] as Array<(r: Row) => boolean>, _order: null as null | [string, boolean], _limit: Infinity, _sel: null as null | string };
    const ap = () => rows.filter(r => q._f.every((f: any) => f(r)));
    q.select = (s?: string) => { q._sel = s ?? null; return q; };
    q.eq = (k: string, v: any) => { q._f.push((r: Row) => r[k] === v); return q; };
    q.is = (k: string, v: any) => { q._f.push((r: Row) => r[k] == v); return q; };
    q.in = (k: string, vs: any[]) => { q._f.push((r: Row) => vs.includes(r[k])); return q; };
    q.lte = (k: string, v: any) => { q._f.push((r: Row) => r[k] <= v); return q; };
    q.lt = (k: string, v: any) => { q._f.push((r: Row) => r[k] < v); return q; };
    q.order = (k: string, o?: any) => { q._order = [k, !!o?.ascending]; return q; };
    q.limit = (n: number) => { q._limit = n; return q; };
    q.maybeSingle = async () => ({ data: ap()[0] ?? null, error: null });
    q.single = q.maybeSingle;
    q.then = (res: any) => { let d = ap(); if (q._order) d = [...d].sort((a, b) => (a[q._order![0]] < b[q._order![0]] ? -1 : 1) * (q._order![1] ? 1 : -1)); return Promise.resolve({ data: d.slice(0, q._limit), error: null }).then(res); };
    q.upsert = async (list: Row[] | Row, opts?: any) => {
      for (const r of Array.isArray(list) ? list : [list]) {
        const keys = (opts?.onConflict ?? 'id').split(',');
        const i = rows.findIndex(x => keys.every((k: string) => x[k] === r[k]));
        if (i >= 0) rows[i] = { ...rows[i], ...r }; else rows.push({ id: `id${rows.length + 1}`, ...r });
      }
      return { error: null };
    };
    q.insert = q.upsert;
    q.update = (patch: Row) => { const u: any = { _f: [...q._f] }; u.eq = (k: string, v: any) => { u._f.push((r: Row) => r[k] === v); return u; }; u.in = (k: string, vs: any[]) => { u._f.push((r: Row) => vs.includes(r[k])); return u; }; u.select = () => u; u.then = (res: any) => { const hit = rows.filter(r => u._f.every((f: any) => f(r))); hit.forEach(r => Object.assign(r, patch)); return Promise.resolve({ data: hit, error: null }).then(res); }; return u; };
    return q;
  };
  return { tabelas, client: { from } };
}

const T0 = Date.UTC(2026, 7, 24, 15, 0, 0); // seg 12:00 BRT
const mk = (db: ReturnType<typeof fakeDb>, extra: Partial<ConstructorParameters<typeof FollowupVivoService>[0]> = {}) =>
  new FollowupVivoService({
    client: db.client as any,
    sendText: vi.fn().mockResolvedValue(undefined),
    sendTemplate: vi.fn().mockResolvedValue({ templateUsado: 'reativacao_lead_v1' }),
    janela24hAberta: vi.fn().mockResolvedValue(true),
    emTakeover: vi.fn().mockResolvedValue(false),
    redator: vi.fn().mockResolvedValue('Oi Joel, ainda faz sentido? https://x/p/joel'),
    buscarCasoSimilar: vi.fn().mockResolvedValue(null),
    proposalBaseUrl: 'https://x/p',
    validadeKitDias: 15,
    ...extra,
  });

describe('FollowupVivoService', () => {
  let db: ReturnType<typeof fakeDb>;
  beforeEach(() => {
    db = fakeDb();
    db.tabelas.propostas_publicas.push({ slug: 'joel', cliente_nome: 'Joel Lima', cliente_telefone: '5561999999999', lead_id: 'L1', created_at: new Date(T0).toISOString(), dados_input: { economiaMensal: 743 }, revoked: false });
    db.tabelas.leads.push({ id: 'L1', phone: '5561999999999', eva_active: true, opt_out: false, status: 'proposta_enviada', contact_type: 'cliente' });
    db.tabelas.eva_cadence.push({ id: 'c1', lead_id: 'L1', status: 'pending' });
    db.tabelas.reengagement_touches.push({ id: 'r1', lead_id: 'L1', status: 'pending' });
  });

  it('agendarParaProposta cria 10 etapas e cancela as cadências antigas do lead', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    expect(db.tabelas.proposta_followup_vivo).toHaveLength(10);
    expect(db.tabelas.eva_cadence[0].status).toBe('cancelled');
    expect(db.tabelas.reengagement_touches[0].status).toBe('cancelled');
  });

  it('agendar duas vezes não duplica (onConflict slug+etapa)', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    expect(db.tabelas.proposta_followup_vivo).toHaveLength(10);
  });

  it('processarDevidos envia a etapa vencida por texto (janela aberta) e marca sent', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    const n = await svc.processarDevidos(T0 + 3 * 86_400_000 + 60_000); // logo após D3
    expect(n).toBe(2); // NA24 e D3 vencidas
    const d3 = db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'D3')!;
    expect(d3.status).toBe('sent');
    expect(d3.message_sent).toContain('Joel');
    expect((svc as any).deps.sendText).toHaveBeenCalledTimes(2);
  });

  it('fora do horário não envia nada', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    const n = await svc.processarDevidos(Date.UTC(2026, 7, 30, 13, 0, 0)); // domingo
    expect(n).toBe(0);
  });

  it('janela fechada → template, e registra o template no message_sent', async () => {
    const svc = mk(db, { janela24hAberta: vi.fn().mockResolvedValue(false) });
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    await svc.processarDevidos(T0 + 25 * 3_600_000);
    const na24 = db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'NA24')!;
    expect(na24.status).toBe('sent');
    expect(na24.message_sent).toMatch(/template:reativacao_lead_v1/);
    expect((svc as any).deps.sendTemplate).toHaveBeenCalledOnce();
  });

  it('lead em opt-out → etapas canceladas com motivo', async () => {
    db.tabelas.leads[0].opt_out = true;
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    await svc.processarDevidos(T0 + 25 * 3_600_000);
    expect(db.tabelas.proposta_followup_vivo.every(r => r.status === 'cancelled' && r.cancelled_reason === 'opt_out')).toBe(true);
  });

  it('takeover do Junior → pula sem cancelar (volta quando ele soltar)', async () => {
    const svc = mk(db, { emTakeover: vi.fn().mockResolvedValue(true) });
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    const n = await svc.processarDevidos(T0 + 25 * 3_600_000);
    expect(n).toBe(0);
    expect(db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'NA24')!.status).toBe('pending');
  });

  it('M1 enviada → agenda M2 30 dias depois', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    await svc.processarDevidos(T0 + 121 * 86_400_000);
    const m2 = db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'M2');
    expect(m2).toBeTruthy();
    expect(m2!.status).toBe('pending');
  });

  it('pausarPorResposta pausa pendentes; retomarSilenciosas re-arma após 48h de silêncio da Eva', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    await svc.pausarPorResposta('5561999999999');
    expect(db.tabelas.proposta_followup_vivo.every(r => r.status === 'paused')).toBe(true);
    db.tabelas.conversations.push({ lead_id: 'L1', last_message_role: 'assistant', last_message_at: new Date(T0).toISOString() });
    await svc.retomarSilenciosas(T0 + 49 * 3_600_000);
    expect(db.tabelas.proposta_followup_vivo.some(r => r.status === 'pending')).toBe(true);
  });

  it('cancelar por lead marca tudo cancelled', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    await svc.cancelarPorLead('L1', 'fechou');
    expect(db.tabelas.proposta_followup_vivo.every(r => r.status === 'cancelled' && r.cancelled_reason === 'fechou')).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/followup-vivo-service.test.ts`
Expected: FAIL — módulo não existe

- [ ] **Step 3: Implementar o serviço**

```ts
// src/modules/vendas/followup-vivo.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  planejarEtapas, dentroDoHorario, proximoHorarioValido, elegivelParaFollowup,
  argumentoDaEtapa, proximaEtapaMensal, INTERVALO_MENSAL_MS,
} from './followup-vivo-plano.js';
import { montarFatos, gerarMensagemEtapa, type CasoSimilar, type RedatorIA } from './followup-vivo-mensagem.js';

export interface FollowupVivoDeps {
  client: SupabaseClient;
  sendText: (to: string, text: string) => Promise<void>;
  /** envia template aprovado (fora da janela 24h); devolve o nome usado */
  sendTemplate: (to: string, nome: string | null | undefined, template: string) => Promise<{ templateUsado: string }>;
  janela24hAberta: (phone: string) => Promise<boolean>;
  emTakeover: (phone: string) => Promise<boolean>;
  redator: RedatorIA;
  buscarCasoSimilar: (cidade: string | null) => Promise<CasoSimilar | null>;
  proposalBaseUrl: string;
  validadeKitDias: number;
  templateFallback?: string; // default 'reativacao_lead_v1'
  loteMaximo?: number;       // default 30
}

const T = 'proposta_followup_vivo';
const A2H_MS = 2 * 3_600_000;
const SILENCIO_RETOMADA_MS = 48 * 3_600_000;

export class FollowupVivoService {
  private readonly deps: Required<Pick<FollowupVivoDeps, 'templateFallback' | 'loteMaximo'>> & FollowupVivoDeps;
  constructor(deps: FollowupVivoDeps) {
    this.deps = { templateFallback: 'reativacao_lead_v1', loteMaximo: 30, ...deps };
  }

  async agendarParaProposta(p: { slug: string; leadId: string | null; enviadaEmMs: number }): Promise<void> {
    const etapas = planejarEtapas(p.enviadaEmMs).map(e => ({
      proposta_slug: p.slug, lead_id: p.leadId, etapa: e.etapa,
      scheduled_for: new Date(e.scheduledForMs).toISOString(), status: 'pending',
    }));
    const { error } = await this.deps.client.from(T).upsert(etapas, { onConflict: 'proposta_slug,etapa', ignoreDuplicates: true });
    if (error) { console.error('[followup-vivo] agendar falhou:', error.message); return; }
    if (p.leadId) {
      await this.deps.client.from('eva_cadence').update({ status: 'cancelled', cancelled_reason: 'followup_vivo' }).eq('lead_id', p.leadId).eq('status', 'pending');
      await this.deps.client.from('reengagement_touches').update({ status: 'cancelled' }).eq('lead_id', p.leadId).eq('status', 'pending');
    }
    console.log(`[followup-vivo] ${etapas.length} etapas agendadas slug=${p.slug}`);
  }

  async agendarAbriuSemResposta(slug: string, agoraMs: number): Promise<void> {
    const { data: prop } = await this.deps.client.from('propostas_publicas').select('lead_id').eq('slug', slug).maybeSingle();
    await this.deps.client.from(T).upsert([{
      proposta_slug: slug, lead_id: prop?.lead_id ?? null, etapa: 'A2H',
      scheduled_for: new Date(proximoHorarioValido(agoraMs + A2H_MS)).toISOString(), status: 'pending',
    }], { onConflict: 'proposta_slug,etapa', ignoreDuplicates: true });
  }

  async pausarPorResposta(telefone: string): Promise<void> {
    const { data: props } = await this.deps.client.from('propostas_publicas').select('slug').eq('cliente_telefone', telefone).eq('revoked', false);
    for (const p of props ?? []) {
      await this.deps.client.from(T).update({ status: 'paused' }).eq('proposta_slug', p.slug).eq('status', 'pending');
    }
  }

  async retomarSilenciosas(agoraMs: number): Promise<number> {
    const { data: pausadas } = await this.deps.client.from(T).select('proposta_slug, lead_id').eq('status', 'paused');
    const leads = [...new Set((pausadas ?? []).map(r => r.lead_id).filter(Boolean))] as string[];
    let n = 0;
    for (const leadId of leads) {
      const { data: conv } = await this.deps.client.from('conversations').select('last_message_role, last_message_at').eq('lead_id', leadId).maybeSingle();
      if (!conv || conv.last_message_role !== 'assistant') continue;
      if (agoraMs - Date.parse(conv.last_message_at) < SILENCIO_RETOMADA_MS) continue;
      const slugs = (pausadas ?? []).filter(r => r.lead_id === leadId).map(r => r.proposta_slug);
      for (const slug of slugs) {
        // re-arma: etapas futuras voltam a pending; as já vencidas vão pra agora (dentro do horário)
        const { data: rows } = await this.deps.client.from(T).select('id, scheduled_for').eq('proposta_slug', slug).eq('status', 'paused');
        for (const r of rows ?? []) {
          const sf = Math.max(Date.parse(r.scheduled_for), proximoHorarioValido(agoraMs));
          await this.deps.client.from(T).update({ status: 'pending', scheduled_for: new Date(sf).toISOString() }).eq('id', r.id);
          n++;
        }
      }
    }
    return n;
  }

  async cancelarPorSlug(slug: string, motivo: string): Promise<void> {
    await this.deps.client.from(T).update({ status: 'cancelled', cancelled_reason: motivo }).eq('proposta_slug', slug).in('status', ['pending', 'paused']);
  }
  async cancelarPorLead(leadId: string, motivo: string): Promise<void> {
    await this.deps.client.from(T).update({ status: 'cancelled', cancelled_reason: motivo }).eq('lead_id', leadId).in('status', ['pending', 'paused']);
  }

  /** Chamado pelo cron. Devolve quantas etapas foram enviadas. */
  async processarDevidos(agoraMs: number): Promise<number> {
    if (!dentroDoHorario(agoraMs)) return 0;
    const { data: devidas, error } = await this.deps.client.from(T)
      .select('id, proposta_slug, lead_id, etapa, scheduled_for')
      .eq('status', 'pending').lte('scheduled_for', new Date(agoraMs).toISOString())
      .order('scheduled_for', { ascending: true }).limit(this.deps.loteMaximo);
    if (error) { console.error('[followup-vivo] busca falhou:', error.message); return 0; }
    let enviadas = 0;
    for (const row of devidas ?? []) {
      try { if (await this.processarUma(row, agoraMs)) enviadas++; }
      catch (err) {
        console.error(`[followup-vivo] etapa ${row.etapa} slug=${row.proposta_slug} falhou:`, (err as Error).message);
        await this.deps.client.from(T).update({ status: 'failed', error_message: (err as Error).message }).eq('id', row.id);
      }
    }
    return enviadas;
  }

  private async processarUma(row: { id: string; proposta_slug: string; lead_id: string | null; etapa: string }, agoraMs: number): Promise<boolean> {
    const { data: prop } = await this.deps.client.from('propostas_publicas')
      .select('slug, cliente_nome, cliente_telefone, lead_id, created_at, dados_input, revoked')
      .eq('slug', row.proposta_slug).maybeSingle();
    if (!prop || prop.revoked || !prop.cliente_telefone) {
      await this.cancelarPorSlug(row.proposta_slug, !prop ? 'proposta_inexistente' : prop.revoked ? 'proposta_revogada' : 'sem_telefone');
      return false;
    }
    const leadId = row.lead_id ?? prop.lead_id ?? null;
    const { data: lead } = leadId
      ? await this.deps.client.from('leads').select('eva_active, opt_out, status, contact_type').eq('id', leadId).maybeSingle()
      : { data: null };
    const eleg = elegivelParaFollowup(lead ?? {}, await this.deps.emTakeover(prop.cliente_telefone));
    if (!eleg.ok) {
      if (eleg.motivo === 'takeover') return false; // fica pendente, volta quando o Junior soltar
      await this.cancelarPorSlug(row.proposta_slug, eleg.motivo);
      return false;
    }
    // lock otimista: pending -> sending
    const { data: locked } = await this.deps.client.from(T).update({ status: 'sending' }).eq('id', row.id).eq('status', 'pending').select();
    if (!locked || locked.length === 0) return false;

    const fatos = montarFatos(
      { cliente_nome: prop.cliente_nome, slug: prop.slug, created_at: prop.created_at, dados_input: prop.dados_input },
      { linkProposta: `${this.deps.proposalBaseUrl}/${prop.slug}`, validadeKitDias: this.deps.validadeKitDias, agoraMs },
    );
    const argumento = argumentoDaEtapa(row.etapa);
    const caso = argumento === 'prova_social' ? await this.deps.buscarCasoSimilar(fatos.cidade) : null;

    let registro: string;
    if (await this.deps.janela24hAberta(prop.cliente_telefone)) {
      const msg = await gerarMensagemEtapa(argumento, fatos, caso, this.deps.redator);
      await this.deps.sendText(prop.cliente_telefone, msg.texto);
      registro = msg.texto;
    } else {
      const { templateUsado } = await this.deps.sendTemplate(prop.cliente_telefone, prop.cliente_nome, this.deps.templateFallback);
      registro = `template:${templateUsado}`;
    }
    await this.deps.client.from(T).update({ status: 'sent', sent_at: new Date(agoraMs).toISOString(), message_sent: registro }).eq('id', row.id);
    console.log(`[followup-vivo] etapa ${row.etapa} enviada slug=${row.proposta_slug} (${registro.startsWith('template:') ? registro : 'texto'})`);

    if (/^M\d+$/.test(row.etapa)) {
      await this.deps.client.from(T).upsert([{
        proposta_slug: row.proposta_slug, lead_id: leadId, etapa: proximaEtapaMensal(row.etapa),
        scheduled_for: new Date(proximoHorarioValido(agoraMs + INTERVALO_MENSAL_MS)).toISOString(), status: 'pending',
      }], { onConflict: 'proposta_slug,etapa', ignoreDuplicates: true });
    }
    return true;
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/followup-vivo-service.test.ts`
Expected: PASS (10 testes). Se o teste "processarDevidos envia a etapa vencida" devolver 1 em vez de 2, confira que o fake `update().eq().eq().select()` devolve a linha (lock otimista).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 6: Commit**

```bash
git add src/modules/vendas/followup-vivo.ts tests/followup-vivo-service.test.ts
git commit -m "feat(followup-vivo): serviço — agenda, processa com guarda/elegibilidade, pausa/retoma, mensal infinito"
```

---

### Task 5: `VisitasService` — registrar visita e toque pós-visita 24 h

**Files:**
- Create: `src/modules/vendas/visitas.ts`
- Test: `tests/visitas.test.ts`

- [ ] **Step 1: Testes (falhando)**

```ts
// tests/visitas.test.ts
import { describe, it, expect, vi } from 'vitest';
import { VisitasService, visitasPendentesDePosVisita } from '../src/modules/vendas/visitas.js';

const T0 = Date.UTC(2026, 7, 24, 15, 0, 0); // seg 12:00 BRT
const H = 3_600_000;

describe('visitasPendentesDePosVisita (puro)', () => {
  const v = (fim: number, resultado: string | null = null) => ({ id: 'v', lead_id: 'L1', phone: '55', fim: new Date(fim).toISOString(), resultado });
  it('seleciona visitas terminadas há >= 24h sem resultado', () => {
    expect(visitasPendentesDePosVisita([v(T0 - 25 * H), v(T0 - 2 * H), v(T0 - 30 * H, 'fechou')], T0).map(x => x.fim)).toEqual([new Date(T0 - 25 * H).toISOString()]);
  });
});

describe('VisitasService', () => {
  function deps() {
    const rows: any[] = [];
    const client: any = { from: (t: string) => ({
      insert: async (r: any) => { rows.push({ id: 'v1', ...r }); return { error: null }; },
      select: () => ({ is: () => ({ lte: async () => ({ data: rows.filter(r => r.resultado == null), error: null }) }) }),
      update: (p: any) => ({ eq: async (_k: string, id: string) => { Object.assign(rows.find(r => r.id === id), p); return { error: null }; } }),
    }) };
    const followup = { agendarPosVisita: vi.fn().mockResolvedValue(undefined) };
    return { rows, client, followup, svc: new VisitasService({ client, followupVivo: followup as any }) };
  }
  it('registrar grava a visita', async () => {
    const d = deps();
    await d.svc.registrar({ leadId: 'L1', phone: '55', tipo: 'visita', inicioMs: T0, fimMs: T0 + 2 * H, calendarEventId: 'ev1' });
    expect(d.rows[0]).toMatchObject({ lead_id: 'L1', tipo: 'visita', calendar_event_id: 'ev1', resultado: null });
  });
  it('processarPosVisita dispara POS_VISITA 24h depois e marca followup_enviado', async () => {
    const d = deps();
    await d.svc.registrar({ leadId: 'L1', phone: '55', tipo: 'visita', inicioMs: T0 - 26 * H, fimMs: T0 - 25 * H, calendarEventId: null });
    const n = await d.svc.processarPosVisita(T0);
    expect(n).toBe(1);
    expect(d.followup.agendarPosVisita).toHaveBeenCalledWith({ leadId: 'L1', phone: '55', agoraMs: T0 });
    expect(d.rows[0].resultado).toBe('followup_enviado');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/visitas.test.ts` — Expected: FAIL, módulo não existe (e `agendarPosVisita` ainda não existe no serviço — Task 5 Step 4 adiciona).

- [ ] **Step 3: Implementar `visitas.ts`**

```ts
// src/modules/vendas/visitas.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FollowupVivoService } from './followup-vivo.js';

const POS_VISITA_MS = 24 * 3_600_000;

export interface VisitaRow { id: string; lead_id: string | null; phone: string; fim: string; resultado: string | null }
export function visitasPendentesDePosVisita(rows: VisitaRow[], agoraMs: number): VisitaRow[] {
  return rows.filter(r => r.resultado == null && agoraMs - Date.parse(r.fim) >= POS_VISITA_MS);
}

export class VisitasService {
  constructor(private readonly deps: { client: SupabaseClient; followupVivo: Pick<FollowupVivoService, 'agendarPosVisita'> }) {}

  async registrar(v: { leadId: string | null; phone: string; tipo: 'visita' | 'meet'; inicioMs: number; fimMs: number; calendarEventId: string | null }): Promise<void> {
    const { error } = await this.deps.client.from('visitas').insert({
      lead_id: v.leadId, phone: v.phone, tipo: v.tipo,
      inicio: new Date(v.inicioMs).toISOString(), fim: new Date(v.fimMs).toISOString(),
      calendar_event_id: v.calendarEventId, resultado: null,
    });
    if (error) console.error('[visitas] registrar falhou:', error.message);
    else console.log(`[visitas] ${v.tipo} registrada lead=${v.leadId} fim=${new Date(v.fimMs).toISOString()}`);
  }

  async marcarResultado(leadId: string, resultado: 'fechou' | 'cancelada'): Promise<void> {
    await this.deps.client.from('visitas').update({ resultado }).eq('lead_id', leadId);
  }

  /** Cron: visitas terminadas há >= 24h sem resultado → toque pós-visita. */
  async processarPosVisita(agoraMs: number): Promise<number> {
    const { data, error } = await this.deps.client.from('visitas').select('id, lead_id, phone, fim, resultado')
      .is('resultado', null).lte('fim', new Date(agoraMs - POS_VISITA_MS).toISOString());
    if (error) { console.error('[visitas] busca falhou:', error.message); return 0; }
    let n = 0;
    for (const v of visitasPendentesDePosVisita((data ?? []) as VisitaRow[], agoraMs)) {
      await this.deps.followupVivo.agendarPosVisita({ leadId: v.lead_id, phone: v.phone, agoraMs });
      await this.deps.client.from('visitas').update({ resultado: 'followup_enviado', pos_visita_em: new Date(agoraMs).toISOString() }).eq('id', v.id);
      n++;
    }
    return n;
  }
}
```

- [ ] **Step 4: Adicionar `agendarPosVisita` ao `FollowupVivoService`** (em `src/modules/vendas/followup-vivo.ts`, depois de `agendarAbriuSemResposta`)

```ts
  /** Pós-visita: cria etapa POS_VISITA pra agora (dentro do horário) na proposta mais recente do lead
   *  e re-arma as etapas pausadas/pendentes a partir de D3 (o cliente viu o Junior — voltou a ser quente). */
  async agendarPosVisita(p: { leadId: string | null; phone: string; agoraMs: number }): Promise<void> {
    let q = this.deps.client.from('propostas_publicas').select('slug, lead_id').eq('revoked', false).order('created_at', { ascending: false }).limit(1);
    q = p.leadId ? q.eq('lead_id', p.leadId) : q.eq('cliente_telefone', p.phone);
    const { data } = await q;
    const prop = data?.[0];
    if (!prop) { console.log(`[followup-vivo] pós-visita sem proposta lead=${p.leadId}`); return; }
    await this.deps.client.from(T).upsert([{
      proposta_slug: prop.slug, lead_id: p.leadId ?? prop.lead_id ?? null, etapa: 'POS_VISITA',
      scheduled_for: new Date(proximoHorarioValido(p.agoraMs)).toISOString(), status: 'pending',
    }], { onConflict: 'proposta_slug,etapa' });
    // re-arma o ritmo a partir de D3 relativo à visita
    const plano = planejarEtapas(p.agoraMs).filter(e => ['D3', 'D5', 'D8', 'D12', 'D20'].includes(e.etapa));
    for (const e of plano) {
      await this.deps.client.from(T).update({ status: 'pending', scheduled_for: new Date(e.scheduledForMs).toISOString() })
        .eq('proposta_slug', prop.slug).eq('etapa', e.etapa).in('status', ['pending', 'paused', 'sent']);
    }
  }
```

E adicionar o teste no fim de `tests/followup-vivo-service.test.ts`:

```ts
  it('agendarPosVisita cria POS_VISITA para agora e re-arma D3..D20', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'D3')!.status = 'sent';
    const visita = T0 + 10 * 86_400_000;
    await svc.agendarPosVisita({ leadId: 'L1', phone: '5561999999999', agoraMs: visita });
    const pos = db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'POS_VISITA')!;
    expect(pos.status).toBe('pending');
    const d3 = db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'D3')!;
    expect(d3.status).toBe('pending');
    expect(Date.parse(d3.scheduled_for)).toBe(visita + 3 * 86_400_000);
  });
```

- [ ] **Step 5: Rodar os dois arquivos e ver passar**

Run: `npx vitest run tests/visitas.test.ts tests/followup-vivo-service.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/vendas/visitas.ts src/modules/vendas/followup-vivo.ts tests/visitas.test.ts tests/followup-vivo-service.test.ts
git commit -m "feat(followup-vivo): visitas persistidas + toque pós-visita 24h que re-arma o ritmo"
```

---

### Task 6: Wiring em `src/index.ts`

**Files:**
- Modify: `src/index.ts` (pontos abaixo; linhas aproximadas do mapa de 21/08 — confirmar com grep antes de editar)

- [ ] **Step 1: Instanciar os serviços** — logo após o bloco do `proposalFollowup` (≈ L649–664)

```ts
import { FollowupVivoService } from './modules/vendas/followup-vivo.js';
import { VisitasService } from './modules/vendas/visitas.js';
import { enviarTemplateInicial } from './modules/template-inicial.js';
import { medirIa } from './modules/custos/ia-metering.js';

const followupVivo = new FollowupVivoService({
  client: supabase.getClient(),
  sendText,
  sendTemplate: (to, nome, template) => metaWaba
    ? enviarTemplateInicial(metaWaba, to, nome, template)
    : Promise.reject(new Error('waba_indisponivel')),
  janela24hAberta: (p) => janela24hAberta(p),
  emTakeover: (p) => takeover.isPaused(p),
  redator: async (prompt) => {
    const r = await anthropic.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 300, messages: [{ role: 'user', content: prompt }] });
    medirIa({ modelo: 'claude-haiku-4-5-20251001', origem: 'followup-vivo', usage: r.usage });
    return r.content.filter((b): b is { type: 'text'; text: string } => b.type === 'text').map(b => b.text).join('\n');
  },
  buscarCasoSimilar: async (cidade) => {
    try {
      const todos = await casesFetcher.getAll();
      const c = todos.find(x => cidade && x.cidade.toLowerCase() === cidade.toLowerCase()) ?? todos.find(x => x.featured) ?? todos[0];
      return c ? { titulo: c.titulo, cidade: c.cidade, kwp: c.kwp, fotoUrl: c.fotoPrincipal } : null;
    } catch { return null; }
  },
  proposalBaseUrl: config.publicProposalBaseUrl,
  validadeKitDias: 15,
});
const visitas = new VisitasService({ client: supabase.getClient(), followupVivo });
```

(`casesFetcher`: se não houver instância no escopo do index, criar `const casesFetcher = new CasesFetcher({ siteUrl: config.siteUrl })` — ver como `proposal-assistant.ts` L736 monta a dele.)

- [ ] **Step 2: Gancho "proposta enviada ao cliente"** — onde `sent_to_client_at` é gravado (`grep -n "sent_to_client_at" src/index.ts src/modules/*.ts`). Logo após o update bem-sucedido:

```ts
followupVivo.agendarParaProposta({ slug, leadId: propostaLeadId ?? null, enviadaEmMs: Date.now() })
  .catch(err => console.warn('[followup-vivo] agendar pós-envio falhou:', (err as Error).message));
```

Há dois caminhos de envio (Junior envia / Eva envia via `enviarPropostaParaCliente`) — colocar o gancho nos dois.

- [ ] **Step 3: Gancho "abriu e não respondeu"** — em `proposalFollowup.triggerOnView(...)` da rota `/p/:slug` (≈ L8366), acrescentar na mesma linha de `.then`:

```ts
.then(r => { proposalFollowup.triggerOnView(slug, r.acessosAntes, 'web'); if (r.acessosAntes === 0) void followupVivo.agendarAbriuSemResposta(slug, Date.now()); })
```

- [ ] **Step 4: Gancho "cliente respondeu"** — ao lado de `proposalFollowup.markClienteRespondeu(from, db)` (≈ L3763):

```ts
void followupVivo.pausarPorResposta(from);
```

- [ ] **Step 5: Ganchos de fim** — nos mesmos lugares onde já se chama `cancelCadence`:
  - `'visita_agendada'` (≈ L5355): **não** cancelar o follow-up vivo; em vez disso registrar a visita:
    ```ts
    void visitas.registrar({ leadId: lead.id, phone: from, tipo: withMeet ? 'meet' : 'visita', inicioMs: Date.parse(startISO), fimMs: Date.parse(endISO), calendarEventId: event_id });
    ```
    (usar as variáveis do bloco que monta `logEvent('info','calendar', ...)` — `start`, `event_id`; calcular `endISO` pela duração do evento criado.)
  - `'disqualify_lead'` (≈ L5505), `mark_lost` (≈ L5443), opt-out universal (≈ L2444) e `/eva off` (≈ L6936): `void followupVivo.cancelarPorLead(lead.id, '<mesmo motivo>')`.
  - Fechamento (contrato gerado/assinado — `closing/fechamento-auto.ts` ou onde `status: 'ganho'` é gravado): `void followupVivo.cancelarPorLead(leadId, 'fechou'); void visitas.marcarResultado(leadId, 'fechou');`

- [ ] **Step 6: Cron** — junto do scheduler de `processCadence` (≈ L9167):

```ts
if (!isSandbox && !passiveMode) {
  const tickFollowupVivo = async () => {
    const agora = Date.now();
    try {
      const a = await followupVivo.processarDevidos(agora);
      const b = await visitas.processarPosVisita(agora);
      const c = await followupVivo.retomarSilenciosas(agora);
      if (a || b || c) console.log(`[followup-vivo] tick: enviadas=${a} posVisita=${b} retomadas=${c}`);
    } catch (err) { console.error('[followup-vivo] tick falhou:', (err as Error).message); }
  };
  setTimeout(tickFollowupVivo, 3 * 60 * 1000);
  setInterval(tickFollowupVivo, 15 * 60 * 1000);
}
```

- [ ] **Step 7: Desligar o legado que conflita** — `ReengagementCadence.processDueTouches` (scheduler ≈ L10438) passa a pular leads que tenham linha em `proposta_followup_vivo` com status `pending|paused`. Implementar dentro de `reengagement-cadence.ts` `processDueTouches()`: antes de enviar cada toque, `const { data } = await this.supabase.from('proposta_followup_vivo').select('id').eq('lead_id', touch.lead_id).in('status', ['pending','paused']).limit(1); if (data?.length) { marcar touch como cancelled; continue; }`.

- [ ] **Step 8: Typecheck + suíte inteira**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc limpo; vitest com as mesmas 2 falhas pré-existentes de `tests/supabase-vincular-novo.test.ts` e nada mais.

- [ ] **Step 9: Commit**

```bash
git add src/index.ts src/modules/reengagement-cadence.ts
git commit -m "feat(followup-vivo): wiring — ganchos de envio/abertura/resposta/visita/fim + cron 15min"
```

---

### Task 7: Observabilidade + comando do Junior

**Files:**
- Modify: `src/index.ts` (bloco de comandos admin, perto de `tryHandleAbordarCommand` ≈ L860)

- [ ] **Step 1: Comando `/followup <nome>`** — mostra o estado do follow-up vivo de um cliente e permite parar:

```ts
async function tryHandleFollowupVivoCommand(from: string, content: string): Promise<boolean> {
  const m = /^\/?followup\s+(parar\s+)?(.+)$/i.exec(content.trim());
  if (!m || !isAdminPhone(from)) return false;
  const parar = !!m[1]; const nome = m[2].trim();
  const { data: props } = await supabase.getClient().from('propostas_publicas').select('slug, cliente_nome, lead_id')
    .ilike('cliente_nome', `%${nome}%`).eq('revoked', false).order('created_at', { ascending: false }).limit(1);
  const p = props?.[0];
  if (!p) { await sendText(from, `Não achei proposta de "${nome}".`); return true; }
  if (parar) { await followupVivo.cancelarPorSlug(p.slug, 'junior_parou'); await sendText(from, `✋ Follow-up de ${p.cliente_nome} parado.`); return true; }
  const { data: rows } = await supabase.getClient().from('proposta_followup_vivo').select('etapa, status, scheduled_for, sent_at')
    .eq('proposta_slug', p.slug).order('scheduled_for', { ascending: true });
  const linhas = (rows ?? []).map(r => `${r.status === 'sent' ? '✅' : r.status === 'pending' ? '⏳' : r.status === 'paused' ? '⏸' : '✖'} ${r.etapa} — ${new Date(r.sent_at ?? r.scheduled_for).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  await sendText(from, `📡 Follow-up ${p.cliente_nome}\n${linhas.join('\n') || '(nenhuma etapa)'}\n\nPra parar: /followup parar ${nome}`);
  return true;
}
```

Registrar a chamada junto das outras `tryHandle*` do admin.

- [ ] **Step 2: Evento Elo por envio** — em `FollowupVivoService.processarUma`, após marcar `sent`, chamar `registrarEvento(this.deps.client, { tipo: 'comercial:followup_vivo', leadId: leadId ?? undefined, canal: 'whatsapp', origem: 'followup-vivo', payload: { etapa: row.etapa, slug: row.proposta_slug } })` (import de `../elo/eventos.js`; nunca lança).

- [ ] **Step 3: Typecheck + testes + commit**

```bash
npx tsc --noEmit && npx vitest run tests/followup-vivo-service.test.ts
git add src/index.ts src/modules/vendas/followup-vivo.ts
git commit -m "feat(followup-vivo): comando /followup <nome> [parar] + evento Elo por envio"
```

---

### Task 8: Entrega — migrations, deploy, teste de fogo

- [ ] **Step 1:** Combinar os números **101 e 102** no grupo do WhatsApp (regra do CLAUDE.md) e aplicar as migrations no Supabase de produção (SQL Editor).
- [ ] **Step 2:** Abrir PR da branch `feat/eva-vendedora-autonoma` → `main` com o resumo abaixo e **entregar o comando de merge na mesma mensagem** (preferência do Junior):

```bash
gh pr create --title "Eva follow-up vivo (fatia 1): ritmo sem fim + pós-visita 24h" --body "..." && gh pr merge --squash --auto
```
- [ ] **Step 3:** Implantar no EasyPanel (push antes de Implantar; se o build não rebuildar, Forçar Reconstrução) e conferir `/health` (carimbo do build).
- [ ] **Step 4: Teste de fogo (spec §9)** — com o Junior: 1) enviar uma proposta real → conferir 10 linhas em `proposta_followup_vivo`; 2) abrir o link sem responder → `A2H` aparece para +2 h; 3) `/followup <nome>` mostra o ritmo; 4) responder como cliente → etapas viram `paused`; 5) agendar visita pelo fluxo normal → linha em `visitas`; 6) (simulado via SQL `fim = now() - interval '25 hours'`) → tick manda o toque pós-visita. Registrar resultado na memória.

---

## Self-review (feito ao escrever)

- **Spec §6 cobertura:** ritmo D0…mensal ✓ (Task 2/4) · abriu-sem-resposta 2 h ✓ (Task 4 `agendarAbriuSemResposta` + Task 6.3) · não abriu 24 h ✓ (NA24) · economia/financiamento/prova social/validade/toque leve ✓ (Task 3) · pós-visita 24 h ✓ (Task 5) · resposta do cliente → conversa normal ✓ (pausa) · desconto só com Junior ✓ (regra no prompt; detecção do pedido fica na fatia 3, onde entra o card) · opt-out → PERDIDO ✓ (elegibilidade + cancelar) · 8h–20h sem domingo ✓ · para em FECHADO/PERDIDO/QUER_JUNIOR ✓ (Task 6.5 + takeover).
- **D0 (resumo no envio):** a mensagem de envio já existe (`enviarPropostaParaCliente`) — não duplicar; `D0` fica só como argumento possível.
- **Tipos:** `RedatorIA`, `CasoSimilar`, `Fatos`, `Argumento` definidos na Task 2/3 e usados na 4; `agendarPosVisita` definido na Task 5.4 e referenciado na 5.3 (`Pick<FollowupVivoService,'agendarPosVisita'>`).
- **Sem placeholders**; linhas do `index.ts` são aproximadas por design (arquivo de 10k linhas) — cada gancho traz o `grep` pra localizar.
