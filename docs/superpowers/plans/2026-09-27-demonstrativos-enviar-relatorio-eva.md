# Demonstrativos — Enviar o relatório ao cliente pela Eva (fatia 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na tela do cliente em `/dashboard/demonstrativos/:instalacao`, com o mês 🟢, o botão "📲 Enviar ao cliente pela Eva" mostra a prévia (WhatsApp + e-mail + link), e ao confirmar gera o PDF, guarda no storage, cria um link público `/rg/<token>` e manda pelo WhatsApp (modelo Meta `relatorio_usina_v1` na EcoSun; texto + PDF pela instância própria no tenant) e pelo e-mail, mostrando ✅/❌ por canal.

**Architecture:** Regras puras em `src/modules/gd/relatorio-envio-textos.ts` (token, link, textos) e `src/modules/gd/relatorio-envio.ts` (quem recebe, por onde, resultado por canal — envios injetados). A rota do dashboard roda o envio dentro de `noCanalDaEmpresa()` (= `comEmpresaDe` + `comCanal`), então o `sendText` do `index.ts` escolhe a instância Evolution do tenant e nunca a WABA da EcoSun; o mesmo conserto vale para o envio da Pasta Digital. O link público é servido por `GET /rg/:token` no `index.ts` (busca só pelo token, chave-mestra só lê o PDF). A Pasta Digital pública ganha o bloco "📊 Relatórios da sua usina".

**Tech Stack:** TypeScript ESM (imports `.js`), Express server-rendered, Supabase (Postgres + Storage bucket `client-attachments`), vitest, Meta WABA Cloud API (template), Evolution API (tenant), Resend (e-mail).

---

## Antes de começar

- Branch: `feat/gd-enviar-relatorio-eva` (já criada a partir da `main` atualizada, contém só este plano).
- Leia `CLAUDE.md` e `docs/VISAO-GERAL-DO-SISTEMA.md`. Spec da fatia: `docs/superpowers/specs/2026-09-23-demonstrativos-tela-relatorio-design.md`.
- **Migration 133 — reservada.** Antes do Task 8, o Junior avisa no grupo do WhatsApp: "vou usar a 133".
- **ATENÇÃO — rota pública:** `GET /r/:slug` JÁ EXISTE no `src/index.ts` (~linha 9372, relatório de acompanhamento da usina). Por isso o link do relatório GD é **`/rg/<token>`** (não `/r/`). O modelo da Meta aponta para `/rg/{{1}}`.
- Rodar testes: `npx vitest run <arquivo>`; tipos: `npx tsc --noEmit`. Há 2 falhas pré-existentes em `tests/supabase-vincular-novo.test.ts` — ignore.
- Commits: `git add <arquivos por nome>` (nunca `-A`/`.`), mensagem termina com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Mapa de arquivos

| Arquivo | Criar/Modificar | Responsabilidade |
|---|---|---|
| `src/modules/gd/relatorio-motor.ts` | Modificar | `numerosDoRelatorio()` (rastreio) + `avisoVencimento` nos créditos |
| `src/modules/gd/relatorio-servico.ts` | Modificar | devolve `leadId` no resultado 🟢 |
| `src/modules/gd/relatorio-envio-textos.ts` | Criar | token, link `/rg/`, textos do zap/modelo, nome do arquivo, data BR |
| `docs/whatsapp-templates/relatorio_usina_v1.md` | Criar | o que preencher na Meta |
| `src/modules/relatorios/pasta/resultado-envio.ts` | Modificar | tela ✅/❌ genérica (`renderResultadoEnvio`) + novos motivos + aviso/detalhe |
| `src/modules/email/email-moldura.ts` | Modificar | opção `semLogo` (tenant sem logo https não herda a logo da EcoSun) |
| `src/modules/gd/relatorio-envio.ts` | Criar | destino (opt-out, telefone, e-mail, LGPD), envio zap/e-mail, conversa, resumo |
| `src/modules/evolution.ts` | Modificar | `sendDocument()` (PDF base64) |
| `src/modules/dashboard/canal-envio.ts` | Criar | `canalZapDaEmpresa()` e `noCanalDaEmpresa()` |
| `supabase/migrations/133_relatorios_gd_envio.sql` | Criar | colunas de envio + token único |
| `src/modules/gd/demonstrativos-tela-repo.ts` | Modificar | `criarRelatorioParaEnvio`, `marcarEnvio`, `ultimoEnvio`, `destinoDoLead` |
| `src/modules/anexos/storage.ts` | Modificar | `baixarAnexo()` |
| `src/modules/gd/relatorio-publico.ts` | Criar | PDF pelo token; relatórios enviados do lead (pasta) |
| `src/modules/dashboard/demonstrativos-views.ts` | Modificar | botão, "✅ enviado em…", tela de confirmação |
| `src/modules/dashboard/router.ts` | Modificar | GET/POST `/demonstrativos/:instalacao/enviar`, conserto `/pastas/:id/enviar`, lister na pasta |
| `src/index.ts` | Modificar | opção `sendDocumentEvolution`, rota pública `/rg/:token`, lister na pasta pública |
| `src/modules/relatorios/pasta/types.ts` · `service.ts` · `template.ts` | Modificar | bloco "📊 Relatórios da sua usina" |
| `src/modules/gd/demonstrativos-tela.ts` · `relatorio-html.ts` | Modificar | regra dos 6 meses no vencimento do PDF |

---

### Task 1: Números do rastreio e `leadId` no relatório pronto

**Files:**
- Modify: `src/modules/gd/relatorio-motor.ts` (fim do arquivo)
- Modify: `src/modules/gd/relatorio-servico.ts:18-20` e `:34-57`
- Modify: `src/modules/dashboard/router.ts` (`relatorioDaRequisicao` ~4700 e rota `relatorio.pdf` ~4722-4729)
- Test: `tests/gd-relatorio-motor.test.ts`, `tests/gd-relatorio-servico.test.ts`

- [ ] **Step 1: Write the failing tests**

Em `tests/gd-relatorio-motor.test.ts`, troque a linha 2:

```ts
import { montarRelatorio, mesExtenso, numerosDoRelatorio, type EntradaRelatorio } from '../src/modules/gd/relatorio-motor.js';
```

e acrescente no FIM do arquivo:

```ts
describe('numerosDoRelatorio', () => {
  it('traz os números que saíram no PDF (rastreio em relatorios_gd_gerados.numeros)', () => {
    expect(numerosDoRelatorio(montarRelatorio(entrada()))).toEqual({
      gerouKwh: 612, consumiuKwh: 480, economiaRs: 376.2, creditosKwh: 1240, tarifaRsKwh: 0.99,
      injetadoKwh: 222, compensadoKwh: 380, usadosNoMesKwh: 380, origemGeracao: 'api',
    });
  });
});
```

Em `tests/gd-relatorio-servico.test.ts`, acrescente no FIM do arquivo:

```ts
describe('prepararRelatorio — cliente do relatório', () => {
  it('mês pronto devolve o lead (o envio ao cliente precisa dele)', async () => {
    const r = await prepararRelatorio('351534', '2026-08-01', deps());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.leadId).toBe('L1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/gd-relatorio-motor.test.ts tests/gd-relatorio-servico.test.ts`
Expected: FAIL — `numerosDoRelatorio is not a function` / `expected undefined to be 'L1'`.

- [ ] **Step 3: Implement**

No FIM de `src/modules/gd/relatorio-motor.ts`:

```ts
/** Os números que saíram no PDF — gravados em relatorios_gd_gerados.numeros (rastreio: "o que mandamos em agosto?"). */
export function numerosDoRelatorio(r: RelatorioGd): Record<string, unknown> {
  return {
    gerouKwh: r.gerouKwh, consumiuKwh: r.consumiuKwh, economiaRs: r.economiaRs, creditosKwh: r.creditosKwh,
    tarifaRsKwh: r.tarifaRsKwh, injetadoKwh: r.injetadoKwh, compensadoKwh: r.compensadoKwh,
    usadosNoMesKwh: r.creditos.usadosNoMesKwh, origemGeracao: r.origemGeracao,
  };
}
```

Em `src/modules/gd/relatorio-servico.ts`, troque o tipo:

```ts
export type ResultadoPreparo =
  | { ok: true; relatorio: RelatorioGd; leadId: string }
  | { ok: false; status: 404 | 409; motivo: string };
```

Logo DEPOIS do bloco `if (v.estado !== 'pronto' || ...) { ... return { ok: false, status: 409, motivo }; }` acrescente:

```ts
  // 🟢 já exige cliente ligado; a checagem explícita deixa o tipo sem null.
  if (!l.lead_id) return { ok: false, status: 409, motivo: 'UC sem cliente — ligue a um cliente cadastrado' };
```

e troque o `return { ok: true, relatorio: montarRelatorio({...}) }` final por:

```ts
  return {
    ok: true,
    leadId: l.lead_id,
    relatorio: montarRelatorio({
      linha: l, geracaoKwh: v.geracaoKwh, origemGeracao: v.origemGeracao, geracaoPorMes,
      potenciaKwp: sis.potenciaKwp, esperadoMesKwh: v.esperadoMesKwh, tarifaRsKwh: d.tarifaRsKwh,
    }),
  };
```

Em `src/modules/dashboard/router.ts`, na função `relatorioDaRequisicao`, troque a última linha:

```ts
    return { inst, mes, tela, relatorio: r.relatorio, html: renderRelatorioHtml(r.relatorio, marca) };
```

por:

```ts
    return { inst, mes, tela, leadId: r.leadId, relatorio: r.relatorio, html: renderRelatorioHtml(r.relatorio, marca) };
```

E na rota `GET /demonstrativos/:instalacao/relatorio.pdf`, troque o bloco:

```ts
      const r = p.relatorio;
      await p.tela.registrarRelatorio({
        instalacao: p.inst, referencia: p.mes, geradoPor: req.dashUser!.id,
        numeros: {
          gerouKwh: r.gerouKwh, consumiuKwh: r.consumiuKwh, economiaRs: r.economiaRs, creditosKwh: r.creditosKwh,
          tarifaRsKwh: r.tarifaRsKwh, injetadoKwh: r.injetadoKwh, compensadoKwh: r.compensadoKwh,
          usadosNoMesKwh: r.creditos.usadosNoMesKwh, origemGeracao: r.origemGeracao,
        },
      });
```

por:

```ts
      const { numerosDoRelatorio } = await import('../gd/relatorio-motor.js');
      await p.tela.registrarRelatorio({
        instalacao: p.inst, referencia: p.mes, geradoPor: req.dashUser!.id,
        numeros: numerosDoRelatorio(p.relatorio),
      });
```

- [ ] **Step 4: Run tests + tsc**

Run: `npx vitest run tests/gd-relatorio-motor.test.ts tests/gd-relatorio-servico.test.ts && npx tsc --noEmit`
Expected: PASS, tsc sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/modules/gd/relatorio-motor.ts src/modules/gd/relatorio-servico.ts src/modules/dashboard/router.ts tests/gd-relatorio-motor.test.ts tests/gd-relatorio-servico.test.ts
git commit -m "refactor(gd): numerosDoRelatorio + leadId no relatorio pronto (base do envio)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Textos, token e link público (funções puras)

**Files:**
- Create: `src/modules/gd/relatorio-envio-textos.ts`
- Test: `tests/gd-relatorio-envio-textos.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/gd-relatorio-envio-textos.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  TEMPLATE_RELATORIO, basePublica, gerarTokenRelatorio, normalizarTokenRelatorio, linkPublicoRelatorio,
  primeiroNome, textoTemplateRelatorio, textoLivreRelatorio, componentesTemplateRelatorio,
  nomeArquivoRelatorio, dataHoraBrasilia,
} from '../src/modules/gd/relatorio-envio-textos.js';

afterEach(() => vi.unstubAllEnvs());

describe('token do link público', () => {
  it('32 caracteres base64url, imprevisível', () => {
    const a = gerarTokenRelatorio();
    const b = gerarTokenRelatorio();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(a).not.toBe(b);
    expect(normalizarTokenRelatorio(a)).toBe(a);
  });
  it('ponto/parêntese que o WhatsApp cola no fim sai; hífen e sublinhado do token ficam', () => {
    const t = 'Ab3_Ab3_Ab3_Ab3_Ab3_Ab3_Ab3_Ab3-'; // 32 caracteres, termina em hífen
    expect(normalizarTokenRelatorio(`${t}.`)).toBe(t);
    expect(normalizarTokenRelatorio(` ${t}). `)).toBe(t);
    expect(normalizarTokenRelatorio(t)).toBe(t);
  });
  it('lixo é recusado (null)', () => {
    expect(normalizarTokenRelatorio('')).toBeNull();
    expect(normalizarTokenRelatorio('curto')).toBeNull();
    expect(normalizarTokenRelatorio('../../etc/passwd')).toBeNull();
    expect(normalizarTokenRelatorio(undefined)).toBeNull();
    expect(normalizarTokenRelatorio('A'.repeat(33))).toBeNull();
  });
});

describe('link e base pública', () => {
  it('link usa /rg/ (o /r/ já é do relatório de acompanhamento)', () => {
    expect(linkPublicoRelatorio('https://p.exemplo.com/', 'TOK')).toBe('https://p.exemplo.com/rg/TOK');
  });
  it('base vem do PROPOSAL_PUBLIC_BASE_URL, sem barra no fim', () => {
    vi.stubEnv('PROPOSAL_PUBLIC_BASE_URL', 'https://p.exemplo.com/');
    expect(basePublica()).toBe('https://p.exemplo.com');
  });
});

describe('textos da mensagem', () => {
  it('primeiro nome bonito; sem nome vira "cliente"', () => {
    expect(primeiroNome('JOÃO DA SILVA')).toBe('João');
    expect(primeiroNome('  maria  ')).toBe('Maria');
    expect(primeiroNome('')).toBe('cliente');
    expect(primeiroNome(null)).toBe('cliente');
  });
  it('texto do modelo é EXATAMENTE o corpo aprovado na Meta', () => {
    expect(TEMPLATE_RELATORIO).toBe('relatorio_usina_v1');
    expect(textoTemplateRelatorio('João', 'agosto de 2026')).toBe(
      'Olá, João! ☀️ O relatório de agosto de 2026 da sua usina solar está pronto: quanto ela gerou, quanto você economizou e seus créditos.',
    );
  });
  it('texto livre = corpo do modelo + link', () => {
    const t = textoLivreRelatorio('João', 'agosto de 2026', 'https://p.x/rg/TOK');
    expect(t.startsWith(textoTemplateRelatorio('João', 'agosto de 2026'))).toBe(true);
    expect(t).toContain('Ver meu relatório: https://p.x/rg/TOK');
  });
  it('componentes do modelo: {{1}} nome, {{2}} mês, botão = token', () => {
    expect(componentesTemplateRelatorio('João', 'agosto de 2026', 'TOK')).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'João' }, { type: 'text', text: 'agosto de 2026' }] },
      { type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: 'TOK' }] },
    ]);
  });
  it('nome do arquivo e data/hora de Brasília', () => {
    expect(nomeArquivoRelatorio('351534', '2026-08-01')).toBe('relatorio-351534-2026-08.pdf');
    expect(dataHoraBrasilia('2026-09-27T13:05:00Z')).toBe('27/09 10:05');
    expect(dataHoraBrasilia('2026-09-28T01:30:00Z')).toBe('27/09 22:30');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/gd-relatorio-envio-textos.test.ts`
Expected: FAIL — `Failed to resolve import "../src/modules/gd/relatorio-envio-textos.js"`.

- [ ] **Step 3: Implement**

```ts
// src/modules/gd/relatorio-envio-textos.ts
// Envio do relatório mensal da usina (fatia 3) — peças PURAS: token do link
// público, o link, os textos do WhatsApp (o corpo do modelo Meta
// "relatorio_usina_v1" é EXATAMENTE textoTemplateRelatorio) e formatações.
// Ver docs/whatsapp-templates/relatorio_usina_v1.md.

import { randomBytes } from 'node:crypto';

export const TEMPLATE_RELATORIO = 'relatorio_usina_v1';

/** 24 bytes aleatórios em base64url = 32 caracteres. Impossível de adivinhar. */
const RE_TOKEN = /^[A-Za-z0-9_-]{32}$/;

/** Mesma base da Pasta Digital (propostas.<domínio>). */
export function basePublica(): string {
  return (process.env.PROPOSAL_PUBLIC_BASE_URL ?? 'https://propostas.ecosunpower.eng.br').replace(/\/+$/, '');
}

export function gerarTokenRelatorio(): string {
  return randomBytes(24).toString('base64url');
}

/** Tira pontuação que o WhatsApp/e-mail cola no fim do link; só aceita o formato exato. */
export function normalizarTokenRelatorio(raw: unknown): string | null {
  const s = String(raw ?? '').trim().replace(/[.,;:!?)\]}>'"]+$/, '');
  return RE_TOKEN.test(s) ? s : null;
}

/** /rg/ porque /r/:slug já é o relatório de acompanhamento da usina (index.ts). */
export function linkPublicoRelatorio(base: string, token: string): string {
  return `${base.replace(/\/+$/, '')}/rg/${token}`;
}

export function primeiroNome(nome: string | null | undefined): string {
  const p = String(nome ?? '').trim().split(/\s+/)[0] ?? '';
  if (!p) return 'cliente';
  return p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1).toLocaleLowerCase('pt-BR');
}

/** O corpo do modelo aprovado na Meta, com {{1}} = nome e {{2}} = mês por extenso. */
export function textoTemplateRelatorio(nome: string, mesExtenso: string): string {
  return `Olá, ${nome}! ☀️ O relatório de ${mesExtenso} da sua usina solar está pronto: quanto ela gerou, quanto você economizou e seus créditos.`;
}

/** Mensagem comum (sem modelo): mesmo texto + o link escrito. */
export function textoLivreRelatorio(nome: string, mesExtenso: string, link: string): string {
  return `${textoTemplateRelatorio(nome, mesExtenso)}\n\nVer meu relatório: ${link}`;
}

export interface ComponenteTemplate {
  type: 'body' | 'button';
  sub_type?: 'url';
  index?: number;
  parameters: Array<{ type: 'text'; text: string }>;
}

export function componentesTemplateRelatorio(nome: string, mesExtenso: string, token: string): ComponenteTemplate[] {
  return [
    { type: 'body', parameters: [{ type: 'text', text: nome }, { type: 'text', text: mesExtenso }] },
    { type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: token }] },
  ];
}

export function nomeArquivoRelatorio(instalacao: string, referencia: string): string {
  return `relatorio-${instalacao}-${referencia.slice(0, 7)}.pdf`;
}

/** 'DD/MM HH:mm' no horário de Brasília (UTC-3), independente do fuso do servidor. */
export function dataHoraBrasilia(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/gd-relatorio-envio-textos.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/modules/gd/relatorio-envio-textos.ts tests/gd-relatorio-envio-textos.test.ts
git commit -m "feat(gd): textos, token e link /rg/ do envio do relatorio

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Ficha do modelo `relatorio_usina_v1` para a Meta

**Files:**
- Create: `docs/whatsapp-templates/relatorio_usina_v1.md`

- [ ] **Step 1: Criar o arquivo**

```markdown
# Modelo de WhatsApp `relatorio_usina_v1` — o que preencher na Meta

Onde: Meta Business Suite → WhatsApp Manager → Modelos de mensagem → **Criar modelo**
(conta WABA da EcoSunPower — só a EcoSun usa modelo; empresas com WhatsApp próprio
recebem o relatório como mensagem comum pela instância delas).

| Campo | Valor |
|---|---|
| Categoria | **Utilidade** (Utility) |
| Nome | `relatorio_usina_v1` |
| Idioma | **Português (BR)** — `pt_BR`. ⚠️ NÃO escolher "Portuguese (POR)" (foi o erro do `pasta_digital_v1`). O código só tenta `pt_BR`. |
| Cabeçalho | Nenhum |
| Rodapé | Nenhum |

## Corpo (copiar exatamente)

    Olá, {{1}}! ☀️ O relatório de {{2}} da sua usina solar está pronto: quanto ela gerou, quanto você economizou e seus créditos.

Exemplos pedidos pela Meta:
- `{{1}}` → `João`
- `{{2}}` → `agosto de 2026`

## Botão

- Tipo: **Chamada para ação → Acessar o site**
- Texto do botão: `Ver meu relatório`
- Tipo de URL: **Dinâmica**
- URL: `https://propostas.ecosunpower.eng.br/rg/{{1}}`
- Exemplo: `https://propostas.ecosunpower.eng.br/rg/Zx9kQ2mN4pR7sT1vW3yA5bC8dE0fG6hJ`

> A URL tem que começar igual ao `PROPOSAL_PUBLIC_BASE_URL` de produção. Se lá for
> outro domínio, use o mesmo domínio aqui. O caminho é `/rg/` (o `/r/` já é usado
> pelo relatório de acompanhamento).

## Enquanto não aprovar

O sistema tenta o modelo; se a Meta recusar (não aprovado / não existe), manda a
mesma frase como mensagem comum com o link escrito. Mensagem comum só chega se o
cliente falou com a gente nas últimas 24 horas — a tela de resultado avisa isso.
Se nem a mensagem comum sair, a tela mostra ❌ "aguardando aprovação do modelo na Meta".

Se a Meta mudar a categoria para Marketing, aceite só se não houver alternativa
(marketing custa mais e respeita descadastro) e avise o Junior.

Depois de aprovado: nada para implantar — o próximo envio já usa o modelo.
```

- [ ] **Step 2: Commit**

```bash
git add docs/whatsapp-templates/relatorio_usina_v1.md
git commit -m "docs(gd): ficha do modelo relatorio_usina_v1 para a Meta

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Tela de resultado genérica (reusa a da pasta)

**Files:**
- Modify: `src/modules/relatorios/pasta/resultado-envio.ts` (arquivo inteiro)
- Test: `tests/resultado-envio.test.ts` (novo); `tests/pasta-envio-resultado.test.ts` continua passando sem mudança

- [ ] **Step 1: Write the failing test**

```ts
// tests/resultado-envio.test.ts
import { describe, it, expect } from 'vitest';
import { renderResultadoEnvio, motivoEmPortugues } from '../src/modules/relatorios/pasta/resultado-envio.js';

const base = {
  tituloOk: 'Relatório enviado', tituloConfira: 'Envio do relatório — confira',
  voltarHref: '/dashboard/demonstrativos/351534?mes=2026-08-01', voltarTexto: '← voltar para o cliente',
};

describe('renderResultadoEnvio — tela genérica depois de Enviar', () => {
  it('título e caminho de volta vêm de quem chama', () => {
    const h = renderResultadoEnvio({ ...base, zap: { ok: true, para: '5561991718505' }, email: { ok: true, para: 'j@x.com' } });
    expect(h).toContain('<title>Relatório enviado</title>');
    expect(h).toContain('href="/dashboard/demonstrativos/351534?mes=2026-08-01"');
    expect(h).toContain('← voltar para o cliente');
  });
  it('saiu com ressalva: ✅ e o aviso em destaque', () => {
    const h = renderResultadoEnvio({ ...base, zap: { ok: true, para: '5561991718505', aviso: 'saiu como mensagem comum' }, email: null });
    expect(h).toContain('✅');
    expect(h).toContain('⚠️ saiu como mensagem comum');
  });
  it('modelo não aprovado aparece em português claro, com o detalhe escapado', () => {
    const h = renderResultadoEnvio({ ...base, zap: { ok: false, reason: 'modelo_nao_aprovado', detalhe: '<b>132001</b>' }, email: null });
    expect(h).toMatch(/aguardando aprovação do modelo na Meta/);
    expect(h).toContain('&lt;b&gt;132001&lt;/b&gt;');
    expect(h).not.toContain('<b>132001</b>');
  });
  it('tenant sem WhatsApp conectado: explica que nunca sai pelo número de outra empresa', () => {
    const h = renderResultadoEnvio({ ...base, zap: { ok: false, reason: 'sem_canal' }, email: null });
    expect(h).toMatch(/não conectou o WhatsApp/);
  });
  it('link público aparece quando informado', () => {
    const h = renderResultadoEnvio({ ...base, zap: { ok: true }, email: null, linkPublico: 'https://p.x/rg/TOK' });
    expect(h).toContain('https://p.x/rg/TOK');
  });
  it('motivos de e-mail novos', () => {
    expect(motivoEmPortugues('email', 'opt_out')).toMatch(/pediu pra não receber/);
    expect(motivoEmPortugues('email', 'email_invalido')).toMatch(/e-mail do cliente está errado/);
    expect(motivoEmPortugues('zap', 'bloqueado_lgpd')).toMatch(/privacidade/);
    expect(motivoEmPortugues('zap', 'xyz')).toBe('xyz');
    expect(motivoEmPortugues('zap', null)).toBe('erro desconhecido');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/resultado-envio.test.ts`
Expected: FAIL — `renderResultadoEnvio is not a function`.

- [ ] **Step 3: Implement — substitua o arquivo inteiro**

```ts
// src/modules/relatorios/pasta/resultado-envio.ts
// A tela que aparece depois de um botão "Enviar" do dashboard: Pasta Digital
// e relatório mensal da usina (27/09/2026 — mesma tela, sem duplicar).
//
// 23/09/2026: o botão disparava zap + e-mail, mas só olhava o zap — se o
// e-mail não saía (cliente sem e-mail, provedor recusou), a tela redirecionava
// como se tudo tivesse ido. Agora cada canal mostra o que aconteceu de verdade.

export interface ResultadoCanal {
  ok: boolean;
  reason?: string;
  para?: string | null;
  /** Saiu, mas com ressalva que o operador precisa ler (ex.: foi como mensagem comum). */
  aviso?: string;
  /** Detalhe técnico do erro (mensagem do provedor), entre parênteses. */
  detalhe?: string;
}

export interface ResultadoEnvioPasta {
  pastaId: string;
  zap: ResultadoCanal;
  /** null = e-mail não configurado neste ambiente (sem RESEND_API_KEY). */
  email: ResultadoCanal | null;
}

export interface TelaResultadoEnvio {
  tituloOk: string;
  tituloConfira: string;
  voltarHref: string;
  voltarTexto: string;
  zap: ResultadoCanal;
  email: ResultadoCanal | null;
  linkPublico?: string | null;
}

const MOTIVO_ZAP: Record<string, string> = {
  nao_publicada: 'a pasta ainda não está publicada',
  lead_not_found: 'cliente não encontrado',
  pasta_not_found: 'pasta não encontrada',
  opt_out: 'cliente pediu pra não receber mensagens',
  sem_phone: 'cliente sem telefone cadastrado',
  telefone_invalido: 'o telefone do cliente está errado no cadastro (confira DDD e número)',
  ja_enviada: 'essa pasta já tinha sido enviada',
  sem_canal: 'a empresa ainda não conectou o WhatsApp dela (Configurações → WhatsApp) — a mensagem nunca sai pelo número de outra empresa',
  modelo_nao_aprovado: 'aguardando aprovação do modelo na Meta — e o cliente não falou com a gente nas últimas 24 horas, então a mensagem comum também não saiu',
  bloqueado_lgpd: 'esse número é de outra empresa da plataforma — bloqueado pela trava de privacidade (LGPD); confira o telefone do cliente',
  falha_envio: 'o WhatsApp recusou o envio',
};

const MOTIVO_EMAIL: Record<string, string> = {
  sem_email: 'o cliente não tem e-mail cadastrado',
  email_invalido: 'o e-mail do cliente está errado no cadastro',
  opt_out: 'cliente pediu pra não receber mensagens',
  falha_envio: 'o provedor de e-mail recusou o envio',
  nao_publicada: 'a pasta ainda não está publicada',
  lead_not_found: 'cliente não encontrado',
  pasta_not_found: 'pasta não encontrada',
};

/** Motivo em português claro (SEM escapar — quem desenha escapa). Desconhecido volta cru. */
export function motivoEmPortugues(canal: 'zap' | 'email', reason: string | null | undefined): string {
  const mapa = canal === 'zap' ? MOTIVO_ZAP : MOTIVO_EMAIL;
  return mapa[reason ?? ''] ?? reason ?? 'erro desconhecido';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function linha(icone: string, canal: string, texto: string): string {
  return `<p style="font-size:17px;margin:10px 0">${icone} <strong>${canal}:</strong> ${texto}</p>`;
}

function linhaCanal(nome: string, tipo: 'zap' | 'email', r: ResultadoCanal): string {
  if (r.ok) {
    const ok = linha('✅', nome, `enviado${r.para ? ` para ${esc(r.para)}` : ''}.`);
    return r.aviso ? `${ok}<p style="font-size:15px;margin:-6px 0 12px 26px;color:#92400e">⚠️ ${esc(r.aviso)}</p>` : ok;
  }
  const detalhe = r.detalhe ? ` (${esc(r.detalhe)})` : '';
  return linha('❌', nome, `não saiu — ${esc(motivoEmPortugues(tipo, r.reason))}${detalhe}.`);
}

export function renderResultadoEnvio(r: TelaResultadoEnvio): string {
  const zap = linhaCanal('WhatsApp', 'zap', r.zap);
  const email = r.email === null
    ? linha('⚠️', 'E-mail', 'o e-mail não está configurado neste ambiente — só o WhatsApp foi tentado.')
    : linhaCanal('E-mail', 'email', r.email);
  const tudoOk = r.zap.ok && (r.email?.ok ?? false);
  const titulo = tudoOk ? r.tituloOk : r.tituloConfira;
  const link = r.linkPublico
    ? `<p style="font-size:15px;margin:14px 0">🔗 Link do cliente: <a class="link" href="${esc(r.linkPublico)}" target="_blank" rel="noopener">${esc(r.linkPublico)}</a></p>`
    : '';

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${esc(titulo)}</title>
<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;color:#1c2430}
a.voltar{display:inline-block;margin-top:18px;padding:10px 18px;background:#0f1b2d;color:#fff;border-radius:8px;text-decoration:none}
a.link{color:#0e7490;word-break:break-all}</style>
</head><body><h2>${esc(titulo)}</h2>${zap}${email}${link}
<a class="voltar" href="${esc(r.voltarHref)}">${esc(r.voltarTexto)}</a></body></html>`;
}

export function renderResultadoEnvioPasta(r: ResultadoEnvioPasta): string {
  return renderResultadoEnvio({
    tituloOk: 'Pasta enviada',
    tituloConfira: 'Envio da pasta — confira',
    voltarHref: `/dashboard/pastas/${r.pastaId}`,
    voltarTexto: '← voltar para a pasta',
    zap: r.zap,
    email: r.email,
  });
}
```

- [ ] **Step 4: Run tests (novo + o da pasta, que não pode quebrar)**

Run: `npx vitest run tests/resultado-envio.test.ts tests/pasta-envio-resultado.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/modules/relatorios/pasta/resultado-envio.ts tests/resultado-envio.test.ts
git commit -m "refactor(envio): tela de resultado generica (pasta + relatorio) com aviso e novos motivos

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Moldura de e-mail sem logo (tenant não herda a logo da EcoSun)

**Files:**
- Modify: `src/modules/email/email-moldura.ts` (`MolduraOpts` ~15-50 e cabeçalho ~201)
- Test: `tests/email-moldura.test.ts` (acrescentar no fim)

- [ ] **Step 1: Write the failing test** — acrescente no FIM de `tests/email-moldura.test.ts`:

```ts
describe('montarMolduraEmail — semLogo (tenant sem logo https)', () => {
  it('escreve o nome da empresa no lugar da imagem e nunca usa a logo padrão da EcoSun', () => {
    const html = montarMolduraEmail({
      conteudoHtml: '<p>oi</p>', linkDescadastro: '', empresa: 'Conquista Solar',
      siteUrl: 'https://conquista.com', transacional: true, semLogo: true,
    });
    expect(html).toContain('Conquista Solar');
    expect(html).not.toContain('logo-ecosun-ecossistema.png');
    expect(html).not.toMatch(/<img /);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/email-moldura.test.ts`
Expected: FAIL — o HTML ainda contém `logo-ecosun-ecossistema.png` (e o tsc reclamaria de `semLogo`).

- [ ] **Step 3: Implement**

Em `MolduraOpts`, logo abaixo de `logoUrl?: string;`, acrescente:

```ts
  /**
   * Sem imagem no topo: escreve o nome da empresa. Para tenant sem logo https —
   * sem isso a moldura cairia na LOGO_PADRAO (EcoSun) = vazamento de marca.
   */
  semLogo?: boolean;
```

Em `montarMolduraEmail`, logo depois de `const siteLabel = siteUrl.replace(/^https?:\/\//, '');`, acrescente:

```ts
  const cabecalho = opts.semLogo
    ? `<div style="font-family:${FONTE}; font-size:26px; font-weight:bold; color:#ffffff;">${escapeHtml(empresa)}</div>`
    : `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(empresa)}" width="210" style="display:block; margin:0 auto; border:0; max-width:210px; height:auto;" />`;
```

e troque a linha do cabeçalho:

```
                <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(empresa)}" width="210" style="display:block; margin:0 auto; border:0; max-width:210px; height:auto;" />
```

por:

```
                ${cabecalho}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/email-moldura.test.ts tests/pasta-email.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/email/email-moldura.ts tests/email-moldura.test.ts
git commit -m "feat(email): moldura com semLogo (tenant sem logo nao herda a da EcoSun)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Orquestração do envio (quem recebe, por onde, resultado)

**Files:**
- Create: `src/modules/gd/relatorio-envio.ts`
- Test: `tests/gd-relatorio-envio.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/gd-relatorio-envio.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  destinoDoEnvio, enviarRelatorioZap, enviarRelatorioEmail, montarEmailRelatorio, logoEmailDaEmpresa,
  registrarEnvioNaConversa, resumoEnvio, type LeadDestino, type MensagemRelatorio,
} from '../src/modules/gd/relatorio-envio.js';
import { empresaDe } from '../src/modules/empresa-config.js';

const TENANT = '22222222-2222-2222-2222-222222222222';
const lead = (o: Partial<LeadDestino> = {}): LeadDestino => ({
  id: 'L1', nome: 'JOÃO SILVA', phone: '61991718505', email: 'joao@x.com', optOut: false, ...o,
});
const livre = { canal: 'casa' as const, bloqueadoLgpd: () => false };
const msg: MensagemRelatorio = {
  nome: 'João', mesExtenso: 'agosto de 2026', token: 'T'.repeat(32), link: 'https://p.x/rg/TTT',
  pdf: Buffer.from('%PDF'), nomeArquivo: 'relatorio-351534-2026-08.pdf',
};

describe('destinoDoEnvio', () => {
  it('caso normal: telefone normalizado 55DD9… e e-mail', () => {
    expect(destinoDoEnvio(lead(), livre)).toEqual({
      zap: { fone: '5561991718505', motivo: null }, email: { para: 'joao@x.com', motivo: null },
    });
  });
  it('opt_out bloqueia os dois canais com motivo', () => {
    const d = destinoDoEnvio(lead({ optOut: true }), livre);
    expect(d.zap).toEqual({ fone: null, motivo: 'opt_out' });
    expect(d.email).toEqual({ para: null, motivo: 'opt_out' });
  });
  it('tenant sem WhatsApp conectado: zap não sai, e-mail sai', () => {
    const d = destinoDoEnvio(lead(), { canal: 'nenhum', bloqueadoLgpd: () => false });
    expect(d.zap.motivo).toBe('sem_canal');
    expect(d.email.para).toBe('joao@x.com');
  });
  it('sem telefone / telefone errado', () => {
    expect(destinoDoEnvio(lead({ phone: null }), livre).zap.motivo).toBe('sem_phone');
    expect(destinoDoEnvio(lead({ phone: '  ' }), livre).zap.motivo).toBe('sem_phone');
    expect(destinoDoEnvio(lead({ phone: '123' }), livre).zap.motivo).toBe('telefone_invalido');
  });
  it('trava LGPD vira motivo visível (o sendText engoliria em silêncio)', () => {
    const d = destinoDoEnvio(lead(), { canal: 'evolution', bloqueadoLgpd: (f) => f === '5561991718505' });
    expect(d.zap).toEqual({ fone: null, motivo: 'bloqueado_lgpd' });
  });
  it('sem e-mail / e-mail errado', () => {
    expect(destinoDoEnvio(lead({ email: null }), livre).email.motivo).toBe('sem_email');
    expect(destinoDoEnvio(lead({ email: 'joao@' }), livre).email.motivo).toBe('email_invalido');
  });
});

describe('enviarRelatorioZap', () => {
  const fone = { fone: '5561991718505', motivo: null };

  it('EcoSun: modelo aprovado sai e o texto livre nem é tentado', async () => {
    const sendText = vi.fn();
    const sendTemplate = vi.fn().mockResolvedValue({ messageId: 'w1' });
    const r = await enviarRelatorioZap(fone, msg, { canal: 'casa', sendText, sendTemplate });
    expect(sendTemplate).toHaveBeenCalledWith('5561991718505', 'relatorio_usina_v1', 'pt_BR', [
      { type: 'body', parameters: [{ type: 'text', text: 'João' }, { type: 'text', text: 'agosto de 2026' }] },
      { type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: 'T'.repeat(32) }] },
    ]);
    expect(sendText).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, para: '5561991718505' });
    expect(r.aviso).toBeUndefined();
    expect(r.textoEnviado).toMatch(/^Olá, João!/);
  });
  it('EcoSun: modelo recusado → mensagem comum com o link e AVISO na tela', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const sendTemplate = vi.fn().mockRejectedValue(new Error('template not found'));
    const r = await enviarRelatorioZap(fone, msg, { canal: 'casa', sendText, sendTemplate });
    expect(sendText).toHaveBeenCalledWith('5561991718505', expect.stringContaining('https://p.x/rg/TTT'));
    expect(r.ok).toBe(true);
    expect(r.aviso).toMatch(/aprovado na Meta/);
  });
  it('EcoSun: modelo E mensagem comum falham → ❌ modelo_nao_aprovado com os dois erros', async () => {
    const r = await enviarRelatorioZap(fone, msg, {
      canal: 'casa',
      sendTemplate: vi.fn().mockRejectedValue(new Error('132001')),
      sendText: vi.fn().mockRejectedValue(new Error('fora da janela')),
    });
    expect(r).toMatchObject({ ok: false, reason: 'modelo_nao_aprovado' });
    expect(r.detalhe).toContain('132001');
    expect(r.detalhe).toContain('fora da janela');
  });
  it('EcoSun sem sendTemplate (sem WABA) → texto com aviso', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const r = await enviarRelatorioZap(fone, msg, { canal: 'casa', sendText });
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
    expect(r.aviso).toBeDefined();
  });
  it('tenant (Evolution): NUNCA usa o modelo da EcoSun; manda texto + PDF anexo', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const sendTemplate = vi.fn();
    const sendDocument = vi.fn().mockResolvedValue(undefined);
    const r = await enviarRelatorioZap(fone, msg, { canal: 'evolution', sendText, sendTemplate, sendDocument });
    expect(sendTemplate).not.toHaveBeenCalled();
    expect(sendText).toHaveBeenCalledWith('5561991718505', expect.stringContaining('Ver meu relatório: https://p.x/rg/TTT'));
    expect(sendDocument).toHaveBeenCalledWith('5561991718505', 'JVBERg==', 'relatorio-351534-2026-08.pdf', 'Relatório de agosto de 2026');
    expect(r).toMatchObject({ ok: true, para: '5561991718505' });
    expect(r.aviso).toBeUndefined();
  });
  it('tenant: PDF anexo falhou → ✅ (o link saiu) com aviso', async () => {
    const r = await enviarRelatorioZap(fone, msg, {
      canal: 'evolution', sendText: vi.fn().mockResolvedValue(undefined),
      sendDocument: vi.fn().mockRejectedValue(new Error('413')),
    });
    expect(r.ok).toBe(true);
    expect(r.aviso).toMatch(/PDF anexo/);
  });
  it('tenant: texto falhou → ❌ falha_envio', async () => {
    const r = await enviarRelatorioZap(fone, msg, { canal: 'evolution', sendText: vi.fn().mockRejectedValue(new Error('instância desconectada')) });
    expect(r).toMatchObject({ ok: false, reason: 'falha_envio', detalhe: 'instância desconectada' });
  });
  it('destino sem telefone ou canal "nenhum": nada é chamado', async () => {
    const sendText = vi.fn();
    expect(await enviarRelatorioZap({ fone: null, motivo: 'opt_out' }, msg, { canal: 'casa', sendText }))
      .toEqual({ ok: false, reason: 'opt_out' });
    expect(await enviarRelatorioZap(fone, msg, { canal: 'nenhum', sendText }))
      .toEqual({ ok: false, reason: 'sem_canal' });
    expect(sendText).not.toHaveBeenCalled();
  });
});

describe('e-mail do relatório', () => {
  const tenant = { ...empresaDe(TENANT), nomeFantasia: 'Conquista Solar', siteUrl: 'https://conquista.com', logoStoragePath: '' };

  it('logo: EcoSun usa a padrão; tenant com https usa a dele; tenant sem https fica sem imagem', () => {
    expect(logoEmailDaEmpresa(empresaDe(null))).toEqual({});
    expect(logoEmailDaEmpresa({ ...tenant, logoStoragePath: 'https://cdn.x/l.png' })).toEqual({ logoUrl: 'https://cdn.x/l.png' });
    expect(logoEmailDaEmpresa({ ...tenant, logoStoragePath: 'logos/l.png' })).toEqual({ semLogo: true });
  });
  it('e-mail do tenant: marca dele, link, botão — nenhuma menção à EcoSun', () => {
    const { assunto, html } = montarEmailRelatorio({ nome: 'João', mesExtenso: 'agosto de 2026', link: 'https://p.x/rg/TTT' }, tenant);
    expect(assunto).toBe('João, o relatório de agosto de 2026 da sua usina solar');
    expect(html).toContain('https://p.x/rg/TTT');
    expect(html).toContain('Ver meu relatório');
    expect(html).toContain('Conquista Solar');
    expect(html).not.toMatch(/ecosun/i);
  });
  it('sem Resend configurado → null (a tela diz que o e-mail está desligado)', async () => {
    expect(await enviarRelatorioEmail({ para: 'joao@x.com', motivo: null }, msg, { leadId: 'L1', empresa: tenant },
      { registrarEmailEnviado: vi.fn() })).toBeNull();
  });
  it('destino sem e-mail → motivo', async () => {
    const r = await enviarRelatorioEmail({ para: null, motivo: 'sem_email' }, msg, { leadId: 'L1', empresa: tenant },
      { enviarEmail: vi.fn(), registrarEmailEnviado: vi.fn() });
    expect(r).toEqual({ ok: false, reason: 'sem_email' });
  });
  it('envia e carimba em emails_enviados com contexto relatorio_gd', async () => {
    const enviarEmail = vi.fn().mockResolvedValue('mid-1');
    const registrarEmailEnviado = vi.fn().mockResolvedValue(undefined);
    const r = await enviarRelatorioEmail({ para: 'joao@x.com', motivo: null }, msg, { leadId: 'L1', empresa: tenant },
      { enviarEmail, registrarEmailEnviado });
    expect(r).toEqual({ ok: true, para: 'joao@x.com' });
    expect(enviarEmail.mock.calls[0][0].to).toBe('joao@x.com');
    expect(enviarEmail.mock.calls[0][0].html).toContain('https://p.x/rg/TTT');
    expect(registrarEmailEnviado).toHaveBeenCalledWith({
      leadId: 'L1', companyId: TENANT, providerMessageId: 'mid-1', para: 'joao@x.com',
      assunto: 'João, o relatório de agosto de 2026 da sua usina solar', contexto: 'relatorio_gd',
    });
  });
  it('provedor recusou → ❌ falha_envio com detalhe', async () => {
    const r = await enviarRelatorioEmail({ para: 'joao@x.com', motivo: null }, msg, { leadId: 'L1', empresa: tenant },
      { enviarEmail: vi.fn().mockRejectedValue(new Error('domain not verified')), registrarEmailEnviado: vi.fn() });
    expect(r).toEqual({ ok: false, reason: 'falha_envio', detalhe: 'domain not verified', para: 'joao@x.com' });
  });
});

describe('registrarEnvioNaConversa + resumoEnvio', () => {
  it('grava a mensagem da Eva na conversa do cliente (a atendente vê)', async () => {
    const db = {
      getOrCreateConversation: vi.fn().mockResolvedValue({ id: 'C1', messages: [{ role: 'user', content: 'oi', timestamp: 't' }], message_count: 1 }),
      updateConversation: vi.fn().mockResolvedValue(undefined),
    };
    await registrarEnvioNaConversa(db as any, 'L1', TENANT, 'agosto de 2026', 'Olá, João!');
    expect(db.getOrCreateConversation).toHaveBeenCalledWith('L1', TENANT);
    const upd = db.updateConversation.mock.calls[0][1];
    expect(upd.message_count).toBe(2);
    expect(upd.messages).toHaveLength(2);
    expect(upd.messages[1].role).toBe('assistant');
    expect(upd.messages[1].content).toContain('Relatório de agosto de 2026');
    expect(upd.messages[1].content).toContain('Olá, João!');
  });
  it('resumo: carimba envio só se algum canal saiu; guarda o resultado de cada um', () => {
    const r = resumoEnvio({ ok: true, para: '5561991718505', aviso: 'x' }, { ok: false, reason: 'sem_email' });
    expect(r.algumOk).toBe(true);
    expect(r.zapPara).toBe('5561991718505');
    expect(r.emailPara).toBeNull();
    expect(r.envio).toEqual({
      zap: { ok: true, motivo: null, para: '5561991718505', aviso: 'x', detalhe: null },
      email: { ok: false, motivo: 'sem_email', para: null, aviso: null, detalhe: null },
    });
    const nada = resumoEnvio({ ok: false, reason: 'opt_out' }, null);
    expect(nada.algumOk).toBe(false);
    expect(nada.envio.email).toEqual({ configurado: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/gd-relatorio-envio.test.ts`
Expected: FAIL — `Failed to resolve import "../src/modules/gd/relatorio-envio.js"`.

- [ ] **Step 3: Implement**

```ts
// src/modules/gd/relatorio-envio.ts
// Envio do relatório mensal da usina ao cliente (fatia 3 dos demonstrativos).
// Decide QUEM recebe e POR ONDE, manda e devolve o resultado de cada canal —
// sem banco e sem Express: a rota injeta os envios (já rodando dentro da
// empresa e do canal dela, ver dashboard/canal-envio.ts) e o teste injeta
// fakes. Nunca falha em silêncio: todo "não saiu" volta com motivo pra tela.

import { normalizeBrazilianPhone } from '../meta-leadgen.js';
import { montarMolduraEmail, escapeHtml } from '../email/email-moldura.js';
import { ehEcosun, type EmpresaConfig } from '../empresa-config.js';
import type { ResultadoCanal } from '../relatorios/pasta/resultado-envio.js';
import type { SupabaseService } from '../supabase.js';
import {
  TEMPLATE_RELATORIO, componentesTemplateRelatorio, textoLivreRelatorio, textoTemplateRelatorio,
  type ComponenteTemplate,
} from './relatorio-envio-textos.js';

/** casa = EcoSun (WABA/canal padrão) · evolution = instância própria do tenant · nenhum = tenant sem WhatsApp conectado. */
export type CanalZap = 'casa' | 'evolution' | 'nenhum';

export interface LeadDestino {
  id: string;
  nome: string | null;
  phone: string | null;
  email: string | null;
  optOut: boolean;
}

export interface DestinoEnvio {
  zap: { fone: string | null; motivo: string | null };
  email: { para: string | null; motivo: string | null };
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function destinoDoEnvio(
  lead: LeadDestino,
  o: { canal: CanalZap; bloqueadoLgpd: (fone: string) => boolean },
): DestinoEnvio {
  let zap: DestinoEnvio['zap'];
  if (lead.optOut) zap = { fone: null, motivo: 'opt_out' };
  else if (o.canal === 'nenhum') zap = { fone: null, motivo: 'sem_canal' };
  else if (!String(lead.phone ?? '').trim()) zap = { fone: null, motivo: 'sem_phone' };
  else {
    // Sempre 55DDNNNNNNNNN (caso Nelson, 23/09): número cru a Meta lê errado.
    const fone = normalizeBrazilianPhone(String(lead.phone));
    if (!fone) zap = { fone: null, motivo: 'telefone_invalido' };
    // A trava LGPD do sendText descarta em silêncio — aqui ela vira motivo na tela.
    else if (o.bloqueadoLgpd(fone)) zap = { fone: null, motivo: 'bloqueado_lgpd' };
    else zap = { fone, motivo: null };
  }

  const bruto = String(lead.email ?? '').trim();
  let email: DestinoEnvio['email'];
  if (lead.optOut) email = { para: null, motivo: 'opt_out' };
  else if (!bruto) email = { para: null, motivo: 'sem_email' };
  else if (!RE_EMAIL.test(bruto)) email = { para: null, motivo: 'email_invalido' };
  else email = { para: bruto, motivo: null };

  return { zap, email };
}

export interface MensagemRelatorio {
  nome: string;
  mesExtenso: string;
  token: string;
  link: string;
  pdf: Buffer | null;
  nomeArquivo: string;
}

export interface DepsZapRelatorio {
  canal: CanalZap;
  sendText: (to: string, text: string) => Promise<void>;
  /** Só EcoSun (WABA). A rota passa undefined para tenant. */
  sendTemplate?: (to: string, name: string, lang: string, components: ComponenteTemplate[]) => Promise<unknown>;
  /** Só tenant (Evolution): o PDF anexo. */
  sendDocument?: (to: string, base64: string, fileName: string, caption: string) => Promise<void>;
}

export interface ResultadoZapRelatorio extends ResultadoCanal {
  /** O que o cliente recebeu — vai pra conversa dele no painel. */
  textoEnviado?: string;
}

const AVISO_TEXTO_LIVRE =
  `saiu como mensagem comum porque o modelo "${TEMPLATE_RELATORIO}" ainda não foi aprovado na Meta — ` +
  'só chega se o cliente falou com a gente nas últimas 24 horas';

export async function enviarRelatorioZap(
  dest: DestinoEnvio['zap'],
  m: MensagemRelatorio,
  d: DepsZapRelatorio,
): Promise<ResultadoZapRelatorio> {
  if (d.canal === 'nenhum') return { ok: false, reason: 'sem_canal' };
  if (!dest.fone) return { ok: false, reason: dest.motivo ?? 'sem_phone' };
  const fone = dest.fone;
  const livre = textoLivreRelatorio(m.nome, m.mesExtenso, m.link);

  if (d.canal === 'evolution') {
    // Número próprio do tenant: mensagem comum sempre chega (não há janela de 24 h).
    try {
      await d.sendText(fone, livre);
    } catch (err) {
      return { ok: false, reason: 'falha_envio', detalhe: (err as Error).message, para: fone };
    }
    let aviso: string | undefined;
    if (d.sendDocument && m.pdf) {
      try {
        await d.sendDocument(fone, m.pdf.toString('base64'), m.nomeArquivo, `Relatório de ${m.mesExtenso}`);
      } catch (err) {
        aviso = `a mensagem com o link saiu, mas o PDF anexo não (${(err as Error).message})`;
      }
    }
    return { ok: true, para: fone, aviso, textoEnviado: livre };
  }

  // EcoSun: modelo aprovado primeiro (chega com a janela de 24 h fechada).
  let erroModelo = 'modelo não configurado neste ambiente';
  if (d.sendTemplate) {
    try {
      await d.sendTemplate(fone, TEMPLATE_RELATORIO, 'pt_BR', componentesTemplateRelatorio(m.nome, m.mesExtenso, m.token));
      return { ok: true, para: fone, textoEnviado: textoTemplateRelatorio(m.nome, m.mesExtenso) };
    } catch (err) {
      erroModelo = (err as Error).message;
      console.warn(`[relatorio-gd] modelo ${TEMPLATE_RELATORIO} recusado: ${erroModelo}`);
    }
  }
  try {
    await d.sendText(fone, livre);
    return { ok: true, para: fone, aviso: AVISO_TEXTO_LIVRE, textoEnviado: livre };
  } catch (err) {
    return { ok: false, reason: 'modelo_nao_aprovado', detalhe: `${erroModelo} / ${(err as Error).message}`, para: fone };
  }
}

/** Logo do e-mail: EcoSun usa a padrão da moldura; tenant usa a dele (https) ou fica só com o nome. */
export function logoEmailDaEmpresa(e: Readonly<EmpresaConfig>): { logoUrl?: string; semLogo?: boolean } {
  if (ehEcosun(e)) return {};
  const caminho = (e.logoStoragePath ?? '').trim();
  return /^https:\/\//i.test(caminho) ? { logoUrl: caminho } : { semLogo: true };
}

export function montarEmailRelatorio(
  m: { nome: string; mesExtenso: string; link: string },
  e: Readonly<EmpresaConfig>,
): { assunto: string; html: string } {
  const assunto = `${m.nome}, o relatório de ${m.mesExtenso} da sua usina solar`;
  const conteudoHtml =
    `<p>Olá, ${escapeHtml(m.nome)}!</p>` +
    `<p>O relatório de <strong>${escapeHtml(m.mesExtenso)}</strong> da sua usina solar está pronto: ` +
    'quanto ela gerou, quanto você economizou e como estão os seus créditos.</p>' +
    '<p>É só tocar no botão abaixo para abrir. Guarde este e-mail — o link continua valendo.</p>';
  const html = montarMolduraEmail({
    conteudoHtml,
    linkDescadastro: '',
    empresa: e.nomeFantasia,
    siteUrl: e.siteUrl,
    ...logoEmailDaEmpresa(e),
    kicker: 'Relatório mensal da usina',
    titulo: `Sua usina em ${m.mesExtenso}`,
    ctaLabel: 'Ver meu relatório',
    ctaUrl: m.link,
    // Relatório do que o cliente contratou: serviço, não newsletter.
    transacional: true,
    notaRodape: 'Este e-mail traz o relatório da usina que você contratou.',
  });
  return { assunto, html };
}

export interface DepsEmailRelatorio {
  /** undefined = e-mail não configurado neste ambiente (sem RESEND_API_KEY). */
  enviarEmail?: (e: { to: string; subject: string; html: string }) => Promise<string>;
  registrarEmailEnviado: (d: {
    leadId: string; companyId: string; providerMessageId: string; para: string; assunto: string; contexto: string;
  }) => Promise<void>;
}

/** Só o link, nenhum anexo (mesmo motivo da pasta: anexo grande vira bounce silencioso). */
export async function enviarRelatorioEmail(
  dest: DestinoEnvio['email'],
  m: { nome: string; mesExtenso: string; link: string },
  alvo: { leadId: string; empresa: Readonly<EmpresaConfig> },
  d: DepsEmailRelatorio,
): Promise<ResultadoCanal | null> {
  if (!d.enviarEmail) return null;
  if (!dest.para) return { ok: false, reason: dest.motivo ?? 'sem_email' };
  const { assunto, html } = montarEmailRelatorio(m, alvo.empresa);
  let mid: string;
  try {
    mid = await d.enviarEmail({ to: dest.para, subject: assunto, html });
  } catch (err) {
    return { ok: false, reason: 'falha_envio', detalhe: (err as Error).message, para: dest.para };
  }
  await d.registrarEmailEnviado({
    leadId: alvo.leadId, companyId: alvo.empresa.companyId, providerMessageId: mid,
    para: dest.para, assunto, contexto: 'relatorio_gd',
  }).catch(() => {});
  return { ok: true, para: dest.para };
}

/** Mesmo padrão do registrarMensagemEvaNaConversa (proposal-followup.ts): a atendente vê o que saiu. */
export async function registrarEnvioNaConversa(
  db: Pick<SupabaseService, 'getOrCreateConversation' | 'updateConversation'>,
  leadId: string,
  companyId: string,
  mesExtenso: string,
  texto: string,
): Promise<void> {
  const conv = await db.getOrCreateConversation(leadId, companyId);
  await db.updateConversation(conv.id, {
    messages: [
      ...conv.messages,
      {
        role: 'assistant' as const,
        content: `📊 Relatório de ${mesExtenso} enviado pela tela de demonstrativos:\n\n${texto}`,
        timestamp: new Date().toISOString(),
      },
    ],
    message_count: conv.message_count + 1,
  });
}

export interface ResumoEnvio {
  algumOk: boolean;
  zapPara: string | null;
  emailPara: string | null;
  envio: Record<string, unknown>;
}

export function resumoEnvio(zap: ResultadoCanal, email: ResultadoCanal | null): ResumoEnvio {
  const canal = (c: ResultadoCanal | null) => (c === null
    ? { configurado: false }
    : { ok: c.ok, motivo: c.reason ?? null, para: c.para ?? null, aviso: c.aviso ?? null, detalhe: c.detalhe ?? null });
  return {
    algumOk: zap.ok || Boolean(email?.ok),
    zapPara: zap.ok ? zap.para ?? null : null,
    emailPara: email?.ok ? email.para ?? null : null,
    envio: { zap: canal(zap), email: canal(email) },
  };
}
```

- [ ] **Step 4: Run test + tsc**

Run: `npx vitest run tests/gd-relatorio-envio.test.ts && npx tsc --noEmit`
Expected: PASS, tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add src/modules/gd/relatorio-envio.ts tests/gd-relatorio-envio.test.ts
git commit -m "feat(gd): orquestracao do envio do relatorio (destino, zap, e-mail, conversa)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `EvolutionService.sendDocument` (PDF em base64)

**Files:**
- Modify: `src/modules/evolution.ts` (depois de `sendMedia`, ~linha 191)
- Test: `tests/evolution-send-document.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/evolution-send-document.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EvolutionService } from '../src/modules/evolution.js';
import { comCanal } from '../src/modules/canal-contexto.js';

const cfg = { evolutionApiUrl: 'http://evo:8080', evolutionApiKey: 'k', evolutionInstance: 'eva', webhookToken: 't' };
afterEach(() => vi.unstubAllGlobals());

describe('EvolutionService.sendDocument', () => {
  it('manda o PDF em base64 como documento pela instância do tenant em contexto', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ key: { id: 'doc-1' } }) });
    vi.stubGlobal('fetch', fetchMock);
    const s = new EvolutionService(cfg);
    const r = await comCanal({ companyId: 'T1', evolutionInstance: 'conquista-solar' },
      () => s.sendDocument('5561991718505', 'JVBERg==', 'relatorio.pdf', 'Relatório de agosto de 2026'));
    expect(r.messageId).toBe('doc-1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://evo:8080/message/sendMedia/conquista-solar');
    expect(init.headers).toMatchObject({ apikey: 'k' });
    expect(JSON.parse(init.body)).toEqual({
      number: '5561991718505', mediatype: 'document', mimetype: 'application/pdf',
      media: 'JVBERg==', fileName: 'relatorio.pdf', caption: 'Relatório de agosto de 2026',
    });
  });
  it('erro da Evolution vira exceção com o status (nunca some)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad' }));
    const s = new EvolutionService(cfg);
    await expect(s.sendDocument('5561991718505', 'JVBERg==', 'r.pdf', 'x')).rejects.toThrow(/sendDocument 400/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/evolution-send-document.test.ts`
Expected: FAIL — `s.sendDocument is not a function`.

- [ ] **Step 3: Implement** — logo DEPOIS do método `sendMedia` (antes de `getMediaBase64`):

```ts
  // Arquivo (PDF) em base64 como DOCUMENTO — o relatório mensal da usina vai
  // anexo pela instância do tenant (canal-contexto). Base64 no corpo: não
  // depende de a Evolution conseguir baixar uma URL do nosso storage.
  async sendDocument(
    to: string,
    base64: string,
    fileName: string,
    caption: string,
    mimetype = 'application/pdf',
  ): Promise<{ messageId: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(`${this.baseUrl}/message/sendMedia/${this.instanciaAtual()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: this.apiKey },
        body: JSON.stringify({ number: to, mediatype: 'document', mimetype, media: base64, fileName, caption }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Evolution sendDocument ${res.status}: ${err}`);
      }
      const data = await res.json() as Record<string, unknown>;
      const key = (data.key ?? (data as { data?: { key?: Record<string, string> } }).data?.key) as
        | Record<string, string>
        | undefined;
      return { messageId: key?.id ?? '' };
    } finally {
      clearTimeout(timer);
    }
  }
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/evolution-send-document.test.ts tests/evolution.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/evolution.ts tests/evolution-send-document.test.ts
git commit -m "feat(evolution): sendDocument (PDF em base64 pela instancia em contexto)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Canal da empresa no painel (`canalZapDaEmpresa` / `noCanalDaEmpresa`)

**Files:**
- Create: `src/modules/dashboard/canal-envio.ts`
- Test: `tests/canal-envio.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/canal-envio.test.ts
import { describe, it, expect } from 'vitest';
import { canalZapDaEmpresa, noCanalDaEmpresa, EMPRESA_CASA } from '../src/modules/dashboard/canal-envio.js';
import { canalAtual, canalExigeEvolution } from '../src/modules/canal-contexto.js';
import { empresa } from '../src/modules/empresa-config.js';

const TENANT = '22222222-2222-2222-2222-222222222222';

describe('canalZapDaEmpresa', () => {
  it('instância própria → evolution; EcoSun sem instância → casa; tenant sem instância → nenhum', () => {
    expect(canalZapDaEmpresa(TENANT, 'conquista-solar')).toBe('evolution');
    expect(canalZapDaEmpresa(EMPRESA_CASA, null)).toBe('casa');
    expect(canalZapDaEmpresa(TENANT, null)).toBe('nenhum');
    expect(canalZapDaEmpresa(TENANT, undefined)).toBe('nenhum');
  });
});

describe('noCanalDaEmpresa', () => {
  it('tenant: dentro do fn a empresa e o canal são os dele, mesmo depois de await', async () => {
    const visto = await noCanalDaEmpresa(TENANT, 'conquista-solar', async () => {
      await Promise.resolve();
      return { canal: canalAtual(), exige: canalExigeEvolution(), empresa: empresa().companyId };
    });
    expect(visto).toEqual({ canal: { companyId: TENANT, evolutionInstance: 'conquista-solar' }, exige: true, empresa: TENANT });
    expect(canalAtual()).toBeUndefined();
  });
  it('EcoSun: sem instância → canal padrão (não exige Evolution)', async () => {
    const visto = await noCanalDaEmpresa(EMPRESA_CASA, null, async () => ({ exige: canalExigeEvolution(), empresa: empresa().companyId }));
    expect(visto).toEqual({ exige: false, empresa: EMPRESA_CASA });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/canal-envio.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implement**

```ts
// src/modules/dashboard/canal-envio.ts
// Envio disparado pelo PAINEL roda dentro da empresa de quem clicou e do canal
// dela. Sem isso (bug até 27/09/2026) o sendText do index.ts não sabia de quem
// era a mensagem e um tenant (ex.: Conquista Solar) mandava a Pasta Digital
// pelo número da EcoSunPower. Regra: tenant sem instância Evolution própria
// NÃO manda zap — nunca pelo número de outra empresa.

import { comCanal } from '../canal-contexto.js';
import { comEmpresaDe } from '../empresa-config.js';
import type { CanalZap } from '../gd/relatorio-envio.js';

export const EMPRESA_CASA = '00000000-0000-0000-0000-000000000001';

export function canalZapDaEmpresa(companyId: string, instancia: string | null | undefined): CanalZap {
  if (instancia) return 'evolution';
  return companyId === EMPRESA_CASA ? 'casa' : 'nenhum';
}

/** Roda `fn` com empresa() = a empresa e canalAtual() = a instância dela (sendText escolhe Evolution sozinho). */
export function noCanalDaEmpresa<T>(
  companyId: string,
  instancia: string | null | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return comEmpresaDe(companyId, () => comCanal({ companyId, evolutionInstance: instancia ?? undefined }, fn));
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest run tests/canal-envio.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/canal-envio.ts tests/canal-envio.test.ts
git commit -m "feat(dashboard): envio do painel roda na empresa e no canal de quem clicou

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Migration 133 + métodos do repo

**Files:**
- Create: `supabase/migrations/133_relatorios_gd_envio.sql`
- Modify: `src/modules/gd/demonstrativos-tela-repo.ts` (dentro de `criarRepoTelaGd`, depois de `registrarRelatorio`)
- Test: `tests/gd-demonstrativos-tela-repo-envio.test.ts`

- [ ] **Step 1: Escrever a migration** (número 133 já combinado no grupo)

```sql
-- 133_relatorios_gd_envio.sql
--
-- ENVIAR O RELATÓRIO AO CLIENTE PELA EVA (Junior 27/09/2026) — fatia 3 dos demonstrativos.
-- Plano: docs/superpowers/plans/2026-09-27-demonstrativos-enviar-relatorio-eva.md
--
-- Cada relatório ENVIADO ganha: o cliente (lead_id), o token do link público
-- /rg/<token>, onde o PDF ficou guardado (bucket client-attachments) e o
-- resultado de cada canal. A rota pública busca SÓ pelo token.
-- RLS: a tabela já tem FORCE RLS por empresa (132) — nada muda.

alter table relatorios_gd_gerados
  add column if not exists lead_id            uuid,
  add column if not exists token              text,
  add column if not exists storage_path       text,
  add column if not exists enviado_em         timestamptz,
  add column if not exists enviado_zap_para   text,
  add column if not exists enviado_email_para text,
  add column if not exists envio              jsonb;

create unique index if not exists relatorios_gd_gerados_token_uniq
  on relatorios_gd_gerados (token);

-- Pasta Digital: "relatórios enviados deste cliente", do mais novo pro mais velho.
create index if not exists relatorios_gd_gerados_lead_enviados
  on relatorios_gd_gerados (lead_id, referencia desc)
  where enviado_em is not null;

-- Tela do cliente: "já enviado em DD/MM" do mês.
create index if not exists relatorios_gd_gerados_envio_mes
  on relatorios_gd_gerados (company_id, instalacao, referencia, enviado_em desc)
  where enviado_em is not null;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/gd-demonstrativos-tela-repo-envio.test.ts
import { describe, it, expect } from 'vitest';
import { criarRepoTelaGd } from '../src/modules/gd/demonstrativos-tela-repo.js';

function fakeDb(respostas: Record<string, Array<{ data: any; error: any }>>) {
  const chamadas: Array<{ tabela: string; ops: Array<[string, any[]]> }> = [];
  const db = {
    from(tabela: string) {
      const c = { tabela, ops: [] as Array<[string, any[]]> };
      chamadas.push(c);
      const fila = respostas[tabela] ?? [];
      const q: any = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            const r = fila.shift() ?? { data: [], error: null };
            return (res: any) => Promise.resolve(r).then(res);
          }
          return (...args: any[]) => { c.ops.push([prop, args]); return q; };
        },
      });
      return q;
    },
  };
  return { db: db as any, chamadas };
}

const PARA_ENVIO = {
  instalacao: '351534', referencia: '2026-08-01', geradoPor: 'U1', numeros: { gerouKwh: 612 },
  leadId: 'L1', token: 'T'.repeat(32), storagePath: 'L1/relatorio-gd/a.pdf',
};

describe('repo — envio do relatório (fatia 3)', () => {
  it('criarRelatorioParaEnvio grava empresa, cliente, token e PDF e devolve o id', async () => {
    const { db, chamadas } = fakeDb({ relatorios_gd_gerados: [{ data: { id: 'R1' }, error: null }] });
    expect(await criarRepoTelaGd(db, 'E1').criarRelatorioParaEnvio(PARA_ENVIO)).toBe('R1');
    const ins = chamadas[0].ops.find((o) => o[0] === 'insert')!;
    expect(ins[1][0]).toEqual({
      company_id: 'E1', instalacao: '351534', referencia: '2026-08-01', gerado_por: 'U1', numeros: { gerouKwh: 612 },
      lead_id: 'L1', token: 'T'.repeat(32), storage_path: 'L1/relatorio-gd/a.pdf',
    });
  });
  it('criarRelatorioParaEnvio: erro do banco (ex.: 133 não aplicada) sobe com contexto', async () => {
    const { db } = fakeDb({ relatorios_gd_gerados: [{ data: null, error: { message: 'column "token" does not exist' } }] });
    await expect(criarRepoTelaGd(db, 'E1').criarRelatorioParaEnvio(PARA_ENVIO)).rejects.toThrow(/criar p\/ envio.*token/);
  });
  it('marcarEnvio: carimba enviado_em só se algum canal saiu; sempre filtra empresa e id', async () => {
    const { db, chamadas } = fakeDb({ relatorios_gd_gerados: [{ data: null, error: null }, { data: null, error: null }] });
    const repo = criarRepoTelaGd(db, 'E1');
    await repo.marcarEnvio('R1', { algumOk: true, zapPara: '5561991718505', emailPara: null, envio: { zap: { ok: true } } });
    await repo.marcarEnvio('R2', { algumOk: false, zapPara: null, emailPara: null, envio: { zap: { ok: false } } });
    const up1 = chamadas[0].ops.find((o) => o[0] === 'update')![1][0];
    expect(typeof up1.enviado_em).toBe('string');
    expect(up1.enviado_zap_para).toBe('5561991718505');
    expect(up1.enviado_email_para).toBeNull();
    expect(up1.envio).toEqual({ zap: { ok: true } });
    expect(chamadas[0].ops).toContainEqual(['eq', ['company_id', 'E1']]);
    expect(chamadas[0].ops).toContainEqual(['eq', ['id', 'R1']]);
    expect(chamadas[1].ops.find((o) => o[0] === 'update')![1][0].enviado_em).toBeNull();
  });
  it('ultimoEnvio: só envio de verdade, da empresa, da UC e do mês', async () => {
    const { db, chamadas } = fakeDb({ relatorios_gd_gerados: [
      { data: [{ enviado_em: '2026-09-27T13:05:00Z', enviado_zap_para: '5561991718505', enviado_email_para: 'j@x.com' }], error: null },
      { data: [], error: null },
    ] });
    const repo = criarRepoTelaGd(db, 'E1');
    expect(await repo.ultimoEnvio('351534', '2026-08-01')).toEqual({
      enviadoEm: '2026-09-27T13:05:00Z', zapPara: '5561991718505', emailPara: 'j@x.com',
    });
    expect(chamadas[0].ops).toContainEqual(['eq', ['company_id', 'E1']]);
    expect(chamadas[0].ops).toContainEqual(['eq', ['instalacao', '351534']]);
    expect(chamadas[0].ops).toContainEqual(['eq', ['referencia', '2026-08-01']]);
    expect(chamadas[0].ops).toContainEqual(['not', ['enviado_em', 'is', null]]);
    expect(await repo.ultimoEnvio('351534', '2026-07-01')).toBeNull();
  });
  it('destinoDoLead: telefone, e-mail e opt_out, só da empresa', async () => {
    const { db, chamadas } = fakeDb({ leads: [
      { data: [{ id: 'L1', name: 'JOAO', phone: '61991718505', email: 'j@x.com', opt_out: true }], error: null },
      { data: [], error: null },
    ] });
    const repo = criarRepoTelaGd(db, 'E1');
    expect(await repo.destinoDoLead('L1')).toEqual({ id: 'L1', nome: 'JOAO', phone: '61991718505', email: 'j@x.com', optOut: true });
    expect(chamadas[0].ops).toContainEqual(['eq', ['company_id', 'E1']]);
    expect(await repo.destinoDoLead('L9')).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/gd-demonstrativos-tela-repo-envio.test.ts`
Expected: FAIL — `criarRelatorioParaEnvio is not a function`.

- [ ] **Step 4: Implement**

No topo de `src/modules/gd/demonstrativos-tela-repo.ts`, abaixo do import de `RegistroDemonstrativo`:

```ts
import type { LeadDestino, ResumoEnvio } from './relatorio-envio.js';
```

Dentro do objeto retornado por `criarRepoTelaGd`, logo DEPOIS do método `registrarRelatorio`:

```ts
    /** Relatório que VAI ser enviado: guarda cliente, token do link /rg/ e onde está o PDF. Devolve o id. */
    async criarRelatorioParaEnvio(p: {
      instalacao: string; referencia: string; geradoPor: string; numeros: Record<string, unknown>;
      leadId: string; token: string; storagePath: string;
    }): Promise<string> {
      const { data, error } = await db.from('relatorios_gd_gerados').insert({
        company_id: companyId,
        instalacao: p.instalacao,
        referencia: p.referencia,
        gerado_por: p.geradoPor,
        numeros: p.numeros,
        lead_id: p.leadId,
        token: p.token,
        storage_path: p.storagePath,
      }).select('id').single();
      if (error) throw new Error(`relatorios_gd_gerados (criar p/ envio): ${error.message}`);
      return String((data as any).id);
    },

    /** Resultado do envio. `enviado_em` só quando algum canal saiu de verdade. */
    async marcarEnvio(id: string, r: ResumoEnvio): Promise<void> {
      const { error } = await db.from('relatorios_gd_gerados').update({
        enviado_em: r.algumOk ? new Date().toISOString() : null,
        enviado_zap_para: r.zapPara,
        enviado_email_para: r.emailPara,
        envio: r.envio,
      }).eq('company_id', companyId).eq('id', id);
      if (error) throw new Error(`relatorios_gd_gerados (marcar envio): ${error.message}`);
    },

    /** Último envio que SAIU desse mês dessa UC — a tela mostra "✅ enviado em…" e pede confirmação pra reenviar. */
    async ultimoEnvio(instalacao: string, referencia: string): Promise<{ enviadoEm: string; zapPara: string | null; emailPara: string | null } | null> {
      const { data, error } = await db
        .from('relatorios_gd_gerados')
        .select('enviado_em, enviado_zap_para, enviado_email_para')
        .eq('company_id', companyId)
        .eq('instalacao', instalacao)
        .eq('referencia', referencia)
        .not('enviado_em', 'is', null)
        .order('enviado_em', { ascending: false })
        .limit(1);
      if (error) throw new Error(`relatorios_gd_gerados (último envio): ${error.message}`);
      const r = data?.[0] as any;
      return r ? { enviadoEm: r.enviado_em, zapPara: r.enviado_zap_para ?? null, emailPara: r.enviado_email_para ?? null } : null;
    },

    /** Para quem mandar: só lead DESTA empresa. */
    async destinoDoLead(leadId: string): Promise<LeadDestino | null> {
      const { data, error } = await db
        .from('leads')
        .select('id, name, phone, email, opt_out')
        .eq('company_id', companyId)
        .eq('id', leadId)
        .limit(1);
      if (error) throw new Error(`leads (destino do envio): ${error.message}`);
      const l = data?.[0] as any;
      return l
        ? { id: l.id, nome: l.name ?? null, phone: l.phone ?? null, email: l.email ?? null, optOut: l.opt_out === true }
        : null;
    },
```

- [ ] **Step 5: Run tests + tsc**

Run: `npx vitest run tests/gd-demonstrativos-tela-repo-envio.test.ts tests/gd-demonstrativos-tela-repo.test.ts && npx tsc --noEmit`
Expected: PASS, tsc limpo.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/133_relatorios_gd_envio.sql src/modules/gd/demonstrativos-tela-repo.ts tests/gd-demonstrativos-tela-repo-envio.test.ts
git commit -m "feat(gd): migration 133 + repo do envio do relatorio (token, PDF, resultado)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: PDF público pelo token + relatórios enviados do cliente

**Files:**
- Modify: `src/modules/anexos/storage.ts` (fim do arquivo)
- Create: `src/modules/gd/relatorio-publico.ts`
- Test: `tests/gd-relatorio-publico.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/gd-relatorio-publico.test.ts
import { describe, it, expect, vi } from 'vitest';
import { abrirPdfPublico, listarRelatoriosEnviadosDoLead, relatoriosParaPasta } from '../src/modules/gd/relatorio-publico.js';

function fakeClient(linhas: any[], arquivo: Blob | null) {
  const ops: Array<[string, any[]]> = [];
  const tabelas: string[] = [];
  const buckets: string[] = [];
  const q: any = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') return (res: any) => Promise.resolve({ data: linhas, error: null }).then(res);
      return (...a: any[]) => { ops.push([prop, a]); return q; };
    },
  });
  const download = vi.fn(async () => (arquivo ? { data: arquivo, error: null } : { data: null, error: { message: 'Object not found' } }));
  const client: any = {
    from: (t: string) => { tabelas.push(t); return q; },
    storage: { from: (b: string) => { buckets.push(b); return { download }; } },
  };
  return { client, ops, tabelas, buckets, download };
}

const TOKEN = 'T'.repeat(32);

describe('abrirPdfPublico', () => {
  it('acha SÓ pelo token (nunca UC/empresa) e devolve o PDF guardado', async () => {
    const f = fakeClient([{ storage_path: 'L1/relatorio-gd/a.pdf', instalacao: '351534', referencia: '2026-08-01' }], new Blob(['%PDF-1.4']));
    const r = await abrirPdfPublico(f.client, TOKEN);
    expect(r!.pdf.toString()).toBe('%PDF-1.4');
    expect(r!.nomeArquivo).toBe('relatorio-351534-2026-08.pdf');
    expect(f.tabelas).toEqual(['relatorios_gd_gerados']);
    expect(f.ops.filter((o) => o[0] === 'eq')).toEqual([['eq', ['token', TOKEN]]]);
    expect(f.buckets).toEqual(['client-attachments']);
    expect(f.download).toHaveBeenCalledWith('L1/relatorio-gd/a.pdf');
  });
  it('token que não existe → null, sem tocar no storage', async () => {
    const f = fakeClient([], new Blob(['x']));
    expect(await abrirPdfPublico(f.client, TOKEN)).toBeNull();
    expect(f.download).not.toHaveBeenCalled();
  });
  it('registro sem PDF guardado → null', async () => {
    const f = fakeClient([{ storage_path: null, instalacao: '1', referencia: '2026-08-01' }], new Blob(['x']));
    expect(await abrirPdfPublico(f.client, TOKEN)).toBeNull();
  });
  it('PDF sumiu do storage → null', async () => {
    const f = fakeClient([{ storage_path: 'L1/relatorio-gd/a.pdf', instalacao: '1', referencia: '2026-08-01' }], null);
    expect(await abrirPdfPublico(f.client, TOKEN)).toBeNull();
  });
});

describe('relatórios da usina na Pasta Digital', () => {
  it('um por mês (o envio mais novo), do mais novo pro mais velho', () => {
    const linhas = [
      { referencia: '2026-07-01', token: 'A' },
      { referencia: '2026-08-01', token: 'B-novo' },
      { referencia: '2026-08-01', token: 'B-velho' },
    ];
    expect(relatoriosParaPasta(linhas, 'https://p.x')).toEqual([
      { referencia: '2026-08-01', mesExtenso: 'agosto de 2026', url: 'https://p.x/rg/B-novo' },
      { referencia: '2026-07-01', mesExtenso: 'julho de 2026', url: 'https://p.x/rg/A' },
    ]);
  });
  it('no máximo 12; linha sem token é ignorada', () => {
    const muitos = Array.from({ length: 15 }, (_, i) => ({ referencia: `20${10 + i}-01-01`, token: `t${i}` }));
    const r = relatoriosParaPasta(muitos, 'https://p.x');
    expect(r).toHaveLength(12);
    expect(r[0].referencia).toBe('2024-01-01');
    expect(relatoriosParaPasta([{ referencia: '2026-08-01', token: null }], 'https://p.x')).toEqual([]);
  });
  it('consulta só o lead da pasta, só enviados com token', async () => {
    const f = fakeClient([{ referencia: '2026-08-01', token: 'B' }], null);
    const r = await listarRelatoriosEnviadosDoLead(f.client, 'L1', 'https://p.x');
    expect(r).toEqual([{ referencia: '2026-08-01', mesExtenso: 'agosto de 2026', url: 'https://p.x/rg/B' }]);
    expect(f.ops).toContainEqual(['eq', ['lead_id', 'L1']]);
    expect(f.ops).toContainEqual(['not', ['enviado_em', 'is', null]]);
    expect(f.ops).toContainEqual(['not', ['token', 'is', null]]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/gd-relatorio-publico.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implement**

No FIM de `src/modules/anexos/storage.ts`:

```ts
/** Baixa um arquivo do bucket. null = não achou / erro (loga o motivo). */
export async function baixarAnexo(client: SupabaseClient, storagePath: string): Promise<Buffer | null> {
  const { data, error } = await client.storage.from(BUCKET).download(storagePath);
  if (error || !data) {
    if (error) console.warn('[anexos] download falhou:', error.message);
    return null;
  }
  return Buffer.from(await data.arrayBuffer());
}
```

Crie `src/modules/gd/relatorio-publico.ts`:

```ts
// src/modules/gd/relatorio-publico.ts
// Lado PÚBLICO do relatório mensal da usina (sem login). Usa a chave-mestra,
// então só existem duas portas, e as duas são estreitas:
//  - abrirPdfPublico: busca SÓ pelo token (32 caracteres aleatórios) e devolve
//    SÓ o PDF — nunca lista, nunca busca por UC, cliente ou empresa;
//  - listarRelatoriosEnviadosDoLead: para a Pasta Digital pública, que já é do
//    próprio lead (slug secreto) — só meses ENVIADOS, só mês + link.

import type { SupabaseClient } from '@supabase/supabase-js';
import { baixarAnexo } from '../anexos/storage.js';
import { mesExtenso } from './relatorio-motor.js';
import { linkPublicoRelatorio, nomeArquivoRelatorio } from './relatorio-envio-textos.js';

export async function abrirPdfPublico(
  db: SupabaseClient,
  token: string,
): Promise<{ pdf: Buffer; nomeArquivo: string } | null> {
  const { data, error } = await db
    .from('relatorios_gd_gerados')
    .select('storage_path, instalacao, referencia')
    .eq('token', token)
    .limit(1);
  if (error) throw new Error(`relatorios_gd_gerados (link público): ${error.message}`);
  const r = (data ?? [])[0] as { storage_path: string | null; instalacao: string; referencia: string } | undefined;
  if (!r?.storage_path) return null;
  const pdf = await baixarAnexo(db, r.storage_path);
  if (!pdf) return null;
  return { pdf, nomeArquivo: nomeArquivoRelatorio(r.instalacao, r.referencia) };
}

export interface RelatorioNaPasta {
  referencia: string;
  mesExtenso: string;
  url: string;
}

/** Um por mês (o 1º de cada mês na entrada = o envio mais novo), do mais novo pro mais velho, até `max`. */
export function relatoriosParaPasta(
  linhas: ReadonlyArray<{ referencia: string; token: string | null }>,
  base: string,
  max = 12,
): RelatorioNaPasta[] {
  const vistos = new Set<string>();
  const out: RelatorioNaPasta[] = [];
  // sort é estável: dentro do mesmo mês mantém a ordem de chegada (enviado_em desc).
  for (const l of [...linhas].sort((a, b) => b.referencia.localeCompare(a.referencia))) {
    if (!l.token || vistos.has(l.referencia)) continue;
    vistos.add(l.referencia);
    out.push({ referencia: l.referencia, mesExtenso: mesExtenso(l.referencia), url: linkPublicoRelatorio(base, l.token) });
    if (out.length >= max) break;
  }
  return out;
}

export async function listarRelatoriosEnviadosDoLead(
  db: SupabaseClient,
  leadId: string,
  base: string,
): Promise<RelatorioNaPasta[]> {
  const { data, error } = await db
    .from('relatorios_gd_gerados')
    .select('referencia, token')
    .eq('lead_id', leadId)
    .not('enviado_em', 'is', null)
    .not('token', 'is', null)
    .order('referencia', { ascending: false })
    .order('enviado_em', { ascending: false })
    .limit(60);
  if (error) throw new Error(`relatorios_gd_gerados (pasta): ${error.message}`);
  return relatoriosParaPasta((data ?? []) as Array<{ referencia: string; token: string | null }>, base);
}
```

- [ ] **Step 4: Run test + tsc**

Run: `npx vitest run tests/gd-relatorio-publico.test.ts && npx tsc --noEmit`
Expected: PASS, tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add src/modules/anexos/storage.ts src/modules/gd/relatorio-publico.ts tests/gd-relatorio-publico.test.ts
git commit -m "feat(gd): PDF publico pelo token e relatorios enviados do cliente

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Telas — botão, "✅ enviado em…" e confirmação

**Files:**
- Modify: `src/modules/dashboard/demonstrativos-views.ts` (imports, `DetalheCliente`, `botaoRelatorio`, nova função)
- Test: `tests/gd-demonstrativos-envio-views.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/gd-demonstrativos-envio-views.test.ts
import { describe, it, expect } from 'vitest';
import {
  renderDemonstrativoCliente, renderConfirmarEnvioRelatorio, textoUltimoEnvio, type ConfirmarEnvioRelatorio,
} from '../src/modules/dashboard/demonstrativos-views.js';

const base = {
  instalacao: '200002', clienteNome: 'JOAO', leadId: 'L1', meses: ['2026-08-01'], mes: '2026-08-01',
  consumoKwh: 480, injetadoKwh: 222, saldoKwh: 1240, compensadoKwh: 380, economiaRs: 376.2,
  proximoExpirar: null, historico: [], unidades: [], origemDemonstrativo: 'email', verificado: true,
  candidatos: [], msg: null,
};
const pronto = { estado: 'pronto' as const, bloqueios: [], pendencias: [], avisos: [], geracaoKwh: 612, origemGeracao: 'api' as const, esperadoMesKwh: 640 };
const ENVIO = { enviadoEm: '2026-09-27T13:05:00Z', zapPara: '5561991718505', emailPara: 'j@x.com' };

describe('tela do cliente — enviar pela Eva', () => {
  it('mês 🟢 mostra o botão de enviar', () => {
    const h = renderDemonstrativoCliente({ ...base, validacao: pronto });
    expect(h).toContain('href="/dashboard/demonstrativos/200002/enviar?mes=2026-08-01"');
    expect(h).toContain('📲 Enviar ao cliente pela Eva');
  });
  it('mês fora do 🟢 não tem botão de enviar', () => {
    const h = renderDemonstrativoCliente({ ...base,
      validacao: { estado: 'falta_dado', bloqueios: [], pendencias: ['falta a geração do mês'], avisos: [], geracaoKwh: null, origemGeracao: null, esperadoMesKwh: 640 } });
    expect(h).not.toContain('/enviar?mes=');
  });
  it('já enviado: mostra quando e para quem (horário de Brasília)', () => {
    expect(textoUltimoEnvio(ENVIO)).toBe('✅ enviado em 27/09 10:05 para (61) 99171-8505 e j@x.com');
    const h = renderDemonstrativoCliente({ ...base, validacao: pronto, ultimoEnvio: ENVIO });
    expect(h).toContain('✅ enviado em 27/09 10:05 para (61) 99171-8505 e j@x.com');
  });
});

const confirmar = (o: Partial<ConfirmarEnvioRelatorio> = {}): ConfirmarEnvioRelatorio => ({
  instalacao: '200002', mes: '2026-08-01', mesExtenso: 'agosto de 2026', clienteNome: 'JOAO <b>X</b>', canal: 'casa',
  zap: { para: '5561991718505', motivo: null, texto: 'Olá, João! ☀️ O relatório…' },
  email: { para: 'j@x.com', motivo: null, assunto: 'João, o relatório de agosto de 2026 da sua usina solar', html: '<p class="x">oi</p>' },
  linkExemplo: 'https://p.x/rg/…', ultimoEnvio: null, ...o,
});

describe('renderConfirmarEnvioRelatorio', () => {
  it('prévia do zap, do e-mail (iframe escapado) e do link; confirma sem reenviar', () => {
    const h = renderConfirmarEnvioRelatorio(confirmar());
    expect(h).toContain('JOAO &lt;b&gt;X&lt;/b&gt;');
    expect(h).toContain('(61) 99171-8505');
    expect(h).toContain('Olá, João! ☀️ O relatório…');
    expect(h).toContain('srcdoc="&lt;p class=&quot;x&quot;&gt;oi&lt;/p&gt;"');
    expect(h).toContain('https://p.x/rg/…');
    expect(h).toContain('action="/dashboard/demonstrativos/200002/enviar?mes=2026-08-01"');
    expect(h).toContain('name="confirmar" value="1"');
    expect(h).not.toContain('name="reenviar"');
    expect(h).toContain('📲 Confirmar e enviar');
  });
  it('já enviado: aviso + "Enviar de novo" com reenviar=1', () => {
    const h = renderConfirmarEnvioRelatorio(confirmar({ ultimoEnvio: ENVIO }));
    expect(h).toContain('Este relatório já foi enviado');
    expect(h).toContain('name="reenviar" value="1"');
    expect(h).toContain('🔁 Enviar de novo');
  });
  it('canal bloqueado mostra o motivo em português; e-mail desligado avisa', () => {
    const h = renderConfirmarEnvioRelatorio(confirmar({ zap: { para: null, motivo: 'opt_out', texto: '' }, email: null }));
    expect(h).toMatch(/Não vai sair — cliente pediu pra não receber mensagens/);
    expect(h).toMatch(/e-mail não está configurado/);
  });
  it('nada pode sair: sem formulário, explica o que corrigir', () => {
    const h = renderConfirmarEnvioRelatorio(confirmar({
      zap: { para: null, motivo: 'sem_phone', texto: '' }, email: { para: null, motivo: 'sem_email', assunto: '', html: '' },
    }));
    expect(h).not.toContain('name="confirmar"');
    expect(h).toMatch(/Nada pode ser enviado/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/gd-demonstrativos-envio-views.test.ts`
Expected: FAIL — `renderConfirmarEnvioRelatorio is not a function`.

- [ ] **Step 3: Implement**

Em `src/modules/dashboard/demonstrativos-views.ts`, abaixo do `import { mesCurto } ...`:

```ts
import { dataHoraBrasilia } from '../gd/relatorio-envio-textos.js';
import { telefoneBonito } from '../gd/relatorio-marca.js';
import { motivoEmPortugues } from '../relatorios/pasta/resultado-envio.js';

export interface UltimoEnvioRelatorio {
  enviadoEm: string;
  zapPara: string | null;
  emailPara: string | null;
}

/** "✅ enviado em 27/09 10:05 para (61) 99171-8505 e j@x.com" — SEM escapar (quem desenha escapa). */
export function textoUltimoEnvio(u: UltimoEnvioRelatorio): string {
  const para = [u.zapPara ? telefoneBonito(u.zapPara) : null, u.emailPara].filter(Boolean).join(' e ');
  return `✅ enviado em ${dataHoraBrasilia(u.enviadoEm)}${para ? ` para ${para}` : ''}`;
}
```

Em `interface DetalheCliente`, depois de `msg: string | null;`:

```ts
  /** Último envio ao cliente deste mês (fatia 3); ausente/null = nunca enviado. */
  ultimoEnvio?: UltimoEnvioRelatorio | null;
```

Troque o bloco `const botaoRelatorio = v.estado === 'pronto' ? ... : ...;` por:

```ts
  const envioFeito = d.ultimoEnvio ? `<p class="text-emerald-300 mt-2">${esc(textoUltimoEnvio(d.ultimoEnvio))}</p>` : '';
  const botaoRelatorio = v.estado === 'pronto'
    ? `<div class="flex gap-2 mt-4">
  <a href="/dashboard/demonstrativos/${esc(d.instalacao)}/relatorio.pdf?mes=${esc(d.mes)}" class="px-4 py-2 rounded bg-emerald-700 text-white">📄 Gerar PDF</a>
  <a href="/dashboard/demonstrativos/${esc(d.instalacao)}/relatorio.html?mes=${esc(d.mes)}" target="_blank" class="px-4 py-2 rounded bg-slate-700 text-white">👁 Prévia</a>
  <a href="/dashboard/demonstrativos/${esc(d.instalacao)}/enviar?mes=${esc(d.mes)}" class="px-4 py-2 rounded bg-cyan-700 text-white">📲 Enviar ao cliente pela Eva</a>
</div>${envioFeito}`
    : `<p class="mt-4"><span class="px-4 py-2 rounded bg-slate-800 text-slate-500 cursor-not-allowed">📄 Gerar PDF</span>
  <span class="text-sm text-amber-300 ml-2">Só sai com tudo 🟢 — ${esc(motivoFalta)}</span></p>`;
```

No FIM do arquivo:

```ts
export interface ConfirmarEnvioRelatorio {
  instalacao: string;
  mes: string;
  mesExtenso: string;
  clienteNome: string;
  canal: 'casa' | 'evolution' | 'nenhum';
  zap: { para: string | null; motivo: string | null; texto: string };
  /** null = e-mail não configurado neste ambiente. */
  email: { para: string | null; motivo: string | null; assunto: string; html: string } | null;
  linkExemplo: string;
  ultimoEnvio: UltimoEnvioRelatorio | null;
}

export function renderConfirmarEnvioRelatorio(c: ConfirmarEnvioRelatorio, user?: DashUser): string {
  const voltar = `/dashboard/demonstrativos/${esc(c.instalacao)}?mes=${esc(c.mes)}`;
  const comoVai = c.canal === 'evolution'
    ? 'Vai pelo WhatsApp da sua empresa: a mensagem com o link e o PDF anexo.'
    : 'Vai pelo modelo aprovado da Meta ("relatorio_usina_v1"), com o botão "Ver meu relatório". Se o modelo ainda não estiver aprovado, tento como mensagem comum (só chega se o cliente falou com a gente nas últimas 24 horas).';
  const blocoZap = c.zap.para
    ? `<p>Para: <b>${esc(telefoneBonito(c.zap.para))}</b></p>
<p class="text-sm text-slate-400">${esc(comoVai)}</p>
<pre class="whitespace-pre-wrap rounded bg-slate-800 p-3 mt-2" style="font-family:inherit">${esc(c.zap.texto)}</pre>`
    : `<p style="color:#ef4444">❌ Não vai sair — ${esc(motivoEmPortugues('zap', c.zap.motivo))}.</p>`;
  let blocoEmail: string;
  if (c.email === null) {
    blocoEmail = '<p style="color:#eab308">⚠️ O e-mail não está configurado neste ambiente — só o WhatsApp será tentado.</p>';
  } else if (c.email.para) {
    blocoEmail = `<p>Para: <b>${esc(c.email.para)}</b> · Assunto: <b>${esc(c.email.assunto)}</b></p>
<iframe title="Prévia do e-mail" sandbox="" srcdoc="${esc(c.email.html)}" style="width:100%;height:560px;background:#fff;border-radius:8px;margin-top:8px"></iframe>`;
  } else {
    blocoEmail = `<p style="color:#ef4444">❌ Não vai sair — ${esc(motivoEmPortugues('email', c.email.motivo))}.</p>`;
  }
  const podeEnviar = Boolean(c.zap.para) || Boolean(c.email?.para);
  const jaEnviado = c.ultimoEnvio
    ? `<div class="rounded border border-amber-500 p-3 my-3 text-amber-200">Este relatório já foi enviado: ${esc(textoUltimoEnvio(c.ultimoEnvio))}.<br>Enviar de novo manda outra mensagem para o cliente.</div>`
    : '';
  const form = podeEnviar
    ? `<form method="post" action="/dashboard/demonstrativos/${esc(c.instalacao)}/enviar?mes=${esc(c.mes)}" class="flex flex-wrap gap-2 mt-4">
  <input type="hidden" name="confirmar" value="1">
  ${c.ultimoEnvio ? '<input type="hidden" name="reenviar" value="1">' : ''}
  <button class="px-4 py-2 rounded bg-emerald-700 text-white">${c.ultimoEnvio ? '🔁 Enviar de novo' : '📲 Confirmar e enviar'}</button>
  <a href="${voltar}" class="px-4 py-2 rounded bg-slate-700 text-white">Cancelar</a>
</form>`
    : `<p class="mt-4" style="color:#ef4444">Nada pode ser enviado — corrija o cadastro do cliente (telefone/e-mail) e tente de novo.</p>
<a href="${voltar}" class="px-4 py-2 rounded bg-slate-700 text-white inline-block mt-2">← Voltar</a>`;
  const body = `
<div style="color:#d1d5db;max-width:900px">
<a href="${voltar}" class="text-sm text-slate-400">← ${esc(c.clienteNome)}</a>
<h1 class="text-xl font-bold text-cyan-300 mt-1">Enviar o relatório de ${esc(c.mesExtenso)} para ${esc(c.clienteNome)}</h1>
${jaEnviado}
<h2 class="font-bold mt-4">📲 WhatsApp</h2>
${blocoZap}
<h2 class="font-bold mt-4">✉️ E-mail</h2>
${blocoEmail}
<h2 class="font-bold mt-4">🔗 Link do relatório</h2>
<p class="text-sm">O cliente recebe um link assim: <code>${esc(c.linkExemplo)}</code> — o endereço definitivo é criado na hora do envio e abre o PDF direto, sem senha.
<a href="/dashboard/demonstrativos/${esc(c.instalacao)}/relatorio.html?mes=${esc(c.mes)}" target="_blank" class="underline text-cyan-300">👁 Ver o relatório</a></p>
${form}
</div>`;
  return renderLayout({ active: 'demonstrativos', title: `Enviar relatório — ${c.clienteNome}`, body, dark: true, user });
}
```

- [ ] **Step 4: Run tests (novo + os antigos da tela)**

Run: `npx vitest run tests/gd-demonstrativos-envio-views.test.ts tests/gd-demonstrativos-views.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/demonstrativos-views.ts tests/gd-demonstrativos-envio-views.test.ts
git commit -m "feat(dashboard): botao Enviar pela Eva, enviado em..., tela de confirmacao

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Rotas do envio no dashboard + ligação no `index.ts`

**Files:**
- Modify: `src/modules/dashboard/router.ts` (opções ~187-235; import das views ~120-123; `GET /demonstrativos/:instalacao` ~4658-4666; novas rotas depois da rota `relatorio.pdf` ~4742)
- Modify: `src/index.ts` (~9072, opções do `createDashboardRouter`)

(Router e index não têm teste unitário neste repo; a lógica está testada nos Tasks 2–11. Aqui a verificação é `tsc` + o roteiro manual do Task 16.)

- [ ] **Step 1: Opção nova do router**

Em `src/modules/dashboard/router.ts`, no tipo de `options`, logo DEPOIS do bloco `sendTemplate?: (...) => Promise<unknown>;`:

```ts
    // Tenant com WhatsApp próprio (Evolution): PDF anexo pela instância em
    // contexto (canal-contexto). Vem do index.ts (evolution.sendDocument).
    sendDocumentEvolution?: (to: string, base64: string, fileName: string, caption: string) => Promise<void>;
```

- [ ] **Step 2: Import da tela de confirmação**

Troque:

```ts
import {
  renderDemonstrativosLista, renderDemonstrativoCliente, renderConferenciaPdf, renderDigitar, renderEnviarPdf,
  type ResultadoLeituraPdf,
} from './demonstrativos-views.js';
```

por:

```ts
import {
  renderDemonstrativosLista, renderDemonstrativoCliente, renderConferenciaPdf, renderDigitar, renderEnviarPdf,
  renderConfirmarEnvioRelatorio, type ResultadoLeituraPdf,
} from './demonstrativos-views.js';
```

- [ ] **Step 3: Tela do cliente passa o último envio**

Em `router.get('/demonstrativos/:instalacao', ...)`, troque a linha:

```ts
        validacao, candidatos, msg: typeof req.query.msg === 'string' ? req.query.msg : null,
```

por:

```ts
        validacao, candidatos, msg: typeof req.query.msg === 'string' ? req.query.msg : null,
        ultimoEnvio: await tela.ultimoEnvio(inst, l.referencia).catch(() => null),
```

(O `.catch` mantém a tela no ar se a 133 ainda não foi aplicada.)

- [ ] **Step 4: Rotas GET/POST `/demonstrativos/:instalacao/enviar`**

Logo DEPOIS do fim da rota `router.get('/demonstrativos/:instalacao/relatorio.pdf', ...)` (antes de `router.post('/demonstrativos/:instalacao/geracao', ...)`), acrescente:

```ts
  // ── Enviar o relatório ao cliente pela Eva (fatia 3) — plano 2026-09-27-demonstrativos-enviar-relatorio-eva.md
  /** Relatório 🟢 + cliente + canal + destino. null = já respondeu (redirect/404). */
  async function envioRelatorioCtx(req: AuthedRequest, res: Response) {
    const p = await relatorioDaRequisicao(req, res);
    if (!p) return null;
    const companyId = req.dashUser!.companyId;
    const lead = await p.tela.destinoDoLead(p.leadId);
    if (!lead) { res.status(404).send('Cliente não encontrado nesta empresa'); return null; }
    const { canalZapDaEmpresa } = await import('./canal-envio.js');
    const { destinoDoEnvio } = await import('../gd/relatorio-envio.js');
    const { envioProibido } = await import('../tenant-admin-guard.js');
    const instancia = await instanciaDoTenant(req);
    const canal = canalZapDaEmpresa(companyId, instancia);
    const cfg = empresaDe(companyId);
    const destino = destinoDoEnvio(lead, {
      canal,
      bloqueadoLgpd: (fone) => envioProibido(fone, options.engineerPhone ?? '', cfg),
    });
    const ultimo = await p.tela.ultimoEnvio(p.inst, p.mes);
    return { ...p, companyId, lead, instancia, canal, cfg, destino, ultimo };
  }

  router.get('/demonstrativos/:instalacao/enviar', exigir('usinas', 'editar'), async (req: AuthedRequest, res: Response) => {
    try {
      const c = await envioRelatorioCtx(req, res);
      if (!c) return;
      const T = await import('../gd/relatorio-envio-textos.js');
      const { montarEmailRelatorio } = await import('../gd/relatorio-envio.js');
      const nome = T.primeiroNome(c.lead.nome);
      const mesExt = c.relatorio.mesExtenso;
      const linkExemplo = T.linkPublicoRelatorio(T.basePublica(), '…');
      const textoZap = c.canal === 'evolution'
        ? `${T.textoLivreRelatorio(nome, mesExt, linkExemplo)}\n\n📎 ${T.nomeArquivoRelatorio(c.inst, c.mes)}`
        : `${T.textoTemplateRelatorio(nome, mesExt)}\n\n[ botão: Ver meu relatório ]`;
      const previa = montarEmailRelatorio({ nome, mesExtenso: mesExt, link: linkExemplo }, c.cfg);
      res.type('html').send(renderConfirmarEnvioRelatorio({
        instalacao: c.inst, mes: c.mes, mesExtenso: mesExt, clienteNome: c.lead.nome ?? c.relatorio.cliente,
        canal: c.canal,
        zap: { para: c.destino.zap.fone, motivo: c.destino.zap.motivo, texto: textoZap },
        email: process.env.RESEND_API_KEY
          ? { para: c.destino.email.para, motivo: c.destino.email.motivo, assunto: previa.assunto, html: previa.html }
          : null,
        linkExemplo, ultimoEnvio: c.ultimo,
      }, req.dashUser));
    } catch (err) {
      console.error('[demonstrativos/enviar GET]', err);
      res.status(500).send(`<h2>Erro ao preparar o envio</h2><pre>${escapeHtmlSimple((err as Error).message)}</pre>`);
    }
  });

  router.post('/demonstrativos/:instalacao/enviar', exigir('usinas', 'editar'), async (req: AuthedRequest, res: Response) => {
    const inst = String(req.params.instalacao);
    const mesQ = typeof req.query.mes === 'string' ? req.query.mes : '';
    const volta = (m: string) =>
      res.redirect(`/dashboard/demonstrativos/${RE_UC.test(inst) ? inst : ''}?mes=${encodeURIComponent(mesQ)}&msg=${encodeURIComponent(m)}`);
    try {
      if (String(req.body?.confirmar ?? '') !== '1') { volta('Envio não confirmado — nada saiu.'); return; }
      const c = await envioRelatorioCtx(req, res);
      if (!c) return;
      // Já saiu antes: só com o "Enviar de novo" explícito da tela de confirmação.
      if (c.ultimo && String(req.body?.reenviar ?? '') !== '1') {
        res.redirect(`/dashboard/demonstrativos/${c.inst}/enviar?mes=${encodeURIComponent(c.mes)}`);
        return;
      }
      const { renderResultadoEnvio } = await import('../relatorios/pasta/resultado-envio.js');
      const voltarHref = `/dashboard/demonstrativos/${c.inst}?mes=${encodeURIComponent(c.mes)}`;
      const emailLigado = Boolean(process.env.RESEND_API_KEY);

      // Nenhum canal possível: explica sem gerar PDF nem link à toa.
      if (!c.destino.zap.fone && !(emailLigado && c.destino.email.para)) {
        res.type('html').send(renderResultadoEnvio({
          tituloOk: 'Relatório enviado', tituloConfira: 'Envio do relatório — confira',
          voltarHref, voltarTexto: '← voltar para o cliente',
          zap: { ok: false, reason: c.destino.zap.motivo ?? 'sem_phone' },
          email: emailLigado ? { ok: false, reason: c.destino.email.motivo ?? 'sem_email' } : null,
        }));
        return;
      }

      const { gerarRelatorioPdf, lerPdfUnpdf } = await import('../gd/relatorio-pdf.js');
      const { htmlToPdf } = await import('../proposal/pdf-generator.js');
      const pdf = await gerarRelatorioPdf(c.html, { htmlToPdf, lerPdf: lerPdfUnpdf }, { exigeGrafico: c.relatorio.meses.length > 0 });

      // PDF guardado com a chave-mestra (storage não passa pelo RLS do operador).
      const { uploadAnexo } = await import('../anexos/storage.js');
      const up = await uploadAnexo(supabase, c.leadId, 'relatorio-gd', pdf, 'application/pdf', 'pdf');
      if (!up.ok || !up.storage_path) throw new Error(`não consegui guardar o PDF (${up.error ?? 'erro no armazenamento'})`);

      const T = await import('../gd/relatorio-envio-textos.js');
      const E = await import('../gd/relatorio-envio.js');
      const { numerosDoRelatorio } = await import('../gd/relatorio-motor.js');
      const token = T.gerarTokenRelatorio();
      const link = T.linkPublicoRelatorio(T.basePublica(), token);
      const idRel = await c.tela.criarRelatorioParaEnvio({
        instalacao: c.inst, referencia: c.mes, geradoPor: req.dashUser!.id, numeros: numerosDoRelatorio(c.relatorio),
        leadId: c.leadId, token, storagePath: up.storage_path,
      });
      const msg = {
        nome: T.primeiroNome(c.lead.nome), mesExtenso: c.relatorio.mesExtenso, token, link, pdf,
        nomeArquivo: T.nomeArquivoRelatorio(c.inst, c.mes),
      };

      const { noCanalDaEmpresa } = await import('./canal-envio.js');
      const sendText = options.sendText;
      const { zap, email } = await noCanalDaEmpresa(c.companyId, c.instancia, async () => {
        const zap: import('../gd/relatorio-envio.js').ResultadoZapRelatorio = sendText
          ? await E.enviarRelatorioZap(c.destino.zap, msg, {
              canal: c.canal,
              sendText,
              // Modelo (WABA) é só da EcoSun; tenant NUNCA passa pela WABA da casa.
              sendTemplate: c.canal === 'casa' ? options.sendTemplate : undefined,
              sendDocument: c.canal === 'evolution' ? options.sendDocumentEvolution : undefined,
            })
          : { ok: false, reason: 'falha_envio', detalhe: 'envio de WhatsApp não configurado neste ambiente' };
        let email: import('../relatorios/pasta/resultado-envio.js').ResultadoCanal | null = null;
        if (emailLigado) {
          const { EmailSender } = await import('../email/resend-client.js');
          const sender = new EmailSender(process.env.RESEND_API_KEY ?? '', process.env.EMAIL_FROM ?? '');
          email = await E.enviarRelatorioEmail(c.destino.email, msg, { leadId: c.leadId, empresa: c.cfg }, {
            enviarEmail: (e) => sender.enviar(e),
            registrarEmailEnviado: (d) => supabaseService.registrarEmailEnviado(d),
          });
        }
        return { zap, email };
      });

      if (zap.ok && zap.textoEnviado) {
        await E.registrarEnvioNaConversa(supabaseService, c.leadId, c.companyId, c.relatorio.mesExtenso, zap.textoEnviado)
          .catch((err) => console.warn('[demonstrativos/enviar] conversa não registrada:', (err as Error).message));
      }
      await c.tela.marcarEnvio(idRel, E.resumoEnvio(zap, email));
      console.log(`[demonstrativos/enviar] UC ${c.inst} ${c.mes} empresa ${c.companyId.slice(0, 8)} canal=${c.canal} zap=${zap.ok ? 'ok' : zap.reason} email=${email ? (email.ok ? 'ok' : email.reason) : 'desligado'}`);

      res.type('html').send(renderResultadoEnvio({
        tituloOk: 'Relatório enviado', tituloConfira: 'Envio do relatório — confira',
        voltarHref, voltarTexto: '← voltar para o cliente',
        zap, email, linkPublico: link,
      }));
    } catch (err) {
      console.error('[demonstrativos/enviar POST]', err);
      if (!res.headersSent) volta(`Não enviei: ${(err as Error).message}`);
    }
  });
```

- [ ] **Step 5: Ligar o `sendDocument` no `index.ts`**

Em `src/index.ts`, no `app.use('/dashboard', createDashboardRouter(supabase, monitoringService, { ... }))`, logo DEPOIS da linha:

```ts
    sendTemplate: metaWaba ? (to, name, lang, components) => metaWaba!.sendTemplate(to, name, lang, components) : undefined,
```

acrescente:

```ts
    // Relatório GD pro tenant: PDF anexo pela instância dele (roda dentro de comCanal na rota).
    sendDocumentEvolution: async (to, b64, nome, legenda) => { await evolution.sendDocument(to, b64, nome, legenda); },
```

- [ ] **Step 6: tsc + testes da área**

Run: `npx tsc --noEmit && npx vitest run tests/gd-*.test.ts tests/resultado-envio.test.ts tests/canal-envio.test.ts`
Expected: tsc limpo; PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/dashboard/router.ts src/index.ts
git commit -m "feat(gd): rotas de envio do relatorio ao cliente (confirmacao, envio, resultado)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Rota pública `GET /rg/:token`

**Files:**
- Modify: `src/index.ts` (logo DEPOIS do fim da rota `app.get('/pasta/:slug', ...)`, ~linha 9488)

- [ ] **Step 1: Acrescentar a rota**

```ts
  // ===== Relatório mensal da usina (GD) — link público (fatia 3) =====
  // Sem login: o cliente abre pelo botão do WhatsApp/e-mail. Busca SÓ pelo
  // token de 32 caracteres aleatórios (nunca por UC, cliente ou empresa) e
  // devolve SÓ o PDF. /rg/ porque /r/:slug já é o relatório de acompanhamento.
  // URL: https://propostas.ecosunpower.eng.br/rg/<token>
  app.get('/rg/:token', async (req, res) => {
    const naoAchei = () => res.status(404).type('text/html').send(`
      <!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Não encontrado</title>
      <style>body{font-family:sans-serif;text-align:center;padding:60px 20px;color:#444}</style></head>
      <body><h1>📊 Relatório não encontrado</h1><p>O link que você acessou pode estar errado ou ter sido removido.</p></body></html>
    `);
    try {
      const { normalizarTokenRelatorio } = await import('./modules/gd/relatorio-envio-textos.js');
      const token = normalizarTokenRelatorio(req.params.token);
      if (!token) return naoAchei();
      const { abrirPdfPublico } = await import('./modules/gd/relatorio-publico.js');
      const r = await abrirPdfPublico(supabase.getClient(), token);
      if (!r) return naoAchei();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${r.nomeArquivo}"`);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.send(r.pdf);
    } catch (err) {
      console.error('[rg] relatório público:', (err as Error).message);
      res.status(500).type('text/html').send('<h1>Não consegui abrir o relatório agora. Tente de novo em alguns minutos.</h1>');
    }
  });
```

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat(gd): rota publica /rg/:token abre o PDF do relatorio

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Conserto — envio da Pasta Digital pelo canal da empresa

**Files:**
- Modify: `src/modules/dashboard/router.ts` (`router.post('/pastas/:id/enviar', ...)` ~6296)

- [ ] **Step 1: Substituir o começo da rota**

Troque:

```ts
  router.post('/pastas/:id/enviar', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!UUID_RE.test(id)) return res.status(400).send('UUID inválido');
    const sendText = options.sendText;
    if (!sendText) return res.status(500).send('sendText não configurado neste ambiente.');
    const r = await pastaService.enviarPorWhatsApp(id, sendText, options.sendTemplate, { forcar: true });

    // O e-mail vai JUNTO, igual ao botão do zap (09/09/2026). Nunca derruba o
    // envio do zap — mas o resultado APARECE na tela (23/09/2026): antes ele era
    // engolido e a tela redirecionava como se o e-mail tivesse saído.
    let email: { ok: boolean; reason?: string; para?: string } | null = null;
    if (process.env.RESEND_API_KEY) {
      const { EmailSender } = await import('../email/resend-client.js');
      const sender = new EmailSender(process.env.RESEND_API_KEY, process.env.EMAIL_FROM ?? '');
      email = await pastaService
        .enviarPorEmail(id, (e) => sender.enviar(e))
        .catch((err) => ({ ok: false, reason: (err as Error).message }));
    }
```

por:

```ts
  router.post('/pastas/:id/enviar', async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    if (!UUID_RE.test(id)) return res.status(400).send('UUID inválido');
    const sendText = options.sendText;
    if (!sendText) return res.status(500).send('sendText não configurado neste ambiente.');

    // 27/09/2026: o envio roda DENTRO da empresa de quem clicou (marca, trava
    // LGPD, textos) e do canal dela. Antes rodava sem contexto e um tenant
    // (ex.: Conquista Solar) mandava a pasta pelo número da EcoSunPower.
    // Tenant sem WhatsApp próprio conectado não manda zap — nunca pelo número de outra empresa.
    const { canalZapDaEmpresa, noCanalDaEmpresa, EMPRESA_CASA } = await import('./canal-envio.js');
    const companyId = (req as AuthedRequest).dashUser?.companyId ?? EMPRESA_CASA;
    const instancia = await instanciaDoTenant(req as AuthedRequest);
    const canal = canalZapDaEmpresa(companyId, instancia);

    const { r, email } = await noCanalDaEmpresa(companyId, instancia, async () => {
      const r: { ok: boolean; reason?: string } = canal === 'nenhum'
        ? { ok: false, reason: 'sem_canal' }
        // Modelo (WABA) é só da EcoSun; tenant vai por texto na instância dele.
        : await pastaService.enviarPorWhatsApp(id, sendText, canal === 'casa' ? options.sendTemplate : undefined, { forcar: true });

      // O e-mail vai JUNTO, igual ao botão do zap (09/09/2026). Nunca derruba o
      // envio do zap — mas o resultado APARECE na tela (23/09/2026): antes ele era
      // engolido e a tela redirecionava como se o e-mail tivesse saído.
      let email: { ok: boolean; reason?: string; para?: string } | null = null;
      if (process.env.RESEND_API_KEY) {
        const { EmailSender } = await import('../email/resend-client.js');
        const sender = new EmailSender(process.env.RESEND_API_KEY, process.env.EMAIL_FROM ?? '');
        email = await pastaService
          .enviarPorEmail(id, (e) => sender.enviar(e))
          .catch((err) => ({ ok: false, reason: (err as Error).message }));
      }
      return { r, email };
    });
```

O resto da rota (`pastaDepois`, `console.log`, `renderResultadoEnvioPasta`) fica igual.

- [ ] **Step 2: tsc + testes da pasta**

Run: `npx tsc --noEmit && npx vitest run tests/pasta-service.test.ts tests/pasta-envio-resultado.test.ts tests/canal-envio.test.ts`
Expected: tsc limpo; PASS.

- [ ] **Step 3: Commit**

```bash
git add src/modules/dashboard/router.ts
git commit -m "fix(pasta): envio pelo painel usa a empresa e o WhatsApp de quem clicou (tenant nunca sai pelo numero da EcoSun)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: BÔNUS — "📊 Relatórios da sua usina" na Pasta Digital pública

**Files:**
- Modify: `src/modules/relatorios/pasta/types.ts` (`PastaView`)
- Modify: `src/modules/relatorios/pasta/service.ts` (construtor + `resolverView`)
- Modify: `src/modules/relatorios/pasta/template.ts` (novo bloco depois de `sistemaHtml`)
- Modify: `src/index.ts` (rota `/pasta/:slug` ~9467) e `src/modules/dashboard/router.ts` (~5959)
- Test: `tests/pasta-service.test.ts` (fim), `tests/pasta-relatorios-usina.test.ts` (novo)

- [ ] **Step 1: Write the failing tests**

No FIM de `tests/pasta-service.test.ts`:

```ts
describe('PastaService.resolverView — relatórios da usina (fatia 3)', () => {
  const publicada = { ...PASTA_BASE, status: 'publicada', arquivos: [] };
  const lista = [{ referencia: '2026-08-01', mesExtenso: 'agosto de 2026', url: 'https://p.x/rg/T' }];

  it('relatórios enviados do cliente entram na view', async () => {
    const listar = vi.fn().mockResolvedValue(lista);
    const svc = new PastaService(fakeSupabase() as any, semSistema, listar);
    const v = await svc.resolverView(publicada as any, true);
    expect(listar).toHaveBeenCalledWith('lead-1');
    expect(v!.relatorios_usina).toEqual(lista);
  });
  it('falha ao listar não derruba a pasta (lista vazia)', async () => {
    const svc = new PastaService(fakeSupabase() as any, semSistema, vi.fn().mockRejectedValue(new Error('133 não aplicada')));
    const v = await svc.resolverView(publicada as any, true);
    expect(v).not.toBeNull();
    expect(v!.relatorios_usina).toEqual([]);
  });
  it('sem o listador (ex.: envio automático) → lista vazia', async () => {
    const v = await new PastaService(fakeSupabase() as any, semSistema).resolverView(publicada as any, true);
    expect(v!.relatorios_usina).toEqual([]);
  });
});
```

Novo `tests/pasta-relatorios-usina.test.ts`:

```ts
// tests/pasta-relatorios-usina.test.ts
import { describe, it, expect } from 'vitest';
import { renderPastaHtml } from '../src/modules/relatorios/pasta/template.js';
import type { PastaView } from '../src/modules/relatorios/pasta/types.js';

const view = (o: Partial<PastaView> = {}): PastaView => ({
  cliente_nome: 'João', cliente_cidade: null, cliente_uf: null, data_entrega: null, sistema: null, capa_url: null,
  logo_base64: 'data:image/png;base64,AAA', whatsapp: null, secoes: [], slug: 'abcdefghjk', publico: true,
  gerado_em: '2026-09-27T12:00:00Z', ...o,
});

describe('Pasta Digital — 📊 Relatórios da sua usina', () => {
  it('lista os meses com link para /rg/, mês com letra maiúscula', () => {
    const h = renderPastaHtml(view({ relatorios_usina: [
      { referencia: '2026-08-01', mesExtenso: 'agosto de 2026', url: 'https://p.x/rg/B' },
      { referencia: '2026-07-01', mesExtenso: 'julho de 2026', url: 'https://p.x/rg/A' },
    ] }));
    expect(h).toContain('📊 Relatórios da sua usina');
    expect(h).toContain('href="https://p.x/rg/B"');
    expect(h).toContain('Agosto de 2026');
    expect(h.indexOf('Agosto de 2026')).toBeLessThan(h.indexOf('Julho de 2026'));
  });
  it('sem relatório enviado o bloco não aparece', () => {
    expect(renderPastaHtml(view())).not.toContain('Relatórios da sua usina');
    expect(renderPastaHtml(view({ relatorios_usina: [] }))).not.toContain('Relatórios da sua usina');
  });
  it('link é escapado', () => {
    const h = renderPastaHtml(view({ relatorios_usina: [{ referencia: '2026-08-01', mesExtenso: 'agosto de 2026', url: 'https://p.x/rg/"><script>' }] }));
    expect(h).not.toContain('"><script>');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/pasta-service.test.ts tests/pasta-relatorios-usina.test.ts`
Expected: FAIL — `relatorios_usina` undefined / bloco ausente.

- [ ] **Step 3: Implement**

Em `src/modules/relatorios/pasta/types.ts`, dentro de `PastaView`, logo DEPOIS de `gerado_em: string;`:

```ts
  /** Relatórios mensais da usina já ENVIADOS ao cliente (mais novo primeiro, até 12). */
  relatorios_usina?: Array<{ referencia: string; mesExtenso: string; url: string }>;
```

Em `src/modules/relatorios/pasta/service.ts`, troque o construtor:

```ts
  constructor(
    private supabase: SupabaseService,
    private resolverSistema: ResolverSistema,
  ) {}
```

por:

```ts
  constructor(
    private supabase: SupabaseService,
    private resolverSistema: ResolverSistema,
    // Relatórios mensais já enviados (fatia 3 dos demonstrativos). Opcional:
    // quem não passa (envio automático) só não mostra o bloco.
    private listarRelatoriosUsina?: (leadId: string) => Promise<Array<{ referencia: string; mesExtenso: string; url: string }>>,
  ) {}
```

Em `resolverView`, logo ANTES de `return {` acrescente:

```ts
    // Nunca derruba a pasta: sem relatório (ou erro) = bloco some.
    const relatorios_usina = this.listarRelatoriosUsina
      ? await this.listarRelatoriosUsina(pasta.lead_id).catch((err) => {
          console.warn('[pasta] relatórios da usina não listados:', (err as Error).message);
          return [];
        })
      : [];
```

e no objeto retornado, logo DEPOIS de `gerado_em: pasta.updated_at,`:

```ts
      relatorios_usina,
```

Em `src/modules/relatorios/pasta/template.ts`, logo DEPOIS do bloco `const sistemaHtml = ... : '';`:

```ts
  // Relatórios mensais já enviados (fatia 3 dos demonstrativos). Não entram no ZIP.
  const relatorios = v.relatorios_usina ?? [];
  const relatoriosHtml = relatorios.length > 0 ? `
    <section>
      <h2>📊 Relatórios da sua usina</h2>
      <div class="lista-docs">
        ${relatorios.map((r) => `
        <a class="doc" href="${escapeHtml(r.url)}" target="_blank" rel="noopener">
          <span class="doc-ico">📊</span>
          <span class="doc-nome">${escapeHtml(r.mesExtenso.charAt(0).toLocaleUpperCase('pt-BR') + r.mesExtenso.slice(1))}</span>
          <span class="doc-acao">abrir ›</span>
        </a>`).join('')}
      </div>
    </section>` : '';
```

e no HTML, troque:

```
  ${sistemaHtml}

  ${secoesHtml}
```

por:

```
  ${sistemaHtml}

  ${relatoriosHtml}

  ${secoesHtml}
```

- [ ] **Step 4: Ligar o listador (página pública e prévia do painel)**

Em `src/index.ts`, na rota `app.get('/pasta/:slug', ...)`, troque o fechamento do `new PastaService(...)`:

```ts
        inversor_modelo: s.inversor_modelo ?? null,
      };
    });
    const view = await pastaService.resolverView(pasta, true);
```

por:

```ts
        inversor_modelo: s.inversor_modelo ?? null,
      };
    }, async (leadId) => {
      const { listarRelatoriosEnviadosDoLead } = await import('./modules/gd/relatorio-publico.js');
      const { basePublica } = await import('./modules/gd/relatorio-envio-textos.js');
      return listarRelatoriosEnviadosDoLead(supabase.getClient(), leadId, basePublica());
    });
    const view = await pastaService.resolverView(pasta, true);
```

Em `src/modules/dashboard/router.ts`, troque:

```ts
  const pastaService = new PastaService(supabaseService, resolverSistemaFV);
```

por:

```ts
  const pastaService = new PastaService(supabaseService, resolverSistemaFV, async (leadId) => {
    const { listarRelatoriosEnviadosDoLead } = await import('../gd/relatorio-publico.js');
    const { basePublica } = await import('../gd/relatorio-envio-textos.js');
    return listarRelatoriosEnviadosDoLead(supabase, leadId, basePublica());
  });
```

(Enviar o relatório NÃO reenvia a pasta — só aparece no bloco da próxima vez que o cliente abrir a pasta.)

- [ ] **Step 5: Run tests + tsc**

Run: `npx vitest run tests/pasta-service.test.ts tests/pasta-relatorios-usina.test.ts tests/pasta-template.test.ts && npx tsc --noEmit`
Expected: PASS, tsc limpo.

- [ ] **Step 6: Commit**

```bash
git add src/modules/relatorios/pasta/types.ts src/modules/relatorios/pasta/service.ts src/modules/relatorios/pasta/template.ts src/index.ts src/modules/dashboard/router.ts tests/pasta-service.test.ts tests/pasta-relatorios-usina.test.ts
git commit -m "feat(pasta): bloco Relatorios da sua usina na Pasta Digital publica

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Vencimento dos créditos no PDF — regra dos 6 meses

**Files:**
- Modify: `src/modules/gd/demonstrativos-tela.ts` (`alertaVencimento` ~32-37)
- Modify: `src/modules/gd/relatorio-motor.ts` (tipo `RelatorioGd.creditos`, import, objeto `creditos`)
- Modify: `src/modules/gd/relatorio-html.ts` (`const venc`)
- Test: `tests/gd-demonstrativos-tela.test.ts`, `tests/gd-relatorio-motor.test.ts`, `tests/gd-relatorio-html.test.ts`

- [ ] **Step 1: Write the failing tests**

Em `tests/gd-demonstrativos-tela.test.ts`, abaixo dos imports existentes:

```ts
import { tipoAvisoVencimento } from '../src/modules/gd/demonstrativos-tela.js';
```

e no FIM do arquivo:

```ts
describe('tipoAvisoVencimento — mesma regra dos 6 meses do alerta da tela', () => {
  it('até 6 meses da data-base = alerta; depois disso = validade; vencido/sem dado = null', () => {
    expect(tipoAvisoVencimento(50, '2027-02-01', '2026-08-01')).toBe('alerta');
    expect(tipoAvisoVencimento(50, '2026-08-01', '2026-08-01')).toBe('alerta');
    expect(tipoAvisoVencimento(50, '2027-03-01', '2026-08-01')).toBe('validade');
    expect(tipoAvisoVencimento(50, '2026-07-01', '2026-08-01')).toBeNull();
    expect(tipoAvisoVencimento(0, '2027-02-01', '2026-08-01')).toBeNull();
    expect(tipoAvisoVencimento(null, '2027-02-01', '2026-08-01')).toBeNull();
    expect(tipoAvisoVencimento(50, null, '2026-08-01')).toBeNull();
  });
});
```

Em `tests/gd-relatorio-motor.test.ts`, troque a expectativa do teste `'creditos: saldo, usados no mes e a vencer com mes'`:

```ts
    expect(r.creditos).toEqual({ saldoKwh: 1240, usadosNoMesKwh: 380, aVencerKwh: 50, venceEm: 'mar/2027' });
```

por:

```ts
    // mar/2027 está a 7 meses de ago/2026 (mês do relatório) → só informa a validade.
    expect(r.creditos).toEqual({ saldoKwh: 1240, usadosNoMesKwh: 380, aVencerKwh: 50, venceEm: 'mar/2027', avisoVencimento: 'validade' });
```

e acrescente no FIM do arquivo:

```ts
describe('montarRelatorio — aviso de vencimento pelo mês do relatório', () => {
  it('vence em até 6 meses do mês do relatório → alerta', () => {
    const r = montarRelatorio(entrada({ linha: linha({ ciclo_expirar: '2027-01-01' }) }));
    expect(r.creditos.avisoVencimento).toBe('alerta');
  });
  it('sem crédito a vencer → null', () => {
    const r = montarRelatorio(entrada({ linha: linha({ proximo_expirar_kwh: null }) }));
    expect(r.creditos.avisoVencimento).toBeNull();
  });
});
```

Em `tests/gd-relatorio-html.test.ts`, na fixture `rel`, troque:

```ts
  creditos: { saldoKwh: 1240, usadosNoMesKwh: 380, aVencerKwh: 50, venceEm: 'mar/2027' },
```

por:

```ts
  creditos: { saldoKwh: 1240, usadosNoMesKwh: 380, aVencerKwh: 50, venceEm: 'mar/2027', avisoVencimento: 'alerta' },
```

e acrescente no FIM do arquivo:

```ts
describe('renderRelatorioHtml — vencimento dos créditos', () => {
  const creditos = { saldoKwh: 1240, usadosNoMesKwh: 380, aVencerKwh: 50, venceEm: 'mar/2027' };
  it('longe (mais de 6 meses): linha simples, sem o alerta amarelo', () => {
    const h = renderRelatorioHtml(rel({ creditos: { ...creditos, avisoVencimento: 'validade' } }), marca);
    expect(h).toContain('Créditos válidos até <b>mar/2027</b>.');
    expect(h).not.toContain('Use antes disso');
    expect(h).not.toContain('class="alerta"');
  });
  it('perto (até 6 meses): alerta amarelo', () => {
    const h = renderRelatorioHtml(rel({ creditos: { ...creditos, avisoVencimento: 'alerta' } }), marca);
    expect(h).toMatch(/class="alerta">⏰ .* vencem em <b>mar\/2027<\/b>\. Use antes disso\./);
  });
  it('sem aviso: nenhuma das duas linhas', () => {
    const h = renderRelatorioHtml(rel({ creditos: { ...creditos, avisoVencimento: null } }), marca);
    expect(h).not.toContain('Use antes disso');
    expect(h).not.toContain('Créditos válidos até');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/gd-demonstrativos-tela.test.ts tests/gd-relatorio-motor.test.ts tests/gd-relatorio-html.test.ts`
Expected: FAIL — `tipoAvisoVencimento is not a function`, `avisoVencimento` ausente, linha "Créditos válidos até" ausente.

- [ ] **Step 3: Implement**

Em `src/modules/gd/demonstrativos-tela.ts`, troque a função `alertaVencimento` inteira:

```ts
export function alertaVencimento(kwh: number | null, ciclo: string | null, hojeIso: string): string | null {
  if (!kwh || kwh <= 0 || !ciclo) return null;
  const faltam = mesesEntre(hojeIso, ciclo);
  if (faltam < 0 || faltam > MESES_ALERTA) return null;
  return `⏰ ${fmt(kwh)} kWh de crédito vencem em ${mesCurto(ciclo)}`;
}
```

por:

```ts
/**
 * Regra ÚNICA do aviso de vencimento (tela e PDF): vence em até 6 meses da
 * data-base → 'alerta'; mais longe → 'validade' (só informa); já vencido ou
 * sem crédito → null. A tela usa hoje como base; o PDF usa o mês do relatório.
 */
export function tipoAvisoVencimento(kwh: number | null, ciclo: string | null, baseIso: string): 'alerta' | 'validade' | null {
  if (!kwh || kwh <= 0 || !ciclo) return null;
  const faltam = mesesEntre(baseIso, ciclo);
  if (faltam < 0) return null;
  return faltam <= MESES_ALERTA ? 'alerta' : 'validade';
}

export function alertaVencimento(kwh: number | null, ciclo: string | null, hojeIso: string): string | null {
  if (tipoAvisoVencimento(kwh, ciclo, hojeIso) !== 'alerta') return null;
  return `⏰ ${fmt(kwh as number)} kWh de crédito vencem em ${mesCurto(ciclo as string)}`;
}
```

Em `src/modules/gd/relatorio-motor.ts`:

- troque o import:

```ts
import { compensadoDoMes, consumoDoMes, historicoDoMes, historicoPorMes, numOuNull } from './demonstrativos-tela.js';
```

por:

```ts
import { compensadoDoMes, consumoDoMes, historicoDoMes, historicoPorMes, numOuNull, tipoAvisoVencimento } from './demonstrativos-tela.js';
```

- no `interface RelatorioGd`, troque:

```ts
  creditos: { saldoKwh: number | null; usadosNoMesKwh: number | null; aVencerKwh: number | null; venceEm: string | null };
```

por:

```ts
  creditos: {
    saldoKwh: number | null; usadosNoMesKwh: number | null; aVencerKwh: number | null; venceEm: string | null;
    /** 'alerta' = vence em até 6 meses do mês do relatório; 'validade' = só informa até quando vale. */
    avisoVencimento: 'alerta' | 'validade' | null;
  };
```

- no objeto `creditos` do `return`, logo DEPOIS de `venceEm: l.ciclo_expirar ? mesCurto(l.ciclo_expirar) : null,`:

```ts
      avisoVencimento: tipoAvisoVencimento(l.proximo_expirar_kwh, l.ciclo_expirar, l.referencia),
```

Em `src/modules/gd/relatorio-html.ts`, troque:

```ts
  const venc = r.creditos.aVencerKwh && r.creditos.aVencerKwh > 0 && r.creditos.venceEm
    ? `<p class="alerta">⏰ ${kwh(r.creditos.aVencerKwh)} de créditos vencem em <b>${esc(r.creditos.venceEm)}</b>. Use antes disso.</p>` : '';
```

por:

```ts
  // Alerta amarelo só quando vence em até 6 meses do mês do relatório (mesma
  // regra da tela); mais longe, só informa a validade — sem assustar o cliente.
  const temVencimento = Boolean(r.creditos.aVencerKwh && r.creditos.aVencerKwh > 0 && r.creditos.venceEm);
  const venc = !temVencimento ? ''
    : r.creditos.avisoVencimento === 'alerta'
      ? `<p class="alerta">⏰ ${kwh(r.creditos.aVencerKwh)} de créditos vencem em <b>${esc(r.creditos.venceEm)}</b>. Use antes disso.</p>`
      : r.creditos.avisoVencimento === 'validade'
        ? `<p class="nota">Créditos válidos até <b>${esc(r.creditos.venceEm)}</b>.</p>`
        : '';
```

- [ ] **Step 4: Run tests + tsc**

Run: `npx vitest run tests/gd-demonstrativos-tela.test.ts tests/gd-relatorio-motor.test.ts tests/gd-relatorio-html.test.ts tests/gd-relatorio-servico.test.ts && npx tsc --noEmit`
Expected: PASS, tsc limpo.

- [ ] **Step 5: Commit**

```bash
git add src/modules/gd/demonstrativos-tela.ts src/modules/gd/relatorio-motor.ts src/modules/gd/relatorio-html.ts tests/gd-demonstrativos-tela.test.ts tests/gd-relatorio-motor.test.ts tests/gd-relatorio-html.test.ts
git commit -m "fix(gd): PDF so alerta vencimento em ate 6 meses; alem disso informa a validade

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: Verificação final, PR e ordem de implantação

**Files:** nenhum novo.

- [ ] **Step 1: Tipos e testes completos**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npx vitest run`
Expected: tudo verde, exceto as 2 falhas pré-existentes em `tests/supabase-vincular-novo.test.ts`.

- [ ] **Step 2: Revisão do próprio diff**

Run: `git diff main --stat` e leia o diff inteiro. Confira:
- nenhum `sendTemplate` é chamado com `canal !== 'casa'`;
- toda leitura/gravação do repo filtra `company_id`; a rota `/rg/` só filtra `token`;
- todo HTML de dado passa por `esc`/`escapeHtml`;
- nenhum texto ao cliente diz "engenheiro".

- [ ] **Step 3: Teste manual local (com `.env` de homologação)**

1. `npm run dev` (ou o comando de start local do time) e entre no painel como EcoSun.
2. `/dashboard/demonstrativos` → abra um cliente com mês 🟢 cujo cadastro tem o SEU telefone e e-mail.
3. Botão "📲 Enviar ao cliente pela Eva" → confira a prévia: texto do zap, e-mail (iframe), link `…/rg/…`.
4. "Confirmar e enviar" → tela ✅/❌. Sem o modelo aprovado espere ✅ com o aviso "saiu como mensagem comum…" (se você falou com o número nas últimas 24 h) ou ❌ "aguardando aprovação do modelo na Meta".
5. Abra o link do resultado: o PDF abre direto no celular (inline), sem login.
6. Volte à tela do cliente: aparece "✅ enviado em DD/MM HH:mm para (61) 9…". Clique de novo em Enviar: a confirmação mostra "Este relatório já foi enviado" e o botão "🔁 Enviar de novo".
7. Em `/dashboard/leads` (conversa do cliente) aparece "📊 Relatório de <mês> enviado pela tela…".
8. Abra a Pasta Digital pública do cliente (`/pasta/<slug>`): bloco "📊 Relatórios da sua usina" com o mês.
9. Cliente com `opt_out = true` → a confirmação mostra "Não vai sair — cliente pediu pra não receber mensagens" nos dois canais.
10. Tenant (login da Conquista Solar): com instância conectada, o zap sai pelo número DELA com o PDF anexo; sem instância conectada, ❌ "a empresa ainda não conectou o WhatsApp dela". Repita o envio da Pasta Digital do tenant: mesma regra.
11. PDF de um cliente com créditos vencendo a mais de 6 meses do mês: linha "Créditos válidos até …", sem o quadro amarelo.

- [ ] **Step 4: Push e PR (pedir ao Junior antes do push)**

```bash
git push origin feat/gd-enviar-relatorio-eva
gh pr create --title "feat(gd): enviar o relatório mensal ao cliente pela Eva (fatia 3)" --body "Botão Enviar pela Eva (mês 🟢), prévia, link público /rg/<token>, WhatsApp (modelo relatorio_usina_v1 na EcoSun; texto + PDF pela instância do tenant), e-mail, resultado por canal, registro na conversa, bloco na Pasta Digital, regra dos 6 meses no vencimento e conserto do canal do tenant no envio da Pasta.

Implantação: aplicar a migration 133 ANTES; criar o modelo relatorio_usina_v1 na Meta (docs/whatsapp-templates/relatorio_usina_v1.md).

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 5: Ordem de implantação (Junior)**

1. Avisar no grupo: "vou usar a 133" (se ainda não avisou).
2. Criar o modelo `relatorio_usina_v1` na Meta seguindo `docs/whatsapp-templates/relatorio_usina_v1.md` (pode ser já; a aprovação leva de minutos a 1 dia).
3. **Aplicar `supabase/migrations/133_relatorios_gd_envio.sql` no SQL Editor do Supabase ANTES do deploy.**
4. Juntar o PR na `main` → Implantar no EasyPanel.
5. Conferir `/health` (build novo) e repetir os passos 2–8 do teste manual em produção com o seu próprio telefone.
6. Enquanto o modelo não for aprovado, os envios da EcoSun só chegam para quem falou com a Eva nas últimas 24 h — a tela avisa em cada envio.
