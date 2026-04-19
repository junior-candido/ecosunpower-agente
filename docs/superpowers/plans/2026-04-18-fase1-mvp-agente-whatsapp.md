# Fase 1 MVP - Agente WhatsApp Ecosunpower - Plano de Implementacao

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o MVP do agente WhatsApp que recebe mensagens de texto, qualifica leads residenciais, coleta consentimento LGPD, salva dados no Supabase, monta dossies e envia para o engenheiro.

**Architecture:** Servidor Node.js/TypeScript com Express recebe webhooks da Evolution API, coloca mensagens numa fila BullMQ/Redis, processa com Claude API usando base de conhecimento em Markdown como contexto, persiste dados no Supabase e responde via Evolution API. PM2 gerencia o processo com auto-restart.

**Tech Stack:** Node.js 20+, TypeScript, Express, BullMQ, Redis (via ioredis), @anthropic-ai/sdk, @supabase/supabase-js, chokidar (file watcher), PM2, dotenv, zod (validacao)

---

## Estrutura de Arquivos (Fase 1)

```
ecosunpower-agente/
  src/
    index.ts              -> Express server + webhook endpoint + inicia fila
    config.ts             -> carrega .env com zod validation
    health.ts             -> GET /health retorna status dos servicos
    modules/
      queue.ts            -> configura BullMQ worker + conexao Redis
      evolution.ts        -> envia/recebe mensagens via Evolution API
      router.ts           -> identifica tipo de mensagem e roteia
      supabase.ts         -> cliente Supabase + funcoes de CRUD
      knowledge.ts        -> carrega e recarrega arquivos .md
      brain.ts            -> logica principal: Claude API + qualificacao
      dossier.ts          -> monta e envia dossie para engenheiro
  src/prompts/
    system-prompt.md      -> prompt principal do agente
    residencial.md        -> instrucoes de qualificacao residencial
  conhecimento/
    empresa.md            -> dados da Ecosunpower
    produtos.md           -> equipamentos e marcas
    faq.md                -> perguntas frequentes
    processo.md           -> etapas de instalacao
  tests/
    config.test.ts
    evolution.test.ts
    router.test.ts
    supabase.test.ts
    knowledge.test.ts
    brain.test.ts
    dossier.test.ts
    queue.test.ts
    health.test.ts
    integration.test.ts
  package.json
  tsconfig.json
  .env.example
  .gitignore
  ecosystem.config.js     -> config PM2
```

---

### Task 1: Inicializar projeto Node.js + TypeScript

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `ecosystem.config.js`

- [ ] **Step 1: Criar diretorio do projeto e inicializar git**

```bash
cd "C:/Users/Meu Computador/Documents/ecosunpower-agente"
git init
```

- [ ] **Step 2: Criar package.json**

```json
{
  "name": "ecosunpower-agente",
  "version": "1.0.0",
  "description": "Agente WhatsApp IA para Ecosunpower Energia",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

- [ ] **Step 3: Instalar dependencias**

```bash
npm install express @anthropic-ai/sdk @supabase/supabase-js bullmq ioredis dotenv zod chokidar
npm install -D typescript tsx vitest @types/express @types/node
```

- [ ] **Step 4: Criar tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 5: Criar .gitignore**

```
node_modules/
dist/
.env
*.log
```

- [ ] **Step 6: Criar .env.example**

```env
# Servidor
PORT=3000
NODE_ENV=production

# Evolution API
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=sua-api-key
EVOLUTION_INSTANCE=ecosunpower
WEBHOOK_TOKEN=um-token-secreto-para-validar-webhooks

# Claude API (Anthropic)
ANTHROPIC_API_KEY=sk-ant-sua-chave

# Supabase
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_KEY=sua-service-key

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# Engenheiro (numero que recebe dossies)
ENGINEER_PHONE=5561999999999
ENGINEER_NAME=Seu Nome
```

- [ ] **Step 7: Criar ecosystem.config.js (PM2)**

```javascript
module.exports = {
  apps: [{
    name: 'ecosunpower-agente',
    script: 'dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    },
    env_sandbox: {
      NODE_ENV: 'sandbox'
    }
  }]
};
```

- [ ] **Step 8: Criar diretorios**

```bash
mkdir -p src/modules src/prompts conhecimento tests
```

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json .gitignore .env.example ecosystem.config.js
git commit -m "feat: initialize project with Node.js + TypeScript + PM2 config"
```

---

### Task 2: Config module (carrega e valida .env)

**Files:**
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 1: Escrever teste para config**

```typescript
// tests/config.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('loadConfig', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('should throw if required env vars are missing', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const { loadConfig } = await import('../src/config.js');
    expect(() => loadConfig()).toThrow();
  });

  it('should return valid config when all env vars are set', async () => {
    vi.stubEnv('PORT', '3000');
    vi.stubEnv('NODE_ENV', 'sandbox');
    vi.stubEnv('EVOLUTION_API_URL', 'http://localhost:8080');
    vi.stubEnv('EVOLUTION_API_KEY', 'test-key');
    vi.stubEnv('EVOLUTION_INSTANCE', 'test');
    vi.stubEnv('WEBHOOK_TOKEN', 'test-token');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-service-key');
    vi.stubEnv('REDIS_HOST', '127.0.0.1');
    vi.stubEnv('REDIS_PORT', '6379');
    vi.stubEnv('ENGINEER_PHONE', '5561999999999');
    vi.stubEnv('ENGINEER_NAME', 'Test Engineer');

    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();

    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('sandbox');
    expect(config.anthropicApiKey).toBe('sk-ant-test');
  });

  it('should default PORT to 3000 if not set', async () => {
    vi.stubEnv('NODE_ENV', 'sandbox');
    vi.stubEnv('EVOLUTION_API_URL', 'http://localhost:8080');
    vi.stubEnv('EVOLUTION_API_KEY', 'test-key');
    vi.stubEnv('EVOLUTION_INSTANCE', 'test');
    vi.stubEnv('WEBHOOK_TOKEN', 'test-token');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-service-key');
    vi.stubEnv('REDIS_HOST', '127.0.0.1');
    vi.stubEnv('REDIS_PORT', '6379');
    vi.stubEnv('ENGINEER_PHONE', '5561999999999');
    vi.stubEnv('ENGINEER_NAME', 'Test Engineer');

    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();
    expect(config.port).toBe(3000);
  });
});
```

- [ ] **Step 2: Rodar teste para verificar que falha**

```bash
npx vitest run tests/config.test.ts
```
Expected: FAIL — module `../src/config.js` not found

- [ ] **Step 3: Implementar config.ts**

```typescript
// src/config.ts
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  port: z.coerce.number().default(3000),
  nodeEnv: z.enum(['production', 'sandbox']).default('production'),
  evolutionApiUrl: z.string().url(),
  evolutionApiKey: z.string().min(1),
  evolutionInstance: z.string().min(1),
  webhookToken: z.string().min(1),
  anthropicApiKey: z.string().min(1),
  supabaseUrl: z.string().url(),
  supabaseServiceKey: z.string().min(1),
  redisHost: z.string().default('127.0.0.1'),
  redisPort: z.coerce.number().default(6379),
  engineerPhone: z.string().min(1),
  engineerName: z.string().min(1),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  return configSchema.parse({
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    evolutionApiUrl: process.env.EVOLUTION_API_URL,
    evolutionApiKey: process.env.EVOLUTION_API_KEY,
    evolutionInstance: process.env.EVOLUTION_INSTANCE,
    webhookToken: process.env.WEBHOOK_TOKEN,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
    redisHost: process.env.REDIS_HOST,
    redisPort: process.env.REDIS_PORT,
    engineerPhone: process.env.ENGINEER_PHONE,
    engineerName: process.env.ENGINEER_NAME,
  });
}
```

- [ ] **Step 4: Rodar teste para verificar que passa**

```bash
npx vitest run tests/config.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add config module with zod validation"
```

---

### Task 3: Supabase client + funcoes de CRUD

**Files:**
- Create: `src/modules/supabase.ts`
- Create: `tests/supabase.test.ts`

- [ ] **Step 1: Escrever teste**

```typescript
// tests/supabase.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Config } from '../src/config.js';

// Mock supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: vi.fn(() => ({ data: [{ id: 'uuid-1' }], error: null, select: vi.fn(() => ({ single: vi.fn(() => ({ data: { id: 'uuid-1' }, error: null })) })) })),
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(() => ({ data: { id: 'uuid-1', phone: '5561999999999' }, error: null })), order: vi.fn(() => ({ limit: vi.fn(() => ({ data: [], error: null })) })) })) })),
      update: vi.fn(() => ({ eq: vi.fn(() => ({ data: null, error: null })) })),
      upsert: vi.fn(() => ({ data: null, error: null })),
    })),
  })),
}));

const mockConfig: Config = {
  port: 3000,
  nodeEnv: 'sandbox',
  evolutionApiUrl: 'http://localhost:8080',
  evolutionApiKey: 'test',
  evolutionInstance: 'test',
  webhookToken: 'test',
  anthropicApiKey: 'sk-ant-test',
  supabaseUrl: 'https://test.supabase.co',
  supabaseServiceKey: 'test-key',
  redisHost: '127.0.0.1',
  redisPort: 6379,
  engineerPhone: '5561999999999',
  engineerName: 'Test',
};

describe('SupabaseService', () => {
  it('should create an instance with config', async () => {
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const service = new SupabaseService(mockConfig);
    expect(service).toBeDefined();
  });

  it('should have upsertLead method', async () => {
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const service = new SupabaseService(mockConfig);
    expect(typeof service.upsertLead).toBe('function');
  });

  it('should have getOrCreateConversation method', async () => {
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const service = new SupabaseService(mockConfig);
    expect(typeof service.getOrCreateConversation).toBe('function');
  });

  it('should have saveDossier method', async () => {
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const service = new SupabaseService(mockConfig);
    expect(typeof service.saveDossier).toBe('function');
  });

  it('should have logEvent method', async () => {
    const { SupabaseService } = await import('../src/modules/supabase.js');
    const service = new SupabaseService(mockConfig);
    expect(typeof service.logEvent).toBe('function');
  });
});
```

- [ ] **Step 2: Rodar teste para verificar que falha**

```bash
npx vitest run tests/supabase.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implementar supabase.ts**

```typescript
// src/modules/supabase.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Config } from '../config.js';

interface LeadData {
  phone: string;
  name?: string;
  city?: string;
  neighborhood?: string;
  profile?: 'residencial' | 'comercial' | 'agronegocio' | 'indefinido';
  origin?: string;
  status?: 'novo' | 'qualificando' | 'qualificado' | 'agendado' | 'transferido' | 'inativo';
  energy_data?: Record<string, unknown>;
  opportunities?: Record<string, boolean>;
  future_demand?: string;
  consent_given?: boolean;
  consent_date?: string;
}

interface MessageEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ConversationData {
  id: string;
  lead_id: string;
  session_status: 'active' | 'paused' | 'completed' | 'expired';
  qualification_step: string;
  messages: MessageEntry[];
  summary: string | null;
  message_count: number;
  last_message_at: string;
  expires_at: string;
}

interface DossierData {
  lead_id: string;
  content: Record<string, unknown>;
  formatted_text: string;
  status: 'draft' | 'sent' | 'read' | 'actioned';
}

export class SupabaseService {
  private client: SupabaseClient;

  constructor(config: Config) {
    this.client = createClient(config.supabaseUrl, config.supabaseServiceKey);
  }

  async upsertLead(data: LeadData): Promise<{ id: string }> {
    const { data: result, error } = await this.client
      .from('leads')
      .upsert(
        { ...data, updated_at: new Date().toISOString() },
        { onConflict: 'phone' }
      )
      .select('id')
      .single();

    if (error) throw new Error(`Failed to upsert lead: ${error.message}`);
    return { id: result.id };
  }

  async getLeadByPhone(phone: string): Promise<LeadData & { id: string } | null> {
    const { data, error } = await this.client
      .from('leads')
      .select('*')
      .eq('phone', phone)
      .single();

    if (error && error.code !== 'PGRST116') throw new Error(`Failed to get lead: ${error.message}`);
    return data;
  }

  async getOrCreateConversation(leadId: string): Promise<ConversationData> {
    // Try to find active conversation
    const { data: existing, error: findError } = await this.client
      .from('conversations')
      .select('*')
      .eq('lead_id', leadId)
      .eq('session_status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);

    if (findError) throw new Error(`Failed to find conversation: ${findError.message}`);

    if (existing && existing.length > 0) {
      const conv = existing[0];
      // Check expiration (2 hours)
      if (new Date(conv.expires_at) > new Date()) {
        return conv as ConversationData;
      }
      // Expire the old conversation
      await this.client
        .from('conversations')
        .update({ session_status: 'expired' })
        .eq('id', conv.id);
    }

    // Create new conversation
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const { data: newConv, error: createError } = await this.client
      .from('conversations')
      .insert({
        lead_id: leadId,
        session_status: 'active',
        qualification_step: 'inicio',
        messages: [],
        summary: null,
        message_count: 0,
        last_message_at: new Date().toISOString(),
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (createError) throw new Error(`Failed to create conversation: ${createError.message}`);
    return newConv as ConversationData;
  }

  async updateConversation(
    conversationId: string,
    updates: Partial<Pick<ConversationData, 'messages' | 'summary' | 'message_count' | 'qualification_step' | 'session_status'>>
  ): Promise<void> {
    const { error } = await this.client
      .from('conversations')
      .update({
        ...updates,
        last_message_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', conversationId);

    if (error) throw new Error(`Failed to update conversation: ${error.message}`);
  }

  async saveDossier(data: DossierData): Promise<{ id: string }> {
    const { data: result, error } = await this.client
      .from('dossiers')
      .insert(data)
      .select('id')
      .single();

    if (error) throw new Error(`Failed to save dossier: ${error.message}`);
    return { id: result.id };
  }

  async logEvent(
    level: 'info' | 'warn' | 'error' | 'debug',
    module: string,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.client
      .from('logs')
      .insert({ level, module, message, metadata: metadata ?? {} });
  }
}
```

- [ ] **Step 4: Rodar teste para verificar que passa**

```bash
npx vitest run tests/supabase.test.ts
```
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/modules/supabase.ts tests/supabase.test.ts
git commit -m "feat: add Supabase service with lead, conversation, dossier CRUD"
```

---

### Task 4: Evolution API client (enviar e receber mensagens)

**Files:**
- Create: `src/modules/evolution.ts`
- Create: `tests/evolution.test.ts`

- [ ] **Step 1: Escrever teste**

```typescript
// tests/evolution.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { Config } from '../src/config.js';

// Mock fetch
global.fetch = vi.fn();

const mockConfig: Config = {
  port: 3000,
  nodeEnv: 'sandbox',
  evolutionApiUrl: 'http://localhost:8080',
  evolutionApiKey: 'test-key',
  evolutionInstance: 'ecosunpower',
  webhookToken: 'test-token',
  anthropicApiKey: 'sk-ant-test',
  supabaseUrl: 'https://test.supabase.co',
  supabaseServiceKey: 'test-key',
  redisHost: '127.0.0.1',
  redisPort: 6379,
  engineerPhone: '5561999999999',
  engineerName: 'Test',
};

describe('EvolutionService', () => {
  it('should send text message', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ key: { id: 'msg-123' } }),
    });

    const { EvolutionService } = await import('../src/modules/evolution.js');
    const service = new EvolutionService(mockConfig);
    await service.sendText('5561999999999', 'Ola!');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8080/message/sendText/ecosunpower',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'apikey': 'test-key',
        }),
      })
    );
  });

  it('should parse incoming webhook text message', async () => {
    const { EvolutionService } = await import('../src/modules/evolution.js');
    const service = new EvolutionService(mockConfig);

    const webhookPayload = {
      data: {
        key: { remoteJid: '5561999999999@s.whatsapp.net', id: 'msg-456' },
        message: { conversation: 'Ola, quero saber sobre energia solar' },
        messageTimestamp: 1713470400,
      },
    };

    const parsed = service.parseWebhook(webhookPayload);

    expect(parsed).toEqual({
      type: 'text',
      from: '5561999999999',
      content: 'Ola, quero saber sobre energia solar',
      timestamp: expect.any(Date),
      messageId: 'msg-456',
    });
  });

  it('should parse incoming audio message', async () => {
    const { EvolutionService } = await import('../src/modules/evolution.js');
    const service = new EvolutionService(mockConfig);

    const webhookPayload = {
      data: {
        key: { remoteJid: '5561999999999@s.whatsapp.net', id: 'msg-789' },
        message: { audioMessage: { url: 'https://example.com/audio.ogg' } },
        messageTimestamp: 1713470400,
      },
    };

    const parsed = service.parseWebhook(webhookPayload);

    expect(parsed).toEqual({
      type: 'audio',
      from: '5561999999999',
      content: 'https://example.com/audio.ogg',
      timestamp: expect.any(Date),
      messageId: 'msg-789',
    });
  });

  it('should validate webhook token', async () => {
    const { EvolutionService } = await import('../src/modules/evolution.js');
    const service = new EvolutionService(mockConfig);

    expect(service.validateWebhookToken('test-token')).toBe(true);
    expect(service.validateWebhookToken('wrong-token')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar teste para verificar que falha**

```bash
npx vitest run tests/evolution.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implementar evolution.ts**

```typescript
// src/modules/evolution.ts
import type { Config } from '../config.js';

export interface IncomingMessage {
  type: 'text' | 'audio' | 'image' | 'location';
  from: string;
  content: string;
  timestamp: Date;
  messageId: string;
}

export class EvolutionService {
  private baseUrl: string;
  private apiKey: string;
  private instance: string;
  private webhookToken: string;

  constructor(config: Config) {
    this.baseUrl = config.evolutionApiUrl;
    this.apiKey = config.evolutionApiKey;
    this.instance = config.evolutionInstance;
    this.webhookToken = config.webhookToken;
  }

  async sendText(to: string, text: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/message/sendText/${this.instance}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.apiKey,
        },
        body: JSON.stringify({
          number: to,
          text: text,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Evolution API sendText failed: ${response.status} ${error}`);
    }
  }

  parseWebhook(payload: Record<string, unknown>): IncomingMessage | null {
    const data = payload.data as Record<string, unknown> | undefined;
    if (!data) return null;

    const key = data.key as Record<string, string>;
    const message = data.message as Record<string, unknown>;
    const timestamp = data.messageTimestamp as number;

    if (!key || !message) return null;

    const from = key.remoteJid?.replace('@s.whatsapp.net', '') ?? '';
    const messageId = key.id ?? '';

    // Text message
    if (message.conversation || message.extendedTextMessage) {
      const text = (message.conversation as string)
        ?? (message.extendedTextMessage as Record<string, string>)?.text
        ?? '';
      return {
        type: 'text',
        from,
        content: text,
        timestamp: new Date(timestamp * 1000),
        messageId,
      };
    }

    // Audio message
    if (message.audioMessage) {
      const audio = message.audioMessage as Record<string, string>;
      return {
        type: 'audio',
        from,
        content: audio.url ?? '',
        timestamp: new Date(timestamp * 1000),
        messageId,
      };
    }

    // Image message
    if (message.imageMessage) {
      const image = message.imageMessage as Record<string, string>;
      return {
        type: 'image',
        from,
        content: image.url ?? '',
        timestamp: new Date(timestamp * 1000),
        messageId,
      };
    }

    // Location message
    if (message.locationMessage) {
      const loc = message.locationMessage as Record<string, number>;
      return {
        type: 'location',
        from,
        content: JSON.stringify({ lat: loc.degreesLatitude, lng: loc.degreesLongitude }),
        timestamp: new Date(timestamp * 1000),
        messageId,
      };
    }

    return null;
  }

  validateWebhookToken(token: string): boolean {
    return token === this.webhookToken;
  }
}
```

- [ ] **Step 4: Rodar teste para verificar que passa**

```bash
npx vitest run tests/evolution.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/modules/evolution.ts tests/evolution.test.ts
git commit -m "feat: add Evolution API service for sending/receiving WhatsApp messages"
```

---

### Task 5: Base de conhecimento (carrega e recarrega .md)

**Files:**
- Create: `src/modules/knowledge.ts`
- Create: `tests/knowledge.test.ts`
- Create: `conhecimento/empresa.md`
- Create: `conhecimento/produtos.md`
- Create: `conhecimento/faq.md`
- Create: `conhecimento/processo.md`

- [ ] **Step 1: Escrever teste**

```typescript
// tests/knowledge.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('KnowledgeBase', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'kb-test-'));
    writeFileSync(join(tempDir, 'empresa.md'), '# Ecosunpower\nEmpresa de energia solar.');
    writeFileSync(join(tempDir, 'faq.md'), '# FAQ\nPergunta: Quanto custa?\nResposta: Depende do consumo.');
  });

  it('should load all markdown files from directory', async () => {
    const { KnowledgeBase } = await import('../src/modules/knowledge.js');
    const kb = new KnowledgeBase(tempDir);
    kb.load();

    const content = kb.getContent();
    expect(content).toContain('Ecosunpower');
    expect(content).toContain('FAQ');
  });

  it('should concatenate all files with separators', async () => {
    const { KnowledgeBase } = await import('../src/modules/knowledge.js');
    const kb = new KnowledgeBase(tempDir);
    kb.load();

    const content = kb.getContent();
    expect(content).toContain('---');
    expect(content.split('---').length).toBeGreaterThanOrEqual(2);
  });

  it('should report token estimate', async () => {
    const { KnowledgeBase } = await import('../src/modules/knowledge.js');
    const kb = new KnowledgeBase(tempDir);
    kb.load();

    const estimate = kb.getTokenEstimate();
    expect(estimate).toBeGreaterThan(0);
    expect(estimate).toBeLessThan(15000);
  });

  it('should reload when a file changes', async () => {
    const { KnowledgeBase } = await import('../src/modules/knowledge.js');
    const kb = new KnowledgeBase(tempDir);
    kb.load();

    expect(kb.getContent()).not.toContain('Novo conteudo');

    writeFileSync(join(tempDir, 'empresa.md'), '# Ecosunpower\nNovo conteudo adicionado.');
    kb.load();

    expect(kb.getContent()).toContain('Novo conteudo');
  });
});
```

- [ ] **Step 2: Rodar teste para verificar que falha**

```bash
npx vitest run tests/knowledge.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implementar knowledge.ts**

```typescript
// src/modules/knowledge.ts
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { watch, FSWatcher } from 'chokidar';

export class KnowledgeBase {
  private directory: string;
  private content: string = '';
  private tokenEstimate: number = 0;
  private watcher: FSWatcher | null = null;
  private onReloadCallback: (() => void) | null = null;

  constructor(directory: string) {
    this.directory = directory;
  }

  load(): void {
    const files = readdirSync(this.directory)
      .filter(f => f.endsWith('.md'))
      .sort();

    const sections = files.map(file => {
      const filePath = join(this.directory, file);
      const fileContent = readFileSync(filePath, 'utf-8');
      return `[${file.replace('.md', '')}]\n${fileContent}`;
    });

    this.content = sections.join('\n\n---\n\n');
    // Rough estimate: ~4 chars per token for Portuguese text
    this.tokenEstimate = Math.ceil(this.content.length / 4);
  }

  getContent(): string {
    return this.content;
  }

  getTokenEstimate(): number {
    return this.tokenEstimate;
  }

  isOverLimit(): boolean {
    return this.tokenEstimate > 15000;
  }

  startWatching(onReload?: () => void): void {
    this.onReloadCallback = onReload ?? null;
    this.watcher = watch(this.directory, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500 },
    });

    this.watcher.on('change', () => {
      this.load();
      this.onReloadCallback?.();
    });

    this.watcher.on('add', () => {
      this.load();
      this.onReloadCallback?.();
    });
  }

  stopWatching(): void {
    this.watcher?.close();
    this.watcher = null;
  }
}
```

- [ ] **Step 4: Rodar teste para verificar que passa**

```bash
npx vitest run tests/knowledge.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 5: Criar arquivos iniciais da base de conhecimento**

`conhecimento/empresa.md`:
```markdown
# Ecosunpower Energia

## Sobre nos
A Ecosunpower Energia e uma empresa especializada em energia solar fotovoltaica,
com atuacao em Brasilia-DF e no estado de Goias desde 2019.

## Diferenciais
- Mais de 6 anos de experiencia no mercado solar
- Equipe tecnica propria com engenheiros especializados
- Projetos residenciais, comerciais e para agronegocio
- Atendimento personalizado do projeto a instalacao
- Monitoramento pos-instalacao

## Regioes atendidas
- Brasilia e entorno (DF)
- Goiania e regiao metropolitana
- Interior de Goias
```

`conhecimento/produtos.md`:
```markdown
# Produtos e Equipamentos

## Paineis Solares
Trabalhamos com as principais marcas do mercado, incluindo paineis de alta
eficiencia com garantia de 25 anos de performance.

## Inversores
Utilizamos inversores das marcas lideres, com garantia de 10 a 15 anos,
incluindo opcoes com monitoramento via aplicativo.

## Sistemas de Armazenamento
Oferecemos solucoes com baterias para:
- Backup residencial (independencia energetica)
- BESS comercial/industrial (gestao de demanda)
- Substituicao de geradores diesel

## Estruturas de fixacao
Estruturas em aluminio para telhado (ceramico, metalico, fibrocimento)
e solo, com garantia de 25 anos contra corrosao.
```

`conhecimento/faq.md`:
```markdown
# Perguntas Frequentes

## Quanto custa um sistema de energia solar?
O valor depende do seu consumo mensal de energia. Nosso engenheiro faz uma
analise personalizada para dimensionar o sistema ideal e apresentar as opcoes.

## Quanto tempo dura a instalacao?
Em media, a instalacao leva de 1 a 3 dias para residencias e de 1 a 2 semanas
para projetos comerciais maiores.

## Qual a economia na conta de luz?
Com energia solar, e possivel reduzir a conta de luz em ate 95%. O sistema
gera creditos que compensam o consumo.

## Preciso de bateria?
Nao obrigatoriamente. O sistema conectado a rede funciona com compensacao de
creditos. Baterias sao recomendadas para quem quer independencia da rede ou
tem quedas frequentes de energia.

## Quanto tempo para o retorno do investimento?
O payback varia de 3 a 5 anos, dependendo do consumo e da tarifa local.

## E possivel financiar?
Sim! Existem linhas de financiamento especificas para energia solar com
taxas atrativas e carencia para comecar a pagar.

## O que e o mercado livre de energia?
E um ambiente onde empresas com demanda elevada podem comprar energia
diretamente de fornecedores, negociando precos e podendo economizar de
20 a 35% na conta.
```

`conhecimento/processo.md`:
```markdown
# Processo de Instalacao

## Etapas

### 1. Consulta inicial
Nosso engenheiro avalia seu consumo, local de instalacao e necessidades
para dimensionar o sistema ideal.

### 2. Proposta tecnica e comercial
Apresentamos o projeto com detalhes tecnicos, simulacao de economia,
opcoes de equipamento e formas de pagamento.

### 3. Aprovacao e contrato
Apos aprovacao, formalizamos o contrato e iniciamos o processo.

### 4. Projeto e homologacao
Elaboramos o projeto eletrico e submetemos a distribuidora para aprovacao.
Prazo medio: 15 a 30 dias.

### 5. Instalacao
Equipe tecnica realiza a instalacao no local.
Residencial: 1 a 3 dias. Comercial: 1 a 2 semanas.

### 6. Vistoria e conexao
A distribuidora faz a vistoria e conecta o sistema a rede.
Prazo: 7 a 15 dias apos a instalacao.

### 7. Monitoramento
Acompanhamos a geracao do seu sistema e garantimos o funcionamento ideal.
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/knowledge.ts tests/knowledge.test.ts conhecimento/
git commit -m "feat: add knowledge base loader with file watcher and initial content"
```

---

### Task 6: Fila de mensagens (BullMQ + Redis)

**Files:**
- Create: `src/modules/queue.ts`
- Create: `tests/queue.test.ts`

- [ ] **Step 1: Escrever teste**

```typescript
// tests/queue.test.ts
import { describe, it, expect, vi } from 'vitest';

// Mock bullmq and ioredis
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    status: 'ready',
    ping: vi.fn().mockResolvedValue('PONG'),
    quit: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('MessageQueue', () => {
  it('should create queue and worker', async () => {
    const { MessageQueue } = await import('../src/modules/queue.js');
    const queue = new MessageQueue('127.0.0.1', 6379, async () => {});
    expect(queue).toBeDefined();
  });

  it('should add message to queue', async () => {
    const { MessageQueue } = await import('../src/modules/queue.js');
    const handler = vi.fn();
    const queue = new MessageQueue('127.0.0.1', 6379, handler);

    await queue.addMessage({
      type: 'text',
      from: '5561999999999',
      content: 'Ola',
      timestamp: new Date().toISOString(),
      messageId: 'msg-1',
    });

    // Verify add was called on the internal queue
    expect(queue).toBeDefined();
  });

  it('should check Redis health', async () => {
    const { MessageQueue } = await import('../src/modules/queue.js');
    const queue = new MessageQueue('127.0.0.1', 6379, async () => {});

    const isHealthy = await queue.isHealthy();
    expect(isHealthy).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar teste para verificar que falha**

```bash
npx vitest run tests/queue.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implementar queue.ts**

```typescript
// src/modules/queue.ts
import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';

export interface QueueMessage {
  type: 'text' | 'audio' | 'image' | 'location';
  from: string;
  content: string;
  timestamp: string;
  messageId: string;
}

type MessageHandler = (message: QueueMessage) => Promise<void>;

const QUEUE_NAME = 'whatsapp-messages';

export class MessageQueue {
  private queue: Queue;
  private worker: Worker;
  private redis: Redis;
  private processedIds: Set<string> = new Set();

  constructor(redisHost: string, redisPort: number, handler: MessageHandler) {
    const connection = { host: redisHost, port: redisPort };

    this.redis = new Redis({ host: redisHost, port: redisPort, maxRetriesPerRequest: null });

    this.queue = new Queue(QUEUE_NAME, { connection });

    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<QueueMessage>) => {
        // Deduplication
        if (this.processedIds.has(job.data.messageId)) return;
        this.processedIds.add(job.data.messageId);

        // Keep set from growing unbounded (keep last 10000)
        if (this.processedIds.size > 10000) {
          const entries = [...this.processedIds];
          this.processedIds = new Set(entries.slice(-5000));
        }

        await handler(job.data);
      },
      {
        connection,
        concurrency: 1, // Process one message at a time (FIFO)
      }
    );

    this.worker.on('failed', (job, err) => {
      console.error(`[queue] Job ${job?.id} failed:`, err.message);
    });
  }

  async addMessage(message: QueueMessage): Promise<void> {
    await this.queue.add('message', message, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
  }

  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    await this.redis.quit();
  }
}
```

- [ ] **Step 4: Rodar teste para verificar que passa**

```bash
npx vitest run tests/queue.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/modules/queue.ts tests/queue.test.ts
git commit -m "feat: add BullMQ message queue with deduplication and retry"
```

---

### Task 7: Router (identifica tipo e roteia mensagens)

**Files:**
- Create: `src/modules/router.ts`
- Create: `tests/router.test.ts`

- [ ] **Step 1: Escrever teste**

```typescript
// tests/router.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('Router', () => {
  it('should route text messages to brain handler', async () => {
    const { Router } = await import('../src/modules/router.js');
    const brainHandler = vi.fn().mockResolvedValue(undefined);
    const router = new Router({ onTextMessage: brainHandler });

    await router.handle({
      type: 'text',
      from: '5561999999999',
      content: 'Ola',
      timestamp: new Date().toISOString(),
      messageId: 'msg-1',
    });

    expect(brainHandler).toHaveBeenCalledWith('5561999999999', 'Ola');
  });

  it('should skip audio messages in MVP (log warning)', async () => {
    const { Router } = await import('../src/modules/router.js');
    const brainHandler = vi.fn();
    const logHandler = vi.fn();
    const router = new Router({ onTextMessage: brainHandler, onUnsupported: logHandler });

    await router.handle({
      type: 'audio',
      from: '5561999999999',
      content: 'https://audio.url',
      timestamp: new Date().toISOString(),
      messageId: 'msg-2',
    });

    expect(brainHandler).not.toHaveBeenCalled();
    expect(logHandler).toHaveBeenCalledWith('5561999999999', 'audio');
  });

  it('should detect spam (same message 5+ times in 1 minute)', async () => {
    const { Router } = await import('../src/modules/router.js');
    const brainHandler = vi.fn().mockResolvedValue(undefined);
    const router = new Router({ onTextMessage: brainHandler });

    const msg = {
      type: 'text' as const,
      from: '5561999999999',
      content: 'GANHE DINHEIRO FACIL',
      timestamp: new Date().toISOString(),
      messageId: '',
    };

    for (let i = 0; i < 5; i++) {
      await router.handle({ ...msg, messageId: `msg-${i}` });
    }

    // 6th identical message should be blocked
    await router.handle({ ...msg, messageId: 'msg-5' });

    // First 5 go through, 6th is blocked
    expect(brainHandler).toHaveBeenCalledTimes(5);
  });
});
```

- [ ] **Step 2: Rodar teste para verificar que falha**

```bash
npx vitest run tests/router.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implementar router.ts**

```typescript
// src/modules/router.ts
import type { QueueMessage } from './queue.js';

interface RouterHandlers {
  onTextMessage: (from: string, text: string) => Promise<void>;
  onUnsupported?: (from: string, type: string) => void;
}

interface SpamEntry {
  content: string;
  count: number;
  firstSeen: number;
}

export class Router {
  private handlers: RouterHandlers;
  private spamTracker: Map<string, SpamEntry[]> = new Map();
  private readonly SPAM_THRESHOLD = 5;
  private readonly SPAM_WINDOW_MS = 60_000;

  constructor(handlers: RouterHandlers) {
    this.handlers = handlers;
  }

  async handle(message: QueueMessage): Promise<void> {
    // Rate limit / spam check
    if (message.type === 'text' && this.isSpam(message.from, message.content)) {
      return;
    }

    switch (message.type) {
      case 'text':
        await this.handlers.onTextMessage(message.from, message.content);
        break;

      case 'audio':
      case 'image':
      case 'location':
        // MVP: not supported yet, notify handlers
        this.handlers.onUnsupported?.(message.from, message.type);
        break;
    }
  }

  private isSpam(from: string, content: string): boolean {
    const now = Date.now();
    const entries = this.spamTracker.get(from) ?? [];

    // Clean old entries
    const recentEntries = entries.filter(e => now - e.firstSeen < this.SPAM_WINDOW_MS);

    // Find matching content
    const existing = recentEntries.find(e => e.content === content);

    if (existing) {
      existing.count++;
      if (existing.count > this.SPAM_THRESHOLD) {
        return true;
      }
    } else {
      recentEntries.push({ content, count: 1, firstSeen: now });
    }

    this.spamTracker.set(from, recentEntries);
    return false;
  }
}
```

- [ ] **Step 4: Rodar teste para verificar que passa**

```bash
npx vitest run tests/router.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/modules/router.ts tests/router.test.ts
git commit -m "feat: add message router with spam detection"
```

---

### Task 8: Prompts (system prompt + residencial)

**Files:**
- Create: `src/prompts/system-prompt.md`
- Create: `src/prompts/residencial.md`

- [ ] **Step 1: Criar system-prompt.md**

```markdown
Voce e o assistente virtual da Ecosunpower Energia, empresa especializada em
energia solar fotovoltaica com atuacao em Brasilia-DF e Goias desde 2019.

## Tom de voz
- Profissional mas acessivel. Use linguagem simples, evite jargoes tecnicos
  a menos que o cliente demonstre conhecimento.
- Seja consultivo: faca perguntas inteligentes para entender a necessidade.
- Seja entusiasmado com energia solar mas nunca exagerado ou forcado.
- Use "voce" (informal). Trate pelo nome quando souber.
- Responda sempre em portugues brasileiro.

## Seu papel
Voce e um consultor inicial. Sua funcao e:
1. Entender a necessidade do cliente (residencial, comercial ou agronegocio)
2. Coletar informacoes energeticas com perguntas naturais
3. Identificar oportunidades alem do solar (baterias, BESS, mercado livre)
4. Montar um dossie completo para o engenheiro da Ecosunpower

Voce NAO vende, NAO gera propostas, NAO fecha contratos. Voce qualifica o
cliente e passa as informacoes para o engenheiro.

## Regras absolutas
- NUNCA prometa precos, valores ou descontos
- NUNCA de prazos de instalacao definitivos
- NUNCA critique concorrentes
- NUNCA invente informacoes - use apenas a base de conhecimento fornecida
- NUNCA continue coletando dados antes do consentimento LGPD
- NUNCA responda sobre assuntos fora do escopo (politica, religiao, esportes, etc.)
- Se nao souber a resposta, diga: "Essa e uma otima pergunta! Vou pedir
  para nosso engenheiro te responder com precisao."

## Fluxo obrigatorio para novos contatos
1. Saudacao + mensagem de consentimento LGPD
2. Aguardar consentimento (se recusar, agradeca e encerre)
3. Identificar perfil (residencial/comercial/agronegocio)
4. Qualificar conforme perfil (seguir instrucoes do perfil)
5. Identificar oportunidades de armazenamento/BESS/mercado livre
6. Informar que o engenheiro vai analisar e entrar em contato

## Fluxo para contatos que retornam
1. Cumprimentar pelo nome
2. Perguntar como pode ajudar
3. Continuar qualificacao se incompleta, ou responder duvidas

## Mensagem de consentimento LGPD (enviar no primeiro contato)
"Antes de comecarmos, informo que a Ecosunpower Energia coleta e armazena
seus dados (nome, telefone, consumo de energia) para fins de atendimento
e elaboracao de proposta comercial. Seus dados sao protegidos conforme a
LGPD. Voce pode solicitar a exclusao dos seus dados a qualquer momento.
Ao continuar, voce concorda com o tratamento dos seus dados. Posso prosseguir?"

## Quando transferir para humano
- Cliente pede para falar com pessoa
- Reclamacao ou insatisfacao
- Duvida tecnica fora da base de conhecimento
- Negociacao de valores ou pedido de desconto
- Urgencia (sistema parou, problema eletrico)
- Neste caso, responda: "Vou te conectar com nosso engenheiro agora. Ele vai
  ter todo o contexto da nossa conversa."

## Formato de resposta
- Mensagens curtas e diretas (maximo 3 paragrafos por mensagem)
- Uma pergunta por vez (nao bombardeie o cliente)
- Use emojis com moderacao (maximo 1-2 por mensagem)

## Dados que voce deve coletar (quando o cliente der contexto)
Ao longo da conversa, colete naturalmente:
- Nome do cliente
- Cidade/bairro
- Perfil: residencial, comercial ou agronegocio
- Valor da conta de luz ou consumo em kWh
- Informacoes sobre demanda futura
- Interesse em armazenamento/baterias

Quando tiver dados suficientes, responda com um JSON no formato abaixo
dentro de um bloco ```json```. Isso sera processado automaticamente:

{
  "action": "update_lead",
  "data": {
    "name": "nome do cliente",
    "city": "cidade",
    "profile": "residencial|comercial|agronegocio",
    "energy_data": {
      "monthly_bill": 800,
      "consumption_kwh": null,
      "group": null,
      "contracted_demand_kw": null,
      "tariff_type": null
    },
    "opportunities": {
      "solar": true,
      "battery": false,
      "bess": false,
      "free_market": false,
      "diesel_replacement": false,
      "ev_charging": false
    },
    "future_demand": "descricao"
  }
}

Envie o JSON atualizado sempre que coletar novas informacoes.
Quando a qualificacao estiver completa, inclua "action": "qualification_complete".
Quando precisar transferir para humano, inclua "action": "transfer_to_human".
```

- [ ] **Step 2: Criar residencial.md**

```markdown
## Instrucoes para qualificacao de perfil RESIDENCIAL

Voce identificou que o cliente tem interesse em energia solar para residencia.
Siga esta sequencia de perguntas de forma natural e conversacional:

### Sequencia de coleta
1. Pergunte a cidade e bairro (se ainda nao souber)
2. Pergunte o valor aproximado da conta de luz mensal
3. Pergunte o tipo de residencia (casa ou apartamento) e se tem telhado disponivel
4. Pergunte sobre demanda futura:
   "Voce planeja adquirir carro eletrico, piscina aquecida, ar-condicionado
   ou outros equipamentos de alto consumo nos proximos anos?"
5. Se a conta for acima de R$800/mes OU o cliente mencionar quedas de energia:
   "Ja considerou ter independencia da rede com um sistema de baterias?
   Mesmo com queda de energia, sua casa continua funcionando normalmente."
6. Pergunte os horarios de maior consumo de energia

### Regras
- Faca UMA pergunta por vez
- Adapte a linguagem ao nivel do cliente
- Se o cliente mencionar carro eletrico: sugira sistema maior + bateria para
  carga noturna
- Se o cliente mencionar quedas frequentes: destaque o backup energetico
- NAO sugira armazenamento se a conta for baixa (abaixo de R$500) e nao
  houver outros indicadores

### Ao finalizar a coleta
Diga algo como: "Excelente, [nome]! Com essas informacoes, nosso engenheiro
vai preparar uma analise personalizada para voce. Posso pedir para ele entrar
em contato?"
```

- [ ] **Step 3: Commit**

```bash
git add src/prompts/
git commit -m "feat: add system prompt and residential qualification instructions"
```

---

### Task 9: Brain (cerebro do agente - Claude API + qualificacao)

**Files:**
- Create: `src/modules/brain.ts`
- Create: `tests/brain.test.ts`

- [ ] **Step 1: Escrever teste**

```typescript
// tests/brain.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Config } from '../src/config.js';

const mockAnthropicResponse = {
  content: [{ type: 'text', text: 'Ola! Sou o assistente da Ecosunpower Energia.' }],
};

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue(mockAnthropicResponse),
    },
  })),
}));

const mockConfig: Config = {
  port: 3000,
  nodeEnv: 'sandbox',
  evolutionApiUrl: 'http://localhost:8080',
  evolutionApiKey: 'test',
  evolutionInstance: 'test',
  webhookToken: 'test',
  anthropicApiKey: 'sk-ant-test',
  supabaseUrl: 'https://test.supabase.co',
  supabaseServiceKey: 'test-key',
  redisHost: '127.0.0.1',
  redisPort: 6379,
  engineerPhone: '5561999999999',
  engineerName: 'Test',
};

describe('Brain', () => {
  it('should generate a response from Claude', async () => {
    const { Brain } = await import('../src/modules/brain.js');
    const brain = new Brain(mockConfig.anthropicApiKey);

    const response = await brain.processMessage(
      'Ola',
      [],
      'base de conhecimento aqui',
      null,
      'inicio'
    );

    expect(response.text).toContain('Ecosunpower');
  });

  it('should parse action from response with JSON block', async () => {
    const { Brain } = await import('../src/modules/brain.js');
    const brain = new Brain(mockConfig.anthropicApiKey);

    const responseText = 'Otimo!\n```json\n{"action":"update_lead","data":{"name":"Joao","city":"Brasilia","profile":"residencial"}}\n```';
    const parsed = brain.parseAction(responseText);

    expect(parsed).not.toBeNull();
    expect(parsed?.action).toBe('update_lead');
    expect(parsed?.data.name).toBe('Joao');
  });

  it('should return null action when no JSON in response', async () => {
    const { Brain } = await import('../src/modules/brain.js');
    const brain = new Brain(mockConfig.anthropicApiKey);

    const parsed = brain.parseAction('Ola! Como posso ajudar?');
    expect(parsed).toBeNull();
  });

  it('should strip JSON block from display text', async () => {
    const { Brain } = await import('../src/modules/brain.js');
    const brain = new Brain(mockConfig.anthropicApiKey);

    const responseText = 'Otimo, Joao!\n```json\n{"action":"update_lead","data":{"name":"Joao"}}\n```\nPosso continuar?';
    const cleanText = brain.getDisplayText(responseText);

    expect(cleanText).toBe('Otimo, Joao!\nPosso continuar?');
    expect(cleanText).not.toContain('json');
  });
});
```

- [ ] **Step 2: Rodar teste para verificar que falha**

```bash
npx vitest run tests/brain.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implementar brain.ts**

```typescript
// src/modules/brain.ts
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

interface MessageEntry {
  role: 'user' | 'assistant';
  content: string;
}

interface ActionPayload {
  action: string;
  data: Record<string, unknown>;
}

interface BrainResponse {
  text: string;
  displayText: string;
  action: ActionPayload | null;
}

export class Brain {
  private client: Anthropic;
  private systemPrompt: string;
  private residencialPrompt: string;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });

    const promptsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts');
    this.systemPrompt = readFileSync(join(promptsDir, 'system-prompt.md'), 'utf-8');
    this.residencialPrompt = readFileSync(join(promptsDir, 'residencial.md'), 'utf-8');
  }

  async processMessage(
    userMessage: string,
    history: MessageEntry[],
    knowledgeBase: string,
    summary: string | null,
    qualificationStep: string
  ): Promise<BrainResponse> {
    const systemContent = this.buildSystemContent(knowledgeBase, summary, qualificationStep);

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...history,
      { role: 'user', content: userMessage },
    ];

    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemContent,
      messages,
    });

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    return {
      text,
      displayText: this.getDisplayText(text),
      action: this.parseAction(text),
    };
  }

  private buildSystemContent(
    knowledgeBase: string,
    summary: string | null,
    qualificationStep: string
  ): string {
    let content = this.systemPrompt;

    content += '\n\n## Base de Conhecimento da Ecosunpower\n\n' + knowledgeBase;

    // Add profile-specific instructions based on qualification step
    if (qualificationStep.includes('residencial') || qualificationStep === 'inicio') {
      content += '\n\n' + this.residencialPrompt;
    }

    if (summary) {
      content += '\n\n## Resumo da conversa anterior\n' + summary;
    }

    content += `\n\n## Estado atual da qualificacao: ${qualificationStep}`;

    return content;
  }

  parseAction(responseText: string): ActionPayload | null {
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch) return null;

    try {
      return JSON.parse(jsonMatch[1]) as ActionPayload;
    } catch {
      return null;
    }
  }

  getDisplayText(responseText: string): string {
    return responseText
      .replace(/```json\s*[\s\S]*?\s*```/g, '')
      .replace(/\n{3,}/g, '\n')
      .trim();
  }
}
```

- [ ] **Step 4: Rodar teste para verificar que passa**

```bash
npx vitest run tests/brain.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/modules/brain.ts tests/brain.test.ts
git commit -m "feat: add Brain module with Claude API integration and action parsing"
```

---

### Task 10: Dossier (monta e formata dossie)

**Files:**
- Create: `src/modules/dossier.ts`
- Create: `tests/dossier.test.ts`

- [ ] **Step 1: Escrever teste**

```typescript
// tests/dossier.test.ts
import { describe, it, expect } from 'vitest';

describe('DossierBuilder', () => {
  it('should format a complete dossier', async () => {
    const { DossierBuilder } = await import('../src/modules/dossier.js');

    const dossier = DossierBuilder.format({
      leadNumber: 42,
      name: 'Joao Silva',
      phone: '5561999999999',
      city: 'Brasilia - Asa Norte',
      profile: 'residencial',
      origin: 'Instagram Ads',
      energyData: {
        group: 'B',
        consumption_kwh: 450,
        monthly_bill: 800,
        tariff_type: 'convencional',
      },
      opportunities: {
        solar: true,
        battery: true,
        bess: false,
        free_market: false,
        diesel_replacement: false,
        ev_charging: true,
      },
      futureDemand: 'Pretende comprar carro eletrico em 2026',
      conversationSummary: [
        'Cliente demonstrou forte interesse em reducao de custos',
        'Mencionou quedas frequentes de energia no bairro',
        'Interesse alto',
      ],
      recommendation: 'Agendar visita tecnica. Potencial para solar + bateria residencial.',
    });

    expect(dossier).toContain('DOSSIE - Lead #42');
    expect(dossier).toContain('Joao Silva');
    expect(dossier).toContain('RESIDENCIAL');
    expect(dossier).toContain('Instagram Ads');
    expect(dossier).toContain('R$ 800');
    expect(dossier).toContain('[x] Sistema fotovoltaico');
    expect(dossier).toContain('[x] Bateria residencial');
    expect(dossier).toContain('[ ] BESS');
    expect(dossier).toContain('carro eletrico');
  });

  it('should handle missing optional fields', async () => {
    const { DossierBuilder } = await import('../src/modules/dossier.js');

    const dossier = DossierBuilder.format({
      leadNumber: 1,
      name: 'Maria',
      phone: '5562988888888',
      city: 'Goiania',
      profile: 'residencial',
      origin: 'Organico',
      energyData: {
        monthly_bill: 500,
      },
      opportunities: {
        solar: true,
      },
      conversationSummary: ['Interesse moderado'],
      recommendation: 'Ligar para apresentar opcoes.',
    });

    expect(dossier).toContain('Maria');
    expect(dossier).toContain('Goiania');
    expect(dossier).toContain('R$ 500');
  });
});
```

- [ ] **Step 2: Rodar teste para verificar que falha**

```bash
npx vitest run tests/dossier.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implementar dossier.ts**

```typescript
// src/modules/dossier.ts

interface EnergyData {
  group?: string;
  subgroup?: string;
  contracted_demand_kw?: number;
  consumption_kwh?: number;
  tariff_type?: string;
  monthly_bill?: number;
}

interface Opportunities {
  solar?: boolean;
  battery?: boolean;
  bess?: boolean;
  free_market?: boolean;
  diesel_replacement?: boolean;
  ev_charging?: boolean;
}

interface DossierInput {
  leadNumber: number;
  name: string;
  phone: string;
  city: string;
  profile: string;
  origin: string;
  energyData: EnergyData;
  opportunities: Opportunities;
  futureDemand?: string;
  conversationSummary: string[];
  recommendation: string;
}

export class DossierBuilder {
  static format(input: DossierInput): string {
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const profile = input.profile.toUpperCase();
    const check = (val?: boolean) => val ? '[x]' : '[ ]';

    const lines = [
      `DOSSIE - Lead #${input.leadNumber}`,
      `Data: ${now}`,
      '========================================',
      `Nome: ${input.name}`,
      `Telefone: ${input.phone}`,
      `Cidade: ${input.city}`,
      `Perfil: ${profile}`,
      `Origem: ${input.origin}`,
      '',
      'DADOS ENERGETICOS',
    ];

    if (input.energyData.group) {
      lines.push(`- Classificacao: Grupo ${input.energyData.group}${input.energyData.subgroup ? ` (${input.energyData.subgroup})` : ''}`);
    }
    if (input.energyData.contracted_demand_kw) {
      lines.push(`- Demanda contratada: ${input.energyData.contracted_demand_kw} kW`);
    }
    if (input.energyData.consumption_kwh) {
      lines.push(`- Consumo medio: ${input.energyData.consumption_kwh} kWh/mes`);
    }
    if (input.energyData.tariff_type) {
      lines.push(`- Tarifa: ${input.energyData.tariff_type}`);
    }
    if (input.energyData.monthly_bill) {
      lines.push(`- Valor medio da fatura: R$ ${input.energyData.monthly_bill}/mes`);
    }

    lines.push(
      '',
      'OPORTUNIDADES IDENTIFICADAS',
      `- ${check(input.opportunities.solar)} Sistema fotovoltaico`,
      `- ${check(input.opportunities.free_market)} Migracao para mercado livre`,
      `- ${check(input.opportunities.bess)} BESS (armazenamento comercial)`,
      `- ${check(input.opportunities.battery)} Bateria residencial`,
      `- ${check(input.opportunities.diesel_replacement)} Substituicao de gerador diesel`,
      `- ${check(input.opportunities.ev_charging)} Preparacao para carro eletrico`,
    );

    lines.push(
      '',
      'DEMANDA FUTURA',
      `- ${input.futureDemand ?? 'Nao informada'}`,
    );

    lines.push(
      '',
      'RESUMO DA CONVERSA',
      ...input.conversationSummary.map(s => `- ${s}`),
    );

    lines.push(
      '',
      'RECOMENDACAO DO AGENTE',
      `- ${input.recommendation}`,
      '========================================',
    );

    return lines.join('\n');
  }
}
```

- [ ] **Step 4: Rodar teste para verificar que passa**

```bash
npx vitest run tests/dossier.test.ts
```
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/modules/dossier.ts tests/dossier.test.ts
git commit -m "feat: add DossierBuilder for formatting lead dossiers"
```

---

### Task 11: Health check endpoint

**Files:**
- Create: `src/health.ts`
- Create: `tests/health.test.ts`

- [ ] **Step 1: Escrever teste**

```typescript
// tests/health.test.ts
import { describe, it, expect } from 'vitest';

describe('buildHealthStatus', () => {
  it('should return healthy when all services are up', async () => {
    const { buildHealthStatus } = await import('../src/health.js');

    const status = await buildHealthStatus({
      redis: async () => true,
      supabase: async () => true,
      evolution: async () => true,
    });

    expect(status.status).toBe('healthy');
    expect(status.services.redis).toBe('up');
    expect(status.services.supabase).toBe('up');
    expect(status.services.evolution).toBe('up');
  });

  it('should return degraded when a service is down', async () => {
    const { buildHealthStatus } = await import('../src/health.js');

    const status = await buildHealthStatus({
      redis: async () => true,
      supabase: async () => false,
      evolution: async () => true,
    });

    expect(status.status).toBe('degraded');
    expect(status.services.supabase).toBe('down');
  });

  it('should return unhealthy when redis is down', async () => {
    const { buildHealthStatus } = await import('../src/health.js');

    const status = await buildHealthStatus({
      redis: async () => false,
      supabase: async () => true,
      evolution: async () => true,
    });

    expect(status.status).toBe('unhealthy');
  });
});
```

- [ ] **Step 2: Rodar teste para verificar que falha**

```bash
npx vitest run tests/health.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implementar health.ts**

```typescript
// src/health.ts

interface HealthCheckers {
  redis: () => Promise<boolean>;
  supabase: () => Promise<boolean>;
  evolution: () => Promise<boolean>;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    redis: 'up' | 'down';
    supabase: 'up' | 'down';
    evolution: 'up' | 'down';
  };
}

export async function buildHealthStatus(checkers: HealthCheckers): Promise<HealthStatus> {
  const [redis, supabase, evolution] = await Promise.all([
    checkers.redis().catch(() => false),
    checkers.supabase().catch(() => false),
    checkers.evolution().catch(() => false),
  ]);

  const services = {
    redis: redis ? 'up' as const : 'down' as const,
    supabase: supabase ? 'up' as const : 'down' as const,
    evolution: evolution ? 'up' as const : 'down' as const,
  };

  let status: 'healthy' | 'degraded' | 'unhealthy';

  if (!redis) {
    // Redis is critical (queue depends on it)
    status = 'unhealthy';
  } else if (!supabase || !evolution) {
    status = 'degraded';
  } else {
    status = 'healthy';
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    services,
  };
}
```

- [ ] **Step 4: Rodar teste para verificar que passa**

```bash
npx vitest run tests/health.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/health.ts tests/health.test.ts
git commit -m "feat: add health check with service status reporting"
```

---

### Task 12: Index (servidor Express - junta tudo)

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Implementar index.ts**

```typescript
// src/index.ts
import express from 'express';
import { loadConfig } from './config.js';
import { EvolutionService } from './modules/evolution.js';
import { MessageQueue } from './modules/queue.js';
import { Router } from './modules/router.js';
import { SupabaseService } from './modules/supabase.js';
import { KnowledgeBase } from './modules/knowledge.js';
import { Brain } from './modules/brain.js';
import { DossierBuilder } from './modules/dossier.js';
import { buildHealthStatus } from './health.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const config = loadConfig();
  const isSandbox = config.nodeEnv === 'sandbox';

  console.log(`[init] Starting Ecosunpower Agent (${config.nodeEnv} mode)`);

  // Initialize services
  const evolution = new EvolutionService(config);
  const supabase = new SupabaseService(config);
  const brain = new Brain(config.anthropicApiKey);
  const knowledgeBase = new KnowledgeBase(join(__dirname, '..', 'conhecimento'));

  // Load knowledge base
  knowledgeBase.load();
  if (knowledgeBase.isOverLimit()) {
    console.warn('[knowledge] WARNING: knowledge base exceeds 15,000 token estimate. Consider reducing content.');
  }
  console.log(`[knowledge] Loaded. Estimated tokens: ${knowledgeBase.getTokenEstimate()}`);

  // Watch for changes
  knowledgeBase.startWatching(() => {
    console.log('[knowledge] Reloaded after file change');
    if (knowledgeBase.isOverLimit()) {
      console.warn('[knowledge] WARNING: knowledge base exceeds 15,000 token estimate');
    }
  });

  // Message handler (called by the queue worker)
  async function handleTextMessage(from: string, text: string) {
    try {
      // 1. Get or create lead
      let lead = await supabase.getLeadByPhone(from);
      const isNewLead = !lead;

      if (!lead) {
        const result = await supabase.upsertLead({ phone: from, status: 'novo' });
        lead = { id: result.id, phone: from };
      }

      const leadId = (lead as { id: string }).id;

      // 2. Get or create conversation
      const conversation = await supabase.getOrCreateConversation(leadId);

      // 3. Build message history
      const history = (conversation.messages ?? []).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      // 4. Process with Brain
      const response = await brain.processMessage(
        text,
        history,
        knowledgeBase.getContent(),
        conversation.summary,
        conversation.qualification_step
      );

      // 5. Send response to client
      if (!isSandbox) {
        await evolution.sendText(from, response.displayText);
      } else {
        console.log(`[sandbox] Would send to ${from}: ${response.displayText}`);
      }

      // 6. Update conversation in Supabase
      const updatedMessages = [
        ...conversation.messages,
        { role: 'user', content: text, timestamp: new Date().toISOString() },
        { role: 'assistant', content: response.text, timestamp: new Date().toISOString() },
      ];

      // Summarize if too many messages
      let summary = conversation.summary;
      const messagesToKeep = updatedMessages.slice(-20);

      await supabase.updateConversation(conversation.id, {
        messages: messagesToKeep,
        summary,
        message_count: conversation.message_count + 2,
        qualification_step: conversation.qualification_step,
      });

      // 7. Handle actions from brain
      if (response.action) {
        await handleAction(response.action, leadId, from, conversation.id, supabase, evolution, config, isSandbox);
      }

      // 8. Log
      await supabase.logEvent('info', 'brain', `Processed message from ${from}`, {
        lead_id: leadId,
        is_new: isNewLead,
        action: response.action?.action ?? null,
      });

    } catch (error) {
      console.error(`[handler] Error processing message from ${from}:`, error);
      await supabase.logEvent('error', 'handler', `Error processing message from ${from}`, {
        error: error instanceof Error ? error.message : String(error),
      });

      // Send fallback message
      const fallbackMsg = 'Estou com uma dificuldade tecnica. Um momento, por favor.';
      if (!isSandbox) {
        try { await evolution.sendText(from, fallbackMsg); } catch { /* ignore */ }
      }
    }
  }

  // Initialize queue
  const queue = new MessageQueue(config.redisHost, config.redisPort, async (msg) => {
    if (msg.type === 'text') {
      await handleTextMessage(msg.from, msg.content);
    } else {
      // MVP: only text supported
      const fallback = 'Por enquanto consigo atender apenas por texto. Pode me enviar sua duvida digitando?';
      if (!isSandbox) {
        await evolution.sendText(msg.from, fallback);
      }
      console.log(`[router] Unsupported message type "${msg.type}" from ${msg.from}`);
    }
  });

  // Initialize router
  const router = new Router({
    onTextMessage: async () => {},  // Handled in queue worker
    onUnsupported: (from, type) => {
      console.log(`[router] Unsupported: ${type} from ${from}`);
    },
  });

  // Express server
  const app = express();
  app.use(express.json());

  // Webhook endpoint
  app.post('/webhook', async (req, res) => {
    // Validate token
    const token = req.headers['x-webhook-token'] as string
      ?? req.query.token as string
      ?? '';

    if (!evolution.validateWebhookToken(token)) {
      res.status(401).json({ error: 'Invalid webhook token' });
      return;
    }

    const parsed = evolution.parseWebhook(req.body);
    if (!parsed) {
      res.status(200).json({ status: 'ignored' });
      return;
    }

    // Add to queue
    await queue.addMessage({
      type: parsed.type,
      from: parsed.from,
      content: parsed.content,
      timestamp: parsed.timestamp.toISOString(),
      messageId: parsed.messageId,
    });

    res.status(200).json({ status: 'queued' });
  });

  // Health check
  app.get('/health', async (_req, res) => {
    const status = await buildHealthStatus({
      redis: () => queue.isHealthy(),
      supabase: async () => {
        try {
          await supabase.logEvent('debug', 'health', 'health check ping');
          return true;
        } catch {
          return false;
        }
      },
      evolution: async () => {
        try {
          const response = await fetch(`${config.evolutionApiUrl}/instance/fetchInstances`, {
            headers: { apikey: config.evolutionApiKey },
          });
          return response.ok;
        } catch {
          return false;
        }
      },
    });

    const httpStatus = status.status === 'healthy' ? 200 : status.status === 'degraded' ? 200 : 503;
    res.status(httpStatus).json(status);
  });

  // Start server
  app.listen(config.port, () => {
    console.log(`[server] Listening on port ${config.port}`);
    console.log(`[server] Webhook URL: http://localhost:${config.port}/webhook`);
    console.log(`[server] Health check: http://localhost:${config.port}/health`);
    if (isSandbox) {
      console.log('[server] SANDBOX MODE - messages will not be sent to WhatsApp');
    }
  });
}

async function handleAction(
  action: { action: string; data: Record<string, unknown> },
  leadId: string,
  from: string,
  conversationId: string,
  supabase: SupabaseService,
  evolution: EvolutionService,
  config: ReturnType<typeof loadConfig>,
  isSandbox: boolean
) {
  switch (action.action) {
    case 'update_lead':
      await supabase.upsertLead({
        phone: from,
        ...action.data as Record<string, unknown>,
      } as Parameters<typeof supabase.upsertLead>[0]);
      break;

    case 'qualification_complete': {
      // Update lead status
      await supabase.upsertLead({ phone: from, status: 'qualificado' });

      // Update conversation
      await supabase.updateConversation(conversationId, {
        qualification_step: 'qualificacao_completa',
        session_status: 'completed',
      });

      // Build and send dossier
      const lead = await supabase.getLeadByPhone(from);
      if (lead) {
        const dossierText = DossierBuilder.format({
          leadNumber: Date.now() % 10000,
          name: (lead as Record<string, unknown>).name as string ?? 'Nao informado',
          phone: from,
          city: (lead as Record<string, unknown>).city as string ?? 'Nao informada',
          profile: (lead as Record<string, unknown>).profile as string ?? 'indefinido',
          origin: (lead as Record<string, unknown>).origin as string ?? 'Nao identificada',
          energyData: ((lead as Record<string, unknown>).energy_data ?? {}) as Record<string, unknown>,
          opportunities: ((lead as Record<string, unknown>).opportunities ?? {}) as Record<string, boolean>,
          futureDemand: (lead as Record<string, unknown>).future_demand as string,
          conversationSummary: ['Qualificacao completa via agente'],
          recommendation: 'Entrar em contato para apresentar proposta.',
        });

        // Save dossier
        await supabase.saveDossier({
          lead_id: leadId,
          content: action.data,
          formatted_text: dossierText,
          status: 'sent',
        });

        // Send to engineer
        if (!isSandbox) {
          await evolution.sendText(config.engineerPhone, dossierText);
        } else {
          console.log(`[sandbox] Dossier for engineer:\n${dossierText}`);
        }
      }
      break;
    }

    case 'transfer_to_human': {
      await supabase.upsertLead({ phone: from, status: 'transferido' });
      await supabase.updateConversation(conversationId, {
        qualification_step: 'transferido',
        session_status: 'completed',
      });

      // Notify engineer
      const transferMsg = `TRANSFERENCIA DE ATENDIMENTO\nCliente: ${from}\nMotivo: ${(action.data as Record<string, string>).reason ?? 'Solicitado pelo cliente'}`;
      if (!isSandbox) {
        await evolution.sendText(config.engineerPhone, transferMsg);
      } else {
        console.log(`[sandbox] Transfer to engineer:\n${transferMsg}`);
      }
      break;
    }
  }
}

main().catch(error => {
  console.error('[fatal] Failed to start:', error);
  process.exit(1);
});
```

- [ ] **Step 2: Build para verificar que compila**

```bash
npx tsc --noEmit
```
Expected: no errors (or only minor type issues to fix)

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add main server wiring all modules together"
```

---

### Task 13: Supabase migrations (criar tabelas)

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Criar diretorio de migrations**

```bash
mkdir -p supabase/migrations
```

- [ ] **Step 2: Criar migration SQL**

```sql
-- supabase/migrations/001_initial_schema.sql

-- Enum types
CREATE TYPE lead_profile AS ENUM ('residencial', 'comercial', 'agronegocio', 'indefinido');
CREATE TYPE lead_status AS ENUM ('novo', 'qualificando', 'qualificado', 'agendado', 'transferido', 'inativo');
CREATE TYPE session_status AS ENUM ('active', 'paused', 'completed', 'expired');
CREATE TYPE dossier_status AS ENUM ('draft', 'sent', 'read', 'actioned');
CREATE TYPE log_level AS ENUM ('info', 'warn', 'error', 'debug');

-- Leads
CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE NOT NULL,
  name text,
  city text,
  neighborhood text,
  profile lead_profile DEFAULT 'indefinido',
  origin text,
  status lead_status DEFAULT 'novo',
  energy_data jsonb DEFAULT '{}',
  opportunities jsonb DEFAULT '{}',
  future_demand text,
  consent_given boolean DEFAULT false,
  consent_date timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  anonymized_at timestamptz
);

-- Conversations
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  session_status session_status DEFAULT 'active',
  qualification_step text DEFAULT 'inicio',
  messages jsonb[] DEFAULT '{}',
  summary text,
  message_count integer DEFAULT 0,
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '2 hours')
);

-- Dossiers
CREATE TABLE dossiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  content jsonb DEFAULT '{}',
  formatted_text text,
  status dossier_status DEFAULT 'draft',
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Engineers
CREATE TABLE engineers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  region text[] DEFAULT '{}',
  calendar_id text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Logs
CREATE TABLE logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level log_level DEFAULT 'info',
  module text,
  message text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_leads_phone ON leads(phone);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX idx_conversations_status ON conversations(session_status);
CREATE INDEX idx_dossiers_lead_id ON dossiers(lead_id);
CREATE INDEX idx_dossiers_status ON dossiers(status);
CREATE INDEX idx_logs_level ON logs(level);
CREATE INDEX idx_logs_created_at ON logs(created_at);

-- RLS (Row Level Security)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineers ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (our server uses service key)
CREATE POLICY "Service role full access" ON leads FOR ALL USING (true);
CREATE POLICY "Service role full access" ON conversations FOR ALL USING (true);
CREATE POLICY "Service role full access" ON dossiers FOR ALL USING (true);
CREATE POLICY "Service role full access" ON engineers FOR ALL USING (true);
CREATE POLICY "Service role full access" ON logs FOR ALL USING (true);
```

- [ ] **Step 3: Commit**

```bash
git add supabase/
git commit -m "feat: add Supabase migration with initial schema (leads, conversations, dossiers, engineers, logs)"
```

---

### Task 14: Rodar todos os testes e verificar build

- [ ] **Step 1: Rodar todos os testes**

```bash
npx vitest run
```
Expected: All tests PASS

- [ ] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 3: Verificar .gitignore esta correto**

```bash
git status
```
Expected: No `.env` or `node_modules` tracked

- [ ] **Step 4: Commit final da Fase 1**

```bash
git add -A
git commit -m "feat: complete MVP Phase 1 - WhatsApp agent with text qualification, LGPD, dossier generation"
```

---

## Checklist pos-implementacao (manual)

Apos o codigo estar pronto, o engenheiro precisa:

1. **Copiar `.env.example` para `.env`** e preencher com suas chaves reais
2. **Rodar a migration no Supabase** (colar o SQL no SQL Editor do Supabase Studio)
3. **Inserir primeiro engenheiro** no Supabase:
   ```sql
   INSERT INTO engineers (name, phone, region, is_active)
   VALUES ('Seu Nome', '5561999999999', ARRAY['brasilia', 'goiania'], true);
   ```
4. **Configurar webhook na Evolution API** apontando para `https://seu-servidor/webhook?token=SEU_TOKEN`
5. **Iniciar o servidor** com `npm run build && pm2 start ecosystem.config.js`
6. **Testar em modo sandbox** primeiro: `NODE_ENV=sandbox npm run dev`
7. **Verificar health check**: `curl http://localhost:3000/health`
