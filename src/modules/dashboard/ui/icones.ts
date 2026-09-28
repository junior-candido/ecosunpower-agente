// src/modules/dashboard/ui/icones.ts
// Ícones do Command Center (traço estilo Lucide), copiados do protótipo aprovado
// (Desktop/PROTOTIPO-Command-Center/_fonte/build.py). Um sprite SVG entra 1x no
// layout; cada ícone é um <use href="#cc-i-NOME">.

export const ICONES = {
  "gauge": "<path d=\"M12 14l4-4\"/><path d=\"M3.3 17a9 9 0 1 1 17.4 0\"/><path d=\"M12 14h.01\"/>",
  "users": "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.9\"/><path d=\"M16 3.1a4 4 0 0 1 0 7.8\"/>",
  "mega": "<path d=\"M3 11l18-5v12L3 14v-3z\"/><path d=\"M11.6 16.8a3 3 0 1 1-5.8-1.6\"/>",
  "sun": "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4\"/>",
  "panel": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"12\" rx=\"1\"/><path d=\"M3 10h18M9 4v12M15 4v12M12 16v4M8 20h8\"/>",
  "hammer": "<path d=\"M15 12l-8.4 8.4a2.1 2.1 0 0 1-3-3L12 9\"/><path d=\"M17.6 15L22 10.6\"/><path d=\"M20.9 11.7l-1.3-1.3a2 2 0 0 1-.6-1.4V7.9l-2.3-2.3a6 6 0 0 0-4.2-1.7H9.4l.9.8a6.2 6.2 0 0 1 2 4.5v1.6l2 2h1.2a2 2 0 0 1 1.4.6l1.3 1.3\"/>",
  "wrench": "<path d=\"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.8 3.8z\"/>",
  "wallet": "<path d=\"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1\"/><path d=\"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4\"/>",
  "contact": "<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21a8 8 0 0 1 16 0\"/>",
  "file": "<path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\"/><path d=\"M14 2v6h6M8 13h8M8 17h5\"/>",
  "spark": "<path d=\"M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z\"/><path d=\"M19 3v4M21 5h-4\"/>",
  "cog": "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z\"/>",
  "tv": "<rect x=\"2\" y=\"7\" width=\"20\" height=\"13\" rx=\"2\"/><path d=\"M17 2l-5 5-5-5\"/>",
  "bell": "<path d=\"M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9\"/><path d=\"M10.3 21a1.9 1.9 0 0 0 3.4 0\"/>",
  "search": "<circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"M21 21l-4.3-4.3\"/>",
  "down": "<path d=\"M6 9l6 6 6-6\"/>",
  "right": "<path d=\"M5 12h14M13 6l6 6-6 6\"/>",
  "chev": "<path d=\"M9 18l6-6-6-6\"/>",
  "zap": "<path d=\"M13 2L3 14h9l-1 8 10-12h-9l1-8z\"/>",
  "cal": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M16 2v4M8 2v4M3 10h18\"/>",
  "wa": "<path d=\"M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5z\"/>",
  "phone": "<path d=\"M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z\"/>",
  "mail": "<rect x=\"2\" y=\"4\" width=\"20\" height=\"16\" rx=\"2\"/><path d=\"M22 7l-10 6L2 7\"/>",
  "send": "<path d=\"M22 2L11 13\"/><path d=\"M22 2l-7 20-4-9-9-4 20-7z\"/>",
  "check": "<path d=\"M20 6L9 17l-5-5\"/>",
  "clock": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/>",
  "alert": "<path d=\"M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z\"/><path d=\"M12 9v4M12 17h.01\"/>",
  "wifi-off": "<path d=\"M2 2l20 20\"/><path d=\"M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.3-1.6M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8A15 15 0 0 0 10.7 5M12 20h.01\"/>",
  "download": "<path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3\"/>",
  "plus": "<path d=\"M12 5v14M5 12h14\"/>",
  "filter": "<path d=\"M22 3H2l8 9.5V19l4 2v-8.5z\"/>",
  "folder": "<path d=\"M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z\"/>",
  "shield": "<path d=\"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z\"/>",
  "leaf": "<path d=\"M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z\"/><path d=\"M2 21c0-3 1.9-5.4 5.1-6\"/>",
  "map": "<path d=\"M9 3L3 6v15l6-3 6 3 6-3V3l-6 3-6-3z\"/><path d=\"M9 3v15M15 6v15\"/>",
  "thermo": "<path d=\"M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z\"/>",
  "doc-check": "<path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\"/><path d=\"M14 2v6h6M9 15l2 2 4-4\"/>",
  "box": "<path d=\"M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z\"/><path d=\"M3.3 7L12 12l8.7-5M12 22V12\"/>",
  "truck": "<path d=\"M1 3h15v13H1zM16 8h4l3 3v5h-7z\"/><circle cx=\"5.5\" cy=\"18.5\" r=\"2.5\"/><circle cx=\"18.5\" cy=\"18.5\" r=\"2.5\"/>",
  "grid": "<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/>",
  "menu": "<path d=\"M3 6h18M3 12h18M3 18h18\"/>",
  "plug": "<path d=\"M12 22v-5M9 8V2M15 8V2M18 8v4a6 6 0 0 1-12 0V8z\"/>",
  "lock": "<rect x=\"3\" y=\"11\" width=\"18\" height=\"11\" rx=\"2\"/><path d=\"M7 11V7a5 5 0 0 1 10 0v4\"/>",
  "ext": "<path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3\"/>",
  "trend": "<path d=\"M22 7l-8.5 8.5-5-5L2 17\"/><path d=\"M16 7h6v6\"/>",
  "receipt": "<path d=\"M4 2v20l3-2 3 2 3-2 3 2 3-2 1 .7V2l-1 .7-3-2-3 2-3-2-3 2-3-2z\"/><path d=\"M8 7h8M8 11h8M8 15h5\"/>",
  "star": "<path d=\"M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z\"/>",
  "eye": "<path d=\"M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>",
} as const;

export type NomeIcone = keyof typeof ICONES;

/** Sprite SVG com todos os ícones (vai 1x no <body> do layout). */
export const SPRITE_ICONES: string =
  '<svg width="0" height="0" style="position:absolute" aria-hidden="true">' +
  (Object.keys(ICONES) as NomeIcone[]).map((k) => '<symbol id="cc-i-' + k + '" viewBox="0 0 24 24">' + ICONES[k] + '</symbol>').join('') +
  '</svg>';
