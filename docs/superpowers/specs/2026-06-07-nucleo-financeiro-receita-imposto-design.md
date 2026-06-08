# Spec — Núcleo Financeiro (Fatia 2, lado Receita + Imposto) — versão COMPLETA (multi-anexo)

> Departamento Financeiro EcoSunPower — Fase 1, Fatia 2.
> Brainstorm + design aprovados por Junior em 07/06/2026 (escolheu a versão COMPLETA).
> Linguagem simples de propósito (Junior lê e aprova). Detalhe técnico nas seções marcadas.
> Pesquisa fiscal de base: `Documents/EcoSunPower/Financeiro/IMPOSTO-METODO-Simples-Anexo-III.md`
> (re-verificada por deep-research em 07/06: 6/6 pontos CONFIRMADOS, zero correções).
> Plano-mãe: `Documents/EcoSunPower/Financeiro/PLANO-Departamento-Financeiro.md`.

---

## 0. Por que COMPLETA (multi-anexo) e não só Anexo III

Decisão de Junior (07/06): construir o motor entendendo **todos os anexos do Simples** e
**segregando a receita por atividade**, por 3 razões reais do negócio:

1. **A loja de equipamentos** que o Junior está montando vai gerar **receita de comércio
   (Anexo I, começa em 4%)** — mais barata que serviço.
2. **O repasse/comissão dos distribuidores** (financiamento do pacotão) é **obrigatoriamente
   emitido no CNAE de agenciamento (7490-1/04 → Anexo V, 15,5%)**, salvo se o **Fator R ≥ 28%**,
   quando cai pro Anexo III (~8,5%). O distribuidor só aceita nota nesse CNAE — não dá pra fugir,
   então o jeito de pagar barato é **proteger o Fator R**.
3. **Junior pretende revender o sistema** pra outras empresas → o motor não pode ser chumbado
   na realidade da EcoSunPower; tem que ser **dirigido por dados/configuração**.

**Continua FORA (Fatia 3 — Caixa de Entrada Universal):** despesa / dinheiro que sai, caixa
real, contas a pagar, IA lendo foto/PDF/áudio, etiqueta PF/PJ automática.

---

## 1. O fluxo (o "fio único")

```
/fechar venda → Conta a Receber (pendente, com a ATIVIDADE/anexo) → Junior clica "Recebido"
  → vira faturamento do mês → imposto do anexo daquela receita recalculado → entra no RBT12 total
```
Fechar contrato NÃO é receita ainda; só o "Recebido" liga o dinheiro (regime de caixa, bate com
o que o contador declara). Cada venda sabe **qual atividade é** (instalação / equipamento /
comissão), e o imposto sai pelo **anexo correto daquela atividade**.

---

## 2. O motor de imposto (núcleo isolado, testado, multi-anexo)

Módulo puro, sem banco nem rede: `src/modules/financeiro/imposto.ts`.

### 2.1 As tabelas dos 5 anexos (dados de referência, nunca chumbados)

Valores LC 123/2006 (estáveis desde 2018, vigentes 2026). Anexo III e a fórmula foram
confirmados por deep-research; Anexos I/II/IV/V vêm de fonte secundária convergente com a lei —
**confirmar com contador os que de fato vão sair em nota (I comércio e V agenciamento são os
relevantes pro Junior).**

**Cada anexo tem 6 faixas. Faixas (RBT12) iguais pra todos:**
1: 0–180.000 · 2: 180.000,01–360.000 · 3: 360.000,01–720.000 · 4: 720.000,01–1.800.000 ·
5: 1.800.000,01–3.600.000 · 6: 3.600.000,01–4.800.000.

**Alíquota nominal (%) / Parcela a deduzir (R$) por faixa:**

| Faixa | Anexo I (Comércio) | Anexo II (Indústria) | Anexo III (Serviço) | Anexo IV (Construção) | Anexo V (Serviço §5º-I) |
|---|---|---|---|---|---|
| 1 | 4,00% / 0 | 4,50% / 0 | 6,00% / 0 | 4,50% / 0 | 15,50% / 0 |
| 2 | 7,30% / 5.940 | 7,80% / 5.940 | 11,20% / 9.360 | 9,00% / 8.100 | 18,00% / 4.500 |
| 3 | 9,50% / 13.860 | 10,00% / 13.860 | 13,50% / 17.640 | 10,20% / 12.420 | 19,50% / 9.900 |
| 4 | 10,70% / 22.500 | 11,20% / 22.500 | 16,00% / 35.640 | 14,00% / 39.780 | 20,50% / 17.100 |
| 5 | 14,30% / 87.300 | 14,70% / 85.500 | 21,00% / 125.640 | 22,00% / 183.780 | 23,00% / 62.100 |
| 6 | 19,00% / 378.000 | 30,00% / 720.000 | 33,00% / 648.000 | 33,00% / 828.000 | 30,50% / 540.000 |

### 2.2 Fórmula oficial (Art. 18 §1º-A da LC 123/2006)

```
alíquota_efetiva = (RBT12 × alíquota_nominal − parcela_a_deduzir) ÷ RBT12
imposto_da_venda = valor_da_venda × alíquota_efetiva
```
**RBT12 = receita bruta TOTAL acumulada nos 12 meses** (soma de TODAS as atividades juntas).
Cada receita segregada usa o **nominal+dedução do SEU anexo**, mas com o **MESMO RBT12 total**.
A efetiva sobe conforme o RBT12 total cresce e cruza faixas (progressivo).

### 2.3 Segregação de receita + Fator R (o coração da versão completa)

Cada receita pertence a uma **atividade** (ver catálogo §3.2). A atividade aponta um **anexo**.
Atividades marcadas como **sujeitas ao Fator R** (serviços do §5º-I, ex.: agenciamento, engenharia)
resolvem o anexo dinamicamente:
```
anexo_resolvido = (FatorR ≥ 28%) ? Anexo III : Anexo V
FatorR = folha_12_meses ÷ receita_bruta_12_meses
folha inclui pró-labore dos sócios + INSS patronal + FGTS
```
Atividades NÃO sujeitas ao Fator R usam o anexo fixo (comércio→I, instalação/manutenção→III,
construção civil→IV, indústria→II).

### 2.4 Funções públicas do módulo

- `faixaPorRBT12(rbt12)` → número da faixa (1–6).
- `aliquotaEfetiva(rbt12, anexo)` → `{ faixa, nominal, deduzir, efetiva }`.
- `impostoDaVenda(valor, rbt12, anexo)` → `{ imposto, efetiva, faixa }`.
- `resolverAnexo(atividade, fatorR)` → anexo final (aplica regra Fator R).
- `fatorR(folha12, receita12)` → `{ ratio, anexo: 'III' | 'V' }`.
- `proLaboreMinimoParaAnexoIII(receita12, outrasFolhas12)` → pró-labore mensal mínimo pra manter
  Fator R ≥ 28% (a "proteção ativa").
- `proximoSalto(rbt12)` → `{ limite, distancia }` (null na 6ª faixa).

### 2.5 Valores-âncora pros testes (TDD — travar o motor)

Venda de **R$ 30.000**, **RBT12 total = R$ 355.000**:

| Atividade | Anexo | Alíquota efetiva | Imposto |
|---|---|---|---|
| Equipamento (loja) | I | 5,6268% | 1.688,03 |
| Instalação | III | 8,5634% | 2.569,01 |
| Comissão (Fator R ≥28%) | III | 8,5634% | 2.569,01 |
| Comissão (Fator R <28%) | V | 16,7324% | 5.019,72 |

Outras âncoras Anexo III (progressivo): 6,0000% @ RBT12 150k → 1.800,00; 9,0900% @ 400k → 2.727,00;
10,9800% @ 700k → 3.294,00; 12,4360% @ 1.000.000 → 3.730,80.

Fator R: `fatorR(100000, 355000)` → 28,17% → III; `fatorR(90000, 355000)` → 25,35% → V.

(Conferências:
Anexo I @355k: (355000×0,073 − 5940)/355000 = 19.975/355.000 = 5,6268% → R$ 1.688,03.
Anexo V @355k: (355000×0,18 − 4500)/355000 = 59.400/355.000 = 16,7324% → R$ 5.019,72.
Anexo III @355k: (355000×0,112 − 9360)/355000 = 30.400/355.000 = 8,5634% → R$ 2.569,01.
Usar tolerância de arredondamento no teste; o valor exato vem do teste, não do spec.)

**Fronteira RBT12 = 0** (empresa nova sem histórico): tratar como faixa 1 do anexo (ou usar a
semente, §5), nunca dividir por zero.

---

## 3. Os dados (migration 046)

Banco: Supabase de produção `kupnsoyymulbdzakqlqc`. Migration entregue em **SQL pro Junior
aplicar manual** (MCP aponta pro projeto errado — ver `reference_supabase_mcp_mismatch`).
Próxima migration livre = **046**. Modelo dirigido por dados (pra revenda futura).

### 3.1 `financeiro_anexos` (referência — as tabelas dos 5 anexos)
- `anexo` text (`I`..`V`), `faixa` int (1–6), `rbt12_min` numeric, `rbt12_max` numeric,
  `nominal` numeric(7,4), `deduzir` numeric(14,2). PK (`anexo`,`faixa`). Seed com a §2.1.
- Vantagem: ajuste de lei/ano = update de dados, não de código; e cada empresa revende com a
  mesma tabela.

### 3.2 `financeiro_atividades` (catálogo configurável — atividade → anexo)
- `id` uuid PK, `nome` text (ex.: "Instalação de sistema solar"), `cnae` text,
  `anexo_padrao` text, `sujeito_fator_r` bool DEFAULT false, `ativo` bool DEFAULT true.
- **Seed inicial da EcoSunPower:**
  - "Instalação / serviço" → CNAE 4321-5/00 → Anexo III, Fator R não.
  - "Equipamento / material (loja)" → CNAE 4742-3/00 (ou 4669-9/99) → Anexo I, Fator R não.
  - "Comissão / repasse distribuidor" → CNAE 7490-1/04 → Anexo V, **Fator R SIM** (vira III se ≥28%).
  - "Projeto / engenharia" (se vier) → Anexo V, Fator R sim. (Opcional, criar quando usar.)
- Reuso/revenda: outra empresa = novas linhas aqui, motor não muda.

### 3.3 `financeiro_receita_mensal` (buckets pro RBT12 rolante)
- `id` uuid PK, `competencia` text `YYYY-MM`, `atividade_id` uuid FK (nullable p/ seed agregado),
  `receita` numeric(14,2) DEFAULT 0, `origem` text (`seed`|`sistema`), `created_at`,`updated_at`.
- UNIQUE (`competencia`,`atividade_id`). RBT12 total de um mês M = soma de TODAS as atividades
  nos 12 buckets anteriores. (Quebra por atividade serve também à tela "receita por serviço".)

### 3.4 `contas_a_receber`
- `id` uuid PK, `fechamento_id` uuid FK→fechamentos, `lead_id` uuid FK→leads,
  `atividade_id` uuid FK→financeiro_atividades (qual anexo essa venda usa),
  `descricao` text, `valor` numeric(14,2),
  `status` text DEFAULT `pendente` CHECK (`pendente`,`recebido_parcial`,`recebido`,`cancelado`),
  `valor_recebido` numeric(14,2) DEFAULT 0, `data_recebimento` date,
  `competencia_recebimento` text `YYYY-MM`,
  `imposto_provisorio` numeric(14,2), `imposto_confirmado` numeric(14,2),
  `anexo_aplicado` text, `aliquota_efetiva` numeric(7,4), `faixa` int,
  `rbt12_no_calculo` numeric(14,2), `fator_r_no_calculo` numeric(5,2),
  `created_at`,`updated_at`,`created_by`.
- Venda do pacotão pode virar **2 linhas** (equipamento Anexo I + instalação Anexo III) — a
  segregação na nota (§4.2).

### 3.5 `financeiro_parametros` (config da empresa — singleton agora, vira por-empresa na revenda)
- `id` int PK DEFAULT 1, `razao_social` text, `cnpj` text,
  `pro_labore_mensal` numeric(14,2), `outras_folhas_mensal` numeric(14,2) DEFAULT 0,
  `dia_alerta_das` int DEFAULT 15, `dia_vencimento_das` int DEFAULT 20,
  `margem_alerta_faixa` numeric(14,2) DEFAULT 20000,
  `fator_r_alerta` numeric(5,2) DEFAULT 30.0, `updated_at`.

---

## 4. Engate na venda (`/fechar` + botões no zap)

### 4.1 No `/fechar`
1. Extrai o **valor da venda** do `dados_snapshot`.
2. Pergunta/infere a **atividade** (instalação? equipamento? comissão?) — botões no zap.
3. Calcula **RBT12 total** + **Fator R** → resolve o anexo → **imposto provisório**.
4. Cria `contas_a_receber` (status `pendente`), guardando anexo/efetiva/faixa/RBT12/FatorR.
5. Mostra no zap: "Venda R$ X (instalação, Anexo III). Quando receber, separe ~R$ Y."

Venda parcelada (financiamento 90×, cartão, PIX 50/50): conta quando a **EcoSunPower recebe**.
No financiamento o banco repassa o valor cheio → "Recebido (total)". PIX 50/50 → dois parciais.

### 4.2 Segregação na nota (pacotão = equipamento + instalação)
Quando a venda é o sistema completo, dá pra separar **equipamento (Anexo I, 4%)** de
**instalação (Anexo III)** — economia legal de imposto. No `/fechar`, botão "Separar
equipamento × instalação" → cria 2 contas a receber com os valores e anexos certos. (Tem que
refletir a realidade — divisão informada pelo Junior, não inventada.)

### 4.3 Botões no WhatsApp (ação = botão, nunca texto livre)
Na conta pendente: **"Recebido (total)" / "Recebido (parcial)" / "Cancelar venda"**.
"Recebido" → soma no bucket do mês corrente (da atividade), recalcula imposto confirmado pelo
anexo resolvido, atualiza RBT12.

### 4.4 Comando rápido `/imposto`
`/imposto 30000` → mostra o imposto **em cada anexo relevante** (comércio I / instalação III /
comissão III-ou-V conforme Fator R atual), com RBT12, faixa e distância do salto. Não grava nada.
Roteamento: `COMMAND_HANDLERS` em `src/index.ts` (~linha 2733).

---

## 5. Semente do RBT12 (começar certo)

- Semear `financeiro_receita_mensal` com o **faturamento 2025 real mês a mês** (assinado pelo
  contador, em `Financeiro/Faturamento-Declarado/`). Total 2025 = R$ 355.091,99. Como ainda não
  há quebra por atividade no histórico, semear como agregado (`atividade_id` null, origem `seed`).
- Junior confirma os meses de 2026 já fechados (jan–mai/2026) ainda fora da relação 2025.
- Daí pra frente o sistema mantém sozinho (cada "Recebido" soma no bucket da atividade).
- Script dedicado `scripts/seed-financeiro-receita.ts`, rodável uma vez.

---

## 6. A tela Financeiro (dashboard dark-neon, padrão cockpit, PT-BR, mobile)

`src/modules/dashboard/`, ECharts CDN. Observabilidade obrigatória.

**Cards grandes:** Faturamento do mês · RBT12 (12m) + medidor de salto de faixa · Imposto a
separar (DAS do mês) · A receber.

**Receita por atividade/anexo:** quanto entrou de equipamento (I), instalação (III), comissão
(III/V) — com a **alíquota efetiva de cada** lado a lado. (É o "qual serviço dá mais dinheiro" +
mostra o peso do imposto por tipo.)

**Bloco Fator R (proteção ativa):** Fator R atual, anexo resultante (III verde / V vermelho),
**pró-labore mínimo do mês pra ficar no Anexo III**, e aviso se estiver perto de 28%.

**Gráficos:** faturamento mês a mês; barra da faixa atual do Anexo (onde está, quanto pro salto).

**Listas:** contas a receber filtráveis (status/período/atividade).

Arquivos: `dashboard/financeiro-queries.ts` (leitura) + `financeiro-views.ts` (HTML) + rota nova.

---

## 7. Alertas no WhatsApp (proativos, com botão)

Infra de alertas proativos existente (cron/scheduled + `criarAlertaPendente`).

1. **DAS — dia 15:** "Separe R$ X pro DAS (vence dia 20)." Impede a multa de R$ 168,94 (dez/2025).
   X = soma dos impostos confirmados do mês.
2. **Salto de faixa:** RBT12 dentro da margem (default R$ 20 mil) de um limite → "a alíquota vai subir".
3. **Fator R — proteção do Anexo V (crítico pro Junior):** quando o Fator R do mês cair abaixo de
   30% (perto de 28%), avisar **e dizer o pró-labore mínimo** pra não escorregar — porque é o que
   segura a comissão do distribuidor no Anexo III (~8,5%) em vez do V (~16,7%).

---

## 8. Fronteiras e isolamento (testável e limpo)

- **`financeiro/imposto.ts`** — matemática pura (anexos, fórmula, Fator R, pró-labore mínimo).
  Não sabe de banco/zap/tela. É o que os testes blindam.
- **`financeiro/anexos.ts`** — carrega as tabelas de referência (de `financeiro_anexos`).
- **`financeiro/atividades.ts`** — catálogo atividade→anexo (de `financeiro_atividades`).
- **`financeiro/receita.ts`** — buckets + RBT12 total.
- **`financeiro/contas-a-receber.ts`** — CRUD + transição de status + cálculo na hora do recebimento.
- **`dashboard/financeiro-*.ts`** — só leitura pra tela.
- **engate `/fechar` + handlers de botão** — orquestram, chamam o motor puro.

Regra de ouro (`project_eva_fix_leitura_conta_e_arquivo_midia`): **a Eva nunca calcula imposto de
cabeça** — sempre chama `financeiro/imposto.ts`.

---

## 9. Generalização pra revenda (o que já deixar pronto vs depois)

**Já nesta fatia (custo baixo, evita retrabalho):** motor company-agnostic; tabelas de anexo e
catálogo de atividades como **dados** (não constantes); config da empresa em `financeiro_parametros`.

**Depois (NÃO agora — YAGNI):** multi-tenant de verdade (login por empresa, isolamento de dados,
billing do SaaS, onboarding). Só desenhamos os dados pra não impedir isso; não construímos a
plataforma de revenda nesta fatia.

---

## 10. Pendências fora do código (confirmar com contador, não bloqueiam)

1. **CNAEs e anexos:** confirmar que instalação (4321-5/00) sai no Anexo III (imóvel pronto, não
   obra nova — senão Anexo IV) e a divisão equipamento (Anexo I) × instalação (III) no pacotão.
2. **Agenciamento (7490-1/04):** confirmado Anexo V / III-por-Fator-R. Mantido como está (o
   distribuidor exige nota nesse CNAE). Proteção = Fator R ≥ 28%.
3. **Valores Anexo I/II/IV/V:** de fonte secundária convergente com a lei; confirmar com contador
   os que vão sair em nota (I e V).
4. **Retenção de ISS na fonte** (cliente PJ): confiança média; fora do v1.
5. **2027 (Reforma):** ponto de revisão. 2026 nada muda no DAS. Res. CGSN 186/2026 regula a opção
   IBS/CBS (janela set/2026, efeito jan–jun/2027).

---

## 11. Critérios de pronto

- [ ] `financeiro/imposto.ts` passa nos testes-âncora (§2.5), todos os 5 anexos, Fator R,
      pró-labore mínimo, fronteira RBT12=0.
- [ ] Migration 046 entregue em SQL e aplicada; 5 tabelas criadas + seeds (anexos + atividades).
- [ ] Seed do RBT12 rodado com faturamento real 2025 + meses 2026 confirmados.
- [ ] `/fechar` cria conta a receber com atividade/anexo + imposto provisório; botão de segregar
      equipamento × instalação funciona.
- [ ] Botões "Recebido (total/parcial)" e "Cancelar" atualizam RBT12 + imposto pelo anexo certo.
- [ ] `/imposto <valor>` mostra o imposto em cada anexo relevante + Fator R + distância do salto.
- [ ] Tela Financeiro no ar (cards, receita por atividade/anexo, Fator R com pró-labore mínimo,
      gráfico mês a mês, lista), PT-BR, mobile.
- [ ] Alertas: DAS dia 15, salto de faixa, Fator R (com pró-labore mínimo) — disparam corretamente.
- [ ] Build marker novo no `/health` (ex.: `FINANCEIRO-NUCLEO-2026-06-07`).
- [ ] Code review antes de commitar lógica nova (regra Junior).

---

## 12. O que vem depois (não é desta fatia)

- **Fatia 3 — Caixa de Entrada Universal:** despesa por foto/PDF/áudio, IA classifica/etiqueta
  PF/PJ/arquiva → destrava "Caixa real", contas a pagar, lucro por obra.
- **Cruzamento nota × depósito** (dinheiro que entrou sem nota).
- **Relatório mensal pro contador.**
- **Folha real mês a mês** (substitui a aproximação pró-labore×12 do Fator R).
- **Multi-tenant / revenda do sistema** (login por empresa, billing).
