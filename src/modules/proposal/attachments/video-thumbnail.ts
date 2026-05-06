// Extrai primeiro frame e duracao de video MP4 usando fluent-ffmpeg + ffmpeg-static.

import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { writeFile, readFile, unlink, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
}

export async function extractFirstFrame(videoBuffer: Buffer): Promise<{ thumbnailBuffer: Buffer }> {
  const dir = await mkdtemp(join(tmpdir(), 'video-thumb-'));
  const inPath = join(dir, 'in.mp4');
  const outPath = join(dir, 'thumb.jpg');

  await writeFile(inPath, videoBuffer);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inPath)
      .outputOptions(['-vframes 1', '-q:v 2'])
      .output(outPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });

  const thumbnailBuffer = await readFile(outPath);

  await unlink(inPath).catch(() => {});
  await unlink(outPath).catch(() => {});

  return { thumbnailBuffer };
}

export async function getVideoDuration(videoBuffer: Buffer): Promise<number> {
  const dir = await mkdtemp(join(tmpdir(), 'video-dur-'));
  const inPath = join(dir, 'in.mp4');
  await writeFile(inPath, videoBuffer);

  const seconds = await new Promise<number>((resolve, reject) => {
    ffmpeg.ffprobe(inPath, (err, metadata) => {
      if (err) return reject(err);
      const dur = metadata.format.duration;
      if (typeof dur !== 'number') return reject(new Error('Duracao nao encontrada'));
      resolve(dur);
    });
  });

  await unlink(inPath).catch(() => {});
  return seconds;
}
