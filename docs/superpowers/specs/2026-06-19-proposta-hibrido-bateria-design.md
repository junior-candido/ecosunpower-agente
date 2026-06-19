# Proposta: suporte a sistema híbrido + bateria

**Data:** 2026-06-19
**Autor:** Junior + Eva (Claude)

## Problema

O gerador de propostas foi feito só pra solar **on-grid puro** (módulos + inversor).
Ao fazer um orçamento híbrido:
1. **Não aparece "sistema híbrido"** — o tipo é coletado em `tipoCliente`
   (`src/modules/proposal/template.ts:31`) mas o template nunca olha pra ele; não
   há nenhum lugar que escreva "Sistema Híbrido".
2. **A bateria some por completo** — não existe campo de bateria em lugar nenhum:
   nem na coleta (Eva), nem nos dados salvos (`ProposalData` em
   `template.ts:15–75`), nem no render, nem no cálculo. O que o Junior digita
   sobre a bateria cai no vazio.
3. **Sem benefícios de híbrido** — nada de backup, autonomia, independência.

Causa raiz: bateria e híbrido nunca foram construídos.

## Decisões (do brainstorm)

- **A bateria define o híbrido** (Caminho 1): se a proposta tem bateria, é
  híbrida. Sem campo "tipo de sistema" separado — evita inconsistência (híbrido
  sem bateria). `tipoCliente` (residencial/comercial) fica intocado.
- **Campos da bateria:** fabricante, modelo, capacidade (kWh por unidade),
  quantidade, garantia (anos). Sem preço separado (entra no valor total do kit).
- **Benefícios nível (a):** texto (backup na falta de luz, usa solar à noite,
  mais independência) + **autonomia de backup** (horas). **NÃO** mexe em
  economia/payback — os números que o cliente vê continuam iguais ao on-grid.
- Sem bateria → proposta **idêntica** à de hoje (on-grid intacto). Mesma
  filosofia dos campos opcionais já existentes (`servicos?`, `estruturaFixacao?`).

## Arquitetura / unidades

### 1. Dado da bateria — `ProposalData.bateria?`
`src/modules/proposal/template.ts`, na interface `ProposalData` (junto de
`modulo`/`inversor`):

```ts
  bateria?: { fabricante: string; modelo: string; capacidadeKwh: number; quantidade: number; garantia: number; fichaOverride?: string };
```

Opcional. Ausência = on-grid. Segue o shape de `inversor` (com `fichaOverride`
opcional, mesmo padrão).

### 2. Cálculo de autonomia — função pura nova
Arquivo novo pequeno e testável: `src/modules/proposal/bateria.ts`.

```ts
export interface Bateria { fabricante: string; modelo: string; capacidadeKwh: number; quantidade: number; garantia: number; }

export const DOD_UTIL = 0.9; // bateria não descarrega 100%

export function capacidadeTotalKwh(b: Pick<Bateria,'capacidadeKwh'|'quantidade'>): number;
// = capacidadeKwh * quantidade

export function autonomiaBackupHoras(b: Pick<Bateria,'capacidadeKwh'|'quantidade'>, consumoMensalKwh: number): number | null;
// energiaUtil = capacidadeTotal * DOD_UTIL
// consumoMedioKw = consumoMensalKwh / 30 / 24
// horas = energiaUtil / consumoMedioKw  (arredonda; null se consumo<=0)
```

`consumoMensalKwh` no render = média de `calc.consumoMensalDistribuido`
(soma/12), já disponível em `renderProposalHTML` (`template.ts:150`,
usado em `:420`).

### 3. Render — `template.ts`
Tudo condicionado a `data.bateria` presente (sem bateria, nada muda):
- **Selo "Sistema Híbrido (Solar + Bateria)"** perto do topo / descrição
  (hoje a linha genérica é `template.ts:407` / hero `:321–331`). Quando há
  bateria, exibir o selo; senão, comportamento atual.
- **Card da bateria** na seção de equipamentos, logo após o inversor
  (`template.ts:~434–456`): `formataNomeEquipamento(fabricante, modelo)`,
  capacidade total (`capacidadeTotalKwh` kWh, com "(qtd× kWh)" se quantidade>1),
  garantia. Mesmo componente visual `equipment-card` dos outros.
- **Bloco "Benefícios do Híbrido"** (novo, só com bateria): bullets fixos
  (backup na falta de luz · usa o solar à noite · mais independência da rede)
  + linha de autonomia: `"~{horas}h de autonomia no seu consumo médio (com só
  os essenciais, dura bem mais)"`. Se `autonomiaBackupHoras` devolver null
  (sem consumo), omite só a linha de autonomia, mantém os bullets.

### 4. Coleta (Eva) — `proposal-assistant.ts`
- Adicionar `bateria` ao schema JSON que o Claude devolve (junto de
  `modulo`/`inversor`), opcional (`proposal-assistant.ts:451` é o `data`).
- No system prompt (`:376–556`): instruir a captar a bateria quando o Junior
  mencionar (marca/modelo/kWh/quantidade/garantia) e a entender que bateria =
  híbrido. Não inventar bateria quando não houver.
- Garantir que `bateria` é persistida no `dados_input` (reabrir/ajustar
  preserva) e passada ao montar `ProposalData` na geração.

### 5. Cálculo financeiro — SEM MUDANÇA
`calculator.ts` (`calcular()` `:217`, `calcularContaMensal()` `:152–171`) não
muda. Economia/payback/Fio B ficam idênticos. (Decisão (a) do brainstorm.)

## Fluxo de dados

Junior conversa → Eva extrai `bateria` no JSON → salvo em `dados_input` →
geração monta `ProposalData.bateria` → `renderProposalHTML` mostra selo + card +
benefícios + autonomia (via `bateria.ts`). PDF usa o mesmo HTML, então sai igual.

## Tratamento de erros

- `bateria` ausente → todos os blocos novos são pulados; proposta on-grid
  idêntica (regressão coberta por teste).
- `capacidadeKwh`/`quantidade` inválidos (≤0) → `capacidadeTotalKwh` retorna o
  que der; `autonomiaBackupHoras` retorna null se não dá pra calcular → omite a
  linha de autonomia, sem quebrar o render.
- Eva não deve criar `bateria` sem o Junior informar (evita híbrido fantasma).

## Testes

- `bateria.ts` (puro): `capacidadeTotalKwh` (1 e N unidades);
  `autonomiaBackupHoras` (caso normal, consumo 0 → null, DoD aplicado).
- Render: com `bateria` → HTML contém selo "Híbrido", card da bateria
  (marca/modelo/capacidade/garantia) e bloco de benefícios com a autonomia.
- Regressão: sem `bateria` → HTML **não** contém "Híbrido"/"bateria" e a seção
  de equipamentos fica igual à de hoje (on-grid intacto).
- Coleta: o schema do `proposal-assistant` aceita `bateria` e a extração
  estrutura os campos (teste leve, se houver padrão de teste pro extrator).

## Fora de escopo

- Recalcular economia/payback/Fio B pro híbrido (Junior escolheu não mexer).
- Off-grid (sem rede) — só on-grid e híbrido por ora.
- Preço separado da bateria / tabela de custo interno.
- Dimensionar a bateria automaticamente (Junior informa o que vendeu).
