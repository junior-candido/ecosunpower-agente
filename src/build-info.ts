// Marcador de build — BUMP a cada deploy pra confirmar via /health que o
// Easypanel reconstruiu o codigo novo (e nao esta servindo container velho).
//
// Como verificar de fora se prod pegou o codigo:
//   curl https://propostas.ecosunpower.eng.br/health  -> campo "build"
// Se o "build" bater com este valor, o deploy pegou. Se mostrar valor antigo,
// o Easypanel NAO reconstruiu (cache de camada Docker ou deploy nao disparado).
export const BUILD_VERSION = 'IMPOSTO-MENU-FIX-2026-06-17b';
