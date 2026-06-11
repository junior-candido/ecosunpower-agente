# Caixa de Entrada Universal (Fatia 3 Financeiro) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Junior manda foto/PDF/áudio/vídeo/texto de gasto ou entrada pra Eva no WhatsApp → IA lê e classifica → Junior confirma com 1 botão → lançamento entra no financeiro com comprovante arquivado → dashboard mostra entrou × saiu × lucro.

**Architecture:** Leitor dedicado (NÃO action no system-prompt da Eva). Pipeline determinístico: handlers do `index.ts` interceptam mídia/texto de admin → `caixa-entrada.ts` orquestra → `extrator-lancamento.ts` chama IA (gate Haiku pra texto, extração Opus com fallback Haiku) → regras puras validam (`lancamentos.ts`) → pendente persiste no banco (sobrevive restart) → botões `finlan:` confirmam. Entrada avulsa PJ reusa o motor de imposto da Fatia 2 (`criarContaDeFechamento` com `fechamentoId: null` + `registrarRecebimento`). Eva classifica, SISTEMA calcula.

**Tech Stack:** TypeScript + Express, Supabase (Postgres + Storage), Anthropic SDK (Opus 4.7 / Haiku 4.5), Whisper (já existe), Vitest, Tailwind + ECharts no dashboard.

**Spec:** `docs/superpowers/specs/2026-06-11-caixa-entrada-universal-design.md`

**Regras do projeto (NÃO ESQUECER):**
- Commits frequentes, mensagens em PT-BR estilo `feat(financeiro): ...`. `git add` SEMPRE por caminho específico, NUNCA `-A` ou `.`.
- NUNCA `git push` — só o Junior autoriza.
- Rodar suite: `npx vitest run` (2 falhas pré-existentes em `supabase-vincular-novo` são alheias). Typecheck: `npx tsc --noEmit`.
- Migration 047 NÃO é aplicada pelo executor — vira arquivo na Área de Trabalho pro Junior (MCP Supabase aponta pro projeto errado).

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/047_financeiro_caixa_entrada.sql` | Criar | 2 tabelas: categorias (seed 13) + lançamentos |
| `src/modules/financeiro/lancamentos.ts` | Criar | Regras PURAS: validação, normalização, duplicado, expiração, competência |
| `src/modules/financeiro/extrator-lancamento.ts` | Criar | Prompts (puros) + parse do JSON (puro) + chamadas IA (injetadas) |
| `src/modules/financeiro/resumo-lancamento.ts` | Criar | PURO: texto do resumo + botões `finlan:` |
| `src/modules/financeiro/lancamentos-repo.ts` | Criar | I/O banco (fino, sem teste unitário — padrão Fatia 2) |
| `src/modules/financeiro/comprovantes.ts` | Criar | I/O Storage bucket `financeiro-comprovantes` |
| `src/modules/financeiro/caixa-entrada.ts` | Criar | Orquestrador: mídia admin, texto admin, botões `finlan:` |
| `src/modules/dashboard/caixa-kpis.ts` | Criar | PURO: agregação entrou/saiu/lucro/PF/pizza |
| `src/modules/dashboard/financeiro-queries.ts` | Modificar | Buscar lançamentos + KPIs novos |
| `src/modules/dashboard/financeiro-views.ts` | Modificar | KPIs Saiu/Lucro, card Mundo PF, pizza, entrou×saiu, lista com filtros |
| `src/index.ts` | Modificar | Interceptor mídia (image/document), gate texto admin, roteador `finlan:` |
| `src/build-info.ts` | Modificar | Bump `BUILD_VERSION` = `CAIXA-ENTRADA-2026-06-11` |
| `tests/financeiro-lancamentos.test.ts` etc. | Criar | Testes das peças puras |

---

### Task 1: Migration 047 + arquivo pro Junior

**Files:**
- Create: `supabase/migrations/047_financeiro_caixa_entrada.sql`
- Create: `C:\Users\Meu Computador\Desktop\migration-047-caixa-entrada.sql` (cópia, linhas curtas — lição da 046)

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/047_financeiro_caixa_entrada.sql
-- Caixa de Entrada Universal (Fatia 3) — despesas + entradas avulsas via Eva.
-- Spec: docs/superpowers/specs/2026-06-11-caixa-entrada-universal-design.md

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Categorias de lançamento (lista fixa; adicionar nova = 1 INSERT)
CREATE TABLE IF NOT EXISTS financeiro_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO financeiro_categorias (slug, nome) VALUES
  ('combustivel', 'Combustível'),
  ('material_eletrico', 'Material elétrico'),
  ('equipamento_kit', 'Equipamento/Kit'),
  ('mao_de_obra', 'Mão de obra'),
  ('alimentacao', 'Alimentação'),
  ('ferramenta', 'Ferramenta'),
  ('veiculo_manutencao', 'Veículo/Manutenção'),
  ('marketing_ads', 'Marketing/Anúncios'),
  ('software_assinatura', 'Software/Assinatura'),
  ('imposto_das', 'Imposto/DAS'),
  ('pro_labore', 'Pró-labore'),
  ('taxa_bancaria', 'Taxa bancária'),
  ('outros', 'Outros')
ON CONFLICT (slug) DO NOTHING;

-- 2) Lançamentos (despesa + entrada). Pendente vive AQUI (sobrevive restart).
--    pf_pj é nullable no pendente (Eva pergunta com botões); obrigatório pra
--    confirmar (trava na aplicação).
CREATE TABLE IF NOT EXISTS financeiro_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL
    CHECK (tipo IN ('despesa', 'entrada')),
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'confirmado', 'apagado')),
  valor numeric(14,2) NOT NULL CHECK (valor > 0),
  data_evento date NOT NULL,
  competencia text NOT NULL
    CHECK (competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  contraparte text,
  descricao text,
  categoria_id uuid REFERENCES financeiro_categorias(id) ON DELETE SET NULL,
  pf_pj text CHECK (pf_pj IN ('PF', 'PJ')),
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  fechamento_id uuid REFERENCES fechamentos(id) ON DELETE SET NULL,
  conta_id uuid REFERENCES financeiro_contas_a_receber(id) ON DELETE SET NULL,
  storage_path text,
  mime_type text,
  origem text NOT NULL
    CHECK (origem IN ('zap_midia', 'zap_texto')),
  message_id text,
  extracao jsonb,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_lanc_status
  ON financeiro_lancamentos(status);
CREATE INDEX IF NOT EXISTS idx_fin_lanc_competencia
  ON financeiro_lancamentos(competencia);
CREATE INDEX IF NOT EXISTS idx_fin_lanc_tipo_comp
  ON financeiro_lancamentos(tipo, competencia);
CREATE INDEX IF NOT EXISTS idx_fin_lanc_categoria
  ON financeiro_lancamentos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_fin_lanc_pfpj_comp
  ON financeiro_lancamentos(pf_pj, competencia);
```

- [ ] **Step 2: Copiar pra Área de Trabalho**

Run: `Copy-Item "supabase\migrations\047_financeiro_caixa_entrada.sql" "C:\Users\Meu Computador\Desktop\migration-047-caixa-entrada.sql"`

- [ ] **Step 3: Commit**

```powershell
git add supabase/migrations/047_financeiro_caixa_entrada.sql
git commit -m "feat(financeiro): migration 047 — categorias + lancamentos da Caixa de Entrada"
```

---

### Task 2: Regras puras (`lancamentos.ts`)

**Files:**
- Create: `src/modules/financeiro/lancamentos.ts`
- Test: `tests/financeiro-lancamentos.test.ts`

- [ ] **Step 1: Escrever os testes (falhando)**

```typescript
// tests/financeiro-lancamentos.test.ts
import { describe, it, expect } from 'vitest';
import {
  CATEGORIA_SLUGS, validarParaConfirmar, normalizarContraparte,
  ehDuplicado, pendenteExpirado, competenciaDe, resolverCategoria,
} from '../src/modules/financeiro/lancamentos.js';

describe('financeiro/lancamentos: categorias', () => {
  it('lista fixa tem as 13 da spec, com outros', () => {
    expect(CATEGORIA_SLUGS).toHaveLength(13);
    expect(CATEGORIA_SLUGS).toContain('combustivel');
    expect(CATEGORIA_SLUGS).toContain('outros');
  });
  it('categoria desconhecida cai em outros', () => {
    expect(resolverCategoria('jardinagem')).toBe('outros');
    expect(resolverCategoria(null)).toBe('outros');
    expect(resolverCategoria('combustivel')).toBe('combustivel');
  });
});

describe('financeiro/lancamentos: validação pra confirmar', () => {
  const ok = { tipo: 'despesa' as const, valor: 380, data_evento: '2026-06-11', pf_pj: 'PJ' as const };
  it('lançamento completo passa', () => {
    expect(validarParaConfirmar(ok)).toEqual({ ok: true, faltando: [] });
  });
  it('sem valor não passa', () => {
    expect(validarParaConfirmar({ ...ok, valor: null }).faltando).toContain('valor');
  });
  it('valor zero/negativo não passa', () => {
    expect(validarParaConfirmar({ ...ok, valor: 0 }).ok).toBe(false);
    expect(validarParaConfirmar({ ...ok, valor: -5 }).ok).toBe(false);
  });
  it('sem pf_pj não passa (Eva pergunta com botões)', () => {
    expect(validarParaConfirmar({ ...ok, pf_pj: null }).faltando).toContain('pf_pj');
  });
  it('data inválida não passa', () => {
    expect(validarParaConfirmar({ ...ok, data_evento: '11/06/2026' }).faltando).toContain('data');
    expect(validarParaConfirmar({ ...ok, data_evento: null }).faltando).toContain('data');
  });
});

describe('financeiro/lancamentos: duplicado', () => {
  const novo = { valor: 380, contraparte: 'Posto Shell', data_evento: '2026-06-11' };
  it('mesmo valor + contraparte (normalizada) + dia = duplicado', () => {
    expect(ehDuplicado(novo, [{ valor: 380, contraparte: 'posto shell ', data_evento: '2026-06-11' }])).toBe(true);
  });
  it('valor diferente não é duplicado', () => {
    expect(ehDuplicado(novo, [{ valor: 100, contraparte: 'Posto Shell', data_evento: '2026-06-11' }])).toBe(false);
  });
  it('sem contraparte nunca acusa duplicado (2 almoços sem nome são legítimos)', () => {
    expect(ehDuplicado({ ...novo, contraparte: null }, [{ valor: 380, contraparte: null, data_evento: '2026-06-11' }])).toBe(false);
  });
  it('normaliza acento e caixa', () => {
    expect(normalizarContraparte('  Pádaria São João ')).toBe('padaria sao joao');
  });
});

describe('financeiro/lancamentos: expiração e competência', () => {
  it('pendente com mais de 24h expira', () => {
    expect(pendenteExpirado('2026-06-10T10:00:00Z', new Date('2026-06-11T10:00:01Z'))).toBe(true);
    expect(pendenteExpirado('2026-06-11T09:00:00Z', new Date('2026-06-11T10:00:00Z'))).toBe(false);
  });
  it('competência sai da data do evento', () => {
    expect(competenciaDe('2026-06-11')).toBe('2026-06');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/financeiro-lancamentos.test.ts`
Expected: FAIL (módulo não existe)

- [ ] **Step 3: Implementar**

```typescript
// src/modules/financeiro/lancamentos.ts
// Regras PURAS da Caixa de Entrada (sem I/O — testáveis).

export const CATEGORIA_SLUGS = [
  'combustivel', 'material_eletrico', 'equipamento_kit', 'mao_de_obra',
  'alimentacao', 'ferramenta', 'veiculo_manutencao', 'marketing_ads',
  'software_assinatura', 'imposto_das', 'pro_labore', 'taxa_bancaria', 'outros',
] as const;
export type CategoriaSlug = typeof CATEGORIA_SLUGS[number];

export function resolverCategoria(slug: string | null | undefined): CategoriaSlug {
  if (slug && (CATEGORIA_SLUGS as readonly string[]).includes(slug)) return slug as CategoriaSlug;
  return 'outros';
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface CamposLancamento {
  tipo: 'despesa' | 'entrada' | null;
  valor: number | null;
  data_evento: string | null; // YYYY-MM-DD
  pf_pj: 'PF' | 'PJ' | null;
}

// O que falta pra esse lançamento poder ser CONFIRMADO. Eva pergunta o que
// faltar — nunca chuta (lição do caso Marcelo).
export function validarParaConfirmar(c: CamposLancamento): { ok: boolean; faltando: string[] } {
  const faltando: string[] = [];
  if (!c.tipo) faltando.push('tipo');
  if (!(typeof c.valor === 'number' && c.valor > 0)) faltando.push('valor');
  if (!c.data_evento || !DATA_RE.test(c.data_evento)) faltando.push('data');
  if (c.pf_pj !== 'PF' && c.pf_pj !== 'PJ') faltando.push('pf_pj');
  return { ok: faltando.length === 0, faltando };
}

export function normalizarContraparte(s: string | null | undefined): string {
  if (!s) return '';
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

export interface ChaveDuplicado { valor: number; contraparte: string | null; data_evento: string }

// Duplicado APARENTE: mesmo valor + mesma contraparte + mesmo dia. Vira AVISO
// (botão "Lançar mesmo assim"), nunca bloqueio — 2 almoços iguais existem.
export function ehDuplicado(novo: ChaveDuplicado, existentes: ChaveDuplicado[]): boolean {
  const c = normalizarContraparte(novo.contraparte);
  if (!c) return false; // sem contraparte não dá pra afirmar nada
  return existentes.some((e) =>
    Math.abs(e.valor - novo.valor) < 0.01 &&
    normalizarContraparte(e.contraparte) === c &&
    e.data_evento === novo.data_evento);
}

const TTL_PENDENTE_MS = 24 * 60 * 60 * 1000;

export function pendenteExpirado(createdAt: string, agora: Date): boolean {
  return agora.getTime() - new Date(createdAt).getTime() > TTL_PENDENTE_MS;
}

export function competenciaDe(dataEvento: string): string {
  return dataEvento.slice(0, 7);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/financeiro-lancamentos.test.ts`
Expected: PASS (todos)

- [ ] **Step 5: Commit**

```powershell
git add src/modules/financeiro/lancamentos.ts tests/financeiro-lancamentos.test.ts
git commit -m "feat(financeiro): regras puras da Caixa de Entrada (validacao, duplicado, expiracao)"
```

---

### Task 3: Extrator — parse + prompts (`extrator-lancamento.ts`)

**Files:**
- Create: `src/modules/financeiro/extrator-lancamento.ts`
- Test: `tests/financeiro-extrator.test.ts`

- [ ] **Step 1: Escrever os testes (falhando)**

```typescript
// tests/financeiro-extrator.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseRespostaExtrator, montarPromptExtracaoTexto, montarPromptGate,
} from '../src/modules/financeiro/extrator-lancamento.js';

describe('financeiro/extrator: parse da resposta da IA', () => {
  it('lê JSON dentro de bloco ```json```', () => {
    const raw = 'ok\n```json\n{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":380,"data":"2026-06-11","contraparte":"Posto Shell","categoria_slug":"combustivel","pf_pj":"PJ","obra_ref":null,"descricao":"gasolina","campos_faltando":[]}\n```';
    const e = parseRespostaExtrator(raw);
    expect(e?.financeiro).toBe(true);
    expect(e?.valor).toBe(380);
    expect(e?.pf_pj).toBe('PJ');
  });
  it('lê JSON cru sem bloco', () => {
    const e = parseRespostaExtrator('{"financeiro":false}');
    expect(e?.financeiro).toBe(false);
  });
  it('resposta sem JSON → null (nunca explode)', () => {
    expect(parseRespostaExtrator('não consegui ler nada')).toBeNull();
  });
  it('valor string "380,50" vira número 380.5', () => {
    const e = parseRespostaExtrator('{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":"380,50"}');
    expect(e?.valor).toBe(380.5);
  });
  it('valor lixo vira null e entra em campos_faltando', () => {
    const e = parseRespostaExtrator('{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":"abc"}');
    expect(e?.valor).toBeNull();
    expect(e?.campos_faltando).toContain('valor');
  });
  it('pf_pj inválido vira null (Eva pergunta)', () => {
    const e = parseRespostaExtrator('{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":10,"pf_pj":"talvez"}');
    expect(e?.pf_pj).toBeNull();
  });
  it('intencao desconhecida vira lancar', () => {
    const e = parseRespostaExtrator('{"financeiro":true,"intencao":"explodir","tipo":"despesa","valor":10}');
    expect(e?.intencao).toBe('lancar');
  });
});

describe('financeiro/extrator: prompts', () => {
  it('prompt de texto inclui as categorias e a data de hoje', () => {
    const p = montarPromptExtracaoTexto('gastei 80 no almoço', '2026-06-11');
    expect(p).toContain('combustivel');
    expect(p).toContain('2026-06-11');
    expect(p).toContain('NUNCA invente');
  });
  it('gate é curto e pede SIM/NAO', () => {
    const p = montarPromptGate('bom dia Eva');
    expect(p).toContain('SIM');
    expect(p).toContain('NAO');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/financeiro-extrator.test.ts`
Expected: FAIL (módulo não existe)

- [ ] **Step 3: Implementar**

```typescript
// src/modules/financeiro/extrator-lancamento.ts
// Extração estruturada de lançamento financeiro (gasto/entrada) por IA.
// Parse e prompts são PUROS (testáveis); as chamadas de IA recebem o client
// injetado (Opus com fallback Haiku — mesmo padrão do vision.ts).
import type Anthropic from '@anthropic-ai/sdk';
import { CATEGORIA_SLUGS } from './lancamentos.js';

export interface ExtracaoLancamento {
  financeiro: boolean;
  intencao: 'lancar' | 'corrigir' | 'apagar';
  tipo: 'despesa' | 'entrada' | null;
  valor: number | null;
  data: string | null;            // YYYY-MM-DD
  contraparte: string | null;
  categoria_slug: string | null;
  pf_pj: 'PF' | 'PJ' | null;
  obra_ref: string | null;        // nome do cliente/obra citado, se houver
  descricao: string | null;
  campos_faltando: string[];
}

function numeroOuNull(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v) && v > 0) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/\./g, '').replace(',', '.'));
    if (isFinite(n) && n > 0) return n;
  }
  return null;
}

const strOuNull = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

// Parse defensivo: a IA pode mandar texto em volta, valor como string BR,
// campos faltando. NUNCA explode — null = "não entendi, não lança nada".
export function parseRespostaExtrator(raw: string): ExtracaoLancamento | null {
  const m = raw.match(/```json\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
  if (!m) return null;
  let obj: Record<string, unknown>;
  try { obj = JSON.parse(m[1]); } catch { return null; }
  if (typeof obj !== 'object' || obj === null) return null;

  const valor = numeroOuNull(obj.valor);
  const faltando = new Set<string>(
    Array.isArray(obj.campos_faltando) ? obj.campos_faltando.filter((x): x is string => typeof x === 'string') : [],
  );
  if (valor === null && obj.valor !== undefined && obj.valor !== null) faltando.add('valor');

  const intencao = obj.intencao === 'corrigir' || obj.intencao === 'apagar' ? obj.intencao : 'lancar';
  const tipo = obj.tipo === 'despesa' || obj.tipo === 'entrada' ? obj.tipo : null;
  const pf = obj.pf_pj === 'PF' || obj.pf_pj === 'PJ' ? obj.pf_pj : null;
  const data = typeof obj.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.data) ? obj.data : null;

  return {
    financeiro: obj.financeiro === true,
    intencao, tipo, valor, data,
    contraparte: strOuNull(obj.contraparte),
    categoria_slug: strOuNull(obj.categoria_slug),
    pf_pj: pf,
    obra_ref: strOuNull(obj.obra_ref),
    descricao: strOuNull(obj.descricao),
    campos_faltando: [...faltando],
  };
}

const REGRAS_COMUNS = (hoje: string) => `Devolva APENAS um bloco \`\`\`json\`\`\` com:
{"financeiro": true/false, "intencao": "lancar"|"corrigir"|"apagar", "tipo": "despesa"|"entrada"|null,
 "valor": número ou null, "data": "YYYY-MM-DD" ou null, "contraparte": "quem (posto/fornecedor/cliente)" ou null,
 "categoria_slug": uma de [${CATEGORIA_SLUGS.join(', ')}] ou null, "pf_pj": "PF"|"PJ"|null,
 "obra_ref": "nome do cliente/obra citado" ou null, "descricao": "resumo curto" ou null,
 "campos_faltando": ["valor", "pf_pj", ...]}

REGRAS (dinheiro em jogo — leia como contador):
- NUNCA invente valor. Não deu pra ler com certeza → valor null + "valor" em campos_faltando.
- Comprovante sem data legível → use a data de hoje: ${hoje}. "ontem"/"anteontem" → calcule a partir de hoje.
- pf_pj: PJ = gasto/receita da EMPRESA (obra, material, anúncio, kit, conta PJ). PF = pessoal
  (mercado da casa, lazer). Na DÚVIDA → null + "pf_pj" em campos_faltando. NÃO assuma.
- categoria_slug: escolha a MAIS parecida da lista; nada encaixa → "outros".
- "entrou"/"recebi"/"caiu"/"cliente pagou" → tipo "entrada". "gastei"/"paguei"/"comprei" e
  comprovante de compra/PIX enviado → tipo "despesa".
- intencao "corrigir": a pessoa quer ARRUMAR um lançamento já feito ("o do posto era 350").
  intencao "apagar": quer remover ("apaga o último gasto"). Senão → "lancar".
- financeiro false quando NÃO for assunto de dinheiro da empresa/pessoal: conta de luz de
  CLIENTE, foto de telhado/obra, documento de proposta, conversa comum. Na dúvida sobre ser
  financeiro → false (o fluxo normal trata).`;

export function montarPromptExtracaoTexto(texto: string, hoje: string): string {
  return `Você lê mensagens do DONO de uma empresa de energia solar e extrai lançamentos financeiros (gasto ou entrada de dinheiro).

Mensagem dele (pode ser transcrição de áudio/vídeo): "${texto}"

${REGRAS_COMUNS(hoje)}`;
}

export function montarPromptExtracaoMidia(hoje: string): string {
  return `Você lê comprovantes financeiros do DONO de uma empresa de energia solar (foto ou PDF: comprovante PIX, nota fiscal, cupom, boleto, fatura de cartão).

Extraia o lançamento financeiro do documento.

${REGRAS_COMUNS(hoje)}`;
}

export function montarPromptGate(texto: string): string {
  return `O dono de uma empresa manda mensagens variadas. Responda APENAS "SIM" ou "NAO":
a mensagem abaixo fala de DINHEIRO entrando ou saindo (gasto, pagamento, compra, recebimento, correção ou exclusão de um lançamento financeiro)?

Mensagem: "${texto}"`;
}

// ---------------------------------------------------------------------------
// Chamadas de IA (camada I/O fina — sem teste unitário)
// ---------------------------------------------------------------------------
const MODELO_FORTE = 'claude-opus-4-7';
const MODELO_RAPIDO = 'claude-haiku-4-5-20251001';

async function chamarComFallback(client: Anthropic, messages: Anthropic.Messages.MessageParam[], maxTokens: number): Promise<string> {
  let response;
  try {
    response = await client.messages.create({ model: MODELO_FORTE, max_tokens: maxTokens, messages });
  } catch (apiErr) {
    console.warn('[caixa-entrada] Opus indisponível, fallback Haiku:', (apiErr as Error).message);
    response = await client.messages.create({ model: MODELO_RAPIDO, max_tokens: maxTokens, messages });
  }
  return response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
}

// Gate barato: decide se um texto de admin é assunto financeiro. Haiku direto
// (sem Opus — roda em TODA mensagem de texto do admin fora de modo).
export async function gateTextoFinanceiro(client: Anthropic, texto: string): Promise<boolean> {
  try {
    const r = await client.messages.create({
      model: MODELO_RAPIDO, max_tokens: 5,
      messages: [{ role: 'user', content: montarPromptGate(texto) }],
    });
    const out = r.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
    return out.trim().toUpperCase().startsWith('SIM');
  } catch (err) {
    console.warn('[caixa-entrada] gate falhou (segue fluxo normal):', (err as Error).message);
    return false;
  }
}

export async function extrairDeTexto(client: Anthropic, texto: string, hoje: string): Promise<ExtracaoLancamento | null> {
  const raw = await chamarComFallback(client, [{ role: 'user', content: montarPromptExtracaoTexto(texto, hoje) }], 1024);
  return parseRespostaExtrator(raw);
}

export async function extrairDeImagem(client: Anthropic, base64: string, mediaType: string, hoje: string): Promise<ExtracaoLancamento | null> {
  const mt = (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType) ? mediaType : 'image/jpeg') as
    'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  const raw = await chamarComFallback(client, [{
    role: 'user',
    content: [
      { type: 'image', source: { type: 'base64', media_type: mt, data: base64 } },
      { type: 'text', text: montarPromptExtracaoMidia(hoje) },
    ],
  }], 1024);
  return parseRespostaExtrator(raw);
}

export async function extrairDePdf(client: Anthropic, base64: string, hoje: string): Promise<ExtracaoLancamento | null> {
  const raw = await chamarComFallback(client, [{
    role: 'user',
    content: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
      { type: 'text', text: montarPromptExtracaoMidia(hoje) },
    ],
  }], 1024);
  return parseRespostaExtrator(raw);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/financeiro-extrator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add src/modules/financeiro/extrator-lancamento.ts tests/financeiro-extrator.test.ts
git commit -m "feat(financeiro): extrator de lancamento por IA (parse + prompts + gate Haiku)"
```

---

### Task 4: Resumo + botões (`resumo-lancamento.ts`)

**Files:**
- Create: `src/modules/financeiro/resumo-lancamento.ts`
- Test: `tests/financeiro-resumo-lancamento.test.ts`

- [ ] **Step 1: Escrever os testes (falhando)**

```typescript
// tests/financeiro-resumo-lancamento.test.ts
import { describe, it, expect } from 'vitest';
import { montarResumoPendente, montarPedidoPfPj, montarConfirmacaoApagar } from '../src/modules/financeiro/resumo-lancamento.js';

const base = {
  id: 'abc-123', tipo: 'despesa' as const, valor: 380, data_evento: '2026-06-11',
  contraparte: 'Posto Shell', categoriaNome: 'Combustível', pf_pj: 'PJ' as const,
};

describe('financeiro/resumo: pendente completo', () => {
  it('mostra tudo que leu + 3 botões', () => {
    const r = montarResumoPendente(base, { duplicado: false });
    // toLocaleString pt-BR usa espaço NBSP entre "R$" e o número — testar só o número
    expect(r.body).toContain('380,00');
    expect(r.body).toContain('Posto Shell');
    expect(r.body).toContain('Combustível');
    expect(r.body).toContain('PJ');
    expect(r.buttons).toEqual([
      { id: 'finlan:conf:abc-123', title: 'Confirmar' },
      { id: 'finlan:corr:abc-123', title: 'Corrigir' },
      { id: 'finlan:desc:abc-123', title: 'Descartar' },
    ]);
  });
  it('entrada usa 💰 e despesa usa 💸', () => {
    expect(montarResumoPendente(base, { duplicado: false }).body).toContain('💸');
    expect(montarResumoPendente({ ...base, tipo: 'entrada' }, { duplicado: false }).body).toContain('💰');
  });
  it('duplicado vira aviso + botão "Lançar mesmo assim"', () => {
    const r = montarResumoPendente(base, { duplicado: true });
    expect(r.body).toContain('⚠️');
    expect(r.buttons[0].title).toBe('Lançar mesmo assim');
  });
});

describe('financeiro/resumo: pedir PF/PJ', () => {
  it('2 botões com o id do lançamento', () => {
    const r = montarPedidoPfPj('abc-123');
    expect(r.buttons).toEqual([
      { id: 'finlan:pj:abc-123', title: 'PJ (empresa)' },
      { id: 'finlan:pf:abc-123', title: 'PF (pessoal)' },
    ]);
  });
});

describe('financeiro/resumo: apagar', () => {
  it('mostra o lançamento e pede confirmação', () => {
    const r = montarConfirmacaoApagar(base);
    expect(r.body).toContain('380,00');
    expect(r.buttons[0]).toEqual({ id: 'finlan:apg:abc-123', title: 'Apagar mesmo' });
    expect(r.buttons[1]).toEqual({ id: 'finlan:noop:0', title: 'Deixa como está' });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/financeiro-resumo-lancamento.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

```typescript
// src/modules/financeiro/resumo-lancamento.ts
// PURO: textos e botões da Caixa de Entrada (padrão finlan:<acao>:<id>).
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export interface BotaoZap { id: string; title: string }
export interface MsgComBotoes { body: string; buttons: BotaoZap[] }

export interface LancamentoResumo {
  id: string;
  tipo: 'despesa' | 'entrada';
  valor: number;
  data_evento: string;
  contraparte: string | null;
  categoriaNome: string | null;
  pf_pj: 'PF' | 'PJ' | null;
}

const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function linhaResumo(l: LancamentoResumo): string {
  const emoji = l.tipo === 'entrada' ? '💰' : '💸';
  const partes = [
    `${emoji} *${brl(l.valor)}*`,
    l.contraparte ?? null,
    l.categoriaNome ?? null,
    l.pf_pj ?? null,
    dataBR(l.data_evento),
  ].filter(Boolean);
  return partes.join(' · ');
}

export function montarResumoPendente(l: LancamentoResumo, opts: { duplicado: boolean }): MsgComBotoes {
  const aviso = opts.duplicado
    ? '\n⚠️ Parece igual a um lançamento que você já fez nesse dia.'
    : '';
  return {
    body: `Li aqui:\n${linhaResumo(l)}${aviso}\nConfere?`,
    buttons: [
      { id: `finlan:conf:${l.id}`, title: opts.duplicado ? 'Lançar mesmo assim' : 'Confirmar' },
      { id: `finlan:corr:${l.id}`, title: 'Corrigir' },
      { id: `finlan:desc:${l.id}`, title: 'Descartar' },
    ],
  };
}

export function montarPedidoPfPj(lancamentoId: string): MsgComBotoes {
  return {
    body: 'Esse é da empresa ou pessoal?',
    buttons: [
      { id: `finlan:pj:${lancamentoId}`, title: 'PJ (empresa)' },
      { id: `finlan:pf:${lancamentoId}`, title: 'PF (pessoal)' },
    ],
  };
}

export function montarConfirmacaoApagar(l: LancamentoResumo): MsgComBotoes {
  return {
    body: `Achei esse:\n${linhaResumo(l)}\nApagar? (sai dos números, mas fica no histórico)`,
    buttons: [
      { id: `finlan:apg:${l.id}`, title: 'Apagar mesmo' },
      { id: 'finlan:noop:0', title: 'Deixa como está' },
    ],
  };
}

export function montarOfertaVinculoConta(lancamentoId: string, contaId: string, clienteNome: string, saldo: number): MsgComBotoes {
  return {
    body: `Encontrei venda em aberto de *${clienteNome}* (falta ${brl(saldo)}). Essa entrada é dela?`,
    buttons: [
      { id: `finlan:vinc:${lancamentoId}:${contaId}`, title: 'É dessa venda' },
      { id: `finlan:avul:${lancamentoId}`, title: 'Entrada avulsa' },
      { id: `finlan:desc:${lancamentoId}`, title: 'Descartar' },
    ],
  };
}

export function montarEscolhaAtividade(lancamentoId: string, atividades: Array<{ id: string; nome: string }>): MsgComBotoes {
  return {
    body: 'Entrada avulsa da empresa — de qual atividade? (define o imposto)',
    buttons: atividades.slice(0, 3).map((a) => ({ id: `finlan:atv:${lancamentoId}:${a.id}`, title: a.nome.slice(0, 20) })),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/financeiro-resumo-lancamento.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add src/modules/financeiro/resumo-lancamento.ts tests/financeiro-resumo-lancamento.test.ts
git commit -m "feat(financeiro): resumo e botoes finlan da Caixa de Entrada"
```

---

### Task 5: Repo de lançamentos + comprovantes (I/O fino)

**Files:**
- Create: `src/modules/financeiro/lancamentos-repo.ts`
- Create: `src/modules/financeiro/comprovantes.ts`

Sem teste unitário (camada I/O — padrão da Fatia 2, ver `contas.ts` "Orquestração com banco"). A lógica decidível está nas funções puras da Task 2.

- [ ] **Step 1: Implementar `lancamentos-repo.ts`**

```typescript
// src/modules/financeiro/lancamentos-repo.ts
// I/O fino da Caixa de Entrada. Regras puras ficam em lancamentos.ts.
import type { SupabaseClient } from '@supabase/supabase-js';
import { competenciaDe, type ChaveDuplicado } from './lancamentos.js';

export interface LancamentoRow {
  id: string;
  tipo: 'despesa' | 'entrada';
  status: 'pendente' | 'confirmado' | 'apagado';
  valor: number;
  data_evento: string;
  competencia: string;
  contraparte: string | null;
  descricao: string | null;
  categoria_id: string | null;
  pf_pj: 'PF' | 'PJ' | null;
  lead_id: string | null;
  conta_id: string | null;
  storage_path: string | null;
  extracao: Record<string, unknown> | null;
  created_at: string;
}

const COLS = 'id, tipo, status, valor, data_evento, competencia, contraparte, descricao, categoria_id, pf_pj, lead_id, conta_id, storage_path, extracao, created_at';

export async function criarPendente(client: SupabaseClient, l: {
  tipo: 'despesa' | 'entrada'; valor: number; dataEvento: string;
  contraparte: string | null; descricao: string | null; categoriaId: string | null;
  pfPj: 'PF' | 'PJ' | null; leadId: string | null; storagePath: string | null;
  mimeType: string | null; origem: 'zap_midia' | 'zap_texto'; messageId: string | null;
  extracao: Record<string, unknown>; createdBy: string;
}): Promise<string> {
  const { data, error } = await client.from('financeiro_lancamentos').insert({
    tipo: l.tipo, status: 'pendente', valor: l.valor, data_evento: l.dataEvento,
    competencia: competenciaDe(l.dataEvento), contraparte: l.contraparte,
    descricao: l.descricao, categoria_id: l.categoriaId, pf_pj: l.pfPj,
    lead_id: l.leadId, storage_path: l.storagePath, mime_type: l.mimeType,
    origem: l.origem, message_id: l.messageId, extracao: l.extracao, created_by: l.createdBy,
  }).select('id').single();
  if (error) throw new Error(`criarPendente: ${error.message}`);
  return (data as { id: string }).id;
}

export async function getLancamento(client: SupabaseClient, id: string): Promise<LancamentoRow | null> {
  const { data, error } = await client.from('financeiro_lancamentos').select(COLS).eq('id', id).maybeSingle();
  if (error) throw new Error(`getLancamento: ${error.message}`);
  return (data as LancamentoRow) ?? null;
}

// Transição de status com CAS no status atual (clique duplo: só o 1º casa).
export async function mudarStatus(
  client: SupabaseClient, id: string,
  de: 'pendente' | 'confirmado', para: 'confirmado' | 'apagado',
  patch: Record<string, unknown> = {},
): Promise<boolean> {
  const { data, error } = await client.from('financeiro_lancamentos')
    .update({ ...patch, status: para, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', de).select('id');
  if (error) throw new Error(`mudarStatus: ${error.message}`);
  return Boolean(data && data.length > 0);
}

export async function atualizarPendente(client: SupabaseClient, id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await client.from('financeiro_lancamentos')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'pendente');
  if (error) throw new Error(`atualizarPendente: ${error.message}`);
}

// Pendente mais recente "esperando" resposta do admin (campo faltando/correção).
// Janela de 1h: mais velho que isso não engole resposta de texto.
export async function getPendenteAguardando(client: SupabaseClient): Promise<LancamentoRow | null> {
  const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data, error } = await client.from('financeiro_lancamentos').select(COLS)
    .eq('status', 'pendente').gte('created_at', desde)
    .contains('extracao', { aguardando: true })
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`getPendenteAguardando: ${error.message}`);
  return (data as LancamentoRow) ?? null;
}

export async function getConfirmadosDoDia(client: SupabaseClient, dataEvento: string): Promise<ChaveDuplicado[]> {
  const { data, error } = await client.from('financeiro_lancamentos')
    .select('valor, contraparte, data_evento')
    .eq('status', 'confirmado').eq('data_evento', dataEvento);
  if (error) throw new Error(`getConfirmadosDoDia: ${error.message}`);
  return (data ?? []) as ChaveDuplicado[];
}

export async function getUltimoConfirmado(client: SupabaseClient): Promise<LancamentoRow | null> {
  const { data, error } = await client.from('financeiro_lancamentos').select(COLS)
    .eq('status', 'confirmado').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`getUltimoConfirmado: ${error.message}`);
  return (data as LancamentoRow) ?? null;
}

// Busca por contraparte nos últimos 30 dias (correção "o do posto era 350").
export async function buscarConfirmadoPorContraparte(client: SupabaseClient, termo: string): Promise<LancamentoRow | null> {
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client.from('financeiro_lancamentos').select(COLS)
    .eq('status', 'confirmado').gte('created_at', desde)
    .ilike('contraparte', `%${termo}%`)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`buscarConfirmadoPorContraparte: ${error.message}`);
  return (data as LancamentoRow) ?? null;
}

// Varredura preguiçosa: roda ao criar pendente novo (sem cron). >24h expira.
export async function expirarPendentesAntigos(client: SupabaseClient): Promise<void> {
  const limite = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { error } = await client.from('financeiro_lancamentos')
    .update({ status: 'apagado', updated_at: new Date().toISOString() })
    .eq('status', 'pendente').lt('created_at', limite);
  if (error) console.warn('[caixa-entrada] expirarPendentes falhou:', error.message);
}

export async function getCategorias(client: SupabaseClient): Promise<Array<{ id: string; slug: string; nome: string }>> {
  const { data, error } = await client.from('financeiro_categorias')
    .select('id, slug, nome').eq('ativo', true);
  if (error) throw new Error(`getCategorias: ${error.message}`);
  return (data ?? []) as Array<{ id: string; slug: string; nome: string }>;
}

// Conta a receber em aberto cujo lead casa com o nome citado (entrada → venda).
export async function buscarContaAbertaPorNome(client: SupabaseClient, nome: string):
  Promise<{ id: string; clienteNome: string; saldo: number } | null> {
  const { data, error } = await client.from('financeiro_contas_a_receber')
    .select('id, valor, valor_recebido, leads!inner(name)')
    .in('status', ['pendente', 'recebido_parcial'])
    .ilike('leads.name', `%${nome}%`)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) {
    console.warn('[caixa-entrada] buscarContaAbertaPorNome falhou:', error.message);
    return null;
  }
  if (!data) return null;
  const d = data as unknown as { id: string; valor: number; valor_recebido: number; leads: { name: string | null } };
  return {
    id: d.id,
    clienteNome: d.leads?.name ?? nome,
    saldo: Math.round((Number(d.valor) - Number(d.valor_recebido)) * 100) / 100,
  };
}
```

- [ ] **Step 2: Implementar `comprovantes.ts`**

```typescript
// src/modules/financeiro/comprovantes.ts
// Comprovantes da Caixa de Entrada — bucket PRÓPRIO (separado das mídias de
// cliente, que são PII). Upload best-effort: falha NÃO bloqueia o lançamento.
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'financeiro-comprovantes';

const extDoMime = (mime: string): string =>
  mime.includes('pdf') ? 'pdf' : mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' :
  mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'jpg';

export async function uploadComprovante(
  client: SupabaseClient, base64: string, mimeType: string, competencia: string,
): Promise<string | null> {
  try {
    const path = `${competencia}/${randomUUID()}.${extDoMime(mimeType)}`;
    const { error } = await client.storage.from(BUCKET).upload(path, Buffer.from(base64, 'base64'), {
      contentType: mimeType, upsert: false,
    });
    if (error) {
      console.warn('[caixa-entrada] upload comprovante falhou:', error.message);
      return null;
    }
    return path;
  } catch (err) {
    console.warn('[caixa-entrada] upload comprovante exception:', (err as Error).message);
    return null;
  }
}

export async function getComprovanteUrls(
  client: SupabaseClient, paths: string[], ttlSeconds = 3600,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await client.storage.from(BUCKET).createSignedUrls(paths, ttlSeconds);
  if (error || !data) {
    if (error) console.warn('[caixa-entrada] signed urls falhou:', error.message);
    return {};
  }
  const out: Record<string, string> = {};
  for (const r of data) if (r.signedUrl && r.path) out[r.path] = r.signedUrl;
  return out;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 erros

- [ ] **Step 4: Commit**

```powershell
git add src/modules/financeiro/lancamentos-repo.ts src/modules/financeiro/comprovantes.ts
git commit -m "feat(financeiro): repo de lancamentos + comprovantes (bucket financeiro-comprovantes)"
```

---

### Task 6: Orquestrador (`caixa-entrada.ts`)

**Files:**
- Create: `src/modules/financeiro/caixa-entrada.ts`

Camada de orquestração I/O (padrão `engate-fechar.ts` — sem teste unitário; decisões puras já testadas nas Tasks 2-4).

- [ ] **Step 1: Implementar**

```typescript
// src/modules/financeiro/caixa-entrada.ts
// Orquestrador da Caixa de Entrada Universal: mídia/texto do ADMIN vira
// lançamento pendente com botões; clique confirma. Eva classifica (extrator),
// SISTEMA calcula e lança (motor da Fatia 2 pra entrada PJ).
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  gateTextoFinanceiro, extrairDeTexto, extrairDeImagem, extrairDePdf,
  type ExtracaoLancamento,
} from './extrator-lancamento.js';
import { validarParaConfirmar, ehDuplicado, resolverCategoria, competenciaDe } from './lancamentos.js';
import {
  criarPendente, getLancamento, mudarStatus, atualizarPendente,
  getPendenteAguardando, getConfirmadosDoDia, getUltimoConfirmado,
  buscarConfirmadoPorContraparte, expirarPendentesAntigos, getCategorias,
  buscarContaAbertaPorNome, type LancamentoRow,
} from './lancamentos-repo.js';
import { uploadComprovante } from './comprovantes.js';
import {
  montarResumoPendente, montarPedidoPfPj, montarConfirmacaoApagar,
  montarOfertaVinculoConta, montarEscolhaAtividade, type LancamentoResumo,
} from './resumo-lancamento.js';
import { criarContaDeFechamento, registrarRecebimento } from './contas.js';
import { getAtividades } from './repo.js';

interface Waba {
  sendInteractiveButtons(to: string, body: string, buttons: Array<{ id: string; title: string }>, footer?: string): Promise<unknown>;
}

const FOOTER = 'Caixa de Entrada · Financeiro';
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const hojeBRT = (): string => {
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
};

export interface CaixaDeps {
  supabase: SupabaseClient;
  anthropic: Anthropic;
  waba: Waba;
  sendText: (to: string, text: string) => Promise<void>;
}

async function nomeCategoria(deps: CaixaDeps, categoriaId: string | null): Promise<string | null> {
  if (!categoriaId) return null;
  const cats = await getCategorias(deps.supabase);
  return cats.find((c) => c.id === categoriaId)?.nome ?? null;
}

async function rowParaResumo(deps: CaixaDeps, row: LancamentoRow): Promise<LancamentoResumo> {
  return {
    id: row.id, tipo: row.tipo, valor: Number(row.valor), data_evento: row.data_evento,
    contraparte: row.contraparte, categoriaNome: await nomeCategoria(deps, row.categoria_id),
    pf_pj: row.pf_pj,
  };
}

// Cria o pendente a partir de uma extração válida e manda o resumo + botões.
async function criarPendenteEFalar(
  deps: CaixaDeps, from: string, e: ExtracaoLancamento,
  midia: { base64: string; mimeType: string; messageId: string } | null,
): Promise<void> {
  await expirarPendentesAntigos(deps.supabase); // varredura preguiçosa (sem cron)
  const dataEvento = e.data ?? hojeBRT();
  const cats = await getCategorias(deps.supabase);
  const slug = resolverCategoria(e.categoria_slug);
  const cat = cats.find((c) => c.slug === slug) ?? null;

  // Sem valor não tem pendente — Eva pergunta e espera a resposta de texto.
  if (!(typeof e.valor === 'number' && e.valor > 0)) {
    await deps.sendText(from, 'Não consegui ler o valor 🤔 Me fala o valor e o que foi? (ex: "380 gasolina no Shell")');
    return;
  }

  // Comprovante: best-effort ANTES de confirmar (nada se perde).
  let storagePath: string | null = null;
  if (midia) {
    storagePath = await uploadComprovante(deps.supabase, midia.base64, midia.mimeType, competenciaDe(dataEvento));
    if (!storagePath) {
      await deps.sendText(from, '⚠️ Não consegui arquivar o comprovante (lanço mesmo assim — depois me reenvia o arquivo).');
    }
  }

  // Vínculo de obra "quando der": citou cliente → tenta achar o lead.
  let leadId: string | null = null;
  if (e.obra_ref) {
    const { data } = await deps.supabase.from('leads').select('id')
      .ilike('name', `%${e.obra_ref}%`).order('updated_at', { ascending: false }).limit(1).maybeSingle();
    leadId = (data as { id: string } | null)?.id ?? null;
  }

  const faltaPfPj = e.pf_pj !== 'PF' && e.pf_pj !== 'PJ';
  const id = await criarPendente(deps.supabase, {
    tipo: e.tipo ?? 'despesa', valor: e.valor, dataEvento,
    contraparte: e.contraparte, descricao: e.descricao, categoriaId: cat?.id ?? null,
    pfPj: faltaPfPj ? null : e.pf_pj, leadId, storagePath,
    mimeType: midia?.mimeType ?? null, origem: midia ? 'zap_midia' : 'zap_texto',
    messageId: midia?.messageId ?? null,
    extracao: { ...e, aguardando: faltaPfPj }, createdBy: from,
  });

  if (faltaPfPj) {
    const msg = montarPedidoPfPj(id);
    await deps.waba.sendInteractiveButtons(from, msg.body, msg.buttons, FOOTER);
    return;
  }
  await mandarResumo(deps, from, id);
}

async function mandarResumo(deps: CaixaDeps, from: string, lancamentoId: string): Promise<void> {
  const row = await getLancamento(deps.supabase, lancamentoId);
  if (!row || row.status !== 'pendente') return;

  // Entrada que cita cliente com venda em aberto → oferece vincular (motor Fatia 2).
  if (row.tipo === 'entrada' && row.pf_pj === 'PJ') {
    const nomeBusca = (row.extracao?.obra_ref as string | undefined) ?? row.contraparte ?? '';
    if (nomeBusca) {
      const conta = await buscarContaAbertaPorNome(deps.supabase, nomeBusca);
      if (conta) {
        const msg = montarOfertaVinculoConta(row.id, conta.id, conta.clienteNome, conta.saldo);
        await deps.waba.sendInteractiveButtons(from, msg.body, msg.buttons, FOOTER);
        return;
      }
    }
  }

  const duplicado = ehDuplicado(
    { valor: Number(row.valor), contraparte: row.contraparte, data_evento: row.data_evento },
    await getConfirmadosDoDia(deps.supabase, row.data_evento),
  );
  const msg = montarResumoPendente(await rowParaResumo(deps, row), { duplicado });
  await deps.waba.sendInteractiveButtons(from, msg.body, msg.buttons, FOOTER);
}

// ---------------------------------------------------------------------------
// ENTRADAS públicas (chamadas pelo index.ts)
// ---------------------------------------------------------------------------

// Mídia de admin (imagem/pdf). Retorna true se tratou (era financeiro).
export async function tryHandleFinanceiroMedia(
  deps: CaixaDeps, from: string,
  midia: { base64: string; mimeType: string; messageId: string },
  kind: 'imagem' | 'pdf',
): Promise<boolean> {
  try {
    const hoje = hojeBRT();
    const e = kind === 'pdf'
      ? await extrairDePdf(deps.anthropic, midia.base64, hoje)
      : await extrairDeImagem(deps.anthropic, midia.base64, midia.mimeType, hoje);
    if (!e || !e.financeiro) return false; // não é assunto financeiro → fluxo normal
    await criarPendenteEFalar(deps, from, e, midia);
    return true;
  } catch (err) {
    console.error('[caixa-entrada] midia falhou:', (err as Error).message);
    return false; // qualquer erro → fluxo normal (nunca trava a Eva)
  }
}

// Texto de admin (inclui transcrição de áudio/vídeo). Retorna true se tratou.
export async function tryHandleFinanceiroTexto(deps: CaixaDeps, from: string, texto: string): Promise<boolean> {
  try {
    // 1) Tem pendente esperando resposta (PF/PJ por texto, valor, correção)?
    const aguardando = await getPendenteAguardando(deps.supabase);
    if (aguardando) {
      const hoje = hojeBRT();
      const contexto = `O lançamento pendente atual é: ${JSON.stringify(aguardando.extracao)}. ` +
        `A resposta do dono abaixo CORRIGE/COMPLETA esse lançamento — devolva o JSON completo já mesclado.\n\nResposta: "${texto}"`;
      const e = await extrairDeTexto(deps.anthropic, contexto, hoje);
      if (e && e.financeiro) {
        const cats = await getCategorias(deps.supabase);
        const cat = cats.find((c) => c.slug === resolverCategoria(e.categoria_slug)) ?? null;
        await atualizarPendente(deps.supabase, aguardando.id, {
          valor: e.valor ?? aguardando.valor, data_evento: e.data ?? aguardando.data_evento,
          competencia: competenciaDe(e.data ?? aguardando.data_evento),
          contraparte: e.contraparte ?? aguardando.contraparte,
          descricao: e.descricao ?? aguardando.descricao,
          categoria_id: cat?.id ?? aguardando.categoria_id,
          pf_pj: e.pf_pj ?? aguardando.pf_pj,
          extracao: { ...e, aguardando: false },
        });
        await mandarResumo(deps, from, aguardando.id);
        return true;
      }
      // resposta não relacionada → solta o pendente e segue fluxo normal
      await atualizarPendente(deps.supabase, aguardando.id, { extracao: { ...aguardando.extracao, aguardando: false } });
      return false;
    }

    // 2) Gate barato: é assunto financeiro?
    if (!(await gateTextoFinanceiro(deps.anthropic, texto))) return false;

    // 3) Extração completa
    const e = await extrairDeTexto(deps.anthropic, texto, hojeBRT());
    if (!e || !e.financeiro) return false;

    if (e.intencao === 'apagar') {
      const alvo = e.contraparte
        ? await buscarConfirmadoPorContraparte(deps.supabase, e.contraparte)
        : await getUltimoConfirmado(deps.supabase);
      if (!alvo) { await deps.sendText(from, 'Não achei lançamento pra apagar 🤔'); return true; }
      const msg = montarConfirmacaoApagar(await rowParaResumo(deps, alvo));
      await deps.waba.sendInteractiveButtons(from, msg.body, msg.buttons, FOOTER);
      return true;
    }

    if (e.intencao === 'corrigir') {
      const alvo = e.contraparte
        ? await buscarConfirmadoPorContraparte(deps.supabase, e.contraparte)
        : await getUltimoConfirmado(deps.supabase);
      if (!alvo) { await deps.sendText(from, 'Não achei o lançamento pra corrigir 🤔 Me fala qual (ex: "o do posto").'); return true; }
      // Correção = apaga o antigo (soft) + cria pendente novo já corrigido.
      // Simples e auditável: o histórico guarda os dois.
      const corrigido: ExtracaoLancamento = {
        ...e, intencao: 'lancar',
        tipo: e.tipo ?? alvo.tipo,
        valor: e.valor ?? Number(alvo.valor),
        data: e.data ?? alvo.data_evento,
        contraparte: e.contraparte ?? alvo.contraparte,
        pf_pj: e.pf_pj ?? alvo.pf_pj,
      };
      await mudarStatus(deps.supabase, alvo.id, 'confirmado', 'apagado',
        { descricao: `${alvo.descricao ?? ''} [substituído por correção]`.trim() });
      await criarPendenteEFalar(deps, from, corrigido, null);
      return true;
    }

    await criarPendenteEFalar(deps, from, e, null);
    return true;
  } catch (err) {
    console.error('[caixa-entrada] texto falhou:', (err as Error).message);
    return false;
  }
}

// Botões finlan:<acao>:<id>[:<extra>]. Retorna true se tratou.
export async function handleFinlanButton(deps: CaixaDeps, from: string, buttonId: string): Promise<boolean> {
  const [prefixo, acao, id, extra] = buttonId.trim().split(':');
  if (prefixo !== 'finlan') return false;
  if (acao === 'noop') return true;
  try {
    switch (acao) {
      case 'pf': case 'pj': {
        await atualizarPendente(deps.supabase, id, { pf_pj: acao.toUpperCase() });
        const row = await getLancamento(deps.supabase, id);
        if (row) await atualizarPendente(deps.supabase, id, { extracao: { ...row.extracao, aguardando: false } });
        await mandarResumo(deps, from, id);
        return true;
      }
      case 'conf': {
        const row = await getLancamento(deps.supabase, id);
        if (!row || row.status !== 'pendente') {
          await deps.sendText(from, 'Esse lançamento não está mais pendente.');
          return true;
        }
        const v = validarParaConfirmar({ tipo: row.tipo, valor: Number(row.valor), data_evento: row.data_evento, pf_pj: row.pf_pj });
        if (!v.ok) {
          if (v.faltando.includes('pf_pj')) {
            const msg = montarPedidoPfPj(id);
            await deps.waba.sendInteractiveButtons(from, msg.body, msg.buttons, FOOTER);
          } else {
            await deps.sendText(from, `Falta: ${v.faltando.join(', ')}. Me manda por texto que eu completo.`);
            await atualizarPendente(deps.supabase, id, { extracao: { ...row.extracao, aguardando: true } });
          }
          return true;
        }
        // Entrada PJ sem conta vinculada precisa de atividade (imposto) antes.
        if (row.tipo === 'entrada' && row.pf_pj === 'PJ' && !row.conta_id) {
          const atividades = await getAtividades(deps.supabase);
          const msg = montarEscolhaAtividade(id, atividades);
          await deps.waba.sendInteractiveButtons(from, msg.body, msg.buttons, FOOTER);
          return true;
        }
        const ok = await mudarStatus(deps.supabase, id, 'pendente', 'confirmado');
        if (ok) await deps.sendText(from, row.tipo === 'despesa' ? `💸 Lançado: ${brl(Number(row.valor))}. Tá no caixa.` : `💰 Entrada lançada: ${brl(Number(row.valor))}.`);
        else await deps.sendText(from, 'Esse lançamento já tinha sido processado.');
        return true;
      }
      case 'corr': {
        const row = await getLancamento(deps.supabase, id);
        if (row) await atualizarPendente(deps.supabase, id, { extracao: { ...row.extracao, aguardando: true } });
        await deps.sendText(from, 'O que tá errado? Me fala (ex: "era 350" / "é PF" / "foi ontem").');
        return true;
      }
      case 'desc': {
        const ok = await mudarStatus(deps.supabase, id, 'pendente', 'apagado');
        await deps.sendText(from, ok ? 'Descartado 👍' : 'Esse lançamento não está mais pendente.');
        return true;
      }
      case 'apg': {
        const ok = await mudarStatus(deps.supabase, id, 'confirmado', 'apagado');
        await deps.sendText(from, ok ? '🗑️ Apagado (fica no histórico, sai dos números).' : 'Esse já tinha sido apagado.');
        return true;
      }
      case 'vinc': {
        // finlan:vinc:<lancamentoId>:<contaId> — entrada casa com venda aberta.
        const row = await getLancamento(deps.supabase, id);
        if (!row || row.status !== 'pendente') { await deps.sendText(from, 'Esse lançamento não está mais pendente.'); return true; }
        const r = await registrarRecebimento(deps.supabase, extra, Number(row.valor) > 0 ? Number(row.valor) : undefined);
        await mudarStatus(deps.supabase, id, 'pendente', 'confirmado', { conta_id: extra });
        const aviso = r.total
          ? `💵 Recebimento total na venda: ${brl(r.acumulado)}.`
          : `💵 Parcela na venda: ${brl(r.parcela)} (falta ${brl(r.saldoRestante)}).`;
        await deps.sendText(from, `${aviso}\nImposto desta parcela (Anexo ${r.calc.anexo}): *${brl(r.calc.imposto)}* — separe pro DAS.`);
        return true;
      }
      case 'avul': {
        const atividades = await getAtividades(deps.supabase);
        const msg = montarEscolhaAtividade(id, atividades);
        await deps.waba.sendInteractiveButtons(from, msg.body, msg.buttons, FOOTER);
        return true;
      }
      case 'atv': {
        // finlan:atv:<lancamentoId>:<atividadeId> — entrada avulsa PJ: cria conta
        // avulsa + recebimento total imediato (motor Fatia 2 → imposto/RBT12 certos).
        const row = await getLancamento(deps.supabase, id);
        if (!row || row.status !== 'pendente') { await deps.sendText(from, 'Esse lançamento não está mais pendente.'); return true; }
        const { contaId } = await criarContaDeFechamento(deps.supabase, {
          fechamentoId: null, leadId: row.lead_id, atividadeId: extra,
          descricao: `Entrada avulsa — ${row.contraparte ?? row.descricao ?? 'sem descrição'}`,
          valor: Number(row.valor), createdBy: from,
        });
        const r = await registrarRecebimento(deps.supabase, contaId);
        await mudarStatus(deps.supabase, id, 'pendente', 'confirmado', { conta_id: contaId });
        await deps.sendText(from, `💰 Entrada avulsa lançada: ${brl(Number(row.valor))}.\nImposto (Anexo ${r.calc.anexo}): *${brl(r.calc.imposto)}* — separe pro DAS.`);
        return true;
      }
      default:
        console.warn(`[caixa-entrada] finlan ação desconhecida: ${acao}`);
        return true;
    }
  } catch (err) {
    console.error('[caixa-entrada] botão falhou:', (err as Error).message);
    await deps.sendText(from, `❌ ${(err as Error).message}`);
    return true;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 erros

- [ ] **Step 3: Commit**

```powershell
git add src/modules/financeiro/caixa-entrada.ts
git commit -m "feat(financeiro): orquestrador da Caixa de Entrada (midia, texto, botoes finlan)"
```

---

### Task 7: Ligar no `index.ts`

**Files:**
- Modify: `src/index.ts`

Pontos exatos (procurar pelas âncoras; linhas aproximadas da main de 11/06):

- [ ] **Step 1: Montar as deps uma vez**

Perto da criação dos handlers financeiros (âncora: `const tryHandleImpostoCommand = makeImpostoHandler(...)`, ~linha 655), adicionar:

```typescript
  // Caixa de Entrada Universal (Fatia 3): deps montadas sob demanda
  const getCaixaDeps = () => ({
    supabase: supabase.getClient(),
    anthropic: new Anthropic({ apiKey: config.anthropicApiKey }),
    waba: metaWaba!,
    sendText: async (to: string, t: string) => { await sendText(to, t); },
  });
```

(`Anthropic` já é importado no topo do index.ts — conferir; se não, adicionar `import Anthropic from '@anthropic-ai/sdk';`.)

- [ ] **Step 2: Roteador de botões `finlan:`**

Logo DEPOIS do bloco `finrcv:` (âncora: `if (isAdminPhone(from) && text.trim().startsWith('finrcv:'))`, ~linha 3142-3159), adicionar:

```typescript
    // finlan:<acao>:<id>[:<extra>] — botões da Caixa de Entrada (Fatia 3).
    if (isAdminPhone(from) && text.trim().startsWith('finlan:')) {
      if (!metaWaba) { console.warn('[caixa-entrada] WABA indisponível'); return; }
      const { handleFinlanButton } = await import('./modules/financeiro/caixa-entrada.js');
      await handleFinlanButton(getCaixaDeps(), from, text.trim());
      return;
    }
```

- [ ] **Step 3: Gate de texto admin**

DEPOIS de `tryHandleSchedulingCommand` (âncora: `if (await tryHandleSchedulingCommand(from, text)) return;`, ~linha 3369) e ANTES do `takeover.isPaused` (~3371) — assim os MODOS ganham e a conversa da Eva só recebe o que não for financeiro:

```typescript
    // Caixa de Entrada (Fatia 3): texto do Junior fora de modo pode ser gasto/
    // entrada ("gastei 380 no posto"). Gate Haiku barato decide; se não for
    // financeiro, segue o fluxo normal da Eva. Inclui transcrições de áudio.
    if (isAdminPhone(from) && metaWaba) {
      const { tryHandleFinanceiroTexto } = await import('./modules/financeiro/caixa-entrada.js');
      if (await tryHandleFinanceiroTexto(getCaixaDeps(), from, text)) return;
    }
```

- [ ] **Step 4: Interceptor de imagem admin**

Em `handleImageMessage` (âncora ~linha 4481), DEPOIS de `tryHandleCaseCreatorMedia`/`tryHandleProposalMedia` e ANTES do takeover, adicionar:

```typescript
    // Caixa de Entrada (Fatia 3): foto de comprovante do Junior vira lançamento.
    // Baixa a mídia aqui só pro admin; pro cliente nada muda.
    if (isAdminPhone(from) && metaWaba) {
      const media = await messaging.getMediaBase64(messageId);
      if (media) {
        const { tryHandleFinanceiroMedia } = await import('./modules/financeiro/caixa-entrada.js');
        const tratou = await tryHandleFinanceiroMedia(
          getCaixaDeps(), from,
          { base64: media.base64, mimeType: media.mimetype, messageId },
          'imagem',
        );
        if (tratou) return;
      }
    }
```

NOTA: o fluxo normal abaixo re-baixa a mídia (`getMediaBase64` de novo) — aceitável (chamada leve na Evolution API, e só em mídia de admin que NÃO é comprovante).

- [ ] **Step 5: Interceptor de documento (PDF) admin**

Em `handleDocumentMessage` (âncora ~linha 4669), DEPOIS de `tryHandleProposalMedia` e ANTES do takeover, adicionar o MESMO bloco do Step 4 trocando `'imagem'` por `'pdf'` e guardando o check de mimetype:

```typescript
    // Caixa de Entrada (Fatia 3): PDF de comprovante/nota do Junior.
    if (isAdminPhone(from) && metaWaba && mimetype.includes('pdf')) {
      const media = await messaging.getMediaBase64(messageId);
      if (media) {
        const { tryHandleFinanceiroMedia } = await import('./modules/financeiro/caixa-entrada.js');
        const tratou = await tryHandleFinanceiroMedia(
          getCaixaDeps(), from,
          { base64: media.base64, mimeType: media.mimetype, messageId },
          'pdf',
        );
        if (tratou) return;
      }
    }
```

(Áudio e vídeo NÃO precisam de mudança: a transcrição já cai em `handleTextMessage`, onde o gate do Step 3 pega.)

- [ ] **Step 6: Typecheck + suite completa**

Run: `npx tsc --noEmit` → 0 erros
Run: `npx vitest run` → tudo verde (exceto as 2 falhas pré-existentes de `supabase-vincular-novo`)

- [ ] **Step 7: Commit**

```powershell
git add src/index.ts
git commit -m "feat(financeiro): liga Caixa de Entrada no fluxo da Eva (midia + texto + botoes)"
```

---

### Task 8: KPIs puros do dashboard (`caixa-kpis.ts`)

**Files:**
- Create: `src/modules/dashboard/caixa-kpis.ts`
- Test: `tests/financeiro-caixa-kpis.test.ts`

- [ ] **Step 1: Escrever os testes (falhando)**

```typescript
// tests/financeiro-caixa-kpis.test.ts
import { describe, it, expect } from 'vitest';
import { calcularKpisCaixa } from '../src/modules/dashboard/caixa-kpis.js';

const lanc = (tipo: 'despesa' | 'entrada', valor: number, pf_pj: 'PF' | 'PJ', categoriaNome = 'Outros') =>
  ({ tipo, valor, pf_pj, categoriaNome });

describe('dashboard/caixa-kpis', () => {
  it('lucro do mês = recebido PJ − saiu PJ − imposto', () => {
    const k = calcularKpisCaixa({
      recebidoMesPj: 10000, impostoMes: 850,
      lancamentosMes: [lanc('despesa', 2000, 'PJ'), lanc('despesa', 500, 'PF')],
    });
    expect(k.saiuMesPj).toBe(2000);
    expect(k.lucroMes).toBe(7150); // 10000 - 2000 - 850 (PF fora)
  });
  it('mundo PF separado: entrou e saiu PF não tocam o lucro', () => {
    const k = calcularKpisCaixa({
      recebidoMesPj: 0, impostoMes: 0,
      lancamentosMes: [lanc('entrada', 8300, 'PF'), lanc('despesa', 1200, 'PF')],
    });
    expect(k.entrouMesPf).toBe(8300);
    expect(k.saiuMesPf).toBe(1200);
    expect(k.lucroMes).toBe(0);
  });
  it('pizza por categoria só com despesas PJ', () => {
    const k = calcularKpisCaixa({
      recebidoMesPj: 0, impostoMes: 0,
      lancamentosMes: [
        lanc('despesa', 300, 'PJ', 'Combustível'), lanc('despesa', 200, 'PJ', 'Combustível'),
        lanc('despesa', 100, 'PJ', 'Alimentação'), lanc('despesa', 999, 'PF', 'Alimentação'),
        lanc('entrada', 5000, 'PJ', 'Outros'),
      ],
    });
    expect(k.pizzaCategorias).toEqual([
      { categoria: 'Combustível', total: 500 },
      { categoria: 'Alimentação', total: 100 },
    ]);
  });
  it('entrada avulsa PJ confirmada NÃO soma de novo no recebido (vem do motor da Fatia 2)', () => {
    // entradas PJ aparecem na lista mas o "entrou" oficial é recebidoMesPj
    const k = calcularKpisCaixa({
      recebidoMesPj: 5000, impostoMes: 0,
      lancamentosMes: [lanc('entrada', 5000, 'PJ')],
    });
    expect(k.lucroMes).toBe(5000); // não vira 10000
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/financeiro-caixa-kpis.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

```typescript
// src/modules/dashboard/caixa-kpis.ts
// Agregação PURA dos KPIs da Caixa de Entrada (entrou × saiu × lucro).
// IMPORTANTE: o "entrou PJ" oficial vem de financeiro_recebimentos (motor da
// Fatia 2) — entrada avulsa PJ confirmada já virou recebimento lá, então os
// lançamentos tipo 'entrada' PJ NÃO somam de novo aqui (senão dobraria).

export interface LancamentoKpi {
  tipo: 'despesa' | 'entrada';
  valor: number;
  pf_pj: 'PF' | 'PJ' | null;
  categoriaNome: string | null;
}

export interface KpisCaixa {
  saiuMesPj: number;
  lucroMes: number;
  entrouMesPf: number;
  saiuMesPf: number;
  pizzaCategorias: Array<{ categoria: string; total: number }>;
}

export function calcularKpisCaixa(args: {
  recebidoMesPj: number;
  impostoMes: number;
  lancamentosMes: LancamentoKpi[];
}): KpisCaixa {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const despesasPj = args.lancamentosMes.filter((l) => l.tipo === 'despesa' && l.pf_pj === 'PJ');
  const saiuMesPj = r2(despesasPj.reduce((s, l) => s + Number(l.valor), 0));
  const entrouMesPf = r2(args.lancamentosMes.filter((l) => l.tipo === 'entrada' && l.pf_pj === 'PF')
    .reduce((s, l) => s + Number(l.valor), 0));
  const saiuMesPf = r2(args.lancamentosMes.filter((l) => l.tipo === 'despesa' && l.pf_pj === 'PF')
    .reduce((s, l) => s + Number(l.valor), 0));

  const porCategoria = new Map<string, number>();
  for (const l of despesasPj) {
    const nome = l.categoriaNome ?? 'Outros';
    porCategoria.set(nome, (porCategoria.get(nome) ?? 0) + Number(l.valor));
  }
  const pizzaCategorias = [...porCategoria]
    .map(([categoria, total]) => ({ categoria, total: r2(total) }))
    .sort((a, b) => b.total - a.total);

  return {
    saiuMesPj,
    lucroMes: r2(args.recebidoMesPj - saiuMesPj - args.impostoMes),
    entrouMesPf, saiuMesPf, pizzaCategorias,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/financeiro-caixa-kpis.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add src/modules/dashboard/caixa-kpis.ts tests/financeiro-caixa-kpis.test.ts
git commit -m "feat(dashboard): KPIs puros da Caixa de Entrada (saiu, lucro, mundo PF, pizza)"
```

---

### Task 9: Dashboard — queries + views

**Files:**
- Modify: `src/modules/dashboard/financeiro-queries.ts`
- Modify: `src/modules/dashboard/financeiro-views.ts`

- [ ] **Step 1: Estender `FinanceiroData` e `getFinanceiroData`**

Em `financeiro-queries.ts`:
1. Adicionar imports: `import { calcularKpisCaixa, type KpisCaixa } from './caixa-kpis.js';` e `import { getComprovanteUrls } from '../financeiro/comprovantes.js';`
2. Estender a interface:

```typescript
export interface LancamentoLista {
  id: string;
  tipo: 'despesa' | 'entrada';
  valor: number;
  data_evento: string;
  contraparte: string | null;
  categoriaNome: string | null;
  pf_pj: 'PF' | 'PJ' | null;
  comprovanteUrl: string | null;
}

export interface FiltrosLancamentos {
  competencia?: string;       // YYYY-MM
  categoria?: string;         // slug
  pfpj?: 'PF' | 'PJ';
  tipo?: 'despesa' | 'entrada';
}

// adicionar em FinanceiroData:
//   caixa: KpisCaixa;
//   despesasMensal: Array<{ competencia: string; total: number }>;
//   lancamentos: LancamentoLista[];
//   filtros: FiltrosLancamentos;
```

3. `getFinanceiroData` ganha o parâmetro `filtros: FiltrosLancamentos = {}` e, depois do bloco atual, busca:

```typescript
  // ---- Caixa de Entrada (Fatia 3) ----
  const { data: lancMesRaw, error: lancMesErr } = await client
    .from('financeiro_lancamentos')
    .select('tipo, valor, pf_pj, financeiro_categorias(nome)')
    .eq('status', 'confirmado').eq('competencia', comp);
  if (lancMesErr) throw new Error(`getFinanceiroData lancamentos: ${lancMesErr.message}`);
  const lancMes = (lancMesRaw ?? []).map((l) => {
    const x = l as unknown as { tipo: 'despesa' | 'entrada'; valor: number; pf_pj: 'PF' | 'PJ' | null; financeiro_categorias: { nome: string } | null };
    return { tipo: x.tipo, valor: Number(x.valor), pf_pj: x.pf_pj, categoriaNome: x.financeiro_categorias?.nome ?? null };
  });
  const caixa = calcularKpisCaixa({ recebidoMesPj: faturamentoMes, impostoMes: impostoASeparar, lancamentosMes: lancMes });

  // série mensal de despesas PJ (gráfico entrou × saiu)
  const { data: despSerieRaw } = await client
    .from('financeiro_lancamentos')
    .select('competencia, valor')
    .eq('status', 'confirmado').eq('tipo', 'despesa').eq('pf_pj', 'PJ');
  const porMesDesp = new Map<string, number>();
  for (const r of (despSerieRaw ?? []) as Array<{ competencia: string; valor: number }>) {
    porMesDesp.set(r.competencia, (porMesDesp.get(r.competencia) ?? 0) + Number(r.valor));
  }
  const despesasMensal = [...porMesDesp].map(([competencia, total]) => ({ competencia, total }))
    .sort((a, b) => a.competencia.localeCompare(b.competencia));

  // lista de lançamentos (últimos 50, com filtros via querystring)
  let q = client.from('financeiro_lancamentos')
    .select('id, tipo, valor, data_evento, contraparte, pf_pj, storage_path, financeiro_categorias(nome, slug)')
    .in('status', ['confirmado'])
    .order('data_evento', { ascending: false }).limit(50);
  if (filtros.competencia) q = q.eq('competencia', filtros.competencia);
  if (filtros.pfpj) q = q.eq('pf_pj', filtros.pfpj);
  if (filtros.tipo) q = q.eq('tipo', filtros.tipo);
  const { data: listaRaw, error: listaErr } = await q;
  if (listaErr) throw new Error(`getFinanceiroData lista: ${listaErr.message}`);
  let lista = (listaRaw ?? []).map((l) => {
    const x = l as unknown as { id: string; tipo: 'despesa' | 'entrada'; valor: number; data_evento: string; contraparte: string | null; pf_pj: 'PF' | 'PJ' | null; storage_path: string | null; financeiro_categorias: { nome: string; slug: string } | null };
    return { ...x, categoriaNome: x.financeiro_categorias?.nome ?? null, categoriaSlug: x.financeiro_categorias?.slug ?? null };
  });
  if (filtros.categoria) lista = lista.filter((l) => l.categoriaSlug === filtros.categoria);
  const urls = await getComprovanteUrls(client, lista.map((l) => l.storage_path).filter((p): p is string => Boolean(p)));
  const lancamentos: LancamentoLista[] = lista.map((l) => ({
    id: l.id, tipo: l.tipo, valor: Number(l.valor), data_evento: l.data_evento,
    contraparte: l.contraparte, categoriaNome: l.categoriaNome, pf_pj: l.pf_pj,
    comprovanteUrl: l.storage_path ? (urls[l.storage_path] ?? null) : null,
  }));
```

e devolve `caixa, despesasMensal, lancamentos, filtros` no return.

4. Na ROTA `/dashboard/financeiro` do `index.ts` (procurar `getFinanceiroData(`), passar os filtros da querystring:

```typescript
  const filtros = {
    competencia: typeof req.query.mes === 'string' ? req.query.mes : undefined,
    categoria: typeof req.query.categoria === 'string' ? req.query.categoria : undefined,
    pfpj: req.query.pfpj === 'PF' || req.query.pfpj === 'PJ' ? req.query.pfpj : undefined,
    tipo: req.query.tipo === 'despesa' || req.query.tipo === 'entrada' ? req.query.tipo : undefined,
  };
```

- [ ] **Step 2: Estender a view**

Em `financeiro-views.ts` (mantendo o padrão existente — Tailwind dark, ECharts, PT-BR):
1. Grid de KPIs vira 6 cards (adicionar após "A receber"):

```html
  <div class="card"><div class="text-xs text-gray-400">💸 Saiu no mês (PJ)</div><div class="big text-rose-300">${brl(d.caixa.saiuMesPj)}</div></div>
  <div class="card"><div class="text-xs text-gray-400">💰 Lucro do mês</div><div class="big" style="color:${d.caixa.lucroMes >= 0 ? '#34d399' : '#f87171'}">${brl(d.caixa.lucroMes)}</div>
    <div class="text-xs text-gray-500">recebido − saiu − imposto</div></div>
```

2. Card "Mundo PF" (discreto, embaixo dos gráficos):

```html
<div class="card mb-4"><div class="text-sm mb-1">👤 Mundo PF (pessoal — fora do lucro da empresa)</div>
  <div class="text-sm">Entrou: <b class="text-emerald-300">${brl(d.caixa.entrouMesPf)}</b> · Saiu: <b class="text-rose-300">${brl(d.caixa.saiuMesPf)}</b></div></div>
```

3. Gráfico entrou × saiu: trocar a série única do `graf` por duas séries (bar lado a lado), unindo `faturamentoMensal` e `despesasMensal` pelos meses:

```javascript
  const meses = [...new Set([...d.faturamentoMensal.map(x=>x.competencia), ...d.despesasMensal.map(x=>x.competencia)])].sort();
  const entrou = meses.map(m => (d.faturamentoMensal.find(x=>x.competencia===m)?.receita) ?? 0);
  const saiu = meses.map(m => (d.despesasMensal.find(x=>x.competencia===m)?.total) ?? 0);
  g.setOption({ backgroundColor:'transparent', tooltip:{trigger:'axis'}, legend:{textStyle:{color:'#9ca3af'}},
    xAxis:{type:'category', data:meses}, yAxis:{type:'value'},
    series:[{name:'Entrou', type:'bar', data:entrou, itemStyle:{color:'#22d3ee'}},
            {name:'Saiu', type:'bar', data:saiu, itemStyle:{color:'#f87171'}}] });
```

4. Pizza por categoria (novo card ao lado do Fator R):

```html
<div class="card"><div class="text-sm mb-2">Pra onde foi o dinheiro (mês, PJ)</div><div id="pizza" style="height:260px"></div></div>
```
```javascript
  const p = echarts.init(document.getElementById('pizza'), 'dark');
  p.setOption({ backgroundColor:'transparent', tooltip:{trigger:'item'},
    series:[{type:'pie', radius:['40%','70%'],
      data:d.caixa.pizzaCategorias.map(x=>({name:x.categoria, value:x.total})),
      label:{color:'#d1d5db'}}] });
  window.addEventListener('resize', ()=>p.resize());
```

5. Tabela de lançamentos (novo card no fim) com filtros como links e etiqueta PF/PJ colorida:

```html
<div class="card mt-4"><div class="text-sm mb-2">Lançamentos
  <span class="text-xs text-gray-500 ml-2">
    <a href="/dashboard/financeiro" class="text-cyan-300">[todos]</a>
    <a href="?tipo=despesa" class="text-cyan-300">[gastos]</a>
    <a href="?tipo=entrada" class="text-cyan-300">[entradas]</a>
    <a href="?pfpj=PJ" class="text-cyan-300">[PJ]</a>
    <a href="?pfpj=PF" class="text-cyan-300">[PF]</a>
  </span></div>
  <table class="w-full text-sm"><thead><tr class="text-gray-500 text-left">
  <th>Data</th><th></th><th>Valor</th><th>Quem</th><th>Categoria</th><th>PF/PJ</th><th>Doc</th></tr></thead><tbody>
  ${d.lancamentos.map((l) => `<tr class="border-t border-gray-800">
    <td>${l.data_evento.slice(8,10)}/${l.data_evento.slice(5,7)}</td>
    <td>${l.tipo === 'entrada' ? '💰' : '💸'}</td>
    <td>${brl(l.valor)}</td>
    <td>${escapeHtml(l.contraparte ?? '-')}</td>
    <td>${escapeHtml(l.categoriaNome ?? '-')}</td>
    <td><span class="px-1 rounded text-xs" style="background:${l.pf_pj === 'PJ' ? '#0e7490' : '#7c3aed'}">${l.pf_pj ?? '-'}</span></td>
    <td>${l.comprovanteUrl ? `<a href="${l.comprovanteUrl}" target="_blank" class="text-cyan-300">📎</a>` : '-'}</td>
  </tr>`).join('')}
  </tbody></table></div>
```

- [ ] **Step 3: Typecheck + suite**

Run: `npx tsc --noEmit` → 0 erros
Run: `npx vitest run` → verde

- [ ] **Step 4: Commit**

```powershell
git add src/modules/dashboard/financeiro-queries.ts src/modules/dashboard/financeiro-views.ts src/index.ts
git commit -m "feat(dashboard): financeiro mostra entrou x saiu x lucro + mundo PF + pizza + lancamentos"
```

---

### Task 10: Build marker + verificação final

**Files:**
- Modify: `src/build-info.ts`

- [ ] **Step 1: Bump do marker**

Em `src/build-info.ts`, trocar a constante por:

```typescript
export const BUILD_VERSION = 'CAIXA-ENTRADA-2026-06-11';
```

- [ ] **Step 2: Suite completa + typecheck + build**

Run: `npx tsc --noEmit` → 0 erros
Run: `npx vitest run` → tudo verde (menos as 2 pré-existentes de supabase-vincular-novo)
Run: `npm run build` (se script existir) → limpo

- [ ] **Step 3: Commit**

```powershell
git add src/build-info.ts
git commit -m "chore(financeiro): build marker CAIXA-ENTRADA-2026-06-11"
```

---

## Pós-implementação (fora do código)

1. **3 code reviews com lentes diferentes** (regra do Junior): correção, regressão (Eva cliente intacta!), segurança. Corrigir achados + re-review até fechar.
2. **Pedir autorização de push** ("manda push" explícito).
3. **Checklist de deploy pro Junior:**
   - Aplicar `Desktop\migration-047-caixa-entrada.sql` no SQL Editor do projeto `kupnsoyymulbdzakqlqc`.
   - Criar bucket **privado** `financeiro-comprovantes` no Storage do mesmo projeto.
   - Implantar no Easypanel → conferir `curl /health` = `CAIXA-ENTRADA-2026-06-11`.
   - Smoke: mandar foto de um comprovante PIX pra Eva → conferir resumo + botões → Confirmar → ver no `/dashboard/financeiro` (lançamento + comprovante + lucro).
   - Smoke 2: áudio "gastei 50 reais de gasolina hoje" → confirmar → conferir.
   - Smoke 3: "apaga o último gasto" → botão → conferir que saiu dos números.

## Riscos conhecidos / decisões

- **Custo IA:** gate Haiku roda em todo texto de admin fora de modo (~centavos); Opus só em mídia de admin e texto já confirmado como financeiro.
- **Latência extra** no texto do admin fora de modo (1 chamada Haiku ~0,5-1s antes da Eva responder). Aceitável; se incomodar, fast-follow com cache/regex.
- **Imagem de admin baixada 2×** quando não é comprovante (interceptor + fluxo normal). Leve, raro.
- **Correção de confirmado = apaga + recria** (auditável; mantém os dois no histórico).
- **Entrada PJ avulsa** exige escolher atividade (botões) — é o que garante imposto certo via motor Fatia 2.
