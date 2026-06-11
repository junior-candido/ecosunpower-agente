# EcoSof Kit Clone — Inventário do que é "EcoSunPower" no código

**Data:** 11/06/2026 · **Fonte:** varredura completa do repo (2 agentes, código + conhecimento)
**Uso:** checklist do que trocar por cliente na implantação de um clone. Item 1 do Kit Clone
(spec: `docs/superpowers/specs/2026-06-11-ecosof-comercializacao-design.md`).

## Resumo executivo

A plataforma está MELHOR preparada pro clone do que o esperado:
- **Infra e identidade básica já são env vars** (telefones, URLs, WABA, Meta, Google, GitHub do site) — clone = preencher `.env` novo.
- **Conhecimento da Eva é ~60-70% genérico** (física solar, Lei 14.300, normas, marcas, objeções) — copia inteiro; só ~17 arquivos precisam de adaptação por cliente.
- **O que dói:** dados da empresa chumbados em templates de contrato/procuração/proposta (CNPJ, endereço, RT), logo em base64, kits/preços hardcoded no index.ts, system-prompt com região/critério/RT no texto.

**Estratégia por categoria (proposta — validar com Junior):**
| Categoria | Estratégia |
|---|---|
| Infra (chaves, tokens) | `.env` novo por clone (já funciona) |
| Identidade da empresa (CNPJ, razão, endereço, RT, PIX, site, fones) | **arquivo único `cliente.json`/env bloco novo** lido por config — substitui os hardcodes |
| Conhecimento da Eva | pasta `conhecimento/` copiada; 17 arquivos [EMPRESA/MISTO] regravados por cliente no white glove |
| system-prompt | placeholders pros dados do cliente (região, critério de lead, RT, empresa) — o resto fica |
| Kits/preços/marcas | hoje hardcoded → mover pra banco (tabela de kits) OU arquivo de config do cliente |
| Logo/assets | upload no Storage do clone + path em config (matar base64 fixo) |
| Eva (nome) | **MANTER como marca do produto** ("EcoSof, com Eva") — ver decisão abaixo |

## Decisão recomendada: Eva é a marca, não o nome configurável

O nome "Eva" aparece em 60 arquivos e o esforço de parametrizar (config + placeholders + testes)
é 10-15× o benefício. Recomendação: **Eva é o produto** — todo clone atende como "Eva" (vira ativo
de marca da EcoSof, tipo "Alexa"). Cliente que exigir nome próprio = recusa educada (ou fase 2).

## A) Já configurável por env (só preencher no clone)

Identidade do cliente: `EVOLUTION_INSTANCE`, `ENGINEER_PHONE`, `ENGINEER_NAME`,
`ADMIN_EXTRA_PHONES`, `BUSINESS_PHONE`, `GOOGLE_CALENDAR_ID`, `META_AD_ACCOUNT_ID`,
`META_FACEBOOK_PAGE_ID`, `META_INSTAGRAM_BUSINESS_ID`, `META_WABA_PHONE_NUMBER_ID`,
`META_WABA_BUSINESS_ACCOUNT_ID`, `META_CAPI_DATASET_ID`, `IG_USER_ID`, `TAVUS_REPLICA_ID`,
`GITHUB_SITE_REPO`, `PUBLIC_PROPOSAL_BASE_URL`, `SITE_URL`, `GOOGLE_NOTA`,
`GOOGLE_QTD_AVALIACOES`, `GOOGLE_REVIEW_URL`.

Infra do clone: `SUPABASE_URL/SERVICE_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`EVOLUTION_API_URL/KEY`, `WEBHOOK_TOKEN`, `META_*` tokens/secrets, `GOOGLE_*` secrets,
`REDIS_*`, `GITHUB_PAT`, `CLOUDFLARE_DEPLOY_HOOK_URL`, `PROPOSAL_PREVIEW_TOKEN`,
`REPLICATE_API_TOKEN`, `HIGGSFIELD_CREDENTIALS`, `TAVUS_API_KEY`.

⚠️ Defaults com a cara da EcoSun que viram OBRIGATÓRIOS no clone (sem default):
`META_CAPI_DATASET_ID` (1053629086258723), `GITHUB_SITE_REPO` (junior-candido/ecosunpower-site),
`PUBLIC_PROPOSAL_BASE_URL` e `SITE_URL` (ecosunpower.eng.br).

## B) Hardcodes de identidade da empresa (trocar por config — trabalho de código)

| Onde | O quê |
|---|---|
| `src/index.ts:6911,6916,7732,7043` | CNPJ, razão social, "Brasília-DF desde 2019", e-mail |
| `src/modules/closing/templates/contrato.html.ts:13,50-76` | CNPJ, endereço Arniqueira, RT (nome/CPF/RG/CREA) |
| `src/modules/closing/templates/procuracao.html.ts:6,16,18,34-130` | RT + CNPJ + e-mail no footer |
| `src/modules/proposal-assistant.ts:299,522` / `proposal/template.ts:67-70` | CNPJ, site, "Eva da EcoSunPower" |
| `src/modules/proposal/service-payment.ts:7` | PIX = CNPJ |
| `src/modules/monitoring/relatorio/template.ts:23,96` | fone Eva + rodapé CNPJ |
| `src/modules/marketing/banner-tabela-kits*.ts` | nome do RT default |
| `src/modules/blog-generator.ts:180` | persona "Junior, RT da EcoSunPower" |
| `src/index.ts:116-132,131` | página inicial + wa.me/5561996978781 |
| `src/modules/marketing/ig-qualifier-brain.ts:43` | WA_PHONE hardcoded |
| `src/modules/dashboard/views.ts:250,507-515` | placeholder login + logos em ecosunpower.eng.br/logos/ |
| `src/modules/proposal/assets/logo-base64.ts` + `assets/banner/*` | logo embutida |

## C) Regras de negócio chumbadas (decidir: config do cliente ou padrão do produto)

| Regra | Onde | Clone |
|---|---|---|
| Critério de lead R$700/700kWh | index.ts:3850+, eva-alerts.ts:270, system-prompt | configurável por cliente |
| Marcas permitidas + bloqueio Growatt | index.ts:7095, system-prompt:63 | configurável (lista por cliente) |
| Região DF/GO, HSP 5.40/5.41, tarifas Neoenergia/Equatorial | system-prompt, solar-params.ts, closing-system.md, blog-generator | **POR REGIÃO do cliente** (tabela HSP/tarifa por UF já existe parcialmente em solar-params) |
| Fator perda 0,78 / painel 700W | solar-params.ts, proposta-form | padrão do produto, override por cliente |
| Garantia 12 meses mão de obra | system-prompt, pos-instalacao | configurável |
| 6 kits OnGrid com preços | index.ts:2754-2760 | trocar por tabela no banco (preço é do cliente!) |
| Tabela cartão Belenus / maquininha InfinityPay | proposal-assistant | específico EcoSun — desativável por flag |
| Ad IDs CTWA hardcoded | ctwa-template-mapping.ts:21-25 | já caem no default — limpar no clone |
| Templates WABA (nomes) | template-inicial, cadence, monitoramento | cliente precisa criar os MESMOS nomes no WABA dele (roteiro) |

## D) Conhecimento da Eva (`conhecimento/` — 51 arquivos, carregados em runtime)

- **[GENÉRICO] ~30 arquivos — copiar inteiro:** legislação (Lei 14.300, MMGD), tarifação geral,
  dimensionamento, estruturas/telhados, baterias/inversores, fichas das 14+ marcas,
  microinversores, mercado livre, FAQ, objeções, processo, metodologia, produtos, playbook.
- **[EMPRESA] ~8 — REGRAVAR por cliente:** empresa.md, contato-redes.md, indicacao.md,
  contratos.md, canal-solar.md (fornecedor), servicos-executados.md, neoenergia-brasilia.md /
  equatorial-goias.md (→ concessionárias da região do cliente).
- **[MISTO] ~13 — adaptar:** precificacao.md, precos-referencia.md (R$/kWp da região),
  propostas.md, agendamento.md, pos-venda.md, financiamento.md, perguntas-qualificacao.md,
  visita-tecnica, mercado-greener (benchmark), carros-eletricos, cenarios.
- **system-prompt.md (1.227 linhas):** ~20% específico (identidade/região/RT/critério/endereço —
  linhas 14-29, 182-186, 339, 353, 401-402, 445, 701) → placeholders; 80% fica.

## E) O que NÃO entra no clone (módulos da EcoSun desativáveis)

- Blog/site Astro (GITHUB_SITE_REPO) — só se o cliente tiver site nosso (fase 2; flag off).
- Cases de sucesso da EcoSun (banco + /cases.json do site) — clone nasce vazio e enche com os dele.
- Banner maker com kits/marca EcoSun — flag off no início.
- Importadores de campanha específicos (scripts/) — não rodam no clone.

## F) Próximos passos do Kit (ordem)

1. ✅ Este inventário.
2. ⏳ Instalador de banco único (em produção — `setup/instalador-banco-ecosof.sql`).
3. Decidir com Junior a mecânica de configuração (env bloco "CLIENTE_*" vs `cliente.json` vs tabela `empresa_config`) e EXECUTAR a troca dos hardcodes da seção B + regras da C.
4. Roteiro de implantação nível leigo (filho executa).
5. Eva vitrine da EcoSof + página ecosof.com.br.
6. Checklist de saúde dos clones.
