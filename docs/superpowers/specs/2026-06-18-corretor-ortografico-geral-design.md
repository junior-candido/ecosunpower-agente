# Corretor Ortográfico Geral da Eva — Design

> Spec de design. Junior pediu 18/06/2026: "corretor ortográfico geral na Eva — mesmo
> que eu escreva errado, ela transcreve correto, sem erros de português." Cobertura GERAL
> (todos os aspectos). Construção amanhã, com o Junior validando.

## Objetivo

Quando o **Junior** escreve um texto livre que vira saída (proposta do cliente, mensagem,
case, depoimento, contrato), o português sai **correto** — acento, ortografia, pontuação,
concordância — mesmo que ele tenha digitado errado/sem acento/com pressa.

A Eva (IA) já escreve certo nas mensagens dela; o problema é o **texto cru do Junior** que
passa adiante. O corretor age nesse texto.

## A REGRA DE OURO (o que torna isto seguro)

O corretor corrige **só o português**. **NUNCA** muda:
- números, valores em R$, potências (kWp), datas, percentuais, UC, CPF/CNPJ;
- nomes próprios, marcas (Trina, Sungrow…), modelos de equipamento;
- o **sentido** do texto (não reescreve, não resume, não "melhora", não complementa).

Na dúvida, **mantém o original**. Num lugar como proposta/contrato, trocar um número seria
grave — então a regra de ouro tem DUAS camadas: (1) instrução forte no prompt e (2) uma
**checagem determinística** depois (rede de segurança), descrita abaixo.

## Componente central: `corrigirOrtografia`

Arquivo novo: `src/modules/corretor-ortografico.ts`.

```
corrigirOrtografia(texto: string, opts?: { conservador?: boolean }): Promise<string>
```

Fluxo:
1. **Guards de entrada:** se `texto` vazio, só espaços, ou muito curto (< 3 chars) →
   devolve o original (nada a corrigir). Se muito longo (> ~4000 chars) → devolve original
   (evita custo/latência; texto gigante não é o caso de uso).
2. **Chamada IA (Haiku):** system prompt estrito — "Corrija APENAS ortografia, acentuação,
   pontuação e concordância do texto do usuário. NÃO altere números, valores, datas, nomes
   próprios, marcas, nem o sentido. NÃO reescreva, não resuma, não acrescente. Devolva só o
   texto corrigido, sem comentários, sem aspas." `temperature: 0`, `max_tokens` ~ proporcional.
3. **Rede de segurança determinística (pós-IA):** antes de aceitar a correção, compara
   original × corrigido:
   - **Números preservados:** extrai a sequência de todos os números (dígitos, valores,
     percentuais) do original e do corrigido. Se diferirem → **descarta** a correção,
     devolve o ORIGINAL.
   - **Tamanho sensato:** se o corrigido encolher/crescer demais (ex.: > 35% de diferença
     de comprimento) → descarta (provável reescrita/remoção). Devolve original.
   - **Não-vazio:** se o corrigido vier vazio → original.
4. **Erro de API / timeout:** try/catch → devolve o ORIGINAL. O corretor **nunca bloqueia**
   nem quebra o fluxo; pior caso = texto sai como o Junior digitou (igual hoje).
5. **`conservador: true`** (contratos): prompt extra-restrito — "corrija SOMENTE erros de
   digitação/acentuação inequívocos; na menor dúvida, mantenha idêntico." Mesma rede de
   segurança.

Observabilidade: loga quando corrigiu (e o quê, em nível debug) e quando descartou pela rede
de segurança — pro Junior auditar se algum dia algo escapar.

## Onde ligar (ordem de construção)

Construir incremental, validando a cada etapa antes de expandir:

| Ordem | Lugar | Texto do Junior | Modo |
|---|---|---|---|
| 1 | **Proposta** | observações/textos livres que ele dita e o cliente vê | normal |
| 2 | **Mensagens pro cliente** | quando o Junior dita algo pra Eva enviar | normal |
| 3 | **Cases / depoimentos** | descrição da obra (`/novo-case`), texto de depoimento | normal |
| 4 | **Contrato/procuração** | `disposicoes_especiais` ditadas | **conservador** + confirma |

**Etapa 1 (proposta)** é a mais valiosa (mais visível pro cliente) e a primeira a validar.

**Etapa 4 (contrato)** respeita a regra existente "texto jurídico vai LITERAL": roda em modo
`conservador` (só erro de digitação óbvio, jamais muda sentido) E, por segurança, mostra ao
Junior o texto corrigido pra ele **confirmar** antes de entrar no documento. Assim o controle
final continua sendo dele.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `src/modules/corretor-ortografico.ts` | NOVO — `corrigirOrtografia` + rede de segurança (função pura testável p/ a checagem de números) |
| `src/modules/proposal-assistant.ts` (ou onde o texto livre da proposta é montado) | chama `corrigirOrtografia` no texto ditado |
| `src/index.ts` | injeta o cliente Anthropic no corretor; liga nas mensagens pro cliente |
| `src/modules/case-creator-assistant.ts` | corrige `descrição`/depoimento |
| fluxo de fechamento (`disposicoes_especiais`) | modo conservador + confirmação |

## Testes

- `corrigirOrtografia`: corrige "vc nao tem direito" → "Você não tem direito"; acentos.
- **Rede de segurança (a parte crítica, função pura):**
  - número mudou (IA devolveu "32.500" pra um "32.000") → devolve ORIGINAL.
  - "8,4 kWp", "R$ 32.000,00", "UC 123456", "60%" preservados intactos.
  - corrigido muito menor/maior → devolve original.
  - vazio/erro → devolve original.
- Modo conservador: muda menos (smoke).

## Decisões / não-escopo (YAGNI)

- **Só DAQUI PRA FRENTE (forward-only):** o corretor age no momento em que o Junior digita o
  texto novo. **Não** corrige retroativamente nada já salvo — propostas, contratos e cases
  existentes ficam como estão. Sem batch/migração de dados antigos. (Confirmado Junior 18/06:
  "o que está para trás está ok".)
- **Modelo:** Haiku (barato, rápido) — tarefa simples, `temperature: 0`.
- **Não** corrige texto do CLIENTE (só o do Junior) — o cliente pode escrever como quiser; a
  Eva entende.
- **Não** vira um "revisor de estilo" — só ortografia/gramática, não reescreve.
- Mensagens da própria Eva (geradas por IA) **não** passam pelo corretor (já saem certas) —
  evita custo dobrado.

## Risco e mitigação (resumo)

Risco único real: o corretor mudar algo que não devia (número/nome/sentido). Mitigação em
camadas: prompt estrito + `temperature 0` + **rede de segurança determinística que protege
números e descarta reescritas** + modo conservador + confirmação no contrato + degradação
segura (erro → texto original). Validação humana (Junior) a cada etapa antes de expandir.
