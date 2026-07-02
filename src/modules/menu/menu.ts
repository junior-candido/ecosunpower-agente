// src/modules/menu/menu.ts
// Definição do menu interativo admin (WhatsApp). Extraído de index.ts pra ser
// testável. A fábrica recebe handlers e ações por injeção; helpers montam as
// rows (submenu já com a linha Voltar) e validam o limite de 10 linhas.

type Handler = (from: string, text: string) => Promise<boolean>;
type Acao = (to: string) => Promise<void>;

export type MenuItem = {
  id: string; title: string; description: string;
  trigger?: string; handler?: Handler; hint?: string; action?: Acao;
};
export type MenuCategoria = { id: string; title: string; description: string; items: MenuItem[] };
export type MenuRow = { id: string; title: string; description: string };

export interface MenuDeps {
  pricing: Handler; proposal: Handler; closing: Handler; creative: Handler;
  banner: Handler; bannerKits: Handler; reativarBase: Handler; juniorBlog: Handler;
  scheduling: Handler; caseCreator: Handler; testimonialAdmin: Handler; relatorio: Handler;
  resgatarForms: Handler; googleAds: Handler;
  acaoImposto: Acao; acaoApagar: Acao; acaoGerarPost: Acao;
}

// Limite de linhas de uma lista interativa do WhatsApp.
export const MAX_ROWS_LISTA = 10;

// Linha "Voltar": usa id 'menu' pra reaproveitar o gatilho que reabre as
// categorias (isMenuTrigger no index.ts). Sem novo caminho de navegação.
export const VOLTAR_ROW: MenuRow = { id: 'menu', title: '⬅️ Voltar', description: 'Voltar pras categorias' };

export function construirMenu(deps: MenuDeps): MenuCategoria[] {
  return [
    {
      id: 'propostas', title: '💼 Propostas', description: 'Preço, gerar, ajustar, resgatar',
      items: [
        { id: 'menu_preco', title: '💰 Calcular preço', description: 'Simulação rápida de sistema', trigger: '/preco', handler: deps.pricing },
        { id: 'menu_proposta', title: '📋 Gerar proposta', description: 'PDF + link público', trigger: '/proposta', handler: deps.proposal },
        { id: 'menu_proposta_servico', title: '🔧 Proposta de serviço', description: 'Sem solar — por item ou valor fechado', trigger: '/proposta de serviço', handler: deps.proposal },
        { id: 'menu_ajustar', title: '✏️ Ajustar proposta', description: 'Reabrir uma já enviada', hint: '✏️ Pra ajustar uma proposta enviada, manda:\n*ajustar nome do cliente*\n(ex: ajustar Olavo)' },
        { id: 'menu_clonar', title: '👥 Clonar p/ outro', description: 'Mesma proposta, novo cliente', hint: '👥 Pra clonar uma proposta pra outro cliente (mesmo kit), manda:\n*clonar nome do cliente base*\n(ex: clonar Marcio)' },
        { id: 'menu_abordar', title: '💬 Abordar cliente', description: 'Eva fala com quem já abriu a proposta', hint: '💬 Pra Eva abordar um cliente na hora (mesmo que ele já tenha aberto a proposta), manda:\n*abordar nome do cliente*\n(ex: abordar Jonnata)' },
        { id: 'menu_resgatar', title: '♻️ Resgatar antigas', description: 'Recuperar dados do Drive', hint: '♻️ Manda */resgatar-propostas* pra recuperar os dados das propostas antigas (do Drive).' },
        { id: 'menu_rascunho', title: '📝 Rascunho', description: 'Retomar a não terminada', hint: '📝 Manda *rascunho* pra voltar pra proposta que você não terminou.' },
        { id: 'menu_fechei', title: '✅ Marcar como fechado', description: 'Tira o lead da cadência', hint: '✅ Pra marcar um lead como fechado (sai da cadência), manda:\n*fechei nome ou telefone*\n(ex: fechei Edimilson)' },
      ],
    },
    {
      id: 'fechamento', title: '📝 Fechamento', description: 'Contrato e procuração',
      items: [
        { id: 'menu_fechar', title: '🤝 Fechar venda', description: 'Contrato + procuração', trigger: '/fechar', handler: deps.closing },
        { id: 'menu_contrato', title: '📄 Só contrato', description: 'Gera só o contrato', hint: '📄 Manda *contrato nome do cliente* (ex: contrato Marcio).' },
        { id: 'menu_procuracao', title: '🖊️ Só procuração', description: 'Gera só a procuração', hint: '🖊️ Manda *procuracao nome do cliente* (ex: procuracao Marcio).' },
      ],
    },
    {
      id: 'marketing', title: '📣 Marketing', description: 'Criativo, banner, base, blog',
      items: [
        { id: 'menu_criativo', title: '🎨 Gerar criativo', description: 'Anúncio 3 imagens + 3 copies', trigger: 'criativo', handler: deps.creative },
        { id: 'menu_banner', title: '🖼️ Banner promo', description: 'Kit + preço + foto inversor', trigger: '/banner', handler: deps.banner },
        { id: 'menu_reativar', title: '🔄 Reativar base', description: 'Template pros leads (10 por vez)', trigger: '/reativar-base 10', handler: deps.reativarBase },
        { id: 'menu_blog', title: '📝 Status blog', description: 'Drafts pendentes de aprovação', trigger: 'blog status', handler: deps.juniorBlog },
        { id: 'menu_resgatar_forms', title: '♻️ Resgatar leads', description: 'Template pros leads do Meta', trigger: '/resgatar-forms', handler: deps.resgatarForms },
        { id: 'menu_google', title: '📊 Resumo Google Ads', description: 'Gasto, cliques, CPC, CTR', trigger: '/google', handler: deps.googleAds },
        { id: 'menu_banner_kits', title: '🖼️ Banner tabela (kits)', description: 'Tabela premium com kits OnGrid', trigger: '/banner-kits', handler: deps.bannerKits },
        { id: 'menu_gerar_post', title: '✨ Gerar post (teste)', description: 'Cria um post agora e te manda', action: deps.acaoGerarPost },
      ],
    },
    {
      id: 'atendimento', title: '📅 Atendimento', description: 'Agenda, cases, reviews',
      items: [
        { id: 'menu_agenda', title: '📅 Agendar reunião', description: 'Visita técnica ou Meet', trigger: '/agenda', handler: deps.scheduling },
        { id: 'menu_novo_case', title: '👤 Cadastrar case', description: 'Obra concluída (prova social)', trigger: '/novo-case', handler: deps.caseCreator },
        { id: 'menu_reviews', title: '✅ Aprovar reviews', description: 'Reviews públicos pendentes', trigger: '/reviews-pendentes', handler: deps.testimonialAdmin },
        { id: 'menu_email', title: '📧 Cadastrar email', description: 'Adiciona/atualiza email do lead', hint: '📧 Pra cadastrar o email de um lead, manda:\n*email telefone email*\n(ex: email 61999998888 cliente@gmail.com)' },
      ],
    },
    {
      id: 'financeiro', title: '💰 Financeiro', description: 'Relatório, imposto, gastos, painel',
      items: [
        { id: 'menu_fin_relatorio', title: '📊 Relatório do mês', description: 'Resumo do mês na hora', trigger: 'relatório', handler: deps.relatorio },
        { id: 'menu_fin_imposto', title: '🧾 Calcular imposto', description: 'Quanto separar de uma venda', action: deps.acaoImposto },
        { id: 'menu_fin_lancar', title: '💸 Lançar gasto/entrada', description: 'Foto, áudio ou texto', hint: '💸 Manda a foto/áudio do comprovante, ou escreve direto: *gastei 380 no posto* / *recebi 5000 do João*. Eu lanço e classifico sozinha.' },
        { id: 'menu_fin_material', title: '💰 Preço de material', description: 'Comparar onde está mais barato', hint: '💰 Pra comparar onde um material está mais barato, pergunta o preço dele:\n*preço do cabo 6mm*\n(eu já te mostro o ranking das lojas)' },
        { id: 'menu_fin_painel', title: '📈 Abrir painel', description: 'Tela do financeiro', hint: '📈 Painel do financeiro: dashboard.ecosunpower.eng.br/dashboard/financeiro' },
        { id: 'menu_fin_apagar', title: '🗑️ Apagar lançamento', description: 'Apagar um gasto/entrada errado', action: deps.acaoApagar },
      ],
    },
    {
      id: 'operacao', title: '🔧 Operação', description: 'Usinas, monitoramento, manutenção',
      items: [
        { id: 'menu_monitoramento', title: '⚡ Monitoramento', description: 'Geração das usinas', hint: '⚡ Acompanhe a geração das usinas em dashboard.ecosunpower.eng.br/dashboard/monitoramento' },
        { id: 'menu_dono', title: '🏭 Dono de usina', description: 'Vincular dono à usina órfã', hint: '🏭 Cadastra o dono pelo alerta de usina órfã no zap (botão "Cadastrar dono") ou no editar usina do dashboard.' },
        { id: 'menu_manutencao', title: '🔧 Manutenção', description: 'Abrir/ver manutenção', hint: '🔧 Manda */manutencao* pra registrar/ver manutenção.' },
      ],
    },
  ];
}

export function rowsCategorias(cats: MenuCategoria[]): MenuRow[] {
  return cats.map(c => ({ id: `menucat_${c.id}`, title: c.title, description: c.description }));
}

// Rows de um submenu: os itens + a linha Voltar no fim.
export function rowsSubmenu(cat: MenuCategoria): MenuRow[] {
  return [...cat.items.map(i => ({ id: i.id, title: i.title, description: i.description })), VOLTAR_ROW];
}

// Ids das categorias cujo submenu (com Voltar) estoura o limite do WhatsApp.
export function categoriasAcimaDoLimite(cats: MenuCategoria[]): string[] {
  return cats.filter(c => rowsSubmenu(c).length > MAX_ROWS_LISTA).map(c => c.id);
}
