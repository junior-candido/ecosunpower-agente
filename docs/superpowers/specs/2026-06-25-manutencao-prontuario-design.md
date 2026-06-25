# Spec — Gestão de Manutenção, peça 2a: Prontuário + Agenda da usina

**Data:** 2026-06-25
**Repo:** `ecosunpower-agente` (dashboard + Eva no mesmo Express)
**Autor do produto:** Junior · brainstorm com Claude
**Trilha:** Pós-venda / Relacionamento → (1) Eva Pós-venda ativa ✅ na main → **(2) Gestão de Manutenção** → (3) Portal do Cliente.
**Peça 2 decomposta:** **(2a) Prontuário + Agenda [esta spec]** → (2b) Ordem de Serviço técnica → (2c) Contrato recorrente.
**Depende de:** monitoramento (`sistemas_clientes`, `geracao_diaria`, `alertas_sistema`), pós-venda peça 1 (`/dashboard/pos-venda`, abordagem, timeline), Fase 1/2 do CRM (permissões, sidebar).

---

## 1. Princípio (cravado pelo Junior)
**A plataforma é a fonte de verdade; a API de monitoramento é só um acelerador.** Toda usina cadastrada (cliente + dados da usina) é acompanhada do mesmo jeito — **com ou sem API**. Tem inversor/plataforma ruim de liberar API; o pós-venda **não pode parar** por isso. Sem API, o responsável faz na mão (inclusive digitando a geração que a plataforma de origem mostra) e **tudo fica rastreável** (quem fez, quando, o quê).

## 2. O que JÁ existe (reusar, não reconstruir)
- `sistemas_clientes` (migration 021): usina — `lead_id`, `apelido`, `marca_inversor` (enum), `api_credentials` (jsonb, `{}` = sem credencial), `potencia_kwp`, `data_instalacao`, `cidade`, `uf`, `ativo`, `ultima_sincronizacao`.
- `geracao_diaria` (021): `sistema_id`, `data`, `geracao_kwh`, `fetched_source` (`'cron'` | `'manual_refresh'`) — **a leitura manual entra AQUI** (fonte nova `'manual'`), então saúde/relatório/trimestre já funcionam de graça.
- `alertas_sistema` (021): `manutencao_devida`, `queda_geracao`, etc. — **furam a fila** da agenda.
- `maintenance_reminders`: lembretes simples (`scheduled_date`, `topic`, `status='pending'`, `lead_id`) — hoje a tela `/manutencao` só LISTA (read-only). Migramos pro modelo novo (ver §5) e a tela vira gestão.
- Pós-venda peça 1: `/dashboard/pos-venda`, `pos-venda-saude.ts` (semáforo já trata "sem dados ≠ offline"), `registrarAbordagemManual`, timeline (`lead_atividades`).
- `numerosTrimestre`/`numeros-usina.ts` (puro): kWh+R$ de um período a partir de `geracao_diaria`.

## 3. Escopo desta peça (o que ENTRA)
1. **Modelo de manutenção** por usina (tipo, data agendada, status, data feita, quem fez, notas, origem) = agenda + histórico no mesmo lugar (o **prontuário**).
2. **Motor de agenda (regra (d))**: cadência por tempo (padrão global, **editável por usina**) + alertas de saúde furam a fila + agendamento manual. Marcou feita → agenda a próxima sozinho.
3. **Usina sem API = cidadã de 1ª classe**, com **selo visível "📵 Sem API · leitura manual"** em todo lugar que ela aparece (pós-venda, manutenção, monitoramento) pra quem olhar entender na hora.
4. **Leitura de geração manual** (modo (c)): botão "📊 Registrar leitura" sempre disponível **+** empurrão mensal pras usinas sem API. Grava em `geracao_diaria` (`fetched_source='manual'`) + **feedback** esperado×digitado.
5. **Tela/aba de Manutenção** (`/dashboard/manutencao` repaginada): agenda guiada por atenção (vencidas/próximas) + ações (agendar, marcar feita, registrar leitura) + prontuário por usina.
6. **Rastreabilidade**: toda ação (leitura, manutenção, agendamento) grava quem/quando + reflete na timeline do lead quando fizer sentido.

### Não-objetivos (ficam pra 2b/2c)
- Checklist técnico, fotos antes/depois, relatório PDF da visita = **peça 2b**.
- Contrato/plano recorrente pago, cobrança, renovação = **peça 2c** (esta peça já agenda a recorrência "técnica"; a parte comercial/financeira é a 2c).
- Portal do cliente = peça 3.
- Disparo automático do empurrão mensal pela Eva fora da janela 24h via template WABA (por ora o empurrão é um **alerta no painel** + o responsável manda manual).

---

## 4. Telas e fluxos

### 4.1 Tela de Manutenção `/dashboard/manutencao` (repaginada)
- Sidebar: já existe o item "🔧 Manutenção" (setor Operação). Gating `exigir('usinas','visualizar')` (hoje a rota não tem gate — adicionar).
- **Bloco 1 — Agenda guiada por atenção:** lista de manutenções **vencidas** (🔴) e **próximas** (🟡, ex. ≤30 dias), ordenadas por vencimento. Cada linha: usina (apelido + **selo sem-API** quando for o caso) · cliente · tipo (🧹/🔌/⚡/🔧/🔎) · data agendada · origem (regra/alerta/manual). Botões: **✓ Marcar feita** · **📅 Reagendar** · **📊 Registrar leitura**.
- **Bloco 2 — Leituras pendentes (usinas sem API):** as usinas manuais que estão sem leitura no mês corrente — o "empurrão mensal". Botão **📊 Registrar leitura** direto.
- **Bloco 3 — Agendar manual:** escolher usina + tipo + data → cria manutenção `agendada` origem `manual`.

### 4.2 Prontuário da usina
- Acessível pela tela da usina (`/dashboard/monitoramento/:id`) e/ou um link na agenda. Mostra:
  - **Próxima(s) manutenção(ões)** agendada(s).
  - **Histórico** (feitas): tipo · data feita · quem fez · notas.
  - **Cadência desta usina** (padrão global ou override) — editável aqui.
  - **Últimas leituras** (API + manuais, marcando a origem).

### 4.3 Marcar manutenção como feita
1. Clica **✓ Marcar feita** → mini-form: data (default hoje), quem fez (default usuário logado), notas (opcional).
2. Grava: status `feita`, `feita_em`, `feito_por`, `notas`.
3. **Auto-agenda a próxima** do mesmo tipo: `proxima = feita_em + cadência(tipo, usina)`. (Corretiva/inspeção não recorrem.)
4. Se havia alerta `manutencao_devida` aberto pra essa usina → resolve (`resolved_at`).
5. Registra na timeline do lead (`tipo: 'visita'`/`'nota'`, automatica:false, user_id).

### 4.4 Registrar leitura manual de geração
1. Botão **📊 Registrar leitura** (na agenda, no pós-venda, no prontuário) → form: competência (mês/ano, default mês corrente) + **kWh que a plataforma de origem mostra**.
2. Grava em `geracao_diaria` (`fetched_source='manual'`). Convenção: lançamento mensal → 1 registro no dia 1º do mês competência (ou distribui; **decisão no plano** — o mais simples é 1 linha "kWh do mês" no 1º dia, e `numerosTrimestre` soma normal).
3. **Feedback na hora** (função PURA, ver §6): compara com o **esperado** (`potencia_kwp × HSP_região × dias`) → devolve `{ status: 'ok'|'baixo'|'alto', pctDesvio, sugestao }`. Ex.: "25% abaixo do esperado 🧹 — vale oferecer limpeza" com atalho pro botão 🧹 do pós-venda.
4. Rastreável: quem digitou + quando (timeline opcional `nota`).

### 4.5 Selo "sem API"
- Componente visual reusável (badge) **"📵 Sem API · leitura manual"** exibido em: linha do pós-venda, linha/detalhe da manutenção, detalhe da usina. Critério: usina **sem credencial de API** (`api_credentials` vazio/`{}`) OU campo explícito `acompanhamento='manual'` (ver §5). Deixa óbvio pra qualquer um do time por que não há dado ao vivo.

---

## 5. Dados / migration (provável **migration 058** — confirmar nº no grupo)
Decisões a fechar no plano, mas a direção:
- **Usina manual de 1ª classe:** coluna `sistemas_clientes.acompanhamento text not null default 'api' check (acompanhamento in ('api','manual'))`. Manual = não entra no cron, leitura é digitada. (O selo usa isto; fallback: `api_credentials = '{}'`.) **Avaliar** liberar `marca_inversor='outro'` pra usina manual de marca fora do enum (add value no check).
- **Cadência por usina (override):** `sistemas_clientes.manutencao_cadencia jsonb` (ex. `{"limpeza_meses":3}`) OU tabela `manutencao_cadencia(sistema_id, tipo, meses)`. Default global no código.
- **Manutenções (o prontuário):** tabela nova `manutencoes`:
  - `id, sistema_id (fk), lead_id, tipo (check: limpeza|revisao_inversor|revisao_eletrica|corretiva|inspecao), status (check: agendada|feita|cancelada), origem (check: regra|alerta|manual), data_agendada date, feita_em date, feito_por (user), notas text, alerta_id (fk null), created_at, updated_at`.
  - Migrar os `maintenance_reminders` pendentes pra cá (best-effort) OU manter os reminders como estão e só construir o novo por cima — **decisão no plano** (preferência: tabela nova `manutencoes`, deixar `maintenance_reminders` quieto pra não quebrar o que existe).
- **Leitura manual:** reusa `geracao_diaria` com `fetched_source='manual'` — **sem coluna nova** (o check de `fetched_source` hoje é texto livre default 'cron'; confirmar que não há CHECK que bloqueie 'manual').

## 6. Funções PURAS testáveis (TDD)
- `proximaData(tipo, base: Date, cadencia) → Date | null` — agenda a próxima (null pra corretiva/inspeção).
- `cadenciaDaUsina(tipo, overrideUsina, padraoGlobal) → meses | null` — resolve cadência (override > padrão).
- `feedbackLeitura(kwhDigitado, potenciaKwp, hspRegiao, diasNoMes) → { status, pctDesvio, sugestao }` — esperado×real (limiares: baixo ≤ -15%, alto ≥ +15%).
- `statusAgendaItem(dataAgendada, hoje) → 'vencida'|'proxima'|'ok'` + `ordenarAgenda` — guiar por atenção.
- `precisaLeituraDoMes(usina, ultimaLeituraManual, hoje) → boolean` — quem entra no empurrão mensal (só usina sem API, sem leitura no mês corrente).

## 7. Arquitetura / arquivos
Novos (pequenos, isolados):
- `src/modules/dashboard/manutencao-motor.ts` — funções puras (§6).
- `src/modules/dashboard/manutencao-queries.ts` — agenda, prontuário, leituras pendentes (I/O).
- `src/modules/dashboard/manutencao-views.ts` — `renderManutencaoPage` (repaginada) + prontuário + selo sem-API.
- Rotas em `router.ts`: `GET /manutencao` (repaginada, gated), `POST /manutencao/agendar`, `POST /manutencao/:id/feita`, `POST /manutencao/:id/reagendar`, `POST /usinas/:sistemaId/leitura` (registrar leitura + feedback), `GET /monitoramento/:id` (injeta prontuário).
Modificados:
- `pos-venda-views.ts` / `pos-venda-queries.ts` — selo "sem API" na linha + botão "📊 Registrar leitura".
- `views.ts` — selo reusável (badge) + (se preciso) `active` cobre manutenção (já cobre).
- Migration nova (§5).

## 8. Testes e implantação
- **Testes (vitest, puros):** as 5 funções de §6 (cadência/override, próxima data, feedback de leitura, status da agenda, empurrão mensal). Review 3× + tsc limpo antes do push.
- **Implantação:** migration ANTES do deploy (confirmar nº no grupo). Push (com OK do Junior) → migration no Supabase → Implantar → smoke: cadastrar/abrir uma usina manual (ver selo), registrar leitura (ver feedback), marcar manutenção feita (ver auto-agenda da próxima + histórico no prontuário), ver agenda guiada por atenção.

## 9. Decisões fechadas no brainstorm
- Princípio "plataforma = verdade, API = acelerador; tudo funciona manual + rastreável".
- Trigger da agenda = **(d)** cadência por tempo + alertas furam fila + manual por cima.
- Tipos/cadências: limpeza 6m · revisão inversor 12m · revisão elétrica 12m · corretiva (sob demanda) · inspeção (avulsa). **Cadência padrão global, editável por usina.**
- Leitura manual = **(c)** botão sempre + empurrão mensal pras usinas sem API; entra em `geracao_diaria` (source manual) → reusa saúde/relatório.
- **Selo visível "sem API"** nas usinas manuais (pedido do Junior) pra o time entender.
- Ordem da peça 2: 2a [esta] → 2b OS técnica → 2c contrato recorrente.
