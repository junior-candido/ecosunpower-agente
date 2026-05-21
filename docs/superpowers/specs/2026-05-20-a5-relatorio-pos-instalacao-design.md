# A5 — Relatório Pós-Instalação Automático

**Data:** 2026-05-20
**Status:** design aprovado
**Frente:** Perfil do Cliente (5ª sub-fatia após A1 entregue hoje)

## Contexto

Hoje quando o cliente termina a obra e a concessionária troca o medidor, não há entrega formal pra ele do que foi feito. EcoSun perde oportunidade de:
- Documentar a entrega com fotos profissionais
- Reforçar marca premium (relatório branded vai ser compartilhado por ele)
- Fechar a "jornada" do cliente com algo memorável

Esta fatia entrega: quando `installation_status` muda pra `medidor_trocado`, Eva notifica Junior no zap. Junior abre uma tela simples, faz upload das fotos curadas da obra, escreve mensagem opcional, gera preview e envia. Link público vai pro cliente pelo WhatsApp. Reusa template S3 já em prod.

## Decisões fechadas

| Decisão | Resposta |
|---|---|
| Trigger | Auto (cron detecta `medidor_trocado` + notifica Junior) **+** manual (botão no perfil) |
| Fotos | Upload na hora pelo Junior (não puxa anexos pré-existentes) |
| Mensagem | Texto livre opcional do Junior |
| Refazer | Pode gerar quantas versões quiser, cada uma é uma row nova |
| TTL do link | Sem expiração (cliente volta quando quiser) |
| Envio | Eva manda no WhatsApp do cliente após Junior aprovar |
| Storage | Bucket `client-attachments`, subpath `<leadId>/pos_instalacao/<uuid>.ext` |

## Arquitetura

### Migration `034_relatorios_pos_instalacao.sql`

```sql
-- Adiciona timestamp pra rastrear envio
alter table leads add column if not exists post_install_report_sent_at timestamptz;

-- Tabela de relatórios (versioning — cada geração é uma row nova)
create table relatorios_pos_instalacao (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  slug text not null unique,                -- nano-id pra URL pública
  mensagem_personalizada text,
  data_instalacao date,
  fotos jsonb not null default '[]',         -- [{storage_path, signed_url_at_create}]
  enviado_em timestamptz,                    -- quando Junior clicou "enviar"
  enviado_para_phone text,                   -- snapshot do phone do cliente no envio
  created_at timestamptz not null default now(),
  created_by text default 'junior'
);
create index relatorios_pi_by_lead on relatorios_pos_instalacao (lead_id, created_at desc);
```

### Módulos novos

- `src/modules/relatorios/pos-instalacao/types.ts` — `RelatorioPosInstalacao`, `FotoEntry`, `DraftInput`
- `src/modules/relatorios/pos-instalacao/template.ts` — `renderPosInstalacaoHtml(data) → string` (branded, dark/claro, fotos em grid responsivo, garantia EcoSun)
- `src/modules/relatorios/pos-instalacao/service.ts` — `PosInstalacaoService`:
  - `criarDraft(lead_id, mensagem, dataInstalacao, fotosBuffers) → { id, slug }` (faz upload das fotos + grava row)
  - `getBySlug(slug) → RelatorioPosInstalacao | null`
  - `getByLeadId(lead_id, limit) → RelatorioPosInstalacao[]`
  - `enviarPorWhatsApp(id, sendText) → void` (Eva manda link)
- `src/modules/relatorios/pos-instalacao/cron.ts` — `detectarMedidorTrocadoSemRelatorio(supabase) → leads[]` + função pra notificar Junior

### Modificações em arquivos existentes

- `src/modules/supabase.ts` — métodos: `getLeadsMedidorTrocadoSemRelatorio`, `criarRelatorioPosInstalacao`, `getRelatorioPosInstalacaoBySlug`, `listRelatoriosPosInstalacaoByLead`, `marcarRelatorioEnviado`
- `src/index.ts` — registra cron `processPostInstalacaoNotifs` (1x/hora durante janela horária)
- `src/modules/dashboard/router.ts` — 3 rotas:
  - `GET /clientes/:id/relatorio-pos-instalacao/novo` (form upload)
  - `POST /clientes/:id/relatorio-pos-instalacao` (submit + preview)
  - `POST /clientes/:id/relatorio-pos-instalacao/:relatorioId/enviar` (envia pelo zap)
- `src/index.ts` — rota pública `GET /r-pi/:slug` (sem auth, página HTML pública)
- `src/modules/dashboard/clientes-views.ts` — botão "📋 Gerar relatório pós-instalação" no header do perfil
- `src/modules/eva-admin-buttons.ts` — handlers `pi-gerar:<leadId>` (responde com link admin), `pi-pular:<leadId>` (marca lead.post_install_report_sent_at=null pra não notificar de novo)

### Fluxo end-to-end

```
Junior muda installation_status pra 'medidor_trocado' (manual ou Eva)
         ↓
Cron horário detecta lead com medidor_trocado + post_install_report_sent_at IS NULL
         ↓
Eva manda mensagem no zap do Junior com botões:
  "📋 Cliente Fernanda teve medidor trocado. Gerar relatório?"
  [Gerar agora] [Mais tarde] [Pular]
         ↓
Junior clica [Gerar agora] (ou botão no perfil cliente)
         ↓
Abre /dashboard/clientes/<id>/relatorio-pos-instalacao/novo
  Form: upload múltiplo fotos + mensagem opcional + data instalação
         ↓
Junior preenche e clica "Gerar preview"
  Backend: upload fotos pro bucket + insert em relatorios_pos_instalacao + redirect pra preview
         ↓
Tela preview: relatório renderizado + botão "Enviar pro cliente" + "Editar"
         ↓
Junior clica "Enviar pro cliente"
  Backend: marca enviado_em + lead.post_install_report_sent_at + Eva manda link no zap do cliente
         ↓
Cliente recebe no WhatsApp:
  "🎉 [Nome], parabéns! Seu sistema foi ativado pela concessionária.
   Preparei um relatório com o que foi feito na sua obra:
   https://propostas.ecosunpower.eng.br/r-pi/<slug>
   Qualquer dúvida tô aqui pra ajudar."
         ↓
Cliente abre link → vê página branded com fotos + dados técnicos + garantia
```

### Conteúdo do template

```
Header: logo EcoSun + nome cliente + data
↓
Seção "🎉 Seu sistema está ativo!"
  Mensagem personalizada (se Junior preencheu)
↓
Galeria de fotos (grid responsivo, lightbox no clique)
↓
Dados técnicos (do sistemas_clientes vinculado):
  - Potência kWp
  - Quantidade de painéis + marca
  - Inversor (marca + modelo)
  - Data da instalação
  - Data do medidor trocado
  - Concessionária + UC
↓
Garantia EcoSun:
  - Instalação/serviço: 12 meses (Responsável Técnico CREA/CFT)
  - Equipamentos: seguir fabricante
↓
Footer: contato + redes sociais + CTA "Quer indicar alguém? [link wa.me]"
```

## Segurança e edge cases

| Cenário | Comportamento |
|---|---|
| Cliente em opt_out | Eva NÃO envia. Junior é avisado: "Cliente em opt-out — copie o link manualmente." |
| Cliente sem phone | Mesma coisa, copia link manual |
| Lead sem sistema vinculado | Bloqueia com aviso "Vincule sistema antes" |
| Upload falha pra 1 foto de N | Outras seguem; mostra warning |
| Cron roda fora da janela horária (madrugada) | Notificação fica enfileirada pro horário comercial (mesma janela do M6) |
| Junior clica "Pular" | Marca `post_install_report_sent_at = epoch dummy` (1970-01-01) pra não notificar de novo |
| Botão Gerar manual numa fatia que já tem relatório enviado | Cria nova versão (versionada na tabela) |

## Testes

- `template.test.ts` — render com 0/1/5 fotos, com/sem mensagem, com/sem sistema vinculado
- `service.test.ts` — criarDraft mock supabase + storage; getBySlug; enviarPorWhatsApp valida opt_out
- `cron.test.ts` — detectarMedidorTrocadoSemRelatorio retorna lista certa; não retorna leads com report_sent_at preenchido
- `router.test.ts` — placeholder (smoke valida tela)

## Deploy

1. Junior aplica `034_relatorios_pos_instalacao.sql` no SQL Editor
2. Push, Easypanel Implantar
3. Smoke: cria draft de teste, envia pro próprio telefone, vê chegar
4. Marca 1 cliente como `medidor_trocado` → espera cron → checa notificação no zap

## Fast-follows

- Notificações WABA com botões reais (não só sendText) — depende de templates Meta aprovados
- Preview WhatsApp do link (rich preview com 1ª foto + nome cliente)
- PDF download do relatório (botão na tela pública)
- Versão "1 ano depois" — cron anual envia "como tá indo seu sistema?" com link do relatório histórico
- Métricas: quantos relatórios abriram (igual S3)
