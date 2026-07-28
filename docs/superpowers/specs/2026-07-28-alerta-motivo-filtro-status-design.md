# Alerta com MOTIVO + filtro por status no Painel de Operação

**Data:** 2026-07-28 · **Pedido:** Thiago Sabino (tenant Sabion), via Junior.
Prints de referência: cabeçalhos das colunas circulados ("ao clicar, entra somente
no status") + painel de outra plataforma com filtro/busca. E: "a usina deveria
dizer o problema que tem — falta de WiFi, tensão, corrente, geração baixa".

## Escopo desta leva (aprovado pelo Junior)

- **A) Filtro clicável por status** no Painel de Operação.
- **B) Alerta com motivo — fatia 1**: usar o `statusInversor` que os adapters já
  devolvem (e hoje é descartado) pra dar NOME ao problema. Sem regras novas de
  telemetria.
- **Fora desta leva (fase 2):** regras de tensão/corrente da telemetria; status
  real por marca onde hoje é proxy (FoxESS/GoodWe/Solis/Sungrow devolvem
  'ok'/'desconhecido'); código de alarme do fabricante.

## A) Filtro por status

- Cabeçalhos das 4 colunas (Falha/Atenção/Gerando OK/Aguardando dados) e os
  chips da Órbita viram links `?status=falha|atencao|ok|aguardando`.
- Com filtro ativo a página renderiza SÓ a coluna pedida (as outras somem) e o
  cabeçalho ganha "✕ ver tudo" (link sem o param). Clicar de novo no mesmo
  status também limpa (o link do status ativo aponta pra URL sem param).
- Implementação server-rendered: o router lê `req.query.status` e passa
  `statusFiltro` pra `renderMonitoramentoPage`; a view filtra as colunas.
  Órbita continua mostrando a frota INTEIRA (é o mapa geral) — só o board
  filtra. Param inválido = ignorado (tela cheia).
- Multi-tenant: nada muda no recorte por empresa (o filtro age depois do
  recorte existente).

## B) Alerta com motivo (fatia 1)

1. **Migration 084** (número combinado no grupo pelo Junior):
   `sistemas_clientes.status_inversor text` + `status_inversor_em timestamptz`.
2. **Sync grava**: `MonitoringService` persiste o `statusInversor` devolvido
   pelo adapter a cada sync (junto do `ultima_sincronizacao`). Adapter que não
   devolve → grava 'desconhecido' (não deixa valor velho enganar).
3. **Radar diz o motivo** (`classificarSistema` ganha input opcional
   `statusInversor`): quando `diasSemGeracao >= 3`, o TEXTO do alerta vira:
   - `offline` → "Sem comunicação há N dias — o inversor não está enviando
     dados. Checar WiFi/internet da usina."
   - `falha` → "Falha reportada pelo inversor há N dias. Checar o equipamento."
   - `ok` (comunicando mas sem gerar) → "Parada há N dias — comunicando, mas
     sem gerar. Checar disjuntor/strings."
   - `desconhecido`/ausente → texto atual ("Sem geração há N dias. Verificar
     inversor / conexão WiFi.") — zero regressão onde não há dado.
4. **Tipo continua `sistema_offline`** — dedupe, dispatcher, botões do zap e
   telas não mudam de contrato; muda o texto exibido (painel, detalhe, zap).
5. Quem passa o novo input: os montadores que já chamam `classificarSistema`
   (detalhe/lista/detect) leem `status_inversor` do sistema.

## Testes (TDD)

- View: `?status=falha` renderiza só a coluna Falha + link "ver tudo"; sem
  param renderiza as 4; param inválido = 4; chips da Órbita apontam pros links.
- Classificação: 4 casos de motivo (offline/falha/ok/desconhecido) + regressão
  dos textos antigos quando não há status.
- Sync: grava status_inversor/status_inversor_em (inclusive 'desconhecido').
- `npx tsc --noEmit` limpo + suite inteira verde antes do PR.

## Riscos/observações

- Pras marcas do Thiago: NEP já deriva status real; FoxESS/GoodWe caem no
  proxy → muitos alertas seguirão com texto genérico até a fase 2. Explicar
  isso pro Thiago pra não parecer que "não funcionou".
- Régua "alta": reavaliar com o Thiago depois do deploy do #161/#162 (somas
  truncadas inflavam o "% abaixo"); kWp errado no cadastro (ex.: 0,8 kWp
  gerando 26 kWh/7d) também distorce — revisão de cadastro é dele.
