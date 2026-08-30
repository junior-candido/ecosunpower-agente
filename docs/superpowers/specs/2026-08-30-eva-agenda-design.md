# Eva Agenda — secretária no zap (design)
Data: 30/08/2026 · Aprovado pelo Junior no chat · PT-BR

## Objetivo
O Junior manda uma frase natural no zap ("visita na Cyntia quinta 9h") e a Eva marca no **Google Agenda dele** (junior@ecosunpower.eng.br), com **cores** (🔵 empresa · 🟢 pessoal), **avisando de conflito** como uma secretária de verdade; e responde consultas ("o que tenho amanhã?").

## Decisões do Junior
1. **Agenda única** (a dele) com cores — não criar calendário separado. Google colorId: empresa = "9" (azul/blueberry) · pessoal = "10" (verde/basil).
2. **Fala natural, cria direto** ("melhor simples e eu olho e vejo") → resposta com resumo + botão **Desfazer** (e "É pessoal"/"É empresa" pra corrigir cor).
3. **Marcar + consultar** (letra a): "agenda hoje/amanhã/da semana".
4. **Conflito = obrigatório na A1**: antes de criar, checar ocupação; se chocar, avisar e oferecer `[Marcar junto] [Substituir] [Sugerir horário]` — no sugerir, propor o primeiro horário livre do dia. "Ela deve ser uma secretária eficiente em todos os sentidos."
5. Só funciona pro **número do Junior** (dono). Nunca mexe em eventos que ela não criou, EXCETO leitura (consulta lê tudo).

## Base existente (reusar, não recriar)
- `src/modules/calendar.ts` — `CalendarService`: `createEvent` (com `colorId`), `isAvailable` (freebusy), OAuth refresh-token, `GOOGLE_CALENDAR_ID` no env. Usado hoje pelo SchedulingAssistant de leads. ✅ CONFIRMADO pelo Junior 30/08: já aponta pra agenda DELE, e os agendamentos de lead chegam certinhos com mapa/local, horário e até anexo PDF — a A1 herda essa riqueza (visita a lead pode incluir endereço/mapa).
- Padrões de comando no zap: `makeCaixaHandler`/`comando-*.ts` do financeiro (handler injetado, botões, resposta em PT).
- Fuso: helpers de Brasília já existem no index (hojeISO etc.).

## Peças (módulo `src/modules/agenda/`)
| Peça | Faz |
|---|---|
| `interpretar.ts` | frase → `{titulo, inicioISO, fimISO (default 1h; "dia todo" = evento de dia inteiro), ambito: 'empresa'\|'pessoal'\|null, confianca}` — datas PT-BR (amanhã, quinta, dia 15, 15h, "de manhã"=09h) via IA da Eva + validação determinística; fuso America/Sao_Paulo; datas no passado → próxima ocorrência |
| `classificar.ts` | ambito quando a IA não cravar: palavras de obra/cliente/lead do CRM → empresa; termos domésticos → pessoal; default empresa em horário comercial, pessoal fora |
| `conflito.ts` | dado início/fim → lista eventos que chocam + sugere primeiro horário livre do mesmo dia (varre em passos de 30 min até 20h) |
| `executor.ts` | criar (colorId por ambito, descrição "criado pela Eva"), desfazer (deleta evento criado por ela, guarda eventId), substituir (deleta o que chocava e cria), listar dia/semana |
| `comando-agenda.ts` | cola tudo: detecta intenção (marcar × consultar × responder botão), monta respostas com botões, estado pendente de conflito (redis/memória curta) |

## Fluxos
- **Marcar sem conflito**: frase → interpretar → classificar → `isAvailable` ✓ → cria → "📅 Marquei: … · 🔵 empresa `[Desfazer] [É pessoal]`".
- **Marcar com conflito**: "⚠️ Você já tem X às 9h–10h. `[Marcar junto] [Substituir] [Sugerir horário]`" → sugerir responde "seg 13h livre — marco? `[Sim] [Não]`".
- **Consulta**: "agenda amanhã" → lista ordenada com hora, título e bolinha da cor; vazio → "Nada marcado 🎉".
- **Desfazer**: só eventos criados pela Eva (guarda `eventId` + quem criou).
- Não entendeu a data → UMA pergunta curta ("que dia?"), nunca interrogatório.

## Fatias
- **A1**: interpretar + classificar + conflito + criar/desfazer/substituir/sugerir + consulta dia/amanhã/semana + botões. (esta entrega)
- **A2**: "tô livre X?" · mudar/cancelar por frase ("muda o dentista pra 16h") · aprendizado das correções de cor.
- **A3**: automáticos — obra confirmada → evento · lembrete 1h antes com endereço do cliente · convidados (Jonnata na obra).

## Testes
Unitários de interpretar (datas PT-BR, fuso, passado→futuro), conflito (choque parcial/total, sugestão), executor (mocks do CalendarService) · handler com mocks · suíte inteira verde + tsc antes de PR · teste real assistido: Junior marca "teste às 15h" e vê na agenda.
