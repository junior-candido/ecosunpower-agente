# Isolamento multi-tenant — levantamento

Levantado em **18/09/2026**, depois de descobrir que **6 leads da Conquista Solar receberam 16 e-mails
com a marca EcoSunPower** desde 11/09 — sem que ninguém tivesse configurado e-mail para a Conquista.

Motivo do levantamento (Junior): *"já tem tanto tempo que falo para organizar isso… senão fica ruim e
fico impedido de escalar. É urgente, porque já vai entrar mais gente."*

---

## 1. O quadro medido

| | |
|---|---|
| Tabelas com `company_id` | **106** |
| Delas, com RLS **ligada** | **106** — nenhuma de fora |
| Políticas RLS existentes | **99** |
| Políticas que checam `company_id` | **95** |
| Políticas que valem para `service_role` | **2** |
| Consultas no código a essas tabelas | **929** |
| Consultas **com** filtro de empresa | **195** (21%) |
| Consultas **sem** filtro de empresa | **734** (79%) |

> A varredura das consultas é por aproximação: procura menção a `company_id`/`companyId` numa janela de
> 12 linhas em volta de cada `.from('tabela')`. Parte dos 734 está protegida indiretamente (amarrada a um
> `lead_id` que já pertence a uma empresa). A ordem de grandeza é o que importa para decidir a estratégia.

## 2. A causa única

A proteção **já está construída e correta no banco**. O servidor é que passa por fora dela:

```js
// src/modules/supabase.ts:81
this.client = createClient(config.supabaseUrl, config.supabaseServiceKey);
```

`service_role` **ignora RLS por definição**. As 95 políticas que checam empresa nunca são avaliadas para o
código da aplicação. Sobra a disciplina de lembrar o filtro em cada uma das 929 consultas.

**Consequência prática:** esquecer o filtro hoje devolve **tudo**. Deveria devolver **nada**.

Não são 734 bugs independentes — é **uma decisão de arquitetura** que desliga uma proteção pronta.

## 3. Onde mais dói (consultas sem filtro)

| Tabela | com filtro | **sem filtro** |
|---|---|---|
| leads | 55 | **147** |
| propostas_publicas | 1 | **39** |
| sistemas_clientes | 17 | **32** |
| monitoring_abordagens | 0 | **32** |
| financeiro_lancamentos | 1 | **29** |
| eva_cadence | 5 | **26** |
| app_flags | 3 | **26** |
| marketing_campaigns | 0 | **16** |
| monitoring_alerts | 2 | **15** |
| lead_tarefas | 3 | **14** |
| rh_candidatos | 0 | **14** |
| conversations | 3 | **13** |
| pastas_cliente | 0 | **12** |
| blog_drafts | 0 | **12** |
| **email_sequencia** | **0** | **8** ← o vazamento de 18/09 |

## 4. As 35 rotinas automáticas — o que é global e o que não é

Rodam sem pedido de usuário, portanto sem contexto de empresa. É aqui que o vazamento acontece.

### A. PRECISAM rodar por empresa (hoje rodam global → vazam)

| Rotina | Intervalo | Toca |
|---|---|---|
| `runEmailSeq` | 15 min | `email_sequencia`, `leads` — **causou o vazamento de 18/09** |
| `cadence.processCadence` | 2 min | `eva_cadence`, `leads` |
| `autoCadenceScheduler` | 1 h | `eva_cadence` |
| `runInscricaoAutomatica` | 1 h | inscreve lead na jornada de e-mail |
| `hotLeadSweep` | 1 h | `leads` |
| `followup.processFollowups` | 5 min | `followups`, `leads` |
| `runProactiveDetect` / `runProactiveDispatch` | 1 h / 15 min | `leads` |
| `runReengagementCheck` | 10 min | `reengagement_touches` |
| `runPostInstallCheck` | 12 min | `post_install_touches` |
| `runPosInstalacaoNotif` | 1 h | relatórios pós-instalação |
| `checkMaintenanceDaily` | 1 h | `maintenance_reminders` |
| `monitoringSyncHourly` | 15 min | `sistemas_clientes`, `geracao_diaria` |
| `checkMonitoringDiscovery` | 1 h | `sistemas_clientes` |
| `notifyNewReviews` | 5 min | `public_reviews` |
| `evaDigestScheduler` | 5 min | resumo do dia por empresa |
| `checkAnniversaryHour` | 1 h | `leads` |
| `runSlaCron` | 15 min | atendimento |

### B. Legitimamente globais (infra / ingestão externa)

| Rotina | Intervalo | Por quê |
|---|---|---|
| `runCanalSolarIngestion` | 2 min | ingestão de notícias — não tem dono |
| `checkNewsScraperSchedule` | 20 min | idem |
| `checkBlogSchedule` | 30 min | conteúdo (hoje só EcoSun) |
| `coletarTelemetria` / `resumirTelemetria` | 15 min / 24 h | telemetria da própria plataforma |
| `runInsightsCollector` | 30 min | aprendizado do sistema |
| `autoMapearEcosunWaba` | boot | mapeamento único de WABA |
| `limparRh` | 24 h | limpeza |

### C. Só EcoSunPower (módulos ainda não vendidos a tenant)

`runFinanceiroAlertas` (6 h) · `rodarMotorAssinaturas` (1 h) · `triarRh` (5 min) ·
`checkAnalystSchedule` (10 min) · `checkMarketingSchedule` (10 min) ·
`checkCampaignDigestHour` (1 h) · `checkWeeklyReportSchedule` (10 min) · `checkTelemetriaHour` (1 h)

> Esses precisam ser **declarados** como exclusivos da EcoSun, não presumidos. Hoje, se a Conquista
> ganhasse um lançamento financeiro, ele entraria no mesmo motor.

## 5. Webhooks (entram sem sessão, precisam descobrir o tenant)

`POST /webhook` (Evolution — já resolve por `req.body.instance`) · `POST /webhook-waba` ·
`POST /webhook-ig` · `POST /webhooks/resend` · `POST /webhooks/shelly` ·
`GET|POST /webhook/meta/leadgen` · `POST /webhook/infinitepay`

## 5.1 Notificacoes: TODAS vao pro telefone do Junior

Achado em **19/09/2026**, a partir de um aviso "Eva marcou contato fora de escopo" que chegou ao
Junior sobre um numero de DDD 77 (Vitoria da Conquista/BA).

```js
// src/index.ts — 83 ocorrencias
await sendText(config.engineerPhone, alertBody);
```

`config.engineerPhone` e **uma constante global**. O proprio `src/config.ts` documenta a decisao:

> `// Notificacoes outbound continuam indo SO pro engineerPhone (primario).`

Consequencia: **qualquer evento de qualquer empresa avisa o Junior**, e o dono do tenant nao e avisado
de nada. Nao e bug isolado — sao 83 pontos com o mesmo endereco fixo.

No mesmo caminho, 6 pontos atualizam `leads` **por telefone, sem filtro de empresa**:

```js
.in('phone', variantesTelefone(from))   // src/index.ts:2750, 6064, 6092, 6187, 6347, 6355
```

Um `opt_out` ou `mark_off_topic` acertando um telefone que exista em dois tenants escreve nos dois.
O codigo ja desconfiava: `console.warn('... atualizou 0 linhas — lead fora do tenant?')`.

**Conclusao:** o vazamento nao e do modulo de e-mail. E do mesmo padrao arquitetural, aparecendo em
canal diferente. Reforca o passo 1 do caminho abaixo.

## 6. Caminho recomendado

1. **Inverter o default.** Conexão da aplicação carrega a empresa do pedido; as 95 políticas passam a
   valer. Consulta sem contexto volta vazia em vez de vazar.
2. **Rotinas do grupo A passam a iterar empresa a empresa**, abrindo contexto para cada uma.
3. **Grupos B e C ficam com `service_role`, declarados e isolados num único lugar visível** — o uso da
   chave mestra deixa de ser o padrão e vira exceção nomeada.
4. **Tabela de módulos contratados por empresa**, consultada antes de qualquer automação disparar.
   A Conquista contratou só a Eva; isso hoje não está escrito em lugar nenhum.
5. **Teste que quebra o build** ao encontrar consulta sem filtro em tabela com `company_id`, fora da
   lista declarada de globais.

O passo 1 é o que resolve a classe inteira. Os 734 pontos deixam de importar.

## 7. Sintomas já observados deste mesmo problema

- **18/09** — 6 leads da Conquista receberam 16 e-mails da marca EcoSunPower (`email_sequencia` sem filtro).
- **17/09** — Jimena relatou que a Clara voltou a atender números cadastrados (`contatos_internos`).
- **31/08** — LGPD vazou 3× (PRs #289/#290, migration 124).
- **01/09** — isolamento de marca (PRs #264/#265).

Todos o mesmo padrão: consulta sem contexto de empresa, corrigida pontualmente.
