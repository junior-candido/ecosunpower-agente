// Audio transcription using OpenAI Whisper API
import type { Config } from '../config.js';

export class Transcriber {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async transcribe(audioUrl: string): Promise<string | null> {
    try {
      // Download the audio file from Evolution API
      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        console.error(`[transcriber] Failed to download audio: ${audioResponse.status}`);
        return null;
      }

      const audioBuffer = await audioResponse.arrayBuffer();
      const audioBlob = new Blob([audioBuffer], { type: 'audio/ogg' });

      // Check size (max 25MB for Whisper)
      if (audioBuffer.byteLength > 25 * 1024 * 1024) {
        return null; // Too large
      }

      // Send to OpenAI Whisper API
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.ogg');
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
      console.log(`[transcriber] Transcribed: "${result.text.substring(0, 50)}..."`);
      return result.text;
    } catch (error) {
      console.error('[transcriber] Error:', error);
      return null;
    }
  }
}
