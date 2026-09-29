// src/modules/audio-ogg.ts
// W1 — gravação feita no navegador (Chrome grava WebM/Opus) → OGG/Opus, o
// formato da mensagem de voz do WhatsApp (a Meta NÃO aceita WebM). Usa o
// ffmpeg que já vem no projeto (ffmpeg-static). Só roda no servidor de verdade;
// nos testes a rota recebe um dublê.

import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { writeFile, readFile, rm, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);

const TEMPO_MAX_MS = 30_000;

export async function webmParaOgg(webm: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'audio-ogg-'));
  const entrada = join(dir, 'in.webm');
  const saida = join(dir, 'out.ogg');
  try {
    await writeFile(entrada, webm);
    await new Promise<void>((ok, erro) => {
      const cmd = ffmpeg(entrada)
        .noVideo()
        .audioCodec('libopus')
        .audioBitrate('32k')
        .audioChannels(1)
        .audioFrequency(48000)
        .format('ogg')
        .output(saida)
        .on('end', () => { clearTimeout(t); ok(); })
        .on('error', (e) => { clearTimeout(t); erro(e); });
      const t = setTimeout(() => { cmd.kill('SIGKILL'); erro(new Error('conversão de áudio demorou demais')); }, TEMPO_MAX_MS);
      cmd.run();
    });
    return await readFile(saida);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
