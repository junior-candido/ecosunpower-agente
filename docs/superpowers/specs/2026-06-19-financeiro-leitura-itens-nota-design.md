# Leitura de nota fiscal item-a-item para comparação de preços

**Data:** 2026-06-19
**Status:** Aprovado (brainstorming) — aguardando revisão da spec
**Origem:** Junior tentou registrar 2 notas (19/06) para comparar preço de material; o
recurso de comparação (Peça 4 / migration 052) foi pensado para 1 item por texto
("comprei 100m de cabo por R$500"), não para foto de nota com vários itens. Resultado:
o gasto era lançado certo, mas o "material guardado" virava genérico ("material elétrico"
com preço = total da nota) e a tentativa de corrigir por texto após confirmar caía no
cérebro de conversa da Eva e travava (resposta vazia).

## Problema (causa raiz)

O sistema modela uma nota como **1 lançamento com 1 material**. Uma nota fiscal real tem
**N itens**. Os dois pontos quebrados:

1. **Extração:** `extrairDeImagem`/`extrairDePdf` devolvem 1 `ExtracaoLancamento` (o total).
   O campo `material` é único → guarda 1 chute genérico com preço unitário = total. Inútil
   para comparar.
2. **Correção:** depois de confirmado não existe caminho "deixa eu dizer o material". O texto
   ("Curva de 90graus de 1 1/4\" 7.00") não casa com nenhum pendente aguardando, passa pelo
   gate e **escorrega pro cérebro de conversa da Eva** (resposta vazia das 14:10).

## Objetivo

Quando chega foto/PDF de nota do admin:

- Lançar **1 gasto no caixa** = total da nota (não inflar o caixa com N lançamentos).
- Ler a nota **item a item** (material · quantidade · unidade · preço unitário) e guardar
  cada item no banco de preços (`financeiro_materiais_compras`) para comparação.
- **Grifar os itens que a Eva não leu com segurança** (sem preço, nome ilegível, preço
  suspeito) para o Junior conferir/corrigir.
- A Eva **aceita a correção** do Junior — na hora da conferência **e depois** de confirmado.

### Não-objetivos (YAGNI)

- Não lançar cada item como gasto separado no caixa (Junior decidiu: 1 gasto só).
- Não tentar OCR perfeito de toda nota: itens sem preço/nome **ficam de fora** do banco em
  vez de entrar errado.
- Não criar tela/dashboard de itens — tudo pelo zap.

## Decisões de design (do brainstorming)

| # | Pergunta | Decisão |
|---|----------|---------|
| 1 | Caixa: 1 gasto ou N? | **1 gasto** (o total da nota). Itens só pro banco de preços. |
| 2 | Conferência | Mostra **todos** os itens, **grifa só os duvidosos**; Junior corrige os grifados; Eva **aceita** a correção. |
| 3 | Janela de correção | **Na hora e depois** (correção tardia por nome + loja). |

## Arquitetura

Três unidades, cada uma com um propósito claro. Banco **sem migration nova** (a tabela
`financeiro_materiais_compras` já aceita N linhas por `lancamento_id`; o sinal de "problema"
é transitório e vive no `extracao` do pendente).

### Parte 1 — Extração item-a-item (`extrator-lancamento.ts`)

- Novo tipo `ItemNota`:
  ```ts
  interface ItemNota {
    material: string | null;
    quantidade: number | null;   // null = 1
    unidade: string | null;      // un, m, rolo... (default 'un')
    preco_unitario: number | null;
    problema: string | null;     // motivo curto quando a Eva não tem certeza; null = ok
  }
  ```
- `ExtracaoLancamento` ganha `itens: ItemNota[]` (vazio quando não é nota de material).
  Os campos `material`/`quantidade`/`unidade` existentes continuam para o caso **texto de
  1 item** ("comprei 100m de cabo por 500") — esse caminho não muda.
- Novo prompt de mídia para nota: além do total (que continua sendo o `valor` do lançamento),
  pede a lista de itens. Regras de `problema`: marcar quando não conseguir ler o preço, o
  nome estiver ilegível/rasurado, ou o preço destoar (ex.: preço unitário > total).
- `normalizarItem`/parse: validar cada item com as mesmas funções puras (`numeroOuNull`,
  `strOuNull`); item sem nada aproveitável vira `problema` ("não li").

### Parte 2 — Conferência no zap (`caixa-entrada.ts` + `resumo-lancamento.ts`)

- `criarPendenteEFalar`: ao criar o pendente, os `itens` vão dentro do `extracao` (já é
  `jsonb`). O resumo passa a listar os itens:
  - cabeçalho com o gasto total (como hoje),
  - "📦 N itens lidos",
  - **bloco grifado** com os itens que têm `problema` (⚠️ + motivo),
  - resto resumido (✅).
  - Botões: `[Confirmar]` · `[Corrigir]` (já existem). (Sem botão "Ver todos" no MVP —
    o resumo já mostra todos; reavaliar se ficar comprido.)
- **Correção na hora (conserta o bug):** quando o pendente está `aguardando` e tem `itens`,
  o texto do Junior é tratado como **correção de item**. Reusa o padrão já existente do bloco
  "aguardando" (passa o estado atual como contexto pro modelo), mas mandando a **lista de
  itens** como contexto; o modelo devolve os itens atualizados (casa pelo nome/posição:
  "a curva é 7,00", "o item ilegível é cabo 10mm"). Re-mostra o resumo. **Nunca** escorrega
  pro cérebro de conversa.
- Ao **Confirmar** (`handleFinlanButton` caso `conf`): grava o gasto (como hoje) + chama o
  gravador de itens.

### Parte 3 — Gravar e corrigir preços (`materiais.ts`)

- `gravarCompraMaterialSeHouver` (renomear conceito p/ N itens, manter a função-porta):
  - se `extracao.itens` tiver itens → grava **um registro por item** com preço unitário do
    item; `valor_total` do registro = preço unitário × quantidade (linha da nota).
    **Pula** itens com `problema` não resolvido OU sem `material`/`preco_unitario` válidos.
  - senão, mantém o comportamento atual (1 material do campo único — caminho texto).
  - devolve quantos gravou e quantos ficaram de fora, pra mensagem ("📦 Guardei 10 de 12
    preços; 2 ficaram de fora (faltou preço/nome).").
- **Correção tardia (b):** novo caminho detectado por texto tipo "a curva da Itaiaia era 8".
  - parser de intenção "corrigir preço de material" (material + valor; loja opcional).
  - busca registro por `material_norm` (+ loja se citada), o **mais recente**.
  - 1 resultado → mostra "Achei X · loja · data · R$ atual → mudo pra R$ novo? [Sim][Não]".
  - vários → pergunta qual (botões com loja/data).
  - nenhum → "não achei esse material registrado".
  - confirma via botão e faz `update` no `preco_unitario` (e `valor_total` coerente).

## Fluxo de dados

```
Foto/PDF de nota (admin)
  └─ extrairDeImagem/Pdf → 1 ExtracaoLancamento { valor: total, itens: ItemNota[] }
       └─ criarPendenteEFalar → pendente (extracao guarda itens)
            └─ resumo: gasto + itens (grifa os com problema) + [Confirmar][Corrigir]
                 ├─ texto do Junior (aguardando) → corrige itens → re-resumo
                 └─ [Confirmar] → confirma gasto + grava N preços (pula os com problema)
                      └─ "💸 Lançado R$total. 📦 Guardei X de N preços."

Depois (texto): "a curva da Itaiaia era 8"
  └─ parser correção de preço → busca registro → [Sim][Não] → update preco_unitario
```

## Tratamento de erro / invariantes

- Qualquer erro na extração de itens **não pode travar a Eva nem o lançamento do gasto**:
  se a leitura de itens falhar, lança o gasto normalmente e avisa "não consegui ler os itens
  pra comparar preço" (degrada com elegância, igual ao `try/catch` que já existe).
- Item duvidoso **nunca** entra no banco silenciosamente — ou o Junior resolve, ou fica de fora.
- Confirmar é idempotente (o CAS de status já garante). Gravar itens roda **depois** do CAS de
  confirmação; se a gravação de itens falhar, o gasto já está confirmado (faltando itens é
  detectável e recuperável, nunca dinheiro errado) — mesmo princípio do resto da Caixa.
- Correção tardia só altera `financeiro_materiais_compras` (preço pra comparar). **Não** mexe
  no gasto do caixa nem em imposto.

## Testes (alvos)

Funções puras primeiro (TDD):
- `parseLancamentos` com nota: array de itens, item sem preço → `problema`, preço unitário >
  total → `problema`.
- `normalizarItem` de `ItemNota` (campos faltando, unidade default).
- Gravação: N itens viram N linhas; itens com `problema`/sem preço são pulados; contagem
  devolvida (gravados vs fora).
- Conferência: pendente com itens monta resumo grifando os duvidosos.
- Correção na hora: texto atualiza o item certo (por nome/posição) e re-resume.
- Correção tardia: parser detecta "material era X"; busca 1 vs vários vs nenhum; update só no
  preço.

## Fora de escopo desta spec

- Coluna de "confiança" persistida no banco (o `problema` é transitório, no pendente).
- Reabertura de itens já gravados via botão histórico (correção tardia cobre por texto).
