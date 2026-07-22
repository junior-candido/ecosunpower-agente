# 06 — Eva multi-tenant: ligar a `RLS_EVA` (checklist de ativação)

> Estado em 21/07/2026: fatias 3a (núcleo, #120), 3b (actions, #121), 3c
> (helpers, #122), 3d (singletons, #131) e 3e (carimbos + blindagem) COMPLETAS.
> Com a flag DESLIGADA tudo roda byte-idêntico ao legado (paraMensagem devolve
> a MESMA instância — provado por teste).

## O que a flag faz

`RLS_EVA=1` + env completa + `companyId` resolvido pelo webhook → o caminho da
MENSAGEM (texto/áudio/imagem/vídeo/documento/localização, actions, helpers,
singletons) roda com o **crachá do tenant** (JWT `authenticated` com claim
`company_id`, RLS 079 impõe o isolamento). Crons, endpoints HTTP e comandos de
admin seguem no service_role de propósito (são multi-tenant por natureza).

Escritas que CARIMBAM empresa (dossiê, eventos do Elo, anexos de mídia,
fallback-INSERT de lead) usam `db.companyIdDaMensagem ?? ECOSUN_COMPANY_ID` —
o carimbo nasce JUNTO com o crachá em `paraMensagem` (nunca dessincroniza).
Storage (upload de anexo) fica SEMPRE no serviço — a 079 não cobre
`storage.objects` (lição do currículo do RH, 18/07).

## Checklist pra ligar (ordem)

1. **Env no EasyPanel** (as 2 primeiras já estão desde a Fase B/18-07):
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_JWT_SECRET`
   - `RLS_EVA=1` (a nova)
2. **Implantar** e conferir `/health`.
3. **Prova de vazamento do caminho da Eva** (gap conhecido, ver abaixo): até o
   CI ganhar a prova específica, validação manual mínima —
   - mandar mensagem de teste no número da EcoSun → lead/conversa/evento
     gravados normalmente (EcoSun é tenant como qualquer outro sob a flag);
   - monitorar logs por `42501` (RLS negou — algo sem carimbo) e por
     `[action][3e] ... atualizou 0 linhas` (lead fora do tenant).
4. **Rollback:** apagar `RLS_EVA` do EasyPanel + Implantar (volta ao legado
   idêntico na hora).

## Gap conhecido (fazer antes do tenant #2 REAL)

- ✅ **FECHADO 22/07** — prova de vazamento do caminho da Eva no CI:
  `scripts/teste-vazamento-ci.ts` provas 6-10 — dossiê/evento SEM company_id
  sob crachá A é REJEITADO (default EcoSun bate no WITH CHECK = fail-closed);
  COM carimbo de A entra, e crachá B lê 0. Roda em todo PR (gate do merge).
- Leituras de contexto da conversa (histórico etc.) fora do escopo das fatias
  3a-3e continuam no serviço — inofensivas com 1 tenant ativo; revisar quando
  o tenant #2 tiver WhatsApp próprio mapeado (`companies.waba_phone_number_id`).

## Referências

- Plano rota-a-rota do dashboard: `docs/ecosof/05-fase-b-plano.md` (nota: as
  seções sobre "Eva full-bypass" descrevem o estado ANTES das fatias 3a-3e).
- Testes-guarda das fatias: `tests/eva-mt-fatia3a.test.ts`.
- Trilhos: `src/modules/tenant-client.ts` (crachá) e
  `src/modules/supabase.ts` (`comClient`/`paraMensagem`/`companyIdDaMensagem`).
