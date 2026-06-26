# EcoSunPower — Agente/CRM (instruções pro Claude Code e pro time)

Plataforma da EcoSunPower: agente de WhatsApp (Eva) + dashboard/CRM. TypeScript (Node, ESM — imports relativos terminam em `.js`), Supabase/Postgres, Express server-rendered + Tailwind/JS leve via CDN. Testes com **vitest**. Deploy: o **EasyPanel publica a branch `main`** do GitHub.

> 📖 **ANTES DE CRIAR QUALQUER COISA, leia [`docs/VISAO-GERAL-DO-SISTEMA.md`](docs/VISAO-GERAL-DO-SISTEMA.md)** — o mapa do que já existe (módulos, peças reusáveis, convenções). A regra é REUSAR, não recriar. Muita coisa já está pronta (telefone, cálculos solares, IA de lead, funil, proposta, banco) — duplicar gera bug.

## Como o time trabalha (somos 3, em máquinas diferentes)
- **Nunca trabalhe direto na `main`.** Sempre crie uma branch:
  `git checkout main && git pull && git checkout -b feat/<sua-tarefa>`
- Terminou a tarefa? Rode os testes, faça commit, `git push origin <branch>` e **abra um Pull Request (PR)** no GitHub. A junção na `main` é revisada — **o Junior é o dono da `main`**.
- **NUNCA pushe na `main` sem o Junior autorizar.** PR pequeno e frequente é melhor que PR gigante.
- `git add <arquivos por nome>` — **nunca** `git add -A` ou `git add .` (o repo costuma ter untracked irrelevantes).
- Termine a mensagem de commit com: `Co-Authored-By: <seu nome>`.

## Raias (cada um na sua área pra não colidir)
- **CRM / Dashboard:** `src/modules/dashboard/` — (Junior)
- **Eva / atendimento + proposta + financeiro:** `src/modules/` (fora de `dashboard/`) — (pessoa 2)
- **Site / calculadora / blog:** repositórios **separados** (`ecosunpower-site`, `produtos/calculadora-saas`) — (pessoa 3)

CRM e Eva estão no mesmo repo, mas em pastas diferentes → quase nunca batem. Se precisar mexer fora da sua raia, avise no grupo antes.

## Antes de abrir o PR (qualidade)
- **TDD:** escreva o teste primeiro, veja falhar, implemente o mínimo, veja passar.
- `npx tsc --noEmit` **limpo** e `npx vitest run` **verde**. (Há **2 falhas pré-existentes** em `tests/supabase-vincular-novo.test.ts` que NÃO são suas — ignore.)
- Faça **code review** do seu diff antes de pedir pra juntar.
- Texto que o cliente/usuário vê: **português claro, sem jargão**. O Junior assina como **"Responsável Técnico CREA/CFT"**, nunca "engenheiro".

## Banco de dados (migrations) — atenção redobrada em time
- Migrations ficam em `supabase/migrations/NNN_*.sql`, **numeradas**.
- **Antes de criar uma, combine o número no grupo do WhatsApp** ("vou usar a 058") — dois com o mesmo número = conflito feio.
- A migration é aplicada no Supabase (SQL Editor) **antes** do deploy.

## Rodar localmente
- `npm install` · `npm test` (ou `npx vitest run`) · `npx tsc --noEmit`.
- Testes e build rodam **sem segredo nenhum**. Rodar o app inteiro (Eva ao vivo) precisa das variáveis de ambiente — isso fica só com quem precisa.

## Coordenação
- Os Claudes de cada um **não conversam entre si** — cada um trabalha no seu repo. A sincronia é pelo **GitHub** (branches/PRs) e pelo **grupo do WhatsApp**.
- Quem juntar algo na `main` avisa no grupo; os outros dão `git pull`.
</content>
