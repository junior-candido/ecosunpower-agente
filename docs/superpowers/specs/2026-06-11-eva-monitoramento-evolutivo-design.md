# Spec — Eva Monitoramento Evolutivo (abordagem de cliente por alerta de usina)

**Data:** 2026-06-11
**Status:** Aprovada pelo Junior (design validado em 3 partes na sessão de 11/06, noite)
**Contexto:** hoje os alertas de monitoramento (offline / queda / geração boa / órfã) param no
Junior, sempre com a mesma ação. O Junior quer a Eva conversando com o CLIENTE dono da usina,
com inteligência de contexto e memória do que já foi feito — "se fez uma ação, a próxima é melhor".

## 1. Objetivo

Transformar alerta de usina em RELACIONAMENTO: geração boa vira parabéns com número real
(retenção + cliente aprende a usar a Eva como canal), geração baixa vira diagnóstico + oferta
de limpeza (receita), offline vira troubleshooting guiado (suporte que ensina o valor do
monitoramento). Tudo com memória por usina (diário evolutivo) e treino supervisionado pelo Junior.

## 2. Decisões cravadas (respostas do Junior)

1. **Autonomia gradual:** fase de treino primeiro — TODA abordagem chega pro Junior com a
   mensagem pronta + botões `[Pode mandar] [Ajustar] [Não manda]`. Liberação pro automático
   é POR TIPO (parabéns → queda → offline), reversível, via botão/comando.
2. **Ritmo do parabéns:** 1º milestone → pede depoimento (comportamento atual mantido).
   Depois → parabéns TRIMESTRAL com números reais (kWh gerado, ~R$ economizado) + lembrete
   de que a Eva é o canal de suporte.
3. **Limpeza/visita é serviço PAGO, sem preço na conversa:** a Eva desperta o interesse
   ("limpeza costuma recuperar boa parte da geração"); cliente topou → transfere pro Junior
   fechar o valor.
4. **Sem resposta (queda/offline):** 3 dias → 1 lembrete educado; +3 dias calado → avisa o
   Junior com botões `[Eu ligo] [Agendar visita] [Deixar pra lá]`.
5. **Feedback de treino:** resumo no zap após cada conversa encerrada com `[👍 Boa] [👎 Errou]`
   (👎 pergunta o que foi e vira regra de treino) + linha do tempo por usina no dashboard.
6. **Abordagem técnica:** motor de abordagem em cima do pipeline de alertas existente —
   regras determinísticas decidem SE e O QUÊ; IA só escreve o texto. (NÃO é action no
   system-prompt gigante; lição do caso Marcelo.)

## 3. Elegibilidade (trava de segurança — vale pra QUALQUER abordagem)

A Eva só puxa conversa com o cliente quando TODAS valem:
- usina tem **dono vinculado** (`sistemas_clientes.lead_id` não nulo); órfã → alerta atual de
  cadastrar dono continua como hoje;
- lead **sem opt_out**;
- **fora de takeover** (Junior não está conversando manualmente com esse cliente);
- **dentro da janela horária** de envio (reusa `janela.ts`: seg-sex 8-20h, sáb 9-20h, dom nunca);
- `PROACTIVE_ALERTS_DRY_RUN` respeitado (dry run = simula e loga, não envia);
- limites de ritmo do diário (seção 5) respeitados.

Nota: `eva_active=false` NÃO bloqueia a abordagem de monitoramento (esse flag governa a Eva
RESPONDER conversa comercial; monitoramento é outro canal e o treino já passa pelo Junior).
Registrar essa escolha no código.

## 4. A escada de cada situação

### ☀️ Geração boa (`milestone_economia`)
- **1ª vez na vida da usina:** fluxo atual (pedir depoimento) mantido.
- **Depois:** parabéns TRIMESTRAL (mín. 90 dias desde o último parabéns/depoimento), com
  números reais do trimestre: kWh gerado e ~R$ economizado (kWh × tarifa média da
  distribuidora — usar `solar-params.ts`, nunca a IA calculando de cabeça). Mensagem reforça:
  obrigado pela confiança + "qualquer dúvida sobre o sistema, me chama aqui".

### 📉 Queda de geração (`queda_geracao`)
1. Eva se apresenta como consultora da EcoSunPower, diz que acompanha a usina e que a geração
   caiu. Perguntas de diagnóstico: faz tempo que não limpa as placas? teve obra/sombra nova/
   algum problema que saiba?
2. Conforme a resposta: explica que limpeza costuma recuperar a geração e OFERECE (sem preço).
3. Cliente topou → transfere pro Junior fechar valor e agendar (aviso pro Junior com resumo).
4. Cliente disse que acabou de limpar → registra no diário; acompanha: se a geração subir nos
   próximos dias, manda o "limpou e melhorou X% 👏"; se não subir, escala pro Junior (pode ser
   problema técnico).

### 🔌 Offline (`sistema_offline`)
1. Eva avisa: "sua usina está sem monitorar há X dias" e guia pelas causas comuns, UMA POR VEZ:
   mudou a internet? trocou a senha do wifi? o coletor/stick do inversor está com luz acesa?
   quedas de energia recentes?
2. Resolveu (geração voltou na próxima coleta) → comemora + registra a causa no diário
   (próxima vez começa por ela).
3. Não resolveu pelos passos → oferece visita técnica (paga, sem preço) mostrando a
   importância do monitoramento vivo.

### 😶 Sem resposta (queda e offline)
- +3 dias sem resposta → 1 lembrete educado (só um).
- +3 dias calado → encerra a abordagem como `sem_resposta` e avisa o Junior com botões
  `[Eu ligo] [Agendar visita] [Deixar pra lá]`.

### ⚠️ `erro_integracao`
Continua indo SÓ pro Junior (problema de credencial/API não é assunto pro cliente).

## 5. Diário evolutivo (memória por usina)

Tabela nova **`monitoring_abordagens`** (migration 048):
- `id`, `sistema_id` FK, `lead_id` FK, `alerta_id` FK (monitoring_alerts, nullable),
- `tipo` ('parabens' | 'depoimento' | 'queda' | 'offline'),
- `etapa` (int — degrau da escada),
- `status` ('proposta' | 'aguardando_aprovacao' | 'enviada' | 'em_conversa' | 'lembrete_enviado'
  | 'encerrada'),
- `desfecho` (null | 'resolvido_sozinho' | 'limpeza_fechada' | 'visita_agendada' |
  'transferido_junior' | 'sem_resposta' | 'descartada_junior'),
- `causa_raiz` (text — ex.: "senha do wifi"; alimenta a próxima abordagem),
- `mensagem_enviada` (text), `resposta_resumo` (text),
- `nota_junior` (null | 'boa' | 'errou'), `nota_observacao` (text — o que errou, vira treino),
- `reagendada_para` (timestamptz null — cliente pediu "agora não, me chama X"; o dispatcher só
  retoma a partir daí),
- `created_at`, `updated_at`, `encerrada_em`.

**Regras de ritmo/não-repetição (puras, testáveis) que o motor consulta ANTES de propor:**
- parabéns: mínimo 90 dias desde o último parabéns/depoimento ENVIADO da usina;
- limpeza: não reoferecer se ofereceu há <30 dias (muda o ângulo ou silencia);
- cliente informou que limpou: aguardar ciclo (≥7 dias de geração) antes de qualquer nova
  abordagem de queda; comparar e comemorar/escalar;
- offline: máx. 1 abordagem aberta por usina (dedupe igual aos alertas); causa_raiz anterior
  vira primeiro palpite;
- máximo global: 1 abordagem ativa por usina por vez; nunca 2 mensagens proativas pro mesmo
  cliente no mesmo dia (mesmo de usinas diferentes).

## 6. Treino e autonomia gradual

- **Proposta de abordagem:** o motor monta a mensagem (IA Opus com fallback Haiku, recebendo:
  dados reais da usina, escada, diário, regras de treino acumuladas) e grava como `proposta`.
  Na fase treino → Junior recebe: contexto curto + mensagem pronta + botões
  `mab:ok:<id>` (Pode mandar) / `mab:adj:<id>` (Ajustar) / `mab:no:<id>` (Não manda).
- **Ajustar:** Junior responde texto livre → IA reescreve → mostra de novo (mesmos botões).
  O ajuste é gravado em `monitoring_treino` (tabela nova: `id`, `tipo`, `instrucao`,
  `created_at`, `ativo`) e INJETADO nos prompts das próximas (as "regras de treino").
- **Autonomia por tipo:** flags em config/tabela (`parabens_auto`, `queda_auto`,
  `offline_auto`). Quando ON, a proposta vai direto pro cliente e o Junior recebe só o aviso
  do que foi mandado. Botão "Liberar automático" aparece no resumo de feedback quando o tipo
  acumular 5 aprovações seguidas sem ajuste (sugestão, não automático). Reversível.
- **Feedback pós-conversa:** ao encerrar (desfecho definido ou sem_resposta), Junior recebe
  resumo + `[👍 Boa] [👎 Errou]`; 👎 → Eva pergunta o que foi → vira linha em
  `monitoring_treino`.

## 7. Janela 24h e template WABA

- Mensagem proativa fora da janela 24h SÓ por template aprovado. Template novo
  **`eva_monitoramento_v1`** ({{1}} = primeiro nome; corpo curto: "Oi {{1}}! Aqui é a Eva, da
  EcoSunPower ☀️ Tenho uma novidade sobre a sua usina solar — posso te contar?"). Texto exato
  entregue pro Junior cadastrar no Meta (passo a passo guiado).
- Cliente responde ao template → janela abre → a conversa real acontece (a mensagem da escada
  vai aí). Dentro da janela 24h → mensagem direta.
- Template tem 2 botões de resposta rápida: **"Pode contar"** (segue a escada) e **"Agora não"**.
- **"Agora não" (decisão Junior 11/06):** a resposta abre a janela → Eva responde na hora:
  agradece, pergunta QUANDO é um bom momento ("é coisa rápida, mas importante sobre a sua
  usina") e REAGENDA a abordagem pro momento que o cliente indicar (parse simples:
  hoje à noite/amanhã/dia da semana; sem resposta clara → +2 dias, UMA tentativa só).
  Registrado no diário (`etapa` adiada + `reagendada_para`). Nunca insistir além disso.
- **Sem template aprovado configurado → a abordagem NÃO tenta sair** (fica `proposta` e o
  Junior é avisado UMA vez do bloqueio). Nada de falha silenciosa 131047 (lição do leadgen).
- Reusa `template-inicial.ts` (enviarTemplateInicial) com o template novo; fallback
  `reativacao_lead_v1` NÃO se aplica aqui (texto não combina) — bloquear é melhor que mandar
  template errado.

## 8. Conversa com contexto

Quando o cliente responde, a conversa cai no fluxo normal da Eva COM contexto injetado:
qual usina, qual situação (e dados: dias offline, % de queda), o que já foi perguntado, e as
regras: limpeza sem preço; transferir pro Junior quando o cliente topar limpeza/visita ou
pedir; NUNCA calcular economia de cabeça (números vêm do motor). Implementação: marcador de
"abordagem ativa" por telefone (tabela, não memória) que o handler de conversa consulta e
anexa ao prompt; respostas atualizam `monitoring_abordagens` (resposta_resumo, etapa, desfecho).

## 9. Dashboard (observabilidade obrigatória)

- **Linha do tempo por usina** (na página de detalhe do monitoramento): abordagens com tipo,
  mensagem, resposta, desfecho, nota do Junior.
- **KPIs no monitoramento:** abordagens no mês, % resolvido pela Eva sozinha, limpezas/visitas
  geradas, sem-resposta, tempo médio de resolução de offline.
- Tudo PT-BR, padrão dark da casa.

## 10. Casos-limite

| Caso | Comportamento |
|---|---|
| Usina sem dono | Alerta atual (cadastrar dono) — fora deste escopo |
| Cliente em opt_out | Nunca abordado; alerta segue só pro Junior |
| Takeover ativo | Abordagem espera (re-tenta no próximo ciclo de dispatch) |
| DRY_RUN=1 | Simula e loga, não envia (igual alertas atuais) |
| Template não cadastrado no Meta | Abordagem fica em proposta + aviso único ao Junior |
| Alerta resolve sozinho antes do envio | Abordagem cancelada (geração voltou → não manda "tá offline") — checar frescor do alerta antes de enviar |
| Junior clica [Não manda] | `descartada_junior` no diário; mesmo alerta não re-propõe por 30 dias |
| Cliente responde dias depois (janela fechou de novo) | Conversa normal da Eva com contexto (cliente que inicia abre janela) |
| 2 usinas do mesmo dono com alerta | 1 mensagem só (a mais grave); o resto espera |

## 11. Fora deste escopo (anotado)

- Relatório mensal automático por cliente (PDF/imagem).
- Motor de aprendizagem real×estimado ([[project_motor_aprendizagem_geracao]]) — o diário já
  nasce com os dados que ele vai precisar.
- Cobrança/agendamento da limpeza dentro da Eva (fica transferência pro Junior).
- IG/outros canais.

## 12. Riscos e atenções

- **Spam = morte da confiança:** os limites de ritmo (seção 5) são INVARIANTES testados, não
  sugestões. Erro pra menos mensagem é melhor que pra mais.
- **Template precisa ser aprovado pelo Meta ANTES do go-live** (1-3 dias de análise típica).
- **`monitoring_alerts.acao_disparada`** ganha novos valores — conferir handlers existentes.
- **Custo IA:** volume baixo (dezenas de abordagens/mês), Opus na escrita é barato aqui.
- Migration 048; MCP Supabase aponta pro projeto errado → SQL em arquivo na Área de Trabalho.
