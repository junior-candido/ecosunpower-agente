// tests/evolution-grupo.test.ts
//
// A assistente sempre foi CEGA pra grupo (mensagem de @g.us era descartada logo
// na entrada). Isso protegia contra ela se meter em conversa de grupo — e vai
// continuar protegendo.
//
// Mas o Junior quer que ela APRENDA do grupo onde a equipe conversa ("como uma
// estagiária eficiente... absorveria calada e quando fosse a vez dela falar
// mostraria o que aprendeu"). Pra isso ela precisa pelo menos ENXERGAR a
// mensagem. Quem decide o que fazer com ela é o webhook — e o padrão continua
// sendo ignorar.
//
// Detalhe que muda tudo em grupo: o `remoteJid` é o GRUPO, não a pessoa. Quem
// falou vem em `key.participant`. Sem isso não dá pra saber se quem pediu é da
// equipe.
import { describe, it, expect } from 'vitest';
import { EvolutionService } from '../src/modules/evolution.js';

const cliente = new EvolutionService({
  evolutionApiUrl: 'http://x', evolutionApiKey: 'k',
  evolutionInstance: 'i', webhookToken: 't',
} as never);

function payloadGrupo(texto: string) {
  return {
    data: {
      key: {
        remoteJid: '120363000000000000@g.us',
        participant: '5577981660268@s.whatsapp.net',
        id: 'MSG1', fromMe: false,
      },
      message: { conversation: texto },
      messageTimestamp: 1756742400,
      pushName: 'Lazaro',
    },
  };
}

describe('mensagem de grupo', () => {
  it('deixa de ser descartada e diz QUEM falou', () => {
    const p = cliente.parseWebhook(payloadGrupo('Clara, anota: garantia de 12 meses'));
    expect(p).not.toBeNull();
    expect(p!.deGrupo).toBe(true);
    expect(p!.grupoId).toBe('120363000000000000@g.us');
    expect(p!.from).toBe('5577981660268');          // a PESSOA, não o grupo
    expect(p!.content).toContain('garantia');
    expect(p!.pushName).toBe('Lazaro');
  });

  it('conversa normal (privado) não muda em nada', () => {
    const p = cliente.parseWebhook({
      data: {
        key: { remoteJid: '5561999998888@s.whatsapp.net', id: 'M2', fromMe: false },
        message: { conversation: 'oi, quero energia solar' },
        messageTimestamp: 1756742400,
      },
    });
    expect(p).not.toBeNull();
    expect(p!.deGrupo).toBeFalsy();
    expect(p!.grupoId).toBeUndefined();
    expect(p!.from).toBe('5561999998888');
  });

  it('grupo sem participante identificado é descartado — sem saber quem falou, não serve', () => {
    const sem = payloadGrupo('Clara, anota: teste');
    delete (sem.data.key as Record<string, unknown>).participant;
    expect(cliente.parseWebhook(sem)).toBeNull();
  });
});
