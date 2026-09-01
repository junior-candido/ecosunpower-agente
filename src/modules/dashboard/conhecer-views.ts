// src/modules/dashboard/conhecer-views.ts
// A vitrine: o que o cliente vê ao clicar num módulo que ainda não é dele.
//
// Junior 01/09/2026: "quero que você deixe todos os menus... e quando ela clicar
// aparecer uma demonstração caso ela adquirisse essa parte... como vitrine".
//
// A régua aqui é honestidade: mostrar o que o módulo FAZ, com as palavras de
// quem usa, sem número inventado. Vitrine com dado falso vende uma vez e queima
// a confiança pro resto.
import { renderLayout, escapeHtml } from './views.js';

export interface ModuloVitrine {
  titulo: string;
  resumo: string;
  /** O que a pessoa ganha no dia a dia — frases curtas, nada de jargão. */
  ganhos: string[];
  /** Miniatura da tela: mostra o FORMATO (colunas, botões), com dados de
   *  exemplo. Não é a tela real — e a tarja diz isso, pra ninguém confundir
   *  número de exemplo com número da empresa dele. */
  amostra?: string;
}

/** O cardápio. Chave = `key` do item do menu. */
export const MODULOS: Record<string, ModuloVitrine> = {
  financeiro: {
    titulo: '💰 Financeiro',
    resumo: 'O caixa da empresa numa tela só: o que entra, o que sai e o que vence.',
    ganhos: [
      'Contas a pagar e a receber com aviso antes de vencer',
      'Quanto entrou no mês e quanto sobrou de verdade',
      'Cada venda ligada ao dinheiro que ela gerou',
    ],
  },
  fiscal: {
    titulo: '🧾 Notas fiscais',
    resumo: 'Emite a NFS-e direto daqui, sem entrar no portal da prefeitura.',
    ganhos: [
      'Nota emitida pelo sistema, com o certificado digital da empresa',
      'Dados do cliente puxados pelo CNPJ, sem digitar',
      'A nota já entra no financeiro como conta a receber',
    ],
  },
  propostas: {
    titulo: '📄 Propostas',
    resumo: 'Proposta pronta em minutos, com a cara da sua empresa.',
    ganhos: [
      'O cliente abre no celular e vê a economia dele',
      'Você acompanha quem abriu e quando',
      'Cálculo de geração e retorno já embutido',
    ],
  },
  calculadora: {
    titulo: '🧮 Calculadora de projeto',
    resumo: 'Dimensiona o sistema, monta o kit e faz o projeto elétrico.',
    ganhos: [
      'Do consumo da conta ao tamanho da usina, com a conta certa',
      'Diagrama, memorial e prancha no padrão da concessionária',
      'Preço do kit atualizado das distribuidoras',
    ],
    amostra: `
      <div class="am-linha"><span>Conta de luz</span><b>R\$ 780,00 · 620 kWh</b></div>
      <div class="am-linha"><span>Concessionária</span><b>Neoenergia Coelba</b></div>
      <div class="am-linha"><span>Sistema calculado</span><b>5,72 kWp · 8 placas de 715 W</b></div>
      <div class="am-linha"><span>Geração estimada</span><b>723 kWh/mês</b></div>
      <div class="am-linha am-destaque"><span>Economia estimada</span><b>R\$ 612,00/mês</b></div>
      <div class="am-botoes"><span class="am-btn">Gerar proposta</span><span class="am-btn-2">Diagrama elétrico</span><span class="am-btn-2">Memorial</span></div>`,
  },
  monitoramento: {
    titulo: '📡 Monitoramento',
    resumo: 'Todas as usinas dos seus clientes numa tela, de qualquer marca.',
    ganhos: [
      'Vê na hora quando uma usina para de gerar',
      'Inversor de marcas diferentes no mesmo lugar',
      'Relatório mensal pro cliente, automático',
    ],
  },
  servicos: {
    titulo: '🔧 Serviços em campo',
    resumo: 'A equipe na rua sabendo o que fazer, e você sabendo o que foi feito.',
    ganhos: [
      'Ordem de serviço no celular do instalador',
      'Foto do serviço pronto, direto do campo',
      'Histórico de tudo que já foi feito em cada cliente',
    ],
  },
  usinas_kanban: {
    titulo: '🏗️ Obras',
    resumo: 'Cada obra numa etapa, sem ninguém perguntar "como está aquela lá?".',
    ganhos: [
      'Da homologação à ligação, etapa por etapa',
      'O que travou e há quantos dias',
      'O cliente sabe em que pé está sem ligar pra você',
    ],
  },
  marketing: {
    titulo: '📣 Marketing',
    resumo: 'Anúncio, blog e e-mail saindo do mesmo lugar em que os leads chegam.',
    ganhos: [
      'Quanto custou cada lead, por anúncio',
      'Post de blog escrito e publicado no site',
      'E-mail pra base de clientes antigos',
    ],
  },
};

/** Módulo desconhecido: apresentação genérica, sem inventar promessa. */
function fallback(chave: string): ModuloVitrine {
  return {
    titulo: chave,
    resumo: 'Este módulo ainda não faz parte do seu plano.',
    ganhos: [],
  };
}

export function telaConhecer(chave: string, empresaNome: string, user?: unknown): string {
  const m = MODULOS[chave] ?? fallback(chave);
  const amostra = m.amostra ? `
  <div style="margin-top:24px">
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#9ca3af;margin-bottom:8px">Como fica na tela</div>
    <div class="am-quadro">
      <div class="am-tarja">Números de exemplo — não são dados da sua empresa</div>
      ${m.amostra}
    </div>
  </div>` : '';
  const lista = m.ganhos.length
    ? `<ul style="margin:14px 0 0;padding-left:18px;line-height:2">${m.ganhos.map((g) => `<li>${escapeHtml(g)}</li>`).join('')}</ul>`
    : '';
  const body = `
<style>
  .am-quadro{border:1px solid #374151;border-radius:10px;overflow:hidden;background:#0f172a}
  .am-tarja{background:#78350f;color:#fde68a;font-size:11px;padding:6px 12px;letter-spacing:.04em}
  .am-linha{display:flex;justify-content:space-between;gap:16px;padding:10px 14px;border-bottom:1px solid #1f2937;font-size:13px}
  .am-linha span{color:#9ca3af}
  .am-linha b{color:#e5e7eb;font-variant-numeric:tabular-nums}
  .am-destaque b{color:var(--marca);font-size:16px}
  .am-botoes{display:flex;gap:8px;padding:12px 14px;flex-wrap:wrap}
  .am-btn{background:var(--marca);color:#0b1220;font-size:12px;font-weight:600;padding:6px 12px;border-radius:6px}
  .am-btn-2{border:1px solid #374151;color:#9ca3af;font-size:12px;padding:6px 12px;border-radius:6px}
</style>
<div style="color:#d1d5db;max-width:720px">
  <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#9ca3af">Ainda não faz parte do seu plano</div>
  <h1 class="text-2xl font-bold mb-1" style="color:var(--marca)">${escapeHtml(m.titulo)}</h1>
  <p style="font-size:16px;line-height:1.6;margin:6px 0 0;max-width:60ch">${escapeHtml(m.resumo)}</p>
  ${lista}
  ${amostra}
  <div style="border:1px solid #374151;border-radius:10px;padding:16px;margin-top:22px">
    <div style="font-weight:600;margin-bottom:6px">Quer conhecer?</div>
    <p style="font-size:13px;color:#9ca3af;margin:0 0 12px">
      A gente mostra funcionando com os dados da ${escapeHtml(empresaNome)} e explica como fica no seu dia a dia.
    </p>
    <form method="post" action="/dashboard/conhecer/${encodeURIComponent(chave)}">
      <button type="submit" class="px-4 py-2 rounded font-semibold" style="background:var(--marca);color:#0b1220">
        Quero conhecer
      </button>
    </form>
  </div>
  <p style="margin-top:16px"><a href="/dashboard/home" style="color:#9ca3af;font-size:13px">← voltar</a></p>
</div>`;
  return renderLayout({ active: 'home', title: m.titulo, body, dark: true, user: user as never });
}

export function telaConhecerEnviado(chave: string, user?: unknown): string {
  const m = MODULOS[chave] ?? fallback(chave);
  const body = `
<div style="color:#d1d5db;max-width:640px">
  <h1 class="text-2xl font-bold mb-2" style="color:var(--marca)">Anotado 👍</h1>
  <p style="font-size:16px;line-height:1.6">
    Recebemos seu interesse em <b>${escapeHtml(m.titulo)}</b>. Alguém vai te procurar para mostrar funcionando.
  </p>
  <p style="margin-top:18px"><a href="/dashboard/home" style="color:#9ca3af;font-size:13px">← voltar pro início</a></p>
</div>`;
  return renderLayout({ active: 'home', title: 'Interesse registrado', body, dark: true, user: user as never });
}
