import Anthropic from '@anthropic-ai/sdk';
import { SupabaseClient } from '@supabase/supabase-js';

// Enum de installation_status. Fonte unica — importe no endpoint pra
// validacao, evita drift entre codigo e migration (CHECK constraint espelha
// esses valores em 008_ads_funnel_and_post_install.sql).
export const INSTALLATION_STATUSES = [
  'contrato_assinado',
  'equipamento_entregue',
  'instalado',
  'medidor_trocado',
  'operando',
  'pos_venda_concluido',
] as const;
export type InstallationStatus = typeof INSTALLATION_STATUSES[number];

interface TouchStep {
  days: number;
  type: 'review_request' | 'review_nudge' | 'indication_invite';
}

// Cadencia decrescente a partir da troca do medidor (dia 0 = medidor trocado).
// Junior mencionou que geralmente pede avaliacao ~10 dias apos instalacao,
// que coincide com a troca do medidor pela distribuidora.
//
// A cadencia para assim que o cliente confirma avaliacao (via action
// `mark_review_confirmed` disparada pela Eva ao detectar "ja avaliei" ou
// screenshot do GMB). Se nao confirmar em 30 dias, o sistema para de pedir
// pra nao queimar relacionamento — independente do resultado, o convite de
// indicacao ainda dispara no dia 30.
const CADENCE: TouchStep[] = [
  { days: 0, type: 'review_request' },      // mesmo dia da troca do medidor
  { days: 7, type: 'review_nudge' },        // 1 semana: reforco leve
  { days: 15, type: 'review_nudge' },       // 2 semanas: "nao esqueci"
  { days: 30, type: 'review_nudge' },       // 1 mes: ultima tentativa
  { days: 33, type: 'indication_invite' },  // dia 33: convite indicacao
  // Obs: indication vai 3 dias depois do ultimo review_nudge pra nao
  // empilhar 2 mensagens no mesmo dia (parece robotico).
];

const TOPIC_GUIDE: Record<TouchStep['type'], string> = {
  review_request:
    'primeiro pedido de avaliacao no Google apos troca do medidor. Tom: ' +
    'amigo do cliente, nao vendedor. Mencione que medidor foi trocado e ' +
    'sistema ja esta operando. Inclua o link: {{review_link}}. Lembre que ' +
    '1 minuto ajuda muito. Sem pressao. Pode dizer que audio ou texto do ' +
    'cliente tambem seria bem-vindo (o cliente pode mandar pra Eva).',
  review_nudge:
    'reforco leve pra avaliacao no Google. Nao insistir, so lembrar. Tom: ' +
    'casual, como quem passa pra dar um oi e aproveita pra lembrar. Link: ' +
    '{{review_link}}. Pode mencionar que o cliente ja deve estar vendo ' +
    'economia na conta. Reconheca sutilmente que ja pediu antes (sem drama). ' +
    'Maximo 3 linhas. Se preferir, convide pra mandar audio ou escrever ' +
    'aqui no whatsapp que o Junior organiza.',
  indication_invite:
    'convite pro programa de indicacao da Ecosunpower: quem indica alguem e ' +
    'essa pessoa fecha contrato, ganha R$300 no PIX. Tom: amigavel, informal. ' +
    'Pergunte como o sistema esta indo e deixa o convite sutil.',
};

export class PostInstallService {
  constructor(
    private supabase: SupabaseClient,
    private anthropic: Anthropic,
    private sendText: (to: string, text: string) => Promise<void>,
    private reviewLink: string,
  ) {}

  // Chamado quando Junior marca medidor_trocado. Agenda os 3 toques e atualiza
  // meter_swapped_at no lead. Throws on critical errors pra endpoint retornar
  // 500 ao inves de lie 200.
  async scheduleOnMeterSwap(leadId: string): Promise<void> {
    const now = new Date();
    const { error: updateErr } = await this.supabase
      .from('leads')
      .update({
        installation_status: 'medidor_trocado',
        meter_swapped_at: now.toISOString(),
      })
      .eq('id', leadId);
    if (updateErr) {
      throw new Error(`Failed to update lead status: ${updateErr.message}`);
    }

    // Cancel any existing pending touches for this lead (re-trigger case)
    const { error: cancelErr } = await this.supabase
      .from('post_install_touches')
      .update({ status: 'canceled' })
      .eq('lead_id', leadId)
      .eq('status', 'pending');
    if (cancelErr) {
      throw new Error(`Failed to cancel existing touches: ${cancelErr.message}`);
    }

    const rows = CADENCE.map((c) => ({
      lead_id: leadId,
      touch_type: c.type,
      scheduled_for: new Date(now.getTime() + c.days * 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
    }));
    const { error } = await this.supabase.from('post_install_touches').insert(rows);
    if (error) {
      // Unique constraint violation = corrida concorrente, tratamento graceful
      if (error.code === '23505') {
        console.warn(`[post-install] Touches already scheduled for lead ${leadId} (concurrent call)`);
        return;
      }
      throw new Error(`Failed to schedule touches: ${error.message}`);
    }
    console.log(`[post-install] Scheduled ${rows.length} touches for lead ${leadId}`);
  }

  async cancelAll(leadId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('post_install_touches')
      .update({ status: 'canceled' })
      .eq('lead_id', leadId)
      .eq('status', 'pending')
      .select('id');
    if (error) {
      console.error('[post-install] Cancel failed:', error.message);
      return 0;
    }
    return data?.length ?? 0;
  }

  async markReviewConfirmed(leadId: string): Promise<void> {
    const now = new Date().toISOString();

    // Marca o lead como tendo avaliado (idempotente — so seta se ainda for null)
    await this.supabase
      .from('leads')
      .update({ review_confirmed_at: now })
      .eq('id', leadId)
      .is('review_confirmed_at', null);

    // So atualiza toques AINDA pending pra nao sobrescrever historico de
    // sent/failed com 'review_confirmed'. Se o cliente avaliar depois do
    // envio, queremos preservar o sent_at original.
    const { data, error } = await this.supabase
      .from('post_install_touches')
      .update({ status: 'review_confirmed' })
      .eq('lead_id', leadId)
      .eq('status', 'pending')
      .in('touch_type', ['review_request', 'review_nudge'])
      .select('id');
    if (error) {
      console.error('[post-install] markReviewConfirmed failed:', error.message);
      return;
    }
    const canceled = data?.length ?? 0;
    console.log(`[post-install] Review confirmed for ${leadId} — canceled ${canceled} pending nudges`);
  }

  // Chamado periodicamente pelo scheduler (a cada 2h). Busca toques vencidos,
  // gera mensagem personalizada via Claude e envia pelo WhatsApp.
  async processDueTouches(): Promise<number> {
    const { data, error } = await this.supabase
      .from('post_install_touches')
      .select('id, touch_type, leads(id, phone, name, city, energy_data, opt_out)')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .limit(10);
    if (error) {
      console.error('[post-install] Fetch due failed:', error.message);
      return 0;
    }
    if (!data || data.length === 0) return 0;

    let sent = 0;
    for (const touch of data as unknown as Array<{
      id: string;
      touch_type: TouchStep['type'];
      leads: {
        id: string;
        phone: string;
        name: string | null;
        city: string | null;
        energy_data: Record<string, unknown> | null;
        opt_out: boolean | null;
      } | null;
    }>) {
      const lead = touch.leads;
      if (!lead || !lead.phone) {
        await this.supabase
          .from('post_install_touches')
          .update({ status: 'failed' })
          .eq('id', touch.id);
        continue;
      }
      // Respeitar opt_out mesmo se foi flipado manualmente no DB depois do
      // agendamento. Cancela em vez de falhar — nao e erro, e politica.
      if (lead.opt_out === true) {
        await this.supabase
          .from('post_install_touches')
          .update({ status: 'canceled' })
          .eq('id', touch.id);
        console.log(`[post-install] Skipped touch ${touch.id} — lead opted out`);
        continue;
      }
      try {
        const message = await this.generateMessage(touch.touch_type, lead.name);
        await this.sendText(lead.phone, message);
        await this.supabase
          .from('post_install_touches')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            message_sent: message,
          })
          .eq('id', touch.id);
        console.log(`[post-install] Sent ${touch.touch_type} to ${lead.phone}`);
        sent++;
        // Jitter entre mensagens pra parecer humano e evitar rate limit
        await new Promise((r) => setTimeout(r, 30000 + Math.floor(Math.random() * 60000)));
      } catch (err) {
        console.error(`[post-install] Touch ${touch.id} failed:`, (err as Error).message);
        await this.supabase
          .from('post_install_touches')
          .update({ status: 'failed' })
          .eq('id', touch.id);
      }
    }
    return sent;
  }

  private async generateMessage(
    type: TouchStep['type'],
    name: string | null,
  ): Promise<string> {
    const firstName = (name ?? '').split(' ')[0] || 'tudo certo';
    const guide = TOPIC_GUIDE[type].replace('{{review_link}}', this.reviewLink);

    const prompt = `Voce e o Junior Rodrigues, engenheiro da Ecosunpower Energia Solar (Brasilia/DF e Goias).
Esta mandando uma mensagem pessoal via WhatsApp pra um cliente que JA INSTALOU solar com voce.

Contato: ${firstName}
Momento: pos-instalacao
Tipo de mensagem: ${type}
Diretriz: ${guide}

Regras estritas:
- Maximo 3-4 linhas curtas
- Primeira pessoa (Junior falando direto com o cliente)
- Tom: amigo reencontrando amigo, nunca vendedor
- Sem emoji, sem asterisco, sem markdown
- Use o primeiro nome naturalmente UMA vez
- Se tiver link pra mandar, coloca em linha separada no final
- Nao cumprimente com "oi cliente", trate como amigo ("e ai ${firstName}")
- Nao exagere simpatia ("espero que esteja tudo maravilhoso") — seja real

Gere APENAS o texto da mensagem, sem explicacao.`;

    const res = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
  }
}
