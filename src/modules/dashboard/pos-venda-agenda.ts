// Função PURA: agrupa as tarefas pendentes em Atrasados / Hoje / Próximos 7 dias.
// Sem I/O. A query (listarAgendaPosVenda) entrega as TarefaAgenda já com o nome do cliente.

export interface TarefaAgenda {
  id: string;
  leadId: string;
  nomeCliente: string;
  titulo: string;
  dueAt: string | null;
}

export interface AgendaAgrupada {
  atrasados: TarefaAgenda[];
  hoje: TarefaAgenda[];
  semana: TarefaAgenda[];
}

const DIA = 86400000;
const diaUTC = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export function agruparAgenda(tarefas: TarefaAgenda[], hoje: Date): AgendaAgrupada {
  const hojeDia = diaUTC(hoje);
  const out: AgendaAgrupada = { atrasados: [], hoje: [], semana: [] };
  for (const tarefa of tarefas) {
    if (!tarefa.dueAt) { out.semana.push(tarefa); continue; } // sem data = sem urgência
    const due = new Date(tarefa.dueAt);
    if (Number.isNaN(due.getTime())) { out.semana.push(tarefa); continue; }
    const dueDia = diaUTC(due);
    if (dueDia < hojeDia) out.atrasados.push(tarefa);
    else if (dueDia === hojeDia) out.hoje.push(tarefa);
    else if (dueDia <= hojeDia + 7 * DIA) out.semana.push(tarefa);
    // além de 7 dias: fora da janela, não entra
  }
  const ord = (a: TarefaAgenda, b: TarefaAgenda) =>
    (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity);
  out.atrasados.sort(ord); out.hoje.sort(ord); out.semana.sort(ord);
  return out;
}
