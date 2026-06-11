// Image analysis using Claude Vision API
import Anthropic from '@anthropic-ai/sdk';
import { empresa } from './empresa-config.js';

// Defesa em profundidade: o caminho de imagem mandava o LAUDO interno pro
// cliente ("# Análise da Imagem", "Ação necessária:", "Resposta para o
// cliente:"). Mesmo com o prompt corrigido, se o modelo escorregar isso
// extrai só a mensagem natural. Preserva o bloco ```json``` (parseAction usa).
export function stripVisionScaffolding(text: string): string {
  if (!text) return '';
  let t = text;

  // Se o modelo separou "Resposta para o cliente:" — usa SÓ o que vem depois.
  const resp = t.match(/\*{0,2}\s*resposta\s+(?:para|ao)\s+o?\s*cliente\s*:?\*{0,2}[ \t]*\n?/i);
  if (resp && resp.index !== undefined) {
    t = t.slice(resp.index + resp[0].length);
  }

  // Título de laudo (linha inteira sai — é só cabeçalho).
  const headerRe = /^#{1,6}\s*(an[áa]lise|diagn[óo]stico|observa|a[çc][ãa]o)\b/i;
  // Rótulo PURAMENTE interno: o que vem depois tambem e interno → linha sai.
  const internalRe = /^\*{0,2}\s*(a[çc][ãa]o necess[áa]ria|nota interna|observa[çc][ãa]o interna|an[áa]lise interna|diagn[óo]stico interno)\s*:\*{0,2}/i;
  // Rótulo AMBÍGUO (pode ser msg legítima): tira só o prefixo, mantém o resto.
  const ambiguousRe = /^(\*{0,2}\s*(?:an[áa]lise|a[çc][ãa]o|observa[çc][ãa]o|diagn[óo]stico)\s*:\*{0,2}\s*)/i;

  const out: string[] = [];
  for (const raw of t.split('\n')) {
    const bare = raw.trim();
    if (headerRe.test(bare)) continue;
    if (internalRe.test(bare)) continue;
    const m = bare.match(ambiguousRe);
    if (m) {
      const rest = bare.slice(m[0].length).trim();
      if (rest) out.push(rest); // mantém só o conteúdo após o rótulo
      continue;
    }
    out.push(raw);
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export class VisionAnalyzer {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async analyzeImage(imageDataUrl: string, context: string): Promise<string> {
    try {
      // Parse data URL: data:image/jpeg;base64,xxxxx
      let base64: string;
      let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

      if (imageDataUrl.startsWith('data:')) {
        const match = imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
        if (!match) return 'Nao consegui processar a imagem. Pode enviar novamente? 📸';
        mediaType = match[1] as typeof mediaType;
        base64 = match[2];
      } else {
        // Fallback: download from URL
        const imageResponse = await fetch(imageDataUrl);
        if (!imageResponse.ok) return 'Nao consegui baixar a imagem. Pode enviar novamente?';
        const buffer = await imageResponse.arrayBuffer();
        base64 = Buffer.from(buffer).toString('base64');
        const ct = imageResponse.headers.get('content-type') ?? 'image/jpeg';
        mediaType = ct.includes('png') ? 'image/png' :
                    ct.includes('webp') ? 'image/webp' : 'image/jpeg';
      }

      // Normalize media type
      if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) {
        mediaType = 'image/jpeg';
      }

      const messages: Anthropic.Messages.MessageParam[] = [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: base64 },
              },
              {
                type: 'text',
                text: `Você é a ${empresa().nomeAtendente}, consultora de energia solar da ${empresa().nomeFantasia}, conversando com a pessoa no WhatsApp. Ela acabou de te enviar esta imagem.

Sua tarefa: responder a pessoa de forma natural, curta e humana — do jeito que a ${empresa().nomeAtendente} fala no zap. ESCREVA SÓ A MENSAGEM QUE VAI DIRETO PRA PESSOA. NUNCA escreva laudo, título, "# Análise da Imagem", "Análise:", "Ação necessária:", "Resposta para o cliente:" nem nenhum texto ou raciocínio interno.

Conforme a imagem:
- CONTA DE LUZ: leia a distribuidora (Neoenergia-DF / Equatorial-GO), o consumo em kWh REAL impresso, o valor em R$, o grupo. CONFIRA A COERÊNCIA antes: a tarifa é ~R$1,00/kWh, então o R$ deve ser próximo do kWh (conta de R$500 ≈ 450-500 kWh). Se o que você leu NÃO bater (ex: 85 kWh numa conta de R$490), você leu errado — NÃO invente: peça pra pessoa confirmar o consumo em kWh e NÃO anexe o json. Se bater, confirme natural ("vi aqui que sua conta tá vindo uns R$X, ~Y kWh/mês, confere?") e SÓ NESSE CASO no FINAL anexe apenas: \`\`\`json\n{"action":"update_lead","data":{"energy_data":{"monthly_bill":VALOR,"consumption_kwh":CONSUMO,"group":"B"}}}\n\`\`\`
- TELHADO/LOCAL: comente leve a área/inclinação e puxe a conversa (sem json).
- OUTRA COISA (cartão de visita, material de fornecedor, print, foto pessoal): NÃO repita pedido de conta de luz de forma robótica. Responde curto e natural, reconhece o que é, e pergunta com leveza o que a pessoa precisa / se é energia solar pra ela mesma. Se parecer outro profissional/empresa do ramo oferecendo serviço ou parceria, seja acolhedora e diga que vai passar pro Junior — NÃO trate como cliente a qualificar (sem json).

Contexto da conversa: ${context}
Máximo 2 parágrafos curtos, tom de WhatsApp, no máximo 1-2 emojis. Só a mensagem pra pessoa (+ o bloco json no fim se for conta de luz).`,
              },
            ],
          },
      ];
      // Opus (modelo forte) pra ler conta sem erro grosseiro — dinheiro em jogo. Se
      // Opus estiver indisponivel (429/overloaded/5xx), cai pro Haiku: melhor ler com
      // modelo menor do que rejeitar uma conta legivel no momento de maior intencao.
      // A trava de coerencia (prompt + solar.ts) ainda protege contra leitura ruim.
      let response;
      try {
        response = await this.client.messages.create({ model: 'claude-opus-4-7', max_tokens: 1024, messages });
      } catch (apiErr) {
        console.warn('[vision] Opus indisponivel, fallback Haiku:', (apiErr as Error).message);
        response = await this.client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, messages });
      }

      const raw = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('');
      // Defesa em profundidade: nunca deixa scaffolding interno vazar pro cliente.
      return stripVisionScaffolding(raw);
    } catch (error) {
      console.error('[vision] Error:', error);
      return 'A foto ficou um pouco dificil de ler. Consegue tirar outra mais nitida? 📸';
    }
  }
}
