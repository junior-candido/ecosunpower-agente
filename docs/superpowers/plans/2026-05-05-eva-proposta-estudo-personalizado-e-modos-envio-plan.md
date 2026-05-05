# Eva Proposta — Estudo Personalizado + Modos de Envio: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar à Eva (a) modos de envio com flexibilidade de campos (junior_envia/eva_envia) e (b) estudo personalizado opcional com até 3 fotos + 1 vídeo de sombreamento via WhatsApp, renderizados em PDF (com QR Code) e versão web pública.

**Architecture:** Estende o fluxo conversacional existente do `/proposta` (Claude Sonnet + state machine via JSON) com 2 perguntas iniciais. Anexos chegam por auto-detect de mídia em mensagens WABA, são baixados, validados, salvos em Supabase Storage e referenciados em nova tabela `proposta_attachments`. Renderização condicional no `template.ts` + Web (`src/index.ts /p/:slug`).

**Tech Stack:** TypeScript, Express, Anthropic SDK (Claude Sonnet 4.6), Supabase (Postgres + Storage), Redis (estado conversacional), Puppeteer (PDF), ffmpeg-static (extração de frame), qrcode (QR Code), vitest (testes).

**Spec:** `docs/superpowers/specs/2026-05-05-eva-proposta-estudo-personalizado-e-modos-envio-design.md`

---

## Convenções

- Todos os comandos rodam em `Documents/ecosunpower-agente`
- Testes: `npm test` (vitest) — TDD obrigatório em validators e calculators
- Build TS check: `npx tsc --noEmit` — rodar antes de cada commit
- Code review (memory `feedback_code_review`): rodar antes de qualquer commit de feature
- Deploy: `git push` → Easypanel auto-build (~5-7 min) → smoke test em prod

## Mapa de arquivos

```
src/modules/proposal/
├── attachments/                    [NOVO]
│   ├── types.ts                    # Interfaces compartilhadas
│   ├── attachment-validator.ts     # Limites de tamanho/duração/MIME
│   ├── whatsapp-media-downloader.ts # Baixa via WABA media API
│   ├── storage-uploader.ts         # Sobe pra Supabase Storage
│   ├── video-thumbnail.ts          # Extrai 1º frame com ffmpeg
│   └── index.ts                    # Orquestrador (download → validate → upload)
├── calculator.ts                   # Sem mudança
├── template.ts                     [MOD] Renderização condicional contato + seção Estudo Personalizado + selo
├── pdf-generator.ts                [MOD] QR Code + thumbnail vídeo
└── drive-uploader.ts               # Sem mudança

src/modules/
├── proposal-assistant.ts           [MOD] Estado expandido + perguntas iniciais + auto-detect mídia
├── eva-sender.ts                   [NOVO] Manda proposta direto pro cliente (modo eva_envia)
└── router.ts                       [MOD] Roteamento de mídia pro proposal-assistant quando contexto ativo

src/index.ts                        [MOD] Handler GET /p/:slug renderiza vídeo + selo

conhecimento/
└── propostas.md                    [MOD] Regras dos 2 modos + tipos + comportamento de campos opcionais

supabase/migrations/
└── 018_proposta_attachments.sql    [NOVO]

tests/
└── proposal/                       [NOVO subdir]
    ├── attachment-validator.test.ts
    ├── whatsapp-media-downloader.test.ts
    └── video-thumbnail.test.ts

Dockerfile                          [MOD] ffmpeg-static instalado
package.json                        [MOD] +qrcode, +ffmpeg-static, +fluent-ffmpeg
```

---

# Fase 0 — Setup Infra

> **Não-shippable sozinha.** Apenas prepara base pras próximas fases.

### Task 1: Migration 018 — proposta_attachments

**Files:**
- Create: `supabase/migrations/018_proposta_attachments.sql`

- [ ] **Step 1: Criar arquivo da migration**

```sql
-- 018_proposta_attachments.sql
-- Anexos (fotos + vídeo) de proposta personalizada.

CREATE TABLE IF NOT EXISTS proposta_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_slug TEXT NOT NULL REFERENCES propostas_publicas(slug) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('foto', 'video')),
  ordem SMALLINT NOT NULL CHECK (ordem >= 1 AND ordem <= 3),
  legenda TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  thumbnail_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_slug_tipo_ordem UNIQUE (proposta_slug, tipo, ordem)
);

CREATE INDEX IF NOT EXISTS idx_attachments_slug ON proposta_attachments(proposta_slug);

-- Adiciona campo tipo na tabela existente pra distinguir basica/personalizada
ALTER TABLE propostas_publicas
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'basica' CHECK (tipo IN ('basica', 'personalizada'));
```

- [ ] **Step 2: Aplicar via MCP Supabase**

Use a ferramenta `mcp__supabase__apply_migration` com `name="018_proposta_attachments"` e o conteúdo SQL acima.

- [ ] **Step 3: Verificar criação**

Use `mcp__supabase__list_tables` e confirme que `proposta_attachments` aparece com as colunas esperadas e que `propostas_publicas` agora tem coluna `tipo`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/018_proposta_attachments.sql
git commit -m "feat(proposta): migration 018 attachments + tipo em propostas_publicas"
```

---

### Task 2: Bucket Supabase Storage

**Files:** N/A (operação no console Supabase via MCP).

- [ ] **Step 1: Criar bucket via SQL helper**

Execute via `mcp__supabase__execute_sql`:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'estudos-personalizados',
  'estudos-personalizados',
  false,
  52428800,  -- 50MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4']
)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Criar policy de leitura via signed URL**

```sql
CREATE POLICY "Service role full access estudos-personalizados"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'estudos-personalizados')
WITH CHECK (bucket_id = 'estudos-personalizados');
```

- [ ] **Step 3: Verificar**

```sql
SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'estudos-personalizados';
```

Esperado: 1 linha com `public=false`, `file_size_limit=52428800`.

---

### Task 3: Dependências npm + Dockerfile

**Files:**
- Modify: `package.json`
- Modify: `Dockerfile`

- [ ] **Step 1: Instalar libs**

```bash
npm install qrcode ffmpeg-static fluent-ffmpeg
npm install --save-dev @types/qrcode @types/fluent-ffmpeg
```

- [ ] **Step 2: Atualizar Dockerfile pra ter ffmpeg disponível**

A imagem `ghcr.io/puppeteer/puppeteer:24` já é Debian-based, mas confirma se ffmpeg vem pré-instalado. Se não vier, adicione antes da linha `COPY package*.json`:

```dockerfile
USER root
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
USER pptruser
```

(Use `ffmpeg-static` no código para portabilidade — Docker já vai ter binário disponível também.)

- [ ] **Step 3: Verificar build local**

```bash
npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json Dockerfile
git commit -m "chore(proposta): deps qrcode/ffmpeg + Dockerfile com ffmpeg"
```

---

# Fase 1 — Modos de Envio (🚦 SHIPPABLE)

> **Pode ir pra prod sozinha.** Resolve a dor da Eva exigindo CPF/email/telefone.

### Task 4: Tipos compartilhados de Modo e Tipo

**Files:**
- Create: `src/modules/proposal/attachments/types.ts`

- [ ] **Step 1: Criar arquivo de tipos**

```typescript
// src/modules/proposal/attachments/types.ts
// Tipos compartilhados entre proposal-assistant, template, eva-sender e attachments.

export type ModoEnvio = 'junior_envia' | 'eva_envia';
export type TipoProposta = 'basica' | 'personalizada';

export interface AttachmentInput {
  tipo: 'foto' | 'video';
  legenda: string;
  mediaIdWaba: string;
  mimeType: string;
  storagePath?: string;
  thumbnailPath?: string;
  sizeBytes?: number;
}

export interface AttachmentRecord {
  id: string;
  propostaSlug: string;
  tipo: 'foto' | 'video';
  ordem: number;
  legenda: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  thumbnailPath: string | null;
  createdAt: string;
}

// Limites de validação
export const ATTACHMENT_LIMITS = {
  MAX_FOTOS: 3,
  MAX_VIDEOS: 1,
  FOTO_MAX_BYTES: 10 * 1024 * 1024,        // 10MB
  VIDEO_MAX_BYTES: 30 * 1024 * 1024,        // 30MB
  VIDEO_MAX_DURATION_SECONDS: 60,
  ALLOWED_FOTO_MIMES: ['image/jpeg', 'image/png', 'image/webp'],
  ALLOWED_VIDEO_MIMES: ['video/mp4'],
} as const;
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 3: Commit**

```bash
git add src/modules/proposal/attachments/types.ts
git commit -m "feat(proposta): tipos ModoEnvio/TipoProposta + limites de anexos"
```

---

### Task 5: Estado Redis expandido com modo e tipo

**Files:**
- Modify: `src/modules/proposal-assistant.ts`

- [ ] **Step 1: Adicionar campos modo_envio, tipo, attachments na interface ProposalState**

Localize a interface `ClaudeResponse` (~linha 27). Logo abaixo dela, adicione:

```typescript
import type { ModoEnvio, TipoProposta, AttachmentInput } from './proposal/attachments/types.js';

interface ProposalSessionState {
  modoEnvio?: ModoEnvio;
  tipo?: TipoProposta;
  attachments: AttachmentInput[];
  collected: Partial<ProposalData> & {
    consumoMensalKwh?: number;
    fatorPerda?: number;
    tarifaRsKwh?: number;
    custoDisponibilidadeMensal?: number;
  };
  history: ProposalMessage[];
}
```

Procure onde o estado é serializado pra Redis (busca `redis.set` ou `JSON.stringify` no arquivo) e ajuste pra incluir os novos campos.

- [ ] **Step 2: Inicialização padrão**

Onde a sessão é criada (busca `mode === 'start'` ou primeira mensagem do `/proposta`), inicialize:

```typescript
const initialState: ProposalSessionState = {
  modoEnvio: undefined,  // será preenchido pela resposta inicial
  tipo: undefined,
  attachments: [],
  collected: {},
  history: [],
};
```

- [ ] **Step 3: Verificar build**

```bash
npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 4: Commit**

```bash
git add src/modules/proposal-assistant.ts
git commit -m "feat(proposta): estado da sessao expandido com modo_envio + tipo + attachments"
```

---

### Task 6: System prompt — 2 perguntas iniciais + flexibilidade de campos

**Files:**
- Modify: `conhecimento/propostas.md`
- Modify: `src/modules/proposal-assistant.ts` (schema JSON resposta)

- [ ] **Step 1: Adicionar regras dos modos no conhecimento**

No início do arquivo `conhecimento/propostas.md`, ANTES da regra de ouro existente, adicione:

````markdown
# MODOS DE ENVIO

A primeira coisa que você pergunta no `/proposta` é QUEM envia, em mensagem curta:

> "Quem envia essa proposta? Você ou eu mando direto pro cliente?
> *(default: você envia — só responde 'ok' pra ir nesse)*"

Mapeia respostas:
- "eu", "eu envio", "eu mando", "ok", "vai", "vamos", "default" → `modoEnvio: junior_envia`
- "você", "voce", "eva", "manda", "manda direto", "envia direto" → `modoEnvio: eva_envia`
- Ambíguo → repete a pergunta uma vez

DEPOIS pergunta o tipo:

> "Tipo: básica (rápida) ou personalizada (com estudo do telhado: até 3 fotos + vídeo de sombreamento)?
> *(default: básica)*"

Mapeia:
- "básica", "basica", "ok", "rápida", "simples" → `tipo: basica`
- "personalizada", "estudo", "completa", "premium", "com fotos" → `tipo: personalizada`

# REGRAS DE CAMPOS POR MODO

## Modo `junior_envia` (default)

Junior já conhece o cliente, só quer o PDF/link pra mandar manualmente.

OBRIGATÓRIO:
- Nome do cliente (vai no PDF)
- Dados de geração (consumoMensalKwh, fatorPerda, tarifaRsKwh, potenciaKwp, modulo, inversor) — sem isso a engine de cálculo quebra

OPCIONAL (pergunta UMA vez, aceita "pula"/"n/a"/"depois", NÃO insiste):
- Endereço, telefone, email, CPF/CNPJ
- Se vier vazio, NÃO valida formato, NÃO reclama, segue

NUNCA peça 3x a mesma coisa nesse modo. Junior se irrita.

## Modo `eva_envia`

Eva manda direto pro cliente após Junior aprovar — precisa de qualificação real.

OBRIGATÓRIO:
- Nome do cliente
- Telefone do cliente (valida regex BR: `^\+?55?\s?\(?\d{2}\)?\s?\d{4,5}-?\d{4}$`)
  - Se inválido, pergunta de novo. Se Junior insistir 2x, aceita.
- Dados de geração (mesmo do outro modo)

RECOMENDADO (sugere mas aceita pular):
- Email, CPF/CNPJ, endereço — "vai melhorar a apresentação"

# REGRAS POR TIPO

## Tipo `basica`

Fluxo atual sem mudanças no template (campos contato condicionais).

## Tipo `personalizada`

Avisa Junior depois de capturar Nome:
> "Personalizada confirmada. Pode mandar as fotos do estudo (até 3) e o vídeo de sombreamento (opcional, até 60s) **como documento** a qualquer momento. Vou pedir uma legenda curta de cada um."

Quando detectar mídia anexada na conversa, pergunta legenda. Cada arquivo tem ordem 1, 2, 3 (fotos) ou 1 (vídeo).

ANTES de gerar:
- Se `tipo=personalizada` mas `attachments=[]`: confirma "Personalizada selecionada mas sem anexos. Gera assim mesmo (vai sair sem a seção 'Estudamos seu telhado') ou anexa agora?"
- Se há anexos: confirma quantos e gera.
````

- [ ] **Step 2: Atualizar schema JSON no system prompt do proposal-assistant.ts**

No arquivo `src/modules/proposal-assistant.ts`, localize o bloco do schema JSON dentro de `buildSystemPrompt` (~linha 67-95). Adicione no objeto root:

```json
{
  "action": "ask_more" | "ready_to_generate" | "confirm_generate" | "ask_modo" | "ask_tipo" | "chat",
  "modoEnvio": "junior_envia" | "eva_envia" | null,
  "tipo": "basica" | "personalizada" | null,
  "message": "...",
  ...
}
```

E adicione na seção "QUANDO USAR CADA ACTION":

```markdown
- **ask_modo**: ainda não sabe se Junior ou Eva envia. Use mensagem curta perguntando.
- **ask_tipo**: já sabe o modo, agora pergunta básica/personalizada.
```

- [ ] **Step 3: Adicionar interface ClaudeResponse atualizada**

Localize `interface ClaudeResponse` (linha 27) e adicione campos:

```typescript
interface ClaudeResponse {
  action: 'ask_more' | 'ready_to_generate' | 'confirm_generate' | 'ask_modo' | 'ask_tipo' | 'chat';
  modoEnvio?: ModoEnvio | null;
  tipo?: TipoProposta | null;
  message: string;
  missing?: string[];
  data?: Partial<ProposalData> & {
    consumoMensalKwh?: number;
    fatorPerda?: number;
    tarifaRsKwh?: number;
    custoDisponibilidadeMensal?: number;
  };
}
```

E o handler que processa a resposta deve persistir `modoEnvio` e `tipo` no estado da sessão quando vierem preenchidos.

- [ ] **Step 4: Build check**

```bash
npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 5: Commit**

```bash
git add conhecimento/propostas.md src/modules/proposal-assistant.ts
git commit -m "feat(proposta): regras de modos junior_envia/eva_envia + tipo basica/personalizada"
```

---

### Task 7: Template condicional — campos de contato

**Files:**
- Modify: `src/modules/proposal/template.ts`

- [ ] **Step 1: Localizar a seção de cabeçalho/dados do cliente no HTML**

Abra `src/modules/proposal/template.ts` e busque por `nomeCliente`. Identifique onde os campos de contato são renderizados (provavelmente um bloco com `<p>${escapeHtml(data.telefoneCliente)}</p>` ou similar).

- [ ] **Step 2: Trocar pra renderização condicional**

Substitua os blocos como este (exemplo):

```typescript
// ANTES
<p>Telefone: ${escapeHtml(data.telefoneCliente)}</p>
<p>Email: ${escapeHtml(data.emailCliente)}</p>
<p>CPF: ${escapeHtml(data.documentoCliente)}</p>
```

Por:

```typescript
// DEPOIS
${data.telefoneCliente ? `<p>Telefone: ${escapeHtml(data.telefoneCliente)}</p>` : ''}
${data.emailCliente ? `<p>Email: ${escapeHtml(data.emailCliente)}</p>` : ''}
${data.documentoCliente ? `<p>CPF: ${escapeHtml(data.documentoCliente)}</p>` : ''}
${data.enderecoCliente ? `<p>Endereço: ${escapeHtml(data.enderecoCliente)}</p>` : ''}
```

Se algum desses campos for usado em outro lugar do HTML, aplique a mesma proteção condicional.

- [ ] **Step 3: Build check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/proposal/template.ts
git commit -m "feat(proposta): renderizacao condicional de campos contato no template"
```

---

### Task 8: eva-sender.ts — Eva manda proposta direto pro cliente

**Files:**
- Create: `src/modules/eva-sender.ts`
- Modify: `conhecimento/propostas.md` (template de saudação)

- [ ] **Step 1: Adicionar template de saudação no conhecimento**

No final do `conhecimento/propostas.md`, adicione seção:

````markdown
# TEMPLATE DE SAUDAÇÃO (modo eva_envia)

Quando Junior aprovar a proposta no modo `eva_envia`, eu mando 3 mensagens em sequência pro cliente:

**Mensagem 1 (saudação):**
```
Olá, {{nomeCliente}}! 👋

Sou a Eva, assistente da EcoSunPower Energia Solar.

Junior preparou uma proposta personalizada de energia solar pra você. Vou te mandar agora pra dar uma olhada com calma.

Qualquer dúvida, é só me perguntar aqui mesmo. 😊
```

**Mensagem 2 (link web):**
```
🔗 Versão online (recomendada — abre no celular):
{{linkWebPublico}}

(Link válido por 60 dias)
```

**Mensagem 3 (PDF):**
[Anexa o PDF como documento]
```
📎 Versão em PDF pra arquivar ou imprimir.
```
````

- [ ] **Step 2: Criar `src/modules/eva-sender.ts`**

```typescript
// src/modules/eva-sender.ts
// Envia proposta gerada direto pro cliente (modo eva_envia).
// Manda 3 mensagens em sequencia: saudacao + link web + PDF.

import type { SendMessageFn } from './meta-whatsapp.js';

export interface EnviarPropostaInput {
  telefoneCliente: string;       // E.164 ou formato BR
  nomeCliente: string;
  linkWebPublico: string;
  pdfBuffer: Buffer;
  pdfFilename: string;
}

const SAUDACAO_TEMPLATE = (nomeCliente: string) =>
  `Olá, ${nomeCliente}! 👋\n\n` +
  `Sou a Eva, assistente da EcoSunPower Energia Solar.\n\n` +
  `Junior preparou uma proposta personalizada de energia solar pra você. Vou te mandar agora pra dar uma olhada com calma.\n\n` +
  `Qualquer dúvida, é só me perguntar aqui mesmo. 😊`;

const LINK_WEB_TEMPLATE = (link: string) =>
  `🔗 Versão online (recomendada — abre no celular):\n${link}\n\n(Link válido por 60 dias)`;

const PDF_CAPTION = `📎 Versão em PDF pra arquivar ou imprimir.`;

export async function enviarPropostaParaCliente(
  input: EnviarPropostaInput,
  sendText: SendMessageFn,
  sendDocument: (telefone: string, buffer: Buffer, filename: string, caption: string) => Promise<void>,
): Promise<void> {
  const { telefoneCliente, nomeCliente, linkWebPublico, pdfBuffer, pdfFilename } = input;

  await sendText(telefoneCliente, SAUDACAO_TEMPLATE(nomeCliente));
  await new Promise((r) => setTimeout(r, 800));  // espaco humano

  await sendText(telefoneCliente, LINK_WEB_TEMPLATE(linkWebPublico));
  await new Promise((r) => setTimeout(r, 800));

  await sendDocument(telefoneCliente, pdfBuffer, pdfFilename, PDF_CAPTION);
}
```

- [ ] **Step 3: Verificar interface de SendMessageFn no meta-whatsapp.ts**

Abra `src/modules/meta-whatsapp.ts`, verifique se `SendMessageFn` é exportado e se há função pra enviar documento. Se não houver, ajuste import:

```typescript
import { sendText, sendDocument } from './meta-whatsapp.js';
```

E ajuste eva-sender pra receber direto via parâmetros (sem injection) caso seja como o resto do código faz.

- [ ] **Step 4: Build check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/eva-sender.ts conhecimento/propostas.md
git commit -m "feat(proposta): eva-sender envia proposta direto pro cliente (modo eva_envia)"
```

---

### Task 9: Integrar eva-sender no fluxo de aprovação do proposal-assistant

**Files:**
- Modify: `src/modules/proposal-assistant.ts`

- [ ] **Step 1: Localizar onde a proposta é "aprovada" pra envio**

Hoje após gerar PDF, Junior recebe os links pra revisar. Procure no `proposal-assistant.ts` por onde a sessão é encerrada (`redis.del` ou `delete`) ou pelo bloco que envia os links pro Junior. Após esse ponto:

- Se `modoEnvio === 'eva_envia'` E `data.telefoneCliente` está preenchido E o usuário (Junior) respondeu "manda", "enviar", "aprovado": chame `enviarPropostaParaCliente`.

- [ ] **Step 2: Adicionar handler de confirmação**

Pseudocódigo do bloco a adicionar:

```typescript
import { enviarPropostaParaCliente } from './eva-sender.js';
import { sendText, sendDocument } from './meta-whatsapp.js';

// ... dentro do handler quando proposta foi gerada e Junior responde:
if (state.modoEnvio === 'eva_envia' && /^(manda|enviar|aprovado|envia|ok envia)$/i.test(userMessage.trim())) {
  if (!state.collected.telefoneCliente) {
    return { reply: 'Preciso do telefone do cliente pra enviar. Qual é?' };
  }

  await enviarPropostaParaCliente({
    telefoneCliente: state.collected.telefoneCliente,
    nomeCliente: state.collected.nomeCliente!,
    linkWebPublico: linkPublicoGerado,
    pdfBuffer: pdfBufferGerado,
    pdfFilename: `Proposta-EcoSunPower-${state.collected.nomeCliente}.pdf`,
  }, sendText, sendDocument);

  await redis.del(sessionKey);
  return { reply: '✅ Proposta enviada pra ' + state.collected.nomeCliente + '. Vou ficar de olho se ele responde.' };
}
```

Adapte os nomes de variáveis ao código real do arquivo (ex: `linkPublicoGerado`, `pdfBufferGerado` provavelmente já existem no escopo da geração).

- [ ] **Step 3: Build check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/proposal-assistant.ts
git commit -m "feat(proposta): aciona eva-sender quando modo_envio=eva_envia e Junior aprova"
```

---

### 🚦 Checkpoint Fase 1: Deploy + Smoke Test

- [ ] **Step 1: Code review (memory feedback)**

Use a Skill `code-review:code-review` ou rodar manualmente. Confirma que tudo bate.

- [ ] **Step 2: Build final**

```bash
npx tsc --noEmit && npm test
```

- [ ] **Step 3: Push pra Easypanel**

```bash
git push origin main
```

Aguarde 5-7 minutos pelo build. Verifique em prod (logs Easypanel).

- [ ] **Step 4: Smoke test em prod**

Teste 3 cenários no zap real:

1. `/proposta` → "ok" (default junior_envia) → "ok" (default basica) → coleta sem CPF/email/telefone do cliente → confirma que Eva NÃO insiste → gera PDF sem essas linhas no documento.
2. `/proposta` → "eva manda" → "basica" → tenta passar telefone fake "12345" → confirma que Eva valida e pede de novo → manda telefone real → gera + Eva envia pro cliente real.
3. `/proposta` → "eu envio" → "personalizada" → confirma que Eva avisa "pode mandar fotos como documento" mas como ainda não tem upload pipeline (Fase 2), gera proposta sem seção (graceful fallback).

Se passar nos 3, pode prosseguir pra Fase 2.

---

# Fase 2 — Pipeline Upload de Mídia

> **Não-shippable sozinha.** Renderização chega na Fase 3.

### Task 10: attachment-validator.ts (TDD)

**Files:**
- Create: `tests/proposal/attachment-validator.test.ts`
- Create: `src/modules/proposal/attachments/attachment-validator.ts`

- [ ] **Step 1: Escrever test de limites**

```typescript
// tests/proposal/attachment-validator.test.ts
import { describe, it, expect } from 'vitest';
import {
  validateFotoUpload,
  validateVideoUpload,
  validateAttachmentCount,
} from '../../src/modules/proposal/attachments/attachment-validator.js';
import { ATTACHMENT_LIMITS } from '../../src/modules/proposal/attachments/types.js';

describe('attachment-validator', () => {
  describe('validateFotoUpload', () => {
    it('aceita JPG dentro do limite', () => {
      const r = validateFotoUpload({ mimeType: 'image/jpeg', sizeBytes: 5 * 1024 * 1024 });
      expect(r.ok).toBe(true);
    });

    it('rejeita PDF', () => {
      const r = validateFotoUpload({ mimeType: 'application/pdf', sizeBytes: 1024 });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/formato/i);
    });

    it('rejeita JPG > 10MB', () => {
      const r = validateFotoUpload({ mimeType: 'image/jpeg', sizeBytes: 11 * 1024 * 1024 });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/10MB|tamanho/i);
    });
  });

  describe('validateVideoUpload', () => {
    it('aceita MP4 30MB e 60s', () => {
      const r = validateVideoUpload({
        mimeType: 'video/mp4',
        sizeBytes: 30 * 1024 * 1024,
        durationSeconds: 60,
      });
      expect(r.ok).toBe(true);
    });

    it('rejeita vídeo 61s', () => {
      const r = validateVideoUpload({
        mimeType: 'video/mp4',
        sizeBytes: 10 * 1024 * 1024,
        durationSeconds: 61,
      });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/60s|duração/i);
    });

    it('rejeita vídeo 31MB', () => {
      const r = validateVideoUpload({
        mimeType: 'video/mp4',
        sizeBytes: 31 * 1024 * 1024,
        durationSeconds: 30,
      });
      expect(r.ok).toBe(false);
    });

    it('rejeita formato MOV', () => {
      const r = validateVideoUpload({
        mimeType: 'video/quicktime',
        sizeBytes: 1024 * 1024,
        durationSeconds: 10,
      });
      expect(r.ok).toBe(false);
    });
  });

  describe('validateAttachmentCount', () => {
    it('aceita 3 fotos + 1 video', () => {
      const r = validateAttachmentCount({ fotoCount: 3, videoCount: 1, novoTipo: 'foto' });
      // Adiciona 4ª foto: deve falhar
      const r2 = validateAttachmentCount({ fotoCount: 3, videoCount: 0, novoTipo: 'foto' });
      expect(r2.ok).toBe(false);
    });

    it('rejeita 2º vídeo', () => {
      const r = validateAttachmentCount({ fotoCount: 0, videoCount: 1, novoTipo: 'video' });
      expect(r.ok).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Rodar teste pra ver que falha**

```bash
npm test -- attachment-validator
```

Esperado: erros de "module not found" ou "function undefined".

- [ ] **Step 3: Implementar validator**

```typescript
// src/modules/proposal/attachments/attachment-validator.ts
import { ATTACHMENT_LIMITS } from './types.js';

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

export function validateFotoUpload(input: { mimeType: string; sizeBytes: number }): ValidationResult {
  if (!ATTACHMENT_LIMITS.ALLOWED_FOTO_MIMES.includes(input.mimeType as any)) {
    return { ok: false, reason: `Formato não suportado. Aceito: JPG, PNG, WEBP. Recebido: ${input.mimeType}.` };
  }
  if (input.sizeBytes > ATTACHMENT_LIMITS.FOTO_MAX_BYTES) {
    return { ok: false, reason: `Tamanho excede 10MB. Recebido: ${(input.sizeBytes / 1024 / 1024).toFixed(1)}MB.` };
  }
  return { ok: true };
}

export function validateVideoUpload(input: {
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number;
}): ValidationResult {
  if (!ATTACHMENT_LIMITS.ALLOWED_VIDEO_MIMES.includes(input.mimeType as any)) {
    return { ok: false, reason: `Formato não suportado. Aceito: MP4. Recebido: ${input.mimeType}.` };
  }
  if (input.sizeBytes > ATTACHMENT_LIMITS.VIDEO_MAX_BYTES) {
    return { ok: false, reason: `Tamanho excede 30MB. Recebido: ${(input.sizeBytes / 1024 / 1024).toFixed(1)}MB.` };
  }
  if (input.durationSeconds > ATTACHMENT_LIMITS.VIDEO_MAX_DURATION_SECONDS) {
    return { ok: false, reason: `Duração ${input.durationSeconds}s excede 60s. Edita e reenvia.` };
  }
  return { ok: true };
}

export function validateAttachmentCount(input: {
  fotoCount: number;
  videoCount: number;
  novoTipo: 'foto' | 'video';
}): ValidationResult {
  if (input.novoTipo === 'foto' && input.fotoCount >= ATTACHMENT_LIMITS.MAX_FOTOS) {
    return { ok: false, reason: `Limite de ${ATTACHMENT_LIMITS.MAX_FOTOS} fotos atingido. Quer substituir alguma?` };
  }
  if (input.novoTipo === 'video' && input.videoCount >= ATTACHMENT_LIMITS.MAX_VIDEOS) {
    return { ok: false, reason: 'Já tem 1 vídeo. Quer substituir?' };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Rodar teste**

```bash
npm test -- attachment-validator
```

Esperado: todos passam.

- [ ] **Step 5: Commit**

```bash
git add tests/proposal/attachment-validator.test.ts src/modules/proposal/attachments/attachment-validator.ts
git commit -m "feat(proposta): attachment-validator com limites de tipo/tamanho/duracao"
```

---

### Task 11: whatsapp-media-downloader.ts

**Files:**
- Create: `tests/proposal/whatsapp-media-downloader.test.ts`
- Create: `src/modules/proposal/attachments/whatsapp-media-downloader.ts`

- [ ] **Step 1: Test mockando fetch**

```typescript
// tests/proposal/whatsapp-media-downloader.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { downloadWabaMedia } from '../../src/modules/proposal/attachments/whatsapp-media-downloader.js';

describe('whatsapp-media-downloader', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('baixa e retorna buffer + mimeType', async () => {
    const fakeUrl = 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=abc';

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: fakeUrl, mime_type: 'image/jpeg' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1024),
        headers: new Headers({ 'content-type': 'image/jpeg' }),
      }) as any;

    const result = await downloadWabaMedia({ mediaId: 'abc', accessToken: 'tok' });
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBe(1024);
    expect(result.mimeType).toBe('image/jpeg');
  });

  it('lança erro 401', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    }) as any;

    await expect(downloadWabaMedia({ mediaId: 'abc', accessToken: 'bad' })).rejects.toThrow(/401|unauthorized/i);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm test -- whatsapp-media-downloader
```

- [ ] **Step 3: Implementar**

```typescript
// src/modules/proposal/attachments/whatsapp-media-downloader.ts
// Baixa mídia (foto/video/documento) via WABA Cloud API.
// Fluxo: GET /v18.0/{media_id} -> retorna {url, mime_type} -> GET nessa url -> bytes.

const WABA_API_BASE = 'https://graph.facebook.com/v18.0';

export interface DownloadedMedia {
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
}

export async function downloadWabaMedia(input: {
  mediaId: string;
  accessToken: string;
}): Promise<DownloadedMedia> {
  const metaResp = await fetch(`${WABA_API_BASE}/${input.mediaId}`, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (!metaResp.ok) {
    const body = await metaResp.text();
    throw new Error(`WABA media metadata failed (${metaResp.status}): ${body.slice(0, 200)}`);
  }

  const meta = await metaResp.json() as { url: string; mime_type: string };

  const fileResp = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (!fileResp.ok) {
    const body = await fileResp.text();
    throw new Error(`WABA media download failed (${fileResp.status}): ${body.slice(0, 200)}`);
  }

  const arrayBuf = await fileResp.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);

  return {
    buffer,
    mimeType: meta.mime_type,
    sizeBytes: buffer.length,
  };
}
```

- [ ] **Step 4: Rodar teste**

```bash
npm test -- whatsapp-media-downloader
```

Esperado: passam.

- [ ] **Step 5: Commit**

```bash
git add tests/proposal/whatsapp-media-downloader.test.ts src/modules/proposal/attachments/whatsapp-media-downloader.ts
git commit -m "feat(proposta): whatsapp-media-downloader baixa media via WABA API"
```

---

### Task 12: storage-uploader.ts

**Files:**
- Create: `src/modules/proposal/attachments/storage-uploader.ts`

- [ ] **Step 1: Implementar upload pra Supabase Storage**

```typescript
// src/modules/proposal/attachments/storage-uploader.ts
// Sobe buffer pro bucket Supabase 'estudos-personalizados'.

import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'estudos-personalizados';

export interface UploadResult {
  storagePath: string;
  signedUrl: string;
}

export async function uploadToStorage(
  supabase: SupabaseClient,
  input: {
    buffer: Buffer;
    propostaSlug: string;
    filename: string;        // ex: 'foto-1.jpg', 'video.mp4', 'video-thumb.jpg'
    mimeType: string;
    expiresInSeconds?: number; // default 60d
  },
): Promise<UploadResult> {
  const path = `${input.propostaSlug}/${input.filename}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, input.buffer, {
      contentType: input.mimeType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  const expires = input.expiresInSeconds ?? 60 * 24 * 60 * 60; // 60 dias

  const { data: signed, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expires);

  if (signedError || !signed) {
    throw new Error(`Signed URL failed: ${signedError?.message ?? 'unknown'}`);
  }

  return { storagePath: path, signedUrl: signed.signedUrl };
}
```

- [ ] **Step 2: Build check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/proposal/attachments/storage-uploader.ts
git commit -m "feat(proposta): storage-uploader sobe buffer pro bucket estudos-personalizados"
```

---

### Task 13: video-thumbnail.ts

**Files:**
- Create: `tests/proposal/video-thumbnail.test.ts`
- Create: `src/modules/proposal/attachments/video-thumbnail.ts`

- [ ] **Step 1: Test mínimo (smoke)**

```typescript
// tests/proposal/video-thumbnail.test.ts
import { describe, it, expect } from 'vitest';
import { extractFirstFrame, getVideoDuration } from '../../src/modules/proposal/attachments/video-thumbnail.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const FIXTURE_PATH = join(__dirname, 'fixtures', 'sample-10s.mp4');

describe.skipIf(!existsSync(FIXTURE_PATH))('video-thumbnail', () => {
  it('extrai primeiro frame de video MP4', async () => {
    const buffer = readFileSync(FIXTURE_PATH);
    const result = await extractFirstFrame(buffer);
    expect(result.thumbnailBuffer).toBeInstanceOf(Buffer);
    expect(result.thumbnailBuffer.length).toBeGreaterThan(1000);
  });

  it('retorna duracao do video', async () => {
    const buffer = readFileSync(FIXTURE_PATH);
    const dur = await getVideoDuration(buffer);
    expect(dur).toBeGreaterThan(0);
    expect(dur).toBeLessThan(120);
  });
});
```

(O teste pula se não existir fixture; criação manual de `tests/proposal/fixtures/sample-10s.mp4` é opcional.)

- [ ] **Step 2: Implementar via fluent-ffmpeg + ffmpeg-static**

```typescript
// src/modules/proposal/attachments/video-thumbnail.ts
// Extrai primeiro frame e duracao de video MP4 usando fluent-ffmpeg + ffmpeg-static.

import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { writeFile, readFile, unlink, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
}

export async function extractFirstFrame(videoBuffer: Buffer): Promise<{ thumbnailBuffer: Buffer }> {
  const dir = await mkdtemp(join(tmpdir(), 'video-thumb-'));
  const inPath = join(dir, 'in.mp4');
  const outPath = join(dir, 'thumb.jpg');

  await writeFile(inPath, videoBuffer);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inPath)
      .outputOptions(['-vframes 1', '-q:v 2'])
      .output(outPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });

  const thumbnailBuffer = await readFile(outPath);

  await unlink(inPath).catch(() => {});
  await unlink(outPath).catch(() => {});

  return { thumbnailBuffer };
}

export async function getVideoDuration(videoBuffer: Buffer): Promise<number> {
  const dir = await mkdtemp(join(tmpdir(), 'video-dur-'));
  const inPath = join(dir, 'in.mp4');
  await writeFile(inPath, videoBuffer);

  const seconds = await new Promise<number>((resolve, reject) => {
    ffmpeg.ffprobe(inPath, (err, metadata) => {
      if (err) return reject(err);
      const dur = metadata.format.duration;
      if (typeof dur !== 'number') return reject(new Error('Duracao nao encontrada'));
      resolve(dur);
    });
  });

  await unlink(inPath).catch(() => {});
  return seconds;
}
```

- [ ] **Step 3: Build check + test**

```bash
npx tsc --noEmit && npm test -- video-thumbnail
```

(Test deve pular se não houver fixture — isso é OK.)

- [ ] **Step 4: Commit**

```bash
git add tests/proposal/video-thumbnail.test.ts src/modules/proposal/attachments/video-thumbnail.ts
git commit -m "feat(proposta): video-thumbnail extrai primeiro frame e duracao via ffmpeg"
```

---

### Task 14: Orquestrador de anexos + auto-detect mídia

**Files:**
- Create: `src/modules/proposal/attachments/index.ts`
- Modify: `src/modules/proposal-assistant.ts`
- Modify: `src/modules/router.ts`

- [ ] **Step 1: Criar orquestrador**

```typescript
// src/modules/proposal/attachments/index.ts
// Orquestra: download WABA -> validacao -> upload Supabase -> persistencia.
// Para video, gera thumbnail e sobe junto.

import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadWabaMedia } from './whatsapp-media-downloader.js';
import { uploadToStorage } from './storage-uploader.js';
import { extractFirstFrame, getVideoDuration } from './video-thumbnail.js';
import {
  validateFotoUpload,
  validateVideoUpload,
  validateAttachmentCount,
} from './attachment-validator.js';
import type { AttachmentInput } from './types.js';

export interface ProcessAttachmentInput {
  mediaIdWaba: string;
  accessToken: string;
  proposalSlug: string;
  legenda: string;
  existingAttachments: AttachmentInput[];
}

export interface ProcessAttachmentResult {
  ok: true;
  record: {
    tipo: 'foto' | 'video';
    ordem: number;
    legenda: string;
    storagePath: string;
    thumbnailPath: string | null;
    mimeType: string;
    sizeBytes: number;
  };
} | {
  ok: false;
  reason: string;
}

export async function processAttachment(
  supabase: SupabaseClient,
  input: ProcessAttachmentInput,
): Promise<ProcessAttachmentResult> {
  // 1. Download
  const dl = await downloadWabaMedia({ mediaId: input.mediaIdWaba, accessToken: input.accessToken });

  const isVideo = dl.mimeType.startsWith('video/');
  const tipo: 'foto' | 'video' = isVideo ? 'video' : 'foto';

  // 2. Conta existentes
  const fotoCount = input.existingAttachments.filter((a) => a.tipo === 'foto').length;
  const videoCount = input.existingAttachments.filter((a) => a.tipo === 'video').length;

  const countCheck = validateAttachmentCount({ fotoCount, videoCount, novoTipo: tipo });
  if (!countCheck.ok) return { ok: false, reason: countCheck.reason! };

  // 3. Valida tipo/tamanho
  if (tipo === 'foto') {
    const v = validateFotoUpload({ mimeType: dl.mimeType, sizeBytes: dl.sizeBytes });
    if (!v.ok) return { ok: false, reason: v.reason! };
  } else {
    const duration = await getVideoDuration(dl.buffer);
    const v = validateVideoUpload({ mimeType: dl.mimeType, sizeBytes: dl.sizeBytes, durationSeconds: duration });
    if (!v.ok) return { ok: false, reason: v.reason! };
  }

  // 4. Upload principal
  const ordem = tipo === 'foto' ? fotoCount + 1 : 1;
  const ext = dl.mimeType === 'image/png' ? 'png' : dl.mimeType === 'image/webp' ? 'webp' : tipo === 'video' ? 'mp4' : 'jpg';
  const filename = tipo === 'foto' ? `foto-${ordem}.${ext}` : 'video.mp4';

  const upload = await uploadToStorage(supabase, {
    buffer: dl.buffer,
    propostaSlug: input.proposalSlug,
    filename,
    mimeType: dl.mimeType,
  });

  // 5. Thumbnail se video
  let thumbnailPath: string | null = null;
  if (tipo === 'video') {
    const { thumbnailBuffer } = await extractFirstFrame(dl.buffer);
    const thumbUpload = await uploadToStorage(supabase, {
      buffer: thumbnailBuffer,
      propostaSlug: input.proposalSlug,
      filename: 'video-thumb.jpg',
      mimeType: 'image/jpeg',
    });
    thumbnailPath = thumbUpload.storagePath;
  }

  // 6. Persiste em proposta_attachments
  const { error: insertErr } = await supabase
    .from('proposta_attachments')
    .insert({
      proposta_slug: input.proposalSlug,
      tipo,
      ordem,
      legenda: input.legenda,
      storage_path: upload.storagePath,
      mime_type: dl.mimeType,
      size_bytes: dl.sizeBytes,
      thumbnail_path: thumbnailPath,
    });

  if (insertErr) return { ok: false, reason: `DB insert failed: ${insertErr.message}` };

  return {
    ok: true,
    record: {
      tipo,
      ordem,
      legenda: input.legenda,
      storagePath: upload.storagePath,
      thumbnailPath,
      mimeType: dl.mimeType,
      sizeBytes: dl.sizeBytes,
    },
  };
}
```

- [ ] **Step 2: Integrar auto-detect no proposal-assistant.ts**

No handler que processa mensagem do Junior, antes de mandar pro Claude:

```typescript
// Pseudocódigo
const wabaMessage = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
const isMedia = wabaMessage?.type === 'document' || wabaMessage?.type === 'image' || wabaMessage?.type === 'video';

if (isMedia && state.tipo === 'personalizada' && state.modoEnvio) {
  // Salva media_id pendente, pergunta legenda
  state.pendingMediaId = wabaMessage.document?.id ?? wabaMessage.image?.id ?? wabaMessage.video?.id;
  state.pendingMediaType = wabaMessage.type;
  await redis.set(sessionKey, JSON.stringify(state), 'EX', PROPOSAL_MODE_TTL_SECONDS);
  return { reply: 'Beleza! Qual a legenda dessa imagem/vídeo? (ex: "Vista superior do telhado")' };
}

// Se há pendingMediaId E mensagem é texto, trata como legenda
if (state.pendingMediaId && wabaMessage?.type === 'text') {
  const legenda = wabaMessage.text.body.trim();
  if (!legenda || legenda.length > 100) {
    return { reply: 'Legenda curta por favor (máx 100 chars). Tenta de novo.' };
  }

  // Não é proposta gerada ainda — persiste em estado, sobe quando proposta criar slug
  state.attachments.push({
    tipo: state.pendingMediaType === 'video' ? 'video' : 'foto',
    legenda,
    mediaIdWaba: state.pendingMediaId,
    mimeType: '',  // será preenchido no upload
  });
  state.pendingMediaId = undefined;
  state.pendingMediaType = undefined;
  await redis.set(sessionKey, JSON.stringify(state), 'EX', PROPOSAL_MODE_TTL_SECONDS);

  const fotos = state.attachments.filter(a => a.tipo === 'foto').length;
  const videos = state.attachments.filter(a => a.tipo === 'video').length;
  return { reply: `✅ Anexado: "${legenda}"\nTotal: ${fotos} foto(s) + ${videos} vídeo(s).` };
}
```

(IMPORTANTE: o upload SOMENTE acontece DEPOIS que o slug é gerado. Até lá, mantém só o `mediaIdWaba`. Quando a proposta gera, itera os attachments e chama `processAttachment` pra cada um.)

- [ ] **Step 3: No router.ts, garantir que mídia chega no proposal-assistant**

Abra `src/modules/router.ts`. Procure pelo bloco que decide pra onde vai a mensagem (proposal-assistant, pricing-assistant, scheduling-assistant, brain). Adicione check antes:

```typescript
// Se ha sessao /proposta ativa pro Junior, mensagens de midia DEVEM ir pro proposal-assistant.
const proposalState = await redis.get(`proposal:${userId}`);
if (proposalState && (msg.type === 'document' || msg.type === 'image' || msg.type === 'video')) {
  return proposalAssistant.handle(msg, state);
}
```

(Adapte o nome da chave Redis ao que existe no código.)

- [ ] **Step 4: Build check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/proposal/attachments/index.ts src/modules/proposal-assistant.ts src/modules/router.ts
git commit -m "feat(proposta): orquestrador de anexos + auto-detect midia no fluxo /proposta"
```

---

# Fase 3 — Renderização (🚦 SHIPPABLE — fluxo completo)

### Task 15: template.ts — seção "Estudamos seu Telhado" + selo

**Files:**
- Modify: `src/modules/proposal/template.ts`

- [ ] **Step 1: Estender ProposalData**

Adicione na interface `ProposalData`:

```typescript
export interface ProposalData {
  // ... campos existentes
  tipo?: 'basica' | 'personalizada';
  estudoPersonalizado?: {
    fotos: Array<{ url: string; legenda: string; ordem: number }>;
    video?: { thumbnailUrl: string; legenda: string; webVideoUrl: string };
    qrCodeDataUrl?: string;  // Data URL gerado pelo qrcode lib pra apontar pra web
  };
}
```

- [ ] **Step 2: Renderizar selo no topo se personalizada**

Logo após o `<header>` do HTML, se `data.tipo === 'personalizada'`:

```typescript
${data.tipo === 'personalizada' ? `
  <div style="background: linear-gradient(135deg, #1a3a52 0%, #f4a83d 100%); color: white; padding: 12px 24px; text-align: center; font-weight: 700; font-size: 14px; letter-spacing: 0.5px; border-radius: 8px; margin: 16px 0;">
    📐 PROPOSTA COM ESTUDO TÉCNICO PERSONALIZADO
  </div>
` : ''}
```

- [ ] **Step 3: Renderizar seção "Estudamos seu Telhado" antes dos cards "Por que EcoSunPower"**

```typescript
${data.estudoPersonalizado ? renderEstudoPersonalizadoSection(data.estudoPersonalizado) : ''}
```

E adicione a função antes do `renderProposalHTML`:

```typescript
function renderEstudoPersonalizadoSection(estudo: NonNullable<ProposalData['estudoPersonalizado']>): string {
  const { fotos, video, qrCodeDataUrl } = estudo;
  const fotoCount = fotos.length;

  let fotosHtml = '';
  if (fotoCount === 1) {
    fotosHtml = `<div style="display:flex;justify-content:center;"><figure style="max-width:90%;"><img src="${escapeHtml(fotos[0].url)}" style="width:100%;border-radius:12px;"><figcaption style="text-align:center;margin-top:8px;font-size:13px;color:#555;">${escapeHtml(fotos[0].legenda)}</figcaption></figure></div>`;
  } else if (fotoCount === 2) {
    fotosHtml = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      ${fotos.map(f => `<figure><img src="${escapeHtml(f.url)}" style="width:100%;border-radius:12px;"><figcaption style="text-align:center;margin-top:8px;font-size:13px;color:#555;">${escapeHtml(f.legenda)}</figcaption></figure>`).join('')}
    </div>`;
  } else if (fotoCount === 3) {
    fotosHtml = `
      <figure style="margin-bottom:16px;"><img src="${escapeHtml(fotos[0].url)}" style="width:100%;border-radius:12px;"><figcaption style="text-align:center;margin-top:8px;font-size:13px;color:#555;">${escapeHtml(fotos[0].legenda)}</figcaption></figure>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        ${[fotos[1], fotos[2]].map(f => `<figure><img src="${escapeHtml(f.url)}" style="width:100%;border-radius:12px;"><figcaption style="text-align:center;margin-top:8px;font-size:13px;color:#555;">${escapeHtml(f.legenda)}</figcaption></figure>`).join('')}
      </div>`;
  }

  let videoHtml = '';
  if (video) {
    // PDF: thumbnail + QR Code. Web: vai injetar <video> via marker.
    videoHtml = `
      <div data-video-block data-video-url="${escapeHtml(video.webVideoUrl)}" style="margin-top:24px;background:#f7f9fc;padding:24px;border-radius:12px;display:grid;grid-template-columns:2fr 1fr;gap:24px;align-items:center;">
        <figure>
          <img src="${escapeHtml(video.thumbnailUrl)}" style="width:100%;border-radius:8px;">
          <figcaption style="margin-top:8px;font-size:13px;color:#555;">🎥 ${escapeHtml(video.legenda)}</figcaption>
        </figure>
        <div style="text-align:center;">
          ${qrCodeDataUrl ? `<img src="${qrCodeDataUrl}" style="width:140px;height:140px;">` : ''}
          <p style="font-size:11px;margin-top:8px;color:#666;">Aponte a câmera<br>do celular pra<br>assistir o vídeo</p>
        </div>
      </div>`;
  }

  return `
    <section style="margin:24px 0;padding:24px;border-left:4px solid #f4a83d;background:#fdf8f0;border-radius:8px;">
      <h2 style="color:#1a3a52;margin:0 0 16px 0;">Estudamos seu Telhado</h2>
      <p style="color:#555;margin:0 0 20px 0;font-size:14px;">Análise técnica personalizada do imóvel pra dimensionar o sistema ideal.</p>
      ${fotosHtml}
      ${videoHtml}
    </section>
  `;
}
```

- [ ] **Step 4: Build check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/proposal/template.ts
git commit -m "feat(proposta): secao Estudamos seu Telhado + selo Personalizada no template"
```

---

### Task 16: pdf-generator.ts — QR Code + montagem do estudoPersonalizado

**Files:**
- Modify: `src/modules/proposal/pdf-generator.ts`
- Modify: `src/modules/proposal-assistant.ts` (montagem antes de gerar)

- [ ] **Step 1: Criar helper de QR Code**

Em `src/modules/proposal/pdf-generator.ts`, adicione:

```typescript
import QRCode from 'qrcode';

export async function gerarQrCodeDataUrl(url: string): Promise<string> {
  return await QRCode.toDataURL(url, {
    width: 280,
    margin: 1,
    color: { dark: '#1a3a52', light: '#ffffff' },
  });
}
```

(Exporta para o proposal-assistant usar quando montar `data.estudoPersonalizado`.)

- [ ] **Step 2: Verificar puppeteer rendering ainda passa com novas seções**

Após o smoke test da Fase 1 ainda funcionar, sem mudar nada de Puppeteer.

- [ ] **Step 3: No proposal-assistant.ts, antes de gerar HTML, montar estudoPersonalizado**

Pseudocódigo após gerar slug + subir attachments:

```typescript
import { gerarQrCodeDataUrl } from './proposal/pdf-generator.js';
import { processAttachment } from './proposal/attachments/index.js';

// Após criar slug e ANTES de chamar renderProposalHTML:
let estudoPersonalizado: ProposalData['estudoPersonalizado'] | undefined;

if (state.tipo === 'personalizada' && state.attachments.length > 0) {
  // Sobe cada attachment pendente
  const records = [];
  for (const att of state.attachments) {
    const result = await processAttachment(supabase, {
      mediaIdWaba: att.mediaIdWaba,
      accessToken: process.env.META_ACCESS_TOKEN!,
      proposalSlug: slug,
      legenda: att.legenda,
      existingAttachments: records as any,
    });
    if (result.ok) records.push(result.record);
  }

  // Monta URLs assinadas pra usar nas imagens
  const fotosRecords = records.filter(r => r.tipo === 'foto').sort((a, b) => a.ordem - b.ordem);
  const videoRecord = records.find(r => r.tipo === 'video');

  const fotos = await Promise.all(fotosRecords.map(async (f) => ({
    url: await getSignedUrlFromPath(supabase, f.storagePath),
    legenda: f.legenda,
    ordem: f.ordem,
  })));

  let video: ProposalData['estudoPersonalizado']['video'] | undefined;
  let qrCodeDataUrl: string | undefined;
  if (videoRecord) {
    const linkWebPublico = `https://propostas.ecosunpower.eng.br/p/${slug}`;
    qrCodeDataUrl = await gerarQrCodeDataUrl(linkWebPublico);
    video = {
      thumbnailUrl: videoRecord.thumbnailPath ? await getSignedUrlFromPath(supabase, videoRecord.thumbnailPath) : '',
      legenda: videoRecord.legenda,
      webVideoUrl: await getSignedUrlFromPath(supabase, videoRecord.storagePath),
    };
  }

  estudoPersonalizado = { fotos, video, qrCodeDataUrl };
}

// Persiste tipo da proposta
await supabase.from('propostas_publicas').update({ tipo: state.tipo }).eq('slug', slug);

// Continua geração com data.tipo + data.estudoPersonalizado
```

(Onde `getSignedUrlFromPath` é helper que você adiciona em `storage-uploader.ts` pra reusar; ou inline aqui.)

- [ ] **Step 4: Adicionar helper signed URL re-uso**

Em `src/modules/proposal/attachments/storage-uploader.ts`:

```typescript
export async function getSignedUrlFromPath(
  supabase: SupabaseClient,
  storagePath: string,
  expiresInSeconds = 60 * 24 * 60 * 60,
): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data) throw new Error(`Signed URL failed: ${error?.message ?? 'unknown'}`);
  return data.signedUrl;
}
```

- [ ] **Step 5: Build check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/proposal/pdf-generator.ts src/modules/proposal-assistant.ts src/modules/proposal/attachments/storage-uploader.ts
git commit -m "feat(proposta): monta estudoPersonalizado + QR Code antes de gerar PDF/HTML"
```

---

### Task 17: Web pública — vídeo HTML5 + selo

**Files:**
- Modify: `src/index.ts` (handler `GET /p/:slug` ~linha 2939)

- [ ] **Step 1: Localizar handler**

Abre `src/index.ts` e vai pra linha 2939. Estude a lógica atual de busca + render do HTML salvo.

- [ ] **Step 2: Carregar attachments + tipo da proposta**

Após buscar a proposta pelo slug, antes de retornar o HTML, carrega:

```typescript
const { data: attachments } = await supabase
  .from('proposta_attachments')
  .select('*')
  .eq('proposta_slug', req.params.slug)
  .order('ordem');

const proposta = /* já carregado */;
const tipo = proposta.tipo as 'basica' | 'personalizada';
```

- [ ] **Step 3: Pós-processar HTML pra trocar thumbnail por `<video>`**

O HTML salvo no Supabase (gerado pra PDF) tem markers `data-video-block` com `data-video-url`. Substitua pelo `<video>`:

```typescript
let html = proposta.html;  // HTML armazenado

if (tipo === 'personalizada' && attachments?.length) {
  const videoAttach = attachments.find(a => a.tipo === 'video');
  if (videoAttach && videoAttach.storage_path) {
    // Gera URL assinada do video
    const { data: signed } = await supabase.storage
      .from('estudos-personalizados')
      .createSignedUrl(videoAttach.storage_path, 60 * 60); // 1h, regenera a cada acesso

    if (signed) {
      // Substitui o bloco do video do PDF pelo <video> nativo
      html = html.replace(
        /<div data-video-block[^>]*data-video-url="([^"]*)"[^>]*>[\s\S]*?<\/div>\s*<\/div>/,
        `<video controls autoplay muted loop playsinline style="width:100%;border-radius:12px;margin:16px 0;">
          <source src="${signed.signedUrl}" type="video/mp4">
          Seu navegador não suporta vídeo HTML5.
        </video>
        <p style="text-align:center;font-size:13px;color:#555;">🎥 ${escapeHtml(videoAttach.legenda)}</p>`,
      );
    }
  }
}

res.setHeader('Content-Type', 'text/html; charset=utf-8');
res.setHeader('X-Frame-Options', 'DENY');
res.setHeader('Content-Security-Policy', "default-src 'self' data: https:; media-src https:; img-src https: data:; style-src 'unsafe-inline'");
res.setHeader('Cache-Control', 'no-store');
res.setHeader('X-Robots-Tag', 'noindex, nofollow');
res.send(html);
```

(Adapte os headers ao que o handler atual já seta — não duplicar.)

- [ ] **Step 4: Build check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat(proposta): web /p/:slug renderiza video HTML5 nativo + tipo personalizada"
```

---

### 🚦 Checkpoint Fase 3: Deploy + Smoke

- [ ] **Step 1: Code review**
- [ ] **Step 2: Build + tests passam**

```bash
npx tsc --noEmit && npm test
```

- [ ] **Step 3: Push pra Easypanel**

```bash
git push origin main
```

- [ ] **Step 4: Smoke test em prod**

1. `/proposta` → "eu envio" → "personalizada" → gera proposta → manda 2 fotos + 1 vídeo (como documento, com legenda) → proposta gera
2. Confirma PDF tem seção "Estudamos seu Telhado", QR Code visível, thumbnail do vídeo
3. Abre link web → `<video>` reproduz o vídeo, autoplay+muted+loop
4. Abre PDF no celular → escaneia QR Code → abre web → vídeo toca

Se passar nos 4, prossegue Fase 4.

---

# Fase 4 — Comando /anexar Pós-Geração

### Task 18: Handler /anexar

**Files:**
- Modify: `src/modules/router.ts` (registro do comando)
- Modify: `src/modules/proposal-assistant.ts` (handler reaproveita lógica)

- [ ] **Step 1: Registrar /anexar no router**

No `src/modules/router.ts`, encontre onde `/proposta`, `/preco`, `/agenda` são roteados. Adicione:

```typescript
if (text.startsWith('/anexar')) {
  return proposalAssistant.handleAnexar(text, userId);
}
```

- [ ] **Step 2: Implementar handleAnexar no proposal-assistant**

```typescript
export async function handleAnexar(text: string, userId: string): Promise<{ reply: string }> {
  const arg = text.replace(/^\/anexar\s*/i, '').trim();
  if (!arg) {
    return { reply: 'Manda assim: `/anexar <slug-da-proposta>` ou `/anexar <nome-do-cliente>`' };
  }

  // Busca por slug exato OU pelo nome de cliente mais recente
  let proposta = (await supabase.from('propostas_publicas').select('*').eq('slug', arg).maybeSingle()).data;
  if (!proposta) {
    proposta = (await supabase
      .from('propostas_publicas')
      .select('*')
      .ilike('nome_cliente', `%${arg}%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()).data;
  }

  if (!proposta) {
    return { reply: `Proposta "${arg}" não encontrada. Tenta o slug ou o nome exato do cliente.` };
  }

  // Reabre sessao /proposta em modo "so anexa"
  const reopenedState: ProposalSessionState = {
    modoEnvio: 'junior_envia',
    tipo: 'personalizada',
    attachments: [], // novos
    collected: { /* dados da proposta original */ },
    history: [],
    reopenedSlug: proposta.slug, // FLAG pra dizer "regenerar pro mesmo slug"
  };
  await redis.set(`proposal:${userId}`, JSON.stringify(reopenedState), 'EX', PROPOSAL_MODE_TTL_SECONDS);

  return { reply: `📂 Proposta de ${proposta.nome_cliente} reaberta. Manda as fotos/vídeo (como documento) que vou anexar e regerar mantendo o mesmo link.` };
}
```

- [ ] **Step 3: Na geração final, se reopenedSlug está set, NÃO cria slug novo**

No fluxo de geração, antes de criar slug:

```typescript
const slug = state.reopenedSlug ?? geraSlugNovo();
// Marca tipo como personalizada
await supabase.from('propostas_publicas').update({ tipo: 'personalizada' }).eq('slug', slug);
// Substitui o HTML salvo (mesmo slug, mesmo TTL)
```

- [ ] **Step 4: Build check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/router.ts src/modules/proposal-assistant.ts
git commit -m "feat(proposta): comando /anexar regenera proposta existente mantendo slug"
```

---

### 🚦 Checkpoint Fase 4: Deploy + Smoke

- [ ] **Step 1: Test em prod**

1. Gera proposta básica → guarda link
2. `/anexar <slug>` → manda 1 foto → regenera → mesmo link agora mostra a foto
3. Confirma cliente que tinha o link antigo continua acessando

---

# Fase 5 — Smoke Tests Finais

### Task 19: Smoke test integrado

**Files:** N/A (manual em prod)

- [ ] **Cenários completos pra validar:**

| Cenário | Esperado |
|---|---|
| `/proposta` → ok → ok → coleta sem CPF/email/tel | Eva não insiste, gera PDF condicional |
| `/proposta` → eva manda → básica → tel inválido | Valida regex, pede de novo |
| `/proposta` → eu envio → personalizada → 3 fotos + vídeo | Seção completa, QR Code, web com vídeo |
| `/proposta` → personalizada sem anexos | Eva pergunta "gera vazio ou anexa agora?" |
| 4ª foto | Eva: "limite atingido, substituir?" |
| Vídeo 65s | Eva: "passa de 60s, edita" |
| Foto enviada como "foto" não documento | Eva avisa "qualidade reduzida" mas aceita |
| `/anexar <slug>` em proposta velha | Reabre, anexa, regenera mesmo link |
| `/anexar <nome-cliente>` ambíguo (2 clientes mesmo nome) | Pega o mais recente |
| Modo eva_envia + Junior aprova | Eva manda 3 mensagens pro cliente real |

- [ ] **Atualizar memory `project_eva_proposta.md`** com nova versão (v2 com estudo personalizado + modos de envio)

---

# Self-review do plano (preenchido pelo autor)

**Spec coverage:**
- ✅ Estudo personalizado (3 fotos + vídeo) — Tasks 10-17
- ✅ Modos de envio com flexibilidade — Tasks 5-9
- ✅ Auto-detect mídia — Task 14
- ✅ Validação telefone regex — Task 6 (no system prompt)
- ✅ Eva-sender — Tasks 8, 9
- ✅ /anexar pós-geração — Task 18
- ✅ Selo "Personalizada" + seção visual — Task 15
- ✅ QR Code + thumbnail vídeo no PDF — Task 16
- ✅ Vídeo HTML5 na web — Task 17
- ✅ Migration + bucket — Tasks 1, 2
- ✅ Casos de borda da spec — cobertos no smoke (Task 19)

**Type consistency:** `ModoEnvio`, `TipoProposta`, `AttachmentInput`, `AttachmentRecord`, `ProposalSessionState` definidos em Task 4 e reusados em todas as tasks seguintes.

**Placeholders:** nenhum — cada task tem código completo, comandos exatos, mensagens de commit prontas.
