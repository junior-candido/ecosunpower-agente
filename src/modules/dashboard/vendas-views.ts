// src/modules/dashboard/vendas-views.ts
// Tela do botão "Fechou!" — o Junior digita o nome, vê as propostas em aberto
// com aquele nome, clica na que fechou e registra a venda. Fonte única: chama
// o Coração da Venda (registrarVenda) por trás.
//
// Renovação do miolo — R21 (28/09/2026): mesmos formulários (busca GET q,
// POST /vendas/registrar com leadId/propostaId/nome/tipo/valor/kwp/data), mesmos
// names; visual cc- do Command Center (tema escuro, sem Tailwind).
import { escapeHtml, formatDate } from './views.js';
import { cabecalhoPagina, cartaoSecao, botao, celulaDupla, pilulaStatus, estadoVazio } from './ui/componentes.js';
import { renderComercial, avisoHtml, ehCasa, TRILHA_COMERCIAL } from './comercial-casca.js';

export interface PropostaAberta {
  leadId: string;
  propostaId: string | null; // null quando o cliente fechou SEM proposta publicada
  clienteNome: string;
  numeroProposta: string | null;
  createdAt: string | null;
  jaVenda: boolean;
}

export interface FecharVendaInput {
  q: string;
  buscou: boolean;
  resultados: PropostaAberta[];
  hoje: string; // 'yyyy-mm-dd' pro padrão do campo de data
  ok?: { nome: string } | null;
  user?: any;
}

export function renderFecharVendaPage(input: FecharVendaInput): string {
  const { q, buscou, resultados, hoje, ok, user } = input;

  // "O Elo" é o nome interno da casa; o tenant lê "o painel".
  const quemSabe = ehCasa(user) ? 'O Elo e o dashboard já sabem.' : 'O painel e as métricas já sabem.';
  const banner = ok
    ? avisoHtml('ok', `Venda de <strong>${escapeHtml(ok.nome)}</strong> registrada! ${quemSabe}`)
    : '';

  const busca = cartaoSecao({
    titulo: 'Quem fechou?',
    dica: 'com ou sem proposta',
    corpoHtml: `<form method="get" action="/dashboard/vendas/fechar" class="cc-form cc-cm-linha">
      <label class="cc-campo"><span>Nome ou telefone do cliente</span>
        <input name="q" value="${escapeHtml(q)}" autofocus placeholder="Nome ou telefone e busque..." />
      </label>
      ${botao({ rotulo: 'Buscar', tipo: 'submit', icone: 'search' })}
    </form>`,
  });

  let lista = '';
  if (buscou && resultados.length === 0) {
    lista = avisoHtml('atencao', `Nenhum cliente encontrado com "<strong>${escapeHtml(q)}</strong>". Tenta outro trecho do nome, ou o telefone.`);
  } else if (resultados.length > 0) {
    // Um "Registrar venda" dourado por cartão seria vários dourados: o primeiro
    // em aberto é o principal; os outros ficam no botão normal.
    const primeiro = resultados.findIndex((r) => !r.jaVenda);
    lista = `<div class="cc-cm-rot">${resultados.length} cliente(s)</div>` + resultados.map((r, i) => cardProposta(r, hoje, i === primeiro)).join('\n');
  } else {
    lista = estadoVazio({ tipo: 'vazio', compacto: true, titulo: 'Busque o cliente que fechou', texto: 'Digite o nome ou o telefone lá em cima. Aparece quem tem proposta e quem fechou sem proposta.' });
  }

  const body = `
    ${cabecalhoPagina({
      trilha: [TRILHA_COMERCIAL, { rotulo: 'Fechou!' }],
      titulo: 'Fechou! Registrar venda',
      subtitulo: 'Registre o momento exato que a venda fechou. Busque o cliente pelo nome ou telefone (com ou sem proposta), clique e pronto — as métricas atualizam na hora.',
    })}
    ${banner}
    ${busca}
    <div class="cc-cm-bloco" style="margin-top:16px">${lista}</div>`;

  return renderComercial({ active: 'fechar_venda', title: 'Fechou! Registrar venda', body, user, largo: false });
}

function cardProposta(r: PropostaAberta, hoje: string, principal: boolean): string {
  const data = r.createdAt ? formatDate(r.createdAt) : '—';
  // Sem proposta publicada é OK (fechou por indicação/venda direta): mostra "sem proposta"
  // em vez de fingir que tem uma. Com proposta, mostra o número.
  const numero = r.numeroProposta ? `Proposta ${r.numeroProposta}`
    : (r.propostaId ? 'Proposta' : 'Sem proposta');
  // "· enviada {data}" só faz sentido quando existe proposta.
  const sub = r.propostaId ? `${numero} · enviada ${data}` : numero;

  if (r.jaVenda) {
    return `<div class="cc-cm-venda cc-cm-venda-ja">
      ${celulaDupla(r.clienteNome, sub)}
      ${pilulaStatus('normal', 'já é venda')}
    </div>`;
  }

  return `<form method="post" action="/dashboard/vendas/registrar" class="cc-form cc-cm-venda">
    <input type="hidden" name="leadId" value="${escapeHtml(r.leadId)}" />
    <input type="hidden" name="propostaId" value="${escapeHtml(r.propostaId ?? '')}" />
    <input type="hidden" name="nome" value="${escapeHtml(r.clienteNome)}" />
    ${celulaDupla(r.clienteNome, sub)}
    <div class="cc-cm-grade4">
      <label class="cc-campo"><span>Tipo</span>
        <select name="tipo">
          <option value="sistema">Sistema</option>
          <option value="servico">Serviço</option>
        </select>
      </label>
      <label class="cc-campo"><span>Valor (R$)</span>
        <input name="valor" type="number" step="0.01" min="0" placeholder="opcional" />
      </label>
      <label class="cc-campo"><span>Potência (kWp)</span>
        <input name="kwp" type="number" step="0.01" min="0" placeholder="opcional" />
      </label>
      <label class="cc-campo"><span>Data</span>
        <input name="data" type="date" value="${escapeHtml(hoje)}" />
      </label>
    </div>
    <div style="margin-top:12px">${botao({ rotulo: 'Registrar venda', tipo: 'submit', tom: principal ? 'ouro' : 'normal', icone: 'check' })}</div>
  </form>`;
}
