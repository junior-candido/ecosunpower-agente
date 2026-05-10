# Equipe de Marketing IA — Design Spec

**Data:** 10/05/2026
**Autor:** Junior Rodrigues + Claude (Opus 4.7)
**Status:** Aprovado para implementação
**Prazo total:** Express, 10-12 dias úteis até MVP rodando
**Repo alvo:** `ecosunpower-agente` (TypeScript + Express + Supabase + Anthropic)

---

## 1. Contexto e Motivação

A EcoSunPower acabou de colocar a Eva em Live no WhatsApp Cloud API (10/05/2026, App Review aprovado após 17 dias). O próximo gargalo é **trazer leads qualificados em volume e ao custo certo**, não mais responder.

A última campanha Meta rodada (Campanha 1, abril/2026) foi um fracasso completo:

- **CAC altíssimo** (gasto desproporcional ao retorno)
- **Volume péssimo** (uma única conversa real gerada)
- **Qualidade péssima** (lead queria ALUGAR TERRA pra usina solar grande, perfil completamente fora do ICP residencial/comercial)

A causa raiz combinada: criativo genérico, copy sem qualificar perfil, targeting Meta amplo demais, e nenhuma camada de qualificação antes de chegar na Eva.

A solução decidida: **construir uma equipe de 4 agentes IA** especializados em marketing, com Junior aprovando ações de risco financeiro/reputacional via WhatsApp, e tudo registrado em dashboard navegável.

## 2. Princípios

1. **Agentes IA fazem tudo que pode ser automatizado.** Junior faz só o que exige humano: decisões estratégicas, conhecimento técnico exclusivo, aprovações de risco.
2. **Aprovação humana sempre em ações que arriscam dinheiro ou reputação.** Nada vai pro ar/cliente sem botão clicado.
3. **Falha segura.** Agente IA com dúvida escalona pra Junior; nunca inventa.
4. **Reuso máximo.** Aproveitar `messaging`, `marketing.ts`, `ads-report.ts`, `meta-leadgen.ts`, `tavus.ts`, `dashboard/`, `supabase.ts` que já existem.
5. **Filosofia ROI:** investir pra ter retorno. Sem retorno claro, pausar.
6. **Cobertura do portfólio completo:** não só "energia solar" — campanhas separadas por categoria do portfólio (on-grid residencial, on-grid comercial, híbrido, off-grid, EV charger, manutenção).
7. **Critério mínimo de qualificação:** R$ 700/mês de conta OU 700 kWh/mês. Abaixo, descarte polido.

## 3. Arquitetura

```
                       ┌─────────────────┐
                       │ Junior (zap)    │
                       │ aprova/decide   │
                       └────────┬────────┘
                                │ botões
        ┌──────────┬────────────┼────────────┬──────────┐
        ▼          ▼            ▼            ▼          ▼
  [Criativo]  [Campanha]  [Qualif IG]  [Analista]
   gera       cria/ajusta  atende DM   relatório
   imagens    via Meta     antes do    semanal +
   + copies   Ads API      zap         alerta CAC
        │          │            │            │
        └──────────┴────┬───────┴────────────┘
                        ▼
              ┌──────────────────┐
              │  Supabase        │
              │  - leads         │
              │  - campanhas     │
              │  - criativos     │
              │  - dm_threads    │
              │  - performance   │
              └──────────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │  Eva (existente) │
              │  recebe lead     │
              │  qualificado     │
              └──────────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │  Dashboard       │
              │  Marketing       │
              │  (módulo novo)   │
              └──────────────────┘
```

Cada agente é um módulo TypeScript isolado em `src/modules/marketing/` (pasta nova), com interface clara, testável independentemente. Cron schedulers iniciados no `index.ts`.

## 4. Os 4 Agentes

### 4.1 Agente Criativo (`src/modules/marketing/creative-agent.ts`)

**Função:** gera pacote completo de criativo de anúncio (imagem + copy headline + copy body + CTA).

**Entradas:**
- Briefing do anúncio (ex: "telhado residencial Brasília", "comércio Goiás", "case sucesso GMN")
- Persona-alvo (selecionada de personas pré-definidas em tabela `marketing_personas`)
- Restrições (palavras proibidas: "alugar terra", "arrendar", "fazenda solar", "engenheiro")
- Contexto da marca (puxa de `prompts/system-prompt.md`)
- Cases de sucesso reais (puxa de tabela `cases` existente)

**Saídas por execução:**
- 3 variações de imagem (estilos: fotorealista, gráfico/infográfico, depoimento)
- 3 variações de copy (curto/médio/longo)
- 1 sugestão de CTA primário ("Falar no WhatsApp", "Pedir orçamento", "Ver projeto")
- Justificativa de cada escolha em 1 linha
- Tag de categoria do portfólio

**Stack técnica:**
- Texto: Claude Opus 4.7
- Imagem: Flux via Replicate (default), com fallback Unsplash + overlay (Junior prefere fotos reais conforme memória do blog)
- Storage: Supabase bucket `ad-creatives/`

**Fluxo aprovação WhatsApp (Junior):**

```
🎨 Novo pacote de criativo pronto pra Campanha "Residencial DF"

[ver imagem 1]  [ver imagem 2]  [ver imagem 3]
[ver copies]
[justificativa]

[✅ Aprovar tudo]  [⚙️ Editar copy]  [🔄 Regenerar]  [❌ Descartar]
```

**Salvaguardas:**
- Filtro automático antes do envio: rejeita criativo com palavras da blocklist
- Filtro de marca: barra "engenheiro" → força "Responsável Técnico CREA/CFT"
- Não publica em lugar nenhum sem aprovação Junior
- Toda geração logada em `marketing_creative_logs` (prompt, output, decisão)

### 4.2 Agente Campanha (`src/modules/marketing/campaign-agent.ts`)

**Função:** cria, monitora e otimiza campanhas no Meta Ads. Cada R$ tem que voltar.

**Cobertura do portfólio (1 campanha por categoria):**

| Cód | Campanha | Público |
|---|---|---|
| A | Residencial On-grid DF/GO | Casa, conta ≥ R$ 700 |
| B | Comercial On-grid | Loja/escritório/indústria pequena |
| C | Híbrido com baterias | Quem já tem solar ou foge tarifa branca |
| D | Off-grid | Sítio/fazenda sem rede |
| E | Carregador veicular EV | Proprietário BYD/Volvo/VW ID/GWM/Caoa Chery (não Tesla — minoria BR) |
| F | Manutenção | Quem tem solar de outra empresa |

Cada uma tem público, criativo, copy e qualificação **diferentes**. Sem misturar.

**Métricas monitoradas a cada 2h:**

| Métrica | Limite default | Ação |
|---|---|---|
| CPL (custo por lead) | > R$ 50 | Alerta zap |
| CPL crítico | > R$ 80 | Pausa criativo automaticamente, avisa Junior |
| CTR | < 0.8% | Marca "fraco", sugere variação |
| Conv → conversa Eva | < 30% | Marca lead-form "fraco" |
| Lead "fora de perfil" (Eva descarta) | > 40% | Sugere mudar targeting |

**Aprovações que SEMPRE precisam de Junior (botão zap):**
- Criar nova campanha (qualquer)
- Aumentar budget acima de +R$ 50/dia
- Mudar público-alvo
- Pausar campanha inteira

**O que faz sozinho (sem aprovar):**
- Pausar UM criativo específico com CPL crítico (proteção financeira)
- Reativar criativo pausado se métricas voltarem ao normal
- Logar tudo em `campanhas_logs` + `campanhas_decisoes`

**Stack técnica:**
- Meta Marketing API (Graph API com `ads_management` permission — **precisa novo App Review, 3-7 dias úteis**)
- Cron a cada 2h
- Modo "leitura+sugestão" enquanto `ads_management` não aprova: lê insights via permission existente, manda alertas, Junior pausa manual no Ads Manager. Vira automático quando aprovar.

### 4.3 Agente Qualificador IG (`src/modules/marketing/ig-qualifier.ts`)

**Função:** quando alguém clica anúncio Click-to-Message Instagram, IA atende NO PRÓPRIO DM. Qualifica em 3-5 mensagens curtas, encaminha pra Eva no WhatsApp se passar.

**Por que IG DM e não direto WhatsApp:**
- Fricção menor → mais cliques no anúncio (baixa CPL)
- Filtra cedo: lead "alugar terra" descartado em 2 mensagens
- Pessoa que vai pro zap chega pré-qualificada → Eva foca em fechar

**Fluxo (3-5 mensagens):**

```
Bot M1: "Oi! 👋 Aqui é a Eva da EcoSunPower. Você quer reduzir
        a conta de luz da sua CASA, do seu COMÉRCIO ou tem uma
        situação diferente?"
[🏠 Casa | 🏪 Comércio | 🏞️ Sítio | ⚡ Outro]

Bot M2: "Top! Você está em qual cidade? (Atendemos Brasília-DF
        e Goiás até 100 km do Entorno)"

Bot M3: "Perfeito, atendemos! Quanto vem por mês mais ou menos
        sua conta de luz?"
[até R$ 700 | R$ 700-1500 | R$ 1500-3000 | acima R$ 3000]

Bot M4 (se ≥ R$ 700): "Show, esse perfil tem economia muito
        boa. Pra eu te enviar uma simulação personalizada em
        5 minutos com fotos do material que usamos, posso
        continuar o atendimento no WhatsApp?"
[✅ Pode sim | ❌ Prefiro continuar aqui]

Se aceita: link wa.me com mensagem pré-preenchida + contexto
           da conversa salvo em Supabase pra Eva continuar
Se recusa handoff: Qualificador escala pra Junior responder
           manualmente no IG Inbox (Eva completa no IG está
           fora de escopo deste MVP — avaliar depois se demanda
           justifica). Junior recebe alerta zap com link da DM
Se < R$ 700: descarte polido (texto da memória project_criterio_qualificacao_lead.md)
```

**Critérios de descarte (não passa pra Eva):**
- ❌ Quer alugar/arrendar terra
- ❌ Fora da região DF/Goiás-100km
- ❌ Conta < R$ 700/mês residencial
- ✅ Demais → handoff zap

**Stack técnica:**
- Webhook Instagram Messaging: novo endpoint `/webhook-ig` no `index.ts`
- Permission: `instagram_manage_messages` (já incluída no caso de uso "Gerenciar mensagens e conteúdo no Instagram" aprovado em 10/05)
- Reuso: mesma `messaging` layer, novo adapter `instagram-direct.ts` similar ao `meta-whatsapp.ts`
- Estado: tabela nova `dm_threads` no Supabase (similar à `conversations`)
- Brain: Claude Haiku 4.5 (mais barato + rápido pra qualificação)

**Salvaguardas:**
- Limite 6 mensagens — se passou, escalação humana
- Cliente diz "quero falar com alguém" → escalação imediata
- Palavras-chave "reclamação", "ANEEL", "processo" → escalação humana

**Custo estimado:** ~R$ 0,02 por conversa (Haiku barato). 100 conversas/mês = R$ 2.

### 4.4 Agente Analista (`src/modules/marketing/analyst-agent.ts`)

**Função:** consolida dados de TODOS os outros agentes + Eva e gera insight acionável (não só relatório).

**3 cadências de output:**

**Diário 9h (zap):**
```
📊 Marketing 09/05 (resumo)

💰 Gasto: R$ 47,30
👥 Leads: 4 | CPL R$ 11,82 ✅ (meta R$ 25)
💬 Conversas Eva: 3 | Qualificados: 2
📋 Propostas geradas: 1 | Em fechamento: 1

🥇 Melhor: criativo "telhado-DF-v3" (CPL R$ 8,40)
⚠️  Pior: "comercial-loja-v1" (CPL R$ 28,90)

[Ver detalhes]  [Aprovar pausar pior]
```

**Semanal segunda 8h (zap longo):**
- Top 3 criativos da semana (com imagem + métrica)
- Bottom 3 com recomendação
- Distribuição de leads por categoria do portfólio
- Tendência de CAC (subindo/descendo/estável)
- Funil completo: lead → conversa → qualificado → proposta → fechado
- Recomendação principal da semana (1 ação)

**Mensal último útil (PDF salvo no Drive):**
- ROI por campanha (gasto × receita gerada)
- LTV estimado dos clientes adquiridos
- Saúde geral
- Comparativo com mês anterior

**Inteligência (correlações que olho humano demora):**

| Padrão | Sugestão |
|---|---|
| CTR alto + conversa baixa | "Imagem chama atenção mas copy não converte. Reformular copy." |
| Lead bom + Eva descarta muito | "Targeting amplo demais. Reduzir raio geográfico." |
| Conversa anda + proposta morre | "Proposta fora do esperado. Revisar Linha do Sol." |
| Quinta concentra leads bons | "Deslocar budget pra quinta." |
| Categoria sem lead | "Criar criativo específico ou pausar campanha." |

**Stack técnica:**
- Cron 3x/dia (8h semanal, 9h diário, 23h fim-de-mês)
- Lê: `meta_ads_insights`, `conversations`, `proposals`, `leads`, `campanhas_logs`, `dm_threads`
- Brain: Claude Opus 4.7 (raciocínio bom pra correlacionar)
- Outputs: WhatsApp (texto+botões) + PDF mensal salvo em Drive
- Estende `ads-report.ts` existente

**Salvaguardas:**
- Nunca toma ação direta (só Campanha pode pausar criativo). Analista sugere, Junior decide.
- Marca quando dados são insuficientes ("amostra pequena, esperar mais 1 semana")

## 5. Dashboard Marketing (extensão do `dashboard/` existente)

Página nova `/dashboard/marketing` com widgets:

| Widget | O que mostra |
|---|---|
| 📊 Hoje | Gasto, leads, CPL, conversas, propostas (números glance 2s) |
| 🚦 Saúde de campanhas | Cada campanha A-F do portfólio com bolinha verde/amarela/vermelha + CPL atual |
| 🥇 Top 5 criativos do mês | Imagem + headline + CPL — clica pra detalhe |
| 📉 Bottom 5 | Mesma coisa, com botão "Pausar" |
| 🔄 Funil | Lead → conversa → qualificado → proposta → fechado (números + setas) |
| 🚨 Alertas ativos | Tudo que precisa decisão (botão Aprovar/Pausar/Ver) |
| 📅 Histórico | Filtros: período, campanha, categoria, persona |
| 💡 Insights da semana | Recomendações do Analista, navegável |
| 🎨 Biblioteca de criativos | Todas imagens/copies geradas (status: rascunho/aprovado/em uso/pausado) |

**Mesmas ações disponíveis** no dashboard e no zap (mesmo endpoint backend → não há divergência).

## 6. Schema Supabase (mudanças)

### Novas tabelas
- `marketing_personas` — personas pré-definidas (residencial DF, comercial GO, fazendeiro off-grid, etc)
- `marketing_creatives` — pacote criativo gerado (imagens+copies+CTA+status)
- `marketing_creative_logs` — logs de geração (prompt, output, decisão)
- `marketing_campaigns` — campanhas A-F com estado, budget, criativos vinculados
- `marketing_campaign_logs` — todas decisões de pausar/escalar/alertar
- `meta_ads_insights` — snapshot 2h em 2h dos insights da Meta API
- `dm_threads` — conversas Instagram DM (similar à `conversations`)
- `marketing_alerts` — alertas pendentes ação Junior

### Tabelas modificadas
- `leads` — adicionar coluna `acquisition_source` (campaign_code), `acquisition_creative_id`
- `conversations` — adicionar coluna `dm_thread_id` (FK pra origem IG, opcional)

### Migrations necessárias
- `023_marketing_schema.sql` (todas as tabelas novas + colunas)
- ⚠️ Pré-requisito: Migration `022` (pendente da maratona 08/05) precisa ser aplicada antes em prod, senão schema fica inconsistente. Verificar com Junior antes de partir pra implementação

## 7. Roadmap Express (10-12 dias úteis)

### Dia 1-2 (Domingo 10/05 - Segunda 11/05) — Diagnóstico + Quick Win

**Entregas:**
- Auditoria PDF da Campanha 1 (Claude analisa via Meta API)
- 3 criativos manuais novos gerados pelo Claude (eu) e aprovados por Junior
- Nova campanha rodando com targeting cirúrgico + filtro de conta no lead form
- Baseline registrado no Supabase

**Junior:** ~30 min review + 10 min subir campanha junto comigo.

### Dia 3-5 (12-14/05) — Agente Criativo

**Entregas:**
- Migration 023 aplicada (parte de `marketing_creatives`, `marketing_creative_logs`, `marketing_personas`)
- `src/modules/marketing/creative-agent.ts` em produção
- Comando `/criativo` no zap (Junior pede pacote → recebe em 5 min)
- Submissão de `ads_management` no App Review (em paralelo, esperando 3-7 dias)

**Junior:** aprovar criativos via zap (30s cada), commits em prod.

### Dia 5-7 (14-16/05) — Qualificador IG DM

**Entregas:**
- Migration parcial (tabela `dm_threads`)
- `src/modules/marketing/ig-qualifier.ts` + adapter `instagram-direct.ts`
- Webhook `/webhook-ig` configurado e testado
- Anúncios Click-to-Message ativados (1 ou 2 pra teste)
- Handoff IG → WhatsApp funcional com contexto preservado

**Junior:** configurar Click-to-Message no Ads Manager (5 min), testar com zap próprio.

### Dia 8-10 (17-19/05) — Agente Analista + Dashboard Marketing

**Entregas:**
- Migration final (`meta_ads_insights`, `marketing_alerts`)
- `src/modules/marketing/analyst-agent.ts` em produção
- Cron 9h diário ativo
- Cron segunda 8h semanal ativo
- Dashboard `/dashboard/marketing` com todos widgets

**Junior:** revisar primeiro relatório semanal, calibrar limites.

### Dia 10+ (a partir de 20/05) — Sistema MVP rodando

**Estado:**
- 3 agentes 100% automáticos (Criativo, Qualificador IG, Analista)
- 1 agente em modo leitura+sugestão (Campanha) aguardando `ads_management` do Meta
- Dashboard navegável
- Aprovação contínua via zap

### Quando Meta aprovar `ads_management` (3-7 dias úteis a partir do dia 3-5)

**Entrega rápida:**
- Trocar config `CAMPAIGN_AGENT_MODE` de `read-only` pra `auto`
- Agente Campanha vira automático sem refazer código

## 8. Limites e Salvaguardas (consolidado)

**Aprovação humana SEMPRE em:**
- Criar/aumentar/reduzir orçamento de campanha (acima de +R$ 50/dia)
- Mudar público-alvo de campanha
- Pausar campanha inteira
- Publicar criativo novo
- Mudar critério de qualificação (R$ 700)

**Agente faz sozinho:**
- Pausar UM criativo com CPL crítico (proteção financeira)
- Gerar pacote criativo (não publica até Junior aprovar)
- Qualificar lead no IG DM (descartar fora de perfil)
- Gerar relatório

**Filtros automáticos (blocklist):**
- Palavras proibidas em copy: "alugar terra", "arrendar", "fazenda solar", "engenheiro" (sempre "Responsável Técnico CREA/CFT")
- Lead com critério < R$ 700 ou < 700 kWh: descarte polido com mensagem padrão

**Auditoria:**
- TODA decisão de agente logada em Supabase com timestamp, agente, input, output, razão
- Junior pode ver no dashboard "Histórico de decisões" filtrável

## 9. Métricas de Sucesso

**Curto prazo (até 31/05):**
- CPL médio < R$ 25 (vs Campanha 1 que era muito acima)
- 30+ leads/mês qualificados (≥ R$ 700)
- 50%+ taxa qualificação (lead chega → Eva confirma perfil)
- Zero leads "alugar terra"

**Médio prazo (até 31/07):**
- CAC < 10% do ticket médio de venda
- ROAS ≥ 3x (cada R$ 1 em ads gera R$ 3 em receita projetada)
- Funil estabilizado: 30% lead→conversa, 50% conversa→proposta, 20% proposta→fechado
- 5+ campanhas ativas cobrindo categorias diferentes do portfólio

**Saúde do sistema:**
- 95%+ uptime dos agentes
- < 24h tempo médio de aprovação Junior em criativo
- Zero ações "rogue" (agente fazendo coisa não autorizada)

## 10. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Meta atrasar `ads_management` | Média | Médio | Sistema funciona em modo leitura enquanto isso |
| Bug em produção em criativo público | Baixa | Alto | Toda publicação requer aprovação Junior |
| Custo Anthropic API descontrolado | Baixa | Médio | Quotas no código, alerta zap se > R$ 100/dia em IA |
| Concorrente copia criativos | Alta | Baixo | Aceitável — diferencial é qualidade, não segredo |
| Lead reclamar de "robô" | Média | Médio | Bot identifica como Eva (já reconhecida pelos clientes), tom humano, escalação fácil |
| Eva sobrecarregada com leads bons | Baixa | Bom problema | Já tem follow-up assistant + agendadora |
| Outras pendências param (Migration 022, Deye, etc) | Alta | Médio | Junior aceita explicitamente — marketing é prioridade declarada |

## 11. Out of Scope (Approach B do brainstorming, futuro)

Estes não fazem parte deste spec. Avaliados após Sistema MVP validado (provavelmente julho/2026):

- Agente Tendências (scraping de concorrentes + Canal Solar → input criativo)
- Agente Personas (lookalikes automáticos, mensagem variada por perfil)
- Agente Retargeting (clicou mas não converteu)
- Agente Video Editor (Tavus + ferramentas de corte)
- Email marketing
- Social listening (responder comentários IG/FB públicos)
- Análise de concorrentes
- Personas geradas dinamicamente (vs. pré-definidas)

## 12. Aprovações Meta Necessárias

| Permission | Status | Quando precisa |
|---|---|---|
| `instagram_manage_messages` | ✅ Aprovada (caso de uso "Gerenciar mensagens e conteúdo no Instagram") | Qualificador IG |
| `pages_messaging` | ✅ Disponível | Qualificador IG (IG roda sob Page) |
| `ads_read` | ✅ Disponível em `business_management` | Analista (insights) |
| `ads_management` | ⚠️ Submeter no App Review (3-7 dias úteis) | Agente Campanha modo automático |

## 13. Stack e Custos

**Stack:**
- TypeScript + Express + Supabase + Anthropic + Replicate (imagens) + Meta Graph API + Tavus (vídeo, futuro)

**Custos mensais estimados (em produção):**
- Anthropic API (4 agentes ativos): ~R$ 150-250/mês (depende do volume)
- Replicate Flux (geração imagem): ~R$ 50-100/mês (depende de quantos criativos)
- Tavus (já contratado): R$ 0 adicional (US$ 59/mês existente)
- Supabase: R$ 0 (free tier suporta)
- Meta Ads (orçamento aprovado): R$ 1.000-3.000/mês
- **Total adicional vs hoje: ~R$ 200-350/mês em IA**

**ROI esperado:**
- Se reduzir CPL de R$ ~80 (Campanha 1) pra R$ 25: 3x mais leads pelo mesmo dinheiro
- Se aumentar conversão lead→fechamento de 1% pra 5%: 5x mais clientes
- **Combinado: 15x mais clientes pelo mesmo gasto em ads**

## 14. Decisões pendentes (Junior decide quando começar implementação)

1. Imagem: Flux ou Imagen 4? (Default proposto: Flux via Replicate)
2. Limite default CPL crítico: R$ 80 (pode ajustar após primeiras 2 semanas com dados reais)
3. Horário do relatório diário: 9h (pode mudar pra 7h ou 11h conforme preferência)
4. Categorias do portfólio que rodam de cara vs depois: começar com A (Residencial DF/GO) e B (Comercial)? Ou abrir todas em paralelo?

---

**Aprovação Junior necessária antes de implementar.** Após aprovação, próximo passo é invocar a skill `superpowers:writing-plans` pra criar o plano detalhado de implementação dia a dia.
