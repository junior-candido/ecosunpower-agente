// Image analysis using Claude Vision API
import Anthropic from '@anthropic-ai/sdk';

export class VisionAnalyzer {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async analyzeImage(imageUrl: string, context: string): Promise<string> {
    try {
      // Download image
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        return 'Nao consegui baixar a imagem. Pode enviar novamente?';
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      const base64 = Buffer.from(imageBuffer).toString('base64');

      // Detect media type
      const contentType = imageResponse.headers.get('content-type') ?? 'image/jpeg';
      const mediaType = contentType.includes('png') ? 'image/png' :
                        contentType.includes('webp') ? 'image/webp' :
                        contentType.includes('gif') ? 'image/gif' : 'image/jpeg';

      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                  data: base64,
                },
              },
              {
                type: 'text',
                text: `Voce e a Eva, consultora de energia solar da Ecosunpower.
O cliente enviou esta imagem. Analise:

Se for uma CONTA DE LUZ:
- Identifique a distribuidora (CEB/Neoenergia, Equatorial/CELG/Enel Goias)
- Extraia: consumo em kWh, valor em R$, grupo (A ou B), demanda contratada se houver
- Se a imagem estiver ruim, peca outra foto
- Confirme os dados com o cliente antes de prosseguir
- Responda incluindo um JSON com os dados extraidos:
\`\`\`json
{"action":"update_lead","data":{"energy_data":{"monthly_bill":VALOR,"consumption_kwh":CONSUMO,"group":"B","tariff_type":"convencional"}}}
\`\`\`

Se for FOTO DO TELHADO ou LOCAL:
- Comente o tipo de telhado (ceramico, metalico, laje)
- Observe orientacao se possivel
- Comente se parece adequado para instalacao

Se for OUTRA IMAGEM:
- Responda naturalmente ao contexto

Contexto da conversa: ${context}

Responda de forma curta e natural, como a Eva faria no WhatsApp.`,
              },
            ],
          },
        ],
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('');

      return text;
    } catch (error) {
      console.error('[vision] Error analyzing image:', error);
      return 'A foto ficou um pouco dificil de ler. Consegue tirar outra mais nitida? 📸';
    }
  }
}
