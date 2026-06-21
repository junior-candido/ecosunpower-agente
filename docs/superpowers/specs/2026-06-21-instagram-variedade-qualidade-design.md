# Instagram: variedade + qualidade dos posts (conserto do "drift")

Data: 2026-06-21
Branch: `feat/instagram-variedade-qualidade`
Módulo: marketing (geração de posts seg/qui)

## Problema

Os posts automáticos de Instagram/Facebook saem repetitivos — imagens com quase a
mesma cara e legendas de temas/ângulos parecidos. Junior quer os posts **variados e
com qualidade** pra publicar com confiança. Quatro incômodos confirmados com ele:

1. **Repetitivos / mesma cara** (imagem e tema se repetem)
2. **Imagem com cara de IA / fake** (falta realismo fotográfico)
3. **Texto/legenda fraco** (copy rasa, pouco persuasiva)
4. **Às vezes fora da marca** (tom/estilo não bate com EcoSunPower / público de Brasília)

## Diagnóstico (validado no código atual, 2026-06-21)

- **Imagem repete — causa 1:** a trava anti-repetição de cena vive só em memória
  (`marketing.ts` `private lastSceneKey`). O app reinicia entre segunda→quinta e
  **esquece** → repete a cena. O blog não tem esse problema porque consulta o banco.
- **Imagem repete — causa 2:** toda cena divide o mesmo miolo (`PAINEIS` + sufixo de
  qualidade `Q` = "...8k") e só **5 variações de luz** (`solar-scenes.ts` `VARIACOES`).
  Mesmo trocando a cena, a "cara" continua parecida. O sufixo "8k ultra sharp" também
  puxa a imagem pro território "render de IA".
- **Texto repete — causa 3:** o agendador chama `generateDraft(undefined, asVideo)` e o
  prompt do usuário só diz "escolha um dos tipos disponíveis" **sem mostrar os posts
  anteriores** → o Claude repete tema/ângulo. O blog faz certo: carrega os últimos ~20
  drafts (`blog-generator.ts` `getRecentPublishedDrafts`) e manda evitar repetir.
- **Sem memória no banco:** a tabela `marketing_drafts` **nem tem** coluna pra `topic_type`
  nem pra `scene_key` — então hoje é impossível olhar o histórico real.
- **Modelo da legenda:** hoje é `claude-haiku-4-5` — barato porém raso. O blog e os demais
  geradores fortes do repo usam `claude-opus-4-7`.

## Decisões fechadas com o Junior

- Modelo da legenda: **subir Haiku → `claude-opus-4-7`** (volume ~3 posts/semana, custo
  irrelevante; mesma convenção do resto do repo).
- Janela de anti-repetição: **não repetir cena nem tipo dos últimos 3 posts**.

## Design

Forward-only. Mexe só no módulo de marketing + 1 migration leve. Não toca em Eva,
proposta nem financeiro.

### 1. Migration `054_marketing_historico.sql` — memória no banco

```sql
alter table marketing_drafts
  add column if not exists topic_type text,
  add column if not exists scene_key text;
```

Sem índice novo (a leitura usa o `idx_marketing_drafts_created` já existente).

### 2. Gravar topic_type + scene_key em cada geração

`generateDraft` passa a:
- gravar `topic_type` = o tipo que o Claude escolheu (`parsed.topic_type`);
- gravar `scene_key` = a cena visual que o Higgsfield usou (hoje só vive na variável local).

Pra isso, `generateSolarImage` precisa **devolver** a `scene_key` usada (hoje ela só
seta `this.lastSceneKey` e descarta). Ajuste de retorno: `{ bytes, contentType, sceneKey? }`.
Em post de vídeo (caminho FLUX 9:16) não há cena → `scene_key` fica `null`.

### 3. Anti-repetição pelo banco (mata "mesma cara" mesmo com restart)

Novo método `getRecentDrafts(limit)` em `MarketingService`, espelhando o do blog: lê
`marketing_drafts` ordenado por `created_at desc`, retornando `topic`, `topic_type`,
`scene_key`, `caption`. Falha/silêncio não bloqueia geração (`.catch(() => [])`).

No início de `generateDraft`:
- carregar os últimos ~15 drafts;
- `recentSceneKeys` = scene_key dos **últimos 3** (não-nulos);
- `recentTopicTypes` = topic_type dos **últimos 3** (não-nulos).

`pickScene` ganha uma assinatura nova que aceita uma **lista** de chaves a excluir
(em vez de só `lastKey`): `pickScene(excludeKeys: string[], rng?)`. Mantém o fallback:
se a exclusão esvaziar o pool (≤3 cenas sobrando sempre dá ≥7), usa o pool cheio.
O `this.lastSceneKey` em memória continua existindo só como reforço dentro do mesmo
processo (ex.: cliques seguidos em "Gerar outra imagem"), mas a fonte de verdade vira
o banco.

Seleção de **tipo**: quando o agendador chama sem `preferredType`, o serviço escolhe um
`topic_type` que **não** esteja em `recentTopicTypes` e injeta como preferência. (Mantém o
comportamento de respeitar `preferredType` quando o Junior pede um tipo específico.)

### 4. Histórico pro Claude (mata texto repetitivo)

O `userPrompt` passa a incluir um bloco com os últimos ~15 posts (tema + tipo), no
mesmo espírito do blog:

```
Posts recentes (NÃO repita tema nem ângulo destes — varie de verdade):
1. "Mito: solar não vale a pena" (objecao_desmistificada, 2026-06-19)
2. ...
```

Com instrução explícita: variar **tema E ângulo**, não só trocar palavras.

### 5. Mais variedade + realismo visual (cara de IA / mesmice)

Em `solar-scenes.ts`:
- **Novo eixo de composição/estética** ortogonal às cenas (seguro em qualquer cena, sem
  conflitar com enquadramento embutido como "vista aérea"/"close"):
  ex. `documentary photography`, `architectural photography`, `editorial magazine look`,
  `shot on full-frame DSLR with shallow depth of field`, `natural candid framing`.
- **Sufixo `Q` repensado pra realismo** em vez de "render": trocar "8k ultra sharp" por
  linguagem de foto real (`shot on a professional camera, realistic textures, natural
  lighting, subtle film grain, photojournalistic realism`) — reduz a cara de IA.
- `pickScene` combina: cena (excluindo últimas 3) × variação de luz × variação de
  composição × seed aleatório → multiplica as combinações por cena.

### 6. Marca (fora da marca)

- Reforço pequeno e fixo nos prompts de cena/legenda ancorando Brasília/DF/GO + tom
  EcoSunPower (já existe em parte; consolidar).
- Logo EcoSunPower no canto continua igual (`applyBrandLogo`).
- Copy: subir pra Opus + reforçar no system prompt o gancho/CTA sutil e o perfil
  financeiro do público (faixas já documentadas no prompt atual permanecem).

## Componentes e interfaces (resumo)

| Unidade | O que faz | Muda |
|---|---|---|
| `054_marketing_historico.sql` | adiciona `topic_type`, `scene_key` | novo |
| `solar-scenes.ts` `pickScene` | aceita `excludeKeys: string[]` + eixo composição + Q realista | assinatura + conteúdo |
| `marketing.ts` `getRecentDrafts` | lê histórico do banco | novo método |
| `marketing.ts` `generateSolarImage` | devolve `sceneKey` usada | retorno |
| `marketing.ts` `generateDraft` | usa histórico p/ cena+tipo, injeta no prompt, grava colunas, modelo Opus | corpo |

## Testes

- `pickScene` (unit, rng injetável): nunca retorna chave em `excludeKeys`; cai no pool
  cheio quando exclusão esgota; combina luz+composição.
- Seleção de tipo: não escolhe um `topic_type` presente em `recentTopicTypes`; respeita
  `preferredType` quando passado.
- `getRecentDrafts`: erro do banco → retorna `[]` sem lançar.
- Smoke manual (Junior): gerar 3-4 posts seguidos e conferir cenas/temas distintos +
  qualidade da imagem e da legenda.

## Fora de escopo (YAGNI)

- Não mexe no agendador além do necessário pra passar histórico.
- Não muda cadência (seg/qui/vídeo a cada 4º) nem o fluxo de aprovação/publicação.
- Não cria dashboard de histórico (as colunas bastam pro anti-repetição).

## Riscos

- MCP Supabase aponta pro projeto errado → a migration `054` deve ser aplicada **manual**
  no SQL Editor do projeto `kupnsoyymulbdzakqlqc` (Junior aplica).
- Opus é mais lento que Haiku — aceitável no volume (geração assíncrona, não bloqueia).
