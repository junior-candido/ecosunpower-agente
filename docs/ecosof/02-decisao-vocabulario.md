# Decisão de vocabulário: `companies`/`company_id` vs `tenants`/`tenant_id`

**Data:** 15/07/2026 · **Autor:** Lucas (bloco "esqueleto do prédio")
**Contexto:** Fase 1 da fundação multi-tenant (`bloco-predio-lucas-fundacao.md`). Antes de escrever
as migrations de zero-downtime que espalham a coluna de tenant pelas ~80 tabelas, é preciso fechar
o nome. Este documento é só análise + proposta — **nada foi alterado no banco**.

> ⚠️ **Nota sobre a leitura obrigatória:** os dois arquivos indicados
> (`Downloads/arquitetura-multitenant-eva-ecosunpower.md` e `Downloads/MIGRATION-E-ONBOARDING-EVA.md`)
> não existem nesta máquina — busquei em `Downloads/`, no repo inteiro e no OneDrive e não encontrei
> nenhum dos dois. A análise abaixo foi feita 100% a partir do estado **atual** do código
> (`origin/main`, commit `d24d3a6` + trazido até o HEAD de hoje), como o próprio bloco pediu
> ("confirme sempre no código atual"). Se esses docs existirem em outro lugar (ex.: Google Drive,
> Notion), me manda o link/arquivo que eu reviso a decisão com eles em mãos — mas o mapeamento de
> código abaixo não deve mudar, só o pano de fundo arquitetural.

---

## 1) Mapeamento: onde `companies`/`company_id` já aparece

### 1.1 Banco (`supabase/migrations/`)

O repo tem **80 tabelas** hoje. **9 já carregam uma etiqueta de tenant** — bem mais que as "4 de
~70" citadas no bloco (a nota tem ~2 dias; nesse intervalo entraram ~15 migrations novas, 3 delas já
tocando o assunto). Duas famílias de nome coexistem:

| Padrão | Tabelas | Tipo da coluna | Default |
|---|---|---|---|
| **`company_id` → FK `companies(id)`** | `companies` (a própria), `dashboard_roles`, `dashboard_users`, `audit_log`, `leads` (via `ALTER TABLE`), `lead_atividades`, `lead_tarefas`, `lead_ia_conversas`, `eventos_elo` | `uuid` | `'00000000-0000-0000-0000-000000000001'` (EcoSun, seed) — 3 tabelas usam `DEFAULT`, as demais são preenchidas pela app |
| **`tenant_id` (sem FK, é outra coisa)** | `eva_knowledge_chunks` (RAG da Eva) | `text` | `'ecosunpower'` |

Migrations envolvidas: `049_empresa_config` (abre o vocabulário "empresa", sem coluna de tenant),
`056_crm_fundacao` (cria `companies` + `company_id`), `057_crm_fase2_funil`, `061_lead_ia_conversas`,
`069_elo_email`.

**Achado importante:** `eva_knowledge_chunks.tenant_id` já existe e usa **`tenant`** — mas é um
conceito diferente (slug de texto pra particionar a base de conhecimento RAG, não uma FK pra uma
tabela de empresas). Ou seja, **o código já está com os dois nomes em uso simultaneamente**, não é
só "banco diz `companies`, blueprint diz `tenants`" — é "uma parte do banco já diz `tenant_id`
mas não é a mesma coisa que `company_id`".

### 1.2 Código (`src/`)

13 arquivos TypeScript usam `company_id`/`companyId` de verdade (tenant do CRM):

```
src/modules/dashboard/atividades.ts   src/modules/dashboard/seed.ts
src/modules/dashboard/audit.ts        src/modules/dashboard/sla-notifier.ts
src/modules/dashboard/permissions.ts  src/modules/dashboard/tarefas.ts
src/modules/dashboard/pos-venda-queries.ts   src/modules/dashboard/users-store.ts
src/modules/dashboard/router.ts       src/modules/dashboard/views.ts
src/modules/supabase.ts
```

Padrão típico: `const ECOSUN = '00000000-0000-0000-0000-000000000001'` repetido em 4 arquivos
(`router.ts`, `seed.ts`, `sla-notifier.ts`, `tarefas.ts`) como fallback quando `company_id` vem
nulo — e um fallback igual, inline, em `supabase.ts` (6 ocorrências). `viewer.companyId` /
`req.dashUser!.companyId` é como o usuário logado carrega o tenant pelas rotas do dashboard.

RAG usa `tenant`/`tenant_id` em 2 arquivos (`src/modules/rag/ingest.ts`, `src/modules/rag/retrieve.ts`),
independente do CRM.

**Falso positivo a evitar:** `src/modules/monitoring/adapters/deye.ts` tem `companyId` GRITANTE (40+
ocorrências) — mas é o `companyId` da **API da Deye** (conta organizacional do monitoramento solar
deles), sem nenhuma relação com o nosso tenant. Um `grep`/rename automático que não filtrar por
pasta vai pegar esse arquivo por engano. Qualquer decisão (manter ou renomear) precisa excluir
`monitoring/adapters/deye.ts` do escopo.

### 1.3 Já rodou em produção com dado real

- `companies` já tem a linha semente da EcoSunPower, `leads` já foi *backfillado* com ela, e
  `dashboard_users`/`dashboard_roles`/`audit_log` já operam com login real do time.
- Já existiu um bug de produção por causa disso: commit `51db4af` — *"fix: cliente novo nasce com
  company_id (some do pós-venda sem ele)"* — um cliente foi criado sem `company_id` preenchido e
  sumiu de uma tela que filtra por ele. Ou seja, a coluna já é **usada de verdade** nas queries do
  dashboard, não é só um esqueleto inerte.

### 1.4 RLS ainda não isola por tenant

`lead_atividades`, `lead_tarefas`, `lead_ia_conversas` têm `ENABLE ROW LEVEL SECURITY` mas **sem
nenhuma policy** (bloqueio total, contornado pela service-role da app). As tabelas mais antigas que
têm policy usam `USING (true)` (libera geral) — é o débito já registrado no
`docs/ecosof/01-inventario-clone.md` ("revisar postura antes de vender"). Isso confirma que hoje
`company_id` é só filtro de aplicação — a etapa 5 do bloco (RLS de verdade, tarefa do Jonnata) ainda
não começou em nenhuma tabela.

### 1.5 O termo "empresa" já é a espinha dorsal do domínio

`empresa_config` (migration 049) e `empresa_kits` existem **antes** do CRM e não têm nada a ver com
multi-tenant propriamente — são a configuração de identidade/preço da própria implantação (o "Kit
Clone" do EcoSof). Quando o CRM chegou (migration 056+), o spec
(`docs/superpowers/specs/2026-06-23-crm-dashboard-design.md`, seção 4.4 "Esqueleto multi-tenant")
escolheu `company_id` deliberadamente, não por acidente — encaixando no vocabulário que já existia
("empresa" é como o time chama isso em português, em toda parte: `empresa_config`, `ECOSUN`,
comentários). Não encontrei nenhum uso de `tenants`/`tenant` como nome de tabela em lugar nenhum do
repo hoje.

---

## 2) As duas opções

### Opção A — Manter `companies`/`company_id`, adaptar os blueprints

**O que muda:** nada no banco nem no código existente. Quando eu (ou quem escrever as migrations da
Fase 1) traduzir os blueprints, `tenant_id` vira `company_id` e `tenants` vira `companies` no
momento de escrever o `.sql`. É uma decisão de tradução, registrada aqui — não um patch.

**Risco:** baixo. Não toca nas 9 tabelas nem nos 13 arquivos que já funcionam em produção com dado
real. Não têm chance de colidir com as branches abertas do Junior e da pessoa 2 (ambos mexendo
pesado em `dashboard/` e `supabase.ts` nas últimas semanas — 1594 linhas só no `router.ts` nos
últimos 25 commits).

**Trabalho:** ínfimo — já feito ao escrever este documento.

**Contras:**
- Diverge do vocabulário "tenant" que é o padrão de mercado pra SaaS multiempresa (o blueprint deve
  ter escolhido isso por isso mesmo). Se um dev novo chegar já sabendo o jargão de SaaS, vai
  procurar por "tenant" e não achar.
- Não resolve sozinho a inconsistência do `eva_knowledge_chunks.tenant_id` (ver seção 3).

### Opção B — Renomear `companies` → `tenants` (e `company_id` → `tenant_id`)

**O que muda:** `ALTER TABLE companies RENAME TO tenants`, `RENAME COLUMN company_id TO tenant_id`
em 8 tabelas + todas as FKs que apontam pra `companies(id)` + reescrever os 13 arquivos TS (troca de
`companyId`→`tenantId`, `.eq('company_id', ...)`→`.eq('tenant_id', ...)`, os 5 fallbacks `ECOSUN`) +
os testes que tocam esses módulos + os specs/plans já escritos que documentam `company_id` como
decisão (ficam desatualizados ou precisam de nota).

**Risco:** médio-alto, por 3 motivos:
1. Mexe em tabela com dado real em produção, incluindo a tabela que guarda login/senha do time
   (`dashboard_users`) — qualquer passo fora de ordem interrompe o dashboard ao vivo.
2. `dashboard/` e `supabase.ts` são exatamente os arquivos que o Junior e a pessoa 2 estão
   modificando ativamente agora (dezenas de branches abertas tocando esses arquivos). Um rename
   grande aqui é terreno fértil pra conflito de merge chato pros outros dois.
3. `ALTER TABLE ... RENAME COLUMN` é metadata-only no Postgres (rápido, não trava a tabela pra
   leitura/escrita) — o risco não é a migration em si travar, é a **janela entre o rename no banco e
   o deploy do código novo**: se um migrar antes do outro, a rota que ainda fala `company_id` quebra
   contra uma coluna que já se chama `tenant_id` (ou vice-versa). Pra fazer isso sem downtime de
   verdade, precisaria do padrão expand/contract completo (coluna nova em paralelo, dual-write,
   trocar leituras, aí sim derrubar a antiga) — bem mais caro que um rename direto.

**Trabalho:** alto — pelo menos 1 migration de rename + coordenação de deploy sincronizado, ou 3-4
migrations no padrão expand/contract se quiser fazer sem risco de janela quebrada, mais reescrever
os 13 arquivos e re-testar tudo que toca `dashboard/`.

**Contras:** o próprio bloco já sinalizava isso — "(a) é provavelmente o mais barato".

---

## 3) Nota à parte: `eva_knowledge_chunks.tenant_id`

Nenhuma das duas opções resolve isso sozinha. `tenant_id` ali é `text` (slug tipo `'ecosunpower'`),
não `uuid` nem FK pra `companies`/`tenants` — serve pra particionar a base de conhecimento RAG, um
conceito vizinho mas diferente de "empresa dona do registro". Escolher a Opção B deixaria dois
`tenant_id` com tipos e semânticas diferentes no mesmo banco, o que confunde mais do que ajuda.
Minha sugestão (independente da decisão principal): deixar esse campo como está, e se um dia
precisar unificar, tratar como migration própria — trocar o `text` por `uuid REFERENCES
companies(id)` (ou `tenants(id)`) é um projeto à parte, não algo pra empacotar aqui.

---

## 4) Recomendação

**Opção A — manter `companies`/`company_id`.**

O motivo decisivo é a assimetria de custo e risco: a Opção A é uma decisão de tradução (zero linhas
de código mudam); a Opção B é uma cirurgia em 9 tabelas com dado real e 13 arquivos que dois colegas
estão editando ativamente agora, pra ganhar só aderência a um nome de blueprint que hoje não tem
nenhum uso real no repo. O vocabulário `company`/`empresa` já é consistente com o resto do domínio
(`empresa_config`, `empresa_kits`, comentários em português) e já sobreviveu a um incidente de
produção sem precisar mudar de nome — trocar agora multiplicaria a chance de um bug parecido bem no
meio da Fase 1, que é justamente a fase que promete "não quebrar a produção".

Se algum dia a Opção B fizer sentido (ex.: o EcoSof vira produto vendido com contrato que expõe o
schema, ou o time cresce e "tenant" vira o jargão oficial), ela fica mais barata depois que o
grosso das ~80 tabelas já estiver com a coluna — é um rename mecânico único no fim, não N migrations
de expand/contract junto com o rollout da Fase 1.

**A decisão final é sua, Junior.**
