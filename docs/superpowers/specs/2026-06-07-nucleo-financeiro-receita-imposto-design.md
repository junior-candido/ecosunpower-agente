# Spec — Núcleo Financeiro (Fatia 2, lado Receita + Imposto)

> Departamento Financeiro EcoSunPower — Fase 1, Fatia 2.
> Brainstorm + design aprovados por Junior em 07/06/2026.
> Linguagem simples de propósito (Junior lê e aprova). Detalhe técnico nas seções marcadas.
> Pesquisa fiscal de base: `Documents/EcoSunPower/Financeiro/IMPOSTO-METODO-Simples-Anexo-III.md`
> (re-verificada por deep-research em 07/06: 6/6 pontos CONFIRMADOS, zero correções).
> Plano-mãe: `Documents/EcoSunPower/Financeiro/PLANO-Departamento-Financeiro.md`.

---

## 1. O que a gente quer (e o que NÃO entra)

Construir o **coração financeiro da EcoSunPower no lado da receita**: toda venda fechada
vira conta a receber, e quando o cliente paga ela vira faturamento do mês, com o
**imposto progressivo** (Simples Nacional, Anexo III) calculado certo e acumulado no RBT12.
Mais a **tela Financeiro** (dark-neon, igual o cockpit) e os **alertas no WhatsApp** que
impedem multa e avisam de risco fiscal.

**O fio único (nada solto):**
```
/fechar venda → Conta a Receber (pendente) → Junior clica "Recebido" no zap
  → vira faturamento do mês → imposto progressivo recalculado → entra no RBT12
```
Fechar o contrato NÃO é receita ainda; só o "Recebido" liga o dinheiro — o que bate com o
dinheiro real e com a nota que o contador declara (regime de caixa).

**FORA desta fatia (vai pra Fatia 3 — Caixa de Entrada Universal):**
- Despesa / dinheiro que SAI (gasolina, painel, conta de luz).
- "Caixa real" (entradas − saídas), contas a pagar.
- IA lendo foto/PDF/áudio de boleto/comprovante, etiqueta PF/PJ automática.

Decisão de escopo (Junior 07/06): **lado receita 100% agora; despesa fica inteira pra Fatia 3**,
pra entregar o fiscal sem ficar pela metade.

---

## 2. O motor de imposto (núcleo isolado e testado)

Módulo puro, sem banco nem rede, fácil de testar e de raciocinar:
`src/modules/financeiro/imposto.ts`.

### 2.1 Tabelas (dados, nunca chumbadas num número)

**Anexo III — Simples Nacional (vigente 2026, LC 123/2006, confirmado):**

| Faixa | RBT12 (R$) | Alíquota nominal | Parcela a deduzir (R$) |
|---|---|---|---|
| 1 | 0 – 180.000,00 | 6,00% | 0 |
| 2 | 180.000,01 – 360.000,00 | 11,20% | 9.360 |
| 3 | 360.000,01 – 720.000,00 | 13,50% | 17.640 |
| 4 | 720.000,01 – 1.800.000,00 | 16,00% | 35.640 |
| 5 | 1.800.000,01 – 3.600.000,00 | 21,00% | 125.640 |
| 6 | 3.600.000,01 – 4.800.000,00 | 33,00% | 648.000 |

**Anexo V (só pra comparação do Fator R; vai pro Anexo V quem tem Fator R < 28%):**
1ª faixa = 15,50% nominal, R$ 0 a deduzir (efetiva = nominal na 1ª faixa). As demais faixas
do Anexo V podem ser adicionadas depois; pro alerta de Fator R basta saber que cair no V
encarece (de ~8,5% pra ~15,5%+).

### 2.2 Fórmula oficial (Art. 18 §1º-A da LC 123/2006)

```
alíquota_efetiva = (RBT12 × alíquota_nominal − parcela_a_deduzir) ÷ RBT12
imposto_da_venda = valor_da_venda × alíquota_efetiva
```
Onde **RBT12 = receita bruta acumulada nos 12 meses anteriores**. A alíquota efetiva é
SEMPRE menor que a nominal (porque desconta a parcela a deduzir) e **sobe conforme o RBT12
cresce e cruza faixas** — é o imposto progressivo.

### 2.3 Funções públicas do módulo

- `faixaPorRBT12(rbt12: number): FaixaAnexoIII` — qual faixa o RBT12 cai.
- `aliquotaEfetiva(rbt12: number): { faixa, nominal, deduzir, efetiva }`.
- `impostoDaVenda(valor: number, rbt12: number): { imposto, efetiva, faixa }`.
- `fatorR(folha12: number, receita12: number): { ratio, anexo: 'III' | 'V' }`.
- `proximoSalto(rbt12: number): { limite, distancia } | null` — quanto falta pro próximo
  limite de faixa (null se já na 6ª).

### 2.4 Valores-âncora pros testes (TDD — travar o motor)

| RBT12 | Faixa | Alíquota efetiva esperada | Imposto numa venda de R$ 30.000 |
|---|---|---|---|
| 150.000 | 1 | 6,0000% | 1.800,00 |
| 355.000 | 2 | 8,5634% | 2.569,01 |
| 400.000 | 3 | 9,0900% | 2.727,00 |
| 700.000 | 3 | 10,9800% | 3.294,00 |
| 1.000.000 | 4 | 12,4360% | 3.730,80 |

(Conferências:
355.000 → (355000×0,112 − 9360)/355000 = 30.400/355.000 = 8,5634% → ×30000 = R$ 2.569,01.
700.000 → (700000×0,135 − 17640)/700000 = 76.860/700.000 = 10,9800% → ×30000 = R$ 3.294,00.
Usar tolerância de arredondamento no teste; o valor exato vem do teste, não do spec.)

Fator R: `fatorR(100000, 355000)` → ratio 28,17% → Anexo III; `fatorR(90000, 355000)`
→ 25,35% → Anexo V.

**Nota fiscal de fronteira:** se o RBT12 ainda é zero (empresa sem 12 meses de histórico),
a fórmula divide por zero — tratar como faixa 1 / efetiva 6% (ou usar a semente, ver §5).

---

## 3. Os dados (migration 046)

Banco: Supabase de produção `kupnsoyymulbdzakqlqc`. A migration é entregue em **SQL pro
Junior aplicar manual** no SQL Editor (o MCP do Supabase aponta pro projeto errado —
ver memória `reference_supabase_mcp_mismatch`). Próxima migration livre = **046**.

### 3.1 `financeiro_receita_mensal`
Receita realizada por mês (bucket), base do RBT12 rolante.
- `id` uuid PK
- `competencia` text — `YYYY-MM` (UNIQUE)
- `receita` numeric(14,2) NOT NULL DEFAULT 0
- `origem` text — `'seed'` (semeado do faturamento 2025) ou `'sistema'` (acumulado por vendas)
- `created_at`, `updated_at` timestamptz

RBT12 num mês M = soma das receitas dos 12 buckets anteriores a M.

### 3.2 `contas_a_receber`
Uma linha por venda fechada.
- `id` uuid PK
- `fechamento_id` uuid REFERENCES fechamentos(id) ON DELETE SET NULL
- `lead_id` uuid REFERENCES leads(id) ON DELETE SET NULL
- `descricao` text — cliente / serviço (pra tela)
- `valor` numeric(14,2) NOT NULL
- `status` text NOT NULL DEFAULT `'pendente'`
  CHECK (`'pendente'`, `'recebido_parcial'`, `'recebido'`, `'cancelado'`)
- `valor_recebido` numeric(14,2) NOT NULL DEFAULT 0
- `data_recebimento` date
- `competencia_recebimento` text — `YYYY-MM` em que entrou (alimenta o bucket)
- `imposto_provisorio` numeric(14,2) — calculado no /fechar (RBT12 do momento)
- `imposto_confirmado` numeric(14,2) — recalculado no "Recebido"
- `aliquota_efetiva` numeric(7,4) — registrada no momento do recebimento (rastreabilidade)
- `faixa` int — faixa do Anexo III no momento
- `rbt12_no_calculo` numeric(14,2) — RBT12 usado (auditável)
- `created_at`, `updated_at`, `created_by` (telefone admin)

### 3.3 `financeiro_parametros`
Singleton (1 linha) com a configuração da empresa.
- `id` int PK DEFAULT 1 CHECK (id = 1)
- `pro_labore_mensal` numeric(14,2) — folha mensal pro Fator R (Junior informa uma vez)
- `anexo_padrao` text DEFAULT `'III'`
- `dia_alerta_das` int DEFAULT 15
- `limite_faixa_alerta` numeric(14,2) DEFAULT 360000 — alerta quando RBT12 chega perto
- `margem_alerta_faixa` numeric(14,2) DEFAULT 20000 — "perto" = dentro disso
- `fator_r_alerta` numeric(5,2) DEFAULT 30.0 — alerta quando Fator R cai abaixo disso
- `updated_at`

Folha pro Fator R: v1 usa o pró-labore mensal × 12 como folha12 (aproximação combinada com
Junior). Se virar folha real mês a mês depois, troca por uma tabela própria.

---

## 4. Engate na venda (`/fechar` + botões no zap)

### 4.1 No `/fechar`
Depois que o fechamento é gravado (tabela `fechamentos`), o sistema:
1. Extrai o **valor da venda** do `dados_snapshot` (já existe lá).
2. Calcula o **RBT12 atual** (soma dos buckets).
3. Calcula o **imposto provisório** (`impostoDaVenda`).
4. Cria a linha em `contas_a_receber` com status `pendente`.
5. Mostra pro Junior no zap: "Venda R$ X registrada. Quando receber, separe ~R$ Y de imposto."

Venda parcelada (financiamento 90×, cartão, PIX 50/50): o que importa pro imposto é **quando
a EcoSunPower recebe o dinheiro**. No financiamento o banco repassa o valor cheio à empresa —
então "Recebido (total)" na entrada do dinheiro. PIX 50/50 usa "Recebido (parcial)" duas vezes.

### 4.2 Botões no WhatsApp (regra Junior: ação = botão, nunca texto livre)
Na conta a receber pendente:
- **"Recebido (total)"** → status `recebido`, `valor_recebido = valor`, soma no bucket do mês
  corrente, recalcula imposto confirmado, atualiza RBT12.
- **"Recebido (parcial)"** → pede o valor (ou usa metade), status `recebido_parcial`, soma a
  parcela no bucket; quando completar, vira `recebido`.
- **"Cancelar venda"** → status `cancelado` (não conta receita nem imposto).

### 4.3 Comando rápido `/imposto`
`/imposto 30000` → responde na hora: RBT12 atual, faixa, alíquota efetiva, imposto a separar,
e quanto falta pro próximo salto de faixa. Não cria nada no banco — é calculadora.

Roteamento: objeto `COMMAND_HANDLERS` em `src/index.ts` (~linha 2733).

---

## 5. Semente do RBT12 (começar certo)

O sistema começa sem 12 meses de histórico. Solução:
- Semear `financeiro_receita_mensal` com o **faturamento 2025 real mês a mês**, assinado pelo
  contador (arquivado em `Financeiro/Faturamento-Declarado/`). Total 2025 = R$ 355.091,99.
- Junior confirma/informa os meses de 2026 já fechados (jan–mai/2026) que ainda não estavam
  na relação 2025.
- Daí pra frente o sistema mantém sozinho (cada "Recebido" soma no bucket do mês).
- Script de seed dedicado (`scripts/seed-financeiro-receita.ts`) com os valores, rodável uma vez.

---

## 6. A tela Financeiro (dashboard)

Padrão visual do cockpit (`src/modules/dashboard/`, ECharts CDN, dark-neon HUD, PT-BR, mobile).
Segue a regra de observabilidade obrigatória.

**Cards grandes (bater o olho e entender em 2s):**
- **Faturamento do mês** (R$ recebido na competência atual).
- **RBT12** (receita dos últimos 12 meses) + medidor de **quão perto do salto de R$ 360 mil**.
- **Imposto a separar** (soma dos impostos confirmados ainda não pagos no DAS do mês).
- **A receber** (soma das contas pendentes/parciais).

**Gráficos:**
- Faturamento mês a mês (barras, 12 meses).
- Barra/medidor de faixa atual do Anexo III (onde está, quanto falta pro próximo salto).

**Listas:**
- Contas a receber, filtrável por status (pendente/recebido/cancelado) e período.
- Cada conta mostra: cliente, valor, status, imposto.

**Bloco Fator R:**
- Fator R atual (folha12 ÷ receita12), com o anexo resultante (III verde / V vermelho) e
  aviso se estiver perto de 28%.

Arquivos no padrão do cockpit: `financeiro-queries.ts` (lê do banco) + `financeiro-views.ts`
(monta o HTML), rota nova no dashboard.

---

## 7. Alertas no WhatsApp (proativos)

Usar a infra de alertas proativos que já existe (cron/scheduled + `criarAlertaPendente`).
Todo alerta com botão quando pedir ação.

1. **DAS — dia 15 de cada mês:** "Separe R$ X pro DAS (vence dia 20). Já separou?" — impede a
   multa de R$ 168,94 que aconteceu em dez/2025. Valor = imposto confirmado do mês de competência.
2. **Salto de faixa:** quando RBT12 entra na margem (default: dentro de R$ 20 mil do limite de
   R$ 360 mil) → "Atenção: você está chegando no salto de faixa, a alíquota vai subir de ~8,5%."
3. **Fator R:** quando o Fator R cair abaixo de 30% (perto dos 28% fatídicos) → "Risco de cair
   no Anexo V (imposto dobra). Confira o pró-labore."

---

## 8. Fronteiras e isolamento (pra ficar testável e limpo)

- **`financeiro/imposto.ts`** — matemática pura. Não sabe de banco, zap nem tela. Entradas e
  saídas são números. É o que os testes blindam.
- **`financeiro/receita.ts`** (ou repo) — lê/escreve `financeiro_receita_mensal` e calcula RBT12.
- **`financeiro/contas-a-receber.ts`** — CRUD das contas + transição de status.
- **`dashboard/financeiro-queries.ts` / `financeiro-views.ts`** — só leitura pra montar a tela.
- **engate no `/fechar`** e **handlers de botão** — orquestram, mas chamam o motor puro pra contas.

Regra de ouro (memória `project_eva_fix_leitura_conta_e_arquivo_midia`): **a Eva nunca calcula
imposto de cabeça** — sempre chama `financeiro/imposto.ts`.

---

## 9. Pendências fora do código (confirmar com contador, não bloqueiam)

1. **CNAE da EcoSunPower:** a engenharia/projeto solar é **inciso III** (Anexo III por natureza,
   sem risco de Fator R) ou **inciso V** (sujeito a Fator R)? O motor calcula o Fator R de
   qualquer jeito e alerta — então o sistema está coberto seja qual for. Mas saber isso tira/põe
   o peso do alerta de Fator R.
2. **Retenção de ISS na fonte** (cliente PJ): confiança média na verificação. Não é o caso comum
   (venda pra pessoa física). Confirmar art. 21 §4º da LC 123/2006 antes de tratar isso. Fora do v1.
3. **2027 (Reforma):** marcar como ponto de revisão. Em 2026 nada muda no DAS. Resolução CGSN
   186/2026 regula a opção pelo regime regular de IBS/CBS (janela set/2026, efeito jan–jun/2027).

---

## 10. Critérios de pronto (o que tem que funcionar)

- [ ] `financeiro/imposto.ts` passa nos testes-âncora (§2.4), incluindo a fronteira RBT12=0.
- [ ] Migration 046 entregue em SQL e aplicada; 3 tabelas criadas.
- [ ] Seed do RBT12 rodado com o faturamento real 2025 + meses 2026 confirmados.
- [ ] `/fechar` cria a conta a receber com imposto provisório.
- [ ] Botões "Recebido (total/parcial)" e "Cancelar" funcionam e atualizam RBT12 + imposto.
- [ ] `/imposto <valor>` responde com faixa, alíquota efetiva, imposto e distância do salto.
- [ ] Tela Financeiro no ar (cards, gráfico mês a mês, lista de contas, faixa, Fator R), PT-BR, mobile.
- [ ] Alertas: DAS dia 15, salto de faixa, Fator R — disparam corretamente.
- [ ] Build marker novo no `/health` pra confirmar o deploy (ex.: `FINANCEIRO-NUCLEO-2026-06-07`).
- [ ] Code review (regra Junior: review antes de commitar lógica nova).

---

## 11. O que vem depois (não é desta fatia)

- **Fatia 3 — Caixa de Entrada Universal:** despesa por foto/PDF/áudio, IA lê/classifica/etiqueta
  PF/PJ/arquiva → destrava "Caixa real", contas a pagar, lucro por obra.
- **Cruzamento nota × depósito** (achar dinheiro que entrou sem nota).
- **Relatório mensal pronto pro contador.**
- **Folha real mês a mês** (substitui a aproximação do Fator R).
