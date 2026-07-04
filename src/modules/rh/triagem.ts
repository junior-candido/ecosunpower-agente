// src/modules/rh/triagem.ts
// Triagem IA de currículos (Entrega 2 do RH): quando chega candidatura, a IA
// lê o PDF, compara com a vaga e grava nota 0-10 + resumo + alertas.
// Mesmo padrão do financeiro (extrator-lancamento.ts): PDF base64 -> Claude
// (Opus com reserva no Haiku) -> bloco ```json```.
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

const MODELO_FORTE = 'claude-opus-4-7';
const MODELO_RAPIDO = 'claude-haiku-4-5-20251001';
const BUCKET = 'curriculos';
const NOTA_AVISO = 8; // nota >= isso -> avisa o Junior no zap

export interface VagaTriagem { titulo: string; requisitos: string; descricao: string }
export interface ResultadoTriagem { nota: number; resumo: string; alertas: string }

// ---------------------------------------------------------------------------
// PURO (testável)
// ---------------------------------------------------------------------------

export function montarPromptTriagem(vaga: VagaTriagem | null): string {
  const contexto = vaga
    ? `O candidato se aplicou pra esta VAGA:
- Cargo: ${vaga.titulo}
- Requisitos: ${vaga.requisitos || '(não informados — avalie pelo cargo)'}
- O que vai fazer: ${vaga.descricao || '(não informada)'}`
    : `O candidato entrou pro BANCO DE TALENTOS (sem vaga específica) de uma empresa de energia solar
(instalação fotovoltaica, elétrica, manutenção, comercial e administrativo). Avalie o potencial
geral do perfil pra área de energia solar.`;

  return `Você é o recrutador técnico da EcoSunPower Energia Solar (Brasília-DF).
Leia o currículo em anexo e avalie com rigor e honestidade.

${contexto}

Responda APENAS com um bloco \`\`\`json\`\`\` neste formato:
{
  "nota": 7.5,            // 0 a 10: aderência REAL do currículo (vaga ou área solar). Sem inflar.
  "resumo": "...",        // até 3 frases: experiência relevante, pontos fortes, tempo de área.
  "alertas": ["..."]      // o que pesa contra ou falta conferir (ex.: "não menciona NR-35",
                          // "mora longe de Brasília", "sem experiência em telhado"). Vazio se nada.
}
Regras: nota alta (8+) SÓ com evidência clara no currículo. Currículo fora da área ou
sem informação útil = nota baixa com o motivo nos alertas. Não invente dados.`;
}

export function parseTriagem(raw: string): ResultadoTriagem | null {
  const m = /```json\s*([\s\S]*?)```/.exec(raw);
  if (!m) return null;
  let obj: { nota?: unknown; resumo?: unknown; alertas?: unknown };
  try { obj = JSON.parse(m[1]); } catch { return null; }
  const notaCrua = typeof obj.nota === 'string' ? Number(obj.nota) : obj.nota;
  if (typeof notaCrua !== 'number' || !Number.isFinite(notaCrua)) return null;
  const nota = Math.min(10, Math.max(0, notaCrua));
  const resumo = typeof obj.resumo === 'string' ? obj.resumo.trim() : '';
  const alertas = Array.isArray(obj.alertas)
    ? obj.alertas.map((a) => String(a).trim()).filter(Boolean).join(' · ')
    : typeof obj.alertas === 'string' ? obj.alertas.trim() : '';
  return { nota, resumo, alertas };
}

// ---------------------------------------------------------------------------
// IO
// ---------------------------------------------------------------------------

async function chamarComFallback(client: Anthropic, messages: Anthropic.Messages.MessageParam[]): Promise<string> {
  let response;
  try {
    response = await client.messages.create({ model: MODELO_FORTE, max_tokens: 800, messages });
  } catch (apiErr) {
    console.warn('[rh-triagem] Opus indisponível, fallback Haiku:', (apiErr as Error).message);
    response = await client.messages.create({ model: MODELO_RAPIDO, max_tokens: 800, messages });
  }
  return response.content.filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text').map((b) => b.text).join('');
}

interface CandidatoPendente {
  id: string;
  nome: string;
  telefone: string;
  vaga_id: string | null;
  curriculo_path: string;
}

export class TriagemService {
  // Trava em memória: o gatilho pós-candidatura e o cron podem rodar juntos —
  // sem isso o mesmo candidato seria triado 2x (e avisado 2x no zap).
  private emProcessamento = new Set<string>();

  // notificar: aviso no zap do Junior quando sair nota >= 8 (injetado pelo index).
  constructor(
    private supabase: SupabaseClient,
    private anthropic: Anthropic,
    private notificar?: (texto: string) => Promise<void>,
  ) {}

  // Processa até `limite` candidatos ainda sem nota. Chamada pelo cron (5min) e
  // logo depois de cada candidatura nova. Falha PERMANENTE (PDF ilegível/parse)
  // marca alertas_ia e não tenta de novo; falha TRANSITÓRIA (API/rede) fica
  // intacta pra próxima rodada.
  async triarPendentes(limite = 5): Promise<{ triados: number; falhas: number }> {
    const { data, error } = await this.supabase
      .from('rh_candidatos')
      .select('id,nome,telefone,vaga_id,curriculo_path')
      .is('nota_ia', null)
      .is('alertas_ia', null)
      .order('created_at', { ascending: true })
      .limit(limite);
    if (error || !data || data.length === 0) return { triados: 0, falhas: 0 };

    let triados = 0, falhas = 0;
    for (const c of data as CandidatoPendente[]) {
      if (this.emProcessamento.has(c.id)) continue;
      this.emProcessamento.add(c.id);
      try {
        const ok = await this.triarUm(c);
        if (ok) triados++; else falhas++;
      } catch (err) {
        falhas++;
        console.warn(`[rh-triagem] candidato ${c.id} (transitório, tenta depois): ${(err as Error).message}`);
      } finally {
        this.emProcessamento.delete(c.id);
      }
    }
    return { triados, falhas };
  }

  private async triarUm(c: CandidatoPendente): Promise<boolean> {
    // 0) Reconfere no banco JÁ COM a trava na mão: a query de pendentes de uma
    // rodada concorrente pode ter um retrato velho (resolvida antes do update
    // da outra rodada) — sem isso o mesmo candidato seria triado e avisado 2x.
    const { data: fresco } = await this.supabase
      .from('rh_candidatos').select('nota_ia,alertas_ia').eq('id', c.id).maybeSingle();
    if (!fresco || (fresco as { nota_ia: number | null }).nota_ia !== null
      || (fresco as { alertas_ia: string | null }).alertas_ia !== null) return true; // já triado por outra rodada

    // 1) PDF do cofre. Só "não existe" (400/404) é permanente; queda/timeout do
    // Storage é transitória — estoura pro catch de cima e tenta na próxima.
    const dl = await this.supabase.storage.from(BUCKET).download(c.curriculo_path);
    if (dl.error || !dl.data) {
      const status = Number((dl.error as { status?: number; statusCode?: number | string } | null)?.status
        ?? (dl.error as { statusCode?: number | string } | null)?.statusCode ?? 0);
      if (status === 400 || status === 404) {
        await this.marcarFalha(c.id, 'Triagem: não achei o PDF do currículo no cofre.');
        return false;
      }
      throw new Error(`storage download falhou (${status || dl.error?.message || 'sem detalhe'})`);
    }
    const base64 = Buffer.from(await dl.data.arrayBuffer()).toString('base64');

    // 2) vaga (se tiver)
    let vaga: VagaTriagem | null = null;
    if (c.vaga_id) {
      const { data: v } = await this.supabase.from('rh_vagas').select('titulo,requisitos,descricao').eq('id', c.vaga_id).maybeSingle();
      if (v) vaga = v as VagaTriagem;
    }

    // 3) IA lê e avalia. Erro 400 da API = o PDF em si não dá (senha, corrompido,
    // páginas demais) -> permanente, marca e para de insistir. 429/5xx/rede =
    // transitório, estoura pro catch de cima e tenta na próxima rodada.
    let raw: string;
    try {
      raw = await chamarComFallback(this.anthropic, [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: montarPromptTriagem(vaga) },
        ],
      }]);
    } catch (apiErr) {
      const status = (apiErr as { status?: number }).status;
      if (status === 400) {
        await this.marcarFalha(c.id, 'Triagem: o PDF não pôde ser lido pela IA (protegido/corrompido?) — avalia na mão.');
        return false;
      }
      throw apiErr;
    }
    const r = parseTriagem(raw);
    if (!r) {
      // modelo não devolveu o formato = permanente (currículo ilegível na prática)
      await this.marcarFalha(c.id, 'Triagem: não consegui ler este currículo direito — avalia na mão.');
      return false;
    }

    // 4) grava
    const { error } = await this.supabase
      .from('rh_candidatos')
      .update({ nota_ia: r.nota, resumo_ia: r.resumo, alertas_ia: r.alertas || null })
      .eq('id', c.id);
    if (error) { console.warn(`[rh-triagem] update ${c.id}: ${error.message}`); return false; }
    console.log(`[rh-triagem] ${c.nome}: nota ${r.nota}`);

    // 5) nota alta -> aviso no zap (falha de aviso não derruba a triagem)
    if (r.nota >= NOTA_AVISO && this.notificar) {
      const rotuloVaga = vaga ? vaga.titulo : 'Banco de Talentos';
      await this.notificar(
        `🧑‍💼 *Candidato nota ${r.nota.toFixed(1)}* na vaga *${rotuloVaga}*\n\n` +
        `*${c.nome}* — wa.me/${c.telefone}\n${r.resumo}\n` +
        (r.alertas ? `⚠️ ${r.alertas}\n` : '') +
        `\nVer no painel: /dashboard/rh/candidatos`,
      ).catch((err) => console.warn('[rh-triagem] aviso zap falhou:', (err as Error).message));
    }
    return true;
  }

  private async marcarFalha(id: string, motivo: string): Promise<void> {
    await this.supabase.from('rh_candidatos').update({ alertas_ia: motivo }).eq('id', id);
  }
}
