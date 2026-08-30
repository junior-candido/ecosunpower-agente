# Eva Agenda A1 — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development ou superpowers:executing-plans. Checkboxes por tarefa. Os prompts de despacho carregam o detalhe fino; este plano fixa contratos e ordem.

**Goal:** Junior marca e consulta compromissos por frase no zap; Eva cria no Google Agenda dele com cor, avisa conflito com opções e sugere horário livre.

**Architecture:** módulo novo `src/modules/agenda/` (interpretar · classificar · conflito · executor · comando-agenda) sobre o `CalendarService` existente (`src/modules/calendar.ts`). Handler ligado no fluxo de mensagens do dono (padrão dos comandos do financeiro). TDD em tudo que é lógica.

**Regras da casa:** PT-BR · tsc + suíte inteira verdes antes de "pronto" · commits por arquivo nomeado · push autorizado nesta frente · nunca quebrar o que a Eva já faz.

### Task 1 — `interpretar.ts` (TDD pesado)
Contrato: `interpretar(frase: string, agoraISO: string): Promise<Interpretacao|null>` com `{titulo, inicioISO, fimISO, diaInteiro, ambito: 'empresa'|'pessoal'|null, confianca: 'alta'|'baixa'}`. Datas PT-BR: amanhã/depois de amanhã · dias da semana (próxima ocorrência, nunca passado) · dia 15 · 15h/15h30/"de manhã"(09h)/"de tarde"(14h)/"de noite"(19h) · "o dia todo". Duração default 1h. Fuso America/Sao_Paulo. Usa o cliente de IA da Eva (mesmo padrão dos módulos que chamam o modelo) com resposta JSON + validação/normalização determinística por cima (a IA extrai, o código valida datas). Testes com IA mockada + testes puros da normalização.

### Task 2 — `classificar.ts` + `conflito.ts` (TDD)
`classificar(titulo, inicioISO, nomesDeLeads: string[])`: empresa se bater palavra de obra/visita/instalação/limpeza/cliente ou nome de lead; pessoal se médico/dentista/escola/família/igreja/academia; senão horário comercial→empresa, fora→pessoal.
`acharConflitos(cal, inicioISO, fimISO)`: lista `{titulo, inicio, fim}` dos eventos que se sobrepõem (via events.list do dia). `sugerirHorario(cal, dataISO, duracaoMin)`: primeiro início livre em passos de 30min entre 07h e 20h.

### Task 3 — `executor.ts` (TDD com CalendarService mockado)
`marcar(cal, interp, ambito)` → createEvent com colorId 9/10 + retorna eventId/htmlLink; registrar em `agenda_eventos_eva` (tabela nova? NÃO — YAGNI: guardar num Map/redis com TTL 7d o `eventId` da última criação por usuário pro Desfazer; sem migration nesta fatia). `desfazer(cal, eventId)` · `substituir(cal, eventIdVelho, interp, ambito)` · `listarDia(cal, dataISO)` / `listarSemana` formatados em PT com bolinha de cor.

### Task 4 — `comando-agenda.ts` + ligação no index (padrão makeCaixaHandler)
Detecção: mensagens do NÚMERO DO DONO apenas (mesma guarda dos comandos financeiros). Intenções: consulta ("agenda", "o que tenho", "compromissos") · marcar (frase com data/hora detectada pela interpretação; confiança baixa → pergunta "que dia?") · botões (Desfazer · É pessoal/É empresa (recolore) · Marcar junto · Substituir · Sugerir horário · Sim/Não). Estado pendente de conflito em redis/Map com TTL 10min. Respostas com botões no padrão zap da casa (feedback: botões no zap). Ligar no index como os handlers do financeiro, SEM tocar nos fluxos existentes.

### Task 5 — Fechamento
tsc + suíte inteira · conferir GOOGLE_CALENDAR_ID (se não for a agenda do Junior: instrução pro Junior gerar/ajustar env no EasyPanel) · PR + comando de merge · Implantar · teste real assistido ("marca teste hoje 15h" → ver na agenda → Desfazer).

## Fora da A1
"tô livre?" por frase · editar/cancelar por frase · aprendizado de cor · automáticos de obra · convidados · migration de histórico.
