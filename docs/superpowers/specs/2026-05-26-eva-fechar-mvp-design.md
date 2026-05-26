# Eva /fechar MVP — Contrato + Procuração

**Data**: 2026-05-26
**Autor**: Junior (Antonio Candido Rodrigues Junior, Responsável Técnico CREA/CFT)
**Status**: Design aprovado, pronto pra plano de implementação

## Contexto

Hoje a Eva (modo conversa) não consegue buscar uma proposta enviada anteriormente nem gerar contrato/procuração a partir dela. O motivo é técnico: a Eva conversacional não tem function-calling — ela só tem o system prompt + histórico + RAG. Pra gerar contrato Junior precisa parar e fazer no Word.

Já existe spec textual desse fluxo em `conhecimento/contratos.md` (modo `/fechar`), mas nunca foi implementada. Existe também um PDF de contrato real (Camila Cardoso) renderizado manualmente via Puppeteer em sessão antiga, comprovando que HTML → PDF funciona.

A migration 033 (Perfil do Cliente A1) já adicionou no `leads`: CPF/CNPJ, endereço completo, concessionária, UC, forma de pagamento, etc. A tabela `propostas_publicas` (migration 016) já guarda `dados_input` JSONB com kWp, módulos, inversor, valor, modalidade. **A maior parte dos dados que o contrato precisa já está no banco** — Eva só precisa de ferramenta pra buscar.

## Objetivo

Implementar o comando `/fechar` da Eva pra gerar contrato + procuração em PDF a partir da proposta enviada, com mínimo de digitação por parte do Junior. MVP: PDFs no Drive, envio pro cliente continua manual. eSignature fica pra fase 2.

## Escopo

### Incluído
- Comando `/fechar` (texto) e botão **"Fechou venda"** no alerta de proposta enviada/vista
- Busca automática do lead + última proposta pública no banco
- Coleta conversacional do que falta (tipicamente só RG + observações)
- Suporte a **titular da UC ≠ contratante** (caso cônjuge, sócio, familiar)
- Geração HTML → PDF via Puppeteer (template do contrato Camila como base canônica)
- Upload na pasta do cliente no Google Drive
- Persistência em tabela `fechamentos` com snapshot dos dados
- Botões pós-geração: **Refazer** / **Aprovar e marcar como fechado** / **Cancelar**

### Não incluído (fase 2+)
- eSignature do Google Workspace (assinatura digital)
- Envio automático do contrato pro cliente
- Cron de cobrança pós-assinatura
- Webhook de assinatura recebida

## Decisões de produto

| # | Decisão | Motivo |
|---|---|---|
| 1 | Escopo MVP rápido, sem eSignature | Junior valida o fluxo em prod antes de investir em integração Workspace |
| 2 | HTML local → PDF via Puppeteer, não Google Docs API | Velocidade (já funciona pra Camila) + custo zero. Migração pra Docs API fica como evolução |
| 3 | Drive como destino | Junior usa Workspace pra tudo. Pasta `EcoSunPower/Contratos/<ano>/<cliente>/` |
| 4 | 3 modos de gatilho | (a) botão no alerta de proposta, (b) comando `/fechar [nome]`, (c) conversa livre dentro do modo |
| 5 | Eva pergunta SÓ o que falta | Reaproveita dados de `leads` + `propostas_publicas.dados_input`. Mensagem curta, não repete o que já tem |
| 6 | Titular UC e Contratante são entidades separadas | Caso real: procuração no nome de quem é titular da conta de luz, contrato no nome de quem fechou (ex: cônjuge, sócio) |
| 7 | Versionar PDFs ao refazer | `contrato-v1.pdf`, `contrato-v2.pdf` — mantém rastro, não sobrescreve |
| 8 | Botão "Aprovar" muda `leads.status = 'cliente'` | Marca a venda como fechada no funil sem digitação extra |

## Arquitetura

### Diretório `src/modules/closing/`

```
src/modules/closing/
  closing-assistant.ts        ← orquestrador, estado Redis, conversa via LLM
  closing-data-fetcher.ts     ← busca lead + última proposta + monta DadosFechamento parcial
  closing-validator.ts        ← CPF/CEP/email/telefone + campos obrigatórios
  closing-render.ts           ← HTML → PDF (Puppeteer)
  closing-drive.ts            ← upload pasta + arquivos no Drive
  closing-persist.ts          ← grava em fechamentos, transita status
  closing-buttons.ts          ← handlers evabt:fechar*
  templates/
    contrato.html.ts          ← renderContrato(dados) → string
    procuracao.html.ts        ← renderProcuracao(dados) → string
  types.ts                    ← DadosFechamento, PessoaFisica/Juridica, Endereco
  index.ts
```

### Integrações no código existente

- **`src/modules/eva-admin-buttons.ts`**: adiciona cases `fechar`, `fechar-pick`, `fechar-aprovar`, `fechar-refazer`, `fechar-cancelar`.
- **`src/modules/proposal-assistant.ts`**: injeta botão "Fechou venda" no alerta de proposta gerada.
- **`src/modules/proposal-followup.ts`**: injeta botão no alerta de proposta vista pelo cliente.
- **`src/index.ts`**: rota de comando `/fechar` e roteamento de mensagens em modo `closing` (estado Redis).
- **`src/prompts/closing-system.md`** (novo): system prompt do modo closing — extrai dados, valida, conversa curta, segue regra de ouro do `conhecimento/contratos.md` (nunca gera com obrigatório faltando).

### Banco de dados

Migration `036_fechamentos.sql`:

```sql
CREATE TABLE fechamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  proposta_publica_id uuid REFERENCES propostas_publicas(id) ON DELETE SET NULL,

  docs_pedidos text[] NOT NULL,        -- ['contrato'] | ['procuracao'] | ['contrato','procuracao']
  dados_snapshot jsonb NOT NULL,        -- DadosFechamento completo usado no render

  contrato_drive_id text,
  contrato_drive_link text,
  procuracao_drive_id text,
  procuracao_drive_link text,
  drive_folder_id text,

  status text NOT NULL DEFAULT 'gerado',
  -- 'gerado' | 'aprovado_junior' | 'enviado_cliente' | 'cancelado'

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,             -- telefone do admin que disparou
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fechamentos_lead ON fechamentos(lead_id, created_at DESC);
CREATE INDEX idx_fechamentos_status ON fechamentos(status, created_at DESC);

COMMENT ON TABLE fechamentos IS 'Cada execução do modo /fechar. dados_snapshot guarda exatamente o que foi renderizado pros PDFs (rastreabilidade).';
```

### Tipos centrais

```typescript
type Endereco = {
  rua: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: 'DF' | 'GO';
  cep: string;
};

type PessoaFisica = {
  tipo: 'PF';
  nome: string;
  cpf: string;
  rg: string;
  orgao_emissor_rg: string;        // ex: 'SSP-DF', 'MTE-DF'
  nacionalidade: string;            // default 'Brasileiro(a)'
  estado_civil?: string;
  profissao?: string;
  data_nascimento?: string;         // ISO
  endereco: Endereco;
  telefone: string;
  email: string;
};

type PessoaJuridica = {
  tipo: 'PJ';
  razao_social: string;
  cnpj: string;
  endereco: Endereco;
  representante: PessoaFisica;     // sócio assinante
  telefone: string;
  email: string;
};

type Sistema = {
  kwp: number;
  modalidade: 'autoconsumo_local' | 'autoconsumo_remoto' | 'geracao_compartilhada';
  modulos: { marca: string; potencia_w: number; quantidade: number };
  inversor: { marca: string; modelo: string; potencia_kw: number };
};

type Comercial = {
  valor_total_brl: number;
  forma_pagamento: string;          // texto livre, ex: 'à vista PIX', 'parcelado 24x'
};

type RelacaoContratante = 'conjuge' | 'socio' | 'familiar' | 'financiador' | 'outro';

type DadosFechamento = {
  // Titular da UC (vai NA PROCURAÇÃO sempre)
  titular_uc: PessoaFisica | PessoaJuridica;
  uc_numero?: string;               // 'a confirmar' se vazio
  concessionaria: 'Neoenergia-DF' | 'Equatorial-GO';
  endereco_instalacao: Endereco;    // pode ser diferente do endereço residencial

  // Contratante (vai NO CONTRATO; pode ser igual ao titular_uc)
  contratante: PessoaFisica | PessoaJuridica;
  contratante_eh_titular: boolean;
  relacao_contratante?: RelacaoContratante;  // só preenche se contratante_eh_titular === false
  observacao_partes?: string;                 // gerada DETERMINISTICAMENTE a partir de relacao_contratante

  sistema: Sistema;
  comercial: Comercial;
  disposicoes_especiais?: string;    // cláusula 23

  docs_pedidos: ('contrato' | 'procuracao')[];
};
```

## Fluxo do usuário

### Modo 1 — Botão "Fechou venda"

1. Eva mandou alerta pro Junior: *"📋 Proposta gerada pra Camila Cardoso — 8,4 kWp, R$ 38.500."* com botões `[Ver proposta]` `[Fechou venda]` `[Não fechou]`.
2. Junior clica em **Fechou venda** → `evabt:fechar:<lead_id>`.
3. Eva responde:
   ```
   Bora fechar a venda da Camila Cardoso. Achei a proposta de 28/04
   (8,4 kWp, R$ 38.500). Pra fechar contrato + procuração, falta:

   • RG + órgão emissor da Camila
   • Forma de pagamento (à vista PIX? parcelado?)
   • Alguma observação especial?

   Pode mandar tudo junto.
   ```
4. Junior digita: *"RG 26163 MTE-DF, à vista PIX, contrato no nome do marido Toninho, CPF 444.555.666-77, RG 9876543 SSP-DF, casado, empresário."*
5. Eva (LLM) extrai os dados estruturados do texto livre. A partir do campo `relacao_com_titular` extraído (`'conjuge' | 'socio' | 'familiar' | 'financiador' | 'outro'`), o código (não o LLM) gera `observacao_partes` por template determinístico — evita variação textual entre fechamentos. Resumo:
   ```
   📋 Confirma os dados antes de gerar?

   Titular UC (procuração): Camila Cardoso, CPF 028.876.121-90, RG 26163 MTE-DF
   Contratante (contrato): Antônio Carlos "Toninho", CPF 444.555.666-77, RG 9876543 SSP-DF
   Observação: cônjuge da titular

   Sistema: 8,4 kWp, 12x Trina 700W, Sungrow SG5.0RS-L
   Modalidade: autoconsumo local | Concessionária: Equatorial-GO
   Valor: R$ 38.500 à vista PIX

   [Gerar]  [Ajustar]
   ```
6. Junior clica **Gerar** → Eva renderiza, sobe no Drive, responde:
   ```
   ✅ Contrato + procuração prontos pra Camila Cardoso.

   📄 Contrato: <drive link>
   📄 Procuração: <drive link>
   📁 Pasta: <drive link>

   [Refazer]  [Aprovar e marcar como fechado]  [Cancelar]
   ```

### Modo 2 — Comando explícito

- `/fechar` → Eva: *"Pra qual cliente? E o que você precisa: contrato + procuração, só contrato, ou só procuração?"*
- `/fechar Camila Cardoso` → Eva busca lead, segue como Modo 1.
- `/fechar só procuração Camila` → gera só procuração da Camila.
- `/fechar contrato Manuel Silva, CPF 111.222.333-44, ...` → cliente novo (sem lead no banco), Eva entende e coleta tudo do zero.

### Modo 3 — Conversa livre dentro do modo

Estando em modo `closing`:
- *"ajusta valor pra 42 mil"* → atualiza `comercial.valor_total_brl`
- *"adiciona obs: limpeza grátis no 1º ano"* → vira `disposicoes_especiais`
- *"muda RG pra 1234567 SSP-DF"* → atualiza
- *"gera"* → handleGerar()
- *"cancela"* → sai do modo, limpa Redis

## Fonte dos dados (resolução automática)

| Campo do contrato | De onde vem | Eva pergunta se faltar? |
|---|---|---|
| Nome completo | `leads.nome` | Sim |
| CPF/CNPJ | `leads.cpf_cnpj` | Sim |
| **RG + órgão emissor** | **(não tem no banco)** | **Sempre pergunta** |
| Data nascimento | `leads.data_nascimento` | Opcional |
| Estado civil | `leads.estado_civil` | Opcional (pergunta 1x) |
| Profissão | (não tem) | Opcional |
| Nacionalidade | default `'Brasileiro(a)'` | Não |
| Endereço completo | `leads.endereco_*` + `leads.cep` + `leads.uf` | Sim se faltar parte |
| Telefone | `leads.telefone` | Sim |
| E-mail | `leads.email` | Sim |
| Concessionária | `leads.concessionaria` (default por UF: DF→Neoenergia, GO→Equatorial) | Não |
| UC nº | `leads.uc_numero` | Não (grava `'a confirmar'` se faltar) |
| kWp | `propostas_publicas.dados_input.potencia_kwp` | Sim |
| Modalidade | `propostas_publicas.dados_input.modalidade` | Sim |
| Módulos | `propostas_publicas.dados_input.modulos` | Sim |
| Inversor | `propostas_publicas.dados_input.inversor` | Sim |
| Valor total | `propostas_publicas.dados_input.valor_total` | Sim |
| Forma de pagamento | `leads.forma_pagamento` ou input | Sim |
| Endereço da instalação | default = endereço cliente | Não |
| Data do contrato | `now()` | Não |
| Cidade do contrato | extraída do endereço | Não |
| Garantias padrão (módulos 25a, inversor 10a, mão de obra 12m) | defaults `conhecimento/contratos.md` | Não |

### Identificação do lead (modo comando)

`leads.nome ILIKE '%<termo>%'`:
- 0 resultados → "Cliente novo? Manda os dados completos."
- 1 resultado → usa direto.
- 2+ resultados → lista com telefone parcial e botões `evabt:fechar-pick:<lead_id>`.

### Última proposta do lead

`propostas_publicas WHERE cliente_telefone = leads.telefone OR cliente_nome ILIKE leads.nome ORDER BY created_at DESC LIMIT 1`.

Se não achar proposta → Eva avisa *"Não achei proposta gerada por mim pra esse cliente. Vou precisar dos dados do sistema: kWp, módulos, inversor, valor..."* e pede.

## Validações antes de gerar

1. **CPF/CNPJ** — formato válido (11 / 14 dígitos), formata se vier sem máscara.
2. **CEP** — 8 dígitos, pergunta se incompleto.
3. **Telefone** — DDD + número formato BR.
4. **E-mail** — regex básico `algo@algo.algo`.
5. **kWp ≈ qtd × W** — se Junior disser "12 painéis 700W", Eva confirma "8,4 kWp, certo?". Não bloqueia, só alerta.
6. **Modalidade explícita** — se Junior só disser "autoconsumo", pergunta "local ou remoto?".
7. **Concessionária da UF correta** — DF→Neoenergia-DF, GO→Equatorial-GO. Eva infere e confirma.

**Regra de ouro**: Eva NUNCA gera com obrigatório faltando. Lista exata do que falta, agrupada, sem repetir o que já tem.

## Render

### Templates HTML

- **`templates/contrato.html.ts`** — função `renderContrato(dados: DadosFechamento) → string`. Source: `tmp/contrato-camila.html` vira template canônico, placeholders extraídos como interpolação de template literal. Se `contratante_eh_titular === false`, adiciona caixa amarela de observação no topo (igual `<div class="obs-marido">` que já existe na linha 30 do HTML da Camila).
- **`templates/procuracao.html.ts`** — função `renderProcuracao(dados: DadosFechamento) → string`. **Reconstruir HTML** a partir do PDF de teste (`tmp/procuracao-camila.pdf`) + spec do `conhecimento/contratos.md`. Outorgante = `titular_uc`, outorgado = EcoSunPower / Junior CREA/CFT.

Sem engine externa (Handlebars/EJS) — interpolação literal pra manter dependências baixas.

### HTML → PDF

`closing-render.ts`:
- Puppeteer (já é dependência, conforme `tmp/render-contrato-pdf.mjs`).
- Single browser instance por processo, lançado lazy, reutilizado entre requests.
- A4, margens 2cm × 2,2cm × 2cm × 2,2cm, `printBackground: true`.
- Retorna `Buffer`.

## Drive

### Estrutura de pastas

```
EcoSunPower/
  Contratos/
    2026/
      Camila Cardoso - 028876/        ← <Nome titular> - <6 primeiros dígitos do CPF>
        contrato-v1.pdf
        procuracao-v1.pdf
        dados-input-v1.json           ← snapshot pra rastreio
```

Cria pastas sob demanda. Reusa autenticação OAuth do `src/modules/proposal/drive-uploader.ts`.

### Versionamento ao refazer

Se Junior clicar **Refazer** → gera novo `fechamento_id`, novos arquivos `contrato-v2.pdf`, `procuracao-v2.pdf`. Não sobrescreve. `dados_snapshot` do banco mantém histórico completo.

### Permissões

PDFs ficam só com o Junior (owner do Drive). Sem share automático com cliente — MVP, ele controla envio.

## Estado conversacional (Redis)

```
key: closing:<phone>
TTL: 1h (renovado a cada mensagem)
value: {
  state: 'collecting' | 'awaiting_confirm' | 'rendering',
  lead_id?: string,
  proposta_publica_id?: string,
  fechamento_id?: string,
  dados: Partial<DadosFechamento>,
  pending_questions: string[],         // o que ainda falta
  created_at: ISO
}
```

Comando `/sair` ou `/fechar off` limpa o estado.

## Testes (TDD)

| Arquivo | Cobertura |
|---|---|
| `tests/closing-validator.test.ts` | CPF válido/inválido, CEP, e-mail, telefone, kWp coerente, lista de obrigatórios |
| `tests/closing-data-fetcher.test.ts` | Mock Supabase: lead único / ambíguo / sem proposta / com proposta. Mapeamento `dados_input` → `DadosFechamento` |
| `tests/closing-templates.test.ts` | renderContrato/renderProcuracao com asserts em pontos-chave: CPF, RG, valor, kWp aparecem no HTML; caixa de observação aparece quando titular≠contratante; outorgante da procuração é sempre titular_uc |
| `tests/closing-assistant.test.ts` | Máquina de estado: lista "o que falta", transições, comandos `gerar`/`cancelar`, separação titular≠contratante via LLM stub |
| `tests/closing-render.test.ts` | HTML real → PDF buffer válido (smoke), 100-300kb |
| `tests/closing-e2e.test.ts` | Stub Drive + Puppeteer, valida fluxo botão → gerar → links sem quebrar |

### Caso canônico de teste (Camila)

Fixture com:
- `lead` Camila completo (CPF 028.876.121-90, endereço Águas Lindas-GO, telefone, email)
- `proposta_publica` com 8,4 kWp Trina 700W + Sungrow SG5.0RS-L + R$ 38.500 + autoconsumo local + Equatorial-GO
- Input do Junior: *"RG 26163 MTE-DF, à vista PIX, contrato no nome do Toninho, marido, CPF 444.555.666-77, RG 9876543 SSP-DF, casado, empresário."*

Resultado esperado:
- Procuração com **Camila** como outorgante
- Contrato com **Toninho** como CONTRATANTE + caixa amarela de observação mencionando cônjuge da titular
- Ambos os PDFs em `EcoSunPower/Contratos/2026/Camila Cardoso - 028876/`
- Registro em `fechamentos` com `docs_pedidos = ['contrato','procuracao']`, `contratante_eh_titular = false`, `dados_snapshot` completo

## Custos estimados

- **LLM** (Sonnet 4.6 com prompt caching): R$ 0,15 – 0,40 por fechamento.
- **Drive API**: gratuito (cota Workspace).
- **Puppeteer**: 500ms – 1s por PDF, sem custo externo.
- **Dev**: 1 sessão de 3-4h (3 sub-projetos: tabela + render + assistant).

## Out of scope (fase 2+)

- eSignature do Google Workspace (assinatura digital com validade jurídica MP 2.200-2 / Lei 14.063).
- Envio automático pro cliente via WhatsApp + e-mail.
- Cron de cobrança após X dias sem assinatura.
- Webhook Drive → notificação Eva quando cliente assinar.
- Migração de templates HTML pra Google Docs (editáveis no Drive).
- Anexar comprovantes (RG, comprovante endereço) à pasta do cliente.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Template procuração precisa ser reconstruído (só tem PDF) | Sub-projeto 1: extrair texto via `pdftotext` + ler spec contratos.md, montar HTML manualmente e validar visualmente antes de codar substituições |
| Puppeteer em produção (Easypanel) pode quebrar por falta de Chromium | Adicionar Chromium ao Dockerfile (puppeteer não vem com Chromium quando instalado em prod). Já tem teste manual rodando local |
| Drive auth pode expirar | Reusar exatamente o mesmo OAuth do `proposal/drive-uploader.ts` que já funciona em prod |
| LLM extrai dados errado de texto livre | Validador roda DEPOIS do LLM e bloqueia geração se dados incompletos/inválidos. Pior caso: Junior corrige na conversa antes de clicar [Gerar] |
| Cliente PJ + titular PF (rateio de geração) | Modelo já suporta `PessoaJuridica` no `contratante` e `PessoaFisica` no `titular_uc`. Cláusula 23 cobre observação |

## Referências internas

- Spec textual do fluxo: `conhecimento/contratos.md`
- Contrato canônico (HTML real): `tmp/contrato-camila.html`
- PDF de procuração de referência: `tmp/procuracao-camila.pdf`
- Render manual antigo (Puppeteer): `tmp/render-contrato-pdf.mjs`
- Migration de leads completos: `supabase/migrations/033_clientes_perfil.sql`
- Migration de propostas públicas: `supabase/migrations/016_propostas_publicas.sql`
- Padrão de botões admin: `src/modules/eva-admin-buttons.ts`
- Padrão de assistente conversacional: `src/modules/proposal-assistant.ts`
- Dados do Responsável Técnico: memory `reference_dados_responsavel_tecnico.md`
- Preferências de contrato: memory `feedback_modelo_contrato_procuracao.md`
