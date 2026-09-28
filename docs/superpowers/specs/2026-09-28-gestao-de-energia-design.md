# Gestão de Energia — design (28/09/2026)

> Pedido do Junior: somar à plataforma de monitoramento solar a **medição de consumo** com
> os medidores Shelly, para vender o pacote "Medição Inteligente EcoSun" (kits 2.290 / 2.990 /
> 3.990 + mensalidade R$ 39). Regra da casa: **REUSAR, não recriar** — ver
> `docs/VISAO-GERAL-DO-SISTEMA.md`.
>
> **Plano de execução (fase G1):** `docs/superpowers/plans/2026-09-28-gestao-de-energia.md`.
> **Status:** proposta para o Junior decidir (seção 11). Nada foi implementado, nenhuma migration aplicada.

---

## Parte 1 — Visão geral em português simples (para o dono)

### O que é

Hoje a plataforma sabe **quanto a usina gerou** (pelo inversor). Ela **não sabe** quanto a casa
gastou nem quanto foi para a rede. O medidor Shelly instalado no quadro mede justamente isso:
**o que entra da rede e o que sai para a rede, minuto a minuto**. Juntando os dois:

```
   GERADO (inversor)  +  COMPRADO da rede  −  DEVOLVIDO à rede  =  CONSUMO REAL da casa
```

E daí saem as respostas que o cliente paga para ter:

| Pergunta do cliente | De onde sai |
|---|---|
| "Quanto a minha casa gasta de verdade?" | a conta acima |
| "Quanto do meu sol eu uso na hora?" (autoconsumo) | (gerado − devolvido) ÷ gerado |
| "O que fica ligado a noite toda?" | a carga de base da madrugada |
| "Quanto eu gasto no horário caro (18h–21h)?" | o consumo separado por horário |
| "A tensão da rua está fora do normal?" | a tensão medida contra as faixas da ANEEL (PRODIST) |
| "Bateria vale a pena para mim?" | depende da regra de GD do cliente (GD I ou GD II) — ver G2 |
| "A conta da Neoenergia bate com o que eu medi?" | conferência com o demonstrativo de GD que já lemos |

### As 5 etapas (cada uma sai sozinha, em PR próprio)

| Etapa | O que entrega | Em uma frase |
|---|---|---|
| **G1 — Leitura** | cadastro do medidor, dados chegando e guardados em resumo, tela "Energia da casa", conferência com o demonstrativo | "Vejo gerado × comprado × devolvido × consumido de cada cliente." |
| **G2 — Diagnóstico + PDF "Análise de Carga"** | achados automáticos em português e um PDF assinado como Responsável Técnico | "O sistema escreve o estudo de carga sozinho." |
| **G3 — Alertas no WhatsApp** | consumo fora do normal, ar ligado a noite toda, tensão alta que derruba inversor, medidor sem sinal | "O cliente é avisado antes de a conta chegar." |
| **G4 — Controle** | horários e desligamento de cargas pelos relés 1PM/2PM | "Liga e desliga sozinho, com trava para não estragar compressor." |
| **G5 — Simuladores** | tarifa branca × convencional, bateria, ampliação da usina, autoconsumo remoto | "Mostra com os números do próprio cliente se vale mudar." |

### O que o Junior precisa saber antes de aprovar

1. **O medidor já manda dado hoje** (desde 07/09, tabela `medicoes_shelly`, rota
   `/webhooks/shelly`, aba `/dashboard/medicao`). A G1 **não recomeça do zero**: ela arruma o
   que falta para virar produto — várias empresas (cada medidor sabe de qual empresa é), resumo
   para não lotar o banco, e a conta "gerado × consumido".
2. **Duas formas de o dado chegar**, e a recomendação é usar as duas:
   - **"Empurrado" (o script dentro do Shelly)** — minuto a minuto, com tensão; não depende da
     nuvem da Shelly. É o modo completo, o que vira laudo.
   - **"Puxado" (API da nuvem Shelly)** — basta a chave da conta; sem script. Chega de 15 em 15
     minutos e sem o detalhe da tensão. Serve para cadastrar rápido, para o cliente que não
     quer script e como reserva quando o script parar.
3. **Senha/chave do Shelly só pelo formulário da plataforma**, nunca pelo WhatsApp ou chat.
   Ela fica guardada **cifrada** (a chave da nuvem Shelly dá controle total da conta).
4. **Consumo é dado pessoal** (mostra a rotina da família: quando sai, quando chega). Cada
   empresa só vê os medidores dela, o dado fino é apagado depois de 90 dias e o cliente pode
   pedir para apagar tudo.
5. **Honestidade:** o Shelly não é um analisador "classe A". Ele não mede harmônicas nem flicker
   e o relatório **não é laudo formal de qualidade de energia** — é um estudo de carga
   indicativo. Isso vai escrito no PDF.

### O que a casa do Junior (piloto) já mostrou (07–27/09/2026)

| Achado | Número | O que significa |
|---|---|---|
| Compra da rede | ≈ 21 kWh/dia (~630/mês) | |
| Devolve à rede | ≈ 14,5 kWh/dia (~435/mês) | a casa tem solar (Solis-1P5K-4G, 6,6 kWp, já na plataforma) |
| Carga ligada a noite toda | 0,8–1,2 kW contínuos | provavelmente os ares — ≈ 12 kWh/dia ≈ 360 kWh/mês ≈ R$ 370/mês |
| Consumo da rede fora do horário de ponta | 76% | tarifa branca **pode** ser interessante — G5 confirma |
| Tensão acima de 231 V | 18% do tempo, quase tudo entre 8h e 13h | a rede sobe quando a usina injeta: risco de o inversor desarmar; indício para reclamar na Neoenergia |
| Regra de GD | GD I | **bateria não se paga pela economia** (GD I compensa 1:1 até 2045) — só como backup |

Esses são exatamente os achados que a G2 deve escrever sozinha. O piloto vira o **caso de teste**.

---

## Parte 2 — Técnico

### 1. O que já existe e será reusado (inventário conferido no código em 28/09)

| Peça | Onde | Como a Gestão de Energia usa |
|---|---|---|
| Recebimento do Shelly (push) | `src/modules/medicao/shelly-medicao.ts` (`extrairLeituraShelly`, `receberLeituraShelly`, `janelasDe15Minutos`, `demandaMaxima`) + `POST /webhooks/shelly` em `src/index.ts` + `SupabaseService.salvarMedicaoShelly` | **continua sendo a porta de entrada** do modo push. Ganha: token **por medidor** (multi-tenant) e o vínculo `medidor_id`. |
| Leituras brutas 1 min | tabela `medicoes_shelly` (migration 123, RLS por empresa, `unique (device_id, canal, medido_em)`) | vira a **área de pouso** (landing). Retenção de 90 dias; depois disso só os resumos. |
| Aba Medição | `src/modules/dashboard/medicao-queries.ts`, `medicao-views.ts` (`escalaDoGrafico`), rota `/dashboard/medicao` | continua de pé; a tela nova "Energia da casa" nasce ao lado e passa a ler dos resumos. A aba antiga é aposentada só quando a nova cobrir tudo. |
| Script do aparelho | `docs/kit-medicao/shelly-pro3em-envio.js` + `docs/kit-medicao/README.md` | ganha versão 2 (token do medidor, e reenvio do buraco via `EMData.GetData` — opcional). As 3 armadilhas documentadas (HTTPS/`ssl_ca`, `em` × `em1`, linha do token) continuam valendo. |
| Registro de marcas plugável | `src/modules/monitoring/adapter-registry.ts` + `types.ts` (`MonitoringAdapter`) | **mesmo padrão**, mas registro irmão (ver decisão 2.1). Reusa `util/fetch-with-timeout.ts`, `util/retry.ts`. |
| Detector de medidor | `src/modules/monitoring/detectar-medidor.ts` | **Atenção: não tem a ver com Shelly.** Ele detecta a *troca do medidor da concessionária* (lead `instalado` → `medidor_trocado` após 3 dias de geração ≥ 1 kWh). Relevância: se o Shelly fosse cadastrado como "usina", a exportação dele poderia disparar esse detector errado — mais um motivo para o registro irmão. |
| Usinas e geração | `sistemas_clientes` + `geracao_diaria` (021; `data` = dia local BRT) | a **geração** da conta de balanço vem daqui (medidor ligado a `sistema_id`). |
| Curva do dia do inversor | `MonitoringAdapter.fetchIntraday` (usado no router ~l. 5441) | curva de consumo intradiária = geração (ao vivo, do inversor) + saldo da rede (Shelly). Best-effort. |
| Telemetria fina | `telemetria_medicoes` / `telemetria_resumo` (067), `TelemetriaService.resumirAntigos` | **modelo de retenção** copiado (fino → resumo). Não gravar consumo aqui (chave `sistema_id` obrigatória e modelo longo genérico caro para 1 min). |
| Alertas | `monitoring_alerts` (032 + `company_id` 077/079), `ProactiveAlertService`, `runDispatchCycle`, `telemetria-regras.ts` (regra `tensao_rede_alta` > 242 V) | G3 estende `monitoring_alerts` com `medidor_id` e reusa fila, dedupe, janela de horário e botões. |
| Alertas de usina | `alertas_sistema` (021) | não usado (legado do Módulo 6; o motor atual é `monitoring_alerts`). |
| Demonstrativo GD | `src/modules/gd/*`, tabela `demonstrativos_gd` (130: `instalacao`, `codigo_cliente`, `referencia`, `injetado_kwh`, `consumo_kwh`, `lead_id`) | **conciliação** mensal: Shelly exportado × `injetado_kwh`; Shelly importado × `consumo_kwh`. |
| PDF | `htmlToPdf` (`src/modules/proposal/pdf-generator.ts`) + padrão de conferência de `gd/relatorio-pdf.ts` (`gerarRelatorioPdf`, `lerPdfUnpdf`) + `gd/relatorio-marca.ts` | PDF "Análise de Carga" (G2), conferido (nº de páginas, rodapé, gráfico carregou). |
| Tarifa, Fio B | `solar-params.ts` (`tarifaPorConcessionaria`, `tusdFioBPorConcessionaria`, `percentualFioBVigente`) | "bateria vale?" (G2) e simuladores (G5). |
| UI | `src/modules/dashboard/ui/componentes.ts` (`kpiCard`, `faixaKpis`, `cartaoSecao`, `tabela`, `sparkline`, `estadoVazio`, `cabecalhoPagina`, `pilulaStatus`), `ui/html.ts` (`escapeHtml`, `fmtNumero`, `SEM_DADO`) | telas novas só com esses componentes. |
| Multi-tenant | `bancoDoOperador(req, supabase)` (`tenant-client.ts`), RLS FORCE com `app.company_id`/JWT (padrão 079), testes-teto `tenant-rota-guard.test.ts` e `migrations-tenant-guard.test.ts` | toda tabela nova nasce com `company_id` + RLS; toda rota nova usa `bancoDoOperador` e `.eq('company_id', …)` explícito. |
| Cifra | `src/modules/financeiro/fiscal/crypto-cert.ts` (`cifrar`/`decifrar`, AES-256-GCM) | cifrar a chave da nuvem Shelly (env nova `ENERGIA_CRED_KEY`). |
| Rotas testáveis fora do router | padrão `command-center-rotas.ts` | `energia-rotas.ts` montado com 1 linha no `router.ts` (evita conflito com a fase B do Command Center). |

### 2. Decisões de arquitetura

#### 2.1 Registro irmão, não "mais uma marca de inversor"

O `adapter-registry.ts` diz "crie o adapter e o resto funciona". Para **inversor** isso é
verdade. Para o Shelly, colocar `'shelly'` em `MarcaInversor` e o medidor em
`sistemas_clientes` **quebraria coisas** que assumem que toda linha ali é uma usina:

- `geracao_diaria` receberia consumo/injeção como se fosse geração → estraga PR, "real × esperada",
  classificação (`classificacao.ts`), mediana da carteira, Command Center (contagem de usinas);
- `detectar-medidor.ts` marcaria `medidor_trocado` num lead que só comprou o kit;
- `demonstrativo-cruzamento.ts` compararia "geração do mês" com a exportação do Shelly.

**Decisão:** módulo novo `src/modules/energia/` com interface `MedidorAdapter` e
`medidor-registry.ts` **no mesmo formato** do `adapter-registry.ts` (mesmo espírito "plugável":
Shelly hoje; Pro EM-50, IoTaWatt, Embrasul, ISSO Blue Box amanhã). O medidor **aponta** para a
usina (`medidores_energia.sistema_id`) quando existe; cliente só de consumo (lavanderia do Mário,
Escola Renascença) funciona sem usina.

#### 2.2 Dois modos de coleta

| | **push** (script no aparelho) | **nuvem** (Cloud Control API) |
|---|---|---|
| Como chega | `POST /webhooks/shelly` 1×/min (já existe) | nosso cron chama `POST https://<server_uri>/v2/devices/api/get?auth_key=…` a cada 15 min |
| Resolução | 1 min (tensão, corrente, P, S, FP, contadores) | foto dos contadores a cada 15 min → energia por janela = diferença dos contadores (exata); tensão = só a foto do instante |
| Depende de | internet do cliente + nosso servidor | internet do cliente + nuvem Shelly + nosso servidor |
| Buraco (sem rede) | o aparelho guarda ~60 dias a 1 min (`EMData`); script v2 pode reenviar o buraco | contadores são acumulados → o total não se perde; a forma da curva sim |
| Credencial | token do medidor (gerado pela plataforma) | `auth_key` + `server_uri` da conta Shelly (formulário, cifrado) |
| Serve para | produto completo, laudo de tensão, demanda de 15 min | cadastro rápido, cliente sem script, reserva, **e G4 (controle)** |

Decisão do Junior em 07/09 foi push ("sem depender da nuvem dos outros"). O design **mantém o
push como principal** e usa a nuvem como reserva + controle. Ver decisão D1.

#### 2.3 Fatos da API Shelly (lidos em shelly-api-docs.shelly.cloud em 28/09/2026)

- **Autenticação da nuvem:** *Authorization cloud key* + *server URI*, ambos no app Shelly em
  *User settings → Authorization cloud key*. O server URI **pode mudar** com a infraestrutura
  da Shelly (guardar e permitir editar). A chave é derivada da senha da conta: **trocou a senha,
  a chave muda** → tratar como `invalidCredentials` e pedir reconexão. OAuth existe (Real Time
  Events) — fora do escopo.
- **Limite:** "API calls are limited to one per second". Na v2: `/v2/devices/api/get` aceita
  **até 10 aparelhos por chamada**. → fila com espaçamento ≥ 1,1 s **por chave** e lote de até 10 ids.
- **Endpoints v2 (beta):** `POST /v2/devices/api/get` body `{ ids, select: ["status"], pick? }`
  → `[{ id, type, code, gen, online, status, settings }]`; `POST /v2/devices/api/set/switch`
  body `{ id, channel, on, toggle_after? }`; também `set/cover`, `set/light`, `set/groups`.
  Erro: `{ error, data: { messages } }`. Auth por query `auth_key=`.
- **v1 (deprecated):** `POST /device/status` (`id`, `auth_key`), `POST /device/relay/control`
  (`id`, `channel`, `turn=on|off`, `auth_key`). Usar só se a v2 falhar (fallback do adapter).
- **Histórico pela nuvem:** existe `/v2/statistics/power-consumption/em-3p` citado pela
  comunidade, **não documentado** oficialmente → **não depender** dele.
- **RPC local (Gen2+), dentro do aparelho ou na mesma rede:** `EMData.GetRecords {id, ts}` →
  blocos `{ts, period, records}`; `EMData.GetData {id, ts, end_ts?, add_keys?}` →
  `{keys, data:[{ts, period, values}], next_record_ts}`; HTTP `GET /emdata/0/data.csv?add_keys=true&ts=&end_ts=`.
  Campos: `a|b|c_total_act_energy`, `a|b|c_total_act_ret_energy`, `total_act`, `total_act_ret`,
  `a_max_act_power`, `a_min_act_power`, `a_max_voltage`, `a_min_voltage`, `a_avg_voltage`,
  `a_max_current`, `a_min_current`, `a_avg_current` (idem b, c, n). Unidades Wh, VAh, VARh, W, V, A.
  **Uso:** backfill pelo próprio script (v2) e análise de bancada; **não** é caminho de produto
  pelo servidor (não há rede em comum — lição de 07/09).
- **Componentes do status:** perfil trifásico = `em:0` (`a_/b_/c_voltage`, `_current`,
  `_act_power`, `_aprt_power`, `_pf`, `total_act_power`) e `emdata:0` (`a_/b_/c_total_act_energy`,
  `_total_act_ret_energy`, `total_act`, `total_act_ret`); perfil monofásico = `em1:N` e
  `em1data:N` (`voltage`, `current`, `act_power`, `aprt_power`, `pf`, `total_act_energy`,
  `total_act_ret_energy`). Relés = `switch:N` (`output`, `apower`, `voltage`, `aenergy.total`).
  O parser tem que aceitar os **dois perfis** (o piloto está em trifásico usando só a fase C).

#### 2.4 Armazenamento (alto volume) — três camadas

```
medicoes_shelly (1 min, bruto)  ──agregador 15 min──►  energia_15min  ──fechamento diário──►  energia_diaria
   retenção 90 dias                                    retenção 25 meses                     para sempre (enquanto houver contrato)
```

Volume por medidor: 1.440 linhas/dia brutas → 96 linhas/dia de 15 min → 1 linha/dia.
Com 200 medidores: bruto ≈ 26 M linhas em 90 dias (teto), 15 min ≈ 14 M em 25 meses. Sem
partição na G1 (piloto + ~10 kits); **revisar particionamento mensal (modelo 067) ao passar de
150 medidores** — anotado como risco R3.

- **15 min** é a janela da concessionária (demanda) — é a unidade natural do produto.
- A energia de cada janela sai da **diferença dos contadores acumulados** (`energia_wh`,
  `energia_devolvida_wh`), dividida proporcionalmente ao tempo quando um intervalo atravessa a
  fronteira da janela. Só na falta de contador (ou contador que "andou para trás" = aparelho
  reiniciado) integra-se a potência, e só para intervalos ≤ 10 min. Intervalo maior que isso =
  **buraco**, contado em `cobertura`, nunca inventado.
- `demanda média 15 min` = (importado − exportado) × 4 (W, líquido). Bate com `janelasDe15Minutos`.
- Tensão: min/máx/média da janela e **minutos por faixa PRODIST** (só no modo push).
- Dia = **dia local de Brasília** (America/Sao_Paulo, UTC−3 sem horário de verão desde 2019) —
  igual `geracao_diaria.data`.

#### 2.5 Multi-tenant e segurança do recebimento

Hoje o `/webhooks/shelly` usa **um token global** (`SHELLY_INGEST_TOKEN`) e grava com o
`company_id` **padrão (EcoSun)**. Com um segundo cliente de outra empresa isso vaza. Correção:

- o script do aparelho **não muda** (mesmo cabeçalho `x-shelly-token`); só o valor do token passa
  a ser o do medidor;
- comparação de token por hash com `timingSafeEqual` (hoje é `!==`);
- cada medidor ganha um **token próprio** gerado pela plataforma (`medidores_energia.token_ingest_hash`
  = SHA-256; o token claro aparece **uma vez** na tela de cadastro para colar no script);
- o recebimento resolve **token → medidor → company_id/lead_id** e carimba explícito;
- `device_id` do corpo tem que bater com o do medidor (evita um token gravar em outro aparelho);
- o token global continua aceito **só** para os `device_id` já existentes da EcoSun (piloto),
  com log `[energia] token legado` — some quando o script do piloto for trocado (tarefa G1).
  A lista vem da env `SHELLY_LEGADO_DEVICES` (padrão: o piloto `007007422d90`).
- (revisão 28/09) token do medidor: formato (43 base64url) conferido **antes** do banco; só no
  cabeçalho (o `?token=` na URL vale só pro token global, na transição); banco fora ao resolver o
  token → **503**; medidor desligado → **410**; limite de 120 chamadas/min por IP; `device_id`
  gravado sempre normalizado (sem `shellypro3em-`, minúsculo); leitura > 5 min no futuro recusada.
- (revisão 28/09) um aparelho existe **uma vez na plataforma inteira** (índice único global na
  forma normalizada) — o mesmo Shelly nunca manda dado pra duas empresas.

**Portão de tenant (decisão do dono, 28/09):** o Command Center abre pra tenants com isolamento
estrito. Na G1 a Gestão de Energia é travada **só pelo módulo contratado `medicao`** (sem flag
`ENERGIA_ABERTO_A_TENANTS`). Tenant **sem** o módulo `medicao` vê a vitrine da Energia no lugar
das telas. Tenant **com** o módulo usa as telas com os dados só da empresa dele, e o aviso do
vigia vai só pro `telefone_admin` DELE (nunca pro zap do dono da EcoSun; sem admin, ninguém).

### 3. Banco de dados — migrations propostas

> **Números provisórios.** A última aplicada é a 135; a fase B do Command Center declara "sem
> migration", mas **combinar o número no grupo antes** (regra do CLAUDE.md). Abaixo: `EN-1`,
> `EN-2`, `EN-3`… viram `136_…`, `137_…` na hora.

**EN-1 `medidores_energia` + vínculo no bruto (G1)**

```sql
create table if not exists medidores_energia (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null,                       -- sem default: carimbo explícito
  lead_id               uuid references leads(id) on delete set null,
  sistema_id            uuid references sistemas_clientes(id) on delete set null, -- usina da mesma UC
  apelido               text not null,
  fabricante            text not null default 'shelly' check (fabricante in ('shelly')),
  modelo                text,                                -- 'SPEM-003CEBEU120'
  device_id             text not null,                       -- '007007422d90'
  modo_coleta           text not null default 'push' check (modo_coleta in ('push','nuvem','push_nuvem')),
  perfil                text not null default 'triphase' check (perfil in ('triphase','monophase')),
  canais                jsonb not null default '{"rede": 2}'::jsonb, -- {rede, geracao?, cargas?:[{canal,nome}]}
  ligacao               text check (ligacao in ('mono','bi','tri')),
  tensao_nominal_v      smallint check (tensao_nominal_v in (127, 220, 380)),
  concessionaria        text,
  uc_instalacao         text,                                -- = demonstrativos_gd.instalacao
  codigo_cliente        text,                                -- = demonstrativos_gd.codigo_cliente
  grupo_gd              text check (grupo_gd in ('gd1','gd2','gd1_gd2','sem_gd')),
  api_credentials_cifrado text,                              -- AES-256-GCM (auth_key, server_uri)
  token_ingest_hash     text,                                -- sha256 do token do script
  ativo                 boolean not null default true,
  status                text not null default 'aguardando' check (status in ('aguardando','ok','mudo')), -- só chegada de dado
  nuvem_ok              boolean,                             -- chave da nuvem: null não testada / false recusada (separado do status)
  nuvem_desde           timestamptz,
  nuvem_avisado_em      timestamptz,
  aviso_dia             date,                                -- freio: até 4 avisos por medidor por dia
  avisos_no_dia         smallint not null default 0,
  status_desde          timestamptz not null default now(),
  ultima_leitura_em     timestamptz,
  ultimo_erro           text,
  consentimento_em      timestamptz,                         -- LGPD: aceite do titular
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- company_id references companies(id); device_id único no GLOBAL (índice na forma normalizada);
  -- índice único (id, company_id) = alvo das FKs compostas de energia_15min/energia_diaria (on delete cascade)
);
create unique index if not exists medidores_energia_token on medidores_energia (token_ingest_hash) where token_ingest_hash is not null;
create index if not exists medidores_energia_lead on medidores_energia (lead_id) where lead_id is not null;
alter table medicoes_shelly add column if not exists medidor_id uuid references medidores_energia(id) on delete cascade;
create index if not exists medicoes_shelly_medidor_tempo on medicoes_shelly (medidor_id, medido_em);
-- RLS FORCE + policy company_isolation (texto idêntico à 123/079)
```

**EN-2 `energia_15min` + `energia_diaria` (G1)**

```sql
create table if not exists energia_15min (
  medidor_id     uuid not null references medidores_energia(id) on delete cascade,
  company_id     uuid not null,
  papel          text not null default 'rede' check (papel in ('rede','geracao','carga')),
  canal          smallint not null default 0,
  inicio         timestamptz not null,           -- :00 :15 :30 :45
  importado_wh   numeric(12,3) not null default 0,
  exportado_wh   numeric(12,3) not null default 0,
  potencia_max_w numeric(11,2),
  tensao_min_v   numeric(6,2), tensao_max_v numeric(6,2), tensao_med_v numeric(6,2),
  fp_medio       numeric(5,3),
  min_tensao_precaria smallint not null default 0, -- leituras de 1 min na faixa precária (push)
  min_tensao_critica  smallint not null default 0, -- idem crítica
  min_acima_242       smallint not null default 0, -- risco de desarme do inversor (NBR 16149)
  segundos_cobertos smallint not null default 0, -- 0..900
  fonte          text not null check (fonte in ('push','nuvem','backfill')),
  primary key (medidor_id, papel, canal, inicio)
);
create index if not exists energia_15min_empresa_inicio on energia_15min (company_id, inicio);

create table if not exists energia_diaria (
  medidor_id     uuid not null references medidores_energia(id) on delete cascade,
  company_id     uuid not null,
  dia            date not null,                  -- dia local BRT
  importado_kwh  numeric(10,3), exportado_kwh numeric(10,3),
  geracao_kwh    numeric(10,3),                  -- cópia de geracao_diaria (ou canal 'geracao')
  consumo_kwh    numeric(10,3),                  -- gerado + importado − exportado (null se faltar geração)
  imp_ponta_kwh numeric(10,3), imp_intermediario_kwh numeric(10,3), imp_fora_ponta_kwh numeric(10,3),
  demanda_max_w  numeric(11,2), demanda_max_inicio timestamptz,
  base_noturna_w numeric(11,2),                  -- mediana 00h–05h
  tensao_min_v numeric(6,2), tensao_max_v numeric(6,2),
  min_precaria   integer, min_critica integer,   -- minutos na faixa PRODIST (push)
  cobertura_pct  numeric(5,2) not null,          -- % do dia com dado
  fechado_em     timestamptz not null default now(),
  primary key (medidor_id, dia)
);
-- RLS FORCE + company_isolation nas duas
```

**EN-3 `monitoring_alerts` aceita medidor (G3)**

```sql
alter table monitoring_alerts alter column sistema_id drop not null;
alter table monitoring_alerts add column if not exists medidor_id uuid references medidores_energia(id) on delete cascade;
alter table monitoring_alerts add constraint monitoring_alerts_alvo check (sistema_id is not null or medidor_id is not null);
create unique index if not exists monitoring_alerts_dedupe_medidor on monitoring_alerts (medidor_id, tipo) where resolved_at is null and medidor_id is not null;
```
⚠️ Mexe em tabela que o dispatcher lê (`getSistemaById(alerta.sistema_id)`): o dispatcher
precisa de um ramo "alerta de medidor" antes desta migration ir ao ar.

**EN-4 controle de cargas (G4):** `cargas_controladas` (relé, canal, tipo: `compressor|resistiva|bomba|outro`,
`min_ligado_s`, `min_desligado_s`, `potencia_nominal_w`), `agendas_carga` (dias, liga/desliga,
regra), `comandos_carga` (auditoria: quem, quando, origem `agenda|regra|manual|eva`, resultado,
estado confirmado). Todas com `company_id` + RLS.

**EN-5 (G5) tarifas por posto:** `tarifas_posto` (concessionária, vigência, modalidade
`convencional|branca`, posto, TE, TUSD, TUSD Fio B) — referência global (entra na allowlist do
`migrations-tenant-guard` com motivo "tarifa homologada ANEEL, não é dado de cliente").

**Retenção (job, não migration):** bruto `medicoes_shelly` > 90 dias apagado **depois** de
conferido que o `energia_15min` daquele período existe; `energia_15min` > 25 meses apagado.

### 4. G1 — Leitura (detalhe)

**4.1 Cadastro do medidor** — `/dashboard/energia/medidores/novo` (permissão `usinas:editar`):
cliente (lead), usina (opcional, lista `sistemas_clientes` da empresa), apelido, `device_id`,
perfil, canal da rede (e da geração, se houver TC no cabo do inversor), ligação, tensão nominal,
concessionária, UC/código do cliente, grupo GD, modo de coleta. Se `nuvem`: campos `server_uri`
e `auth_key` (tipo password, nunca reexibidos — só "••••1a2b"), botão **"Testar conexão"**
(chama `/v2/devices/api/get` para o `device_id` e mostra `online`, modelo, perfil detectado).
Se `push`: gera o token, mostra **uma vez** + o script já preenchido para copiar. Caixa de
aceite LGPD (`consentimento_em`).

**4.2 Coleta** — push: o webhook atual, agora com token do medidor. Nuvem: cron 15 min
(`coletarNuvemShelly`) em fila por chave (1 req/s, lote de 10), grava uma "leitura sintética"
em `medicoes_shelly` com `canal` e contadores (a agregação é a mesma para os dois modos).

**4.3 Agregação** — cron 15 min (`agregarEnergia`): para cada medidor ativo, pega o bruto desde
a última janela fechada − 1 janela de folga, calcula as janelas (função pura `agregar15min`) e
faz upsert em `energia_15min` (idempotente). Fechamento diário 00:30 BRT (`fecharDiaEnergia`)
recalcula ontem **e anteontem** (dado atrasado pelo backfill) → `energia_diaria`.

**4.4 Tela "Energia da casa"** — `/dashboard/energia/:medidorId` (e link a partir do lead e da
usina): cabeçalho com trilha "Usinas › Energia › <apelido>"; `faixaKpis` do período (padrão:
mês corrente): **Gerado · Comprado · Devolvido · Consumido · Autoconsumo % · Autossuficiência %**;
gráfico de barras diário (gerado × consumido); curva do dia (saldo da rede 15 min, injeção abaixo
do zero — reusa `escalaDoGrafico`; geração do inversor sobreposta via `fetchIntraday` quando a
marca suporta); card "Conferência com a Neoenergia" (4.5); card de saúde do medidor (status,
última leitura, cobertura). Sem geração → Gerado/Consumido/Autoconsumo mostram "—" e o texto
"ligue a usina a este medidor para ver o consumo real". Nada de número inventado.

Fórmulas (função pura `balancoEnergia`):
- consumo = G + I − E
- autoconsumo = (G − E) ÷ G   (parcela do sol usada na hora)
- autossuficiência = (G − E) ÷ consumo   (parcela da casa atendida pelo sol na hora)
- se G < E no período (usina medida errada, TC trocado ou geração faltando) → não calcula e
  marca "conferir cadastro".

**4.5 Conciliação com o demonstrativo** — função pura `conciliarComDemonstrativo`:
casa `medidores_energia.uc_instalacao` com `demonstrativos_gd.instalacao` (mesma `company_id`),
mês a mês. Compara Shelly exportado × `injetado_kwh` e Shelly importado × `consumo_kwh`.
Limitação: o ciclo de leitura da Neoenergia **não é o mês civil** e o parser hoje não extrai as
datas de leitura (os campos "de/até" da linha Gerador são leituras do medidor, não datas) → a
conciliação usa o mês civil e a tolerância é larga: **bate** se |dif| ≤ max(5%, 10 kWh);
**atenção** entre isso e 15%; **diverge** acima de 15%; **sem dado** se cobertura do mês < 97% (sem veredito, a tela mostra os números apagados, só de
referência).
Texto sempre explica: "diferença pode ser o dia de leitura da Neoenergia (ciclo ≠ mês)".
Evolução: extrair datas de leitura da fatura (tarefa futura no `gd/`).

**4.6 Observabilidade**
- Logs com prefixo `[energia]` e **sem dado de consumo** (só ids e contagens): por ciclo
  `coleta nuvem: X ok / Y falha / Z credencial`, `agregacao: N janelas de M medidores`,
  `fechamento: dia D, N medidores, cobertura média P%`; recebimento conta aceitas/recusadas por
  motivo.
- Estado por medidor em `medidores_energia` (`status`, `status_desde`, `ultima_leitura_em`,
  `ultimo_erro`) — o **vigia de silêncio** olha a *chegada de dado*, não o "online" da nuvem
  (lição da memória: "não vigiar Conectado"). `ok → mudo` após 30 min sem leitura (push) ou 45 min
  (nuvem); volta a `ok` na primeira leitura.
- Na G1 a transição `ok ↔ mudo` manda **uma** mensagem ao admin da empresa (mesmo
  `sendAdminWithButtons` do dispatcher, 1 por transição, janela de horário `dentroDaJanela`);
  o 1º dado de um medidor novo é "começou a mandar dado"; no máximo 4 mensagens por medidor por
  dia; em dry-run a transição não é gravada. Chave da nuvem recusada fica em `nuvem_ok` (não no
  `status`) e gera **um** aviso pelo mesmo caminho — o vigia do script segue funcionando. Alerta ao cliente e fila com re-envio ficam para a G3.
- Quando a fase B do Command Center estiver na `main`: medidor `mudo` > 2 h entra como evento
  na Central de Atenção (1 função de mapeamento).

### 5. G2 — Diagnóstico automático + PDF "Análise de Carga"

Entrada: `energia_15min` + `energia_diaria` de um período (padrão: últimos 30 dias, mínimo 7
dias com cobertura ≥ 90%). Funções puras em `src/modules/energia/diagnostico/*`, cada uma
devolve `{ achado, gravidade, texto }` em português simples + os números usados.

| Diagnóstico | Regra | Texto-modelo |
|---|---|---|
| Carga de base noturna | mediana da potência líquida 00h–05h, dias com cobertura; > 400 W = achado; custo = W × 12 h × 30 × tarifa (`tarifaPorConcessionaria`) | "Das 0h às 5h a casa puxa ~1,0 kW sem parar — cerca de 360 kWh e R$ 370 por mês. Vale descobrir o que fica ligado (ar, freezer, bomba)." |
| Postos tarifários | dias úteis: **ponta 18–21h**, intermediário 17–18h e 21–22h, fora-ponta o resto; fim de semana e feriado nacional = fora-ponta. Horários **por concessionária** em tabela de código (Neoenergia Brasília: ponta 18h–21h — conferir na resolução homologatória vigente). Feriados nacionais fixos + móveis (Carnaval, Sexta Santa, Corpus Christi) calculados. | "76% da energia comprada é fora do horário de ponta." |
| Demanda | maior média de 15 min (`demandaMaxima`) e pico instantâneo (push); corrente estimada = P ÷ V | "Maior média de 15 min: 9,8 kW. Pico instantâneo: 12,8 kW em 08/09 22:54 (~58 A)." |
| Tensão × PRODIST Módulo 8 | médias de **10 min** (a partir do 1 min), classificadas nas faixas; **DRP** = leituras precárias ÷ 1.008 × 100 e **DRC** = críticas ÷ 1.008 × 100 por semana; limites DRP 3% e DRC 0,5% | "Tensão ficou acima de 231 V em 18% do tempo, quase tudo das 8h às 13h. Isso é indício para pedir medição à Neoenergia." |
| Risco de desarme do inversor | minutos com tensão > 242 V (mesmo limite de `telemetria-regras.ts`, NBR 16149) | "Em 3 dias a tensão passou de 242 V — o inversor pode desligar por proteção." |
| Desequilíbrio (trifásico) | corrente: máx. desvio da média ÷ média; tensão: (máx − mín) entre fases. **Não** calcula FD% do PRODIST (precisa de ângulos). Só se `ligacao = 'tri'` e as 3 fases têm carga. | "A fase A carrega o dobro das outras." |
| Fator de potência | FP médio ponderado (Σ P ÷ Σ S); só vira achado com FP < 0,92 **e** Grupo A (no Grupo B não há cobrança de reativo) | |
| Bateria vale? | ver regra abaixo | |

**Faixas PRODIST Módulo 8 (tensão de leitura TL, BT)** — conferidas em 28/09 com o texto
publicado (0,92–1,05 × TR para a faixa adequada); **reconferir na revisão vigente antes de
publicar o PDF**:

| Tensão nominal | Adequada | Precária | Crítica |
|---|---|---|---|
| 220 (fase-neutro de 380/220) | 202 ≤ TL ≤ 231 | 191 ≤ TL < 202 ou 231 < TL ≤ 233 | TL < 191 ou TL > 233 |
| 127 (fase-neutro de 220/127) | 117 ≤ TL ≤ 133 | 110 ≤ TL < 117 ou 133 < TL ≤ 135 | TL < 110 ou TL > 135 |
| 380 (fase-fase) | 350 ≤ TL ≤ 399 | 331 ≤ TL < 350 ou 399 < TL ≤ 403 | TL < 331 ou TL > 403 |

**Bateria vale?** (função pura `bateriaVale`):
- **GD I** (compensação 1:1 até 2045 — Lei 14.300 art. 26): guardar a sobra do dia para usar à
  noite dá **economia zero** (a injeção já volta 1:1). Resposta: "não se paga pela economia;
  só como backup (queda de energia)". Exceção sinalizada: tarifa branca (G5).
- **GD II:** cada kWh que deixa de ser injetado e reimportado evita o Fio B:
  `economia/kWh = tusdFioB × percentualFioBVigente(ano)` (60% 2026, 75% 2027, 90% 2028 —
  Lei 14.300 art. 27; reusar `solar-params.ts`). kWh deslocável/dia = min(exportado do dia,
  importado da noite, capacidade útil) × 0,90 (rendimento ida-e-volta). Economia anual e
  payback simples contra o preço do kit informado. Texto: "com 13 kWh/dia deslocáveis, a
  bateria economiza ~R$ 850/ano; uma de 10 kWh custa ~R$ 35 mil → mais de 30 anos: não vale
  pela economia".
- **GD I + GD II** (casa GD I com ampliação GD II): só a parte GD II entra na conta.
- ⚠️ Observação ao Junior: `percentualFioBVigente` hoje devolve 30% para ≤ 2023 (a lei diz 15% em
  2023) e 100% a partir de 2029 (a regra pós-2029 depende de metodologia da ANEEL). Não afeta
  2026–2028; não mexer sem decisão.

**PDF "Análise de Carga"** — `src/modules/energia/analise-pdf.ts`: HTML (tokens da marca da
empresa via `relatorio-marca.ts`, gráfico Chart.js com marca de conferência) → `htmlToPdf` →
conferência no padrão `gerarRelatorioPdf` (nº de páginas esperado, rodapé, gráfico carregou).
Estrutura (4 páginas): 1) resumo em 5 frases + KPIs; 2) perfil diário médio (útil × fim de
semana), postos, base noturna; 3) tensão (histograma + faixas + DRP/DRC indicativos), demanda,
FP/desequilíbrio; 4) recomendações ("bateria vale?", tarifa branca → G5) + **limitações**:

> "Medição feita com medidor Shelly Pro 3EM (precisão ±1% de 2 a 120 A). Não é analisador de
> qualidade de energia classe A (IEC 61000-4-30): não mede harmônicas, flicker nem afundamentos
> rápidos. Os indicadores de tensão são **indicativos** e não substituem a medição regulatória
> da distribuidora (PRODIST Módulo 8). Este estudo não é laudo de qualidade de energia."

Assinatura: nome do RT da empresa + "Responsável Técnico CREA/CFT" (nunca "engenheiro").
Entrega: botão na tela + (depois) envio pela Eva reusando o fluxo do relatório GD
(`relatorio-envio*.ts`).

### 6. G3 — Alertas no WhatsApp

Reusa `monitoring_alerts` (após EN-3), `ProactiveAlertService` (novo passo `detectarEnergia`),
`runDispatchCycle` (ramo "medidor"), `formatAlertMessage`, botões, janela de horário.

| Tipo novo (`AlertTipo`) | Regra (pura, `energia/alertas-regras.ts`) | Para quem |
|---|---|---|
| `energia_consumo_anormal` | consumo do dia > mediana dos últimos 28 dias do mesmo tipo de dia × 1,5 **e** > +5 kWh, 2 dias seguidos | cliente + admin |
| `energia_carga_noturna` | base noturna > 600 W por 3 noites seguidas **e** > 1,5 × a base típica do cliente (evita avisar todo dia quem sempre teve) | cliente |
| `energia_sobretensao` | ≥ 10 min acima de 242 V em ≥ 2 dos últimos 3 dias (mesma lógica de `tensao_rede_alta`), ou DRC semanal > 0,5% | cliente + admin (se o medidor tiver usina, cruza com o inversor desarmado) |
| `energia_medidor_mudo` | status `mudo` > 2 h | admin (cliente só após 24 h, com instrução "confira o Wi-Fi") |

Mensagem ao cliente fora da janela de 24 h do WhatsApp exige **modelo aprovado na Meta**
(decisão D6). Autonomia: respeitar `autonomiaOn` e o resumo diário que já existe.

### 7. G4 — Controle de cargas

- Somente relés **1PM/2PM Gen4** (homologados Anatel), carga ≤ 16 A resistiva; compressor/motor
  conferir o limite indutivo do manual; **chuveiro e cargas > 3,5 kW só via contator**.
- Comando pela nuvem: `POST /v2/devices/api/set/switch {id, channel, on}`; depois **confirma**
  com `/v2/devices/api/get` (o estado real) e grava em `comandos_carga`.
- **Anti ciclo curto (obrigatório):** cada carga tem `min_ligado_s` e `min_desligado_s`;
  compressor (ar, geladeira, freezer, bomba de calor) **mínimo 5 min desligado e 5 min ligado**
  (padrão; fabricantes usam 3 min de proteção — usamos folga). A função pura
  `podeComutar(carga, historico, agora)` recusa o comando e diz por quê. Máx. 6 comutações/h
  por carga.
- **Rede de segurança:** desligamento temporário usa `toggle_after` (a própria Shelly volta ao
  estado anterior se o nosso servidor cair). Medidor/relé offline → nenhum comando.
- Agendas simples (liga/desliga por horário e dia) + 1 regra "sobrou solar → liga carga"
  (exportação líquida > potência da carga + margem por 10 min). Tudo auditado; permissão nova
  `energia:controlar`; botão manual com confirmação.
- **Horários críticos gravados no próprio aparelho** (Schedule do Shelly, no comissionamento)
  continuam valendo sem internet; a plataforma só mostra. (Decisão D7.)

### 8. G5 — Simuladores (funções puras + tela)

1. **Tarifa branca × convencional:** usa os kWh importados por posto (`energia_15min`) de um
   período e as tarifas da `tarifas_posto` (EN-5). Com GD, a compensação na branca é **por
   posto** (a injeção compensa primeiro o mesmo posto, com fator de ajuste nos demais —
   **conferir REN 1.000/2021 e REN 1.059/2023 antes de liberar**). Mostra conta de cada
   modalidade mês a mês e o "e se eu mudar os ares para fora da ponta".
2. **Bateria:** generaliza `bateriaVale` com capacidade, potência, rendimento, preço, e o
   cenário tarifa branca (desloca da ponta).
3. **Ampliação da usina:** potência instalada = **min(soma dos módulos CC, soma dos inversores
   CA)**; **só a potência ACRESCIDA vira GD II** (REN 1.059/2023, art. 655-R §1º — conferir o
   texto); a geração nova rateada pela proporção acrescida ÷ total. Checa limite do inversor
   (ex.: piloto: Solis 5 kW já acima do CC recomendado; módulo 13,1 A > 11 A/MPPT → não cabe
   placa — regra da memória "corrente por MPPT").
4. **Autoconsumo remoto:** outra UC do **mesmo titular (CPF/CNPJ)** na mesma área de concessão;
   a usina nova é GD II; créditos vão para a UC com medidor; mostra quanto do consumo medido
   (inclusive a base noturna) seria abatido e o Fio B pago sobre a parte compensada.

Todos os simuladores rodam com os **números do próprio cliente** e dizem a hipótese de cada
número; nenhum crava preço (regra "Eva nunca crava preço").

### 9. LGPD

- **Natureza:** curva de consumo identifica rotina (presença, horários). Tratada como dado
  pessoal comum, com cuidado reforçado.
- **Base legal:** execução de contrato (art. 7º, V) para o serviço contratado; **consentimento
  separado** para usos secundários (estatística agregada, parceria futura com comercializadora/VPP).
  `consentimento_em` no medidor; termo no contrato do kit (decisão D8).
- **Isolamento:** `company_id` + RLS FORCE em todas as tabelas; rotas com `bancoDoOperador`;
  testes-teto já existentes cobrem rota e migration.
- **Minimização e retenção:** bruto 1 min 90 dias; 15 min 25 meses; diário enquanto houver
  contrato. Fim de contrato → exporta CSV ao titular e apaga em 30 dias (job `apagarMedidor`).
- **Logs:** nunca valores de consumo, credenciais ou token; só ids e contagens.
- **Credenciais:** cifradas (AES-256-GCM, env `ENERGIA_CRED_KEY`); entram **só** pelo formulário;
  nunca voltam para a tela; a Eva nunca pede nem recebe chave/senha (se o cliente mandar no
  WhatsApp, a Eva orienta a usar o link do formulário e não repete o texto).
- **Direitos do titular:** tela de exportação (CSV) e exclusão por medidor.

### 10. Estratégia de testes

| Camada | Como |
|---|---|
| Funções puras (agregação, balanço, conciliação, postos, PRODIST, diagnósticos, bateria, anti ciclo curto) | vitest, TDD, **fixture sintética** com a forma do piloto (curva de 1 dia com base noturna 1 kW, exportação ao meio-dia, tensão 236 V às 11h) — sem dado real do cliente no repositório |
| Adapter nuvem | `fetch` injetado (padrão `telemetria-sungrow.test.ts`): status trifásico e monofásico, `online: 0`, erro `{error}`, 401/credencial, limite 1 req/s (relógio falso), lote de 10 |
| Recebimento | estende `shelly-medicao.test.ts`: token do medidor resolve empresa; token de outra empresa recusado; `device_id` divergente recusado; token legado só para device EcoSun |
| Rotas | req/res falsos (padrão `command-center-rotas`); `tenant-rota-guard` e `migrations-tenant-guard` verdes; `escapeHtml` em todo dado |
| PDF | deps injetadas (`htmlToPdf`/`lerPdf` falsos) como `gerarRelatorioPdf`; `pdf-guard.test.ts` |
| Ponta a ponta manual | piloto (casa do Junior): 7 dias de `energia_diaria` comparados com a análise de 28/09 (import ≈ 21, export ≈ 14,5 kWh/dia; 76% fora-ponta) — tolerância 3% |

### 11. Decisões em aberto para o Junior

| # | Pergunta | Recomendação |
|---|---|---|
| D1 | Modo de coleta padrão do produto | **push** (script) como padrão; **nuvem** como reserva e para quem não aceita script; G4 exige nuvem |
| D2 | Conta Shelly: do cliente ou nossa? | conta **criada por nós por cliente** (truque "automacao01@", transferível), com a chave cifrada; cliente ganha acesso pelo app |
| D3 | Cifrar a chave Shelly (as outras marcas estão em texto no JSONB) | **sim**, porque controla relés; nova env `ENERGIA_CRED_KEY` |
| D4 | Retenção: 90 dias (bruto) / 25 meses (15 min) | ok? Laudo com mais de 90 dias de 1 min exigiria guardar mais |
| D5 | Onde fica no menu | "Usinas › Energia" ao lado de `/medicao` (que é aposentada quando a nova cobrir tudo) |
| D6 | Modelos de mensagem na Meta para alertas ao cliente (G3) | aprovar 2 modelos: `energia_alerta_v1`, `energia_medidor_mudo_v1` |
| D7 | Agendas: no servidor ou gravadas no aparelho? | críticas no aparelho (funciona sem internet); flexíveis no servidor |
| D8 | Termo LGPD / consentimento no contrato do kit | incluir cláusula + aceite no cadastro |
| D9 | A mensalidade R$ 39 libera quais etapas? | G1+G3 no básico; PDF G2 como serviço avulso (estudo de carga) ou 1×/ano incluso |
| D10 | Tenants (Conquista Solar etc.) enxergam o módulo já na G1? | não na G1 (só EcoSun, igual ao Command Center); abrir depois pelo `empresa_modulos` |
| D11 | Números de migration | combinar no grupo (próxima livre hoje: 136) |

### 12. Riscos

| # | Risco | Mitigação |
|---|---|---|
| R1 | Cliente troca a senha da conta Shelly → chave muda → nuvem para | `nuvem_ok = false` + um aviso; push (e o vigia dele) não é afetado |
| R2 | Script morre após queda de energia ("Executar na inicialização" desligado) | vigia de silêncio; checklist de instalação; nuvem como reserva |
| R3 | Volume do bruto com muitos medidores | retenção 90 dias; particionar por mês acima de 150 medidores |
| R4 | TC invertido / na fase errada → balanço absurdo | validação no cadastro (P ≈ V×I, sinal no meio-dia) e regra "G < E → conferir cadastro" |
| R5 | Conflito com a fase B do Command Center (router/views) | G1 começa **depois** do merge da fase B; rotas em `energia-rotas.ts`; 1 linha no router |
| R6 | Leitura regulatória errada (faixas/limites) | tabela citada + "conferir na revisão vigente" + texto de limitação no PDF |
| R7 | Endpoint v2 da nuvem é "beta" | adapter com fallback v1 (`/device/status`) |

### Revisão 1 (28/09/2026) — o que mudou depois da primeira revisão de código

- Agregação: folga da leitura do bruto = maior intervalo aceito entre contadores (nuvem: 30 min),
  e toda consulta filtra o **canal** da rede (não mistura fases; usa a ordem da chave primária).
- Hora do aparelho > 5 min no futuro é recusada; `ultima_leitura_em` nunca vai pro futuro.
- Aparelho único na plataforma; formulário diz só "Este aparelho já está cadastrado. Fale com o suporte."
- LGPD: "Medidor ligado" na edição (desligado → 410 no webhook, crons pulam) e "Apagar medidor e
  todos os dados" com o nome digitado (cascata: bruto, 15 min, dia; registro sem consumo).
- Chave da nuvem cifrada com etiqueta de 16 bytes e AAD = medidor + empresa.
- Conferência com a Neoenergia: veredito só com ≥ 97% do mês.

