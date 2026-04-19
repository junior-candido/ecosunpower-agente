// Image analysis using Claude Vision API
import Anthropic from '@anthropic-ai/sdk';

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

      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: base64 },
              },
              {
                type: 'text',
                text: `Voce e a Eva, consultora de energia solar da Ecosunpower.
O cliente enviou esta imagem. Analise de forma curta e direta:

Se for uma CONTA DE LUZ:
- Identifique a distribuidora (Neoenergia/CEB, Equatorial/CELG/Enel Goias)
- Extraia: consumo em kWh, valor em R$, grupo (A ou B), demanda contratada
- Confirme os dados com o cliente
- Inclua JSON: \`\`\`json\n{"action":"update_lead","data":{"energy_data":{"monthly_bill":VALOR,"consumption_kwh":CONSUMO,"group":"B"}}}\n\`\`\`

Se for FOTO DO TELHADO/LOCAL: comente tipo de telhado e adequacao
Se for OUTRA IMAGEM: responda naturalmente

Contexto: ${context}
Responda CURTO, maximo 2 paragrafos, como no WhatsApp.`,
              },
            ],
          },
        ],
      });

      return response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('');
    } catch (error) {
      console.error('[vision] Error:', error);
      return 'A foto ficou um pouco dificil de ler. Consegue tirar outra mais nitida? 📸';
    }
  }
}
