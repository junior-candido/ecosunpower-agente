# Eva — Procuração e Contrato rápidos via WhatsApp (Design)

**Data:** 2026-05-27
**Autor:** Junior + Claude (sessão brainstorm)
**Status:** aprovado, aguardando plano de implementação
**Repositório:** `ecosunpower-agente`
**Predecessores:**
- `docs/superpowers/specs/2026-05-26-eva-fechar-mvp-design.md` (feature `/fechar` MVP)
- Memória `project_eva_fechar_status_26_05` (estado em prod no fim de 26/05)

---

## 1. Contexto e Problema

O comando `/fechar` em prod (HEAD `70ccbe3`) gera procuração **e** contrato em pacote, coletando todos os campos de uma vez (pessoais + sistema + comercial + cláusulas), renderizando dois PDFs e subindo no Drive. Esse fluxo serve bem pro fechamento final (cliente decidiu, vamos formalizar), mas é pesado pros dois momentos mais frequentes do dia a dia:

- **Procuração isolada**: Junior precisa protocolar acesso na Neoenergia-DF/Equatorial-GO antes de o cliente assinar contrato — ganha 5-10 dias úteis no cronograma. Hoje o `/fechar` força coletar dados comerciais que não fazem sentido nesse momento.
- **Contrato isolado**: cliente decidiu, mas Junior já tinha a procuração rodando — pacote completo seria redundante.

Em paralelo, o `/fechar` atual gera **PDF**, mas o fluxo prático do Junior é **abrir o Google Doc no Workspace → Ferramentas → Assinatura eletrônica → mandar pro cliente assinar**. PDF não dá eSignature nativo no Workspace; Google Doc dá. Hoje ele baixa o PDF, sobe como Doc manual, perde tempo.

**Validação manual feita em 27/05/2026** (caso Fernanda Silva Almeida Araújo de Melo): geramos a procuração manualmente no chat (HTML simples 1 página → Google Doc no Drive na pasta dela), Junior aprovou o modelo, fez eSignature em ~2 min. Esse fluxo virou o padrão a automatizar.

## 2. Objetivo

Permitir que Junior dispare, do WhatsApp, geração rápida de:
- **Só procuração** (caso mais comum — protocolo cedo na concessionária)
- **Só contrato** (fechamento de cliente que já tem procuração)
- **Ambos juntos** (comportamento atual do `/fechar` preservado)

Saída: **Google Doc** na pasta do cliente no Drive, eSignature-ready. Junior arrocha a assinatura manual no Workspace. Sem burocracia, mínimo de perguntas (idealmente 0 a 2 quando o cliente já tem proposta no banco).

**Não-objetivo nesta entrega:**
- Disparo automático de eSignature pela Eva (Junior arrocha manual no Workspace)
- Envio direto pro cliente via Eva (Workspace envia o email de assinatura)
- Cron de cobrança pós-assinatura
- Dashboard de pipeline de fechamento (existe parcial, fora de escopo aqui)

## 3. Decisões de Arquitetura

### 3.1 Reuso máximo do módulo `closing/` existente

O módulo `src/modules/closing/` já tem 80% do necessário:
- `types.ts`: `DadosFechamento` já prevê `docs_pedidos: DocPedido[]` (linha 83)
- `closing-validator.ts`: `findMissingRequired` — passa a filtrar por `docs_pedidos`
- `closing-data-fetcher.ts`: busca de lead + proposta, build inicial dos dados
- `closing-assistant.ts`: orquestração LLM
- `closing-drive.ts`: upload (hoje só PDF; passa a subir HTML→Doc também)
- `closing-persist.ts`: tabela `fechamentos` (migration 040)
- `templates/contrato.html.ts`: 18 cláusulas, robusto, mantém
- `templates/procuracao.html.ts`: **será reescrito** com modelo simples validado em 27/05

**Não criamos novo módulo.** Toda a feature mora dentro de `closing/`. Triggers de comando ficam no `index.ts` de roteamento da Eva.

### 3.2 Três triggers, mesma pipeline

| Comando do Junior | docs_pedidos | Comportamento |
|---|---|---|
| `procuracao [nome]` / `Procuração [nome]` | `['procuracao']` | Direto, sem botão intermediário |
| `contrato [nome]` / `Contrato [nome]` | `['contrato']` | Direto, sem botão intermediário |
| `fechar [nome]` / `Fechar [nome]` | indefinido até botão | Mostra 3 botões `[Procuração] [Contrato] [Ambos]` antes de coletar |

**Normalização de entrada** (parser de comando):
- Aceita com ou sem barra: `procuracao` ≡ `/procuracao`
- Case-insensitive: `PROCURACAO` ≡ `procuracao`
- Aceita acentos: `procuração` ≡ `procuracao`
- Ignora palavras curtas conectivas: `procuração da Fernanda` ≡ `procuracao Fernanda`

Implementação: regex de tolerância no entrypoint do roteamento (mesmo lugar onde hoje `b23950d` permite "fechar" sem barra).

### 3.3 Coleta condicional por documento

Hoje o `findMissingRequired` recebe `docs_pedidos` mas trata-os como "se inclui contrato então pede X". Vai virar **filtro real**:

| Campo | Procuração | Contrato | Ambos |
|---|---|---|---|
| nome | ✓ | ✓ | ✓ |
| CPF | ✓ | ✓ | ✓ |
| RG + órgão | ✓ | ✓ | ✓ |
| endereço completo + CEP | ✓ | ✓ | ✓ |
| concessionária | ✓ | ✓ | ✓ |
| UC | ✓ | – | ✓ |
| nacionalidade | opcional (default "brasileiro(a)") | opcional | opcional |
| estado civil | opcional | opcional | opcional |
| profissão | opcional | opcional | opcional |
| email | – | ✓ | ✓ |
| telefone | – (já tem do lead) | ✓ | ✓ |
| data nascimento | – | opcional | opcional |
| sistema (kWp, módulos, inversor) | – | ✓ | ✓ |
| valor total | – | ✓ | ✓ |
| forma de pagamento | – | ✓ | ✓ |
| contratante ≠ titular? | – | ✓ (com botão) | ✓ |
| disposições especiais | – | pergunta explícita (Sim/Não) | pergunta explícita |

**Reuso de dados do banco** (sem perguntar):
- Lead: `name`, `phone`, `cpf` (se preenchido)
- Proposta pública: `cliente_endereco`, `uc_numero`, `sistema_json`, `valor_total`, `cliente_email`
- Concessionária: inferida da cidade (Brasília → Neoenergia-DF; demais → Equatorial-GO; lista `cidades-df-go.ts` já existe no repo)

**Pergunta única, resposta livre**: Eva lista o que falta numa frase ("Faltam: RG e UC"), Junior responde no formato que quiser ("1830813 SSP-DF, UC 3098127"), LLM faz parse. Se faltou algo, re-pergunta SÓ o que faltou.

### 3.4 Cláusula 23ª destacada na coleta do contrato

Hoje `disposicoes_especiais` é campo opcional escondido — o LLM raramente colhe. Passa a ser pergunta EXPLÍCITA antes do preview final:

```
Eva → "Quer adicionar alguma condição específica nesse contrato?"
      [Sim, vou ditar] [Não, padrão]

Se [Sim] → Junior dita texto livre → vai LITERAL pra cláusula 23ª
Se [Não] → cláusula 23 não aparece no contrato (já é assim hoje)
```

Sem reinterpretação do LLM no conteúdo da cláusula 23 — vai literal. Único processamento: trim de espaços e remoção de quebras de linha duplicadas.

### 3.5 Saída em Google Doc + PDF backup

Mudança central: render gera HTML, e o upload Drive cria DOIS arquivos:

1. **Google Doc** (eSignature-ready): upload com `mimeType: 'text/html'` e parâmetro de criação SEM `disableConversionToGoogleType`. O Drive auto-converte HTML em Google Doc preservando h1/h2/p/strong/ul. Esse é o link que volta no zap.
2. **PDF imutável** (backup/histórico): mantém `renderHtmlToPdf()` (Puppeteer) + upload como `application/pdf`. Custo: ~1.5s extra. Justificativa: depois da assinatura o Doc é editável; o PDF é a versão congelada do que foi enviado.

Estrutura Drive (mantém convenção atual de `closing-drive.ts`):

```
Meu Drive (do Junior)
└─ EcoSunPower/
   └─ Contratos/
      └─ <ano>/
         └─ <Nome do Titular> - <CPF 6 dígitos>/
            ├─ procuracao-v1.gdoc       ← link que volta no zap
            ├─ procuracao-v1.pdf        ← imutável
            ├─ contrato-v1.gdoc
            ├─ contrato-v1.pdf
            └─ dados-input-v1.json      ← snapshot dos dados (já existe)
```

`vN` incrementa em [Refazer] — sem sobrescrita.

### 3.6 Template de procuração — reescrito

Substituir `templates/procuracao.html.ts` atual (180 dias, ANEEL, "INSTRUMENTO PARTICULAR DE PROCURAÇÃO") pelo modelo validado com a Fernanda em 27/05:

- Título: **PROCURAÇÃO PARTICULAR**
- Validade: **12 meses** (não 180 dias)
- Outorgado: **Antonio Candido Rodrigues Junior** (PF) atuando em nome da PJ — não a PJ representada por ele
- 6 alíneas de poderes (a-f): protocolar, assinar formulários/ART/TRT, vistoria/medidor, 2ª via faturas, receber notificações, atos necessários
- Sem cláusula ANEEL formal (escopo concessionária basta na prática)
- Rodapé com `junior@ecosunpower.eng.br` (NUNCA `contato@` — ver memória `reference_email_oficial`)
- Layout: 1 página A4 simples (Times New Roman 11.5pt, header com marca, footer discreto)

HTML completo já existe como referência em `Documents/EcoSunPower/Clientes/_PROSPECCAO/Fernanda-Silva-Almeida/procuracao-fernanda.html`.

### 3.7 Template de contrato — mantido + ajuste de coleta

`templates/contrato.html.ts` (370 linhas, 18 cláusulas) **não muda**. O que muda é o fluxo de coleta destacar a pergunta da cláusula 23 (seção 3.4).

### 3.8 Vínculo automático lead ↔ proposta ↔ fechamento

Bônus que resolve o bug pendente da Fase 1 do `/fechar` (Fernanda invisível em `/fechar Fernanda` porque proposta não tem lead):

Quando o usuário rodar `procuracao <nome>` ou `contrato <nome>`:
1. Se cliente já tem lead → usa esse lead, linka em `fechamentos.lead_id`
2. Se cliente tem proposta mas NÃO tem lead → cria lead automático com `status='qualificado'` e o nome/telefone da proposta, linka em `fechamentos.lead_id` E em `propostas_publicas.lead_id` (precisa migration 041 — coluna ainda não existe)
3. Se cliente é totalmente novo (sem lead, sem proposta) → cria lead novo, segue

Isso requer:
- **Migration 041**: adicionar coluna `lead_id uuid REFERENCES leads(id)` em `propostas_publicas` (já planejado no spec anterior)
- **Helper `getOrCreateLeadByPhone`** em `closing-persist.ts` ou `supabase.ts`
- **Backfill SQL** rodado pelo Junior antes do deploy: vincula propostas existentes ao lead pelo telefone

### 3.9 Idempotência e estado

- Estado Redis em `closing:{phone}` (já existe), TTL 30 min
- Novo campo no estado: `docs_pedidos` setado desde o início (define o que validator filtra)
- Dedupe: se mesma combinação `(lead_id, docs_pedidos, dados_snapshot_hash)` foi gerada em < 5min → retorna o mesmo `fechamento_id`, não duplica no Drive
- Reset automático quando comando re-disparado com estado leftover (igual commit `70ccbe3`)

## 4. Fluxos UX (WhatsApp)

### 4.1 Fluxo "procuração rápida" — cliente já tem proposta

```
Junior  → procuracao Fernanda
Eva     → Achei: Fernanda Silva Almeida Araújo de Melo
          Faltam só: RG (com órgão) e UC.
          Manda assim: "1830813 SSP-DF, UC 3098127"
Junior  → 1830813 SSP-DF, UC 3098127
Eva     → [Preview do texto da procuração — 6 linhas]
          Gero?  [Gerar]  [Ajustar]  [Cancelar]
Junior  → [Gerar]
Eva     → 📄 Procuração da Fernanda pronta no Drive:
          🔗 https://docs.google.com/document/d/.../edit
          Abre → Ferramentas → Assinatura eletrônica → manda pra ela.
          [Abrir no Drive]  [Refazer]  [Já enviei pra ela]
```

### 4.2 Fluxo "contrato" — cliente novo, sem proposta

```
Junior  → contrato Roberto Silva
Eva     → Não achei "Roberto Silva" cadastrado. Vamos cadastrar?
          [Cadastrar novo]  [Buscar de novo]  [Cancelar]
Junior  → [Cadastrar novo]
Eva     → Beleza. Preciso de: nome completo, CPF, RG, endereço, email, telefone, sistema (kWp), valor, forma de pagamento.
          Pode mandar tudo numa msg só, ou aos poucos.
Junior  → [manda tudo]
Eva     → [parse + valida + faz preview do que entendeu]
          Conferiu? Quer adicionar alguma condição específica?
          [Sim, vou ditar]  [Não, padrão]
Junior  → [Sim, vou ditar]
Eva     → Manda a cláusula extra:
Junior  → 30% na assinatura e 70% na conexão pela concessionária.
Eva     → [Preview com cláusula 23 incluída]
          Gero?  [Gerar]  [Ajustar]  [Cancelar]
Junior  → [Gerar]
Eva     → 📄 Contrato pronto:
          🔗 [link Google Doc]
          [Abrir no Drive]  [Refazer]  [Já enviei pra ele]
```

### 4.3 Fluxo "fechar" — escolha via botão

```
Junior  → fechar Fernanda
Eva     → O que você quer gerar pra Fernanda?
          [Procuração]  [Contrato]  [Ambos]
Junior  → [Ambos]
Eva     → [igual fluxo 4.1 e 4.2 combinados — coleta união, gera dois docs]
```

### 4.4 Edge cases UX

| Situação | Comportamento |
|---|---|
| `procuracao` (sem nome) | Lista últimos 5 leads ativos com botão pra escolher |
| `procuracao Fer` (termo ambíguo, 2+ matches) | Lista todos com botões |
| Cliente com proposta mas sem lead (caso Fernanda atual) | Cria lead automático silenciosamente, segue fluxo |
| Estado leftover de comando anterior | Reset automático |
| LLM não parseia resposta | "Não entendi 100%, manda de novo: [faltantes]" |
| Token Drive expirado | Mensagem + alerta admin pro Junior |
| Drive 403/quota | "Drive tá lento, [Tentar agora]" |
| Render Puppeteer crash | 1 retry automático; se falhar, botão [Tentar novamente] |

## 5. Persistência

### 5.1 Tabela `fechamentos` (migration 040, já existe)

Reuso direto, sem nova migration. Campos relevantes:
- `id`, `lead_id`, `proposta_publica_id`
- `docs_pedidos` (array de `'procuracao' | 'contrato'`)
- `dados_snapshot` (JSON com `DadosFechamento` completo)
- `procuracao_drive_id`, `procuracao_drive_link` → preenchidos quando docs_pedidos inclui procuracao
- `contrato_drive_id`, `contrato_drive_link` → idem pra contrato
- `drive_folder_id` (pasta do cliente)
- `status`: `gerado` → `aprovado_junior` (botão [Aprovar]) → `enviado_cliente` (botão [Já enviei pra ela]) → `cancelado`
- `parent_id` (nullable, novo) — aponta pra fechamento anterior em caso de [Refazer]
- `created_at`, `created_by`, `updated_at`

**Campo novo a adicionar:** `parent_id uuid REFERENCES fechamentos(id) ON DELETE SET NULL`. Migration leve, parte do plano.

### 5.2 Migration 041 — `propostas_publicas.lead_id`

```sql
-- Já documentada no spec /fechar (não foi aplicada ainda)
ALTER TABLE propostas_publicas
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_propostas_publicas_lead
  ON propostas_publicas(lead_id, created_at DESC);
```

### 5.3 Backfill (Junior aplica manual antes de Implantar)

```sql
UPDATE propostas_publicas pp
SET lead_id = l.id
FROM leads l
WHERE pp.lead_id IS NULL
  AND l.phone = pp.cliente_telefone
  AND pp.cliente_telefone IS NOT NULL;
```

Propostas sem telefone (caso Fernanda) ficam órfãs até primeira execução de `procuracao` ou `contrato` pra aquele cliente — quando o get-or-create lead populará o vínculo.

### 5.4 Ordem de deploy (não invertível)

1. Junior aplica **migration 041** (`propostas_publicas.lead_id`) no SQL Editor do Supabase (projeto `kupnsoyymulbdzakqlqc`)
2. Junior aplica **migration 042** (`fechamentos.parent_id`) idem
3. Junior roda **backfill SQL** (cf. 5.3) idem
4. Confirma os 3 rodaram OK (verificação simples: `SELECT count(*) FROM propostas_publicas WHERE lead_id IS NOT NULL`)
5. Só então `git push origin main` da feature
6. Só então clica Implantar no Easypanel
7. Smoke manual em prod (cf. 8.4)

Se inverter (push antes de migration): `savePropostaPublica` quebra com erro de coluna inexistente. Risco real.

## 6. Componentes e Interfaces

### 6.1 Arquivos novos

- `src/modules/closing/closing-html-uploader.ts` — **função pura**: `uploadHtmlAsGoogleDoc(html, name, parentId, drive) → {id, link}`. Encapsula a chamada Drive com `mimeType: 'text/html'` que dispara auto-conversão pra Google Doc. Sem lógica de negócio, sem leitura de banco — só upload.

### 6.2 Arquivos modificados

- `src/modules/closing/templates/procuracao.html.ts` — reescrito (modelo Fernanda)
- `src/modules/closing/closing-validator.ts` — `findMissingRequired` passa a filtrar campos por `docs_pedidos`
- `src/modules/closing/closing-drive.ts` — **orquestra** os dois uploads (Doc via `closing-html-uploader.ts` + PDF via método existente). `uploadFechamento` aceita `contratoHtml`/`procuracaoHtml` além dos PDFs e sobe os dois pra mesma pasta do cliente.
- `src/modules/closing/closing-assistant.ts` — orquestração ganha pergunta explícita de `disposicoes_especiais` no modo contrato/ambos
- `src/modules/closing/closing-persist.ts` — adiciona helper `getOrCreateLeadByPhone` + parâmetro `parent_id` em create
- `src/modules/closing/types.ts` — campo `parent_id?: string` em `FechamentoRow`
- `src/index.ts` — adiciona triggers `procuracao` e `contrato` (aliases que setam docs_pedidos e despacham pro mesmo handler do `fechar`)
- `src/modules/supabase.ts` — `savePropostaPublica` ganha chamada a `getOrCreateLeadByPhone` (resolve bug Fase 1)

### 6.3 Migrations

- `041_propostas_publicas_lead_id.sql` (já planejada)
- `042_fechamentos_parent_id.sql` (nova, leve)

## 7. Erros e observabilidade

Todos os erros loggam no formato estruturado existente (`[closing]` prefix). Métricas pro dashboard:

| Evento | Métrica |
|---|---|
| Comando recebido | `closing.command.received{type=procuracao|contrato|fechar}` |
| Doc gerado com sucesso | `closing.doc.generated{type, duration_ms}` |
| Drive upload falhou | `closing.drive.error{code, retried}` |
| LLM parse falhou | `closing.llm.parse_error{stage}` |
| Lead criado automático | `closing.lead.auto_created` (pra medir quantas propostas tavam órfãs) |
| [Refazer] disparado | `closing.refazer{version}` |
| [Já enviei] disparado | `closing.enviado_cliente` |

## 8. Testes

### 8.1 Unit (Vitest, sem mocks de DB/Drive)

| Arquivo | O que valida |
|---|---|
| `closing-validator.test.ts` (expande) | `findMissingRequired({docs_pedidos:['procuracao']})` ignora sistema/comercial/email. `['contrato']` inclui-os. `['procuracao','contrato']` = união. |
| `procuracao-template.test.ts` (reescreve) | Snapshot HTML novo (12 meses, sem ANEEL). Campos dinâmicos no lugar certo. Rodapé `junior@ecosunpower.eng.br`. |
| `contrato-template.test.ts` (mantém + amplia) | Cláusula 23 aparece SÓ se `disposicoes_especiais` preenchido. Texto literal sem reinterpretação. |
| `command-aliases.test.ts` (novo) | Variações de input (`procuracao`, `/procuração`, `PROCURAÇÃO`, `procuração da fernanda`) roteiam pro handler certo com `docs_pedidos` correto. |
| `drive-html-upload.test.ts` (novo, com nock) | Upload com `mimeType=text/html` chama Drive sem `disableConversionToGoogleType`. Resposta retorna ID + webViewLink Doc. |

### 8.2 Integration (Supabase test/staging)

- `closing-flow-procuracao.integration.test.ts`: handler ponta-a-ponta → checa `fechamentos` row + lead linkado + URLs preenchidas
- `closing-flow-contrato.integration.test.ts`: idem, com cláusula 23 customizada literal
- `closing-flow-ambos.integration.test.ts`: gera os 2 docs, mesma row

### 8.3 Smoke e2e

Expandir `closing-e2e.smoke.ts` com 3 cenários novos (só procuração, só contrato, ambos). Roda contra staging.

### 8.4 Manual (Junior, em prod após Implantar)

1. `procuracao Fernanda` → gera + vincula lead Fernanda (resolve bug pendente Fase 1 de quebra)
2. `contrato <cliente com proposta>` → testa coleta de pagamento + cláusula extra literal
3. `fechar <cliente>` → confere botões `[Procuração] [Contrato] [Ambos]`
4. Drive: pasta criada/reusada, Doc + PDF + JSON presentes, link Doc abre eSignature
5. Dashboard: nova row em `fechamentos`, status `gerado`

### 8.5 Cobertura mínima

Validator 100% · templates 90% · comandos 100% · drive 80%.

## 9. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Auto-conversão HTML→Doc do Drive perde formatação (negrito, listas) | Fallback: se conversão der ruim, usa Google Docs API estruturada. Validar empiricamente no smoke. |
| Token OAuth Drive expira no meio da operação | Refresh automático já existe no `proposal/drive-uploader.ts`; reuso. |
| Migration 041 + backfill aplicados em ordem errada | Plano explicita: 1) Junior aplica migration 041 + backfill manual no SQL Editor; 2) só depois `git push` da feature; 3) só depois Implantar. |
| LLM inventa cláusula 23 em vez de copiar literal | Prompt do assistant explicita "copie LITERAL sem reformular"; teste valida com input controlado. |
| Pasta Drive manual existente (Fernanda em `Clientes_Maio_2026/`) conflita com convenção do código (`EcoSunPower/Contratos/<ano>/`) | Feature sempre usa a convenção do código. Pasta manual antiga fica intacta, sem migração automática. Se Junior quiser migrar depois, é tarefa separada. |
| Dedupe (mesma combinação em <5min) falha e gera 2 vezes | Idempotência via hash de `(lead_id, docs_pedidos, dados_snapshot)`. Se hash bate, retorna `fechamento_id` existente. |

## 10. Out of scope

- Disparo automático de eSignature via API Workspace (Junior arrocha manual)
- Envio do doc assinado pro cliente via Eva (Workspace manda email)
- Cron de cobrança pós-assinatura
- Modificação da estrutura de pastas Drive antigas criadas manualmente
- Dashboard novo pra pipeline de fechamento (existe um parcial, fora deste escopo)
- Edição do contrato/procuração em-place no zap (sempre [Refazer] = nova versão)

## 11. Referências

- Spec /fechar MVP: `docs/superpowers/specs/2026-05-26-eva-fechar-mvp-design.md`
- Memória estado prod 26/05: `memory/project_eva_fechar_status_26_05.md`
- Memória email oficial: `memory/reference_email_oficial.md`
- Memória dados Junior: `memory/reference_dados_responsavel_tecnico.md`
- Memória botões no zap: `memory/feedback_botoes_zap.md`
- Memória título responsável técnico: `memory/feedback_titulo_responsavel_tecnico.md`
- Modelo procuração validado 27/05: `Documents/EcoSunPower/Clientes/_PROSPECCAO/Fernanda-Silva-Almeida/procuracao-fernanda.html`
- HEAD prod no momento do design: `70ccbe3`
