// src/modules/closing/closing-command-parser.ts
// Reconhece comandos /procuracao, /contrato, /fechar (e variantes).
// Aceita com/sem barra, com/sem acento, maiusculo/minusculo.
// Ignora conectivos curtos ("da", "do", "de", "a", "o") apos o comando.

export type ClosingCommand = 'procuracao' | 'contrato' | 'fechar';

export interface ParsedClosingCommand {
  command: ClosingCommand;
  name: string; // pode ser '' quando comando vem sozinho
}

// Normaliza string removendo acentos pra match
function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

const CONECTIVOS = new Set(['da', 'do', 'de', 'a', 'o']);

export function parseClosingCommand(input: string): ParsedClosingCommand | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Quebra "comando [resto]"
  const m = trimmed.match(/^(\/?)(\S+)(.*)$/);
  if (!m) return null;
  const head = normalize(m[2]);
  const tail = m[3].trim();

  let command: ClosingCommand;
  if (head === 'procuracao') command = 'procuracao';
  else if (head === 'contrato') command = 'contrato';
  else if (head === 'fechar') command = 'fechar';
  else return null;

  // Remove conectivo curto inicial do tail ("da Fernanda" -> "Fernanda")
  if (tail) {
    const tokens = tail.split(/\s+/);
    while (tokens.length > 0 && CONECTIVOS.has(normalize(tokens[0]))) {
      tokens.shift();
    }
    return { command, name: tokens.join(' ') };
  }
  return { command, name: '' };
}
