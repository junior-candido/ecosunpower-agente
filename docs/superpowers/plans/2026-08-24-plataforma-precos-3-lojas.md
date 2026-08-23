# Plataforma de preços das 3 distribuidoras (Belenus + Sol Fácil + Fortlev)

Objetivo (Junior 24/08): unir "o melhor das três" pra EcoSunPower **ganhar dinheiro** (comprar melhor, cotar na hora, nunca vender no prejuízo, homologar rápido) e **eficiência** (preço vivo, biblioteca de docs, alertas). Recomendação aprovada: curadoria-segura (não flodar o precificador).

## Já pronto (branch `feat/tabela-viva`)
- `src/modules/vendas/lojas/tipos.ts` — `ItemLoja` comum + helpers de potência.
- `belenus-normalize.ts` · `solfacil-normalize.ts` · `fortlev-normalize.ts` — puros, 11 testes verdes (`tests/lojas-normalize.test.ts`).
- Fora do repo (dados): 3 CSVs 24/08, índice de 271 datasheets/INMETRO, comparador (46 produtos, economia média 23,6%).

## APIs (ver reference lojas-distribuidores-api)
- Belenus: login PJ `POST /api/autenticacao/Usuario/Login/PessoaJuridicaByEmail {email,senha}` → JWT; catálogo `POST /api/catalogo/catalogo/vitrine {siteId:'0001',familia,filtros:[],skip:1,take:300,order:0}`.
- Sol Fácil: Keycloak realm General client `ecommerce` (login por senha — Junior escolheu); catálogo GraphQL `kong.solfacil.com.br/prd-bff-store/api/graphql` op `getSpareProducts {region,zipcode,category,page,size}`.
- Fortlev: HTMX `GET /produto-avulso?pagina=N` (HX-Request), JSON no `addCart({component})` com attachments S3.

## Fase 1 — Clients HTTP (sem tocar prod)
`belenus-client.ts` / `solfacil-client.ts` / `fortlev-client.ts`: login (segredos) + fetch paginado → chamam os normalizadores → `ItemLoja[]`. Fetch injetável (testável). Segredos EasyPanel: `BELENUS_USER/PASS`, `SOLFACIL_USER/PASS`.

## Fase 2 — Migration `catalogo_loja` (tabela NOVA, não toca precificador)
⚠️ **NÃO criar o arquivo `105_catalogo_loja.sql` até combinar o número "105" no grupo do WhatsApp** (regra CLAUDE.md). Store já implementado: `src/modules/vendas/lojas/catalogo-loja.ts`. SQL rascunho (aplicar no SQL Editor de prod ANTES do deploy):

```sql
-- 105_catalogo_loja.sql — catálogo RAW das 3 lojas (preço vivo). Separado da
-- tabela_precos curada; NÃO alimenta o precificador sozinho (só referência/comparador).
CREATE TABLE IF NOT EXISTS public.catalogo_loja (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  fonte          text NOT NULL,           -- belenus | solfacil | fortlev
  categoria      text NOT NULL,           -- modulo|micro|inversor_string|inversor_hibrido|bateria|estrutura|cabo|componente
  sku            text NOT NULL,           -- chave estável dentro da loja
  marca          text NOT NULL DEFAULT '',
  modelo         text NOT NULL DEFAULT '',
  descricao      text NOT NULL DEFAULT '',
  potencia_w     integer,
  preco_unitario numeric(12,2) NOT NULL,  -- Belenus à vista · Sol Fácil Pix · Fortlev à vista
  preco_cheio    numeric(12,2),
  rs_por_wp      numeric(8,4),
  estoque        integer,
  datasheet_url  text,
  ativo          boolean NOT NULL DEFAULT true,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, fonte, sku)
);
CREATE INDEX IF NOT EXISTS idx_catalogo_loja_ativos ON public.catalogo_loja (company_id, categoria, marca) WHERE ativo;
ALTER TABLE public.catalogo_loja ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_loja FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON public.catalogo_loja;
CREATE POLICY company_isolation ON public.catalogo_loja AS PERMISSIVE FOR ALL
  USING (company_id = (SELECT coalesce(nullif(current_setting('app.company_id', true),'')::uuid, (auth.jwt() ->> 'company_id')::uuid)))
  WITH CHECK (company_id = (SELECT coalesce(nullif(current_setting('app.company_id', true),'')::uuid, (auth.jwt() ->> 'company_id')::uuid)));
```

## Fase 3 — Comparador (puro)
`comparador.ts`: agrupa itens equivalentes por (categoria+marca+potência+**tensão**+**fase**) pra não comparar 380V×LV → melhor preço + economia. Comando `/comparar <produto>` no zap → "mais barato na X, economia R$Y".
- ⚠️ **Frete FORA de escopo** (Junior 24/08: cada loja usa várias transportadoras + particular, estimar seria chute). Compara só preço do produto; frete o Junior decide na compra.

## Fase 4 — Job diário "tabela viva" + curadoria-segura
Cron (setInterval 24h, padrão dos outros crons no index.ts):
1. Puxa as 3 lojas → upsert `catalogo_loja`.
2. **Refresh curado**: só atualiza preço de linhas em `tabela_precos` cujo `fonte` ∈ {belenus,solfacil} e casam com um sku de `catalogo_loja`. **NUNCA** sobrescreve `fonte='junior'`. **NUNCA** adiciona módulo/micro novo ao precificador sozinho.
3. Avisa no zap (engineerPhone): novidades na loja (quer add? `/tabela ...`), sumiços, quedas >X%.
4. Alerta se falhar 2 dias seguidos.

## Fase 5 — Biblioteca de docs na homologação
Índice datasheet/INMETRO (271 docs) → Eva anexa o PDF certo por marca+modelo no pacote de homologação. Fortlev tem INMETRO direto; Sol Fácil datasheet; Belenus via portal.

## Fase 6 — Comparador no dashboard + gerar proposta (Junior 24/08)
Visão do Junior: comparador na tela com **botões reais** → escolhe a oferta → **gera proposta no dash** direto (liga no motor de proposta que já existe). Mais robusto que a automação do navegador ("sem travas": sem login manual/SPA/classificador — job server-side puxa pelas APIs e guarda em `catalogo_loja`; único ponto de falha = login por loja, com alerta no zap). Tela: lista de grupos comparados (melhor preço + economia) + botão "usar no orçamento" → pré-preenche o precificador/proposta.

## Fase 7 — Cotação inteligente (motor no sistema, Eva consome) — Junior 24/08
Princípio (Junior): a MATEMÁTICA é do sistema (robusto, sem alucinação); a Eva **usa** o resultado + RAG pra gerar proposta automática. Bate com a regra "Eva nunca crava preço" ([[eva-handoff-preco-redesign]]): precifica no motor → OK Junior → envia.
Dado um kit (módulos+inversor+qtd, ou o dimensionamento do lead), o motor calcula:
- **Custo real** = melhor oferta por item nas 3 lojas (comparador) → custo mínimo do kit.
- **Imposto** (usar o módulo de imposto que já existe — `makeImpostoHandler`/leitura de nota) + **serviço** (R$/Wp da autonomia, já no precificador) → **preço de custo total**.
- **Margem/lucro**: preço sugerido vs. custo → % de lucro; "**dá pra oferecer X% melhor** e ainda manter margem Y".
- **Pedir desconto ao vendedor**: sinaliza itens acima da **média/mínimo histórico** (price history em `catalogo_loja` por `atualizado_em`) → "peça desconto na loja Z, item W está R$ acima".
- Saída: mensagem pro Junior no zap na hora de cotar (margem, imposto, lucro, melhor loja, alavancas de desconto) + botão no dash → gera proposta.
- Competitividade: usar o menor custo real das 3 pra ganhar no preço mantendo margem.
- ⚠️ Reusar o que já existe (VISAO-GERAL-DO-SISTEMA): imposto, precificador, motor de proposta. Não recriar.

## Dois cérebros (Junior 24/08: "conhecimento pra você e pra Eva RAG")
- **Memória do Claude** (entre sessões): endpoints, arquitetura, decisões → reference `lojas-distribuidores-api` + project `plataforma-precos-3-distribuidoras`. FEITO.
- **RAG da Eva** (cliente-facing, `conhecimento/especializado/*.md`): só conhecimento ESTÁVEL — fichas técnicas por modelo (specs dos datasheets), nº INMETRO por modelo, livro de argumentos (Risen×TCL, micro×string, garantias). NÃO entra preço vivo (fica em `catalogo_loja`, consulta em runtime). **Auditoria obrigatória antes do commit**: grep `Growatt|engenheiro|eletrotécnico` (catálogos estão cheios de Growatt = banido cliente-facing). Fluxo: montar .md → preview pro Junior → commit/push main → Junior Implanta → startup-sync embeda. Ver reference `como-adicionar-conhecimento-eva-rag`.

## O que preciso do Junior pra ligar o automático
1. Segredos no EasyPanel: `BELENUS_USER/PASS`, `SOLFACIL_USER/PASS`.
2. CNPJ transportadora + CEP padrão (pra estimar frete Belenus).
3. Rodar a migration `catalogo_loja` no SQL Editor de prod quando o PR estiver pronto.

## Revisão / não quebrar
- 3× review por lote (padrão). `tsc`/`vitest` antes de "pronto".
- Precificador em produção: intocado. `catalogo_loja` é aditivo.
