// src/modules/dashboard/recados-views.ts
// Tela "Recados da equipe": o que gente DE DENTRO mandou no número público da
// assistente. A assistente não trata isso como lead (ver contatos-internos.ts),
// mas nada se perde — cai aqui pra empresa ler.
//
// Renovação do miolo — R21 (28/09/2026): tabela cc- (vira cartão no celular),
// tema escuro, sem Tailwind. Mesmo dado, mesmo escape (mensagem vem de fora).
import type { Recado } from '../contatos-internos.js';
import { escapeHtml } from './views.js';
import { cabecalhoPagina, cartaoSecao, estadoVazio } from './ui/componentes.js';
import { renderComercial, TRILHA_COMERCIAL } from './comercial-casca.js';

function quando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Só as linhas — separado da moldura pra poder testar o escape sem montar a página. */
export function linhasRecados(recados: Recado[]): string {
  if (recados.length === 0) {
    return '<tr><td colspan="4">Nenhum recado ainda. Aqui aparece o que a equipe manda no número da assistente — ela guarda tudo e não trata como cliente.</td></tr>';
  }
  // O texto vem do WhatsApp (gente de fora escreve): escapar SEMPRE.
  return recados.map((r) => `
    <tr>
      <td class="cc-n" data-label="Quando">${escapeHtml(quando(r.criado_em))}</td>
      <td data-label="Quem">${escapeHtml(r.nome)}</td>
      <td class="cc-n" data-label="Telefone">${escapeHtml(r.telefone)}</td>
      <td data-label="Recado"><span class="cc-cm-msg">${escapeHtml(r.mensagem)}</span></td>
    </tr>`).join('');
}

export function telaRecados(recados: Recado[], user?: unknown): string {
  const tabela = recados.length === 0
    ? estadoVazio({ tipo: 'vazio', titulo: 'Nenhum recado ainda', texto: 'Aqui aparece o que a equipe manda no número da assistente — ela guarda tudo e não trata como cliente.' })
    : `<div class="cc-tbl-wrap cc-tbl-cartoes"><table class="cc-tbl">
<thead><tr><th>Quando</th><th>Quem</th><th>Telefone</th><th>Recado</th></tr></thead>
<tbody>${linhasRecados(recados)}</tbody>
</table></div>`;
  const body = `
    ${cabecalhoPagina({
      trilha: [TRILHA_COMERCIAL, { rotulo: 'Recados da equipe' }],
      titulo: 'Recados da equipe',
      subtitulo: 'Mensagens de quem é de dentro e escreveu no número da assistente. Ela anota e não trata como cliente — nada aqui vira lead.',
    })}
    ${cartaoSecao({ titulo: 'Recados', dica: recados.length ? `${recados.length} recado(s), do mais novo pro mais antigo` : undefined, corpoHtml: tabela })}`;
  return renderComercial({ active: 'recados', title: 'Recados da equipe', body, user });
}
