// Audio transcription using OpenAI Whisper API

export class Transcriber {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async transcribeFromBase64(base64: string, mimetype: string): Promise<string | null> {
    try {
      const audioBuffer = Buffer.from(base64, 'base64');

      // Check size (max 25MB for Whisper)
      if (audioBuffer.byteLength > 25 * 1024 * 1024) {
        console.warn('[transcriber] Audio too large (>25MB)');
        return null;
      }

      const extension = mimetype.includes('ogg') ? 'ogg' :
                         mimetype.includes('mp4') ? 'mp4' :
                         mimetype.includes('mpeg') ? 'mp3' :
                         mimetype.includes('webm') ? 'webm' :
                         mimetype.includes('wav') ? 'wav' : 'ogg';

      const audioBlob = new Blob([audioBuffer], { type: mimetype });

      const formData = new FormData();
      formData.append('file', audioBlob, `audio.${extension}`);
      formData.append('model', 'whisper-1');
      formData.append('language', 'pt');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`[transcriber] Whisper API error: ${response.status} ${error}`);
        return null;
      }

      const result = await response.json() as { text: string };
      console.log(`[transcriber] Transcribed: "${result.text.substring(0, 80)}..."`);
      return result.text;
    } catch (error) {
      console.error('[transcriber] Error:', error);
      return null;
    }
  }
}
