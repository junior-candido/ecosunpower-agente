// Learning module - continuously improves from interactions
import { SupabaseClient } from '@supabase/supabase-js';

interface LearningInsight {
  type: 'unanswered_question' | 'common_topic' | 'objection' | 'new_product_mention' | 'competitor_mention' | 'positive_feedback' | 'negative_feedback';
  topic: string;
  detail: string;
  frequency: number;
  source_lead_id?: string;
}

export class LearningModule {
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async initialize(): Promise<void> {
    // Create learning tables if not exist (safe to call multiple times)
    // Tables are created via SQL migration, not here
    console.log('[learning] Module initialized');
  }

  // Analyze a conversation and extract learnings
  async analyzeConversation(
    messages: Array<{ role: string; content: string }>,
    leadId: string,
    wasTransferred: boolean
  ): Promise<void> {
    try {
      for (const msg of messages) {
        if (msg.role !== 'user') continue;
        const text = msg.content.toLowerCase();

        // Detect questions the agent might struggle with
        if (text.includes('?') || text.startsWith('como') || text.startsWith('qual') ||
            text.startsWith('quanto') || text.startsWith('por que') || text.startsWith('quando')) {
          await this.trackQuestion(text, leadId);
        }

        // Detect competitor mentions
        const competitors = ['growatt', 'fronius', 'sma', 'canadian', 'risen', 'jinko',
          'weg', 'abb', 'goodwe', 'sofar', 'saj', 'enphase', 'apsystems'];
        for (const comp of competitors) {
          if (text.includes(comp)) {
            await this.saveInsight({
              type: 'competitor_mention',
              topic: comp,
              detail: `Cliente mencionou ${comp}: "${text.substring(0, 200)}"`,
              frequency: 1,
              source_lead_id: leadId,
            });
          }
        }

        // Detect product mentions not in our catalog
        const unknownProducts = this.detectUnknownProducts(text);
        for (const product of unknownProducts) {
          await this.saveInsight({
            type: 'new_product_mention',
            topic: product,
            detail: `Cliente perguntou sobre ${product}: "${text.substring(0, 200)}"`,
            frequency: 1,
            source_lead_id: leadId,
          });
        }

        // Detect objections
        const objections = ['caro', 'muito caro', 'nao compensa', 'nao vale', 'demora',
          'feio', 'estraga', 'nao funciona', 'golpe', 'piramide', 'nao confio',
          'vizinho', 'reclamou', 'problema', 'arrependeu'];
        for (const obj of objections) {
          if (text.includes(obj)) {
            await this.saveInsight({
              type: 'objection',
              topic: obj,
              detail: `Objecao detectada: "${text.substring(0, 200)}"`,
              frequency: 1,
              source_lead_id: leadId,
            });
          }
        }

        // Detect positive signals
        const positives = ['excelente', 'otimo', 'perfeito', 'adorei', 'quero',
          'vamos fechar', 'me convenceu', 'top', 'show', 'massa', 'legal demais'];
        for (const pos of positives) {
          if (text.includes(pos)) {
            await this.saveInsight({
              type: 'positive_feedback',
              topic: 'satisfacao',
              detail: `Feedback positivo: "${text.substring(0, 200)}"`,
              frequency: 1,
              source_lead_id: leadId,
            });
          }
        }
      }

      // If conversation was transferred, log it as potential learning opportunity
      if (wasTransferred) {
        const lastUserMsg = messages.filter(m => m.role === 'user').pop();
        if (lastUserMsg) {
          await this.saveInsight({
            type: 'unanswered_question',
            topic: 'transferencia',
            detail: `Conversa transferida. Ultima mensagem: "${lastUserMsg.content.substring(0, 300)}"`,
            frequency: 1,
            source_lead_id: leadId,
          });
        }
      }
    } catch (error) {
      console.error('[learning] Error analyzing conversation:', error);
    }
  }

  private async trackQuestion(question: string, leadId: string): Promise<void> {
    // Check if similar question exists
    const { data: existing } = await this.client
      .from('conversation_patterns')
      .select('id, times_used')
      .ilike('question', `%${question.substring(0, 50)}%`)
      .limit(1);

    if (existing && existing.length > 0) {
      await this.client
        .from('conversation_patterns')
        .update({ times_used: existing[0].times_used + 1, updated_at: new Date().toISOString() })
        .eq('id', existing[0].id);
    } else {
      await this.client
        .from('conversation_patterns')
        .insert({
          pattern_type: 'question',
          question: question.substring(0, 500),
          times_used: 1,
        })
        .then(() => {});
    }
  }

  private async saveInsight(insight: LearningInsight): Promise<void> {
    // Check if similar insight exists
    const { data: existing } = await this.client
      .from('learning_insights')
      .select('id, frequency')
      .eq('type', insight.type)
      .eq('topic', insight.topic)
      .limit(1);

    if (existing && existing.length > 0) {
      await this.client
        .from('learning_insights')
        .update({
          frequency: existing[0].frequency + 1,
          detail: insight.detail,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing[0].id);
    } else {
      await this.client
        .from('learning_insights')
        .insert(insight)
        .then(() => {});
    }
  }

  private detectUnknownProducts(text: string): string[] {
    const unknownBrands = ['growatt', 'fronius', 'sma', 'goodwe', 'sofar',
      'saj', 'enphase', 'apsystems', 'jinko', 'weg', 'risen',
      'yingli', 'byd solar', 'phono solar'];
    const found: string[] = [];

    for (const brand of unknownBrands) {
      if (text.includes(brand) && !found.includes(brand)) {
        found.push(brand);
      }
    }
    return found;
  }

  // Generate learning report (call periodically or on demand)
  async generateReport(): Promise<string> {
    const { data: topQuestions } = await this.client
      .from('conversation_patterns')
      .select('question, times_used')
      .order('times_used', { ascending: false })
      .limit(10);

    const { data: topInsights } = await this.client
      .from('learning_insights')
      .select('type, topic, detail, frequency')
      .eq('resolved', false)
      .order('frequency', { ascending: false })
      .limit(15);

    let report = 'RELATORIO DE APRENDIZADO DO AGENTE\n';
    report += '====================================\n\n';

    if (topQuestions && topQuestions.length > 0) {
      report += 'PERGUNTAS MAIS FREQUENTES:\n';
      for (const q of topQuestions) {
        report += `- (${q.times_used}x) ${q.question.substring(0, 100)}\n`;
      }
      report += '\n';
    }

    if (topInsights && topInsights.length > 0) {
      const byType: Record<string, typeof topInsights> = {};
      for (const i of topInsights) {
        if (!byType[i.type]) byType[i.type] = [];
        byType[i.type].push(i);
      }

      if (byType['unanswered_question']) {
        report += 'PERGUNTAS NAO RESPONDIDAS (transferidas):\n';
        for (const i of byType['unanswered_question']) {
          report += `- (${i.frequency}x) ${i.detail?.substring(0, 150)}\n`;
        }
        report += '\n';
      }

      if (byType['objection']) {
        report += 'OBJECOES MAIS COMUNS:\n';
        for (const i of byType['objection']) {
          report += `- (${i.frequency}x) ${i.topic}\n`;
        }
        report += '\n';
      }

      if (byType['competitor_mention']) {
        report += 'CONCORRENTES MENCIONADOS:\n';
        for (const i of byType['competitor_mention']) {
          report += `- (${i.frequency}x) ${i.topic}\n`;
        }
        report += '\n';
      }

      if (byType['new_product_mention']) {
        report += 'PRODUTOS/MARCAS NAO CATALOGADOS:\n';
        for (const i of byType['new_product_mention']) {
          report += `- (${i.frequency}x) ${i.topic}\n`;
        }
        report += '\n';
      }
    }

    report += '====================================\n';
    report += 'Use este relatorio para atualizar a base de conhecimento!\n';

    return report;
  }
}
