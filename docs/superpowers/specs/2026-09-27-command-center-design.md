# Energy Command Center — design (27/09/2026)

> Pedido do Junior: transformar o painel na **plataforma de gestão de empresa de energia**
> ("Energy Command Center"), **sem mudar a marca EcoSunPower** — reaproveitar a ORGANIZAÇÃO
> do protótipo aprovado ("muito top"), número sempre real, multi-tenant.

**Entradas:**
- Especificação do dono: `Downloads\Ecosunpower_Command_Center_Especificacao.md`
- Protótipo aprovado: `Desktop\PROTOTIPO-Command-Center\` (17 HTML + PNG; fontes em `_fonte\`)
- Inventário do painel atual: `Documents\EcoSunPower\Plataforma\inventario-painel-2026-09-27.md`

**Plano de execução:** `docs/superpowers/plans/2026-09-27-command-center.md`.

---

## 1. A pergunta que manda em tudo

> **"Como está a empresa agora, o que mudou e qual é a próxima ação mais importante?"**

Três níveis de profundidade:

1. **Command Center** (visão executiva) — responde a pergunta em segundos.
2. **Painel por área** — Comercial, Marketing, Usinas, Instalações, O&M, Financeiro, Clientes, Relatórios, IA.
3. **Detalhe (drill-down)** — lead, proposta, usina, inversor, obra, chamado, lançamento.

Todo card é clicável e leva ao problema/oportunidade. Nunca perde o contexto: trilha
("Command Center › Usinas › Usina X") em toda tela nova.

## 2. Regras que não se negociam

| Regra | Como fica no código |
|---|---|
| **Marca EcoSun intacta** | Menu com o gradiente navy `#0c4a6e → #075985 → #0369a1`, logo **negativa-wide GRANDE**, dourado/âmbar (`#fbbf24`/`#F0A500`) só para ação principal e item ativo; verde = normal/positivo, vermelho = crítico. |
| **Tenant vê a marca dele** | Logo e cor vêm de `marca-empresa.ts` (`logoDaEmpresa`, `corDaMarca`). A variável `--marca` pinta o item ativo. Tenant sem logo vê o nome da empresa, nunca a logo/CNPJ da EcoSun. |
| **Nada de número inventado** | Sem dado → `—` + "sem dado". Bloco ainda não ligado → estado vazio **"Em construção — próxima entrega"**. Os números do protótipo eram exemplo; nenhum deles vai para produção. |
| **Multi-tenant** | Toda leitura nova filtra por `company_id` da sessão (`req.dashUser.companyId`) **explicitamente** e usa `bancoDoOperador(req, supabase)`. Nunca `supabase.from(` cru novo no `router.ts` (teste-teto `tenant-rota-guard`). Enquanto a query não for escopada, o tenant vê "em construção", não o dado da casa. |
| **Permissões** | Rotas com `exigir(area, nivel)`; menu com `estadoDoItem` da vitrine (visível / bloqueado com 🔒 → `/conhecer/:chave` / escondido); `soEcosun`/`soTenant` preservados. |
| **Nada se perde** | Toda rota atual continua no mesmo endereço e aparece no menu novo (tabela §4). |
| **Português simples** | Texto de tela em pt-BR claro. "Responsável Técnico", nunca "engenheiro". |

## 3. Sistema visual (design system)

Tirado do `common.css` do protótipo, **com prefixo `cc-`** para não colidir com as classes
Tailwind/CSS das telas antigas (`.card`, `.kpi`, `.btn` já existem em telas avulsas).

- **Tokens (CSS vars):** `--cc-bg #0A1729`, `--cc-surface #0F2138`, `--cc-surface-2 #132942`,
  `--cc-surface-3 #183253`, `--cc-line`, `--cc-text #EAF1F8`, `--cc-muted #8CA3BC`,
  `--cc-gold #F0A500`, `--cc-gold-2 #fbbf24`, estados `--cc-ok #3DBB6E`, `--cc-crit #E4574B`,
  `--cc-warn #F2862E`, `--cc-watch #E3C84A`, `--cc-info #38BDF8`, `--cc-off #7F90A6`
  (cada um com `-soft`). **Tema claro:** os mesmos nomes redefinidos em `.cc-claro`
  (usado pelas telas claras de hoje e pelo tenant de monitoramento que pediu claro).
- **Tipografia:** números em **Space Grotesk** (tabular), texto em **Inter** (Google Fonts).
- **Componentes** (`src/modules/dashboard/ui/componentes.ts`, funções puras que devolvem HTML
  escapado): `kpiCard`, `faixaKpis` (stat strip), `pilulaStatus` (🔴 crítico · 🟠 atenção ·
  🟡 acompanhar · 🟢 oportunidade/normal · 🔵 info · ⚪ sem dado), `cartaoSecao`, `tabela`,
  `selo` (badge), `sparkline` (SVG inline, sem JS), `estadoVazio`, `cabecalhoPagina`
  (trilha + slot de filtros globais + ações), `icone` (sprite Lucide).
- **Casca (shell):** menu compacto por área com ícone, selo de contagem (slot), logo grande,
  cartão do usuário, entrada "Modo TV"; gaveta no celular; área principal **navy escura** nas
  telas desenhadas para escuro e **clara** nas telas que ainda são claras (ninguém quebra).

## 4. Arquitetura de menus (IA) — nada se perde

| Área (menu novo) | Itens (rota atual → mesma rota) |
|---|---|
| **Command Center** | `/command-center` (novo) · `/home` Visão geral · `/cockpit` Cockpit · `/predio` Prédio Vivo (só EcoSun) |
| **Comercial / CRM** | `/leads` · `/leads/kanban` Funil · `/propostas` (+ `/propostas/novo`, preview) · `/vendas/fechar` Fechou! · `/contratos` (+ contrato-form/preview/pdf do lead) · `/recados` · `/lojas` |
| **Marketing** | `/marketing` Campanhas · `/marketing/blog` · `/marketing/email` · `/cadencia` |
| **Usinas** | `/monitoramento` (+ `/:id`, dados, editar, relatório, importar) · `/demonstrativos` (+ subrotas) · `/medicao` · `/minha-assinatura` (só tenant) |
| **Instalações** | `/usinas/kanban` Kanban de obras (+ `/usinas/vincular`, `/usinas/:id/contato`) |
| **O&M** | `/manutencao` (+ `/os/:id`, laudo) · `/servicos` Serviços de campo (+ subrotas) |
| **Financeiro** | `/financeiro` · `/fiscal` Notas (+ subrotas) · `/cobrar` · `/assinaturas` |
| **Clientes** | `/clientes` (só EcoSun; + `/:id`, novo, relatório pós-instalação) · `/pos-venda` · `/pastas` |
| **Relatórios** | Fase G: `/relatorios` (hub). Até lá, o grupo não aparece (não há item). |
| **IA · Eva** | `/conhecimento` O que a assistente sabe · `/cerebro` (só EcoSun) |
| **Equipe · RH** | `/rh/candidatos` · `/rh/vagas` · `/rh/busca` |
| **Configurações** | `/usuarios` · `/whatsapp` (só tenant) · `/empresas` (só EcoSun) |
| rodapé do menu | **Modo TV** → `/tv` (fase I; na fase A é página "em construção") |

Chaves `active` erradas corrigidas na fase A: Cadência (`marketing`→`cadencia`),
Usuários (`home`→`usuarios`), páginas "conhecer" (`home`→ chave do módulo), formulário e
preview de proposta (`clientes`→`propostas`). A OS continua em `manutencao` (ela nasce da
tela de Manutenção, que no menu novo fica em O&M — o inventário marcou como dúvida; está certo).

## 5. Fases (cada uma sai sozinha, em PR próprio)

| Fase | Entrega | Pronto quando |
|---|---|---|
| **A** | Design system (`ui/`), casca nova (menu por área, logo grande, cartão do usuário, Modo TV, gaveta mobile, escuro/claro), chaves `active` corrigidas, rota `/command-center` com layout do protótipo e blocos não ligados em "em construção", `/tv` placeholder. `/home` intacta. | tsc + vitest verdes; prints das telas no Desktop; nenhuma rota perdida. |
| **B** | Command Center com **dado real** + **motor da Central de Atenção** (`central-atencao.ts`, puro) alimentado por: usinas (`classificarSistema`), propostas sem contato (72 h), contas a vencer/DAS (`alertasDoDia`), manutenção vencida (`statusAgendaItem`), créditos GD a vencer (`tipoAvisoVencimento`), garantias (`garantiaInfo`), certificado A1. Consultas novas em `command-center-queries.ts` com `.eq('company_id', …)`. Selos do menu ligados à contagem real. Tela `/atencao` (lista completa). | Cada KPI/evento vem de consulta testada; sem dado = "—". |
| **C** | Usinas — frota (tabela ordenada por criticidade × perda R$/dia, mapa por região), detalhe da usina com abas (visão geral, inversores, alarmes, manutenção, documentos). Reusa `monitoring/usinas-queries.ts`. | Perda R$ calculada de geração esperada × tarifa real (`solar-params.ts`). |
| **D** | Clientes — lista + **Ficha 360** (usinas, contratos, propostas, documentos, geração, economia, chamados, garantias) + portal do cliente (celular/desktop) em rota pública assinada. | Portal só mostra a usina do próprio cliente (token). |
| **E** | Comercial (funil Novo→Pós-venda, SLA 1º atendimento, receita prevista — `bi-*.ts`) e Marketing (atribuição campanha→contrato, CPL/CAC/ROAS — `marketing-queries.ts`). | Números batem com `/leads` e `/marketing`. |
| **F** | Instalações (pipeline técnico Contrato→Monitoramento, SLA por etapa, calendário) e O&M (alarmes, chamados, prioridade inteligente energia+R$+tempo+SLA). | Obras com prazo por etapa. |
| **G** | Financeiro executivo (receita, custos, margem, a receber/a pagar, inadimplência) + **hub de Relatórios** (`/relatorios`) juntando demonstrativos GD, relatório de usina, pós-instalação, financeiro do mês. | Grupo "Relatórios" aparece no menu. |
| **H** | IA · Eva — resumo do dia no hero ("Bom dia…" + 3 ações), guardado em tabela para o painel (hoje os alertas da Eva só vão pro WhatsApp). Reusa `ai-summary.ts`/`lead-synthesis.ts`. | Resumo gerado 1×/dia, com fonte de cada frase. |
| **I** | **Modo TV** (`/tv`): tela cheia, gira entre visão executiva, usinas e comercial a cada 30 s; atalho `T`. | Roda numa TV sem login interativo (token de TV por empresa). |

## 6. Command Center (alvo final — fase B em diante)

Topo: "Ao vivo · data · atualizado às" + título + subtítulo (a pergunta) + filtros globais
(período, concessionária, responsável) + Modo TV + sino.

1. **Hero da Eva** — saudação pelo horário de Brasília, 2–3 frases do estado da empresa,
   "o que mudou desde ontem" (chips), **3 ações recomendadas** (a 1ª em dourado).
2. **Faixa de 8 KPIs** — geração agora, energia hoje, energia no mês, usinas ativas/fora,
   faturamento, pipeline, leads do mês, propostas/vendas do mês.
3. **Geração do portfólio** (real × esperada) · **Usinas agora** (mapa por região + legenda
   normal/atenção/crítico/sem comunicação) · **Central de Atenção** (coluna à direita, 5
   severidades, só o que tem mais impacto; "Ver todos").
4. **Cartões por área** — Comercial, Marketing, Instalações, O&M, Financeiro (número grande,
   uma linha de contexto, sparkline, 1 alerta).

Na **fase A** a rota existe com esse layout, mas só os números já disponíveis hoje
(`fetchDashboardKpis`: leads, propostas, vendas, usinas novas e manutenções pendentes do mês)
aparecem — e **só para a EcoSun**, porque essa consulta ainda não filtra `company_id`
explicitamente. O resto mostra "Em construção — próxima entrega".

## 7. Central de Atenção (motor — fase B)

```ts
type Severidade = 'critico' | 'atencao' | 'acompanhar' | 'oportunidade' | 'info';
interface EventoAtencao {
  id: string;              // estável (fonte + chave) — dedupe
  severidade: Severidade;
  area: 'usinas' | 'comercial' | 'marketing' | 'instalacoes' | 'om' | 'financeiro' | 'clientes';
  titulo: string;          // frase curta, pt-BR simples
  contexto: string;        // "Usinas · há 4 dias"
  impactoRs?: number | null; // perda/ganho estimado em R$ (ordena dentro da severidade)
  impactoTexto?: string;
  acao: { rotulo: string; href: string };
  desde?: string | null;   // ISO
}
```

Ordem: severidade → impacto R$ (desc) → mais antigo primeiro. A Home mostra os 8 primeiros;
`/atencao` mostra todos com filtro por área/severidade. Cada fonte é um adaptador puro
(`eventosDeUsinas`, `eventosDePropostas`, `eventosDeContas`, …) testado isoladamente.

## 8. Riscos

- **Telas antigas dentro da casca nova** — muitas são claras e cheias de utilitários Tailwind;
  a casca mantém o fundo claro nelas e só muda menu/fonte. Conferir por print a cada fase.
- **Isolamento** — `bancoDoOperador` depende de `SUPABASE_ANON_KEY`/`SUPABASE_JWT_SECRET` no
  EasyPanel; sem elas cai no service_role. Por isso consulta nova filtra `company_id` no código
  também (dupla tranca) e a fase A não mostra número nenhum para tenant.
- **Menu longo** — agrupar por área com só o grupo ativo aberto mantém o menu curto.
- **Fontes externas** (Google Fonts) — se cair, volta para a fonte do sistema sem quebrar.
