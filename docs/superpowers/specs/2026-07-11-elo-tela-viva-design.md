# Elo — Tela Viva do Cérebro (Parte C) — v1

**Data:** 2026-07-11
**Status:** Aprovado para virar plano
**Repo:** `ecosunpower-agente` · **Branch:** `feat/elo-tela-viva`
**Depende de:** Fatia 1 do Elo (espinha `eventos_elo` + máquina de e-mail) — já em produção.

---

## 1. Visão

A **Parte C** do Elo: a representação **viva e interativa** do ecossistema numa tela cheia, pra apresentação. O Elo no centro coordenando os **departamentos** (neurônios), sinais viajando, e — o coração desta fatia — o Elo **conversa**: entende a pergunta da pessoa e responde com **exatidão**, lendo o dado real (nunca inventa número).

Base visual: o protótipo já aprovado (`brain-elo.html`) — navy escuro, Elo dourado pulsando, departamentos coloridos, sinais viajando.

## 2. Escopo v1

**Entra:**
1. **Página em tela cheia** `/dashboard/cerebro` (sem sidebar, pra projetar) + botão **"🧠 Cérebro"** no dashboard pra abrir.
2. **Híbrido** — animação sempre viva (do protótipo) **+ números reais** por departamento, puxados do banco.
3. **Narração com base real** — o Elo fala frases derivadas dos dados reais ("Tô cuidando de 42 leads", "18 e-mails abertos essa semana") e, quando quieto, frases gerais de apresentação.
4. **Clique no departamento** → abre um painel lateral com os **números reais** daquela área + o Elo **explica em palavras** o que ela faz e como está.
5. ⭐ **"Pergunte ao Elo" (digitado)** — caixa na tela; a pessoa escreve, o Elo **entende (IA) + lê o dado real + responde com exatidão**. **Regra de ouro: NUNCA inventa número** — responde só com base no dado fornecido; se não tem, diz "ainda não tenho esse dado". (Mesmo DNA da trava de preço / "o motor faz a conta, a IA nunca inventa".)
6. **Ajuste de menu** (pedido junto): no setor "📊 Visão geral", **Home (Visão geral) vem ANTES do Cockpit**.

**NÃO entra (evolução):**
- Voz (falar em vez de digitar).
- Zoom nos sub-neurônios (chefe de 1000→100→10→5).
- Desenho anatômico de cérebro real (v1 mantém o layout neural radial aprovado).
- Auto-refresh em tempo real (v1 = carrega ao abrir + refresh manual/leve; live depois).

## 3. Arquitetura

```
  /dashboard/cerebro  (rota full-screen, gated por auth do dashboard)
        │
        ├── renderiza a tela (canvas do protótipo brain-elo) com os NÚMEROS REAIS embutidos
        │
        ├── cerebro-data.ts  → monta o "snapshot" do ecossistema (contagens reais)
        │      leads (total/por etapa) · conversas · propostas · usinas ·
        │      vendas · e-mails (eventos_elo) · total de eventos
        │
        └── POST /dashboard/cerebro/perguntar  → "Pergunte ao Elo"
               recebe a pergunta → monta contexto com o snapshot real →
               Claude responde GROUNDED (nunca inventa) → devolve o texto
```

### 3.1 Dados (o snapshot real) — `src/modules/dashboard/cerebro-data.ts`
Função `montarSnapshotElo(supabase)` que retorna um objeto com contagens reais, reusando queries/tabelas que já existem:
| Departamento | Fonte (tabela) | Números |
|---|---|---|
| 🎯 Comercial | `leads`, `propostas_publicas` | total de leads, em negociação, ganhos, propostas |
| 💬 Atendimento | `conversations` | conversas (ex: últimas 30d) |
| 📣 Marketing | `eventos_elo` | e-mails enviados/abertos/clicados, leads quentes |
| ⚡ Operação | `sistemas_clientes` | usinas monitoradas |
| 🤝 Relacionamento | `leads`/clientes, `manutencoes` | clientes, manutenções |
| 💰 Financeiro | `fechamentos` | vendas fechadas |
| 🧠 Elo (centro) | `eventos_elo` | total de eventos conectados |

Todas as contagens via `count: 'exact', head: true` (sem teto de 1000), best-effort (se uma falha, vira 0, não quebra a tela). Verificar nomes reais das tabelas/colunas no código antes de implementar (reusar o que o cockpit/funil já consulta).

### 3.2 A tela — `src/modules/dashboard/cerebro-views.ts`
- `renderCerebroPage(snapshot)` devolve o HTML **full-screen** (documento próprio, dark), baseado no `brain-elo.html`: canvas com Elo + departamentos, sinais viajando, rótulos com os **números reais** do snapshot, a barra de fala do Elo (frases derivadas do snapshot), o painel lateral (escondido, abre no clique), e a caixa **"Pergunte ao Elo..."**.
- Rota `GET /dashboard/cerebro` (gated `exigir('relatorios','visualizar')` ou área adequada — confirmar) monta o snapshot e renderiza. Full-screen: NÃO usa `renderLayout` (sem sidebar).
- Botão "🧠 Cérebro" adicionado no dashboard (topo ou no setor Visão geral) que abre `/dashboard/cerebro`.

### 3.3 "Pergunte ao Elo" — `src/modules/dashboard/cerebro-elo.ts` + rota
- `POST /dashboard/cerebro/perguntar` recebe `{ pergunta }`.
- `responderComoElo(anthropic, pergunta, snapshot)`:
  - System prompt: *"Você é o Elo, o cérebro do EcoSunPower. Responda a pergunta do usuário APENAS com base nos DADOS REAIS abaixo. NUNCA invente números nem fatos. Se a resposta não estiver nos dados, diga que ainda não tem esse dado. Seja claro, curto e caloroso, em PT-BR."* + o snapshot serializado como contexto.
  - Claude (Haiku/Sonnet) responde grounded.
  - **Trava de preço** aplicada na saída (reusa `aplicarTravaPreco`) por segurança.
  - Best-effort: se a IA falhar, devolve uma mensagem gentil ("Não consegui pensar agora, tenta de novo").
- Devolve JSON `{ resposta }`; a tela mostra na barra de fala do Elo.

### 3.4 Ajuste de menu
Em `views.ts` `SIDEBAR_SETORES`, setor "📊 Visão geral": inverter a ordem dos itens → **Home (Visão geral) antes de Cockpit**. (2 linhas.)

## 4. Precisão / segurança (o "com exatidão")
- O Elo **só afirma número que está no snapshot real**. O prompt proíbe inventar; se faltar dado, ele admite. Isso é o que garante a "exatidão" que o Junior pediu.
- Trava de preço na saída (nunca cravar valor).
- Página gated por auth do dashboard (interna). *(Link público pra apresentação sem login = evolução futura, com token.)*

## 5. Riscos
- **Espinha jovem:** `eventos_elo` ainda tem poucos eventos (e-mails começam segunda). Por isso o **híbrido**: a animação e as contagens de outras tabelas (leads/usinas/etc.) já deixam a tela rica hoje; os eventos de e-mail enriquecem ao longo da semana.
- **Nomes de tabela/coluna:** confirmar no código real antes de contar (reusar consultas do cockpit/funil; algumas contagens podem já existir prontas).
- **Custo IA:** cada "Pergunte ao Elo" é uma chamada Claude — ok pra uso de apresentação; se virar público, pôr limite.

## 6. Critérios de pronto (v1)
- [ ] `/dashboard/cerebro` abre em tela cheia com a animação do Elo + departamentos.
- [ ] Cada departamento mostra um número **real** do banco (snapshot).
- [ ] Clicar num departamento abre painel com números + explicação do Elo.
- [ ] "Pergunte ao Elo" responde com base no dado real; pergunta sem dado → ele admite (não inventa); teste com uma pergunta de número real e uma de dado inexistente.
- [ ] Botão "🧠 Cérebro" abre a tela a partir do dashboard.
- [ ] Menu: Home (Visão geral) antes do Cockpit.
- [ ] `tsc` limpo, testes verdes (lógica pura do snapshot + do grounding testável).
