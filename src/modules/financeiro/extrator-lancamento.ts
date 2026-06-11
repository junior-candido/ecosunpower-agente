// src/modules/financeiro/extrator-lancamento.ts
// Extração estruturada de lançamento financeiro (gasto/entrada) por IA.
// Parse e prompts são PUROS (testáveis); as chamadas de IA recebem o client
// injetado (Opus com fallback Haiku — mesmo padrão do vision.ts).
import type Anthropic from '@anthropic-ai/sdk';
import { CATEGORIA_SLUGS } from './lancamentos.js';

export interface ExtracaoLancamento {
  financeiro: boolean;
  intencao: 'lancar' | 'corrigir' | 'apagar';
  tipo: 'despesa' | 'entrada' | null;
  valor: number | null;
  data: string | null;            // YYYY-MM-DD
  contraparte: string | null;
  categoria_slug: string | null;
  pf_pj: 'PF' | 'PJ' | null;
  obra_ref: string | null;        // nome do cliente/obra citado, se houver
  descricao: string | null;
  campos_faltando: string[];
}

function numeroOuNull(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v) && v > 0) return v;
  if (typeof v === 'string') {
    const s = v.trim().replace(/^R\$\s*/, '');
    // Só formato BR inequívoco: "380", "380,50", "1.234,56". Formato ambíguo
    // (ex. "380.50" americano) → null e a Eva pergunta — dinheiro não se chuta.
    if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(s) || /^\d+(,\d{1,2})?$/.test(s)) {
      const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
      if (isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

const strOuNull = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

// Parse defensivo: a IA pode mandar texto em volta, valor como string BR,
// campos faltando. NUNCA explode — null = "não entendi, não lança nada".
export function parseRespostaExtrator(raw: string): ExtracaoLancamento | null {
  const m = raw.match(/```json\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
  if (!m) return null;
  let obj: Record<string, unknown>;
  try { obj = JSON.parse(m[1]); } catch { return null; }
  if (typeof obj !== 'object' || obj === null) return null;

  const valor = numeroOuNull(obj.valor);
  const faltando = new Set<string>(
    Array.isArray(obj.campos_faltando) ? obj.campos_faltando.filter((x): x is string => typeof x === 'string') : [],
  );
  if (valor === null && obj.valor !== undefined && obj.valor !== null) faltando.add('valor');

  const intencao = obj.intencao === 'corrigir' || obj.intencao === 'apagar' ? obj.intencao : 'lancar';
  const tipo = obj.tipo === 'despesa' || obj.tipo === 'entrada' ? obj.tipo : null;
  const pf = obj.pf_pj === 'PF' || obj.pf_pj === 'PJ' ? obj.pf_pj : null;
  const data = typeof obj.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.data) ? obj.data : null;

  return {
    financeiro: obj.financeiro === true,
    intencao, tipo, valor, data,
    contraparte: strOuNull(obj.contraparte),
    categoria_slug: strOuNull(obj.categoria_slug),
    pf_pj: pf,
    obra_ref: strOuNull(obj.obra_ref),
    descricao: strOuNull(obj.descricao),
    campos_faltando: [...faltando],
  };
}

const REGRAS_COMUNS = (hoje: string) => `Devolva APENAS um bloco \`\`\`json\`\`\` com:
{"financeiro": true/false, "intencao": "lancar"|"corrigir"|"apagar", "tipo": "despesa"|"entrada"|null,
 "valor": número ou null, "data": "YYYY-MM-DD" ou null, "contraparte": "quem (posto/fornecedor/cliente)" ou null,
 "categoria_slug": uma de [${CATEGORIA_SLUGS.join(', ')}] ou null, "pf_pj": "PF"|"PJ"|null,
 "obra_ref": "nome do cliente/obra citado" ou null, "descricao": "resumo curto" ou null,
 "campos_faltando": ["valor", "pf_pj", ...]}

REGRAS (dinheiro em jogo — leia como contador):
- NUNCA invente valor. Não deu pra ler com certeza → valor null + "valor" em campos_faltando.
- Comprovante sem data legível → use a data de hoje: ${hoje}. "ontem"/"anteontem" → calcule a partir de hoje.
- pf_pj: PJ = gasto/receita da EMPRESA (obra, material, anúncio, kit, conta PJ). PF = pessoal
  (mercado da casa, lazer). Na DÚVIDA → null + "pf_pj" em campos_faltando. NÃO assuma.
- categoria_slug: escolha a MAIS parecida da lista; nada encaixa → "outros".
- "entrou"/"recebi"/"caiu"/"cliente pagou" → tipo "entrada". "gastei"/"paguei"/"comprei" e
  comprovante de compra/PIX enviado → tipo "despesa".
- intencao "corrigir": a pessoa quer ARRUMAR um lançamento já feito ("o do posto era 350").
  intencao "apagar": quer remover ("apaga o último gasto"). Senão → "lancar".
- financeiro false quando NÃO for assunto de dinheiro da empresa/pessoal: conta de luz de
  CLIENTE, foto de telhado/obra, documento de proposta, conversa comum. Na dúvida sobre ser
  financeiro → false (o fluxo normal trata).`;

export function montarPromptExtracaoTexto(texto: string, hoje: string): string {
  return `Você lê mensagens do DONO de uma empresa de energia solar e extrai lançamentos financeiros (gasto ou entrada de dinheiro).

Mensagem dele (pode ser transcrição de áudio/vídeo): "${texto}"

${REGRAS_COMUNS(hoje)}`;
}

export function montarPromptExtracaoMidia(hoje: string): string {
  return `Você lê comprovantes financeiros do DONO de uma empresa de energia solar (foto ou PDF: comprovante PIX, nota fiscal, cupom, boleto, fatura de cartão).

Extraia o lançamento financeiro do documento.

${REGRAS_COMUNS(hoje)}`;
}

export function montarPromptGate(texto: string): string {
  return `O dono de uma empresa manda mensagens variadas. Responda APENAS "SIM" ou "NAO":
a mensagem abaixo fala de DINHEIRO entrando ou saindo (gasto, pagamento, compra, recebimento, correção ou exclusão de um lançamento financeiro)?

Mensagem: "${texto}"`;
}

// ---------------------------------------------------------------------------
// Chamadas de IA (camada I/O fina — sem teste unitário)
// ---------------------------------------------------------------------------
const MODELO_FORTE = 'claude-opus-4-7';
const MODELO_RAPIDO = 'claude-haiku-4-5-20251001';

async function chamarComFallback(client: Anthropic, messages: Anthropic.Messages.MessageParam[], maxTokens: number): Promise<string> {
  let response;
  try {
    response = await client.messages.create({ model: MODELO_FORTE, max_tokens: maxTokens, messages });
  } catch (apiErr) {
    console.warn('[caixa-entrada] Opus indisponível, fallback Haiku:', (apiErr as Error).message);
    response = await client.messages.create({ model: MODELO_RAPIDO, max_tokens: maxTokens, messages });
  }
  return response.content.filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text').map((b) => b.text).join('');
}

// Gate barato: decide se um texto de admin é assunto financeiro. Haiku direto
// (sem Opus — roda em TODA mensagem de texto do admin fora de modo).
export async function gateTextoFinanceiro(client: Anthropic, texto: string): Promise<boolean> {
  try {
    const r = await client.messages.create({
      model: MODELO_RAPIDO, max_tokens: 5,
      messages: [{ role: 'user', content: montarPromptGate(texto) }],
    });
    const out = r.content.filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text').map((b) => b.text).join('');
    return out.trim().toUpperCase().startsWith('SIM');
  } catch (err) {
    console.warn('[caixa-entrada] gate falhou (segue fluxo normal):', (err as Error).message);
    return false;
  }
}

// hoje = data em America/Sao_Paulo (BRT). NUNCA new Date().toISOString() direto — das 21h às 0h o servidor UTC já virou o dia.
export async function extrairDeTexto(client: Anthropic, texto: string, hoje: string): Promise<ExtracaoLancamento | null> {
  const raw = await chamarComFallback(client, [{ role: 'user', content: montarPromptExtracaoTexto(texto, hoje) }], 1024);
  return parseRespostaExtrator(raw);
}

// hoje = data em America/Sao_Paulo (BRT). NUNCA new Date().toISOString() direto — das 21h às 0h o servidor UTC já virou o dia.
export async function extrairDeImagem(client: Anthropic, base64: string, mediaType: string, hoje: string): Promise<ExtracaoLancamento | null> {
  const mt = (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType) ? mediaType : 'image/jpeg') as
    'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  const raw = await chamarComFallback(client, [{
    role: 'user',
    content: [
      { type: 'image', source: { type: 'base64', media_type: mt, data: base64 } },
      { type: 'text', text: montarPromptExtracaoMidia(hoje) },
    ],
  }], 1024);
  return parseRespostaExtrator(raw);
}

// hoje = data em America/Sao_Paulo (BRT). NUNCA new Date().toISOString() direto — das 21h às 0h o servidor UTC já virou o dia.
export async function extrairDePdf(client: Anthropic, base64: string, hoje: string): Promise<ExtracaoLancamento | null> {
  const raw = await chamarComFallback(client, [{
    role: 'user',
    content: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
      { type: 'text', text: montarPromptExtracaoMidia(hoje) },
    ],
  }], 1024);
  return parseRespostaExtrator(raw);
}
