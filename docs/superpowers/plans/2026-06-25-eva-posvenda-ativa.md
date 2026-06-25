# Eva Pós-venda ativa + tela de Relacionamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a tela `/dashboard/pos-venda` (lista de clientes-com-usina guiada por atenção) com botões de ação manual (parabéns, relatório do mês, limpeza, depoimento, upgrade, registrar contato) que reusam o redator da Eva, mandam via `wa.me` e gravam na timeline + sincronizam com `monitoring_abordagens` (Eva não duplica contato).

**Architecture:** Funções puras (saúde da usina, próxima ação, elegibilidade de upgrade, ordenação por atenção, redação de mensagem) → camada de queries que junta lead+usina+saúde+relacionamento → view server-rendered via `renderLayout` → 2 rotas (`GET /pos-venda` lista, `POST /pos-venda/:leadId/acao` em 2 fases: gera preview / confirma envio). Reusa o que já existe: `redator.ts`, `numeros-usina.ts`, `registrarAtividade` (timeline) e `monitoring_abordagens` (uma fonte de verdade Eva↔time). **Sem migration** — usa só tipos/desfechos existentes.

**Tech Stack:** TypeScript ESM (imports `.js`), Express server-rendered, Tailwind via CDN, vitest, Supabase/Postgres, Anthropic SDK (via redator, com fallback puro).

**Escopo desta leva (peça 1):** tela + botões manuais + sincronia anti-duplicata. **FORA (vira peça 1b / decisão do Junior):** ligar os gatilhos AUTOMÁTICOS da Eva (relatório mensal automático e oferta de upgrade automática — §4.4 da spec) — esses precisam de mexer no orquestrador + sair do `DRY_RUN` e ficam pra depois de validar o lado manual. Os botões manuais de relatório/upgrade JÁ entram aqui (o time faz na mão hoje).

---

## File Structure

**Criar:**
- `src/modules/dashboard/pos-venda-saude.ts` — funções PURAS: `saudeUsina`, `elegivelUpgrade`, `proximaAcaoPosVenda`, `ordenarPorAtencao`.
- `src/modules/dashboard/pos-venda-mensagens.ts` — funções PURAS de redação manual: `objetivoManual`, `fallbackMensagem`, `montarContextoManual`.
- `src/modules/dashboard/pos-venda-queries.ts` — I/O: `listarClientesPosVenda` (junta lead+usina+alertas+geração+última abordagem).
- `src/modules/dashboard/pos-venda-views.ts` — `renderPosVendaPage` (lista + botões + modal de preview).
- `tests/pos-venda-saude.test.ts`, `tests/pos-venda-mensagens.test.ts`, `tests/pos-venda-views.test.ts`.

**Modificar:**
- `src/modules/monitoring/abordagem/abordagens-repo.ts` — `registrarAbordagemManual` (insere abordagem já `encerrada`/`enviada` pra Eva ver e não re-mandar).
- `src/modules/dashboard/router.ts` — rotas `GET /pos-venda` e `POST /pos-venda/:leadId/acao`.
- `src/modules/dashboard/views.ts` — item "Pós-venda" no setor Operação + `'pos_venda'` no union `active`.

---

## Tipos compartilhados (definidos na Task 1, usados em todas)

```ts
// pos-venda-saude.ts
export type Saude = 'verde' | 'amarelo' | 'vermelho';
export type AcaoManual = 'parabens' | 'relatorio' | 'limpeza' | 'depoimento' | 'upgrade' | 'contato';

export interface AlertaAberto { tipo: string; severidade: string }     // de alertas_sistema (resolved_at IS NULL)
export interface GeracaoDia { data: string; geracao_kwh: number }      // mesma forma de numeros-usina.ts

export interface ProximaAcao { tipo: AcaoManual; label: string; urgencia: 'alta' | 'media' | 'baixa' }

export interface UsinaInfo {
  potenciaKwp: number | null;
  dataInstalacao: string | null;   // 'YYYY-MM-DD'
  geracaoEstimadaKwhMes: number | null;
}
export interface ContaInfo { consumoMedioKwh: number | null }
```

---

## Task 1: Saúde da usina (pura)

**Files:**
- Create: `src/modules/dashboard/pos-venda-saude.ts`
- Test: `tests/pos-venda-saude.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/pos-venda-saude.test.ts
import { describe, it, expect } from 'vitest';
import { saudeUsina } from '../src/modules/dashboard/pos-venda-saude.js';

describe('saudeUsina', () => {
  const ger = (n: number) => Array.from({ length: n }, (_, i) => ({ data: `2026-06-${String(i + 1).padStart(2, '0')}`, geracao_kwh: 20 }));

  it('vermelho quando há alerta de offline aberto', () => {
    expect(saudeUsina([{ tipo: 'sistema_offline', severidade: 'urgente' }], ger(10))).toBe('vermelho');
  });
  it('vermelho quando há falha de inversor aberta', () => {
    expect(saudeUsina([{ tipo: 'falha_inversor', severidade: 'urgente' }], ger(10))).toBe('vermelho');
  });
  it('vermelho quando a usina não gera nada há dias (todas as leituras recentes zeradas)', () => {
    const zerado = ger(8).map((g) => ({ ...g, geracao_kwh: 0 }));
    expect(saudeUsina([], zerado)).toBe('vermelho');
  });
  it('amarelo quando há queda de geração aberta', () => {
    expect(saudeUsina([{ tipo: 'queda_geracao', severidade: 'aviso' }], ger(10))).toBe('amarelo');
  });
  it('amarelo quando manutenção devida está aberta', () => {
    expect(saudeUsina([{ tipo: 'manutencao_devida', severidade: 'info' }], ger(10))).toBe('amarelo');
  });
  it('verde quando gera normal e não há alerta relevante', () => {
    expect(saudeUsina([{ tipo: 'milestone_economia', severidade: 'info' }], ger(10))).toBe('verde');
  });
  it('verde quando não há geração registrada ainda (sem dados ≠ offline)', () => {
    expect(saudeUsina([], [])).toBe('verde');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pos-venda-saude.test.ts`
Expected: FAIL — "saudeUsina is not a function" / módulo não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/modules/dashboard/pos-venda-saude.ts
export type Saude = 'verde' | 'amarelo' | 'vermelho';
export type AcaoManual = 'parabens' | 'relatorio' | 'limpeza' | 'depoimento' | 'upgrade' | 'contato';

export interface AlertaAberto { tipo: string; severidade: string }
export interface GeracaoDia { data: string; geracao_kwh: number }

const VERMELHO_ALERTAS = new Set(['sistema_offline', 'falha_inversor']);
const AMARELO_ALERTAS = new Set(['queda_geracao', 'manutencao_devida']);

// Saúde = pior sinal entre alertas abertos e geração recente.
// "Sem dados" (array vazio) NÃO é vermelho — usina nova/sem sync ≠ offline.
export function saudeUsina(alertasAbertos: AlertaAberto[], geracaoRecente: GeracaoDia[]): Saude {
  if (alertasAbertos.some((a) => VERMELHO_ALERTAS.has(a.tipo))) return 'vermelho';
  // Tem leitura recente, mas TUDO zerado (>= 5 dias) → parou de gerar.
  const comLeitura = geracaoRecente.length >= 5;
  const tudoZero = geracaoRecente.length > 0 && geracaoRecente.every((g) => Number(g.geracao_kwh) === 0);
  if (comLeitura && tudoZero) return 'vermelho';
  if (alertasAbertos.some((a) => AMARELO_ALERTAS.has(a.tipo))) return 'amarelo';
  return 'verde';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pos-venda-saude.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/pos-venda-saude.ts tests/pos-venda-saude.test.ts
git commit -m "feat(pos-venda): saudeUsina (semaforo por alertas + geracao)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Elegibilidade de upgrade (pura)

**Files:**
- Modify: `src/modules/dashboard/pos-venda-saude.ts` (adiciona `elegivelUpgrade` + tipos `UsinaInfo`/`ContaInfo`)
- Test: `tests/pos-venda-saude.test.ts` (adiciona describe)

- [ ] **Step 1: Write the failing test**

```ts
// adicionar em tests/pos-venda-saude.test.ts
import { elegivelUpgrade } from '../src/modules/dashboard/pos-venda-saude.js';

describe('elegivelUpgrade', () => {
  it('elegível quando o consumo médio supera a geração em mais de 15%', () => {
    expect(elegivelUpgrade({ potenciaKwp: 5, dataInstalacao: '2024-01-01', geracaoEstimadaKwhMes: 600 }, { consumoMedioKwh: 800 })).toBe(true);
  });
  it('não elegível quando geração cobre o consumo', () => {
    expect(elegivelUpgrade({ potenciaKwp: 5, dataInstalacao: '2024-01-01', geracaoEstimadaKwhMes: 600 }, { consumoMedioKwh: 580 })).toBe(false);
  });
  it('não elegível quando faltam dados (não chuta)', () => {
    expect(elegivelUpgrade({ potenciaKwp: 5, dataInstalacao: null, geracaoEstimadaKwhMes: null }, { consumoMedioKwh: 800 })).toBe(false);
    expect(elegivelUpgrade({ potenciaKwp: 5, dataInstalacao: null, geracaoEstimadaKwhMes: 600 }, { consumoMedioKwh: null })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pos-venda-saude.test.ts`
Expected: FAIL — "elegivelUpgrade is not a function".

- [ ] **Step 3: Write minimal implementation**

```ts
// adicionar em src/modules/dashboard/pos-venda-saude.ts
export interface UsinaInfo {
  potenciaKwp: number | null;
  dataInstalacao: string | null;
  geracaoEstimadaKwhMes: number | null;
}
export interface ContaInfo { consumoMedioKwh: number | null }

// Elegível pra ampliação/bateria quando o consumo cresceu além do que a usina
// gera (cliente voltou a pagar conta cheia). Sem os dois números → não sugere.
const MARGEM_UPGRADE = 1.15;
export function elegivelUpgrade(usina: UsinaInfo, conta: ContaInfo): boolean {
  const ger = usina.geracaoEstimadaKwhMes;
  const cons = conta.consumoMedioKwh;
  if (!(typeof ger === 'number' && ger > 0)) return false;
  if (!(typeof cons === 'number' && cons > 0)) return false;
  return cons > ger * MARGEM_UPGRADE;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pos-venda-saude.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/pos-venda-saude.ts tests/pos-venda-saude.test.ts
git commit -m "feat(pos-venda): elegivelUpgrade (consumo cresceu acima da geracao)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Próxima ação sugerida + ordenação por atenção (puras)

**Files:**
- Modify: `src/modules/dashboard/pos-venda-saude.ts` (adiciona `proximaAcaoPosVenda`, `ordenarPorAtencao`, tipos)
- Test: `tests/pos-venda-saude.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// adicionar em tests/pos-venda-saude.test.ts
import { proximaAcaoPosVenda, ordenarPorAtencao } from '../src/modules/dashboard/pos-venda-saude.js';

describe('proximaAcaoPosVenda', () => {
  const hoje = new Date('2026-06-25T12:00:00Z');
  const base = {
    saude: 'verde' as const,
    dataInstalacao: '2024-06-25',   // 2 anos atrás
    ultimoContatoEm: '2026-06-20T12:00:00Z',
    jaTeveDepoimento: false,
    elegivelUpgrade: false,
  };

  it('saúde vermelha → limpeza/atenção com urgência alta', () => {
    const a = proximaAcaoPosVenda({ ...base, saude: 'vermelho' }, hoje);
    expect(a.tipo).toBe('limpeza');
    expect(a.urgencia).toBe('alta');
  });
  it('aniversário da usina em ≤7 dias → parabéns', () => {
    const a = proximaAcaoPosVenda({ ...base, dataInstalacao: '2024-06-30' }, hoje);
    expect(a.tipo).toBe('parabens');
  });
  it('saudável, nunca pediu depoimento e usina já tem ≥3 meses → depoimento', () => {
    const a = proximaAcaoPosVenda({ ...base, dataInstalacao: '2025-01-01', jaTeveDepoimento: false }, hoje);
    expect(a.tipo).toBe('depoimento');
  });
  it('já tem depoimento e é elegível a upgrade → upgrade', () => {
    const a = proximaAcaoPosVenda({ ...base, dataInstalacao: '2025-01-01', jaTeveDepoimento: true, elegivelUpgrade: true }, hoje);
    expect(a.tipo).toBe('upgrade');
  });
  it('tudo em dia → registrar contato (urgência baixa)', () => {
    const a = proximaAcaoPosVenda({ ...base, dataInstalacao: '2025-01-01', jaTeveDepoimento: true, elegivelUpgrade: false }, hoje);
    expect(a.tipo).toBe('contato');
    expect(a.urgencia).toBe('baixa');
  });
});

describe('ordenarPorAtencao', () => {
  it('vermelho antes de amarelo antes de verde; dentro do mesmo, mais tempo sem contato primeiro', () => {
    const linhas = [
      { id: 'a', saude: 'verde' as const, ultimoContatoEm: '2026-06-01T00:00:00Z' },
      { id: 'b', saude: 'vermelho' as const, ultimoContatoEm: '2026-06-24T00:00:00Z' },
      { id: 'c', saude: 'verde' as const, ultimoContatoEm: '2026-01-01T00:00:00Z' },
      { id: 'd', saude: 'amarelo' as const, ultimoContatoEm: '2026-06-20T00:00:00Z' },
    ];
    expect(ordenarPorAtencao(linhas).map((l) => l.id)).toEqual(['b', 'd', 'c', 'a']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pos-venda-saude.test.ts`
Expected: FAIL — "proximaAcaoPosVenda is not a function".

- [ ] **Step 3: Write minimal implementation**

```ts
// adicionar em src/modules/dashboard/pos-venda-saude.ts
export interface ProximaAcao { tipo: AcaoManual; label: string; urgencia: 'alta' | 'media' | 'baixa' }

export interface ContextoAcao {
  saude: Saude;
  dataInstalacao: string | null;
  ultimoContatoEm: string | null;
  jaTeveDepoimento: boolean;
  elegivelUpgrade: boolean;
}

function diasAteAniversario(dataInstalacao: string | null, hoje: Date): number | null {
  if (!dataInstalacao) return null;
  const inst = new Date(dataInstalacao + 'T00:00:00Z');
  if (Number.isNaN(inst.getTime())) return null;
  const prox = new Date(Date.UTC(hoje.getUTCFullYear(), inst.getUTCMonth(), inst.getUTCDate()));
  if (prox.getTime() < Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate())) {
    prox.setUTCFullYear(hoje.getUTCFullYear() + 1);
  }
  return Math.round((prox.getTime() - Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate())) / 86400000);
}

function mesesDesde(iso: string | null, hoje: Date): number | null {
  if (!iso) return null;
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : ''));
  if (Number.isNaN(d.getTime())) return null;
  return (hoje.getTime() - d.getTime()) / (30 * 86400000);
}

// Prioridade: problema na usina > marco (aniversário) > prova social (depoimento)
// > expansão (upgrade) > manter contato. A 1ª que casar manda.
export function proximaAcaoPosVenda(c: ContextoAcao, hoje: Date): ProximaAcao {
  if (c.saude === 'vermelho') return { tipo: 'limpeza', label: '🔴 Usina precisa de atenção', urgencia: 'alta' };
  if (c.saude === 'amarelo') return { tipo: 'limpeza', label: '🧹 Limpeza/manutenção recomendada', urgencia: 'media' };

  const dAniv = diasAteAniversario(c.dataInstalacao, hoje);
  if (dAniv !== null && dAniv <= 7) {
    return { tipo: 'parabens', label: dAniv === 0 ? '🎉 Aniversário da usina hoje' : `🎉 Aniversário em ${dAniv} dia(s)`, urgencia: 'media' };
  }

  const idadeMeses = mesesDesde(c.dataInstalacao, hoje);
  if (!c.jaTeveDepoimento && idadeMeses !== null && idadeMeses >= 3) {
    return { tipo: 'depoimento', label: '⭐ Bom momento pra pedir depoimento', urgencia: 'baixa' };
  }

  if (c.elegivelUpgrade) return { tipo: 'upgrade', label: '🔋 Elegível a upgrade/ampliação', urgencia: 'baixa' };

  return { tipo: 'contato', label: '📞 Manter relacionamento', urgencia: 'baixa' };
}

const PESO_SAUDE: Record<Saude, number> = { vermelho: 0, amarelo: 1, verde: 2 };

export interface LinhaOrdenavel { saude: Saude; ultimoContatoEm: string | null }
// Vermelho primeiro; empate → quem está sem contato há mais tempo sobe.
export function ordenarPorAtencao<T extends LinhaOrdenavel>(linhas: T[]): T[] {
  const t = (iso: string | null) => (iso ? new Date(iso).getTime() : 0); // sem contato = epoch = mais antigo
  return [...linhas].sort((a, b) => PESO_SAUDE[a.saude] - PESO_SAUDE[b.saude] || t(a.ultimoContatoEm) - t(b.ultimoContatoEm));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pos-venda-saude.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/pos-venda-saude.ts tests/pos-venda-saude.test.ts
git commit -m "feat(pos-venda): proximaAcaoPosVenda + ordenarPorAtencao (tela guiada por atencao)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Redação manual da mensagem (pura, com fallback)

**Files:**
- Create: `src/modules/dashboard/pos-venda-mensagens.ts`
- Test: `tests/pos-venda-mensagens.test.ts`

Objetivo: dar pra cada botão (a) um `objetivo` (que entra no prompt do `redator`) e (b) uma mensagem de FALLBACK pronta (caso a IA falhe), nos números reais do cliente. O `redator.redigirMensagem` é tentado na rota; este módulo garante que sempre há texto, mesmo offline.

- [ ] **Step 1: Write the failing test**

```ts
// tests/pos-venda-mensagens.test.ts
import { describe, it, expect } from 'vitest';
import { objetivoManual, fallbackMensagem } from '../src/modules/dashboard/pos-venda-mensagens.js';

describe('objetivoManual', () => {
  it('dá um objetivo distinto e não-vazio pra cada ação que manda mensagem', () => {
    for (const t of ['parabens', 'relatorio', 'limpeza', 'depoimento', 'upgrade'] as const) {
      expect(objetivoManual(t).length).toBeGreaterThan(10);
    }
  });
});

describe('fallbackMensagem', () => {
  const ctx = { nome: 'Antonio Carlos', trimestre: { kwh: 1200, reais: 980.5 } };

  it('parabéns usa só o primeiro nome e não fala preço', () => {
    const m = fallbackMensagem('parabens', ctx);
    expect(m).toContain('Antonio');
    expect(m).not.toMatch(/R\$\s?\d/);
  });
  it('relatório do mês cita kWh e economia quando há números', () => {
    const m = fallbackMensagem('relatorio', ctx);
    expect(m).toContain('1200');
    expect(m).toMatch(/980[.,]5/);
  });
  it('relatório sem números não inventa valores', () => {
    const m = fallbackMensagem('relatorio', { nome: 'Maria', trimestre: null });
    expect(m).not.toMatch(/R\$\s?\d/);
    expect(m).toContain('Maria');
  });
  it('limpeza e upgrade nunca citam preço de serviço', () => {
    expect(fallbackMensagem('limpeza', ctx)).not.toMatch(/R\$\s?\d/);
    expect(fallbackMensagem('upgrade', ctx)).not.toMatch(/R\$\s?\d/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pos-venda-mensagens.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/modules/dashboard/pos-venda-mensagens.ts
import type { AcaoManual } from './pos-venda-saude.js';
import { empresa } from '../empresa-config.js';

const OBJETIVOS: Record<Exclude<AcaoManual, 'contato'>, string> = {
  parabens: 'Parabenizar pelo marco/aniversário da usina e reforçar que estamos por perto.',
  relatorio: 'Mandar o resumo do período: quanto a usina gerou e quanto isso representou de economia.',
  limpeza: 'Oferecer uma limpeza/manutenção preventiva das placas pra manter a geração no talo.',
  depoimento: 'Pedir, com leveza, um depoimento/avaliação sobre a experiência com a usina.',
  upgrade: 'Sondar interesse em ampliar o sistema (mais placas/bateria/carregador) com base no consumo atual.',
};

export function objetivoManual(tipo: Exclude<AcaoManual, 'contato'>): string {
  return OBJETIVOS[tipo];
}

export interface CtxMensagem {
  nome: string;
  trimestre: { kwh: number; reais: number } | null;
}

const primeiroNome = (n: string) => (n.trim().split(/\s+/)[0] || 'tudo bem');
const assinatura = () => `${empresa().nomeAtendente}, da ${empresa().nomeFantasia}`;

// Mensagens de segurança (a IA é tentada antes; isto cobre falha/offline).
// REGRA: nunca falar preço de serviço; só usar números que vieram prontos.
export function fallbackMensagem(tipo: Exclude<AcaoManual, 'contato'>, c: CtxMensagem): string {
  const nome = primeiroNome(c.nome);
  switch (tipo) {
    case 'parabens':
      return `Oi ${nome}! 🎉 Passando só pra comemorar mais um marco da sua usina com a gente. Tá tudo certo por aí com a geração? Qualquer coisa é só chamar. — ${assinatura()}`;
    case 'relatorio':
      return c.trimestre
        ? `Oi ${nome}! ☀️ No período sua usina gerou ${c.trimestre.kwh} kWh, o que representou cerca de R$ ${c.trimestre.reais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} de economia. Tô à disposição se quiser entender algum detalhe. — ${assinatura()}`
        : `Oi ${nome}! ☀️ Passando pra te mandar um resumo de como sua usina vem rendendo. Quer que eu te explique os números do período? — ${assinatura()}`;
    case 'limpeza':
      return `Oi ${nome}! 🧹 Notei que pode ser um bom momento pra uma limpeza/manutenção preventiva das placas, pra manter a geração no talo. Posso te explicar como funciona? — ${assinatura()}`;
    case 'depoimento':
      return `Oi ${nome}! ⭐ Se a experiência com a sua usina tem sido boa, você toparia deixar um depoimento rapidinho? Ajuda demais outras famílias a decidirem. — ${assinatura()}`;
    case 'upgrade':
      return `Oi ${nome}! 🔋 Reparei que seu consumo cresceu — talvez valha a pena pensar em ampliar o sistema (placas, bateria ou carregador). Quer que eu te mostre as opções? — ${assinatura()}`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pos-venda-mensagens.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/pos-venda-mensagens.ts tests/pos-venda-mensagens.test.ts
git commit -m "feat(pos-venda): objetivos + mensagens de fallback dos botoes manuais

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Registrar abordagem manual (repo — sincronia anti-duplicata com a Eva)

**Files:**
- Modify: `src/modules/monitoring/abordagem/abordagens-repo.ts` (nova função no fim do bloco CRUD)
- Test: `tests/pos-venda-abordagem-manual.test.ts` (teste de forma, com fake client)

Quando o vendedor manda um parabéns/limpeza/depoimento pela plataforma, gravamos uma abordagem JÁ `encerrada`/`enviada` na MESMA tabela da Eva. Assim o `getDiarioUsina` da Eva enxerga (`ultimoParabensEnviadoEm`, `ultimaOfertaLimpezaEm`, `jaTeveDepoimento`) e **não re-manda**. Status `encerrada` nunca colide com o unique parcial (que só cobre abordagens abertas).

Mapa ação→tipo da Eva: `parabens`→`parabens`, `depoimento`→`depoimento`, `limpeza`→`queda`. (`relatorio`/`upgrade`/`contato` NÃO viram abordagem — a Eva ainda não manda esses no automático; vão só pra timeline.)

- [ ] **Step 1: Write the failing test**

```ts
// tests/pos-venda-abordagem-manual.test.ts
import { describe, it, expect, vi } from 'vitest';
import { registrarAbordagemManual } from '../src/modules/monitoring/abordagem/abordagens-repo.js';

function fakeClient(captured: { row?: Record<string, unknown> }) {
  return {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        captured.row = row;
        return { select: () => ({ single: async () => ({ data: { id: 'ab-1' }, error: null }) }) };
      },
    }),
  } as any;
}

describe('registrarAbordagemManual', () => {
  it('insere abordagem encerrada/enviada com o tipo mapeado e marca de envio manual', async () => {
    const cap: { row?: Record<string, unknown> } = {};
    const id = await registrarAbordagemManual(fakeClient(cap), {
      sistemaId: 's1', leadId: 'l1', tipo: 'queda', mensagem: 'oi',
    });
    expect(id).toBe('ab-1');
    expect(cap.row).toMatchObject({
      sistema_id: 's1', lead_id: 'l1', tipo: 'queda',
      status: 'encerrada', desfecho: 'transferido_junior',
      mensagem_enviada: 'oi',
    });
    expect(typeof cap.row?.enviada_em).toBe('string');
    expect(typeof cap.row?.encerrada_em).toBe('string');
  });

  it('engole violação de unique (23505) retornando null', async () => {
    const client = {
      from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: '23505', message: 'dup' } }) }) }) }),
    } as any;
    const id = await registrarAbordagemManual(client, { sistemaId: 's1', leadId: 'l1', tipo: 'parabens', mensagem: 'oi' });
    expect(id).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pos-venda-abordagem-manual.test.ts`
Expected: FAIL — "registrarAbordagemManual is not a function".

- [ ] **Step 3: Write minimal implementation**

```ts
// adicionar em src/modules/monitoring/abordagem/abordagens-repo.ts, após reverterEnvioParaProposta
// Abordagem feita NA MÃO pela plataforma: já entra encerrada/enviada pra Eva
// ver no diário e não re-mandar. tipo já vem mapeado pro enum da Eva
// (parabens|depoimento|queda). 23505 (corrida) → null, sem derrubar a rota.
export async function registrarAbordagemManual(client: SupabaseClient, a: {
  sistemaId: string; leadId: string; tipo: AbordagemTipo; mensagem: string;
}): Promise<string | null> {
  const agora = agoraIso();
  const { data, error } = await client.from('monitoring_abordagens').insert({
    sistema_id: a.sistemaId, lead_id: a.leadId, tipo: a.tipo,
    status: 'encerrada', desfecho: 'transferido_junior',
    mensagem_proposta: a.mensagem, mensagem_enviada: a.mensagem,
    enviada_em: agora, encerrada_em: agora,
    nota_observacao: '[enviado manual pela plataforma]',
  }).select('id').single();
  if (error) {
    if (error.code === '23505') return null;
    throw new Error(`registrarAbordagemManual: ${error.message}`);
  }
  return (data as { id: string }).id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pos-venda-abordagem-manual.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/monitoring/abordagem/abordagens-repo.ts tests/pos-venda-abordagem-manual.test.ts
git commit -m "feat(pos-venda): registrarAbordagemManual (sincronia Eva<->plataforma)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Query da tela (junta lead + usina + saúde + relacionamento)

**Files:**
- Create: `src/modules/dashboard/pos-venda-queries.ts`

I/O (não tem teste unitário — segue o padrão das outras `*-queries.ts`; validação por `tsc` + smoke). Lê `sistemas_clientes` ativos da company (via lead), enriquece com alertas abertos, geração recente, dados do lead e última abordagem enviada, e devolve as linhas já com saúde + próxima ação + ordenação.

Notas de schema (confirmadas nas migrations):
- `sistemas_clientes(id, lead_id, apelido, marca_inversor, potencia_kwp, data_instalacao, cidade, uf, ativo)`.
- `geracao_diaria(sistema_id, data, geracao_kwh)` — pegar últimos ~30 dias.
- `alertas_sistema(sistema_id, tipo, severidade, resolved_at)` — abertos = `resolved_at IS NULL`.
- `leads(id, name, phone, consumo_kwh?, company_id)` — usar `name`, `phone`. Para consumo, ler a coluna existente do lead se houver (`consumo_kwh` / `consumo_medio_kwh`); se a coluna não existir no schema, passar `consumoMedioKwh: null` (não inventar). **O implementador deve conferir o nome real da coluna de consumo em `leads` (grep nas migrations) e usar `null` se não houver.**
- Última abordagem enviada e `jaTeveDepoimento`: reaproveitar leitura simples de `monitoring_abordagens` por `lead_id`.

- [ ] **Step 1: Implementar a query**

```ts
// src/modules/dashboard/pos-venda-queries.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  saudeUsina, elegivelUpgrade, proximaAcaoPosVenda, ordenarPorAtencao,
  type Saude, type ProximaAcao,
} from './pos-venda-saude.js';

export interface PosVendaLinha {
  leadId: string;
  sistemaId: string;
  nome: string;
  telefone: string | null;
  cidade: string | null;
  potenciaKwp: number | null;
  marcaInversor: string | null;
  dataInstalacao: string | null;
  saude: Saude;
  ultimoContatoEm: string | null;
  jaTeveDepoimento: boolean;
  proximaAcao: ProximaAcao;
}

const diasAtras = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

export async function listarClientesPosVenda(client: SupabaseClient, companyId: string): Promise<PosVendaLinha[]> {
  // 1) usinas ativas com lead da company
  const { data: sistemas, error: e1 } = await client.from('sistemas_clientes')
    .select('id, lead_id, apelido, marca_inversor, potencia_kwp, data_instalacao, cidade, ativo')
    .eq('ativo', true).not('lead_id', 'is', null);
  if (e1) throw new Error(`listarClientesPosVenda/sistemas: ${e1.message}`);
  const sis = (sistemas ?? []) as Array<Record<string, any>>;
  if (sis.length === 0) return [];

  const leadIds = [...new Set(sis.map((s) => s.lead_id))];
  const sistemaIds = sis.map((s) => s.id);

  // 2) leads (nome/telefone/cidade/consumo) — filtra pela company aqui
  const { data: leadsData, error: e2 } = await client.from('leads')
    .select('id, name, phone, cidade, company_id')
    .in('id', leadIds).eq('company_id', companyId);
  if (e2) throw new Error(`listarClientesPosVenda/leads: ${e2.message}`);
  const leads = new Map((leadsData ?? []).map((l: any) => [l.id, l]));

  // 3) alertas abertos por sistema
  const { data: alertasData, error: e3 } = await client.from('alertas_sistema')
    .select('sistema_id, tipo, severidade')
    .in('sistema_id', sistemaIds).is('resolved_at', null);
  if (e3) throw new Error(`listarClientesPosVenda/alertas: ${e3.message}`);
  const alertasPorSistema = new Map<string, Array<{ tipo: string; severidade: string }>>();
  for (const a of (alertasData ?? []) as any[]) {
    const arr = alertasPorSistema.get(a.sistema_id) ?? [];
    arr.push({ tipo: a.tipo, severidade: a.severidade });
    alertasPorSistema.set(a.sistema_id, arr);
  }

  // 4) geração recente (30d) por sistema
  const { data: geracaoData, error: e4 } = await client.from('geracao_diaria')
    .select('sistema_id, data, geracao_kwh')
    .in('sistema_id', sistemaIds).gte('data', diasAtras(30));
  if (e4) throw new Error(`listarClientesPosVenda/geracao: ${e4.message}`);
  const geracaoPorSistema = new Map<string, Array<{ data: string; geracao_kwh: number }>>();
  for (const g of (geracaoData ?? []) as any[]) {
    const arr = geracaoPorSistema.get(g.sistema_id) ?? [];
    arr.push({ data: g.data, geracao_kwh: Number(g.geracao_kwh) });
    geracaoPorSistema.set(g.sistema_id, arr);
  }

  // 5) última abordagem enviada + se já teve depoimento, por lead
  const { data: abData, error: e5 } = await client.from('monitoring_abordagens')
    .select('lead_id, tipo, enviada_em')
    .in('lead_id', leadIds).not('enviada_em', 'is', null)
    .order('enviada_em', { ascending: false });
  if (e5) throw new Error(`listarClientesPosVenda/abordagens: ${e5.message}`);
  const ultimoContato = new Map<string, string>();
  const teveDepoimento = new Set<string>();
  for (const a of (abData ?? []) as any[]) {
    if (!ultimoContato.has(a.lead_id)) ultimoContato.set(a.lead_id, a.enviada_em);
    if (a.tipo === 'depoimento') teveDepoimento.add(a.lead_id);
  }

  const hoje = new Date();
  const linhas: PosVendaLinha[] = [];
  for (const s of sis) {
    const lead = leads.get(s.lead_id);
    if (!lead) continue; // lead de outra company → fora
    const saude = saudeUsina(alertasPorSistema.get(s.id) ?? [], geracaoPorSistema.get(s.id) ?? []);
    const jaTeve = teveDepoimento.has(s.lead_id);
    const elegivel = elegivelUpgrade(
      { potenciaKwp: s.potencia_kwp, dataInstalacao: s.data_instalacao, geracaoEstimadaKwhMes: s.potencia_kwp ? Number(s.potencia_kwp) * 120 : null },
      { consumoMedioKwh: null }, // ver nota de schema: ligar à coluna de consumo do lead quando confirmada
    );
    const contato = ultimoContato.get(s.lead_id) ?? null;
    linhas.push({
      leadId: s.lead_id, sistemaId: s.id,
      nome: lead.name ?? s.apelido ?? 'Cliente',
      telefone: lead.phone ?? null, cidade: lead.cidade ?? s.cidade ?? null,
      potenciaKwp: s.potencia_kwp != null ? Number(s.potencia_kwp) : null,
      marcaInversor: s.marca_inversor ?? null, dataInstalacao: s.data_instalacao ?? null,
      saude, ultimoContatoEm: contato, jaTeveDepoimento: jaTeve,
      proximaAcao: proximaAcaoPosVenda(
        { saude, dataInstalacao: s.data_instalacao, ultimoContatoEm: contato, jaTeveDepoimento: jaTeve, elegivelUpgrade: elegivel },
        hoje,
      ),
    });
  }
  return ordenarPorAtencao(linhas);
}
```

> Nota de estimativa: `geracaoEstimadaKwhMes ≈ potenciaKwp * 120` (kWh/mês por kWp, média Brasil) é só pra acender o sinal de upgrade — não é número mostrado ao cliente. Está isolado aqui; se o Junior tiver número melhor, troca-se só esta linha.

- [ ] **Step 2: Verificar build**

Run: `npx tsc --noEmit`
Expected: sem erros novos em `pos-venda-queries.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/modules/dashboard/pos-venda-queries.ts
git commit -m "feat(pos-venda): listarClientesPosVenda (junta lead+usina+saude+relacionamento)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: View da tela (lista + botões + modal de preview)

**Files:**
- Create: `src/modules/dashboard/pos-venda-views.ts`
- Test: `tests/pos-venda-views.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/pos-venda-views.test.ts
import { describe, it, expect } from 'vitest';
import { renderPosVendaPage } from '../src/modules/dashboard/pos-venda-views.js';
import type { PosVendaLinha } from '../src/modules/dashboard/pos-venda-queries.js';

const linha = (over: Partial<PosVendaLinha> = {}): PosVendaLinha => ({
  leadId: 'l1', sistemaId: 's1', nome: 'Antonio Carlos', telefone: '5561999990000',
  cidade: 'Brasília', potenciaKwp: 5.2, marcaInversor: 'deye', dataInstalacao: '2024-06-25',
  saude: 'verde', ultimoContatoEm: '2026-06-20T00:00:00Z', jaTeveDepoimento: false,
  proximaAcao: { tipo: 'parabens', label: '🎉 Aniversário em 0 dia(s)', urgencia: 'media' },
  ...over,
});

describe('renderPosVendaPage', () => {
  it('lista o cliente com nome, usina e o semáforo de saúde', () => {
    const html = renderPosVendaPage([linha()], undefined);
    expect(html).toContain('Antonio Carlos');
    expect(html).toContain('deye');
    expect(html).toContain('data-lead-id="l1"');
  });
  it('escapa HTML do nome (não injeta)', () => {
    const html = renderPosVendaPage([linha({ nome: '<script>x</script>' })], undefined);
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });
  it('estado vazio quando não há clientes', () => {
    const html = renderPosVendaPage([], undefined);
    expect(html).toMatch(/nenhum cliente|sem clientes|nenhuma usina/i);
  });
  it('vermelho ganha destaque de atenção', () => {
    const html = renderPosVendaPage([linha({ saude: 'vermelho' })], undefined);
    expect(html).toContain('pv-urgent');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pos-venda-views.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/modules/dashboard/pos-venda-views.ts
import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { PosVendaLinha } from './pos-venda-queries.js';
import type { Saude } from './pos-venda-saude.js';
import { formatPhoneBR } from '../meta-leadgen.js';

const SEMAFORO: Record<Saude, { dot: string; txt: string }> = {
  verde: { dot: '🟢', txt: 'Gerando ok' },
  amarelo: { dot: '🟡', txt: 'Atenção' },
  vermelho: { dot: '🔴', txt: 'Crítico' },
};

// Botões disponíveis por linha. O da próxima ação vem destacado (ring).
const BOTOES: Array<{ tipo: string; label: string }> = [
  { tipo: 'parabens', label: '🎉 Parabéns' },
  { tipo: 'relatorio', label: '📊 Relatório do mês' },
  { tipo: 'limpeza', label: '🧹 Limpeza' },
  { tipo: 'depoimento', label: '⭐ Depoimento' },
  { tipo: 'upgrade', label: '🔋 Upgrade' },
  { tipo: 'contato', label: '📞 Registrar contato' },
];

function tempo(iso: string | null): string {
  if (!iso) return 'sem contato';
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias < 1) return 'hoje';
  if (dias < 30) return `há ${dias}d`;
  const meses = Math.floor(dias / 30);
  return `há ${meses}m`;
}

function renderLinha(l: PosVendaLinha): string {
  const s = SEMAFORO[l.saude];
  const urgente = l.saude === 'vermelho' ? ' pv-urgent' : '';
  const nome = escapeHtml(l.nome);
  const phone = escapeHtml(formatPhoneBR(l.telefone ?? ''));
  const usina = [l.potenciaKwp ? `${l.potenciaKwp} kWp` : null, escapeHtml(l.marcaInversor ?? ''), escapeHtml(l.cidade ?? '')]
    .filter(Boolean).join(' · ');
  const botoes = BOTOES.map((b) => {
    const destaque = b.tipo === l.proximaAcao.tipo ? ' ring-2 ring-amber-400' : '';
    return `<button class="pv-btn px-2 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs${destaque}"
      data-lead-id="${escapeHtml(l.leadId)}" data-acao="${b.tipo}" data-nome="${nome}">${b.label}</button>`;
  }).join(' ');
  return `
  <div class="pv-card bg-[#0b0e1f] border border-[#1b2040] border-l-4 ${l.saude === 'vermelho' ? 'border-l-rose-500' : l.saude === 'amarelo' ? 'border-l-amber-400' : 'border-l-emerald-400'} rounded-xl p-3 mb-2${urgente}" data-lead-id="${escapeHtml(l.leadId)}">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span class="text-lg" title="${s.txt}">${s.dot}</span>
      <a href="/dashboard/leads/${escapeHtml(l.leadId)}" class="font-semibold text-cyan-200 hover:underline">${nome}</a>
      <span class="text-xs text-slate-400">${phone}</span>
      <span class="text-xs text-slate-500">${usina}</span>
      <span class="ml-auto text-xs text-slate-400">❤️ ${tempo(l.ultimoContatoEm)}</span>
    </div>
    <div class="mt-1 text-xs text-amber-300">${escapeHtml(l.proximaAcao.label)}</div>
    <div class="mt-2 flex flex-wrap gap-1.5">${botoes}</div>
  </div>`;
}

export function renderPosVendaPage(linhas: PosVendaLinha[], user?: DashUser): string {
  const lista = linhas.length
    ? linhas.map(renderLinha).join('')
    : `<div class="text-slate-400 text-center py-16">Nenhum cliente com usina ainda. Quando houver usinas vinculadas, eles aparecem aqui.</div>`;

  const body = `
  <style>
    @keyframes pvPulse { 0%,100%{box-shadow:0 0 0 0 rgba(244,63,94,0)} 50%{box-shadow:0 0 0 3px rgba(244,63,94,.35)} }
    .pv-urgent{ animation:pvPulse 1.8s ease-in-out infinite }
    @media (prefers-reduced-motion: reduce){ .pv-urgent{ animation:none; box-shadow:0 0 0 2px rgba(244,63,94,.4) } }
  </style>
  <div>
    <h1 class="text-xl font-bold text-cyan-300 mb-1">❤️ Pós-venda / Relacionamento</h1>
    <p class="text-xs text-slate-400 mb-4">Os que <b class="text-rose-400">pulsam em vermelho</b> precisam de atenção. O botão destacado é a próxima ação sugerida.</p>
    ${lista}
  </div>

  <!-- Modal de preview -->
  <div id="pv-modal" class="fixed inset-0 bg-black/60 hidden items-center justify-center z-50 p-4">
    <div class="bg-[#0b0e1f] border border-[#1b2040] rounded-xl max-w-lg w-full p-4">
      <div class="text-sm text-slate-300 mb-2" id="pv-modal-title">Mensagem</div>
      <textarea id="pv-msg" class="w-full h-40 bg-[#070a18] border border-[#1b2040] rounded-md p-2 text-slate-100 text-sm"></textarea>
      <div class="flex flex-wrap gap-2 mt-3 justify-end">
        <button id="pv-cancel" class="px-3 py-1.5 rounded-md bg-slate-700 text-slate-200 text-sm">Cancelar</button>
        <button id="pv-copy" class="px-3 py-1.5 rounded-md bg-slate-600 text-white text-sm">Copiar</button>
        <a id="pv-wa" href="#" target="_blank" class="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold">Mandar no WhatsApp</a>
      </div>
    </div>
  </div>`;

  const scripts = `<script>
  (function(){
    var modal=document.getElementById('pv-modal'), ta=document.getElementById('pv-msg');
    var wa=document.getElementById('pv-wa'), title=document.getElementById('pv-modal-title');
    var atual=null;
    function open(){ modal.classList.remove('hidden'); modal.classList.add('flex'); }
    function close(){ modal.classList.add('hidden'); modal.classList.remove('flex'); }
    document.getElementById('pv-cancel').onclick=close;
    document.getElementById('pv-copy').onclick=function(){ navigator.clipboard&&navigator.clipboard.writeText(ta.value); };
    document.querySelectorAll('.pv-btn').forEach(function(b){
      b.onclick=async function(){
        var leadId=b.dataset.leadId, acao=b.dataset.acao;
        atual={leadId:leadId, acao:acao};
        title.textContent='Carregando…'; ta.value=''; open();
        var r=await fetch('/dashboard/pos-venda/'+leadId+'/acao',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'tipo='+encodeURIComponent(acao)});
        var j=await r.json().catch(function(){return {};});
        title.textContent=(b.dataset.nome||'Cliente')+' · '+acao;
        if(acao==='contato'){ ta.value=j.mensagem||'Contato registrado.'; wa.style.display='none'; await marcar(leadId,acao,''); }
        else { ta.value=j.mensagem||''; wa.style.display=''; atual.waBase=j.waBase||''; }
      };
    });
    wa.onclick=function(){
      if(!atual) return;
      var texto=encodeURIComponent(ta.value);
      wa.href=(atual.waBase||'https://wa.me/')+'?text='+texto;
      marcar(atual.leadId, atual.acao, ta.value); // grava timeline+abordagem ao confirmar envio
    };
    async function marcar(leadId,acao,msg){
      await fetch('/dashboard/pos-venda/'+leadId+'/acao',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'tipo='+encodeURIComponent(acao)+'&enviado=1&mensagem='+encodeURIComponent(msg)}).catch(function(){});
    }
  })();
  </script>`;

  return renderLayout({ active: 'pos_venda', title: 'Pós-venda', dark: true, user, body, scripts });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pos-venda-views.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/pos-venda-views.ts tests/pos-venda-views.test.ts
git commit -m "feat(pos-venda): tela com lista guiada por atencao + modal de preview/wa.me

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Rotas (`GET /pos-venda` + `POST /pos-venda/:leadId/acao`)

**Files:**
- Modify: `src/modules/dashboard/router.ts` (adicionar imports no topo + 2 rotas perto das de `/monitoramento`)

A rota POST tem 2 fases pelo mesmo endpoint:
- **Fase preview** (sem `enviado`): gera a mensagem (tenta `redigirMensagem` da Eva; cai pro `fallbackMensagem`) e devolve `{ mensagem, waBase }`. Não grava nada.
- **Fase confirmar** (`enviado=1`, com `mensagem`): grava na timeline (`registrarAtividade`) + (pros tipos mapeados) `registrarAbordagemManual`. Devolve `{ ok: true }`.

- [ ] **Step 1: Imports no topo do router.ts**

Adicionar junto aos outros imports do módulo:

```ts
import { listarClientesPosVenda } from './pos-venda-queries.js';
import { renderPosVendaPage } from './pos-venda-views.js';
import { objetivoManual, fallbackMensagem } from './pos-venda-mensagens.js';
import { registrarAbordagemManual } from '../monitoring/abordagem/registrarAbordagemManual.js'; // ver nota
import { registrarAtividade } from './atividades.js';
import { numerosTrimestre } from '../monitoring/abordagem/numeros-usina.js';
```

> Nota de import: `registrarAbordagemManual` foi adicionada em `abordagens-repo.ts` (Task 5) — importar de `'../monitoring/abordagem/abordagens-repo.js'`, NÃO do caminho fictício acima. (Corrigir a linha pra `import { registrarAbordagemManual } from '../monitoring/abordagem/abordagens-repo.js';`.) `registrarAtividade` pode já estar importado — não duplicar.

- [ ] **Step 2: GET /pos-venda — logo após a rota `/monitoramento` (perto da linha 1129)**

```ts
  router.get('/pos-venda', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    try {
      const companyId = req.user!.companyId;
      const linhas = await listarClientesPosVenda(supabase, companyId);
      res.send(renderPosVendaPage(linhas, req.user));
    } catch (err) {
      console.error('[pos-venda] GET falhou:', (err as Error).message);
      res.status(500).send('Erro ao carregar pós-venda.');
    }
  });
```

> Conferir: o nome do client Supabase no escopo do router (provavelmente `supabase`); o tipo de req com `.user` (`AuthedRequest`); como as outras rotas pegam `companyId`. Seguir o padrão da rota `/marketing/blog` (linha ~969), que já usa `AuthedRequest` + `exigir('marketing','visualizar')`.

- [ ] **Step 3: POST /pos-venda/:leadId/acao**

```ts
  router.post('/pos-venda/:leadId/acao', exigir('usinas', 'visualizar'), async (req: AuthedRequest, res: Response) => {
    const leadId = req.params.leadId;
    const tipo = String(req.body.tipo ?? '') as 'parabens' | 'relatorio' | 'limpeza' | 'depoimento' | 'upgrade' | 'contato';
    const enviado = req.body.enviado === '1' || req.body.enviado === 'true';
    const TIPOS_OK = ['parabens', 'relatorio', 'limpeza', 'depoimento', 'upgrade', 'contato'];
    if (!TIPOS_OK.includes(tipo)) return res.status(400).json({ error: 'tipo inválido' });

    try {
      const companyId = req.user!.companyId;
      // dados do lead + usina (uma usina ativa do lead)
      const { data: lead } = await supabase.from('leads')
        .select('id, name, phone, company_id').eq('id', leadId).eq('company_id', companyId).maybeSingle();
      if (!lead) return res.status(404).json({ error: 'lead não encontrado' });
      const { data: sistema } = await supabase.from('sistemas_clientes')
        .select('id, potencia_kwp').eq('lead_id', leadId).eq('ativo', true)
        .order('created_at', { ascending: true }).limit(1).maybeSingle();

      // ---- Fase CONFIRMAR (grava) ----
      if (enviado) {
        const msg = String(req.body.mensagem ?? '').slice(0, 1000);
        const LABEL: Record<string, string> = {
          parabens: 'Parabéns enviado', relatorio: 'Relatório do mês enviado', limpeza: 'Oferta de limpeza enviada',
          depoimento: 'Pedido de depoimento enviado', upgrade: 'Oferta de upgrade enviada', contato: 'Contato registrado',
        };
        await registrarAtividade(supabase, {
          company_id: companyId, lead_id: leadId,
          tipo: tipo === 'contato' ? 'contato' : 'whatsapp',
          titulo: LABEL[tipo], descricao: msg || undefined,
          automatica: false, user_id: req.user!.id,
        });
        // sincronia com a Eva só nos tipos que ela também manda no automático
        const MAP_EVA: Record<string, 'parabens' | 'depoimento' | 'queda'> = { parabens: 'parabens', depoimento: 'depoimento', limpeza: 'queda' };
        if (sistema && MAP_EVA[tipo] && msg) {
          await registrarAbordagemManual(supabase, { sistemaId: sistema.id, leadId, tipo: MAP_EVA[tipo], mensagem: msg });
        }
        return res.json({ ok: true });
      }

      // ---- Fase PREVIEW (gera mensagem) ----
      if (tipo === 'contato') return res.json({ mensagem: '', waBase: '' });

      // números reais do trimestre (pra relatório)
      let trimestre: { kwh: number; reais: number } | null = null;
      if (sistema) {
        const { data: ger } = await supabase.from('geracao_diaria')
          .select('data, geracao_kwh').eq('sistema_id', sistema.id)
          .gte('data', new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
        trimestre = numerosTrimestre((ger ?? []).map((g: any) => ({ data: g.data, geracao_kwh: Number(g.geracao_kwh) })), 0.99, new Date());
      }

      // tenta a IA (mesmo tom da Eva); cai pro fallback se faltar client/erro
      let mensagem: string | null = null;
      try {
        if (anthropic) {
          const { redigirMensagem } = await import('../monitoring/abordagem/redator.js');
          mensagem = await redigirMensagem(anthropic, {
            tipo: tipo === 'limpeza' ? 'queda' : 'parabens',
            etapa: 1, objetivo: objetivoManual(tipo),
            clienteNome: lead.name ?? 'cliente',
            dados: { percentualQueda: null, diasOffline: null, trimestre: tipo === 'relatorio' ? trimestre : null, causaRaizAnterior: null },
            regrasTreino: [], ajusteDoJunior: null, mensagemAnterior: null,
          });
        }
      } catch (e) {
        console.warn('[pos-venda] redator falhou, usando fallback:', (e as Error).message);
      }
      if (!mensagem) mensagem = fallbackMensagem(tipo, { nome: lead.name ?? 'cliente', trimestre: tipo === 'relatorio' ? trimestre : null });

      const fone = String(lead.phone ?? '').replace(/\D/g, '');
      const waBase = fone ? `https://wa.me/${fone}` : 'https://wa.me/';
      return res.json({ mensagem, waBase });
    } catch (err) {
      console.error('[pos-venda] POST acao falhou:', (err as Error).message);
      return res.status(500).json({ error: 'falha ao processar ação' });
    }
  });
```

> Conferências obrigatórias antes de fechar a task:
> 1. Nome real do client supabase (`supabase` vs outro) — usar o que o router usa nas rotas vizinhas.
> 2. Existe uma instância `anthropic` no escopo do router? (cockpit insights / ai-summary usam IA). Se o nome for outro, ajustar. Se NÃO houver, remover o bloco de IA e usar só `fallbackMensagem` (a tela funciona 100% com fallback). **Não criar client novo nem ler env aqui.**
> 3. `req.user!` exige a rota autenticada (as `/dashboard/*` já passam pelo middleware de auth). `exigir(...)` já garante user.
> 4. Tarifa `0.99` R$/kWh no `numerosTrimestre` é só pro relatório — se houver uma constante de tarifa no projeto, usar ela; senão deixar 0.99 (média) e isolar num `const TARIFA_RS_KWH = 0.99`.

- [ ] **Step 4: Verificar build + testes**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc limpo (fora as 2 falhas pré-existentes de `tests/supabase-vincular-novo.test.ts`), vitest verde nos novos.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/router.ts
git commit -m "feat(pos-venda): rotas GET /pos-venda + POST /acao (preview->wa.me->timeline+abordagem)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Item "Pós-venda" na sidebar

**Files:**
- Modify: `src/modules/dashboard/views.ts` (union `active` na linha 84 + setor Operação ~140)

- [ ] **Step 1: Adicionar `'pos_venda'` ao union `active`**

Linha 84 — incluir `'pos_venda'`:

```ts
  active: 'cockpit' | 'home' | 'propostas' | 'manutencao' | 'monitoramento' | 'pos_venda' | 'marketing' | 'blog' | 'cadencia' | 'leads' | 'kanban' | 'clientes' | 'financeiro' | 'usuarios';
```

- [ ] **Step 2: Adicionar o item no setor Operação**

No `SIDEBAR_SETORES`, setor `'⚡ Operação'`, após o item de Manutenção:

```ts
  {
    titulo: '⚡ Operação',
    itens: [
      { href: '/dashboard/monitoramento', key: 'monitoramento', label: '⚡ Monitoramento', area: 'usinas' },
      { href: '/dashboard/pos-venda', key: 'pos_venda', label: '❤️ Pós-venda', area: 'usinas' },
      { href: '/dashboard/manutencao', key: 'manutencao', label: '🔧 Manutenção' },
    ],
  },
```

- [ ] **Step 3: Verificar build**

Run: `npx tsc --noEmit`
Expected: sem erros (o `active: 'pos_venda'` da view agora casa com o union).

- [ ] **Step 4: Commit**

```bash
git add src/modules/dashboard/views.ts
git commit -m "feat(pos-venda): item Pos-venda na sidebar (setor Operacao)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Revisão final + verificação completa

**Files:** nenhum novo — fechamento.

- [ ] **Step 1: Suite completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc limpo; vitest verde (exceto as 2 falhas pré-existentes conhecidas em `tests/supabase-vincular-novo.test.ts`).

- [ ] **Step 2: Code review 3× do diff** (regra do Junior)

`git diff main...HEAD` — revisar 3 passadas, corrigindo achados:
1. Segurança/escopo: rotas com `exigir('usinas','visualizar')`; lead sempre filtrado por `company_id` (multi-tenant); `escapeHtml` em todo dado do cliente na view; `mensagem` clampada (≤1000) na gravação.
2. Consistência: tipos `AcaoManual`/`Saude` iguais entre módulos; nomes de função batem (`registrarAbordagemManual`, `listarClientesPosVenda`, `renderPosVendaPage`); import de `registrarAbordagemManual` aponta pro `abordagens-repo.js` real.
3. Produto: nada de preço de serviço nas mensagens; "Responsável Técnico" (nunca "engenheiro"); português claro; fallback funciona sem IA.

- [ ] **Step 3: Resumo pro Junior** com o que foi feito, lembrando que:
  - **Sem migration** (reusa tipos existentes).
  - Falta só, quando o Junior validar: push (com OK dele) → Implantar → smoke (abrir `/dashboard/pos-venda`, ver clientes + semáforo, clicar 🎉 → preview → wa.me → conferir timeline + que a Eva não re-manda).
  - Gatilhos AUTOMÁTICOS da Eva (relatório mensal/upgrade auto) ficaram pra peça 1b (decisão dele, fora desta leva).

---

## Self-Review (feita ao escrever o plano)

**1. Cobertura da spec:**
- §4.1 lista guiada por atenção (saúde + tempo sem contato + próxima ação) → Tasks 1,3,6,7 ✅
- §4.2 botões manuais + preview via redator + wa.me + grava timeline/abordagem → Tasks 4,5,7,8 ✅
- §4.3 funções puras (`saudeUsina`/`proximaAcaoPosVenda`/`elegivelUpgrade`), permissão `usinas`, sincronia sem duplicar, reuso do redator → Tasks 1-3,5,8 ✅
- §4.4 gatilhos AUTOMÁTICOS (relatorio_mensal/oferta_upgrade) → **explicitamente fora desta leva** (peça 1b); botões manuais cobrem o uso hoje. Cobertura consciente, não lacuna.
- §5 arquivos (saude/queries/views + rota + sidebar) → Tasks 1-9 ✅ (sem migration, conforme "só se precisar").
- §6 testes puros + review 3× + tsc + smoke → Tasks 1-4,7,10 ✅

**2. Placeholders:** nenhum "TODO/TBD" no código dos steps. As "conferências" da Task 8 (nome do client supabase / instância anthropic / coluna de consumo) são verificações contra o código existente, com fallback definido pra cada — não são lacunas de implementação.

**3. Consistência de tipos:** `AcaoManual` (saude.ts) reusado em mensagens/views; `Saude` reusado em saude/queries/views; `PosVendaLinha` definido na Task 6 e consumido na 7; `registrarAbordagemManual(client, {sistemaId,leadId,tipo,mensagem})` com a mesma assinatura na Task 5 e na chamada da Task 8; `numerosTrimestre` usado com a forma `{data,geracao_kwh}` que ele já espera.
</content>
</invoke>
