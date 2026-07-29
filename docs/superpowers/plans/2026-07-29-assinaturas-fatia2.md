# Assinaturas — Fatia 2 (motor automático: avisos 8d/2d, tolerância 3d, trava)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cron diário que aplica a régua do Junior em cada assinatura ativa: 8 dias antes gera o link e avisa (e-mail sempre + zap se confirmado), 2 dias antes lembra, venceu tem 3 dias de tolerância com último aviso, depois trava sozinho — com aviso ao Junior no zap quando trava.

**Architecture:** Régua como função pura (`acaoDoDia`) + motor orquestrador com dependências injetadas (`processarAssinaturas`) em `src/modules/assinaturas-motor.ts`. Scheduler no `index.ts` no padrão `checkMaintenanceDaily` (lock diário em `app_flags`, roda 1x/dia após 9h BRT). E-mail pela moldura aprovada (`montarMolduraEmail` + `EmailSender`), zap pelo `sendText`. Idempotência por aviso na tabela `assinatura_avisos` (migration 091 — combinar número no grupo).

**Tech Stack:** TypeScript ESM, Supabase, Resend, vitest.

**Spec:** `docs/superpowers/specs/2026-07-29-assinaturas-financeiro-design.md`

---

### Task 1: Migration 091 — assinatura_avisos (idempotência)

**Files:** Create `supabase/migrations/091_assinatura_avisos.sql`

- [ ] Criar a migration (company_id denormalizado + RLS + política, pra guarda passar):

```sql
-- Migration 091: assinatura_avisos — registro de cada aviso do motor de
-- mensalidades (fatia 2). UNIQUE (assinatura, tipo, ciclo) = idempotência:
-- o cron pode rodar 2x no dia que não avisa 2x. ciclo = vence_em do momento.
-- Aplicar no SQL Editor ANTES do deploy. Número 091 combinado no grupo.

CREATE TABLE IF NOT EXISTS assinatura_avisos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assinatura_id uuid NOT NULL REFERENCES assinaturas(id),
  company_id uuid REFERENCES companies(id),  -- cópia da assinatura (RLS/relatórios)
  tipo text NOT NULL CHECK (tipo IN ('aviso8', 'aviso2', 'ultimo', 'travou')),
  ciclo date NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assinatura_id, tipo, ciclo)
);

CREATE INDEX IF NOT EXISTS idx_assinatura_avisos_assinatura ON assinatura_avisos(assinatura_id);

ALTER TABLE assinatura_avisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE assinatura_avisos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON assinatura_avisos;
CREATE POLICY company_isolation ON assinatura_avisos
  AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(
      nullif(current_setting('app.company_id', true), '')::uuid,
      (auth.jwt() ->> 'company_id')::uuid)));
```

- [ ] `npx vitest run tests/migrations-tenant-guard.test.ts` → verde (tem company_id + RLS + política)
- [ ] Commit: `git add supabase/migrations/091_assinatura_avisos.sql && git commit -m "db: 091 assinatura_avisos — idempotencia dos avisos do motor"`

---

### Task 2: Régua pura `acaoDoDia` (TDD)

**Files:** Create `src/modules/assinaturas-motor.ts` · Test `tests/assinaturas-motor.test.ts`

- [ ] Teste que falha:

```ts
// tests/assinaturas-motor.test.ts
// Motor de mensalidades — régua do Junior: 8d antes avisa com link, 2d antes
// lembra, venceu tem 3 dias de tolerância com último aviso, depois trava.
import { describe, it, expect, vi } from 'vitest';
import { acaoDoDia } from '../src/modules/assinaturas-motor.js';

describe('acaoDoDia (régua 8d / 2d / venceu+3d)', () => {
  const venceEm = '2026-08-20';
  const semAvisos = new Set<string>();
  it('longe do vencimento → nada', () => {
    expect(acaoDoDia({ status: 'ativa', venceEm }, '2026-08-01', semAvisos)).toBeNull();
  });
  it('faltando 8 dias → aviso8 (gera link)', () => {
    expect(acaoDoDia({ status: 'ativa', venceEm }, '2026-08-12', semAvisos)).toBe('aviso8');
  });
  it('cron perdeu o dia 8? faltando 5 ainda manda o aviso8 (janela, não data exata)', () => {
    expect(acaoDoDia({ status: 'ativa', venceEm }, '2026-08-15', semAvisos)).toBe('aviso8');
  });
  it('aviso8 já enviado → não repete; faltando 2 dias → aviso2', () => {
    expect(acaoDoDia({ status: 'ativa', venceEm }, '2026-08-15', new Set(['aviso8']))).toBeNull();
    expect(acaoDoDia({ status: 'ativa', venceEm }, '2026-08-18', new Set(['aviso8']))).toBe('aviso2');
  });
  it('venceu (até 3 dias) → ultimo aviso, uma vez só', () => {
    expect(acaoDoDia({ status: 'ativa', venceEm }, '2026-08-21', new Set(['aviso8', 'aviso2']))).toBe('ultimo');
    expect(acaoDoDia({ status: 'ativa', venceEm }, '2026-08-23', new Set(['aviso8', 'aviso2', 'ultimo']))).toBeNull();
  });
  it('venceu + 4 dias → travar', () => {
    expect(acaoDoDia({ status: 'ativa', venceEm }, '2026-08-24', new Set(['aviso8', 'aviso2', 'ultimo']))).toBe('travar');
  });
  it('travada/cancelada → motor não mexe', () => {
    expect(acaoDoDia({ status: 'travada', venceEm }, '2026-08-24', semAvisos)).toBeNull();
    expect(acaoDoDia({ status: 'cancelada', venceEm }, '2026-08-24', semAvisos)).toBeNull();
  });
});
```

- [ ] Rodar → FAIL. Implementar:

```ts
// src/modules/assinaturas-motor.ts
// Motor automático das mensalidades (fatia 2). Régua do Junior:
// 8d antes: link + aviso · 2d antes: lembrete · venceu: 3d de tolerância com
// último aviso · depois trava (e o Junior fica sabendo no zap).
import type { StatusAssinatura } from './dashboard/assinaturas-store.js';

export type Acao = 'aviso8' | 'aviso2' | 'ultimo' | 'travar';

const DIA_MS = 86_400_000;

export function acaoDoDia(
  a: { status: StatusAssinatura; venceEm: string },
  hoje: string,
  jaEnviados: ReadonlySet<string>,
): Acao | null {
  if (a.status !== 'ativa') return null;
  const dias = Math.round((Date.parse(a.venceEm) - Date.parse(hoje)) / DIA_MS);
  // Janelas (não data exata): se o cron perder um dia, o aviso sai no seguinte.
  if (dias < -3) return 'travar';
  if (dias < 0) return jaEnviados.has('ultimo') ? null : 'ultimo';
  if (dias <= 2) return jaEnviados.has('aviso2') ? null : 'aviso2';
  if (dias <= 8) return jaEnviados.has('aviso8') ? null : 'aviso8';
  return null;
}
```

- [ ] Rodar → PASS. Commit.

---

### Task 3: Motor `processarAssinaturas` (deps injetadas, TDD)

**Files:** Modify `src/modules/assinaturas-motor.ts` · `tests/assinaturas-motor.test.ts`

- [ ] Testes que falham (mocks):

```ts
import { processarAssinaturas, type MotorDeps } from '../src/modules/assinaturas-motor.js';

function deps(over: Partial<MotorDeps> = {}): MotorDeps & { chamadas: Record<string, any[]> } {
  const chamadas: Record<string, any[]> = { link: [], email: [], zap: [], junior: [], travadas: [], avisos: [] };
  return {
    listarAtivas: async () => [],
    avisosDoCiclo: async () => new Set(),
    registrarAviso: async (id, tipo, ciclo) => { chamadas.avisos.push([id, tipo, ciclo]); },
    linkDaCobranca: async (a) => { chamadas.link.push(a.id); return 'https://checkout.infinitepay.io/x'; },
    travar: async (id) => { chamadas.travadas.push(id); },
    enviarEmail: async (to, assunto) => { chamadas.email.push([to, assunto]); },
    enviarZap: async (tel, texto) => { chamadas.zap.push([tel, texto]); },
    avisarJunior: async (texto) => { chamadas.junior.push(texto); },
    ...over,
    chamadas,
  } as any;
}

const SABION = { id: 'a1', nome: 'Sabion', email: 't@x.com', telefone: '5521999998888', zapConfirmado: true, valorCentavos: 29700, venceEm: '2026-08-20', status: 'ativa' as const, produtoNome: 'Monitoramento', produtoId: 'monitoramento', limite: 110 };

describe('processarAssinaturas', () => {
  it('aviso8: gera link, manda e-mail E zap (confirmado), registra o aviso', async () => {
    const d = deps({ listarAtivas: async () => [SABION] });
    await processarAssinaturas(d, '2026-08-12');
    expect(d.chamadas.link).toEqual(['a1']);
    expect(d.chamadas.email.length).toBe(1);
    expect(d.chamadas.zap.length).toBe(1);
    expect(d.chamadas.avisos).toEqual([['a1', 'aviso8', '2026-08-20']]);
  });
  it('zap NÃO confirmado → só e-mail', async () => {
    const d = deps({ listarAtivas: async () => [{ ...SABION, zapConfirmado: false }] });
    await processarAssinaturas(d, '2026-08-12');
    expect(d.chamadas.email.length).toBe(1);
    expect(d.chamadas.zap.length).toBe(0);
  });
  it('venceu +4d: trava, registra e avisa o Junior', async () => {
    const d = deps({ listarAtivas: async () => [SABION], avisosDoCiclo: async () => new Set(['aviso8', 'aviso2', 'ultimo']) });
    await processarAssinaturas(d, '2026-08-24');
    expect(d.chamadas.travadas).toEqual(['a1']);
    expect(d.chamadas.junior.length).toBe(1);
    expect(d.chamadas.avisos).toEqual([['a1', 'travou', '2026-08-20']]);
  });
  it('erro numa assinatura não derruba as outras', async () => {
    const d = deps({
      listarAtivas: async () => [{ ...SABION, id: 'quebra' }, SABION],
      linkDaCobranca: async (a: any) => { if (a.id === 'quebra') throw new Error('boom'); return 'https://x'; },
    });
    await processarAssinaturas(d, '2026-08-12');
    expect(d.chamadas.avisos.some((x: any[]) => x[0] === 'a1')).toBe(true);
  });
});
```

- [ ] Implementar (textos PT-BR simples; e-mail com CTA = responsabilidade do wiring, motor passa texto+link):

```ts
export interface AssinaturaMotor {
  id: string; nome: string; email: string | null; telefone: string | null;
  zapConfirmado: boolean; valorCentavos: number; venceEm: string;
  status: StatusAssinatura; produtoNome: string; produtoId: string; limite: number | null;
}

export interface MotorDeps {
  listarAtivas(): Promise<AssinaturaMotor[]>;
  avisosDoCiclo(assinaturaId: string, ciclo: string): Promise<ReadonlySet<string>>;
  registrarAviso(assinaturaId: string, tipo: Acao | 'travou', ciclo: string): Promise<void>;
  /** Devolve o link de pagamento do ciclo (reusa cobrança pendente ou cria). */
  linkDaCobranca(a: AssinaturaMotor): Promise<string | null>;
  travar(assinaturaId: string): Promise<void>;
  enviarEmail(to: string, assunto: string, corpoHtml: string, ctaUrl: string | null): Promise<void>;
  enviarZap(telefone: string, texto: string): Promise<void>;
  avisarJunior(texto: string): Promise<void>;
}

const reais = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const dataBr = (iso: string) => iso.split('-').reverse().join('/');

export function textosDoAviso(acao: Acao, a: AssinaturaMotor, link: string | null): { assunto: string; corpoHtml: string; zap: string } {
  const valor = `R$ ${reais(a.valorCentavos)}`;
  const vence = dataBr(a.venceEm);
  const pagar = link ? `\n\nPra pagar (Pix ou cartão): ${link}` : '';
  if (acao === 'aviso8') return {
    assunto: `Sua mensalidade do ${a.produtoNome} vence dia ${vence}`,
    corpoHtml: `<p>Olá, ${a.nome}!</p><p>Sua mensalidade do <b>${a.produtoNome}</b> (${valor}) vence no dia <b>${vence}</b>.</p><p>O link de pagamento já está pronto — Pix ou cartão, como preferir.</p>`,
    zap: `Olá, ${a.nome}! 😊 Sua mensalidade do ${a.produtoNome} (${valor}) vence dia ${vence}.${pagar}`,
  };
  if (acao === 'aviso2') return {
    assunto: `Faltam 2 dias: mensalidade do ${a.produtoNome} (${vence})`,
    corpoHtml: `<p>Olá, ${a.nome}!</p><p>Passando pra lembrar: sua mensalidade do <b>${a.produtoNome}</b> (${valor}) vence <b>dia ${vence}</b>.</p>`,
    zap: `Oi, ${a.nome}! Lembrete rapidinho: a mensalidade do ${a.produtoNome} (${valor}) vence dia ${vence}.${pagar}`,
  };
  return {
    assunto: `Sua mensalidade do ${a.produtoNome} venceu — evite a suspensão`,
    corpoHtml: `<p>Olá, ${a.nome}.</p><p>Sua mensalidade do <b>${a.produtoNome}</b> (${valor}) venceu no dia ${vence}. Pra não suspender o seu acesso, o pagamento pode ser feito em até 3 dias.</p><p>Se já pagou, desconsidere este aviso.</p>`,
    zap: `${a.nome}, sua mensalidade do ${a.produtoNome} (${valor}) venceu dia ${vence}. Pra não suspender o acesso, é só pagar em até 3 dias, tá?${pagar} Se já pagou, ignora esse aviso. 🙏`,
  };
}

export async function processarAssinaturas(deps: MotorDeps, hoje: string): Promise<{ avisos: number; travadas: number }> {
  const resultado = { avisos: 0, travadas: 0 };
  const ativas = await deps.listarAtivas();
  for (const a of ativas) {
    try {
      const ciclo = a.venceEm;
      const enviados = await deps.avisosDoCiclo(a.id, ciclo);
      const acao = acaoDoDia({ status: a.status, venceEm: a.venceEm }, hoje, enviados);
      if (!acao) continue;
      if (acao === 'travar') {
        await deps.travar(a.id);
        await deps.registrarAviso(a.id, 'travou', ciclo);
        await deps.avisarJunior(`⛔ Assinatura TRAVADA por falta de pagamento: ${a.nome} — ${a.produtoNome} (R$ ${reais(a.valorCentavos)}, venceu ${dataBr(a.venceEm)}). Ela destrava sozinha se pagar; pra liberar na mão use a tela Assinaturas.`);
        resultado.travadas++;
        continue;
      }
      const link = await deps.linkDaCobranca(a);
      const t = textosDoAviso(acao, a, link);
      if (a.email) await deps.enviarEmail(a.email, t.assunto, t.corpoHtml, link);
      if (a.telefone && a.zapConfirmado) await deps.enviarZap(a.telefone, t.zap);
      await deps.registrarAviso(a.id, acao, ciclo);
      resultado.avisos++;
    } catch (err) {
      console.error(`[assinaturas-motor] assinatura ${a.id} falhou:`, (err as Error).message);
    }
  }
  return resultado;
}
```

- [ ] Rodar → PASS. `npx tsc --noEmit` limpo. Commit.

---

### Task 4: Store — apoios do motor (avisos + cobrança pendente + listar ativas)

**Files:** Modify `src/modules/dashboard/assinaturas-store.ts` · `tests/assinaturas-store.test.ts`

- [ ] Testes (mock chainable, casos: registra aviso com company_id; cobrança pendente devolve link; sem pendente → null). Implementar:

```ts
/** Assinaturas ativas (o motor decide o que fazer com cada uma). */
export async function listarAtivas(client: SupabaseClient): Promise<AssinaturaRow[]> {
  const { data, error } = await client
    .from('assinaturas').select(CAMPOS).eq('status', 'ativa');
  if (error) throw new Error(`listarAtivas: ${error.message}`);
  return (data ?? []).map(paraRow);
}

export async function avisosDoCiclo(client: SupabaseClient, assinaturaId: string, ciclo: string): Promise<Set<string>> {
  const { data } = await client.from('assinatura_avisos').select('tipo')
    .eq('assinatura_id', assinaturaId).eq('ciclo', ciclo);
  return new Set((data ?? []).map((r: any) => r.tipo as string));
}

export async function registrarAviso(client: SupabaseClient, assinaturaId: string, companyId: string | null, tipo: string, ciclo: string): Promise<void> {
  const { error } = await client.from('assinatura_avisos')
    .insert({ assinatura_id: assinaturaId, company_id: companyId, tipo, ciclo });
  // conflito de UNIQUE = alguém registrou no meio — ok, idempotência funcionando
  if (error && !/duplicate|unique/i.test(error.message)) throw new Error(`registrarAviso: ${error.message}`);
}

/** Link da cobrança PENDENTE mais recente da assinatura (null se não tem). */
export async function linkPendente(client: SupabaseClient, assinaturaId: string): Promise<string | null> {
  const { data } = await client.from('cobrancas').select('link_url')
    .eq('assinatura_id', assinaturaId).eq('status', 'pendente')
    .order('criado_em', { ascending: false }).limit(1);
  const url = (data as { link_url: string | null }[] | null)?.[0]?.link_url;
  return url ?? null;
}
```

Obs: `listarAtivas`/`AssinaturaRow` não têm company_id hoje — acrescentar `companyId` ao `AssinaturaRow`, ao `CAMPOS` (`company_id`) e ao `paraRow` (necessário pro `registrarAviso`); ajustar o teste de `listarAssinaturas` pra esperar `companyId: null`.

- [ ] Rodar → PASS. Commit.

---

### Task 5: Wiring no index.ts (scheduler + deps reais)

**Files:** Modify `src/index.ts` (perto dos outros schedulers, ~linha 8990)

- [ ] Implementar no padrão `checkMaintenanceDaily` (lock diário `assinaturas_motor_last_run` em `app_flags`, após 9h BRT, checa a cada hora, primeira passada 4min pós-boot; só roda se `config.infinitepayHandle` estiver setado):

```ts
// ===== ASSINATURAS: motor de avisos/trava (fatia 2 — regua 8d/2d/+3d) =====
if (config.infinitepayHandle) {
  const rodarMotorAssinaturas = async () => {
    const now = new Date();
    const brtHour = (now.getUTCHours() - 3 + 24) % 24;
    if (brtHour < 9) return;
    const hoje = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: flag } = await supabase.getClient().from('app_flags')
      .select('value').eq('key', 'assinaturas_motor_last_run').maybeSingle();
    if (flag?.value === hoje) return;
    const { error: lockErr } = await supabase.getClient().from('app_flags')
      .upsert({ key: 'assinaturas_motor_last_run', value: hoje }, { onConflict: 'key' });
    if (lockErr) { console.warn('[assinaturas-motor] lock falhou:', lockErr.message); return; }

    const { processarAssinaturas } = await import('./modules/assinaturas-motor.js');
    const store = await import('./modules/dashboard/assinaturas-store.js');
    const { criarLinkPagamento } = await import('./modules/infinitepay.js');
    const { montarMolduraEmail } = await import('./modules/email/email-moldura.js');
    const { EmailSender } = await import('./modules/email/resend-client.js');
    const client = supabase.getClient();
    const base = (config.appBaseUrl ?? '').replace(/\/$/, '');
    const sender = process.env.RESEND_API_KEY
      ? new EmailSender(process.env.RESEND_API_KEY, process.env.EMAIL_FROM ?? '')
      : null;

    const r = await processarAssinaturas({
      listarAtivas: () => store.listarAtivas(client),
      avisosDoCiclo: (id, ciclo) => store.avisosDoCiclo(client, id, ciclo),
      registrarAviso: async (id, tipo, ciclo) => {
        const a = await store.getAssinatura(client, id);
        await store.registrarAviso(client, id, a?.companyId ?? null, tipo, ciclo);
      },
      linkDaCobranca: async (a) => {
        const existente = await store.linkPendente(client, a.id);
        if (existente) return existente;
        const descricao = `${a.produtoNome} — mensalidade (${a.nome})`;
        const cob = await supabase.criarCobranca({ companyId: null, assinaturaId: a.id, descricao, valorCentavos: a.valorCentavos });
        const link = await criarLinkPagamento({
          handle: config.infinitepayHandle!, orderNsu: cob.orderNsu,
          itens: [{ descricao, valorCentavos: a.valorCentavos }],
          redirectUrl: base ? `${base}/pago` : undefined,
          webhookUrl: base ? `${base}/webhook/infinitepay` : undefined,
          cliente: { nome: a.nome, email: a.email ?? undefined, telefone: a.telefone ?? undefined },
        });
        if (!link.ok) { console.warn('[assinaturas-motor] link falhou:', link.reason); return null; }
        await supabase.salvarLinkCobranca(cob.id, link.url);
        return link.url;
      },
      travar: (id) => store.setStatusAssinatura(client, id, 'travada'),
      enviarEmail: async (to, assunto, corpoHtml, ctaUrl) => {
        if (!sender) return;
        const html = montarMolduraEmail({
          conteudoHtml: corpoHtml, titulo: assunto,
          ctaLabel: ctaUrl ? 'Pagar agora (Pix ou cartão)' : undefined,
          ctaUrl: ctaUrl ?? undefined,
          linkDescadastro: 'https://ecosunpower.eng.br',
        });
        await sender.enviar({ to, subject: assunto, html });
      },
      enviarZap: (tel, texto) => sendText(tel, texto),
      avisarJunior: (texto) => sendText(config.engineerPhone, texto),
    }, hoje);
    if (r.avisos + r.travadas > 0) console.log(`[assinaturas-motor] ${r.avisos} avisos, ${r.travadas} travadas (${hoje})`);
  };
  setInterval(() => rodarMotorAssinaturas().catch((e) => console.error('[assinaturas-motor]', e)), 60 * 60 * 1000);
  setTimeout(() => rodarMotorAssinaturas().catch((e) => console.error('[assinaturas-motor]', e)), 4 * 60 * 1000);
  console.log('[assinaturas-motor] scheduler ligado (1x/dia apos 9h BRT, idempotente)');
}
```

Obs: conferir a assinatura real de `montarMolduraEmail` (MolduraOpts) e de `sendText` antes de fixar; ajustar campos se divergirem.

- [ ] `npx tsc --noEmit` limpo + suíte inteira verde. Commit.

---

### Task 6: Checkbox "zap confirmado" na tela (Junior confirma na mão até a Fase 2)

**Files:** Modify `src/modules/dashboard/assinaturas-views.ts` (form editar) · `router.ts` (rota editar) · `assinaturas-store.ts` (editarAssinatura ganha `zapConfirmado?: boolean`) · testes correspondentes

- [ ] No form ✏️ editar, acrescentar antes do botão Salvar:

```html
<label class="flex items-center gap-2">
  <input type="checkbox" name="zap_ok" value="1" ${a.zapConfirmado ? 'checked' : ''}> Zap confirmado (pode receber avisos)
</label>
```

- [ ] Na rota `/assinaturas/:id/editar`: `campos.zapConfirmado = b.zap_ok === '1';` (checkbox desmarcado não vem no body → false).
- [ ] No store: `if (campos.zapConfirmado !== undefined) row.zap_confirmado = campos.zapConfirmado;`
- [ ] Teste: editarAssinatura grava zap_confirmado; view contém `name="zap_ok"`.
- [ ] Rodar testes → PASS. Commit.

---

### Task 7: Verificação final

- [ ] `npx tsc --noEmit` limpo
- [ ] `npx vitest run` — suíte inteira verde
- [ ] Revisar `git diff main...HEAD`
- [ ] Push + PR **somente com ok do Junior** (lembrar: migration 091 ANTES do deploy, número combinado no grupo)
