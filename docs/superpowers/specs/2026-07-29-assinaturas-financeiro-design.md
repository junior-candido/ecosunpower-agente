# Assinaturas — central de mensalidades no Financeiro (design)

**Data:** 29/07/2026 · **Decidido com o Junior na conversa da noite** (após a cobrança
avulsa InfinitePay entrar no ar e ser testada com R$ 1,00 real — PR #170).

## O problema

Os produtos da casa viraram mensalidade e cada um cobra de um jeito:

- **Calculadora** (SaaS): assinantes pagam pelo Kiwify (~R$ 57/mês — valor a
  confirmar com o Junior; fica configurável).
- **Monitoramento** (Sabion/SunBright): R$ 297/mês, preço de fundador combinado
  com o Thiago (até 80 usinas) — hoje sem cobrança nenhuma no sistema.
- Serviços avulsos: página Cobrar (InfinitePay), já no ar.

Não existe um lugar onde o Junior veja quem paga o quê, quem está vencendo e
quem deve — nem renovação automática. Se o cliente não paga, nada trava.

## A visão (frase do Junior)

"Tudo automático, com avisos antes — mas que tenha opção de eu fazer manual,
caso dê algum problema." Primeiro **tudo na área dele** (Fase 1); depois
aparece **na área do cliente** (Fase 2).

## Fase 1 — tela "Assinaturas" no setor 💰 Financeiro do dashboard

### Produtos e valores
- Cadastro de produtos com valor padrão mensal: **Calculadora** (R$ 57 — confirmar)
  e **Monitoramento** (R$ 297). Editável na tela, sem deploy.
- Cada assinante pode ter **valor próprio** (negociado — caso Sabion/fundador).

### A tela
- Lista de assinantes: produto · valor · situação (🟢 ativa · 🟡 vencendo ·
  🔴 vencida · ⛔ travada) · vence quando · zap confirmado?
- **Botões manuais** (a rédea do Junior, pedido explícito):
  - **➕ Nova assinatura / cobrança manual**: produto ou descrição livre +
    valor negociado + cliente → gera e envia na hora.
  - **Gerar cobrança agora** (link novo pro assinante — ex: link vencido).
  - **Liberar** (pagou por fora / cortesia) · **Travar** (reembolso/problema).
  - **Editar** valor e número de zap do assinante.

### O motor automático (cron diário)
Régua definida pelo Junior:
1. **8 dias antes** do vencimento: gera o link InfinitePay da renovação e envia.
2. **2 dias antes**: lembrete (mesmo link).
3. **Venceu**: 3 dias de tolerância, com último aviso "seu acesso será suspenso".
4. **Venceu + 3 dias sem pagar: trava o acesso.**
- Pagou em qualquer ponto: renova +1 mês a partir do vencimento, destrava se
  estava travado, e o Junior recebe o "💰 Pagamento confirmado!" no zap
  (mecânica do webhook já no ar).

### Canais de aviso ao assinante
- **E-mail sempre** (motor de e-mail bonito já existe — reusar).
- **Zap também, quando o número estiver confirmado.** Sem zap confirmado →
  só e-mail; ninguém fica sem aviso.

### O que "travar" significa por produto
- **Calculadora**: o dashboard chama a calculadora **servidor a servidor com
  chave secreta** (padrão ELO_INGEST_TOKEN que os dois já usam) e derruba/libera
  o acesso no cadastro de assinantes que já existe lá (`store` do acesso —
  mesmo lugar que o webhook Kiwify escreve). **Kiwify continua funcionando em
  paralelo** pros assinantes antigos; ninguém é derrubado na migração.
- **Monitoramento**: travar = suspender o login da empresa (tenant) no
  dashboard; destravar = reativar.

## Fase 2 — área do cliente (depois da Fase 1 rodar)
- "Minha assinatura" na área do assinante: situação, validade, botão **Pagar
  renovação** (o mesmo link).
- **Cadastro do zap com confirmação**: cliente digita o número → recebe código
  no WhatsApp → digita o código → confirmado (prova que o zap é dele).

## Portas abertas (registrar no código, não construir agora)
- **Multi-provedor**: a coluna `provedor` já existe na tabela `cobrancas`. O
  motor só fala "gera link" e "confirmou pagamento?" — Mercado Pago e outros
  entram depois como plugue novo, sem refazer nada.
- Recorrência nativa da InfinitePay (cartão automático): se um dia interessar,
  vira provedor/modalidade nova. Hoje: link por ciclo.

## Dados (migration 090 — combinar número no grupo!)
- `assinatura_produtos`: id, nome, valor_centavos_padrao, ativo.
- `assinaturas`: id, produto_id, company_id/lead_id (quem paga), nome/e-mail/zap
  do assinante, zap_confirmado, valor_centavos (próprio), vence_em, status
  (ativa/vencida/travada/cancelada), criado_em.
- Cada renovação gera uma linha em `cobrancas` (tabela da 089) amarrada à
  assinatura (`assinatura_id` — coluna nova na `cobrancas`).
- Avisos enviados registrados (pra não avisar 2× no mesmo dia — idempotência
  do cron).

## Qualidade
- TDD em tudo (régua do cron é função pura: recebe hoje + assinaturas, devolve
  ações — fácil de testar). `tsc` limpo + suíte verde antes de cada PR.
- Fatias pequenas: (1) tabelas + tela com lista e botões manuais; (2) motor
  automático de avisos/cobrança; (3) trava/destrava calculadora (ponte) e
  monitoramento; (4) Fase 2.

## Fora do escopo (por ora)
- Migrar os assinantes antigos do Kiwify (decisão pendente do Junior; os dois
  sistemas convivem).
- Nota fiscal automática, relatório financeiro consolidado.
