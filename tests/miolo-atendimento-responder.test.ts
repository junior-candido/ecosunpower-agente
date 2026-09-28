// Atendimento Parte 2 — a TELA do responder: janela aberta/fechada, modelo com
// prévia, bloqueios, custo, Assumir/Devolver e os balões novos (envio do painel
// e eventos). Dados fictícios.
import { describe, it, expect } from 'vitest';
import { renderLeadDetailPage } from '../src/modules/dashboard/leads-views.js';
import { textoDoEvento, rotuloCanal, type CompositorInput } from '../src/modules/dashboard/atendimento-views.js';
import { USER_CASA, USER_TENANT, leadDetalhe, LISTA_CONVERSAS } from './fixtures/miolo-leads.js';

const miolo = (h: string) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));
const agora = Date.parse('2026-09-28T17:00:00Z'); // 14:00 Brasília
const hAtras = (h: number) => new Date(agora - h * 3600_000).toISOString();
const MODELOS = [
  { nome: 'reativacao_lead_v1', rotulo: 'Retomar a conversa', categoria: 'marketing' as const, texto: 'Oi {nome}! <b>voltei</b>', conferido: true },
  { nome: 'lembrete_manutencao', rotulo: 'Lembrete', categoria: 'utilidade' as const, texto: null, conferido: true },
];
const envio = (o: Partial<CompositorInput> = {}): CompositorInput => ({
  via: 'waba', canal: 'eva_oficial', modelos: MODELOS, chave: '8f3c2c55-1d2e-4c3b-9a55-0e2d7c1b9f00', agora, ...o,
});
const msgsCliente = (h: number) => [{ role: 'user', content: 'Oi', timestamp: hAtras(h) }];
function tela(lead: Record<string, unknown>, e: CompositorInput | undefined, user = USER_CASA, mensagens?: any[]) {
  return miolo(renderLeadDetailPage(leadDetalhe(lead), [], '', '', [], user, { lista: LISTA_CONVERSAS, envio: e, mensagens }));
}
function compor(h: string) {
  const i = h.indexOf('<footer class="cc-at-compor');
  return h.slice(i, h.indexOf('</footer>', i));
}

describe('número da Eva — janela de 24 h', () => {
  it('ABERTA: "Janela aberta até" (23 h depois da última do cliente), texto livre, modelo recolhido, custo', () => {
    // cliente falou às 12:00 (Brasília) → aberta até amanhã 11:00
    const c = compor(tela({ conversation_messages: msgsCliente(2) }, envio()));
    expect(c).toContain('Janela aberta até <strong>29/09 11:00</strong>');
    expect(c).toContain('action="/dashboard/leads/11111111-1111-1111-1111-111111111111/responder"');
    expect(c).toContain('<details class="cc-at-modelos-det"><summary>Usar um modelo aprovado</summary>');
    expect(c).toContain('grátis até 30/09');
    expect(c).toContain('a Eva fica pausada até você devolver');
    expect(c).toContain('sai pelo 🤖 Eva');
    expect(c).toContain('name="chave" value="8f3c2c55-1d2e-4c3b-9a55-0e2d7c1b9f00"');
  });

  it('FECHADA: sem texto livre; lista de modelos aberta com nome preenchido e prévia (escapada)', () => {
    const c = compor(tela({ name: 'Ana <script>x</script>', conversation_messages: msgsCliente(30) }, envio()));
    expect(c).toContain('<strong>Janela fechada</strong> — use um modelo aprovado');
    expect(c).not.toContain('/responder"');
    expect(c).toContain('/responder-modelo"');
    expect(c).not.toContain('<details class="cc-at-modelos-det">');
    expect(c).toContain('Retomar a conversa · marketing');
    expect(c).toContain('≈ R$ 0,32 (marketing)');
    // prévia com o nome, tudo escapado (nada vira HTML)
    expect(c).toContain('Oi Ana! &lt;b&gt;voltei&lt;/b&gt;');
    expect(c).not.toContain('<script>x');
    expect(c).toContain('data-texto="Oi {nome}! &lt;b&gt;voltei&lt;/b&gt;"');
  });

  it('a partir de 01/10: o aviso diz o custo por mensagem', () => {
    const c = compor(tela({ conversation_messages: msgsCliente(2) }, envio({ agora: Date.parse('2026-10-01T15:00:00Z') })));
    expect(c).toContain('Custo: ≈ R$ 0,035 por mensagem');
  });

  it('resultado do envio aparece em cima (texto conhecido, nunca o que veio na URL)', () => {
    expect(compor(tela({ conversation_messages: msgsCliente(2) }, envio({ resultado: 'enviada' })))).toContain('Mensagem enviada. Você assumiu a conversa.');
    expect(compor(tela({ conversation_messages: msgsCliente(2) }, envio({ resultado: 'janela_fechada' })))).toContain('A janela de 24 h fechou');
  });
});

describe('bloqueios', () => {
  it('pediu para parar: campo desligado, sem formulário', () => {
    const c = compor(tela({ opt_out: true, eva_active: false, conversation_messages: msgsCliente(2) }, envio()));
    expect(c).toContain('Este contato pediu para parar');
    expect(c).not.toContain('<form');
  });
  it('casa sem número oficial: motivo certo (não manda conectar QR)', () => {
    const c = compor(tela({ conversation_messages: msgsCliente(2) }, envio({ via: 'nenhum', semCanalMotivo: 'whatsapp_nao_configurado', modelos: [] })));
    expect(c).toContain('O número oficial não está configurado');
    expect(c).not.toContain('/dashboard/whatsapp');
  });
  it('tenant sem WhatsApp conectado: "Conecte o WhatsApp" com o link, sem "Eva"', () => {
    const h = tela({ conversation_messages: msgsCliente(2) }, envio({ via: 'nenhum', canal: 'qr_code', modelos: [], semCanalMotivo: 'sem_canal' }), USER_TENANT);
    const c = compor(h);
    expect(c).toContain('Conecte o WhatsApp da empresa');
    expect(c).toContain('href="/dashboard/whatsapp"');
    // (o confirm antigo do "Pediu pra parar" ainda diz "A Eva…" — pendência anterior, fora do chat)
    const chat = h.slice(h.indexOf('<section class="cc-at-col cc-at-chat"'), h.indexOf('</section>', h.indexOf('<section class="cc-at-col cc-at-chat"')));
    expect(chat).not.toMatch(/\bEva\b/);
  });
  it('tenant com QR: texto livre sem regra de 24 h, sem modelo e sem aviso de custo', () => {
    const c = compor(tela({ conversation_messages: msgsCliente(40) }, envio({ via: 'evolution', canal: 'qr_code', modelos: [] }), USER_TENANT));
    expect(c).toContain('/responder"');
    expect(c).not.toContain('responder-modelo');
    expect(c).not.toContain('Janela');
    expect(c).not.toContain('R$');
    expect(c).toContain('a Assistente fica pausada');
  });
  it('sem o estado do envio (ex.: sem permissão de editar): só "Abrir no WhatsApp"', () => {
    const c = compor(tela({ conversation_messages: msgsCliente(2) }, undefined));
    expect(c).not.toContain('<form');
    expect(c).toContain('Abrir no WhatsApp');
  });
});

describe('Assumir / Devolver no topo do chat', () => {
  it('Eva ativa: botão "✋ Assumir" (mesmo form pause-eva)', () => {
    const h = tela({}, envio());
    expect(h).toContain('<form class="cc-at-assumir" method="POST" action="/dashboard/leads/11111111-1111-1111-1111-111111111111/pause-eva">');
    expect(h).toContain('✋ Assumir');
  });
  it('assumida: faixa "Junior assumiu às HH:MM · Eva pausada" + "↩ Devolver para a Eva"', () => {
    const mensagens = [
      { role: 'user', content: 'Oi', timestamp: hAtras(3), autor: 'cliente' },
      { role: 'evento', content: '', timestamp: hAtras(1), autor: 'evento', evento: 'assumiu', autorNome: 'Junior' },
    ];
    const h = tela({ eva_active: false }, envio(), USER_CASA, mensagens);
    expect(h).toContain('✋ <strong>Junior assumiu às 13:00</strong> · Eva pausada até alguém devolver');
    expect(h).toContain('/resume-eva"><button type="submit" class="cc-btn cc-btn-sm cc-at-btn-devolver">↩ Devolver para a Eva</button>');
    expect(h).toContain('<div class="cc-at-evento cc-at-evento-assumiu" role="note">✋ Junior assumiu às 13:00</div>');
  });
  it('pausada sem evento (pausa antiga) e tenant: textos sem "Eva"', () => {
    const h = tela({ eva_active: false }, envio({ via: 'evolution', canal: 'qr_code', modelos: [] }), USER_TENANT);
    expect(h).toContain('Atendimento com a equipe');
    expect(h).toContain('↩ Devolver para a Assistente');
  });
});

describe('balões novos', () => {
  it('mensagem do painel: autor + "pelo painel"; falhou aparece; canal só quando há 2 números', () => {
    const mensagens = [
      { role: 'user', content: 'Oi', timestamp: hAtras(3), autor: 'cliente', canal: 'eva_oficial' },
      { role: 'assistant', content: 'Oi Ana, <i>aqui</i> é o Junior', timestamp: hAtras(2), autor: 'humano', autorNome: 'Junior', status: 'falhou', canal: 'eva_oficial' },
    ];
    const h = tela({}, envio(), USER_CASA, mensagens);
    expect(h).toContain('cc-at-msg cc-at-msg-eva cc-at-msg-hum');
    expect(h).toContain('Junior · pelo painel');
    expect(h).toContain('Oi Ana, &lt;i&gt;aqui&lt;/i&gt; é o Junior');
    expect(h).toContain('não saiu — o WhatsApp recusou');
    expect(h).not.toContain('<span class="cc-at-msg-canal">');
    const dois = tela({}, envio(), USER_CASA, [...mensagens, { role: 'user', content: 'e aí', timestamp: hAtras(1), autor: 'cliente', canal: 'whatsapp_business' }]);
    expect(dois).toContain('<span class="cc-at-msg-canal">👤 Meu WhatsApp</span>');
  });
  it('textoDoEvento e rotuloCanal', () => {
    expect(textoDoEvento({ evento: 'devolveu', autorNome: 'Bia', timestamp: '2026-09-28T18:10:00Z' }, 'Eva')).toBe('↩ Devolvido para a Eva às 15:10 (por Bia)');
    expect(textoDoEvento({ evento: 'assumiu', autorNome: null, timestamp: null }, 'Eva')).toBe('✋ Alguém da equipe assumiu');
    expect(rotuloCanal('eva_oficial', 'Eva')).toBe('🤖 Eva');
    expect(rotuloCanal('qr_code', 'Assistente')).toBe('🤖 Assistente');
    expect(rotuloCanal('whatsapp_business', 'Eva', 'Junior')).toBe('👤 Junior');
  });
});

describe('permissão', () => {
  it('quem só VISUALIZA leads não vê Assumir/Devolver (a rota exige editar)', () => {
    const leitor = { ...USER_CASA, id: 'u-leitor', isAdmin: false, permissoes: { leads: ['visualizar'] } } as any;
    expect(tela({}, undefined, leitor)).not.toContain('/pause-eva"');
    const pausada = tela({ eva_active: false }, undefined, leitor);
    expect(pausada).toContain('pausada até alguém devolver');
    expect(pausada).not.toContain('/resume-eva"');
  });
});
