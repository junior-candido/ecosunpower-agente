// src/modules/dashboard/conhecimento-views.ts
// Tela "O que a assistente sabe": cada empresa escreve o que a assistente dela
// pode dizer sobre o próprio negócio — o que vende, marcas, garantia, região.
//
// Existe pra tirar isso do SQL: a Jimena precisa conseguir ajustar sozinha,
// sem depender do Junior nem de deploy.
import type { ItemConhecimento } from '../conhecimento-empresa.js';
import { renderLayout, escapeHtml } from './views.js';

function cartao(i: ItemConhecimento, nomeAssistente: string): string {
  const vazio = !i.conteudo.trim();
  const selo = vazio
    ? '<span style="color:#fbbf24;font-size:11px">— em branco, ela não fala disso</span>'
    : '<span style="color:#34d399;font-size:11px">✓ preenchido</span>';
  return `
<form method="post" action="/dashboard/conhecimento/${encodeURIComponent(i.chave)}"
      class="mb-4" style="border:1px solid #374151;border-radius:10px;padding:14px">
  <div class="flex items-center justify-between mb-1">
    <b style="color:#e5e7eb">${escapeHtml(i.titulo)}</b>
    ${selo}
  </div>
  <textarea name="conteudo" rows="5"
    style="width:100%;background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:8px;padding:10px;font-size:13px"
    placeholder="Escreva com suas palavras. A ${escapeHtml(nomeAssistente)} usa isso para responder o cliente."
    >${escapeHtml(i.conteudo)}</textarea>
  <div class="mt-2"><button type="submit" class="px-3 py-2 rounded bg-cyan-700 text-white">Salvar</button></div>
</form>`;
}

export function telaConhecimento(
  itens: ItemConhecimento[],
  nomeAssistente: string,
  user?: unknown,
  aviso?: string,
): string {
  const faltam = itens.filter((i) => !i.conteudo.trim()).length;
  const resumo = faltam === 0
    ? '<div style="color:#34d399">Tudo preenchido. 👏</div>'
    : `<div style="color:#fbbf24">Faltam <b>${faltam}</b> de ${itens.length} assuntos. Enquanto estiverem em branco, ${escapeHtml(nomeAssistente)} não fala desses temas — ela prefere não responder a inventar.</div>`;
  const corpo = itens.length === 0
    ? '<p style="color:#9ca3af">Nenhum assunto cadastrado ainda.</p>'
    : itens.map((i) => cartao(i, nomeAssistente)).join('');
  const body = `
<div style="color:#d1d5db;max-width:820px">
<h1 class="text-xl font-bold text-cyan-300 mb-1">🧠 O que a ${escapeHtml(nomeAssistente)} sabe sobre a empresa</h1>
<p class="text-sm text-gray-400 mb-3">Escreva do jeito que você falaria com um cliente. Ela usa isso para responder — e só fala o que estiver escrito aqui.</p>
${aviso ? `<div style="border:1px solid #34d399;border-radius:8px;padding:10px;margin-bottom:12px">${escapeHtml(aviso)}</div>` : ''}
<div class="mb-4">${resumo}</div>
${corpo}
</div>`;
  return renderLayout({ active: 'conhecimento', title: 'O que a assistente sabe', body, dark: true, user: user as never });
}
