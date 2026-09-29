// src/modules/dashboard/conhecimento-views.ts
// Tela "O que a assistente sabe": cada empresa escreve o que a assistente dela
// pode dizer sobre o próprio negócio — o que vende, marcas, garantia, região.
//
// Existe pra tirar isso do SQL: a Jimena precisa conseguir ajustar sozinha,
// sem depender do Junior nem de deploy.
//
// Renovação do miolo — R21 (28/09/2026): um cartão cc- por assunto (mesmo
// POST /conhecimento/:chave com o campo "conteudo"), pílula preenchido/em
// branco, tema escuro, sem Tailwind. O nome da assistente vem da rota (tenant
// sem nome cadastrado vê "assistente", nunca o nome da assistente da casa).
import type { ItemConhecimento } from '../conhecimento-empresa.js';
import { escapeHtml } from './views.js';
import { cabecalhoPagina, cartaoSecao, pilulaStatus, botao, estadoVazio, aviso } from './ui/componentes.js';
import { renderComercial, avisoHtml, TRILHA_COMERCIAL } from './comercial-casca.js';

function cartao(i: ItemConhecimento, nomeAssistente: string): string {
  const vazio = !i.conteudo.trim();
  const selo = vazio ? pilulaStatus('atencao', 'em branco — ela não fala disso') : pilulaStatus('normal', 'preenchido');
  return cartaoSecao({
    titulo: i.titulo,
    classe: 'cc-cm-conh',
    acoesHtml: selo,
    corpoHtml: `<form method="post" action="/dashboard/conhecimento/${encodeURIComponent(i.chave)}" class="cc-form">
  <textarea name="conteudo" rows="5" class="cc-cm-textarea"
    placeholder="Escreva com suas palavras. A ${escapeHtml(nomeAssistente)} usa isso para responder o cliente."
    >${escapeHtml(i.conteudo)}</textarea>
  <div style="margin-top:10px">${botao({ rotulo: 'Salvar', tipo: 'submit', icone: 'check' })}</div>
</form>`,
  });
}

export function telaConhecimento(
  itens: ItemConhecimento[],
  nomeAssistente: string,
  user?: unknown,
  avisoTexto?: string,
): string {
  const faltam = itens.filter((i) => !i.conteudo.trim()).length;
  const resumo = itens.length === 0
    ? ''
    : faltam === 0
      ? avisoHtml('ok', 'Tudo preenchido.')
      : avisoHtml('atencao', `Faltam <strong>${faltam}</strong> de ${itens.length} assuntos. Enquanto estiverem em branco, ${escapeHtml(nomeAssistente)} não fala desses temas — ela prefere não responder a inventar.`);
  const corpo = itens.length === 0
    ? estadoVazio({ tipo: 'vazio', titulo: 'Nenhum assunto cadastrado ainda' })
    : itens.map((i) => cartao(i, nomeAssistente)).join('');
  const body = `
    ${cabecalhoPagina({
      trilha: [TRILHA_COMERCIAL, { rotulo: 'O que a assistente sabe' }],
      titulo: `O que a ${nomeAssistente} sabe sobre a empresa`,
      subtitulo: 'Escreva do jeito que você falaria com um cliente. Ela usa isso para responder — e só fala o que estiver escrito aqui.',
    })}
    ${avisoTexto ? aviso({ tom: 'ok', texto: avisoTexto }) : ''}
    ${resumo}
    ${corpo}`;
  return renderComercial({ active: 'conhecimento', title: 'O que a assistente sabe', body, user, largo: false });
}
