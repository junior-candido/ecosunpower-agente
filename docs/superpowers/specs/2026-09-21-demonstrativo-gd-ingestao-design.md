# Demonstrativo de GD da Neoenergia — ingestão automática (design)

**Data:** 21/09/2026 · **Aprovado por:** Junior (opção (a) leitor de texto + regras; migration 130)

## Objetivo

A Neoenergia envia todo mês, por e-mail, o **"Mini e Microgeração — Demonstrativo do Faturamento"**
(remetente `r2d2.frms@neoenergia.com`, anexo `RelatorioResumo.pdf`, sem senha). Hoje ele chega na caixa
`ecosunpower2032@gmail.com` para 20+ clientes e ninguém lê. Queremos que ele entre sozinho na
plataforma, seja lido, guardado por UC e mês, cruzado com a geração do monitoramento e com o rateio
cadastrado, e que os problemas virem alerta — **só para o Junior** enquanto durar o teste.

Fora do escopo desta entrega: ler a **conta de luz** (tarifa, bandeira), enviar relatório ao cliente
final, outras concessionárias (Coelba entra depois, com amostras).

## Fluxo

```
Gmail (filtro r2d2.frms@neoenergia.com → encaminhar) → faturas@<dominio>.resend.app
  → POST /webhooks/resend (email.received)
     ├─ ehDemonstrativoGd(payload)?  → ingerir → guardar → cruzar → avisar Junior
     ├─ ehConfirmacaoGmail(payload)? → avisar Junior com o código de confirmação
     └─ senão                        → processarRespostaEmail (fluxo atual, sem mudança)
```

O desvio acontece **antes** de `processarRespostaEmail`; hoje qualquer `email.received` vira "resposta de
lead" e o demonstrativo geraria um aviso falso a cada mês.

**Como reconhecer:** o encaminhamento automático do Gmail preserva o `From` e o assunto originais.
Demonstrativo = assunto contém `Demonstrativo do Faturamento` **e** (remetente `@neoenergia.com` **ou**
destinatário `faturas@`). Confirmação do Gmail = remetente `forwarding-noreply@google.com`.

## Peças

| Arquivo | Responsabilidade | Depende de |
|---|---|---|
| `src/modules/gd/demonstrativo-parser.ts` | **Pura.** Texto do PDF → `DemonstrativoGd` + lista de inconsistências | nada |
| `src/modules/gd/demonstrativo-email.ts` | **Pura.** Reconhece demonstrativo/confirmação no payload; extrai código do cliente e instalação do assunto | nada |
| `src/modules/gd/demonstrativo-cruzamento.ts` | **Pura.** Demonstrativo + geração mensal + rateio cadastrado → alertas | nada |
| `src/modules/gd/demonstrativo-ingestao.ts` | Orquestra: baixa anexo (Resend), extrai texto (`unpdf`), chama parser, grava, cruza, avisa. **Nunca lança.** | deps injetadas |
| `supabase/migrations/130_demonstrativos_gd.sql` | Tabela `demonstrativos_gd` | — |
| `src/index.ts` (webhook) | Desvio antes do fluxo de resposta | ingestão |

### Dados extraídos (`DemonstrativoGd`)

- `cliente_nome`, `codigo_cliente`, `instalacao`, `referencia` (1º dia do mês, ex. `2026-06-01`)
- Injetado: `medidor`, `leitura_de/ate`, `injetado_kwh`, `saldo_mes_anterior_kwh`, `injetado_acumulado_kwh`
- Consumo: `consumo_kwh`, `credito_utilizado_kwh`, `credito_restante_kwh`, `credito_expira` (mês)
- 13 meses: `[{mes, codigo_cliente, consumida, injetada, faturada, compensado, credito}]`
- Totais: `total_injetado`, `total_compensado`, `saldo_acumulado`, `proximo_expirar_kwh`,
  `ciclo_expirar` (mês), `creditos_expirados`
- Unidades (rateio): `[{codigo_cliente, percentual, saldo}]`

Números pt-BR (`10.601,03`) → `number`. Mês `mai/2026` e `06/2026` → `YYYY-MM-01`.

**Conferências (viram `inconsistencias[]`, não erro):** `saldo_acumulado ≈ total_injetado − total_compensado − creditos_expirados`
(±0,1 kWh) · soma dos `%` das unidades = 100 · soma dos saldos das unidades ≈ `saldo_acumulado`.
Campo obrigatório ausente (código, instalação, referência) → `ok:false` (não grava, avisa "não consegui ler").

### Tabela `demonstrativos_gd` (migration 130)

`id`, `company_id` (not null, default EcoSun, FORCE RLS + policy `company_isolation` no padrão da 123),
`lead_id` (nullable → leads), `codigo_cliente`, `instalacao`, `referencia date`, colunas numéricas acima,
`historico jsonb`, `unidades jsonb`, `inconsistencias jsonb`, `email_id text`, `recebido_em`,
`texto_bruto text`. **UNIQUE (company_id, instalacao, referencia)** — reenvio do mesmo mês atualiza (upsert).

### Ligação com o cliente

`leads.uc_numero` pode ter sido cadastrado com o **código do cliente** ou com a **instalação** — o ingestor
tenta os dois. Sem par → grava com `lead_id` nulo e alerta "UC não encontrada". `company_id` vem do lead
achado; sem lead, EcoSun (única empresa com encaminhamento neste teste).

### Cruzamento e alertas

| Alerta | Regra |
|---|---|
| Rateio divergente | unidade com `%` diferente do `percentual_rateio` do lead beneficiário (±0,5 p.p.) |
| Créditos a vencer | `proximo_expirar_kwh > 0` e `ciclo_expirar` ≤ 6 meses à frente |
| Geração não fecha | geração do mês (monitoramento) < injetado do mês — medidor/monitoramento inconsistente |
| Autoconsumo | informativo: geração − injetado (só quando há monitoramento) |
| UC não encontrada | sem lead correspondente |
| Não consegui ler | parser `ok:false` |

Geração mensal: soma de `geracao_diaria` do sistema do lead no mês de referência (`serieAnoMensal`).
**Modo teste** (`DEMONSTRATIVO_MODO_TESTE`, padrão `on`): alertas só no WhatsApp do Junior
(`sendAdminWithButtons`), um resumo por demonstrativo. Nada vai ao cliente.

## Erros

O webhook **sempre** responde 200 (Resend retenta em loop). Qualquer falha de download/parse/gravação
vira log + aviso "não consegui processar o demonstrativo de X" ao Junior. Deduplicação pelo `email_id`
e pelo UNIQUE de UC+mês.

## Segurança

Assinatura svix do webhook (TODO antigo): verificar quando `RESEND_WEBHOOK_SECRET` estiver definida;
sem a variável, segue aceitando (comportamento atual) e registra aviso no boot. Requer guardar o corpo
bruto no `express.json({ verify })`.

## Testes

- Parser com o **PDF real** (fixture de texto extraído pelo `unpdf`) + fixtures reais de rateio quando
  chegarem; casos de número pt-BR, mês, linha faltando, soma que não fecha.
- Reconhecimento de e-mail: demonstrativo, confirmação do Gmail, resposta comum (não desvia).
- Cruzamento: cada alerta isolado.
- Ingestão com deps falsas: sucesso, anexo ausente, PDF ilegível, duplicado, UC sem lead — nunca lança.
- Guarda de migrations (`migrations-tenant-guard.test.ts`) passa com a 130.
