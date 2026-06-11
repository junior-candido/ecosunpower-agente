# Eva Monitoramento Evolutivo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alertas de usina (parabéns/queda/offline) viram abordagem da Eva ao CLIENTE dono, com fase de treino supervisionada pelo Junior, diário evolutivo por usina e regras de ritmo invioláveis.

**Architecture:** Motor de abordagem em cima do pipeline de alertas existente (`monitoring/proactive-alerts/`). Regras PURAS decidem SE pode abordar e QUAL degrau da escada; IA (Opus c/ fallback Haiku) só escreve o texto; fase treino roteia a mensagem pronta pro Junior com botões `mab:`; diário em `monitoring_abordagens` (migration 048) alimenta a próxima decisão. Fora da janela 24h, template `eva_monitoramento_v1` (SEM fallback pra reativacao — bloqueia e avisa). Conversa do cliente cai no fluxo normal da Eva com contexto injetado.

**Tech Stack:** TypeScript + Express, Supabase, Anthropic SDK, Vitest, WABA Cloud API (templates + quick replies), dashboard server-rendered.

**Spec:** `docs/superpowers/specs/2026-06-11-eva-monitoramento-evolutivo-design.md`

**Regras do projeto:** commits PT-BR frequentes; `git add` SEMPRE por caminho (NUNCA `-A`); NUNCA `git push` sem autorização; suite `npx vitest run` (2 falhas pré-existentes em `supabase-vincular-novo` são alheias); typecheck `npx tsc --noEmit`; migration 048 vira ARQUIVO na Área de Trabalho (MCP aponta pro projeto errado); branch de trabalho: `feat/monitoramento-evolutivo` (criar a partir da main).

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/048_monitoring_abordagens.sql` | Criar | 3 tabelas: abordagens (diário), treino (regras), config (autonomia/template) |
| `src/modules/monitoring/abordagem/tipos.ts` | Criar | Tipos compartilhados do módulo |
| `src/modules/monitoring/abordagem/regras.ts` | Criar | PURO: elegibilidade + ritmo + decisão do próximo passo |
| `src/modules/monitoring/abordagem/escada.ts` | Criar | PURO: degraus por tipo (objetivo de cada mensagem pro redator) |
| `src/modules/monitoring/abordagem/numeros-usina.ts` | Criar | PURO: kWh/R$ do trimestre, % de recuperação pós-limpeza |
| `src/modules/monitoring/abordagem/redator.ts` | Criar | Prompts (puros) + chamada IA (injetada) que escreve a mensagem |
| `src/modules/monitoring/abordagem/abordagens-repo.ts` | Criar | I/O: monitoring_abordagens + monitoring_treino + monitoring_config |
| `src/modules/monitoring/abordagem/orquestrador.ts` | Criar | Cola: propor, aprovar/ajustar/descartar, enviar (template/direto), lembretes, encerrar, resumo 👍👎 |
| `src/modules/monitoring/proactive-alerts/dispatcher.ts` | Modificar | Tipos elegíveis com dono → rota pro orquestrador (senão fluxo atual) |
| `src/index.ts` | Modificar | Roteador botões `mab:`, quick replies do cliente, contexto na conversa, action `abordagem_update`, cron de pendências |
| `src/modules/dashboard/*(monitoramento)* ` | Modificar | Timeline por usina + KPIs |
| `src/build-info.ts` + `Dockerfile` | Modificar | Markers |
| `tests/abordagem-*.test.ts` | Criar | Testes das peças puras |

---

### Task 1: Migration 048 + arquivo pro Junior

**Files:**
- Create: `supabase/migrations/048_monitoring_abordagens.sql`
- Create: `C:\Users\Meu Computador\Desktop\migration-048-monitoramento.sql` (cópia)

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/048_monitoring_abordagens.sql
-- Eva Monitoramento Evolutivo: diário de abordagens por usina + regras de
-- treino + config de autonomia.
-- Spec: docs/superpowers/specs/2026-06-11-eva-monitoramento-evolutivo-design.md

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Diário evolutivo: 1 linha = 1 abordagem da Eva a um cliente sobre 1 usina
CREATE TABLE IF NOT EXISTS monitoring_abordagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sistema_id uuid NOT NULL REFERENCES sistemas_clientes(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  alerta_id uuid REFERENCES monitoring_alerts(id) ON DELETE SET NULL,
  tipo text NOT NULL
    CHECK (tipo IN ('parabens', 'depoimento', 'queda', 'offline')),
  etapa int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'proposta'
    CHECK (status IN ('proposta', 'aguardando_aprovacao', 'enviada',
                      'em_conversa', 'lembrete_enviado', 'encerrada')),
  desfecho text
    CHECK (desfecho IN ('resolvido_sozinho', 'limpeza_fechada',
                        'visita_agendada', 'transferido_junior',
                        'sem_resposta', 'descartada_junior')),
  causa_raiz text,
  mensagem_proposta text,
  mensagem_enviada text,
  resposta_resumo text,
  nota_junior text CHECK (nota_junior IN ('boa', 'errou')),
  nota_observacao text,
  reagendada_para timestamptz,
  enviada_em timestamptz,
  lembrete_em timestamptz,
  ultima_resposta_cliente_em timestamptz,
  encerrada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 1 abordagem ABERTA por usina por vez (invariante de ritmo)
CREATE UNIQUE INDEX IF NOT EXISTS idx_mab_uma_ativa_por_usina
  ON monitoring_abordagens(sistema_id)
  WHERE status <> 'encerrada';
CREATE INDEX IF NOT EXISTS idx_mab_status ON monitoring_abordagens(status);
CREATE INDEX IF NOT EXISTS idx_mab_lead ON monitoring_abordagens(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mab_sistema ON monitoring_abordagens(sistema_id, created_at DESC);

-- 2) Regras de treino (ajustes do Junior viram instruções permanentes)
CREATE TABLE IF NOT EXISTS monitoring_treino (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text CHECK (tipo IN ('parabens', 'depoimento', 'queda', 'offline')),
  instrucao text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3) Config de autonomia (singleton, id=1)
CREATE TABLE IF NOT EXISTS monitoring_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  parabens_auto boolean NOT NULL DEFAULT false,
  queda_auto boolean NOT NULL DEFAULT false,
  offline_auto boolean NOT NULL DEFAULT false,
  template_nome text NOT NULL DEFAULT 'eva_monitoramento_v1',
  template_bloqueio_avisado boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO monitoring_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Copiar pra Área de Trabalho**

Run: `Copy-Item "supabase\migrations\048_monitoring_abordagens.sql" "C:\Users\Meu Computador\Desktop\migration-048-monitoramento.sql"`

- [ ] **Step 3: Commit**

```powershell
git add supabase/migrations/048_monitoring_abordagens.sql
git commit -m "feat(monitoramento): migration 048 — diario de abordagens + treino + config de autonomia"
```

---

### Task 2: Tipos + escada (`tipos.ts`, `escada.ts`)

**Files:**
- Create: `src/modules/monitoring/abordagem/tipos.ts`
- Create: `src/modules/monitoring/abordagem/escada.ts`
- Test: `tests/abordagem-escada.test.ts`

- [ ] **Step 1: Tipos compartilhados**

```typescript
// src/modules/monitoring/abordagem/tipos.ts
export type AbordagemTipo = 'parabens' | 'depoimento' | 'queda' | 'offline';
export type AbordagemStatus =
  | 'proposta' | 'aguardando_aprovacao' | 'enviada'
  | 'em_conversa' | 'lembrete_enviado' | 'encerrada';
export type AbordagemDesfecho =
  | 'resolvido_sozinho' | 'limpeza_fechada' | 'visita_agendada'
  | 'transferido_junior' | 'sem_resposta' | 'descartada_junior';

export interface AbordagemRow {
  id: string;
  sistema_id: string;
  lead_id: string;
  alerta_id: string | null;
  tipo: AbordagemTipo;
  etapa: number;
  status: AbordagemStatus;
  desfecho: AbordagemDesfecho | null;
  causa_raiz: string | null;
  mensagem_proposta: string | null;
  mensagem_enviada: string | null;
  resposta_resumo: string | null;
  nota_junior: 'boa' | 'errou' | null;
  reagendada_para: string | null;
  enviada_em: string | null;
  lembrete_em: string | null;
  ultima_resposta_cliente_em: string | null;
  encerrada_em: string | null;
  created_at: string;
}

// Resumo do diário de UMA usina que as regras puras consomem
export interface DiarioUsina {
  abordagemAbertaId: string | null;          // status <> encerrada
  ultimoParabensEnviadoEm: string | null;    // tipo parabens|depoimento, enviada_em
  ultimaOfertaLimpezaEm: string | null;      // tipo queda com etapa >= 2 (ofereceu)
  descartadaPeloJuniorEm: string | null;     // desfecho descartada_junior (mesmo tipo)
  causaRaizAnterior: string | null;          // última causa_raiz de offline resolvido
  jaTeveDepoimento: boolean;                  // alguma abordagem tipo depoimento encerrada com envio
  ultimaMsgProativaAoLeadEm: string | null;  // qualquer usina do MESMO lead (1 msg/dia)
}

export interface ConfigAutonomia {
  parabens_auto: boolean;
  queda_auto: boolean;
  offline_auto: boolean;
  template_nome: string;
  template_bloqueio_avisado: boolean;
}
```

- [ ] **Step 2: Teste da escada (falhando)**

```typescript
// tests/abordagem-escada.test.ts
import { describe, it, expect } from 'vitest';
import { ESCADAS, objetivoDoDegrau } from '../src/modules/monitoring/abordagem/escada.js';

describe('abordagem/escada', () => {
  it('tem escada pros 4 tipos', () => {
    expect(Object.keys(ESCADAS).sort()).toEqual(['depoimento', 'offline', 'parabens', 'queda']);
  });
  it('cada degrau tem objetivo não-vazio', () => {
    for (const tipo of Object.keys(ESCADAS) as Array<keyof typeof ESCADAS>) {
      for (const degrau of ESCADAS[tipo]) {
        expect(degrau.objetivo.length).toBeGreaterThan(20);
      }
    }
  });
  it('degrau fora do range devolve o último (lembrete)', () => {
    expect(objetivoDoDegrau('offline', 99)).toBe(ESCADAS.offline[ESCADAS.offline.length - 1].objetivo);
  });
  it('queda nunca menciona preço no objetivo', () => {
    for (const d of ESCADAS.queda) {
      expect(d.objetivo.toLowerCase()).not.toContain('preço');
      expect(d.objetivo).not.toContain('R$');
    }
  });
});
```

Run: `npx vitest run tests/abordagem-escada.test.ts` → FAIL

- [ ] **Step 3: Implementar a escada**

```typescript
// src/modules/monitoring/abordagem/escada.ts
// PURO: o "roteiro" de cada situação. Cada degrau diz ao redator O QUE a
// mensagem precisa alcançar — o texto em si é escrito pela IA com os dados
// reais e as regras de treino do Junior.
import type { AbordagemTipo } from './tipos.js';

export interface Degrau { etapa: number; objetivo: string }

export const ESCADAS: Record<AbordagemTipo, Degrau[]> = {
  depoimento: [
    { etapa: 1, objetivo: 'Primeira geração acima do esperado da vida da usina: comemorar com o cliente usando os números reais e pedir, com leveza, um depoimento (áudio, texto ou vídeo) sobre a experiência com a EcoSunPower.' },
  ],
  parabens: [
    { etapa: 1, objetivo: 'Parabéns trimestral: contar quanto a usina gerou no trimestre (kWh) e quanto isso representa de economia (R$ — números fornecidos, NUNCA calcular), agradecer a confiança na EcoSunPower e lembrar que a Eva é o canal de suporte: qualquer dúvida, é só chamar aqui.' },
  ],
  queda: [
    { etapa: 1, objetivo: 'Apresentar-se como consultora da EcoSunPower que acompanha o monitoramento, avisar que a geração caiu (usar o % real fornecido) e fazer perguntas de diagnóstico: faz tempo que não limpa as placas? Teve obra, sombra nova ou algum problema que saiba? Tom de cuidado, não de cobrança.' },
    { etapa: 2, objetivo: 'Com base na resposta, explicar que limpeza costuma recuperar boa parte da geração e oferecer o serviço da EcoSunPower — SEM falar preço. Se o cliente topar, avisar que vai passar pro Junior fechar os detalhes.' },
    { etapa: 3, objetivo: 'Lembrete educado e curto: retomar a conversa sobre a queda de geração sem repetir tudo, perguntando se pode ajudar. Uma vez só.' },
  ],
  offline: [
    { etapa: 1, objetivo: 'Avisar que a usina está sem enviar dados há X dias (número real fornecido) e guiar pelas causas comuns, UMA pergunta por vez: mudou a internet? Trocou a senha do wifi? O aparelhinho perto do inversor está com luz acesa? Se houver causa raiz de outra vez, começar por ela.' },
    { etapa: 2, objetivo: 'Os passos simples não resolveram: oferecer visita técnica da EcoSunPower (SEM falar preço), explicando com simplicidade por que o monitoramento ligado protege a geração e o investimento do cliente.' },
    { etapa: 3, objetivo: 'Lembrete educado e curto: a usina segue sem monitorar, perguntar se conseguiu olhar os passos ou se quer ajuda. Uma vez só.' },
  ],
};

export function objetivoDoDegrau(tipo: AbordagemTipo, etapa: number): string {
  const escada = ESCADAS[tipo];
  const d = escada.find((x) => x.etapa === etapa);
  return (d ?? escada[escada.length - 1]).objetivo;
}
```

- [ ] **Step 4: Rodar e ver passar** → `npx vitest run tests/abordagem-escada.test.ts` → PASS

- [ ] **Step 5: Commit**

```powershell
git add src/modules/monitoring/abordagem/tipos.ts src/modules/monitoring/abordagem/escada.ts tests/abordagem-escada.test.ts
git commit -m "feat(monitoramento): tipos e escada de abordagem (roteiro por situacao)"
```

---

### Task 3: Regras de elegibilidade e ritmo (`regras.ts`)

**Files:**
- Create: `src/modules/monitoring/abordagem/regras.ts`
- Test: `tests/abordagem-regras.test.ts`

- [ ] **Step 1: Testes (falhando)**

```typescript
// tests/abordagem-regras.test.ts
import { describe, it, expect } from 'vitest';
import {
  podeAbordar, decidirTipoMilestone, RITMO, diasDesde,
} from '../src/modules/monitoring/abordagem/regras.js';

const diario = {
  abordagemAbertaId: null, ultimoParabensEnviadoEm: null,
  ultimaOfertaLimpezaEm: null, descartadaPeloJuniorEm: null,
  causaRaizAnterior: null, jaTeveDepoimento: false,
  ultimaMsgProativaAoLeadEm: null,
};
const lead = { id: 'l1', optOut: false };
const hoje = new Date('2026-06-11T15:00:00Z');

describe('abordagem/regras: elegibilidade básica', () => {
  it('tudo ok → pode', () => {
    expect(podeAbordar('queda', lead, diario, hoje).ok).toBe(true);
  });
  it('opt-out NUNCA aborda', () => {
    const r = podeAbordar('queda', { ...lead, optOut: true }, diario, hoje);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('opt');
  });
  it('abordagem aberta na usina → não abre outra', () => {
    expect(podeAbordar('queda', lead, { ...diario, abordagemAbertaId: 'x' }, hoje).ok).toBe(false);
  });
  it('mesmo lead recebeu proativa hoje (outra usina) → espera', () => {
    expect(podeAbordar('queda', lead, { ...diario, ultimaMsgProativaAoLeadEm: '2026-06-11T09:00:00Z' }, hoje).ok).toBe(false);
    expect(podeAbordar('queda', lead, { ...diario, ultimaMsgProativaAoLeadEm: '2026-06-10T09:00:00Z' }, hoje).ok).toBe(true);
  });
  it('Junior descartou esse tipo há <30d → não re-propõe', () => {
    expect(podeAbordar('queda', lead, { ...diario, descartadaPeloJuniorEm: '2026-06-01T00:00:00Z' }, hoje).ok).toBe(false);
    expect(podeAbordar('queda', lead, { ...diario, descartadaPeloJuniorEm: '2026-05-01T00:00:00Z' }, hoje).ok).toBe(true);
  });
});

describe('abordagem/regras: ritmos por tipo', () => {
  it('parabéns respeita 90 dias', () => {
    expect(podeAbordar('parabens', lead, { ...diario, ultimoParabensEnviadoEm: '2026-05-01T00:00:00Z' }, hoje).ok).toBe(false);
    expect(podeAbordar('parabens', lead, { ...diario, ultimoParabensEnviadoEm: '2026-03-01T00:00:00Z' }, hoje).ok).toBe(true);
  });
  it('limpeza não reoferece <30d (vale pro tipo queda)', () => {
    expect(podeAbordar('queda', lead, { ...diario, ultimaOfertaLimpezaEm: '2026-06-01T00:00:00Z' }, hoje).ok).toBe(false);
  });
});

describe('abordagem/regras: milestone vira depoimento ou parabéns', () => {
  it('1ª vez → depoimento', () => {
    expect(decidirTipoMilestone(diario)).toBe('depoimento');
  });
  it('já teve depoimento → parabéns', () => {
    expect(decidirTipoMilestone({ ...diario, jaTeveDepoimento: true })).toBe('parabens');
  });
});

describe('abordagem/regras: util', () => {
  it('diasDesde calcula certo', () => {
    expect(diasDesde('2026-06-08T15:00:00Z', hoje)).toBe(3);
    expect(diasDesde(null, hoje)).toBeNull();
  });
  it('constantes de ritmo travadas', () => {
    expect(RITMO).toEqual({ PARABENS_DIAS: 90, LIMPEZA_DIAS: 30, DESCARTE_DIAS: 30, LEMBRETE_DIAS: 3, ENCERRA_DIAS: 3, REAGENDA_PADRAO_DIAS: 2 });
  });
});
```

Run: `npx vitest run tests/abordagem-regras.test.ts` → FAIL

- [ ] **Step 2: Implementar**

```typescript
// src/modules/monitoring/abordagem/regras.ts
// PURO: invariantes de ritmo da spec (seção 5). Erro pra MENOS mensagem é
// melhor que pra mais — spam mata a confiança.
import type { AbordagemTipo, DiarioUsina } from './tipos.js';

export const RITMO = {
  PARABENS_DIAS: 90,
  LIMPEZA_DIAS: 30,
  DESCARTE_DIAS: 30,
  LEMBRETE_DIAS: 3,
  ENCERRA_DIAS: 3,
  REAGENDA_PADRAO_DIAS: 2,
} as const;

export function diasDesde(iso: string | null, hoje: Date): number | null {
  if (!iso) return null;
  return Math.floor((hoje.getTime() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

export interface LeadElegibilidade { id: string; optOut: boolean }
export interface Veredito { ok: boolean; motivo?: string }

export function podeAbordar(
  tipo: AbordagemTipo,
  lead: LeadElegibilidade,
  diario: DiarioUsina,
  hoje: Date,
): Veredito {
  if (lead.optOut) return { ok: false, motivo: 'cliente em opt-out' };
  if (diario.abordagemAbertaId) return { ok: false, motivo: 'já existe abordagem aberta nesta usina' };

  const msgHoje = diasDesde(diario.ultimaMsgProativaAoLeadEm, hoje);
  if (msgHoje !== null && msgHoje < 1) return { ok: false, motivo: 'cliente já recebeu proativa hoje' };

  const descarte = diasDesde(diario.descartadaPeloJuniorEm, hoje);
  if (descarte !== null && descarte < RITMO.DESCARTE_DIAS) {
    return { ok: false, motivo: `Junior descartou há ${descarte}d (<${RITMO.DESCARTE_DIAS}d)` };
  }

  if (tipo === 'parabens' || tipo === 'depoimento') {
    const ult = diasDesde(diario.ultimoParabensEnviadoEm, hoje);
    if (ult !== null && ult < RITMO.PARABENS_DIAS) {
      return { ok: false, motivo: `parabéns há ${ult}d (<${RITMO.PARABENS_DIAS}d)` };
    }
  }
  if (tipo === 'queda') {
    const oferta = diasDesde(diario.ultimaOfertaLimpezaEm, hoje);
    if (oferta !== null && oferta < RITMO.LIMPEZA_DIAS) {
      return { ok: false, motivo: `ofereceu limpeza há ${oferta}d (<${RITMO.LIMPEZA_DIAS}d)` };
    }
  }
  return { ok: true };
}

// milestone_economia: 1ª vez da usina = pedir depoimento; depois = parabéns.
export function decidirTipoMilestone(diario: DiarioUsina): 'depoimento' | 'parabens' {
  return diario.jaTeveDepoimento ? 'parabens' : 'depoimento';
}
```

- [ ] **Step 3: PASS** → `npx vitest run tests/abordagem-regras.test.ts`

- [ ] **Step 4: Commit**

```powershell
git add src/modules/monitoring/abordagem/regras.ts tests/abordagem-regras.test.ts
git commit -m "feat(monitoramento): regras puras de elegibilidade e ritmo (invariantes anti-spam)"
```

---

### Task 4: Números da usina (`numeros-usina.ts`)

**Files:**
- Create: `src/modules/monitoring/abordagem/numeros-usina.ts`
- Test: `tests/abordagem-numeros.test.ts`

- [ ] **Step 1: Testes (falhando)**

```typescript
// tests/abordagem-numeros.test.ts
import { describe, it, expect } from 'vitest';
import { numerosTrimestre, recuperacaoPosLimpeza } from '../src/modules/monitoring/abordagem/numeros-usina.js';

describe('abordagem/numeros: trimestre', () => {
  it('soma kWh dos últimos 90 dias e converte em R$ pela tarifa', () => {
    const geracoes = [
      { data: '2026-06-10', geracao_kwh: 30 },
      { data: '2026-05-10', geracao_kwh: 40 },
      { data: '2026-02-01', geracao_kwh: 99 }, // fora dos 90d
    ];
    const r = numerosTrimestre(geracoes, 1.05, new Date('2026-06-11T12:00:00Z'));
    expect(r.kwh).toBe(70);
    expect(r.reais).toBe(73.5); // 70 × 1.05
  });
  it('sem dados → null (nunca inventa número)', () => {
    expect(numerosTrimestre([], 1.05, new Date())).toBeNull();
  });
});

describe('abordagem/numeros: recuperação pós-limpeza', () => {
  it('compara média 7d antes × depois', () => {
    const antes = [10, 10, 10, 10, 10, 10, 10];
    const depois = [12, 12, 12, 12, 12, 12, 12];
    expect(recuperacaoPosLimpeza(antes, depois)).toBe(20); // +20%
  });
  it('sem dados suficientes → null', () => {
    expect(recuperacaoPosLimpeza([10], [12, 12])).toBeNull();
  });
});
```

Run → FAIL

- [ ] **Step 2: Implementar**

```typescript
// src/modules/monitoring/abordagem/numeros-usina.ts
// PURO: números que entram nas mensagens. A IA NUNCA calcula — recebe pronto.

export interface GeracaoDia { data: string; geracao_kwh: number }

export function numerosTrimestre(
  geracoes: GeracaoDia[],
  tarifaRsPorKwh: number,
  hoje: Date,
): { kwh: number; reais: number } | null {
  const corte = new Date(hoje.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const noPeriodo = geracoes.filter((g) => g.data >= corte);
  if (noPeriodo.length === 0) return null;
  const kwh = Math.round(noPeriodo.reduce((s, g) => s + Number(g.geracao_kwh), 0) * 10) / 10;
  if (!(kwh > 0)) return null;
  return { kwh, reais: Math.round(kwh * tarifaRsPorKwh * 100) / 100 };
}

// % de melhora da média diária: mín. 5 dias de cada lado pra não comemorar ruído.
export function recuperacaoPosLimpeza(kwhAntes: number[], kwhDepois: number[]): number | null {
  if (kwhAntes.length < 5 || kwhDepois.length < 5) return null;
  const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const mAntes = media(kwhAntes);
  if (mAntes <= 0) return null;
  return Math.round(((media(kwhDepois) - mAntes) / mAntes) * 100);
}
```

- [ ] **Step 3: PASS** → **Step 4: Commit**

```powershell
git add src/modules/monitoring/abordagem/numeros-usina.ts tests/abordagem-numeros.test.ts
git commit -m "feat(monitoramento): numeros da usina (trimestre e recuperacao) — IA nunca calcula"
```

---

### Task 5: Redator (`redator.ts`)

**Files:**
- Create: `src/modules/monitoring/abordagem/redator.ts`
- Test: `tests/abordagem-redator.test.ts`

- [ ] **Step 1: Testes (falhando)**

```typescript
// tests/abordagem-redator.test.ts
import { describe, it, expect } from 'vitest';
import { montarPromptAbordagem, limparMensagem } from '../src/modules/monitoring/abordagem/redator.js';

const ctx = {
  tipo: 'queda' as const, etapa: 1,
  objetivo: 'Apresentar-se e perguntar sobre limpeza',
  clienteNome: 'João Silva',
  dados: { percentualQueda: 35, diasOffline: null, trimestre: null, causaRaizAnterior: null },
  regrasTreino: ['Nunca usar a palavra "prejuízo"'],
  ajusteDoJunior: null,
  mensagemAnterior: null,
};

describe('abordagem/redator: prompt', () => {
  it('inclui objetivo, nome, dados reais e regras de treino', () => {
    const p = montarPromptAbordagem(ctx);
    expect(p).toContain('João');
    expect(p).toContain('35');
    expect(p).toContain('prejuízo');
    expect(p).toContain('NUNCA');           // guardrails
    expect(p).toContain('preço');           // proibição de preço
  });
  it('ajuste do Junior entra como ordem prioritária', () => {
    const p = montarPromptAbordagem({ ...ctx, ajusteDoJunior: 'fica mais informal', mensagemAnterior: 'Olá João...' });
    expect(p).toContain('fica mais informal');
    expect(p).toContain('Olá João...');
  });
});

describe('abordagem/redator: limpeza da saída', () => {
  it('tira aspas e prefixos de laudo', () => {
    expect(limparMensagem('"Oi João! Tudo bem?"')).toBe('Oi João! Tudo bem?');
    expect(limparMensagem('Mensagem: Oi João')).toBe('Oi João');
  });
  it('vazio → null (nunca manda mensagem vazia)', () => {
    expect(limparMensagem('   ')).toBeNull();
  });
});
```

Run → FAIL

- [ ] **Step 2: Implementar**

```typescript
// src/modules/monitoring/abordagem/redator.ts
// A IA escreve a mensagem; o SISTEMA fornece todos os números e o objetivo.
// Prompts e limpeza são PUROS (testáveis); a chamada Opus/Haiku é injetada.
import type Anthropic from '@anthropic-ai/sdk';
import type { AbordagemTipo } from './tipos.js';

export interface ContextoRedacao {
  tipo: AbordagemTipo;
  etapa: number;
  objetivo: string;                 // vem de escada.objetivoDoDegrau
  clienteNome: string;
  dados: {
    percentualQueda: number | null;
    diasOffline: number | null;
    trimestre: { kwh: number; reais: number } | null;
    causaRaizAnterior: string | null;
  };
  regrasTreino: string[];           // monitoring_treino ativos (geral + do tipo)
  ajusteDoJunior: string | null;    // quando reescrevendo após [Ajustar]
  mensagemAnterior: string | null;  // a versão que o Junior mandou ajustar
}

export function montarPromptAbordagem(c: ContextoRedacao): string {
  const dados: string[] = [];
  if (c.dados.percentualQueda != null) dados.push(`queda de geração: ${c.dados.percentualQueda}% abaixo do esperado`);
  if (c.dados.diasOffline != null) dados.push(`dias sem enviar dados: ${c.dados.diasOffline}`);
  if (c.dados.trimestre) dados.push(`gerou no trimestre: ${c.dados.trimestre.kwh} kWh (~R$ ${c.dados.trimestre.reais.toFixed(2)} de economia)`);
  if (c.dados.causaRaizAnterior) dados.push(`da última vez o problema foi: ${c.dados.causaRaizAnterior} (comece por aí)`);

  const treino = c.regrasTreino.length
    ? `\nREGRAS DE TREINO DO JUNIOR (obrigatórias):\n${c.regrasTreino.map((r) => `- ${r}`).join('\n')}`
    : '';
  const ajuste = c.ajusteDoJunior
    ? `\nVERSÃO ANTERIOR (o Junior mandou ajustar):\n"${c.mensagemAnterior ?? ''}"\nAJUSTE PEDIDO (prioridade máxima): ${c.ajusteDoJunior}`
    : '';

  return `Você é a Eva, consultora da EcoSunPower (energia solar, Brasília/GO), escrevendo UMA mensagem de WhatsApp pro cliente ${c.clienteNome.split(/\s+/)[0]}.

OBJETIVO DESTA MENSAGEM: ${c.objetivo}

DADOS REAIS (use APENAS estes números — NUNCA calcule nem invente nenhum):
${dados.length ? dados.map((d) => `- ${d}`).join('\n') : '- (sem números nesta mensagem)'}

REGRAS FIXAS:
- NUNCA fale preço ou valores de serviço (limpeza/visita) — quem fecha valor é o Junior.
- NUNCA invente dado, promessa ou prazo.
- Curta: no máximo 4 linhas, tom WhatsApp, 1-2 emojis no máximo.
- Quem assina é "Eva, da EcoSunPower". Junior é o Responsável Técnico (nunca "engenheiro").
- Termine puxando resposta do cliente (pergunta ou convite a responder).${treino}${ajuste}

Escreva SÓ a mensagem final, sem aspas, sem título, sem explicações.`;
}

export function limparMensagem(raw: string): string | null {
  let t = raw.trim();
  t = t.replace(/^["'“”]+|["'“”]+$/g, '');
  t = t.replace(/^(mensagem|resposta|texto)\s*:\s*/i, '');
  t = t.trim();
  return t.length > 0 ? t : null;
}

// ---------------------------------------------------------------------------
// Chamada de IA (fina, sem teste unitário) — Opus escreve, Haiku é fallback.
// ---------------------------------------------------------------------------
const MODELO_FORTE = 'claude-opus-4-7';
const MODELO_RAPIDO = 'claude-haiku-4-5-20251001';

export async function redigirMensagem(client: Anthropic, ctx: ContextoRedacao): Promise<string | null> {
  const prompt = montarPromptAbordagem(ctx);
  let response;
  try {
    response = await client.messages.create({ model: MODELO_FORTE, max_tokens: 512, messages: [{ role: 'user', content: prompt }] });
  } catch (err) {
    console.warn('[abordagem] Opus indisponível, fallback Haiku:', (err as Error).message);
    response = await client.messages.create({ model: MODELO_RAPIDO, max_tokens: 512, messages: [{ role: 'user', content: prompt }] });
  }
  const raw = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
  return limparMensagem(raw);
}
```

- [ ] **Step 3: PASS** → **Step 4: Commit**

```powershell
git add src/modules/monitoring/abordagem/redator.ts tests/abordagem-redator.test.ts
git commit -m "feat(monitoramento): redator de abordagem (IA escreve, sistema fornece numeros)"
```

---

### Task 6: Repo do diário (`abordagens-repo.ts`)

**Files:**
- Create: `src/modules/monitoring/abordagem/abordagens-repo.ts`

I/O fino, sem teste unitário (padrão do projeto). Funções (todas recebendo `client: SupabaseClient`, padrão `throw` em erro com prefixo do nome — copie o estilo de `src/modules/financeiro/lancamentos-repo.ts`):

- [ ] **Step 1: Implementar** (assinaturas completas — corpo segue o padrão do repo do financeiro)

```typescript
// src/modules/monitoring/abordagem/abordagens-repo.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AbordagemRow, AbordagemTipo, AbordagemDesfecho, DiarioUsina, ConfigAutonomia } from './tipos.js';

const COLS = 'id, sistema_id, lead_id, alerta_id, tipo, etapa, status, desfecho, causa_raiz, mensagem_proposta, mensagem_enviada, resposta_resumo, nota_junior, reagendada_para, enviada_em, lembrete_em, ultima_resposta_cliente_em, encerrada_em, created_at';

// CRUD básico
export async function criarProposta(client: SupabaseClient, a: {
  sistemaId: string; leadId: string; alertaId: string | null;
  tipo: AbordagemTipo; mensagemProposta: string;
}): Promise<string | null> {
  // INSERT com status 'proposta'. Violação do unique parcial (já existe aberta
  // na usina) NÃO é erro: retorna null e o chamador desiste em silêncio.
  const { data, error } = await client.from('monitoring_abordagens').insert({
    sistema_id: a.sistemaId, lead_id: a.leadId, alerta_id: a.alertaId,
    tipo: a.tipo, mensagem_proposta: a.mensagemProposta, status: 'proposta',
  }).select('id').single();
  if (error) {
    if (error.code === '23505') return null;
    throw new Error(`criarProposta: ${error.message}`);
  }
  return (data as { id: string }).id;
}

export async function getAbordagem(client: SupabaseClient, id: string): Promise<AbordagemRow | null>;
// SELECT COLS .eq('id').maybeSingle()

export async function mudarStatusAbordagem(
  client: SupabaseClient, id: string, de: string[], para: string,
  patch?: Record<string, unknown>,
): Promise<boolean>;
// UPDATE {...patch, status: para, updated_at: now} WHERE id AND status IN (de)
// .select('id') → retorna true se casou (CAS — clique duplo do Junior não duplica envio)

export async function getAbordagemAbertaPorLeadPhone(client: SupabaseClient, leadId: string): Promise<AbordagemRow | null>;
// status IN ('enviada','em_conversa','lembrete_enviado') .eq('lead_id') mais recente

// Diário consolidado de UMA usina (alimenta as regras puras)
export async function getDiarioUsina(client: SupabaseClient, sistemaId: string, leadId: string): Promise<DiarioUsina>;
// - abordagemAbertaId: status <> 'encerrada' da usina
// - ultimoParabensEnviadoEm: max(enviada_em) tipo IN ('parabens','depoimento')
// - ultimaOfertaLimpezaEm: max(updated_at) tipo 'queda' com etapa >= 2
// - descartadaPeloJuniorEm: max(encerrada_em) desfecho 'descartada_junior'
// - causaRaizAnterior: causa_raiz da última 'offline' encerrada com causa
// - jaTeveDepoimento: existe tipo 'depoimento' com enviada_em não nulo
// - ultimaMsgProativaAoLeadEm: max(enviada_em, lembrete_em) de QUALQUER usina do lead

// Pendências pro cron (15min)
export async function getAbordagensParaLembrete(client: SupabaseClient, agoraIso: string, limiteDias: number): Promise<AbordagemRow[]>;
// status IN ('enviada','em_conversa') AND ultima_resposta_cliente_em IS NULL
// AND enviada_em <= agora - limiteDias AND (reagendada_para IS NULL OR reagendada_para <= agora)
export async function getAbordagensParaEncerrar(client: SupabaseClient, agoraIso: string, limiteDias: number): Promise<AbordagemRow[]>;
// status = 'lembrete_enviado' AND lembrete_em <= agora - limiteDias
export async function getAbordagensReagendadasDevidas(client: SupabaseClient, agoraIso: string): Promise<AbordagemRow[]>;
// status = 'em_conversa' AND reagendada_para IS NOT NULL AND reagendada_para <= agora
// (cliente pediu "agora não" → na hora devida o cron manda a mensagem combinada)

export async function getQuedasEncerradasPorLimpeza(client: SupabaseClient, deIso: string, ateIso: string): Promise<AbordagemRow[]>;
// tipo='queda' AND status='encerrada' AND causa_raiz ILIKE '%limp%'
// AND encerrada_em BETWEEN de..ate (janela 10-20 dias atrás — follow-up pós-limpeza)

// Treino e config
export async function getRegrasTreino(client: SupabaseClient, tipo: AbordagemTipo): Promise<string[]>;
// instrucao WHERE ativo AND (tipo IS NULL OR tipo = $tipo) ORDER BY created_at
export async function gravarRegraTreino(client: SupabaseClient, tipo: AbordagemTipo | null, instrucao: string): Promise<void>;
export async function getConfig(client: SupabaseClient): Promise<ConfigAutonomia>;
export async function setAutonomia(client: SupabaseClient, tipo: 'parabens' | 'queda' | 'offline', on: boolean): Promise<void>;
export async function marcarBloqueioTemplateAvisado(client: SupabaseClient): Promise<void>;
```

(Implemente TODOS os corpos seguindo o padrão; nenhum pode ficar como comentário.)

- [ ] **Step 2: `npx tsc --noEmit`** → 0 erros

- [ ] **Step 3: Commit**

```powershell
git add src/modules/monitoring/abordagem/abordagens-repo.ts
git commit -m "feat(monitoramento): repo do diario de abordagens + treino + config"
```

---

### Task 7: Orquestrador (`orquestrador.ts`)

**Files:**
- Create: `src/modules/monitoring/abordagem/orquestrador.ts`

Camada de cola (I/O, decisões puras já testadas). Estrutura completa:

- [ ] **Step 1: Implementar**

```typescript
// src/modules/monitoring/abordagem/orquestrador.ts
// Cola da abordagem: propor → (treino: Junior aprova) → enviar (template fora
// da janela 24h) → lembrete → encerrar → resumo de feedback.
// Eva escreve (redator), SISTEMA decide (regras) e calcula (numeros-usina).
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
// imports: regras, escada, numeros-usina, redator, abordagens-repo, tipos
// + enviarTemplateInicial NÃO (sem fallback!): usa sender.sendTemplate direto.

export interface OrqDeps {
  supabase: SupabaseClient;
  anthropic: Anthropic;
  waba: {
    sendInteractiveButtons(to: string, body: string, buttons: Array<{ id: string; title: string }>, footer?: string): Promise<unknown>;
    sendTemplate(to: string, name: string, lang: string, components: unknown[]): Promise<{ messageId: string }>;
  };
  sendText: (to: string, text: string) => Promise<void>;
  adminPhone: string;
  dryRun: boolean;
  // janela 24h: o index sabe a última msg INBOUND do cliente
  janela24hAberta: (phone: string) => Promise<boolean>;
}

const FOOTER = 'Monitoramento · Eva';

// 1) PROPOR — chamado pelo dispatcher quando alerta elegível chega.
//    Monta dados reais + diário + regras, redige, grava proposta e roteia:
//    treino → Junior com [Pode mandar][Ajustar][Não manda] (mab:ok/adj/no:<id>)
//    auto   → enviarParaCliente direto.
export async function proporAbordagem(deps: OrqDeps, args: {
  alertaId: string; sistemaId: string; leadId: string;
  tipoAlerta: 'sistema_offline' | 'queda_geracao' | 'milestone_economia';
  diasOffline: number | null; percentualQueda: number | null;
}): Promise<'proposta' | 'enviada' | 'inelegivel'> { /* corpo completo */ }
// Passos do corpo (implementar TODOS):
// a. lead = getLeadById; if (!lead || opt_out) return 'inelegivel'
// b. diario = getDiarioUsina; tipo = tipoAlerta==='milestone_economia'
//      ? decidirTipoMilestone(diario) : (offline|queda)
// c. veredito = podeAbordar(tipo, {id, optOut}, diario, new Date());
//      !ok → console.log motivo → 'inelegivel'
// d. dados: offline→diasOffline; queda→percentualQueda;
//      parabens→numerosTrimestre(getGeracao90d(sistemaId), tarifaDaUf(solar-params), hoje)
//      — parabéns SEM números (null) → 'inelegivel' (nunca parabéns vazio)
// e. msg = redigirMensagem(anthropic, {tipo, etapa:1, objetivo:objetivoDoDegrau(tipo,1),
//      clienteNome, dados, regrasTreino:getRegrasTreino(tipo), ajusteDoJunior:null, mensagemAnterior:null})
//      msg null → 'inelegivel' (loga)
// f. id = criarProposta(...); id null (corrida unique) → 'inelegivel'
// g. config = getConfig(); autoOn = tipo parabens|depoimento→parabens_auto;
//      queda→queda_auto; offline→offline_auto
// h. !autoOn (TREINO): mudarStatus(['proposta'],'aguardando_aprovacao');
//      waba.sendInteractiveButtons(adminPhone,
//        `🟡 Abordagem pronta — ${apelido} (${rotulo do tipo}):\n\n"${msg}"`,
//        [{id:`mab:ok:${id}`,title:'Pode mandar'},{id:`mab:adj:${id}`,title:'Ajustar'},
//         {id:`mab:no:${id}`,title:'Não manda'}], FOOTER) → return 'proposta'
//    autoOn → enviarParaCliente(deps, id) → 'enviada'

// 2) ENVIAR pro cliente (usado por aprovação e por auto)
export async function enviarParaCliente(deps: OrqDeps, abordagemId: string): Promise<boolean> { /* corpo */ }
// a0. FRESCOR (spec caso-limite): se row.alerta_id e o alerta já tem resolved_at
//      (geração voltou antes do envio) e tipo é offline|queda → encerra a abordagem
//      {desfecho:'resolvido_sozinho'} SEM enviar nada e return false (nunca mandar
//      "tá offline" pra usina que voltou).
// a. row = getAbordagem; CAS mudarStatus(['proposta','aguardando_aprovacao'],'enviada',
//      {enviada_em: now, mensagem_enviada: row.mensagem_proposta}) — false → já tratada, return false
// b. if (deps.dryRun): console.log DRY + return true (status já marcado — aceitável em dry-run de homologação)
// c. phone = lead.phone; aberta = await janela24hAberta(phone)
// d. aberta → sendText(phone, row.mensagem_proposta)
//    fechada → config.template_nome; tenta waba.sendTemplate(phone, nome, 'pt_BR',
//      [{type:'body',parameters:[{type:'text',text:primeiroNome}]}])
//      — erro 132001/132000 (não aprovado/não existe): REVERTE status pra 'proposta'
//        (update direto), avisa Junior UMA vez (template_bloqueio_avisado false →
//        sendText admin '⚠️ Template eva_monitoramento_v1 ainda não aprovado no Meta —
//        abordagens seguram até aprovar' + marcarBloqueioTemplateAvisado) → return false
//      — sucesso: a mensagem real da escada vai quando o cliente responder
//        (handleRespostaCliente manda row.mensagem_proposta na abertura da janela)
//        → grava patch {extra}: update mensagem_enviada = '[template enviado]'
// e. marca o alerta: update monitoring_alerts SET acao_disparada='abordagem_cliente',
//      next_send_at = now+30d WHERE id = row.alerta_id (não competir com a abordagem)

// 3) BOTÕES do Junior (mab:) — chamado pelo index
export async function handleMabButton(deps: OrqDeps, buttonId: string): Promise<boolean> { /* corpo */ }
// parse 'mab:<acao>:<id-ou-tipo>'
// ok   → enviarParaCliente; sucesso → sendText admin '✅ Mandada pra <nome>.'
// adj  → mudarStatus(['aguardando_aprovacao'],'aguardando_aprovacao',{}) (no-op de status)
//        + grava em memória? NÃO — seta marcador no row: update nota_observacao='[ajustando]'
//        + sendText admin 'O que ajusto nessa mensagem?' (o texto seguinte do Junior
//        cai em handleTextoAdminAjuste — ver Task 8 wiring)
// no   → mudarStatus(...,'encerrada',{desfecho:'descartada_junior',encerrada_em:now})
//        + sendText admin 'Ok, descartada. Esse tipo não volta pra essa usina por 30 dias.'
// fb-boa:<id>  → update nota_junior='boa' + sendText '👍'
// fb-errou:<id>→ update nota_junior='errou' + sendText 'O que ela errou? Me conta que vira regra de treino.'
//        (resposta cai em handleTextoAdminAjuste com modo errou)
// auto-on:<tipo> → setAutonomia(tipo,true) + confirma
// ligo/visita/deixa:<id> → registra desfecho (transferido_junior/visita_agendada/sem_resposta) e encerra

// 4) AJUSTE/FEEDBACK por texto do Junior (chamado pelo index quando há
//    abordagem '[ajustando]' ou 'errou' pendente do admin)
export async function handleTextoAdminAjuste(deps: OrqDeps, texto: string): Promise<boolean> { /* corpo */ }
// - acha a abordagem mais recente aguardando_aprovacao com nota_observacao='[ajustando]'
//   → redigirMensagem com ajusteDoJunior=texto + mensagemAnterior → update mensagem_proposta
//   → gravarRegraTreino(tipo, texto) (o ajuste vira regra permanente)
//   → re-manda pro admin com os mesmos botões mab:ok/adj/no → return true
// - senão: acha a mais recente com nota_junior='errou' e nota_observacao null
//   → update nota_observacao=texto + gravarRegraTreino(tipo, texto) + agradece → true
// - senão → false (não era pra ele)

// 5) RESPOSTA do cliente (chamado pelo index ao receber msg de lead com abordagem ativa)
export async function handleRespostaCliente(deps: OrqDeps, abordagem: AbordagemRow, texto: string): Promise<void> { /* corpo */ }
// - update ultima_resposta_cliente_em=now, status='em_conversa'
// - quick reply 'Pode contar' (ou 1ª resposta pós-template com mensagem_enviada='[template enviado]'):
//     sendText(phone, mensagem_proposta) — a mensagem real da escada
// - quick reply 'Agora não': sendText pergunta de quando ("Tranquilo! Me diz quando é um
//     bom momento que eu te chamo — é coisa rápida, mas importante sobre a sua usina 😊")
//     + update reagendada_para = now + RITMO.REAGENDA_PADRAO_DIAS (ajustado se o cliente
//     disser depois — parse simples 'amanhã'/'hoje à noite'/dia da semana em regras puras? →
//     YAGNI: +2 dias fixo nesta versão, registrado na spec como simplificação)
// (o restante da conversa é da Eva normal com contexto — Task 8)

// 6) CRON de pendências (15min, junto do dispatch)
export async function processarPendencias(deps: OrqDeps, agora: Date): Promise<void> { /* corpo */ }
// a. lembretes: getAbordagensParaLembrete(agora, RITMO.LEMBRETE_DIAS) → para cada:
//    dentroDaJanela(agora) (reusa janela.ts) e janela24hAberta? texto direto;
//    senão pula (template de lembrete = YAGNI; tenta no próximo ciclo dentro de janela)
//    msg = redigirMensagem(etapa lembrete = última da escada) → sendText →
//    mudarStatus(['enviada','em_conversa'],'lembrete_enviado',{lembrete_em:now})
// b. encerramentos: getAbordagensParaEncerrar → mudarStatus → 'encerrada'
//    {desfecho:'sem_resposta', encerrada_em} → avisa Junior com botões
//    [mab:ligo:<id>] '📞 Eu ligo' / [mab:visita:<id>] '🚗 Agendar visita' /
//    [mab:deixa:<id>] '🤷 Deixar pra lá'
// c. reagendadas: getAbordagensReagendadasDevidas → sendText(phone, mensagem_proposta)
//    (a mensagem combinada) + limpa reagendada_para
// d. pós-limpeza (spec queda item 4): getQuedasEncerradasPorLimpeza(janela 10-20d atrás)
//    → recuperacaoPosLimpeza(média 7d antes da limpeza × 7d recentes, de geracao_diaria)
//    → >= 10%: mensagem comemorativa 1× ("limpou e melhorou X% 👏" — redigida com o
//    número PRONTO) registrada como nova abordagem tipo 'queda' etapa especial já
//    encerrada (desfecho resolvido_sozinho); < 0%: avisa o Junior (pode ser técnica).
//    Marcar a abordagem original (nota_observacao='[followup feito]') pra rodar 1× só.

// 7) ENCERRAR por conversa (chamado pela action abordagem_update — Task 8)
export async function atualizarPorConversa(deps: OrqDeps, abordagemId: string, upd: {
  resumo: string | null; desfecho: AbordagemDesfecho | null; causaRaiz: string | null;
}): Promise<void> { /* corpo */ }
// update resposta_resumo/causa_raiz; desfecho → status 'encerrada' + encerrada_em
// + RESUMO DE FEEDBACK pro Junior: sendInteractiveButtons(adminPhone,
//   `📋 ${nome}: ${resumo} (${rotuloDesfecho})`,
//   [{id:`mab:fb-boa:${id}`,title:'👍 Boa'},{id:`mab:fb-errou:${id}`,title:'👎 Errou'}], FOOTER)
// + SUGESTÃO DE AUTONOMIA (spec seção 6): se o tipo ainda não é auto E as últimas 5
//   abordagens encerradas desse tipo foram todas enviadas SEM ajuste e SEM nota 'errou'
//   → 3º botão {id:`mab:auto-on:${tipo}`,title:'🔓 Liberar automático'} (sugestão, não força)
// + desfecho 'limpeza_fechada'|'transferido_junior' → aviso extra pro Junior fechar valor
```

(Implementar TODOS os corpos; o esqueleto acima é o contrato. Erros: try/catch com log; falha de envio NUNCA derruba o ciclo dos outros.)

- [ ] **Step 2: `npx tsc --noEmit` + `npx vitest run`** → verdes

- [ ] **Step 3: Commit**

```powershell
git add src/modules/monitoring/abordagem/orquestrador.ts
git commit -m "feat(monitoramento): orquestrador de abordagem (propor, treino, enviar, lembrete, feedback)"
```

---

### Task 8: Ligar no dispatcher e no `index.ts`

**Files:**
- Modify: `src/modules/monitoring/proactive-alerts/dispatcher.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Dispatcher roteia elegíveis**

Em `runDispatchCycle`, depois de obter `sistema` e `lead` (linha ~46), ANTES do `formatAlertMessage`:

```typescript
      // Eva Monitoramento Evolutivo: alerta de tipo "cliente" com dono vinculado
      // tenta virar abordagem ao cliente. Inelegível → fluxo atual (alerta admin).
      if (ctx.proporAbordagem && lead &&
          (alerta.tipo === 'sistema_offline' || alerta.tipo === 'queda_geracao' || alerta.tipo === 'milestone_economia')) {
        const resultado = await ctx.proporAbordagem(alerta, sistema, lead);
        if (resultado !== 'inelegivel') {
          await ctx.supabase.marcarAlertaEnviado(alerta.id, hoje.toISOString(), addDays(hoje, 30).toISOString());
          enviados++;
          continue;
        }
        // inelegível → segue pro alerta admin normal abaixo
      }
```

E em `DispatchCtx` adicionar o campo opcional:

```typescript
  proporAbordagem?: (
    alerta: MonitoringAlertRow,
    sistema: { id: string; apelido: string; potencia_kwp: number | null; marca_inversor: string; lead_id: string | null },
    lead: { id: string; name: string | null; phone: string },
  ) => Promise<'proposta' | 'enviada' | 'inelegivel'>;
```

(quem monta o ctx no index.ts passa um wrapper que extrai diasOffline/percentualQueda do `alerta.texto`? NÃO — o detect já conhece; extrair do sistema: o wrapper chama `getSistemaDetalhe`/query de `geracao_diaria` pra calcular `diasOffline` e `percentualQueda` reais antes de chamar `proporAbordagem` do orquestrador. Implementar o wrapper no index.)

- [ ] **Step 2: Botões `mab:` no handleTextMessage**

Logo após o bloco `finlan:` (Fatia 3):

```typescript
    // mab:<acao>:<id> — botões do Monitoramento Evolutivo (treino/feedback).
    if (isAdminPhone(from) && text.trim().startsWith('mab:')) {
      if (!metaWaba) { await sendText(from, '❌ WABA indisponível'); return; }
      const { handleMabButton } = await import('./modules/monitoring/abordagem/orquestrador.js');
      await handleMabButton(getOrqDeps(), text.trim());
      return;
    }
```

`getOrqDeps()` definido perto de `getCaixaDeps()` (mesmo padrão), com `janela24hAberta` implementada consultando a última mensagem INBOUND do lead (existe `conversations.messages`/timestamp — usar `supabase.getLeadByPhone` + last inbound; se não houver fonte direta, criar helper que considera ABERTA quando `ultima_resposta_cliente_em`/última msg do lead < 24h, e FECHADA na dúvida — template na dúvida é o caminho SEGURO).

- [ ] **Step 3: Texto do admin pra ajuste/feedback**

DEPOIS do gate financeiro (Fatia 3) e ANTES do takeover:

```typescript
    // Monitoramento Evolutivo: resposta do Junior a um [Ajustar]/[👎 Errou].
    if (isAdminPhone(from) && metaWaba) {
      const { handleTextoAdminAjuste } = await import('./modules/monitoring/abordagem/orquestrador.js');
      if (await handleTextoAdminAjuste(getOrqDeps(), text)) return;
    }
```

(ATENÇÃO ordem: o gate financeiro roda Haiku ANTES — texto de ajuste tipo "tira o emoji" não é financeiro → gate devolve false → cai aqui. Aceitável. ALTERNATIVA melhor: rodar handleTextoAdminAjuste ANTES do gate financeiro quando houver abordagem '[ajustando]' pendente — implementar a checagem barata (1 query) antes do gate.)

- [ ] **Step 4: Resposta do CLIENTE com abordagem ativa**

No fluxo de texto do CLIENTE (não-admin), ANTES de `brain.processMessage` (âncora ~3727): buscar abordagem ativa do lead; se houver:

```typescript
      // Monitoramento Evolutivo: cliente com abordagem ativa → registra resposta
      // (quick replies do template) e injeta contexto na conversa da Eva.
      const { getAbordagemAbertaPorLeadPhone } = await import('./modules/monitoring/abordagem/abordagens-repo.js');
      const abordagemAtiva = await getAbordagemAbertaPorLeadPhone(supabase.getClient(), leadId);
      if (abordagemAtiva) {
        const { handleRespostaCliente } = await import('./modules/monitoring/abordagem/orquestrador.js');
        await handleRespostaCliente(getOrqDeps(), abordagemAtiva, text);
        const ehQuickReply = /^(pode contar|agora não|agora nao)$/i.test(text.trim());
        if (ehQuickReply) return; // o orquestrador já respondeu
        contextoAbordagem = montarContextoAbordagem(abordagemAtiva); // string pro prompt
      }
```

`montarContextoAbordagem` (função pura pequena, pode morar no orquestrador, exportada): devolve bloco de texto pro system/context da conversa com: qual usina, situação e dados, o que já foi falado (mensagem_enviada/resposta_resumo), regras (limpeza SEM preço; transferir pro Junior se topar; nunca calcular números) e a instrução da action:

```
Quando a conversa sobre a usina avançar, anexe ao FINAL da sua resposta:
```json
{"action":"abordagem_update","data":{"abordagem_id":"<id>","resumo":"<1 linha do que rolou>","desfecho":null|"resolvido_sozinho"|"limpeza_fechada"|"visita_agendada"|"transferido_junior","causa_raiz":null|"<ex: senha do wifi>"}}
```
Use desfecho SÓ quando o assunto da usina ENCERRAR (resolveu, topou limpeza/visita, ou pediu o Junior).
```

E no `handleAction` (procurar o switch das actions existentes, ex. `update_lead`/`save_testimonial`): adicionar case `abordagem_update` chamando `atualizarPorConversa(getOrqDeps(), data.abordagem_id, {...})` com validação defensiva dos campos (desfecho fora do enum → null).

- [ ] **Step 5: Cron de pendências**

Junto do cron de dispatch (15min, âncora `runDispatchCycle` no index ~7383-7422): após o dispatch, chamar `processarPendencias(getOrqDeps(), new Date())` (try/catch próprio, não derruba o dispatch). E no `DispatchCtx` montado no index, passar o wrapper `proporAbordagem` (Step 1).

- [ ] **Step 6: Verificação completa**

`npx tsc --noEmit` → 0; `npx vitest run` → verde (2 pré-existentes alheias). Reler os diffs: cliente sem abordagem ativa = caminho idêntico ao atual; admin: mab antes do gate financeiro NÃO (vem depois do finlan e antes... conferir ordem final: finrec → finrcv → finlan → mab → …comandos/modos… → ajuste monitoramento → gate financeiro? NÃO: Step 3 manda ajuste DEPOIS do gate. Decisão final (deixar documentada em comentário): mab (botões) logo após finlan; handleTextoAdminAjuste com pré-checagem barata ANTES do gate financeiro.)

- [ ] **Step 7: Commit**

```powershell
git add src/modules/monitoring/proactive-alerts/dispatcher.ts src/index.ts
git commit -m "feat(monitoramento): liga abordagem evolutiva no dispatcher e no fluxo da Eva"
```

---

### Task 9: Dashboard — timeline + KPIs

**Files:**
- Modify: a página de DETALHE de sistema do monitoramento (localizar em `src/modules/dashboard/` — procurar pelo render do detalhe de sistema/usina, ex. `monitoring-views`/`sistemas`; seguir o padrão de tabela dark existente)
- Modify: a página de visão geral do monitoramento (KPIs)

- [ ] **Step 1: Query da timeline** — função no módulo de queries do dashboard de monitoramento:

```typescript
export async function getTimelineAbordagens(client: SupabaseClient, sistemaId: string): Promise<Array<{
  created_at: string; tipo: string; status: string; desfecho: string | null;
  mensagem_enviada: string | null; resposta_resumo: string | null; nota_junior: string | null;
}>> {
  const { data, error } = await client.from('monitoring_abordagens')
    .select('created_at, tipo, status, desfecho, mensagem_enviada, resposta_resumo, nota_junior')
    .eq('sistema_id', sistemaId).order('created_at', { ascending: false }).limit(20);
  if (error) throw new Error(`getTimelineAbordagens: ${error.message}`);
  return (data ?? []) as never;
}
```

- [ ] **Step 2: Render da timeline** no detalhe da usina (card "🤖 Abordagens da Eva"): lista com data, emoji do tipo (☀️/📉/🔌/⭐), 1ª linha da mensagem (escapeHtml!), desfecho rotulado em PT-BR e a nota (👍/👎). Vazio → "Nenhuma abordagem ainda".

- [ ] **Step 3: KPIs** na visão geral do monitoramento (card novo): no mês — abordagens enviadas, % com desfecho `resolvido_sozinho`, limpezas fechadas, sem resposta. Query agregada por `created_at` no mês + contagens por desfecho (mesmo padrão dos KPIs do financeiro).

- [ ] **Step 4: tsc + suite + commit**

```powershell
git add src/modules/dashboard/
git commit -m "feat(dashboard): timeline de abordagens por usina + KPIs do monitoramento evolutivo"
```

---

### Task 10: Build marker + verificação final

**Files:**
- Modify: `src/build-info.ts` → `export const BUILD_VERSION = 'MONITORAMENTO-EVOLUTIVO-2026-06-12';`
- Modify: `Dockerfile` linha do cache bust → `# Cache bust: 2026-06-12-mab (...)`

- [ ] Steps: editar, `npx tsc --noEmit`, `npx vitest run` (suite inteira), commit:

```powershell
git add src/build-info.ts Dockerfile
git commit -m "chore(monitoramento): build marker MONITORAMENTO-EVOLUTIVO-2026-06-12"
```

---

## Pós-implementação

1. **3 code reviews finais com lentes diferentes** (regra do Junior): 🐞 correção (trace os fluxos ponta a ponta: milestone 1ª vez/recorrente, queda→limpeza→transferência, offline→resolvido, sem-resposta→Junior, Agora não→reagenda), ♻️ regressão (alertas admin atuais intactos pra inelegíveis/órfãs/erro_integracao; fluxo cliente sem abordagem intacto; gate financeiro da Fatia 3 não conflita com mab/ajuste), 🔒 segurança (mab gateado em admin; prompt injection via resposta do cliente não força desfecho falso — action validada; nada de preço/dado inventado nos prompts). Corrigir achados + re-review.
2. **Pedir autorização de push.**
3. **Checklist de deploy (ordem):**
   - Migration 048 (`Desktop\migration-048-monitoramento.sql`) no SQL Editor do projeto `kupnsoyymulbdzakqlqc` — conferir: `select count(*) from monitoring_config;` → 1.
   - **CONFERIR template `eva_monitoramento_v1` APROVADO no Meta** (estava em análise em 11/06). Sem ele: código pode subir (abordagens seguram sozinhas e avisam 1×), mas o go-live de cliente só acontece com template ok.
   - `PROACTIVE_ALERTS_DRY_RUN`: conferir estado atual no Easypanel; primeira rodada em produção PODE ser com dry-run ligado pra ver os logs de proposta.
   - Implantar → `curl /health` = `MONITORAMENTO-EVOLUTIVO-2026-06-12`.
   - Smoke (fase treino — nada chega no cliente sem o Junior): aguardar 1 alerta real (ou forçar com usina de teste) → conferir mensagem proposta + botões mab → [Ajustar] → conferir reescrita → [Pode mandar] → conferir template/mensagem no cliente → responder como cliente → conferir contexto + resumo de feedback 👍/👎 → conferir timeline no dashboard.

## Riscos conhecidos / decisões registradas

- **Reagendamento do "Agora não" = +2 dias fixo nesta versão** (parse de "amanhã/à noite" ficou como fast-follow — YAGNI; registrado na spec como simplificação aceita).
- **Lembrete fora da janela 24h não usa template** nesta versão (espera ciclo com janela aberta; se nunca abrir, o encerramento por timeout avisa o Junior — nada se perde).
- **`janela24hAberta` conservadora:** na dúvida, considera FECHADA (template é o caminho seguro; nunca arriscar 131047 silencioso).
- **Action `abordagem_update` validada defensivamente** (enum whitelist) — cliente malicioso não força desfecho.
- **Volume baixo** (dezenas de abordagens/mês) — custo Opus desprezível.
