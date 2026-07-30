# Diário de Serviços — F1 (registro de campo mobile)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela 🔧 Serviços no dashboard (mobile-first): novo registro com tipo, cliente (busca ou cria na hora), usina opcional, fotos (comprimidas ~1600px) e até 2 vídeos (subida direta pro Storage via URL assinada), lista de registros e bloco na ficha do lead. Área de permissão nova `servicos` (papel "Campo" vê só isso).

**Architecture:** Mesmo trio das telas recentes (store/views/router) + área nova em `permissions.ts` (o editor de papéis lista as áreas dinamicamente — aparece sozinha). Mídia: reusa o bucket `client-attachments` (já existe em prod, padrão `anexos/storage.ts`) com paths `<leadId>/servico/<servicoId>/<uuid>.<ext>`; o navegador sobe DIRETO pro Storage com `createSignedUploadUrl` (vídeo de 100MB não passa pelo Express), depois confirma → linhas em `servico_fotos`. Cliente novo na hora via `supabaseService.getOrCreateLeadByPhone` (dedup 9º dígito).

**Spec:** `docs/superpowers/specs/2026-07-29-diario-servicos-design.md`

---

### Task 1 — Migration 092 (combinar número no grupo!)
`supabase/migrations/092_servicos.sql`: `servico_tipos` (id slug PK, nome, ativo, seed: visita-tecnica, instalacao-fv, termino-instalacao, manutencao-limpeza, projeto-eletrico, padrao-entrada, reforma-quadro, laudo-vistoria, outro — global, RLS sem política + entrar nas 2 ALLOWLISTs da guarda com motivo) · `servicos` (id, company_id, tipo_id→servico_tipos, lead_id NOT NULL→leads, sistema_id→sistemas_clientes NULL, observacoes text, data_servico date NOT NULL, criado_por→dashboard_users, criado_em; índices lead/sistema/data; RLS company_isolation padrão 089) · `servico_fotos` (id, servico_id NOT NULL→servicos, company_id, storage_path text NOT NULL, tipo_midia text CHECK foto|video default foto, legenda, ordem int default 0, criado_em; RLS idem). Rodar guarda → verde. Commit.

### Task 2 — Área `servicos` nas permissões
`permissions.ts` AREAS ganha `'servicos'`. Teste: can() com papel só-servicos permite servicos e nega leads. Commit.

### Task 3 — Store (TDD, mock chainable)
`servicos-store.ts`: `listarTipos` · `criarServico(client, d)` (insert, devolve id) · `listarServicos(client, {limite})` (join tipo nome + lead nome, ordem desc data) · `servicosDoLead(client, leadId)` · `registrarMidias(client, servicoId, companyId, midias[{path,tipoMidia}])` · `midiasDoServico` + assinatura de leitura via `getSignedUrls` do anexos/storage (TTL 1h). Testes de cada um. Commit.

### Task 4 — Views mobile-first (TDD de render)
`servicos-views.ts`: `renderServicosPage(tipos, servicos, user, aviso?)` — lista cards (data, tipo, cliente, nº fotos/vídeos) + botão grandão "➕ Novo registro"; `renderNovoServicoPage(tipos, user)` — form mobile: select tipo, busca de cliente (input + resultados via fetch; botão "➕ cliente novo" abre nome+telefone), usina opcional (busca), data, observações, anexos foto (comprime 1600px igual coleta) e vídeo (máx 2, aviso de tamanho), barra de progresso de subida, JS: 1) POST /dashboard/servicos/nova (JSON sem arquivos) → {id, uploads[]} 2) PUT de cada arquivo pra URL assinada 3) POST confirmar-midias → redirect lista. Testes: contém form, campos, limites. Menu: item `{href:'/dashboard/servicos', key:'servicos', label:'🔧 Serviços', area:'servicos'}` no setor Operação + union `active`. Commit.

### Task 5 — Rotas
Router (gate `exigir('servicos', ...)`): GET `/servicos` (lista) · GET `/servicos/novo` · GET `/servicos/buscar-cliente?q=` (JSON top 8 leads da empresa por nome/telefone, `bancoDoOperador`) · GET `/servicos/buscar-usina?q=` (idem sistemas) · POST `/servicos/nova` (JSON: tipo, leadId OU {nome, telefone} → `supabaseService.getOrCreateLeadByPhone`, sistemaId?, obs, data, midias[{nome,tipoMidia,contentType}] → valida máx 2 vídeos → cria servico → `createSignedUploadUrl` por mídia no bucket client-attachments path `<leadId>/servico/<servicoId>/<uuid>.<ext>` → {id, uploads}) · POST `/servicos/:id/confirmar-midias` (registrarMidias das que subiram) · GET `/servicos/:id` (detalhe com fotos/vídeos via signed URLs). tsc + testes + commit.

### Task 6 — Ficha do lead
Achar a view de detalhe do lead e inserir bloco "🔧 Serviços" (lista compacta servicosDoLead com link pro detalhe). Se o ponto de inserção for arriscado, adiar pra F2 com nota no PR. Commit.

### Task 7 — Verificação
tsc limpo + suíte inteira verde + revisar diff + push/PR **só com ok do Junior** (avisar: migration 092 antes do deploy; bucket já existe, sem setup novo).
