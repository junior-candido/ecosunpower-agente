import { describe, it, expect } from 'vitest';
import { renderCerebroPage } from '../src/modules/dashboard/cerebro-views.js';

const snap: any = { comercial:{leads:42,negociacao:8,ganhos:5,propostas:12}, atendimento:{conversas:15}, marketing:{emailsEnviados:3,emailsAbertos:1,leadsQuentes:0}, operacao:{usinas:30}, relacionamento:{clientes:24,manutencoes:2}, financeiro:{vendas:5}, elo:{totalEventos:120} };

describe('renderCerebroPage', () => {
  it('e um documento full-screen com os numeros reais embutidos', () => {
    const html = renderCerebroPage(snap, ['Oi, eu sou o Elo.']);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('42');            // Comercial leads
    expect(html).toContain('30');            // usinas
    expect(html).toContain('Pergunte ao Elo'); // caixa de pergunta
    expect(html).toContain('/dashboard/cerebro/perguntar'); // o endpoint do fetch
  });

  it('embute o snapshot pro JS client-side usar nos cliques', () => {
    const html = renderCerebroPage(snap, ['oi']);
    expect(html).toMatch(/SNAP\s*=/); // snapshot embutido em <script>
  });

  it('tem voz: microfone (entrada) e sintese de fala (saida), com feature-detect', () => {
    const html = renderCerebroPage(snap, ['oi']);
    expect(html).toMatch(/SpeechRecognition|webkitSpeechRecognition/);
    expect(html).toContain('speechSynthesis');
    expect(html).toContain('id="micBtn"'); // botao do microfone
    expect(html).toContain('id="voiceToggle"'); // liga/desliga a voz do Elo
  });

  it('e responsivo: viewport meta e media query pra celular (painel vira bottom-sheet)', () => {
    const html = renderCerebroPage(snap, ['oi']);
    expect(html).toContain('name="viewport"');
    expect(html).toContain('width=device-width');
    expect(html).toMatch(/@media \(max-width:\s*640px\)/);
  });

  it('layout em zonas: coluna flex (topbar/cerebro/fala/pergunta nunca sobrepostos)', () => {
    const html = renderCerebroPage(snap, ['oi']);
    expect(html).toMatch(/#wrap\s*\{[^}]*flex-direction:\s*column/);
    // o canvas mede a ZONA do meio (#canvasWrap), nao a janela inteira
    expect(html).toMatch(/canvasWrap\.clientWidth/);
    expect(html).toMatch(/canvasWrap\.clientHeight/);
  });
});
