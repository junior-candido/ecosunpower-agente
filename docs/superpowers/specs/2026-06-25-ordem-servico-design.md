# Spec — Gestão de Manutenção, peça 2b: Ordem de Serviço técnica

**Data:** 2026-06-25
**Repo:** `ecosunpower-agente`
**Autor do produto:** Junior · brainstorm com Claude
**Trilha:** Pós-venda → (2) Gestão de Manutenção → **(2b) Ordem de Serviço [esta]**. Antes: (2a) Prontuário+Agenda ✅ na main. Depois: (2c) Contrato recorrente.
**Depende de:** peça 2a (`manutencoes`, `marcarManutencaoFeita`, tela de manutenção), Supabase Storage de anexos (`uploadAnexo`), pipeline de PDF do relatório pós-instalação.

---

## 1. Modelo (cravado no brainstorm): "1 OS, 3 portas, 1 função que fecha"
A Ordem de Serviço é **uma entidade só** (`ordens_servico`) que **opcionalmente** aponta pra uma manutenção (`manutencao_id` nulo = avulsa). Três portas de entrada, sem sobrepor:
- **(a) "Feita com OS"** — a partir de uma manutenção agendada (caminho rico do "marcar feita").
- **(b) "Abrir OS"** — mesma coisa que (a), nome diferente (abre a OS de uma manutenção agendada).
- **(c) "Nova OS" avulsa** — sem manutenção atrás (corretiva que apareceu, visita avulsa) → `manutencao_id = null`.

**Uma única função fecha a OS** (`concluirOS`): se a OS está ligada a uma manutenção, ela chama o **mesmo `marcarManutencaoFeita()` da peça 2a** (auto-agenda a próxima + resolve alerta). Se é avulsa, só conclui a OS. **Zero lógica duplicada.** O "✓ Feita" rápido da peça 2a continua existindo pro caso simples (sem checklist/foto).

## 2. Checklist com item 3-em-1 (cravado pelo Junior)
Cada item do checklist tem um **tipo de item**: `check` (marca ✅) · `foto` (anexa imagem) · `medicao` (digita valor + unidade). Templates **fixos por tipo de manutenção** (o técnico preenche o que se aplica, pode pular):

- **🔌 revisao_inversor:** ✅ Leitura de erros/alarmes · ✅ Ventilação/temperatura · ✅ Teste de geração · 🔢 Medição CA (V/A) · 🔢 Medição CC (V/A strings) · 📷 Termografia
- **⚡ revisao_eletrica:** ✅ Verificação do quadro elétrico · ✅ Aperto dos bornes do quadro geral · ✅ Aterramento · ✅ Cabeamento/isolação · 📷 Foto do quadro elétrico geral · 📷 Termografia do quadro/conexões
- **🧹 limpeza:** ✅ Inspeção visual · ✅ Limpeza das placas · ✅ Estado das estruturas · 📷 Fotos de todos os módulos (antes/depois) · 🔢 Geração antes/depois
- **🔧 corretiva:** ✅ Diagnóstico · ✅ Peça trocada · ✅ Teste pós-conserto · 📷 Foto do problema/conserto
- **🔎 inspecao:** ✅ Visual geral · ✅ Pendências encontradas · 📷 Fotos dos módulos · 📷 Termografia · 🔢 Geração

Os templates vivem **no código** (módulo puro). Ao abrir a OS, o template do tipo é instanciado; o estado preenchido é salvo como **JSONB** na OS.

## 3. Escopo desta peça (o que ENTRA)
1. Entidade **`ordens_servico`** + **`os_fotos`** (migration 059).
2. **3 portas** (abrir de manutenção / nova avulsa) → mesma tela de OS.
3. **Tela da OS**: checklist por tipo (marca/foto/medição) + observações + **upload de fotos** (Supabase Storage) + **concluir**.
4. **Concluir OS** = `concluirOS` (única função; se ligada, reusa `marcarManutencaoFeita`).
5. **PDF/relatório pro cliente** (reusa o pipeline HTML→PDF do pós-instalação): cabeçalho EcoSunPower + dados da usina/cliente, ✅ itens feitos, 🔢 tabela de medições, 📷 galeria de fotos (incl. termografia), observações, assinatura "Responsável Técnico CREA/CFT".
6. **Botões no fluxo da 2a:** na agenda de manutenção, "Abrir OS" ao lado de "✓ Feita".
7. Rastreável: executor (quem), datas, fotos com legenda — tudo gravado.

### Não-objetivos (fora)
- Contrato/plano recorrente pago (peça 2c).
- App mobile/captura offline (o técnico usa o navegador do celular — responsivo basta).
- Assinatura digital do cliente no app (futuro; por ora o PDF é o entregável).
- Edição dos templates de checklist pela UI (são fixos no código nesta peça; editor é melhoria futura).

---

## 4. Telas e fluxos

### 4.1 Abrir a OS (as 3 portas)
- Na **agenda de manutenção** (2a): cada item agendado ganha **"📋 Abrir OS"** (porta a/b). POST → cria `ordens_servico` ligada (`manutencao_id`), redireciona pra `/dashboard/os/:id`.
- **"➕ Nova OS"** na tela de manutenção: escolhe usina + tipo → cria OS avulsa (`manutencao_id=null`), redireciona.

### 4.2 Tela da OS `/dashboard/os/:id`
- Cabeçalho: usina (apelido + selo sem-API se for) · cliente · tipo · status · executor.
- **Checklist** renderizado do template do tipo, hidratado com o que já foi salvo:
  - item `check`: checkbox.
  - item `medicao`: input numérico + unidade (V/A/kWh).
  - item `foto`: botão de upload (multipart) → mostra miniaturas das fotos já enviadas (de `os_fotos` com aquele `item_chave`).
- **Observações** (textarea).
- Botões: **💾 Salvar** (grava checklist+observações), **✅ Concluir OS**, **📄 Gerar PDF**.
- Salvar é incremental (não perde trabalho); concluir trava a edição.

### 4.3 Concluir OS
1. Grava checklist final + `status='concluida'` + `concluida_em` + `executor`.
2. Se `manutencao_id` != null → **`marcarManutencaoFeita(manutencao_id, { feitaEm, feitoPor, notas })`** (reuso 2a: auto-agenda próxima + resolve alerta). Notas = resumo da OS.
3. Registra na **timeline do lead** (`tipo:'visita'`, "OS concluída: <tipo>").
4. Oferece o **PDF**.

### 4.4 PDF/relatório
- `GET /dashboard/os/:id/pdf` → HTML do laudo → PDF (mesmo pipeline do pós-instalação).
- Conteúdo: logo + empresa, usina/cliente, data, ✅ itens, 🔢 medições, 📷 fotos (com legenda), observações, "Responsável Técnico CREA/CFT" (NUNCA "engenheiro").

### 4.5 Fotos
- Upload via `POST /dashboard/os/:id/foto` (multipart, reusa `uploadAnexo` → bucket de OS). Grava linha em `os_fotos` (os_id, item_chave, storage_path, legenda).
- Limite por foto (ex. 10MB) + tipos imagem. Best-effort: falha de upload não derruba a OS.

---

## 5. Dados / migration **059** (confirmar nº no grupo)
```
ordens_servico:
  id uuid pk, sistema_id uuid fk→sistemas_clientes (cascade),
  lead_id uuid fk→leads (set null), manutencao_id uuid fk→manutencoes (set null),
  tipo text check(limpeza|revisao_inversor|revisao_eletrica|corretiva|inspecao),
  status text default 'aberta' check(aberta|concluida|cancelada),
  checklist jsonb,            -- estado preenchido dos itens (marca/medição)
  observacoes text,
  executor uuid,              -- dashboard_users.id (sem FK rígida)
  aberta_em timestamptz default now(), concluida_em timestamptz,
  created_at, updated_at
  index (sistema_id, created_at desc); index (status) where status='aberta'

os_fotos:
  id uuid pk, os_id uuid fk→ordens_servico (cascade),
  item_chave text,           -- a qual item do checklist a foto pertence (ex 'termografia')
  storage_path text not null, legenda text, created_at
  index (os_id)
```
- Bucket de Storage pra fotos de OS (ex. `os-fotos`) — confirmar/criar no plano (reusa o helper de upload).

## 6. Funções PURAS testáveis (TDD)
- `templateChecklist(tipo) → ItemChecklist[]` — os templates por tipo (item: `{ chave, label, kind: 'check'|'foto'|'medicao', unidade? }`).
- `hidratarChecklist(template, salvoJson) → ItemPreenchido[]` — sobrepõe o estado salvo no template (não perde item novo do template).
- `progressoOS(itensPreenchidos) → { feitos, total, pct }` — % de conclusão (foto conta como feita se há ≥1 foto; medição se há valor; check se marcado).
- `resumoOS(itensPreenchidos) → { checks, medicoes, observacoesCount }` — alimenta o PDF e a `notas` da manutenção.

## 7. Arquitetura / arquivos
Novos:
- `src/modules/dashboard/os-checklist.ts` — puras (§6) + templates.
- `src/modules/dashboard/os-queries.ts` — I/O (criar/abrir, salvar, concluir, fotos, get).
- `src/modules/dashboard/os-views.ts` — `renderOSPage` (form) + `renderOSPdfHtml` (laudo).
- `supabase/migrations/059_ordens_servico.sql`.
Modificados:
- `router.ts` — rotas: `POST /manutencao/:id/os/abrir`, `POST /os/nova`, `GET /os/:id`, `POST /os/:id/salvar`, `POST /os/:id/foto`, `POST /os/:id/concluir`, `GET /os/:id/pdf`.
- `manutencao-views.ts` — botão "📋 Abrir OS" no item da agenda + "➕ Nova OS".
- `manutencao-queries.ts` — (se preciso) helper pra criar OS a partir de manutenção.

## 8. Testes e implantação
- **Testes (vitest, puros):** `templateChecklist` (cada tipo tem os itens certos com os kinds certos), `hidratarChecklist` (estado salvo sobrepõe, item novo do template aparece), `progressoOS` (contagem por kind), `resumoOS`. Review 3× + tsc limpo.
- **Implantação:** migration 059 + bucket de fotos ANTES do deploy. Push (com OK do Junior) → migration → Implantar → smoke: abrir OS de uma manutenção → marcar itens + medição + foto → concluir → ver manutenção virar feita + próxima agendada → gerar PDF e conferir o laudo.

## 9. Decisões fechadas no brainstorm
- "1 OS, 3 portas, 1 função que fecha" (`concluirOS` reusa `marcarManutencaoFeita` quando ligada).
- Checklist **item 3-em-1** (check/foto/medição), **fixo por tipo**, templates no código.
- Itens técnicos do Junior inclusos (termografia, medição CA/CC, quadro elétrico, aperto de bornes, fotos de todos os módulos).
- PDF reusa o pipeline do relatório pós-instalação; assinatura "Responsável Técnico CREA/CFT".
- Fotos no Supabase Storage (reusa `uploadAnexo`), referência em `os_fotos` por item.
- Ordem: 2a ✅ → **2b [esta]** → 2c contrato.
