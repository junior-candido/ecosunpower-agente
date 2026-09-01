// src/modules/dashboard/recados-views.ts
// Tela "Recados da equipe": o que gente DE DENTRO mandou no número público da
// assistente. A assistente não trata isso como lead (ver contatos-internos.ts),
// mas nada se perde — cai aqui pra empresa ler.
import type { Recado } from '../contatos-internos.js';
import { renderLayout, escapeHtml } from './views.js';

function quando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Só as linhas — separado da moldura pra poder testar o escape sem montar a página. */
export function linhasRecados(recados: Recado[]): string {
  if (recados.length === 0) {
    return '<tr><td class="p-3 text-gray-500" colspan="4">Nenhum recado ainda. Aqui aparece o que a equipe manda no número da assistente — ela guarda tudo e não trata como cliente.</td></tr>';
  }
  // O texto vem do WhatsApp (gente de fora escreve): escapar SEMPRE.
  return recados.map((r) => `
    <tr class="border-b border-gray-800">
      <td class="p-2 whitespace-nowrap">${quando(r.criado_em)}</td>
      <td class="p-2">${escapeHtml(r.nome)}</td>
      <td class="p-2 text-gray-400 whitespace-nowrap">${escapeHtml(r.telefone)}</td>
      <td class="p-2">${escapeHtml(r.mensagem)}</td>
    </tr>`).join('');
}

export function telaRecados(recados: Recado[], user?: unknown): string {
  const body = `
<div style="color:#d1d5db">
<h1 class="text-xl font-bold text-cyan-300 mb-1">📥 Recados da equipe</h1>
<p class="text-sm text-gray-400 mb-4">Mensagens de quem é <b>de dentro</b> e escreveu no número da assistente. Ela anota e não trata como cliente — nada aqui vira lead.</p>
<div style="overflow-x:auto"><table class="w-full text-sm">
<thead><tr class="text-left text-gray-400"><th class="p-2">Quando</th><th class="p-2">Quem</th><th class="p-2">Telefone</th><th class="p-2">Recado</th></tr></thead>
<tbody>${linhasRecados(recados)}</tbody>
</table></div></div>`;
  return renderLayout({ active: 'recados', title: 'Recados da equipe', body, dark: true, user: user as never });
}
