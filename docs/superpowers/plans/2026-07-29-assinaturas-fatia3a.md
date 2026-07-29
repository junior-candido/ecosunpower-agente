# Assinaturas — Fatia 3a (travar/destravar de verdade: ponte calculadora + suspensão do tenant)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando a assinatura trava/destrava (motor, botão manual ou pagamento), o acesso REAL do assinante acompanha: calculadora via ponte servidor-a-servidor (repo calculadora-saas), monitoramento via `companies.ativo` + checagem no auth do dashboard.

**Architecture:** Agente ganha `src/modules/assinaturas-sync.ts` (`aplicarAcesso(client, assinatura, acao)`) chamado nos 3 pontos de mudança (rota manual de status, webhook de pagamento, trava do motor) — best-effort com aviso ao Junior no zap se a ponte falhar. Calculadora ganha `POST /api/acesso-sync` (token compartilhado `ASSINATURAS_SYNC_TOKEN`) que escreve no `store` de acesso existente (mesmo do webhook Kiwify); `validoAte` = vencimento + 4 dias serve de rede de segurança se a ponte cair. Tenant do monitoramento: `getUserById`/`getUserByLoginTodasEmpresas` passam a exigir `companies.ativo` (a EcoSun está sempre ativa). Form Nova assinatura ganha o select de empresa (tenant) pro produto monitoramento.

**Envs novas:** agente: `CALCULADORA_URL` + `ASSINATURAS_SYNC_TOKEN` · calculadora: `ASSINATURAS_SYNC_TOKEN` (o mesmo valor).

---

### Task 1 (repo calculadora-saas, branch `feat/acesso-sync-assinaturas`): endpoint `/api/acesso-sync`
- [ ] Teste em `tests/server/acesso-sync.test.ts` (padrão dos testes de server existentes): 401 sem token; 503 sem env; liberar grava status ativa + validoAte; travar grava cancelada.
- [ ] Em `app.ts`, perto do webhook Kiwify: valida `x-sync-token` contra `process.env.ASSINATURAS_SYNC_TOKEN`, body `{email, acao: 'liberar'|'travar', validoAte?}` → `store.set({email, status: acao==='liberar' ? 'ativa' : 'cancelada', origem: 'assinaturas-ecosun', validoAte, atualizadoEm})`.
- [ ] Testes verdes + tsc/build do repo. Commit (push só com ok).

### Task 2 (agente): `assinaturas-sync.ts` (TDD)
- [ ] `aplicarAcesso(client, a: AssinaturaRow, acao, deps?)`:
  - produto `calculadora` + email: POST `${CALCULADORA_URL}/api/acesso-sync` com token; validoAte = venceEm+4d em 'YYYY-MM-DD'; sem env → skip silencioso; falha → console.error + `deps.avisarFalha?.(texto)`.
  - produto `monitoramento` + companyId: `client.from('companies').update({ativo: acao==='liberar'})...eq('id', companyId)`.
- [ ] Testes: fetch chamado com token/corpo certo; monitoramento faz update; falha da ponte chama avisarFalha e não explode.

### Task 3 (agente): tenant travado não loga
- [ ] `users-store.ts`: selects trazem `companies:company_id (nome, ativo)`; `montarDashUser` inalterado; `getUserById` e `getUserByLoginTodasEmpresas` filtram fora user cuja company tem `ativo === false`. Teste com mock.

### Task 4 (agente): pontos de chamada + empresa no form
- [ ] Rota `/assinaturas/:id/status`: após `setStatusAssinatura`, chamar `aplicarAcesso` (liberar/travar) com avisarFalha → zap do Junior via `options`? (rota não tem sendText — usar `console.error` + aviso na tela: query `?erro=`). Simples: se `aplicarAcesso` devolver false, redirect com aviso "status mudou, mas a ponte falhou".
- [ ] Webhook (index.ts): após `renovarAssinatura`, `aplicarAcesso(client, assinatura, 'liberar')` (avisarFalha → sendText Junior).
- [ ] Motor (index.ts): dep `travar` → setStatus + `aplicarAcesso(..., 'travar')` (avisarFalha → sendText Junior).
- [ ] Form Nova assinatura: select "Empresa (tenant) — só pro monitoramento" carregado de `companies` (id+nome); rota grava `companyId`. Store `listarEmpresas(client)` simples.

### Task 5: verificação
- [ ] tsc + suíte inteira nos DOIS repos; revisar diffs; push/PR só com ok (lembrar envs novas nos DOIS deploys).
