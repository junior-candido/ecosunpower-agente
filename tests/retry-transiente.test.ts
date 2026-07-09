// Testa o util genérico de retry pra erros PASSAGEIROS (transitórios).
// Motivação: um 502 momentâneo do servidor do fabricante (ex: NEP) não pode
// derrubar a integração inteira até o próximo ciclo do cron. O util repete a
// operação algumas vezes, com espera crescente, ENQUANTO o resultado for
// classificado como transitório — e para assim que estabiliza ou esgota.
//
// `sleep` é injetável pra o teste não esperar de verdade.

import { describe, it, expect, vi } from 'vitest';
import { retryTransient } from '../src/modules/monitoring/util/retry.js';

const noSleep = () => Promise.resolve();

describe('retryTransient', () => {
  it('retorna no primeiro sucesso, sem repetir', async () => {
    let chamadas = 0;
    const r = await retryTransient(
      async () => { chamadas++; return { ok: true as const, valor: 42 }; },
      (res) => res.ok === false,
      { retries: 2, sleep: noSleep },
    );
    expect(r).toEqual({ ok: true, valor: 42 });
    expect(chamadas).toBe(1);
  });

  it('repete enquanto o resultado é transitório e devolve o primeiro estável', async () => {
    let chamadas = 0;
    const r = await retryTransient(
      async () => {
        chamadas++;
        // 2 primeiras dão erro transitório (502), a 3ª estabiliza
        return chamadas < 3
          ? { ok: false as const, status: 502 }
          : { ok: true as const, status: 200 };
      },
      (res) => res.ok === false && res.status === 502,
      { retries: 3, sleep: noSleep },
    );
    expect(r).toEqual({ ok: true, status: 200 });
    expect(chamadas).toBe(3);
  });

  it('para no limite de re-tentativas e devolve o último resultado transitório', async () => {
    let chamadas = 0;
    const r = await retryTransient(
      async () => { chamadas++; return { ok: false as const, status: 502 }; },
      (res) => res.status === 502,
      { retries: 2, sleep: noSleep },
    );
    // 1 execução inicial + 2 re-tentativas = 3
    expect(chamadas).toBe(3);
    expect(r).toEqual({ ok: false, status: 502 });
  });

  it('NÃO repete quando o resultado não é transitório (ex: 401 credencial)', async () => {
    let chamadas = 0;
    const r = await retryTransient(
      async () => { chamadas++; return { ok: false as const, status: 401 }; },
      (res) => res.status === 502, // 401 não é transitório
      { retries: 3, sleep: noSleep },
    );
    expect(chamadas).toBe(1);
    expect(r).toEqual({ ok: false, status: 401 });
  });

  it('espera o backoff entre as tentativas (sleep chamado com atrasos crescentes)', async () => {
    const atrasos: number[] = [];
    const sleepSpy = vi.fn((ms: number) => { atrasos.push(ms); return Promise.resolve(); });
    let chamadas = 0;
    await retryTransient(
      async () => { chamadas++; return { ok: false as const, status: 502 }; },
      (res) => res.status === 502,
      { retries: 2, delayMs: (tentativa) => 500 * 2 ** tentativa, sleep: sleepSpy },
    );
    // 2 re-tentativas → 2 esperas, crescentes
    expect(atrasos).toEqual([500, 1000]);
    expect(sleepSpy).toHaveBeenCalledTimes(2);
  });
});
