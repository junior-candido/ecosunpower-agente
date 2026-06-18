# Proposta do cliente — links web + PDF, copy persuasiva e rastreio do PDF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mensagem do cliente passa a oferecer link da web + link de PDF (ambos do nosso domínio, sem Drive), com copy persuasiva usando a economia mensal real; e o PDF fica rastreável compartilhando o contador de acessos (Eva aborda 1× só).

**Architecture:** Nova rota `GET /p/:slug.pdf` gera o PDF na hora a partir do HTML salvo (igual `/r/:slug?pdf=1`) e usa o mesmo caminho de rastreio da rota web, marcando `canal='pdf'`. A mensagem do cliente é remontada em `buildMensagemClienteProposta` (modo copia-e-cola) e em `eva-sender.ts` (modo automático, com botão `cta_url`). Forward-only.

**Tech Stack:** TypeScript, Express, Vitest, Supabase (Postgres), WhatsApp Cloud API (WABA), Puppeteer (`htmlToPdf`).

**Comandos base:**
- Teste de um arquivo: `npx vitest run <caminho>`
- Toda a suíte: `npm test`
- Build: `npm run build`

---

## File Structure

- `supabase/migrations/053_proposta_visualizacoes_canal.sql` — **Criar**. Coluna `canal` na tabela de visualizações.
- `src/modules/supabase.ts` — **Modificar**. `registrarVisualizacaoProposta` aceita `canal`.
- `src/modules/proposal-followup.ts` — **Modificar**. `triggerOnView` e as notificações aceitam `canal`.
- `src/modules/meta-whatsapp.ts` — **Modificar**. Método novo `sendCtaUrlButton`.
- `src/modules/proposal-assistant.ts` — **Modificar**. `buildMensagemClienteProposta` (copy nova + params) e os 2 call sites (`junior_envia` e `tryDispatchToClient`).
- `src/modules/eva-sender.ts` — **Modificar**. Saudação com economia + botão `cta_url` no lugar do link cru; `EnviarPropostaInput` ganha `economiaMensal`.
- `src/index.ts` — **Modificar**. Nova rota `GET /p/:slug.pdf`; passa `canal='web'` no `triggerOnView` da rota web.
- `tests/proposal-assistant-core.test.ts` — **Modificar**. Casos novos pra `buildMensagemClienteProposta`.
- `tests/meta-cta-url.test.ts` — **Criar**. Teste do payload `sendCtaUrlButton`.

---

## Task 1: Migration — coluna `canal` em `proposta_visualizacoes`

**Files:**
- Create: `supabase/migrations/053_proposta_visualizacoes_canal.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- 053_proposta_visualizacoes_canal.sql
-- Distingue se a visualização veio da página web (/p/:slug) ou do PDF (/p/:slug.pdf).
-- Default 'web' preserva o comportamento das linhas existentes.
ALTER TABLE proposta_visualizacoes
  ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'web';

COMMENT ON COLUMN proposta_visualizacoes.canal IS
  'Origem da visualização: web (página /p/:slug) ou pdf (/p/:slug.pdf).';
```

- [ ] **Step 2: Commit** (a migration é aplicada manualmente pelo Junior no SQL Editor do projeto de produção — ver memória sobre o MCP apontar pro projeto errado)

```bash
git add supabase/migrations/053_proposta_visualizacoes_canal.sql
git commit -m "feat(db): coluna canal em proposta_visualizacoes (web vs pdf)"
```

---

## Task 2: `registrarVisualizacaoProposta` aceita `canal`

**Files:**
- Modify: `src/modules/supabase.ts:906-928`

- [ ] **Step 1: Adicionar o parâmetro `canal` e gravá-lo**

Substituir a assinatura e o insert (linhas 906-920) por:

```typescript
  async registrarVisualizacaoProposta(params: {
    slug: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    isPreview: boolean;
    referer?: string | null;
    canal?: 'web' | 'pdf';
  }): Promise<void> {
    try {
      await this.client.from('proposta_visualizacoes').insert({
        proposta_slug: params.slug,
        ip_address: params.ipAddress ?? null,
        user_agent: params.userAgent ?? null,
        is_preview: params.isPreview,
        referer: params.referer ?? null,
        canal: params.canal ?? 'web',
      });
    } catch (err) {
      // Migration 029/053 ainda nao aplicada? Outras falhas? Nao critico.
      console.warn(
        '[supabase] registrarVisualizacaoProposta (non-blocking):',
        (err as Error).message,
      );
    }
  }
```

- [ ] **Step 2: Build pra garantir que tipa**

Run: `npm run build`
Expected: sem erros de TypeScript.

- [ ] **Step 3: Commit**

```bash
git add src/modules/supabase.ts
git commit -m "feat: registrarVisualizacaoProposta grava canal (web/pdf)"
```

---

## Task 3: `triggerOnView` e notificações aceitam `canal`

**Files:**
- Modify: `src/modules/proposal-followup.ts:102-112` (triggerOnView)
- Modify: `src/modules/proposal-followup.ts:123` (runReaberturaAsync — assinatura)
- Modify: `src/modules/proposal-followup.ts:163-166` (notificação de reabertura)
- Modify: `src/modules/proposal-followup.ts:236` (runFollowupAsync — assinatura)
- Modify: `src/modules/proposal-followup.ts:277-289` (executarEnvio — assinatura + notificação)

- [ ] **Step 1: `triggerOnView` recebe `canal` e repassa**

Substituir o método `triggerOnView` (linhas 102-112) por:

```typescript
  triggerOnView(slug: string, acessosAntes: number, canal: 'web' | 'pdf' = 'web'): void {
    if (acessosAntes === 0) {
      this.runFollowupAsync(slug, canal).catch((err) => {
        console.error('[proposal-followup] erro:', (err as Error).message);
      });
    } else {
      this.runReaberturaAsync(slug, acessosAntes, canal).catch((err) => {
        console.error('[proposal-followup] reabertura erro:', (err as Error).message);
      });
    }
  }
```

- [ ] **Step 2: `runReaberturaAsync` recebe `canal` e usa no aviso**

Trocar a assinatura na linha 123:

```typescript
  private async runReaberturaAsync(slug: string, acessosAntes: number, canal: 'web' | 'pdf' = 'web'): Promise<void> {
```

E o texto de aviso de reabertura (linhas 163-166) por:

```typescript
          await this.sendText(
            this.engineerPhone,
            canal === 'pdf'
              ? `💬 *${proposta.cliente_nome}* baixou o PDF da proposta de novo — a Eva reabordou! 🤝`
              : `💬 *${proposta.cliente_nome}* reabriu a proposta — a Eva reabordou! 🤝`,
          ).catch(() => {});
```

- [ ] **Step 3: `runFollowupAsync` recebe `canal` e repassa pro `executarEnvio`**

Trocar a assinatura na linha 236:

```typescript
  private async runFollowupAsync(slug: string, canal: 'web' | 'pdf' = 'web'): Promise<void> {
```

E a chamada no fim do método (linha 273) por:

```typescript
    await this.executarEnvio(slug, clienteNome, clienteTelefone, canal);
```

- [ ] **Step 4: `executarEnvio` recebe `canal` e ajusta o aviso da 1ª abertura**

Substituir `executarEnvio` (linhas 277-289) por:

```typescript
  private async executarEnvio(
    slug: string,
    clienteNome: string,
    clienteTelefone: string,
    canal: 'web' | 'pdf' = 'web',
  ): Promise<void> {
    const ok = await this.enviarAbordagem(slug, clienteNome, clienteTelefone);
    const acao = canal === 'pdf' ? 'baixou o PDF da sua proposta' : 'abriu sua proposta';
    await this.sendText(
      this.engineerPhone,
      ok
        ? `📣 *${clienteNome}* ${acao} — a Eva já abordou! 🤝`
        : `⚠️ Nao consegui abordar ${clienteNome} sobre a proposta. Contata manualmente: ${clienteTelefone}`,
    ).catch(() => {});
  }
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: sem erros de TypeScript.

- [ ] **Step 6: Commit**

```bash
git add src/modules/proposal-followup.ts
git commit -m "feat: triggerOnView propaga canal (web/pdf) pro aviso do Junior"
```

---

## Task 4: `sendCtaUrlButton` no MetaWhatsAppService

**Files:**
- Modify: `src/modules/meta-whatsapp.ts` (adicionar método logo após `sendInteractiveButtons`, ~linha 185)
- Test: `tests/meta-cta-url.test.ts`

- [ ] **Step 1: Escrever o teste falhando**

Criar `tests/meta-cta-url.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MetaWhatsAppService } from '../src/modules/meta-whatsapp.js';

const config = {
  metaWabaPhoneNumberId: '123',
  metaWabaAccessToken: 'tok',
  metaWabaBusinessAccountId: 'biz',
  metaAppSecret: 'sec',
  metaWabaVerifyToken: 'vt',
} as any;

describe('sendCtaUrlButton', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.ABC' }] }),
    })) as any);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('monta o interactive cta_url com body, display_text e url', async () => {
    const svc = new MetaWhatsAppService(config);
    await svc.sendCtaUrlButton('5561999999999', 'Sua proposta tá pronta!', 'Ver minha proposta', 'https://x.test/p/abc');

    const call = (fetch as any).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.type).toBe('interactive');
    expect(body.interactive.type).toBe('cta_url');
    expect(body.interactive.body.text).toBe('Sua proposta tá pronta!');
    expect(body.interactive.action.name).toBe('cta_url');
    expect(body.interactive.action.parameters.display_text).toBe('Ver minha proposta');
    expect(body.interactive.action.parameters.url).toBe('https://x.test/p/abc');
  });
});
```

- [ ] **Step 2: Rodar pra ver falhar**

Run: `npx vitest run tests/meta-cta-url.test.ts`
Expected: FAIL — `svc.sendCtaUrlButton is not a function`.

- [ ] **Step 3: Implementar o método**

Inserir em `src/modules/meta-whatsapp.ts` logo após o fim de `sendInteractiveButtons` (depois da linha 185):

```typescript
  // Botão de URL (Call-To-Action). Mostra um botão que ABRE o link no navegador —
  // diferente de sendInteractiveButtons (reply, que só devolve um id). A WABA
  // permite 1 botão cta_url por mensagem. Limites: display_text 20, body 1024.
  async sendCtaUrlButton(
    to: string,
    body: string,
    buttonText: string,
    url: string,
  ): Promise<{ messageId: string }> {
    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: { text: body.slice(0, 1024) },
        action: {
          name: 'cta_url',
          parameters: { display_text: buttonText.slice(0, 20), url },
        },
      },
    };
    return this.postMessage(payload);
  }
```

- [ ] **Step 4: Rodar o teste**

Run: `npx vitest run tests/meta-cta-url.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/meta-whatsapp.ts tests/meta-cta-url.test.ts
git commit -m "feat: sendCtaUrlButton (botão de URL WABA) + teste"
```

---

## Task 5: `buildMensagemClienteProposta` — copy nova com web + PDF + economia

**Files:**
- Modify: `src/modules/proposal-assistant.ts:209-226`
- Test: `tests/proposal-assistant-core.test.ts`

- [ ] **Step 1: Escrever os testes falhando**

Adicionar em `tests/proposal-assistant-core.test.ts` (dentro do arquivo; o `import` de `buildMensagemClienteProposta` já deve existir — se não, adicione `import { buildMensagemClienteProposta } from '../src/modules/proposal-assistant.js';`):

```typescript
describe('buildMensagemClienteProposta — links web+pdf e economia', () => {
  const URL = 'https://propostas.ecosunpower.eng.br/p/zA17dxYrKR_6WnSe';

  it('inclui link web, link .pdf e a linha de economia formatada', () => {
    const msg = buildMensagemClienteProposta('Maria Silva', URL, false, `${URL}.pdf`, 10493);
    expect(msg).toContain('Maria'); // só primeiro nome
    expect(msg).not.toContain('Silva');
    expect(msg).toContain(URL);
    expect(msg).toContain(`${URL}.pdf`);
    expect(msg).toContain('R$ 10.493 mais barata por mês');
    expect(msg).not.toMatch(/drive/i);
  });

  it('sem economia (só-serviço) não imprime a linha do número', () => {
    const msg = buildMensagemClienteProposta('João', URL, true, `${URL}.pdf`, null);
    expect(msg).not.toMatch(/mais barata por mês/);
    expect(msg).toContain(`${URL}.pdf`);
  });

  it('economia zero ou negativa cai no fallback sem número', () => {
    const msg = buildMensagemClienteProposta('Ana', URL, false, `${URL}.pdf`, 0);
    expect(msg).not.toMatch(/mais barata por mês/);
  });
});
```

- [ ] **Step 2: Rodar pra ver falhar**

Run: `npx vitest run tests/proposal-assistant-core.test.ts`
Expected: FAIL — assinatura antiga não aceita `pdfUrl`/`economiaMensal`; faltam as linhas novas.

- [ ] **Step 3: Reescrever a função**

Substituir `buildMensagemClienteProposta` (linhas 209-226) por:

```typescript
export function buildMensagemClienteProposta(
  nome: string | undefined,
  publicUrl: string,
  ehServico: boolean,
  pdfUrl: string,
  economiaMensal: number | null,
): string {
  // Balão 100% LIMPO — o Junior copia o balão inteiro e manda pro cliente sem editar.
  // Copy "a" (foco no bolso): puxa a economia mensal REAL da proposta. WhatsApp mostra
  // a URL no texto (não dá pra esconder em copia-e-cola) — a "camuflagem" é a frase
  // amigável + o domínio próprio (nunca Drive).
  const primeiro = typeof nome === 'string' ? nome.trim().split(/\s+/)[0] : '';
  const saudacao = primeiro ? `Olá, ${primeiro}! 😊` : 'Olá! 😊';
  const fmtRs = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

  // Abertura: com economia válida (>0 e proposta solar) usa o número; senão, genérica.
  const temEconomia = !ehServico && typeof economiaMensal === 'number' && economiaMensal > 0;
  const abertura = temEconomia
    ? `Sua proposta de energia solar da ${empresa().nomeFantasia} está pronta — e sua conta de luz fica cerca de ${fmtRs(economiaMensal as number)} mais barata por mês ☀️`
    : ehServico
      ? `Sua proposta da ${empresa().nomeFantasia} está pronta — feita sob medida pra você ☀️`
      : `Sua proposta de energia solar da ${empresa().nomeFantasia} está pronta — feita sob medida pra você ☀️`;

  const linhas = [
    saudacao,
    '',
    abertura,
  ];
  if (!ehServico) {
    linhas.push(
      '',
      'Em vez de pagar uma conta que só aumenta, você passa a investir em algo que se paga sozinho e ainda valoriza seu imóvel.',
    );
  }
  linhas.push(
    '',
    '🌐 Veja sua proposta completa (abre direto no celular):',
    publicUrl,
    '',
    '📄 Prefere em PDF pra guardar?',
    pdfUrl,
    '',
    'Dá uma olhada — e me chama que eu te explico cada número! 💚',
  );
  return linhas.join('\n');
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run tests/proposal-assistant-core.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/proposal-assistant.ts tests/proposal-assistant-core.test.ts
git commit -m "feat: copy nova do cliente com link web+PDF e economia mensal real"
```

---

## Task 6: Wire do call site `junior_envia`

**Files:**
- Modify: `src/modules/proposal-assistant.ts:1591-1598`

- [ ] **Step 1: Passar `pdfUrl` e `economiaMensal` na chamada**

Substituir o bloco das linhas 1591-1598 por:

```typescript
      const ehServico = !result.calculations;
      const economiaMensalCliente = result.calculations?.economiaMensal ?? null;
      let clienteEnviada = false;
      // Só no modo junior_envia (Junior copia e manda). No eva_envia a própria Eva
      // dispara pro cliente ao tocar "Enviar", então a msg "copia e manda" não cabe —
      // nesse caso o link do cliente cai na revisão (fallback abaixo).
      if (this.metaService && result.publicUrl && modoEnvio === 'junior_envia') {
        try {
          await this.metaService.sendText(
            phone,
            buildMensagemClienteProposta(
              data.nomeCliente,
              result.publicUrl,
              ehServico,
              `${result.publicUrl}.pdf`,
              economiaMensalCliente,
            ),
          );
          clienteEnviada = true;
        } catch (err) {
          console.warn('[proposal] msg do cliente falhou:', (err as Error).message);
        }
      }
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: sem erros (confirma que `result.calculations.economiaMensal` existe no tipo — vem de `GenerateProposalCoreResult.calculations`).

- [ ] **Step 3: Commit**

```bash
git add src/modules/proposal-assistant.ts
git commit -m "feat: junior_envia passa pdfUrl e economia pra mensagem do cliente"
```

---

## Task 7: `eva-sender.ts` — economia na saudação + botão `cta_url`

**Files:**
- Modify: `src/modules/eva-sender.ts` (todo o fluxo de envio)
- Modify: `src/modules/proposal-assistant.ts:1145-1159` (tryDispatchToClient — passar `economiaMensal`)

- [ ] **Step 1: `EnviarPropostaInput` + saudação com economia + botão cta_url**

Substituir o conteúdo de `src/modules/eva-sender.ts` (linhas 7-65) por:

```typescript
export interface EnviarPropostaInput {
  telefoneCliente: string;       // E.164 sem + ou formato BR (sera normalizado)
  nomeCliente: string;
  linkWebPublico: string;
  pdfBuffer: Buffer;
  pdfFilename: string;
  economiaMensal?: number | null; // pra linha persuasiva; null em só-serviço
}

const fmtRs = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

// [ECOSOF] empresa() avaliada na CHAMADA (arrow function) — runtime, não load.
const SAUDACAO = (nomeCliente: string, economiaMensal?: number | null) => {
  const primeiro = nomeCliente.trim().split(/\s+/)[0] || nomeCliente;
  const linhaEconomia =
    typeof economiaMensal === 'number' && economiaMensal > 0
      ? `Sua conta de luz fica cerca de ${fmtRs(economiaMensal)} mais barata por mês ☀️\n\n`
      : '';
  return (
    `Olá, ${primeiro}! 👋\n\n` +
    `Sou a ${empresa().nomeAtendente}, consultora da ${empresa().nomeFantasia} Energia Solar.\n\n` +
    `Junior preparou uma proposta personalizada de energia solar pra você. ${linhaEconomia}` +
    `Vou te mandar agora — é só tocar no botão pra ver. Qualquer dúvida, é só me perguntar aqui mesmo. 😊`
  );
};

const BOTAO_VER = '🌐 Ver minha proposta';
const PDF_CAPTION = `📄 Sua proposta em PDF — toque pra baixar, guardar ou imprimir.`;

// Normaliza telefone pra E.164 sem +. Aceita "(61) 99697-8781", "+5561996978781", "5561996978781", "61996978781".
function normalizePhone(raw: string): string {
  const onlyDigits = raw.replace(/\D/g, '');
  if (onlyDigits.length === 11 && /^[1-9]/.test(onlyDigits)) {
    return `55${onlyDigits}`;
  }
  if (onlyDigits.length === 13 && onlyDigits.startsWith('55')) {
    return onlyDigits;
  }
  if (onlyDigits.length === 12 && onlyDigits.startsWith('55')) {
    // 12 digitos = sem o 9 do celular (telefone fixo ou cel antigo). Aceita.
    return onlyDigits;
  }
  // Fallback: retorna o que tem, com cara que vai dar erro mais claro no Meta
  return onlyDigits;
}

export async function enviarPropostaParaCliente(
  meta: MetaWhatsAppService,
  input: EnviarPropostaInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const to = normalizePhone(input.telefoneCliente);

  try {
    // 1) Saudação + botão clicável que ABRE a proposta web (URL escondida atrás do botão).
    await meta.sendCtaUrlButton(
      to,
      SAUDACAO(input.nomeCliente, input.economiaMensal),
      BOTAO_VER,
      input.linkWebPublico,
    );
    await new Promise((r) => setTimeout(r, 800));

    // 2) PDF como documento nativo (sem link, sem Drive) — é o "baixe o PDF".
    const upload = await meta.uploadMedia(input.pdfBuffer, 'application/pdf', input.pdfFilename);
    await meta.sendDocumentById(to, upload.mediaId, input.pdfFilename, PDF_CAPTION);

    return { ok: true };
  } catch (err) {
    const msg = (err as Error).message ?? 'erro desconhecido';
    return { ok: false, reason: msg };
  }
}
```

> Nota: o comentário de topo do arquivo ("Manda 3 mensagens…") fica desatualizado — atualize a linha 2 pra: `// Manda 2 mensagens: botão pra ver a proposta web -> PDF anexado.`

- [ ] **Step 2: Atualizar o comentário de topo (linha 1-2)**

Trocar a linha 2 de `src/modules/eva-sender.ts` por:

```typescript
// Manda 2 mensagens: botão pra ver a proposta web -> PDF anexado.
```

- [ ] **Step 3: `tryDispatchToClient` passa a economia**

Em `src/modules/proposal-assistant.ts`, reescrever o bloco 1124-1159 pra calcular a economia nos dois ramos e repassá-la:

```typescript
    // Re-gera o PDF buffer (nao salvamos buffer no Redis pra economizar memoria).
    try {
      let pdfBuffer: Buffer;
      let economiaMensalEnvio: number | null = null;
      if (isPropostaSoServico(last.data)) {
        // Proposta SÓ-SERVIÇO: re-renderiza pelo layout de serviço — NUNCA o solar.
        const servicos = (last.proposalData.servicos?.length
          ? last.proposalData.servicos
          : mapServicosFromClaude(last.data.servicos) ?? []) as ServicoItem[];
        const serviceData = buildServiceOnlyData({
          numeroProposta: last.proposalData.numeroProposta,
          dataProposta: (last.proposalData as any).dataProposta ?? new Date().toLocaleDateString('pt-BR'),
          data: last.data,
          servicos,
          empresa: this.companyDefaults,
          criarPagamentoPadrao: (t) => servicePaymentOptions(t),
        });
        pdfBuffer = await htmlToPdf(renderServiceOnlyHTML(serviceData, await this.logoProposta()), { waitForChartMs: 0 });
      } else {
        const calcInput = this.dataToCalculatorInput(last.data);
        const calculations = calcular(calcInput);
        economiaMensalEnvio = calculations.economiaMensal;
        const socialProofHtml = await this.buildSocialProofHtml(last.proposalData.tipoCliente);
        const html = renderProposalHTML(last.proposalData, calculations, socialProofHtml, await this.logoProposta());
        pdfBuffer = await htmlToPdf(html, { waitForChartMs: 2000 });
      }

      const result = await enviarPropostaParaCliente(this.metaService, {
        telefoneCliente: telefone,
        nomeCliente: nome,
        linkWebPublico: last.publicUrl,
        pdfBuffer,
        pdfFilename: `Proposta-${empresa().nomeFantasia.replace(/[^a-zA-Z0-9]/g, '')}-${nome.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-')}.pdf`,
        economiaMensal: economiaMensalEnvio,
      });
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: sem erros de TypeScript.

- [ ] **Step 5: Rodar a suíte inteira (garante que nada quebrou em eva-sender)**

Run: `npm test`
Expected: PASS (verde). Se algum teste referenciava `LINK_WEB`/`SAUDACAO` antigos, ajuste-o pro novo formato.

- [ ] **Step 6: Commit**

```bash
git add src/modules/eva-sender.ts src/modules/proposal-assistant.ts
git commit -m "feat: eva_envia usa botão cta_url + economia na saudação"
```

---

## Task 8: Rota pública `GET /p/:slug.pdf`

**Files:**
- Modify: `src/index.ts` (adicionar a rota logo após o handler `GET /p/:slug`, ~linha 7348; e passar `'web'` no triggerOnView da rota web)

- [ ] **Step 1: Passar `'web'` explícito no triggerOnView da rota web**

Em `src/index.ts` linha 7337, trocar:

```typescript
            proposalFollowup.triggerOnView(slug, result.acessosAntes);
```

por:

```typescript
            proposalFollowup.triggerOnView(slug, result.acessosAntes, 'web');
```

- [ ] **Step 2: Adicionar a rota do PDF**

Inserir em `src/index.ts` logo após o fechamento do handler `app.get('/p/:slug', ...)` (depois da linha 7347), antes do comentário do `/r/:slug`:

```typescript
  // PDF público da proposta — gera na hora a partir do HTML salvo (sem Drive).
  // URL bonita usada nas mensagens do cliente: /p/<slug>.pdf
  // Compartilha o contador de acessos com a rota web → abordagem dispara 1x só.
  app.get('/p/:slug.pdf', async (req, res) => {
    const slug = String(req.params.slug ?? '');
    if (!/^[A-Za-z0-9_-]{16,32}$/.test(slug)) {
      return res.status(404).type('text/html').send(propostaErrorHtml('not_found'));
    }
    try {
      const result = await supabase.getPropostaPublicaBySlug(slug);
      if (result.status === 'expired') {
        return res.status(410).type('text/html').send(propostaErrorHtml('expired'));
      }
      if (result.status === 'revoked' || result.status === 'not_found') {
        return res.status(404).type('text/html').send(propostaErrorHtml('not_found'));
      }

      const { htmlToPdf } = await import('./modules/proposal/pdf-generator.js');
      const pdf = await htmlToPdf(result.html!, { waitForChartMs: 2000 });

      // Nome de arquivo amigável pro cliente (sanitiza o nome).
      const nomeArq = (result.clienteNome ?? 'Proposta')
        .replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-') || 'Proposta';
      const filename = `Proposta-EcoSunPower-${nomeArq}.pdf`;

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Vary', '*');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.type('application/pdf')
        .set('Content-Disposition', `inline; filename="${filename}"`)
        .send(pdf);

      // Rastreio: mesma trilha da rota web, canal='pdf'. Fire-and-forget.
      const reqIp = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
        ?? req.socket.remoteAddress ?? null;
      const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;
      const referer = (req.headers['referer'] as string | undefined) ?? null;
      supabase.registrarVisualizacaoProposta({
        slug, ipAddress: reqIp, userAgent, isPreview: false, referer, canal: 'pdf',
      });
      supabase.incrementPropostaPublicaAcesso(slug)
        .then((r) => { if (r) proposalFollowup.triggerOnView(slug, r.acessosAntes, 'pdf'); })
        .catch((err) => console.warn('[proposta-pdf] track acesso falhou:', err));
    } catch (err) {
      console.error('[proposta-pdf] erro:', err);
      res.status(500).type('text/html').send(propostaErrorHtml('error'));
    }
  });
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: sem erros. (Confirma que `propostaErrorHtml`, `supabase`, `proposalFollowup` estão no escopo — são os mesmos usados pela rota `/p/:slug` logo acima.)

- [ ] **Step 4: Verificação manual (a rota usa Puppeteer + DB, não dá pra unit-testar barato)**

1. Rodar local: `npm run dev`
2. Pegar um slug válido existente no banco (ou gerar uma proposta de teste).
3. Abrir `http://localhost:<porta>/p/<slug>.pdf` → deve baixar/abrir um PDF com nome `Proposta-EcoSunPower-<Cliente>.pdf`.
4. Abrir `http://localhost:<porta>/p/<slug>` (web) e depois o `.pdf`: confirmar no log que a abordagem dispara **uma vez só** (segunda abertura = "reabriu").
5. Slug inválido (`/p/abc.pdf`) → 404.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat: rota /p/:slug.pdf — PDF próprio (sem Drive), rastreável canal=pdf"
```

---

## Verificação final (antes de pedir push)

- [ ] `npm run build` limpo.
- [ ] `npm test` verde (suíte inteira).
- [ ] Code review 3× (rodar a review, corrigir achados, repetir — conforme regra do Junior), antes de pedir autorização de push.
- [ ] Migration 053 entregue ao Junior pra aplicar no SQL Editor do projeto de produção `kupnsoyymulbdzakqlqc` (o MCP aponta pro projeto errado — não aplicar por lá).
- [ ] Smoke em produção depois do Implantar: gerar 1 proposta, conferir a mensagem do cliente (web + PDF + economia batendo com a proposta), abrir o `.pdf`, e confirmar abordagem única.

## Self-Review (feita)

- **Cobertura da spec:** rota PDF (Task 8) · copy + economia (Task 5, 6, 7) · botão cta_url (Task 4, 7) · revisão do Junior intacta (não tocada) · rastreio compartilhado + canal (Task 1, 2, 3, 8). ✅
- **Sem placeholders:** todo passo tem código real ou comando com resultado esperado. ✅
- **Consistência de tipos:** `canal: 'web' | 'pdf'` igual em supabase/followup/index; `economiaMensal: number | null` igual em buildMensagem/EnviarPropostaInput; `sendCtaUrlButton(to, body, buttonText, url)` igual no teste e no uso. ✅

## Fora de escopo (YAGNI)
- Encurtador / slug vanity.
- Trava anti-bot pro preview do WhatsApp (só se virar problema real).
- Mudar a versão de revisão do Junior.
- Retroagir propostas já enviadas (forward-only).
