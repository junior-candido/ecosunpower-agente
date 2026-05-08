// Script ad-hoc pra consertar UM video do bucket cases-videos que foi
// uploadado antes do fix faststart (commit ac8c330). Re-encoda com
// -movflags +faststart e re-uploada com o mesmo nome — JSON do site
// (src/content/cases/17-usina-ailson-fernandes-planaltina.json) fica intacto.
//
// Uso: npx tsx scripts/fix-ailson-video.ts
//
// Pre-requisito: .env do projeto deve ter SUPABASE_URL e SUPABASE_SERVICE_KEY.
// Sem essas duas, o script aborta antes de tocar em qualquer coisa.

import 'dotenv/config';
import { mkdtemp, writeFile, readFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import ffmpegStatic from 'ffmpeg-static';

const BUCKET = 'cases-videos';
const VIDEO_PATH = '17-usina-ailson-fernandes-planaltina/video.mp4';

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Faltam SUPABASE_URL ou SUPABASE_SERVICE_KEY no .env');
    process.exit(1);
  }
  if (!ffmpegStatic) {
    console.error('❌ ffmpeg-static nao encontrado. Roda: npm install');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const tempDir = await mkdtemp(join(tmpdir(), 'ailson-fix-'));
  const inputPath = join(tempDir, 'input.mp4');
  const outputPath = join(tempDir, 'output.mp4');

  try {
    // 1) Baixa o video atual
    console.log(`⬇️  Baixando ${BUCKET}/${VIDEO_PATH}...`);
    const { data: blob, error: dlErr } = await supabase.storage
      .from(BUCKET)
      .download(VIDEO_PATH);
    if (dlErr || !blob) throw new Error(`download falhou: ${dlErr?.message ?? 'blob vazio'}`);
    const inputBuf = Buffer.from(await blob.arrayBuffer());
    await writeFile(inputPath, inputBuf);
    console.log(`   ${inputBuf.byteLength.toLocaleString()} bytes baixados`);

    // 2) Remux com faststart (sem re-encode — rapido, alguns segundos)
    console.log('🎞️  Rodando ffmpeg -c copy -movflags +faststart...');
    const ffmpegOk = await new Promise<boolean>((resolve) => {
      const args = ['-y', '-i', inputPath, '-c', 'copy', '-movflags', '+faststart', outputPath];
      const stderr: string[] = [];
      const p = spawn(ffmpegStatic as string, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      p.stderr.on('data', (chunk) => stderr.push(chunk.toString()));
      p.on('error', (err) => {
        console.error('   ffmpeg error:', err.message);
        resolve(false);
      });
      p.on('close', (code) => {
        if (code !== 0) {
          console.error(`   ffmpeg exit ${code}. stderr (ultimas 500 chars):\n${stderr.join('').slice(-500)}`);
        }
        resolve(code === 0);
      });
    });
    if (!ffmpegOk) {
      throw new Error('ffmpeg remux falhou — abortando antes de tocar no Supabase');
    }

    const outputBuf = await readFile(outputPath);
    console.log(`   ${outputBuf.byteLength.toLocaleString()} bytes apos remux`);

    // 3) Sanity check: confirma que moov esta proximo do inicio (faststart aplicado)
    // Procura "moov" nos primeiros 1MB. Se nao achar, formato esta estranho.
    const head = outputBuf.subarray(0, Math.min(1024 * 1024, outputBuf.byteLength));
    const moovIdx = head.indexOf(Buffer.from('moov'));
    if (moovIdx < 0) {
      console.warn('⚠️  moov atom nao encontrado no primeiro MB do video remuxado. Pode nao tocar mesmo assim.');
      console.warn('    Revisar manualmente antes de continuar. Abortando upload.');
      process.exit(2);
    }
    console.log(`✅ moov encontrado em offset ${moovIdx} (${(moovIdx / 1024).toFixed(1)} KB) — faststart OK`);

    // 4) Re-uploada substituindo o original (upsert: true)
    console.log(`⬆️  Re-uploadando como ${BUCKET}/${VIDEO_PATH} (upsert)...`);
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(VIDEO_PATH, outputBuf, {
        contentType: 'video/mp4',
        upsert: true,
        cacheControl: '3600',
      });
    if (upErr) throw new Error(`upload falhou: ${upErr.message}`);

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(VIDEO_PATH);
    console.log('🎉 Pronto. URL publica:');
    console.log(`   ${pub.publicUrl}`);
    console.log('');
    console.log('Testa no desktop:');
    console.log('   1) Abre essa URL no Chrome desktop em aba anonima (pra evitar cache)');
    console.log('   2) Ou hard-refresh em https://ecosunpower.eng.br/portfolio/usina-ailson-fernandes-planaltina');
    console.log('');
    console.log('Cloudflare Pages pode estar cacheando — pode levar alguns minutos pra propagar.');
  } finally {
    // Cleanup tmp
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
    await rmdir(tempDir).catch(() => {});
  }
}

main().catch((err) => {
  console.error('❌ Erro:', (err as Error).message);
  process.exit(1);
});
