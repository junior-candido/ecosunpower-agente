# Gestão de Energia — Plano de implementação (G1 detalhada; G2–G5 em esboço)

> **Para quem executa (humano ou agente):** use `superpowers:executing-plans` (ou
> `superpowers:subagent-driven-development`) tarefa por tarefa. **TDD sempre**: teste primeiro,
> ver falhar, mínimo para passar, ver passar, commit. Checkboxes `- [ ]` para acompanhar.

**Objetivo (G1):** o medidor Shelly de cada cliente vira dado organizado por empresa — cadastro
com credencial segura, coleta push (já existe) + nuvem, resumo 15 min/diário, tela "Energia da
casa" (gerado × comprado × devolvido × consumido) e conferência com o demonstrativo da Neoenergia.

**Spec:** `docs/superpowers/specs/2026-09-28-gestao-de-energia-design.md` (ler antes; decisões D1–D11).

**Arquitetura:** módulo novo `src/modules/energia/` (funções puras + repo + serviço), registro
de medidores irmão do `monitoring/adapter-registry.ts`, recebimento reusa
`src/modules/medicao/shelly-medicao.ts`, rotas em `src/modules/dashboard/energia-rotas.ts`,
telas com `src/modules/dashboard/ui/componentes.ts`.

**Stack:** TypeScript ESM (import relativo termina em `.js`), Supabase (`SupabaseService`,
`bancoDoOperador`), Express server-rendered, vitest.

---

## Pré-requisitos (antes da Tarefa 1)

- [ ] A fase B do Command Center (`feat/command-center-fase-b`) **já está na `main`** — a G1 toca
      `router.ts`/`index.ts` e não pode colidir.
- [ ] `git checkout main && git pull && git checkout -b feat/energia-g1`
- [ ] Números das 2 migrations combinados no grupo (hoje a próxima livre é **136**; abaixo `EN1`/`EN2`).
- [ ] Junior decidiu D1 (modo padrão), D3 (cifrar — assumido **sim**), D4 (retenção), D10 (só EcoSun na G1 — assumido).
- [ ] Env nova no EasyPanel (Junior): `ENERGIA_CRED_KEY` = 64 hex (`openssl rand -hex 32`). **Nunca colar no chat.**
- [ ] Linha de base: `npx tsc --noEmit` limpo e `npx vitest run` verde (ignorar as 2 falhas conhecidas de `tests/supabase-vincular-novo.test.ts`).

## Mapa de arquivos

| Arquivo | Novo/alterado | Responsabilidade |
|---|---|---|
| `supabase/migrations/EN1_medidores_energia.sql` | novo | tabela `medidores_energia`, `medicoes_shelly.medidor_id`, RLS |
| `supabase/migrations/EN2_energia_resumos.sql` | novo | `energia_15min`, `energia_diaria`, RLS |
| `src/modules/energia/tempo.ts` | novo | dia/hora BRT, feriados nacionais, posto tarifário |
| `src/modules/energia/prodist.ts` | novo | faixa PRODIST por tensão nominal |
| `src/modules/energia/agregacao.ts` | novo | `agregar15min`, `resumirDia` (puras) |
| `src/modules/energia/balanco.ts` | novo | `balancoEnergia` (pura) |
| `src/modules/energia/conciliacao.ts` | novo | `conciliarComDemonstrativo` (pura) |
| `src/modules/energia/credenciais.ts` | novo | cifra/decifra credencial (reusa `financeiro/fiscal/crypto-cert.ts`), token do medidor |
| `src/modules/energia/types.ts` | novo | `MedidorAdapter`, tipos comuns |
| `src/modules/energia/adapters/shelly-cloud.ts` | novo | parse do status + cliente da Cloud Control API com fila 1 req/s |
| `src/modules/energia/medidor-registry.ts` | novo | registro plugável (formato de `adapter-registry.ts`) |
| `src/modules/energia/vigia.ts` | novo | `proximoStatus` (pura) — vigia de silêncio |
| `src/modules/energia/energia-repo.ts` | novo | leituras/escritas Supabase escopadas por empresa |
| `src/modules/energia/energia-service.ts` | novo | ciclos: agregar, fechar dia, coletar nuvem, vigiar, reter |
| `src/modules/medicao/shelly-medicao.ts` | alterado | `receberLeituraShelly` resolve token → medidor/empresa |
| `src/modules/supabase.ts` | alterado | `salvarMedicaoShelly` aceita `medidorId`; `resolverMedidorPorToken` |
| `src/index.ts` | alterado | webhook passa `resolverToken`; 4 crons novos |
| `src/modules/dashboard/energia-views.ts` | novo | telas (lista, cadastro, Energia da casa) |
| `src/modules/dashboard/energia-rotas.ts` | novo | handlers testáveis |
| `src/modules/dashboard/router.ts` | alterado | montar as rotas (poucas linhas) |
| `docs/kit-medicao/README.md` | alterado | token por medidor, checklist |
| `tests/energia-*.test.ts` | novos | um arquivo por módulo puro + adapter + rotas |

---

## Tarefa 1 — Migration EN1: `medidores_energia`

**Arquivos:** criar `supabase/migrations/EN1_medidores_energia.sql` (renomear para `136_…` quando combinado).

- [ ] **Passo 1: rodar o teste-teto antes** — `npx vitest run tests/migrations-tenant-guard.test.ts` (verde).
- [ ] **Passo 2: escrever a migration** (SQL completo da spec §3 EN-1) terminando com o bloco RLS
      idêntico à 123:

```sql
ALTER TABLE public.medidores_energia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medidores_energia FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.medidores_energia;
CREATE POLICY company_isolation ON public.medidores_energia
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));

-- Piloto: o medidor da casa do Junior já manda dado. Cadastra e liga o bruto existente.
insert into medidores_energia (company_id, apelido, device_id, modo_coleta, perfil, canais, ligacao, tensao_nominal_v, concessionaria, grupo_gd, status)
values ('00000000-0000-0000-0000-000000000001', 'Medidor Quadro', '007007422d90', 'push', 'triphase', '{"rede": 2}', 'mono', 220, 'Neoenergia Brasília', 'gd1', 'ok')
on conflict do nothing; -- (revisão 1: device_id único no global)
update medicoes_shelly m set medidor_id = e.id
  from medidores_energia e
 where m.medidor_id is null and m.device_id = e.device_id and m.company_id = e.company_id;
```

  ⚠️ Conferir o `device_id` real do piloto no banco antes (`select distinct device_id from medicoes_shelly`) — a memória cita `007007422d90` (payload) e `shellypro3em-007007422d90` (console).
- [ ] **Passo 3:** `npx vitest run tests/migrations-tenant-guard.test.ts` → verde (a tabela nasce com `company_id`).
- [ ] **Passo 4: commit**
```bash
git add supabase/migrations/EN1_medidores_energia.sql
git commit -m "feat(energia): migration medidores_energia + vinculo no bruto (G1)"
```

## Tarefa 2 — Migration EN2: `energia_15min` + `energia_diaria`

- [ ] SQL da spec §3 EN-2 (com `min_tensao_precaria`, `min_tensao_critica`, `min_acima_242`) + bloco RLS nas duas tabelas.
- [ ] `npx vitest run tests/migrations-tenant-guard.test.ts` → verde.
- [ ] Commit `feat(energia): migration resumos 15 min e diario (G1)`.

## Tarefa 3 — `tempo.ts`: dia BRT, feriados, posto tarifário

**Arquivos:** criar `src/modules/energia/tempo.ts`, `tests/energia-tempo.test.ts`.

- [ ] **Passo 1: teste que falha**

```ts
import { describe, it, expect } from 'vitest';
import { diaBrt, horaBrt, feriadosNacionais, postoTarifario } from '../src/modules/energia/tempo.js';

describe('tempo BRT', () => {
  it('02:30Z é ainda o dia anterior em Brasília', () => {
    expect(diaBrt('2026-09-08T02:30:00Z')).toBe('2026-09-07');
    expect(horaBrt('2026-09-08T02:30:00Z')).toBe(23);
  });
  it('feriados móveis de 2026 (Páscoa 05/04)', () => {
    const f = feriadosNacionais(2026);
    expect(f.has('2026-04-03')).toBe(true);  // Sexta-feira Santa
    expect(f.has('2026-02-16')).toBe(true);  // Carnaval (segunda)
    expect(f.has('2026-06-04')).toBe(true);  // Corpus Christi
    expect(f.has('2026-09-07')).toBe(true);  // Independência
  });
});

describe('postoTarifario (Neoenergia Brasília: ponta 18–21h)', () => {
  it('terça 19h BRT = ponta', () => expect(postoTarifario('2026-09-08T22:00:00Z')).toBe('ponta'));
  it('terça 17h30 BRT = intermediário', () => expect(postoTarifario('2026-09-08T20:30:00Z')).toBe('intermediario'));
  it('terça 21h15 BRT = intermediário', () => expect(postoTarifario('2026-09-09T00:15:00Z')).toBe('intermediario'));
  it('sábado 19h = fora de ponta', () => expect(postoTarifario('2026-09-12T22:00:00Z')).toBe('fora_ponta'));
  it('feriado 07/09 19h = fora de ponta', () => expect(postoTarifario('2026-09-07T22:00:00Z')).toBe('fora_ponta'));
});
```

- [ ] **Passo 2:** `npx vitest run tests/energia-tempo.test.ts` → FALHA (módulo não existe).
- [ ] **Passo 3: implementar**

```ts
// src/modules/energia/tempo.ts
// Brasília = UTC−3 fixo (sem horário de verão desde 2019). Tudo que é "dia" ou
// "horário de ponta" é LOCAL — igual geracao_diaria.data.
const OFFSET_MS = 3 * 60 * 60 * 1000;
const local = (iso: string) => new Date(new Date(iso).getTime() - OFFSET_MS);

export const diaBrt = (iso: string): string => local(iso).toISOString().slice(0, 10);
export const horaBrt = (iso: string): number => local(iso).getUTCHours();
export const minutoDoDiaBrt = (iso: string): number => { const d = local(iso); return d.getUTCHours() * 60 + d.getUTCMinutes(); };

function pascoa(ano: number): Date { // algoritmo de Meeus/Jones/Butcher
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}
const somaDias = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000).toISOString().slice(0, 10);

/** Feriados nacionais que a ANEEL trata como fora de ponta. Conferir a lista da REN vigente. */
export function feriadosNacionais(ano: number): Set<string> {
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map((md) => `${ano}-${md}`);
  const p = pascoa(ano);
  return new Set([...fixos, somaDias(p, -48), somaDias(p, -47), somaDias(p, -2), somaDias(p, 60)]);
}

export type Posto = 'ponta' | 'intermediario' | 'fora_ponta';
export interface HorarioPonta { inicioMin: number; fimMin: number } // minutos do dia BRT, [inicio, fim)
/** Por concessionária. Neoenergia Brasília: 18h–21h (CONFERIR na resolução homologatória vigente). */
export const PONTA_PADRAO: HorarioPonta = { inicioMin: 18 * 60, fimMin: 21 * 60 };

export function postoTarifario(iso: string, ponta: HorarioPonta = PONTA_PADRAO): Posto {
  const d = local(iso);
  const dow = d.getUTCDay();
  const dia = d.toISOString().slice(0, 10);
  if (dow === 0 || dow === 6 || feriadosNacionais(d.getUTCFullYear()).has(dia)) return 'fora_ponta';
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (m >= ponta.inicioMin && m < ponta.fimMin) return 'ponta';
  if ((m >= ponta.inicioMin - 60 && m < ponta.inicioMin) || (m >= ponta.fimMin && m < ponta.fimMin + 60)) return 'intermediario';
  return 'fora_ponta';
}
```

  (Consciência Negra 20/11 é feriado nacional desde a Lei 14.759/2023 — conferir se a distribuidora já aplica.)
- [ ] **Passo 4:** teste → verde. **Passo 5:** commit `feat(energia): tempo BRT, feriados e posto tarifario`.

## Tarefa 4 — `prodist.ts`: faixa de tensão

**Arquivos:** `src/modules/energia/prodist.ts`, `tests/energia-prodist.test.ts`.

- [ ] Teste (bordas exatas da tabela da spec §5):

```ts
import { faixaProdist } from '../src/modules/energia/prodist.js';
it.each([
  [220, 202, 'adequada'], [220, 231, 'adequada'], [220, 231.1, 'precaria'], [220, 233, 'precaria'],
  [220, 233.1, 'critica'], [220, 201.9, 'precaria'], [220, 191, 'precaria'], [220, 190.9, 'critica'],
  [127, 117, 'adequada'], [127, 133.5, 'precaria'], [127, 135.1, 'critica'],
  [380, 399, 'adequada'], [380, 403.5, 'critica'],
])('nominal %i, %f V → %s', (nom, v, esperado) => expect(faixaProdist(v, nom as 127 | 220 | 380)).toBe(esperado));
it('sem tensão ou sem nominal = null', () => { expect(faixaProdist(null, 220)).toBeNull(); expect(faixaProdist(220, null)).toBeNull(); });
```

- [ ] Implementação:

```ts
// PRODIST Módulo 8 — faixas de tensão de leitura (BT). Conferir na revisão vigente.
export type Faixa = 'adequada' | 'precaria' | 'critica';
type Nominal = 127 | 220 | 380;
const FAIXAS: Record<Nominal, { adeq: [number, number]; prec: [number, number] }> = {
  127: { adeq: [117, 133], prec: [110, 135] },
  220: { adeq: [202, 231], prec: [191, 233] },
  380: { adeq: [350, 399], prec: [331, 403] },
};
export const LIMITE_DESARME_INVERSOR_V = 242; // mesmo de monitoring/proactive-alerts/telemetria-regras.ts
export function faixaProdist(v: number | null | undefined, nominal: Nominal | null | undefined): Faixa | null {
  if (v == null || !Number.isFinite(v) || !nominal) return null;
  const f = FAIXAS[nominal];
  if (v >= f.adeq[0] && v <= f.adeq[1]) return 'adequada';
  if (v >= f.prec[0] && v <= f.prec[1]) return 'precaria';
  return 'critica';
}
```

- [ ] Verde → commit `feat(energia): faixas de tensao PRODIST`.

## Tarefa 5 — `agregar15min` (o coração)

**Arquivos:** `src/modules/energia/agregacao.ts`, `tests/energia-agregacao.test.ts`.

Regras (spec §2.4): energia pela **diferença dos contadores**, repartida proporcionalmente entre
janelas; contador que volta = reinício → integra a potência só se o intervalo ≤ 10 min; intervalo
maior que o limite = buraco (não inventa); leituras de tensão contam por minuto na janela da leitura.

- [ ] **Passo 1: testes que falham** (fixture sintética, forma do piloto)

```ts
import { describe, it, expect } from 'vitest';
import { agregar15min, type LeituraBruta } from '../src/modules/energia/agregacao.js';

const L = (min: number, imp: number, exp: number, p = 1000, v = 225): LeituraBruta => ({
  medidoEm: new Date(Date.UTC(2026, 8, 8, 3, 0) + min * 60_000).toISOString(), // 00:00 BRT
  potenciaW: p, tensao: v, fatorPotencia: 0.9, energiaWh: imp, energiaDevolvidaWh: exp,
});

describe('agregar15min', () => {
  it('1 kW constante por 30 min = 250 Wh em cada janela', () => {
    const ls = Array.from({ length: 31 }, (_, i) => L(i, 10_000 + i * (1000 / 60), 500));
    // a leitura do minuto 30 abre a 3ª janela (só grandezas instantâneas, sem energia ainda)
    const j = agregar15min(ls, { tensaoNominal: 220 }).filter((x) => x.segundosCobertos > 0);
    expect(j).toHaveLength(2);
    expect(j[0].inicio).toBe('2026-09-08T03:00:00.000Z');
    expect(j[0].importadoWh).toBeCloseTo(250, 1);
    expect(j[1].importadoWh).toBeCloseTo(250, 1);
    expect(j[0].segundosCobertos).toBe(900);
  });

  it('intervalo que atravessa a fronteira é repartido pelo tempo', () => {
    const j = agregar15min([L(14, 0, 0), L(16, 100, 0)], { tensaoNominal: 220 });
    expect(j.find((x) => x.inicio.endsWith('03:00:00.000Z'))!.importadoWh).toBeCloseTo(50, 5);
    expect(j.find((x) => x.inicio.endsWith('03:15:00.000Z'))!.importadoWh).toBeCloseTo(50, 5);
  });

  it('buraco de 40 min não inventa energia (push)', () => {
    const j = agregar15min([L(0, 0, 0), L(40, 700, 0)], { tensaoNominal: 220 });
    expect(j.reduce((s, x) => s + x.importadoWh, 0)).toBe(0);
  });

  it('modo nuvem aceita 15 min entre fotos pelos contadores', () => {
    const j = agregar15min([L(0, 0, 0), L(15, 250, 0)], { tensaoNominal: 220, gapMaxContadorS: 1800 });
    expect(j[0].importadoWh).toBeCloseTo(250, 5);
  });

  it('contador que volta (aparelho reiniciado) cai na integração da potência', () => {
    const j = agregar15min([L(0, 5000, 0, 1200), L(1, 10, 0, 1200)], { tensaoNominal: 220 });
    expect(j[0].importadoWh).toBeCloseTo(20, 5); // 1,2 kW × 1 min
  });

  it('injeção solar vai para exportado', () => {
    const j = agregar15min([L(0, 0, 0, -2000), L(15, 0, 500, -2000)], { tensaoNominal: 220, gapMaxContadorS: 1800 });
    expect(j[0].exportadoWh).toBeCloseTo(500, 5);
    expect(j[0].importadoWh).toBe(0);
  });

  it('conta minutos de tensão precária, crítica e acima de 242 V', () => {
    const j = agregar15min([L(0, 0, 0, 0, 232), L(1, 0, 0, 0, 236), L(2, 0, 0, 0, 243)], { tensaoNominal: 220 });
    expect(j[0]).toMatchObject({ minTensaoPrecaria: 1, minTensaoCritica: 2, minAcima242: 1, tensaoMaxV: 243 });
  });
});
```

- [ ] **Passo 2:** ver falhar.
- [ ] **Passo 3: implementar**

```ts
// src/modules/energia/agregacao.ts
import { faixaProdist, LIMITE_DESARME_INVERSOR_V } from './prodist.js';

export interface LeituraBruta {
  medidoEm: string; potenciaW: number; tensao: number | null; fatorPotencia: number | null;
  energiaWh: number | null; energiaDevolvidaWh: number | null;
}
export interface Janela15 {
  inicio: string; importadoWh: number; exportadoWh: number; potenciaMaxW: number | null;
  tensaoMinV: number | null; tensaoMaxV: number | null; tensaoMedV: number | null; fpMedio: number | null;
  minTensaoPrecaria: number; minTensaoCritica: number; minAcima242: number; segundosCobertos: number;
}
export interface OpcoesAgregacao {
  tensaoNominal: 127 | 220 | 380 | null;
  gapMaxContadorS?: number;   // push: 600; nuvem: 1800
  gapMaxIntegracaoS?: number; // 600 — integrar potência só em intervalo curto
}

const JANELA_MS = 15 * 60_000;
const inicioJanela = (t: number) => Math.floor(t / JANELA_MS) * JANELA_MS;

export function agregar15min(leituras: LeituraBruta[], o: OpcoesAgregacao): Janela15[] {
  const gapCont = (o.gapMaxContadorS ?? 600) * 1000;
  const gapInt = (o.gapMaxIntegracaoS ?? 600) * 1000;
  const ls = [...leituras].sort((a, b) => a.medidoEm.localeCompare(b.medidoEm));
  type Acc = Janela15 & { _vSoma: number; _vN: number; _fpSoma: number; _fpN: number };
  const mapa = new Map<number, Acc>();
  const acc = (ini: number): Acc => {
    let a = mapa.get(ini);
    if (!a) {
      a = { inicio: new Date(ini).toISOString(), importadoWh: 0, exportadoWh: 0, potenciaMaxW: null,
        tensaoMinV: null, tensaoMaxV: null, tensaoMedV: null, fpMedio: null,
        minTensaoPrecaria: 0, minTensaoCritica: 0, minAcima242: 0, segundosCobertos: 0,
        _vSoma: 0, _vN: 0, _fpSoma: 0, _fpN: 0 };
      mapa.set(ini, a);
    }
    return a;
  };

  // 1) grandezas instantâneas: na janela da própria leitura
  for (const l of ls) {
    const a = acc(inicioJanela(Date.parse(l.medidoEm)));
    a.potenciaMaxW = a.potenciaMaxW === null ? l.potenciaW : Math.max(a.potenciaMaxW, l.potenciaW);
    if (l.tensao != null) {
      a.tensaoMinV = a.tensaoMinV === null ? l.tensao : Math.min(a.tensaoMinV, l.tensao);
      a.tensaoMaxV = a.tensaoMaxV === null ? l.tensao : Math.max(a.tensaoMaxV, l.tensao);
      a._vSoma += l.tensao; a._vN++;
      const f = faixaProdist(l.tensao, o.tensaoNominal);
      if (f === 'precaria') a.minTensaoPrecaria++;
      if (f === 'critica') a.minTensaoCritica++;
      if (l.tensao > LIMITE_DESARME_INVERSOR_V) a.minAcima242++;
    }
    if (l.fatorPotencia != null) { a._fpSoma += Math.abs(l.fatorPotencia); a._fpN++; }
  }

  // 2) energia: entre leituras consecutivas, repartida por tempo
  for (let i = 1; i < ls.length; i++) {
    const a = ls[i - 1], b = ls[i];
    const ta = Date.parse(a.medidoEm), tb = Date.parse(b.medidoEm), dt = tb - ta;
    if (dt <= 0) continue;
    let imp: number | null = null, exp: number | null = null;
    const contOk = a.energiaWh != null && b.energiaWh != null && b.energiaWh >= a.energiaWh
      && a.energiaDevolvidaWh != null && b.energiaDevolvidaWh != null && b.energiaDevolvidaWh >= a.energiaDevolvidaWh;
    if (contOk && dt <= gapCont) { imp = b.energiaWh! - a.energiaWh!; exp = b.energiaDevolvidaWh! - a.energiaDevolvidaWh!; }
    else if (dt <= gapInt) {
      const pm = (a.potenciaW + b.potenciaW) / 2, h = dt / 3_600_000;
      imp = Math.max(pm, 0) * h; exp = Math.max(-pm, 0) * h;
    }
    if (imp === null || exp === null) continue; // buraco: não inventa
    for (let t = ta; t < tb; ) {
      const ini = inicioJanela(t), fim = Math.min(ini + JANELA_MS, tb), frac = (fim - t) / dt;
      const j = acc(ini);
      j.importadoWh += imp * frac; j.exportadoWh += exp * frac;
      j.segundosCobertos = Math.min(900, j.segundosCobertos + Math.round((fim - t) / 1000));
      t = fim;
    }
  }

  return [...mapa.values()]
    .sort((x, y) => x.inicio.localeCompare(y.inicio))
    .map(({ _vSoma, _vN, _fpSoma, _fpN, ...j }) => ({
      ...j, tensaoMedV: _vN ? _vSoma / _vN : null, fpMedio: _fpN ? _fpSoma / _fpN : null,
    }));
}
```

- [ ] **Passo 4:** verde. **Passo 5:** commit `feat(energia): agregacao em janelas de 15 min por contadores`.

## Tarefa 6 — `resumirDia`

**Arquivos:** mesmo `agregacao.ts`, `tests/energia-resumo-dia.test.ts`.

- [ ] Teste: 96 janelas sintéticas de um dia útil (terça 08/09/2026): 00h–05h importando 250 Wh/janela
      (1 kW), 07h–15h exportando, 18h–21h importando 400 Wh/janela. Esperado: `baseNoturnaW ≈ 1000`,
      `impPontaKwh = 12 × 0,4 = 4,8`, `demandaMaxW = 1600`, `coberturaPct = 100`, soma dos postos = importado.
      Segundo teste: janela sem cobertura → `coberturaPct < 100`. Terceiro: sábado → ponta = 0.
- [ ] Implementação (assinatura):

```ts
export interface ResumoDia {
  dia: string; importadoKwh: number; exportadoKwh: number;
  impPontaKwh: number; impIntermediarioKwh: number; impForaPontaKwh: number;
  demandaMaxW: number | null; demandaMaxInicio: string | null; baseNoturnaW: number | null;
  tensaoMinV: number | null; tensaoMaxV: number | null; minPrecaria: number; minCritica: number;
  coberturaPct: number;
}
/** Só janelas cujo diaBrt(inicio) === dia. Demanda = maior (imp − exp) × 4 positiva.
 *  Base noturna = mediana de (imp − exp) × 4 das janelas 00:00–04:45 BRT com ≥ 600 s cobertos. */
export function resumirDia(dia: string, janelas: Janela15[], ponta?: HorarioPonta): ResumoDia
```

- [ ] Verde → commit `feat(energia): resumo diario (postos, demanda, base noturna, tensao)`.

## Tarefa 7 — `balancoEnergia`

**Arquivos:** `src/modules/energia/balanco.ts`, `tests/energia-balanco.test.ts`.

- [ ] Testes:

```ts
import { balancoEnergia } from '../src/modules/energia/balanco.js';
it('casa do piloto (geração ilustrativa 27 kWh)', () => {
  const b = balancoEnergia({ geradoKwh: 27, importadoKwh: 21, exportadoKwh: 14.5 });
  expect(b.consumoKwh).toBeCloseTo(33.5);
  expect(b.autoconsumoPct).toBeCloseTo(46.3, 1);      // (27 − 14,5) / 27
  expect(b.autossuficienciaPct).toBeCloseTo(37.3, 1); // (27 − 14,5) / 33,5
  expect(b.aviso).toBeNull();
});
it('sem geração: só o que o medidor sabe', () => {
  const b = balancoEnergia({ geradoKwh: null, importadoKwh: 21, exportadoKwh: 14.5 });
  expect(b.consumoKwh).toBeNull(); expect(b.autoconsumoPct).toBeNull();
  expect(b.aviso).toBe('sem_geracao');
});
it('gerou menos do que devolveu → conferir cadastro, não calcula', () => {
  expect(balancoEnergia({ geradoKwh: 5, importadoKwh: 3, exportadoKwh: 9 }).aviso).toBe('conferir_cadastro');
});
```

- [ ] Implementação:

```ts
export interface Balanco {
  geradoKwh: number | null; importadoKwh: number; exportadoKwh: number;
  consumoKwh: number | null; autoconsumoPct: number | null; autossuficienciaPct: number | null;
  aviso: 'sem_geracao' | 'conferir_cadastro' | null;
}
export function balancoEnergia(e: { geradoKwh: number | null; importadoKwh: number; exportadoKwh: number }): Balanco {
  const base = { geradoKwh: e.geradoKwh, importadoKwh: e.importadoKwh, exportadoKwh: e.exportadoKwh };
  if (e.geradoKwh == null) return { ...base, consumoKwh: null, autoconsumoPct: null, autossuficienciaPct: null, aviso: 'sem_geracao' };
  if (e.geradoKwh < e.exportadoKwh) return { ...base, consumoKwh: null, autoconsumoPct: null, autossuficienciaPct: null, aviso: 'conferir_cadastro' };
  const usadoNaHora = e.geradoKwh - e.exportadoKwh;
  const consumo = e.geradoKwh + e.importadoKwh - e.exportadoKwh;
  return { ...base, consumoKwh: consumo,
    autoconsumoPct: e.geradoKwh > 0 ? (usadoNaHora / e.geradoKwh) * 100 : null,
    autossuficienciaPct: consumo > 0 ? (usadoNaHora / consumo) * 100 : null, aviso: null };
}
```

- [ ] Commit `feat(energia): balanco gerado x comprado x devolvido x consumido`.

## Tarefa 8 — `conciliarComDemonstrativo`

**Arquivos:** `src/modules/energia/conciliacao.ts`, `tests/energia-conciliacao.test.ts`.

- [ ] Testes: (a) exportado 430 × injetado 435 → `bate` (dif 1,1%); (b) importado 630 × consumo 700 →
      `atencao` (10%); (c) 630 × 800 → `diverge`; (d) cobertura 80% → `sem_dado` com motivo;
      (e) demonstrativo com `injetado_kwh` nulo → linha `sem_dado`; (f) diferença pequena em kWh
      mas grande em % (8 × 12 kWh) → `bate` pela regra `max(5%, 10 kWh)`.
- [ ] Implementação:

```ts
export type Veredito = 'bate' | 'atencao' | 'diverge' | 'sem_dado';
export interface LinhaConciliacao { grandeza: 'injetado' | 'consumo'; medidoKwh: number | null; distribuidoraKwh: number | null; difPct: number | null; veredito: Veredito; texto: string }
export function conciliarComDemonstrativo(e: {
  referencia: string;                 // YYYY-MM-01
  exportadoMesKwh: number; importadoMesKwh: number; coberturaMesPct: number;
  demonstrativo: { injetado_kwh: number | null; consumo_kwh: number | null } | null;
}): LinhaConciliacao[] {
  // cobertura < 90% ou sem demonstrativo → sem_dado (com texto dizendo por quê)
  // |dif| ≤ max(5% da distribuidora, 10 kWh) → bate; ≤ 15% → atencao; senão diverge
  // texto sempre lembra: "o ciclo de leitura da Neoenergia não é o mês civil"
}
```

- [ ] Commit `feat(energia): conciliacao mensal com demonstrativo GD`.

## Tarefa 9 — Credenciais e token do medidor

**Arquivos:** `src/modules/energia/credenciais.ts`, `tests/energia-credenciais.test.ts`.

- [ ] Testes: cifrar → decifrar devolve `{server_uri, auth_key}`; texto cifrado não contém a chave;
      chave de env inválida lança; `novoTokenMedidor()` tem ≥ 32 bytes base64url; `hashToken` é
      determinístico; `tokenConfere(token, hash)` usa comparação em tempo constante e recusa vazio;
      `mascarar('abcd1234')` → `'••••1234'`; `normalizarServerUri('shelly-77-eu.shelly.cloud/')` →
      `'https://shelly-77-eu.shelly.cloud'` e recusa host fora de `*.shelly.cloud` (evita SSRF pelo formulário).
- [ ] Implementação — **reusa** `cifrar/decifrar` de `../financeiro/fiscal/crypto-cert.js`:

```ts
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cifrar, decifrar } from '../financeiro/fiscal/crypto-cert.js';

export interface CredShelly { server_uri: string; auth_key: string }
export const cifrarCred = (c: CredShelly, keyHex: string) => cifrar(Buffer.from(JSON.stringify(c), 'utf8'), keyHex);
export const decifrarCred = (s: string, keyHex: string): CredShelly => JSON.parse(decifrar(s, keyHex).toString('utf8'));
export const novoTokenMedidor = () => randomBytes(32).toString('base64url');
export const hashToken = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
export function tokenConfere(token: string, hash: string): boolean {
  if (!token || !hash) return false;
  const a = Buffer.from(hashToken(token), 'hex'), b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
export function normalizarServerUri(s: string): string | null {
  const host = s.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.shelly\.cloud$/.test(host) ? `https://${host}` : null;
}
export const mascarar = (s: string) => `••••${s.slice(-4)}`;
```

  Nota: a mensagem de erro de `crypto-cert.ts` cita `FISCAL_CERT_KEY`; aceitável (a validação é a
  mesma). Se incomodar, trocar a mensagem por genérica num PR à parte (raia financeiro — avisar).
- [ ] Commit `feat(energia): credencial cifrada e token por medidor`.

## Tarefa 10 — Adapter Shelly Cloud (parse + cliente com fila)

**Arquivos:** `src/modules/energia/types.ts`, `src/modules/energia/adapters/shelly-cloud.ts`,
`src/modules/energia/medidor-registry.ts`, `tests/energia-shelly-cloud.test.ts`.

- [ ] **Passo 0 (Junior, fora do chat):** capturar um status real do piloto para fixture.
      No terminal dele: `curl -s -X POST "https://<server_uri>/v2/devices/api/get?auth_key=$SHELLY_KEY" -H "Content-Type: application/json" -d '{"ids":["<device_id>"],"select":["status"]}' > status-piloto.json`
      (chave em variável de ambiente, **nunca colada no chat**), depois anonimizar (`id`, `mac`, `ip`)
      e salvar como `tests/fixtures/shelly-cloud-status-triphase.json`. Até lá, fixture montada a
      partir da documentação (campos §2.3 da spec) marcada `// TODO: trocar pela captura real`.
- [ ] **Passo 1: testes**

```ts
import { parseStatusShelly, criarClienteShellyCloud } from '../src/modules/energia/adapters/shelly-cloud.js';

const TRI = { 'em:0': { c_voltage: 227.6, c_current: 6.72, c_act_power: 1392, c_aprt_power: 1530.4, c_pf: 0.91 },
              'emdata:0': { c_total_act_energy: 7620, c_total_act_ret_energy: 120 } };
const MONO = { 'em1:2': { voltage: 227.6, current: 6.72, act_power: 1392, aprt_power: 1530.4, pf: 0.91 },
               'em1data:2': { total_act_energy: 7620, total_act_ret_energy: 120 } };

it('trifásico, fase C', () => {
  expect(parseStatusShelly(TRI, 'triphase', 2)).toEqual({ tensao: 227.6, corrente: 6.72, potenciaW: 1392,
    potenciaVa: 1530.4, fatorPotencia: 0.91, energiaWh: 7620, energiaDevolvidaWh: 120 });
});
it('monofásico, canal 2', () => expect(parseStatusShelly(MONO, 'monophase', 2)!.potenciaW).toBe(1392));
it('componente ausente = null (nunca morre calado)', () => expect(parseStatusShelly({}, 'triphase', 2)).toBeNull());

it('cliente respeita 1 req/s por chave e lotes de 10', async () => {
  const chamadas: number[] = []; let agora = 0;
  const fetchFalso = async (_url: string, init: any) => { chamadas.push(agora); const ids = JSON.parse(init.body).ids;
    return new Response(JSON.stringify(ids.map((id: string) => ({ id, online: 1, status: TRI }))), { status: 200 }); };
  const c = criarClienteShellyCloud({ fetch: fetchFalso as any, agora: () => agora, dormir: async (ms) => { agora += ms; } });
  const ids = Array.from({ length: 23 }, (_, i) => `dev${i}`);
  const r = await c.buscarStatus({ server_uri: 'https://x.shelly.cloud', auth_key: 'k' }, ids);
  expect(r.ok && r.devices).toHaveLength(23);
  expect(chamadas).toHaveLength(3);                       // 10 + 10 + 3
  expect(chamadas[1] - chamadas[0]).toBeGreaterThanOrEqual(1100);
});
it('401 / erro de auth vira invalidCredentials', async () => { /* Response 401 → { ok:false, invalidCredentials:true } */ });
it('{error: ...} vira ok:false com a mensagem, sem vazar auth_key no reason', async () => { /* ... */ });
it('online: 0 → devolve o device com online=false e leitura null', async () => { /* ... */ });
```

- [ ] **Passo 3: implementação** (esqueleto):

```ts
// src/modules/energia/types.ts
export type FabricanteMedidor = 'shelly';
export interface LeituraMedidor { tensao: number | null; corrente: number | null; potenciaW: number; potenciaVa: number | null;
  fatorPotencia: number | null; energiaWh: number | null; energiaDevolvidaWh: number | null }
export type StatusResult =
  | { ok: true; devices: Array<{ id: string; online: boolean; modelo: string | null; status: Record<string, unknown> | null }> }
  | { ok: false; reason: string; invalidCredentials?: boolean };
/** Irmão de MonitoringAdapter (monitoring/types.ts) — lê QUADRO, não inversor. */
export interface MedidorAdapter {
  fabricante: FabricanteMedidor;
  buscarStatus(cred: Record<string, unknown>, ids: string[]): Promise<StatusResult>;
  lerCanal(status: Record<string, unknown>, perfil: 'triphase' | 'monophase', canal: number): LeituraMedidor | null;
  // G4: comutar?(cred, id, canal, ligar, toggleAfterS?): Promise<{ ok: boolean; reason?: string }>;
}

// src/modules/energia/adapters/shelly-cloud.ts
const FASE = ['a', 'b', 'c'];
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export function parseStatusShelly(st: Record<string, any>, perfil: 'triphase' | 'monophase', canal: number) {
  if (perfil === 'triphase') {
    const em = st['em:0'], ed = st['emdata:0'], f = FASE[canal];
    if (!em || !f || n(em[`${f}_act_power`]) === null) return null;
    return { tensao: n(em[`${f}_voltage`]), corrente: n(em[`${f}_current`]), potenciaW: em[`${f}_act_power`],
      potenciaVa: n(em[`${f}_aprt_power`]), fatorPotencia: n(em[`${f}_pf`]),
      energiaWh: n(ed?.[`${f}_total_act_energy`]), energiaDevolvidaWh: n(ed?.[`${f}_total_act_ret_energy`]) };
  }
  const em = st[`em1:${canal}`], ed = st[`em1data:${canal}`];
  if (!em || n(em.act_power) === null) return null;
  return { tensao: n(em.voltage), corrente: n(em.current), potenciaW: em.act_power, potenciaVa: n(em.aprt_power),
    fatorPotencia: n(em.pf), energiaWh: n(ed?.total_act_energy), energiaDevolvidaWh: n(ed?.total_act_ret_energy) };
}

export interface DepsCliente { fetch: typeof fetch; agora: () => number; dormir: (ms: number) => Promise<void> }
const ESPACO_MS = 1100;     // doc: "one per second"
const LOTE = 10;            // doc: "up to 10 devices"
export function criarClienteShellyCloud(d: DepsCliente) {
  const ultimaPorChave = new Map<string, number>();
  async function vez(chave: string) {
    const ult = ultimaPorChave.get(chave);
    if (ult !== undefined) { const falta = ult + ESPACO_MS - d.agora(); if (falta > 0) await d.dormir(falta); }
    ultimaPorChave.set(chave, d.agora());
  }
  return {
    async buscarStatus(cred: { server_uri: string; auth_key: string }, ids: string[]): Promise<StatusResult> {
      const devices: Array<{ id: string; online: boolean; modelo: string | null; status: any }> = [];
      for (let i = 0; i < ids.length; i += LOTE) {
        await vez(cred.auth_key);
        const url = `${cred.server_uri}/v2/devices/api/get?auth_key=${encodeURIComponent(cred.auth_key)}`;
        const r = await d.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: ids.slice(i, i + LOTE), select: ['status'] }) });
        if (r.status === 401 || r.status === 403) return { ok: false, reason: `nuvem Shelly recusou a chave (${r.status})`, invalidCredentials: true };
        const corpo: any = await r.json().catch(() => null);
        if (!r.ok || !Array.isArray(corpo)) return { ok: false, reason: `nuvem Shelly: ${corpo?.error ?? r.status}` };
        for (const x of corpo) devices.push({ id: String(x.id), online: x.online === 1 || x.online === true, modelo: x.code ?? null, status: x.status ?? null });
      }
      return { ok: true, devices };
    },
  };
}
```

  Usar `fetchWithTimeout` de `monitoring/util/fetch-with-timeout.ts` como `fetch` real (conferir a
  assinatura); nunca logar a URL (tem `auth_key`). Fallback v1 `/device/status` fica para quando
  a v2 falhar em produção (R7) — não implementar sem necessidade.
- [ ] `medidor-registry.ts`: `getMedidorAdapter(f)` / `fabricantesSuportados()` no mesmo formato do `adapter-registry.ts`.
- [ ] Commit `feat(energia): adapter Shelly Cloud (status, fila 1 req/s, lote 10)`.

## Tarefa 11 — Recebimento multi-tenant (token por medidor)

**Arquivos:** alterar `src/modules/medicao/shelly-medicao.ts`, `src/modules/supabase.ts`,
`src/index.ts` (só o bloco do `/webhooks/shelly`); estender `tests/shelly-medicao.test.ts`.

- [ ] **Testes novos (falham):**

```ts
const MEDIDOR = { medidorId: 'm1', companyId: 'empresa-B', leadId: 'l1', deviceId: '007007422d90' };
it('token do medidor grava com a empresa DO MEDIDOR', async () => {
  const salvar = vi.fn(async () => true);
  const r = await receberLeituraShelly({ salvar, tokenEsperado: '', resolverToken: async (t) => (t === 'tok-B' ? MEDIDOR : null) }, LEITURA, 'tok-B');
  expect(r.aceito).toBe(true);
  expect(salvar).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'empresa-B', medidorId: 'm1', leadId: 'l1' }));
});
it('token de um medidor não grava leitura de OUTRO aparelho', async () => {
  const r = await receberLeituraShelly({ salvar: vi.fn(), tokenEsperado: '', resolverToken: async () => MEDIDOR }, { ...LEITURA, device_id: 'outro' }, 'tok-B');
  expect(r).toMatchObject({ aceito: false, motivo: 'leitura_invalida' });
});
it('token legado continua valendo (piloto), sem empresa carimbada → padrão EcoSun', async () => { /* comportamento de hoje */ });
it('sem resolver e sem token no servidor → recusa tudo (como hoje)', async () => { /* ... */ });
```

- [ ] **Implementação:** `RecebimentoDeps` ganha `resolverToken?: (token: string) => Promise<{ medidorId: string; companyId: string; leadId: string | null; deviceId: string } | null>`.
      Ordem: 1) `resolverToken(token)` → se achou, cada item do lote precisa ter `deviceId === medidor.deviceId`
      (senão conta como inválida) e `salvar({ ...leitura, companyId, leadId, medidorId })`;
      2) senão, token legado (`tokenEsperado`) → comportamento atual + `console.warn('[energia] token legado device=…')`;
      3) senão 401. Recusa geral só quando **nem** resolver **nem** token legado existem.
- [ ] `SupabaseService.salvarMedicaoShelly` aceita `medidorId` (grava `medidor_id`) e ganha
      `resolverMedidorPorToken(token)`: `select id, company_id, lead_id, device_id from medidores_energia where token_ingest_hash = hashToken(token) and ativo` (service role — é rota pública sem sessão; o hash é a chave).
      Também atualiza `ultima_leitura_em` do medidor (1 update por lote, não por leitura).
- [ ] `src/index.ts` (bloco `app.post('/webhooks/shelly'…)`): passar `resolverToken: (t) => supabase.resolverMedidorPorToken(t)`.
- [ ] Rodar `npx vitest run tests/shelly-medicao.test.ts` (todos os antigos continuam verdes) → commit
      `feat(energia): webhook do Shelly resolve empresa pelo token do medidor`.

## Tarefa 12 — Repo + serviço (agregar, fechar dia, nuvem, reter)

**Arquivos:** `src/modules/energia/energia-repo.ts`, `src/modules/energia/energia-service.ts`, `tests/energia-service.test.ts`.

- [ ] Repo com **interface** (para testar o serviço com repo falso, padrão `DetectarMedidorDb`):

```ts
export interface EnergiaDb {
  medidoresAtivos(): Promise<MedidorRow[]>;                                  // todos (cron, service role), com company_id
  brutoDesde(medidorId: string, desdeIso: string, ateIso: string): Promise<LeituraBruta[]>; // paginado (teto 1000/pg)
  ultimaJanela(medidorId: string): Promise<string | null>;
  gravarJanelas(m: MedidorRow, js: Janela15[], fonte: 'push' | 'nuvem' | 'backfill'): Promise<void>; // upsert PK, carimba m.company_id
  janelasDoDia(medidorId: string, dia: string): Promise<Janela15[]>;
  geracaoDoDia(sistemaId: string, dia: string): Promise<number | null>;     // geracao_diaria
  gravarDia(m: MedidorRow, r: ResumoDia & { geracaoKwh: number | null; consumoKwh: number | null }): Promise<void>;
  gravarLeituraSintetica(m: MedidorRow, l: LeituraMedidor, ts: string): Promise<void>; // modo nuvem → medicoes_shelly
  atualizarStatus(id: string, p: Partial<Pick<MedidorRow, 'status' | 'status_desde' | 'ultimo_erro' | 'ultima_leitura_em'>>): Promise<void>;
  apagarBrutoAntesDe(iso: string): Promise<number>;                         // só onde energia_15min cobre
}
```

- [ ] Serviço — testes com repo falso: `agregar(agora)` pede bruto desde `ultimaJanela − 15 min`,
      grava janelas e **não** regrava janela ainda aberta (inicio + 15 min > agora); `fecharDia('2026-09-08')`
      junta geração (via `sistema_id`) e calcula `consumoKwh` com `balancoEnergia`; medidor sem usina →
      `geracaoKwh = null`; `coletarNuvem()` agrupa medidores por chave (decifra 1×), 1 chamada por lote,
      `invalidCredentials` → status `credencial_invalida` (e não tenta de novo até editar);
      exceção num medidor não derruba os outros; logs sem valores de consumo.
- [ ] Commit `feat(energia): servico de agregacao, fechamento diario e coleta pela nuvem`.

## Tarefa 13 — Vigia de silêncio

**Arquivos:** `src/modules/energia/vigia.ts`, `tests/energia-vigia.test.ts`, uso no serviço.

- [ ] Função pura:

```ts
export const MUDO_APOS_MIN = { push: 30, nuvem: 45, push_nuvem: 30 } as const;
export function proximoStatus(m: { status: string; modo_coleta: keyof typeof MUDO_APOS_MIN; ultima_leitura_em: string | null; ativo: boolean }, agora: Date):
  { status: 'aguardando' | 'ok' | 'mudo' | 'erro' | 'credencial_invalida'; mudou: boolean } {
  // credencial_invalida e erro só saem por ação humana/edição → mantém
  // sem nenhuma leitura ainda → aguardando
  // leitura há ≤ limite → ok; há > limite → mudo
}
```

- [ ] Testes: aguardando → ok na 1ª leitura; ok → mudo após 31 min (push) / 46 min (nuvem);
      mudo → ok; credencial_invalida não muda sozinha; inativo não vigia.
- [ ] No serviço: `vigiar(agora, avisar)` — `avisar(texto)` injetado; 1 mensagem por **transição**
      (`mudou === true`), texto: `🔌 Medidor "<apelido>" sem dado desde <hh:mm> (<N> min). Confira o Wi-Fi/energia do quadro.`
      Só dentro de `dentroDaJanela` (reuso de `monitoring/proactive-alerts/janela.ts`); fora dela, deixa para o próximo ciclo (não marca como avisado).
      Precisa de coluna para "já avisei"? Não: o `status` já é o estado; a transição é o gatilho, e a
      mensagem sai no ciclo em que a transição acontece **dentro** da janela (fora dela, o status só
      é gravado quando a janela abre — documentar no código).
- [ ] Commit `feat(energia): vigia de silencio do medidor`.

## Tarefa 14 — Crons no `index.ts`

- [ ] Logo depois do bloco "Telemetria — retenção" (~l. 10962), no mesmo estilo (`setInterval` + `setTimeout` inicial + `console.log` de start, try/catch com `[energia]`):
  - `agregarEnergia` a cada 15 min (início 4 min após o boot) → `energiaService.agregar(new Date())` + `vigiar`;
  - `coletarNuvemShelly` a cada 15 min (início 5 min) — só se `ENERGIA_CRED_KEY` existir; senão log único `[energia] ENERGIA_CRED_KEY ausente — coleta pela nuvem desligada`;
  - `fecharDiaEnergia` de hora em hora, age só às 00h–01h BRT (ontem e anteontem);
  - `reterEnergia` 1×/dia: bruto > 90 dias, 15 min > 25 meses.
  - `avisar` = `sendAdminWithButtons(adminPhone, texto, [])` já usado pelo dispatcher (mesma instância).
- [ ] Sem teste unitário do `index.ts` (padrão da casa); o serviço já está testado. `npx tsc --noEmit`.
- [ ] Commit `feat(energia): crons de agregacao, nuvem, fechamento e retencao`.

## Tarefa 15 — Rotas + telas (cadastro e Energia da casa)

**Arquivos:** `src/modules/dashboard/energia-rotas.ts`, `src/modules/dashboard/energia-views.ts`,
`tests/energia-rotas.test.ts`, `tests/energia-views.test.ts`; `router.ts` (montagem).

- [ ] Rotas (todas `bancoDoOperador(req, supabase)` + `.eq('company_id', req.dashUser.companyId)` explícito).
      **Portão (decisão do dono, 28/09):** o Command Center abriu pra tenants com isolamento estrito;
      a Energia fica travada **só pelo módulo contratado `medicao`** (`MODULO_DA_ROTA '/energia'`,
      trava central do router) — **sem** flag `ENERGIA_ABERTO_A_TENANTS`. Tenant sem o módulo
      `medicao` vê a vitrine da Energia no lugar das telas; tenant com o módulo vê só os medidores
      da empresa dele, e o aviso do vigia vai só pro admin dele (`energia/aviso-medidor.ts`):
  - `GET  /energia` — lista de medidores (status com `pilulaStatus`, última leitura, cliente, usina) — `exigir('usinas','visualizar')`
  - `GET  /energia/medidores/novo` e `POST /energia/medidores` — cadastro — `exigir('usinas','editar')`
  - `POST /energia/medidores/:id/testar` — chama `buscarStatus` com a credencial **do formulário ou a gravada**; devolve online/modelo/perfil detectado; nunca ecoa a chave
  - `GET  /energia/:id` — Energia da casa (`?de=&ate=`, padrão mês corrente)
  - `POST /energia/medidores/:id/token` — gera token novo (invalida o anterior), mostra 1 vez
- [ ] Testes de rota (req/res falsos, padrão dos testes do Command Center): usuário de outra empresa → 404 (não 403, não vaza existência);
      `POST` sem `ENERGIA_CRED_KEY` com modo nuvem → erro amigável, nada gravado; `server_uri` fora de `*.shelly.cloud` → recusado;
      resposta do cadastro contém o token claro **uma vez** e o banco só o hash; nenhum HTML contém `auth_key`.
- [ ] Views só com `ui/componentes.ts`: `cabecalhoPagina` (trilha "Usinas › Energia › <apelido>"), `faixaKpis`
      (Gerado, Comprado, Devolvido, Consumido, Autoconsumo %, Autossuficiência %; `SEM_DADO` quando null),
      `cartaoSecao` para gráfico diário, curva do dia (reusa `escalaDoGrafico` de `medicao-views.ts`),
      "Conferência com a Neoenergia" (`tabela` com as linhas de `conciliarComDemonstrativo` + `pilulaStatus`),
      "Saúde do medidor"; `estadoVazio` "Em construção" para o que não tem dado. `escapeHtml` em todo texto de dado.
      Teste de view: dado com `<script>` sai escapado; `balanco.aviso = 'sem_geracao'` mostra a frase de orientação.
- [ ] `router.ts`: importar e montar (≤ 6 linhas, perto do `/medicao`). Rodar `tests/tenant-rota-guard.test.ts`.
- [ ] Menu: **não** mexer na casca nova agora; link "Energia" dentro da aba `/medicao` e na tela da usina
      (`/monitoramento/:id`) até a decisão D5.
- [ ] Commit `feat(energia): cadastro do medidor e tela Energia da casa`.

## Tarefa 16 — Documentação do kit + piloto

- [ ] `docs/kit-medicao/README.md`: seção "Token por medidor" (cadastrar na plataforma → copiar o token
      mostrado → colar na linha `var TOKEN = "…";`), checklist (Executar na inicialização, 2,4 GHz,
      aferição > 2 A) e "modo nuvem" (onde pegar *Authorization cloud key* e *server URI* no app; **colar só no formulário**).
- [ ] Piloto (Junior): gerar token do "Medidor Quadro", trocar no script (isso também resolve a pendência
      "trocar o token que passou pelo chat"), confirmar leituras com `medidor_id` preenchido; depois remover `SHELLY_INGEST_TOKEN` do EasyPanel.
- [ ] Commit `docs(kit-medicao): token por medidor e modo nuvem`.

## Tarefa 17 — Verificação final da G1

- [ ] `npx tsc --noEmit` limpo; `npx vitest run` verde (menos as 2 conhecidas).
- [ ] Code review do diff (regra "Review 3×"): tenant (toda query com `company_id`), segredos (nenhum log com chave/token/consumo), escape HTML.
- [ ] Junior aplica EN1 e EN2 no SQL Editor **antes** do deploy; push da branch; PR com o comando de merge pronto (**pedir antes de push**).
- [ ] Após Implantar: 7 dias de `energia_diaria` do piloto vs análise de 28/09 (import ≈ 21, export ≈ 14,5 kWh/dia; 76% fora-ponta; base 0,8–1,2 kW) — diferença ≤ 3%.
- [ ] Conciliação: primeiro mês com demonstrativo + ≥ 97% de cobertura mostra veredito coerente.

### Revisão 2 (28/09) — o que o código resolve sozinho no deploy

- **Bruto órfão** (gravado pelo código antigo entre aplicar a 136 e o Implantar, sem `medidor_id`):
  a cada ciclo de agregação o servidor liga o bruto órfão do aparelho ao medidor
  (`vincularBrutoOrfao`: mesma empresa, device com/sem prefixo, lote de 1.000 (teto do PostgREST), `is null` → idempotente,
  índice parcial `medicoes_shelly_orfas`) e volta o cursor até o órfão mais velho. Lote cheio → não
  agrega aquele medidor no ciclo (o cursor não passa por cima). Ninguém precisa rodar SQL de conserto.
- **Backfill**: `ultimaJanela` ignora `fonte='backfill'` (o cursor não pula bruto). A madrugada refaz,
  além dos 7 dias, todo dia cuja janela de 15 min mudou depois do fechamento
  (`max(energia_15min.atualizado_em) > energia_diaria.fechado_em`, janelas mexidas nos últimos 7 dias,
  até 62 dias por medidor por noite). À mão: `scripts/energia-refazer-dias.ts --refazer-de/--refazer-ate`.
- **Retenção** anda em TODOS os medidores (desligado perde o bruto aos 90 dias sem esperar janela) e
  apaga o bruto órfão (`medidor_id is null`) de mais de 90 dias, em lote.
- `medicoes_shelly.medidor_id` com FK composta `(medidor_id, company_id)` → `medidores_energia` (cascata).
- Webhook: se o `SHELLY_INGEST_TOKEN` tiver o formato do token do medidor e o banco cair, o token global
  ainda vale pelo caminho legado (não 503).
- Trocar o aparelho de medidor que já recebeu dado: bloqueado ("Para trocar o aparelho, cadastre um medidor novo").
- `SHELLY_LEGADO_DEVICES`: **somente aparelhos da EcoSun** (o token global grava na EcoSun).

### Passos de deploy (atualizados na revisão 2, 28/09)

1. **Antes do merge/Implantar**, o Junior roda no SQL Editor (produção) o arquivo do Desktop
   `SQL-migrations-136-137-gestao-energia.sql` (136 + 137, idempotente; confere no fim).
2. **Conferir quem ainda manda pelo token global** (rodar em produção, só leitura):
   ```sql
   select lower(regexp_replace(device_id, '^shelly[a-z0-9]*-', '', 'i')) as aparelho,
          count(*) as leituras_7_dias, max(medido_em) as ultima
     from medicoes_shelly
    where medido_em > now() - interval '7 days'
    group by 1 order by 3 desc;
   ```
   Se aparecer outro aparelho **da EcoSun** além de `007007422d90` que ainda usa o `SHELLY_INGEST_TOKEN`,
   pôr no EasyPanel `SHELLY_LEGADO_DEVICES=007007422d90,<outro>` (ids sem o prefixo, por vírgula).
   Somente aparelhos da EcoSun (o token global grava na EcoSun). Sem a env, só o piloto passa
   pelo token global (o resto recebe 401). `teste-diagnostico` é lixo de teste: apagar (linha
   comentada no fim do SQL do Desktop).
3. Envs no EasyPanel: `ENERGIA_CRED_KEY` (64 hex; sem ela a nuvem fica desligada e o push segue),
   `SHELLY_INGEST_TOKEN` (só enquanto o piloto não trocar o script), `SHELLY_LEGADO_DEVICES` (opcional).
4. Push da branch (pedir antes), PR com o comando de merge pronto, **Implantar**.
5. Depois: gerar o código do "Medidor Quadro", trocar no script do piloto (cabeçalho `x-shelly-token`),
   confirmar leituras com `medidor_id`; então tirar `SHELLY_INGEST_TOKEN` do EasyPanel.
   (O bruto que chegou entre o SQL e o Implantar é ligado sozinho no 1º ciclo — nada a fazer.)
5b. Backfill (opcional, só DEPOIS do Implantar): gerar o `.sql` com `scripts/energia-backfill-emdata.ts`
   e colar no SQL Editor. O resumo de cada dia é refeito na madrugada seguinte (até 62 dias por noite).
6. Opcional (segurança): testar o script do piloto **sem** a linha `ssl_ca: "*"` (confere o certificado
   do servidor); se ficar pendurado, voltar a linha (ver README do kit).
7. Webhook responde 401 (código errado), 410 (medidor desligado), 429 (> 120/min por IP),
   503 (banco fora — o aparelho tenta de novo no minuto seguinte).

---

## G2–G5 — esboço de tarefas (detalhar em planos próprios quando a G1 estiver no ar)

**G2 — Diagnóstico + PDF**
1. `energia/diagnostico/base-noturna.ts`, `postos.ts`, `demanda.ts`, `tensao.ts` (médias de 10 min, DRP/DRC por semana de 1.008 leituras), `desequilibrio.ts`, `fator-potencia.ts` — cada um puro, `{achado, gravidade, texto, numeros}`, teste com a fixture do piloto reproduzindo os achados da spec.
2. `energia/bateria-vale.ts` — GD I/GD II/misto, reusa `percentualFioBVigente`, `tusdFioBPorConcessionaria`, `tarifaPorConcessionaria`.
3. `energia/analise-html.ts` + `analise-pdf.ts` (padrão `gd/relatorio-html.ts` + `gerarRelatorioPdf` com nº de páginas parametrizado — propor `paginasEsperadas` opcional no `gerarRelatorioPdf`, padrão 2, sem quebrar o GD), texto de limitações fixo, assinatura RT da empresa.
4. Rota `GET /energia/:id/analise.pdf`; botão; (depois) envio pela Eva reusando `gd/relatorio-envio*.ts`.

**G3 — Alertas** (migration EN-3)
1. Dispatcher com ramo "alerta de medidor" **antes** da EN-3 (teste: `sistema_id` nulo não quebra `getSistemaById`).
2. EN-3; `AlertTipo` += `energia_*`; `energia/alertas-regras.ts` puro; passo `detectarEnergia` no `ProactiveAlertService`; dedupe pelo índice novo.
3. Modelos Meta aprovados (D6) e textos em `format.ts`.

**G4 — Controle** (migration EN-4)
1. `energia/anti-ciclo.ts` (`podeComutar`) — puro, testes de 5 min ligado/desligado e 6 comutações/h.
2. `MedidorAdapter.comutar` via `/v2/devices/api/set/switch` + confirmação por `get`; `toggle_after` para desligamentos temporários.
3. Agendas + regra "sobrou solar"; auditoria `comandos_carga`; permissão `energia:controlar`.

**G5 — Simuladores** (migration EN-5 `tarifas_posto`)
1. `simular-tarifa-branca.ts` (com e sem GD — conferir compensação por posto na REN antes de liberar).
2. `simular-bateria.ts` (generaliza `bateriaVale`).
3. `simular-ampliacao.ts` — instalada = min(CC, CA); só o acréscimo vira GD II (REN 1.059 art. 655-R §1º — conferir); checa corrente por MPPT.
4. `simular-autoconsumo-remoto.ts` — mesmo titular, mesma área; GD II na usina nova.
