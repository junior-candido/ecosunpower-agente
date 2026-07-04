# RH "Trabalhe Conosco" — página de vagas + banco de currículos + triagem com IA

**Data:** 2026-07-04 · **Aprovado pelo Junior:** "arrocha" (mesma conversa)

## O que é

Mini-ATS próprio da EcoSunPower (no estilo da plataforma: construir, não alugar):
página pública de vagas no site, formulário que guarda currículos, e seleção
de candidatos no dashboard com triagem por IA.

**Decisões do Junior (04/07):**
- Candidatura por **formulário no site** (WhatsApp/Eva fica pra fase futura).
- Vagas **cadastradas no dashboard** (abrir/fechar sem dev) + **Banco de Talentos**
  permanente (currículo sem vaga aberta).
- Triagem IA: **(a) nota+resumo na chegada** agora; **(c) busca esperta no banco**
  na sequência.

## Entregas (nesta ordem; cada uma = PR próprio, funcional sozinha)

### Entrega 1 — página + formulário + guardar + tela básica
1. **Banco (migration 068 — combinar número no grupo antes de aplicar):**
   - `rh_vagas`: id, titulo, descricao (texto livre), requisitos (texto), cidade,
     tipo (CLT/PJ/estágio/temporário), status (aberta/fechada), created_at.
   - `rh_candidatos`: id, vaga_id (null = banco de talentos), nome, telefone
     (normalizado com o `phone.ts` existente), email, curriculo_path (Storage),
     consentimento_em (timestamp do aceite LGPD), origem ('site'), status
     ('novo'|'triado'|'entrevista'|'aprovado'|'reprovado'), nota_ia (0-10, null),
     resumo_ia (texto, null), alertas_ia (texto, null), historico (jsonb de
     mudanças de status: quem, quando, de→pra), created_at.
   - Storage: bucket **privado** `curriculos` (PDF; acesso só via dashboard logado).
2. **Servidor (repo agente) — rotas públicas** (fora do auth do dashboard):
   - `GET /rh/vagas` → JSON das vagas abertas (a página do site consome).
   - `POST /rh/candidatura` (multipart) → valida (PDF real ≤5MB, campos
     obrigatórios, consentimento marcado, honeypot anti-spam + rate limit por IP),
     salva PDF no bucket + linha em `rh_candidatos`. Resposta JSON simples.
3. **Site (repo ecosunpower-site)** — página `/trabalhe-conosco` + item no menu:
   - Lista vagas abertas (fetch no navegador em `GET /rh/vagas`; se a API cair,
     mostra só o Banco de Talentos — página nunca quebra).
   - Formulário (nome, telefone, e-mail, vaga ou Banco de Talentos, PDF,
     checkbox de consentimento com texto curto de LGPD). Visual do site.
4. **Dashboard — seção "👥 RH"** (permissão própria `rh` no sistema de permissões
   existente; só admin vê por padrão):
   - **Vagas:** listar/criar/editar/abrir/fechar.
   - **Candidatos:** lista com filtros (vaga, status, cidade, data), funil
     Novo→Triado→Entrevista→Aprovado/Reprovado (mudança de status com registro
     no historico), abrir PDF (URL assinada temporária do Storage), botão
     WhatsApp (wa.me) e e-mail do candidato.

### Entrega 2 — triagem IA
- Ao chegar candidatura (e retroativo pros que já existirem): job assíncrono lê
  o PDF (mesma infra de leitura de documento que a Eva já usa), compara com
  titulo+requisitos da vaga (banco de talentos = avaliação genérica p/ energia
  solar) e grava `nota_ia` (0-10), `resumo_ia` (3 linhas) e `alertas_ia`.
- Lista de candidatos ganha ordenação padrão por nota; badge de nota colorida.
- Aviso no zap pro Junior quando candidato tira nota ≥8 (reusa o padrão de
  alerta admin existente).

### Entrega 3 — busca esperta no banco de talentos
- Campo de pergunta livre na tela RH ("quem tem NR-35 e mora no Gama?");
  IA vasculha os resumos/currículos guardados e devolve os candidatos com
  justificativa. (Detalhar quando chegar; provável reuso do padrão copiloto.)

## LGPD (simples e suficiente)
- Checkbox de consentimento obrigatório com texto claro (uso exclusivo p/
  recrutamento EcoSunPower).
- Retenção: currículo do **banco de talentos** apagado automaticamente após
  **12 meses** (cron diário, mesmo padrão de retenção da telemetria). Candidato
  de vaga segue o mesmo prazo após a vaga fechar.
- Bucket privado; PDF nunca exposto por link público permanente.

## O que NÃO entra agora (anotado pra não esquecer)
- Candidatura via WhatsApp/Eva; e-mail automático de confirmação ao candidato;
  página de status da candidatura; testes/perguntas de triagem no formulário.

## Riscos/cuidados
- Endpoint público de upload = porta de spam → honeypot + rate limit + validação
  de tipo de arquivo de verdade (magic bytes, não só extensão).
- Dois repos (site + agente): fazer primeiro o servidor (PR no agente), depois a
  página (commit no site) — a página degrada bem se a API ainda não existir.
- Migration 068: **combinar o número no grupo do zap antes de aplicar**.
