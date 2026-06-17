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
  material: string | null;        // nome do material comprado (DPS, cabo 6mm) — só compra de material
  quantidade: number | null;      // quantos (100) — default 1 no consumo
  unidade: string | null;         // un, m, rolo...
  campos_faltando: string[];
  relacionado: boolean | null;    // true = corrige pendente; false = lançamento NOVO; null = modelo não informou (NUNCA mescla)
  tem_nota: boolean;
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

// Normaliza UM objeto cru da IA em ExtracaoLancamento (mesma lógica de validação de antes).
function normalizarItem(obj: Record<string, unknown>): ExtracaoLancamento {
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
    material: strOuNull(obj.material),
    quantidade: numeroOuNull(obj.quantidade),
    unidade: strOuNull(obj.unidade),
    campos_faltando: [...faltando],
    relacionado: obj.relacionado === true ? true : obj.relacionado === false ? false : null,
    tem_nota: obj.tem_nota === false ? false : true,
  };
}

function tentarJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return undefined; }
}

// Quebra um texto em objetos {...} de TOPO usando contagem balanceada de chaves,
// ignorando chaves dentro de strings. Substitui a regex gulosa que juntava 2 objetos.
function splitObjetosJson(s: string): string[] {
  const objs: string[] = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') { if (depth === 0) start = i; depth++; }
    else if (c === '}') { if (depth > 0 && --depth === 0 && start >= 0) { objs.push(s.slice(start, i + 1)); start = -1; } }
  }
  return objs;
}

// Parse defensivo em LISTA: aceita array, {lancamentos:[...]}, objeto único, ou
// vários objetos soltos. NUNCA explode — pior caso devolve [].
export function parseLancamentos(raw: string): ExtracaoLancamento[] {
  // Só o PRIMEIRO bloco ```json é lido; se o modelo emitir dois blocos separados o resto é ignorado (raro).
  const fence = raw.match(/```json\s*([\s\S]*?)```/);
  const corpo = fence ? fence[1] : raw;

  const brutos: unknown[] = [];
  const inteiro = tentarJson(corpo);
  if (inteiro !== undefined) {
    if (Array.isArray(inteiro)) brutos.push(...inteiro);
    else if (inteiro && typeof inteiro === 'object' && Array.isArray((inteiro as Record<string, unknown>).lancamentos))
      // Cada item interno deve carregar seu próprio financeiro:true — o campo do wrapper externo é ignorado.
      brutos.push(...((inteiro as Record<string, unknown>).lancamentos as unknown[]));
    else brutos.push(inteiro);
  } else {
    for (const bloco of splitObjetosJson(corpo)) {
      const o = tentarJson(bloco);
      if (o !== undefined) brutos.push(o);
    }
  }

  return brutos
    .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null && !Array.isArray(b))
    .map(normalizarItem);
}

// Compatibilidade: primeiro lançamento ou null (usado por testes antigos / chamadas simples).
export function parseRespostaExtrator(raw: string): ExtracaoLancamento | null {
  return parseLancamentos(raw)[0] ?? null;
}

const REGRAS_COMUNS = (hoje: string) => `Devolva APENAS um bloco \`\`\`json\`\`\` contendo uma LISTA (array), com um objeto por evento financeiro distinto na mensagem (a pessoa pode citar vários numa frase só — ex.: recebimento E pagamento). Cada objeto tem:
{"financeiro": true/false, "intencao": "lancar"|"corrigir"|"apagar", "tipo": "despesa"|"entrada"|null,
 "valor": número ou null, "data": "YYYY-MM-DD" ou null, "contraparte": "quem (posto/fornecedor/cliente)" ou null,
 "categoria_slug": uma de [${CATEGORIA_SLUGS.join(', ')}] ou null, "pf_pj": "PF"|"PJ"|null,
 "obra_ref": "nome do cliente/obra citado" ou null, "descricao": "resumo curto" ou null,
 "material": "nome do material/produto comprado (DPS, cabo 6mm, disjuntor) ou null", "quantidade": número ou null, "unidade": "un"|"m"|"rolo"|... ou null,
 "tem_nota": true/false (só entradas; false quando a pessoa disser SEM NOTA / por fora / sem comprovante / não vou dar nota; senão true),
 "campos_faltando": ["valor", "pf_pj", ...]}
Sem nenhum evento de dinheiro → devolva [] (lista vazia).
` + `REGRAS (dinheiro em jogo — leia como contador):
- NUNCA invente valor. Não deu pra ler com certeza → valor null + "valor" em campos_faltando.
- Comprovante sem data legível → use a data de hoje: ${hoje}. "ontem"/"anteontem" → calcule a partir de hoje.
- pf_pj: PJ = gasto/receita da EMPRESA (obra, material, anúncio, kit, conta PJ). PF = pessoal
  (mercado da casa, lazer). Na DÚVIDA → null + "pf_pj" em campos_faltando. NÃO assuma.
- categoria_slug: escolha a MAIS parecida da lista; nada encaixa → "outros".
- material/quantidade/unidade: SÓ quando for COMPRA DE MATERIAL/produto (despesa). material = o item ("DPS", "cabo 6mm"); quantidade/unidade quando a pessoa disser ("100m de cabo" → quantidade 100, unidade "m"; "5 disjuntores" → 5, "un"). Não disse quantidade → quantidade null (conta como 1). Não é compra de material → os três null.
- "entrou"/"recebi"/"caiu"/"cliente pagou" → tipo "entrada". "gastei"/"paguei"/"comprei" e
  comprovante de compra/PIX enviado → tipo "despesa".
- intencao "corrigir": a pessoa quer ARRUMAR um lançamento já feito ("o do posto era 350").
  intencao "apagar": quer remover ("apaga o último gasto"). Senão → "lancar".
- financeiro false quando NÃO for assunto de dinheiro da empresa/pessoal: conta de luz de
  CLIENTE, foto de telhado/obra, documento de proposta, conversa comum. Na dúvida sobre ser
  financeiro → false (o fluxo normal trata).
- PERGUNTA/consulta sobre números ("quanto gastei esse mês?", "qual o imposto?", "como tá o caixa?") NÃO é lançamento → financeiro: false (a Eva responde no fluxo normal).
- tem_nota: padrão TRUE. Só marque FALSE numa ENTRADA quando a pessoa deixar claro que é "sem nota"/"por fora"/"sem comprovante"/"não vou dar nota". Despesa: ignore (deixe true).`;

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
Pergunta/consulta sobre números ("quanto gastei?") NÃO conta — responda NAO.

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
export async function extrairDeTexto(client: Anthropic, texto: string, hoje: string): Promise<ExtracaoLancamento[]> {
  const raw = await chamarComFallback(client, [{ role: 'user', content: montarPromptExtracaoTexto(texto, hoje) }], 1024);
  return parseLancamentos(raw);
}

// hoje = data em America/Sao_Paulo (BRT). NUNCA new Date().toISOString() direto — das 21h às 0h o servidor UTC já virou o dia.
export async function extrairDeImagem(client: Anthropic, base64: string, mediaType: string, hoje: string): Promise<ExtracaoLancamento[]> {
  const mt = (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType) ? mediaType : 'image/jpeg') as
    'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  const raw = await chamarComFallback(client, [{
    role: 'user',
    content: [
      { type: 'image', source: { type: 'base64', media_type: mt, data: base64 } },
      { type: 'text', text: montarPromptExtracaoMidia(hoje) },
    ],
  }], 1024);
  return parseLancamentos(raw);
}

// hoje = data em America/Sao_Paulo (BRT). NUNCA new Date().toISOString() direto — das 21h às 0h o servidor UTC já virou o dia.
export async function extrairDePdf(client: Anthropic, base64: string, hoje: string): Promise<ExtracaoLancamento[]> {
  const raw = await chamarComFallback(client, [{
    role: 'user',
    content: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
      { type: 'text', text: montarPromptExtracaoMidia(hoje) },
    ],
  }], 1024);
  return parseLancamentos(raw);
}
