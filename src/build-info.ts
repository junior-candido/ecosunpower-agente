// Carimbo de build — confirma via /health que o Easypanel reconstruiu o codigo
// novo (e nao esta servindo um container velho).
//
// EM PRODUCAO este valor e SOBRESCRITO AUTOMATICAMENTE no `docker build`
// (veja o passo "Carimbo de build automatico" no Dockerfile): a cada deploy
// com codigo novo, o campo "build" do /health passa a mostrar a data/hora real
// do build, no formato `build-AAAAMMDD-HHMMSSZ` (UTC). Ninguem precisa editar
// nada na mao.
//
// Como verificar de fora se prod pegou o codigo:
//   curl https://propostas.ecosunpower.eng.br/health  -> campo "build"
// Se a data/hora for recente (logo apos voce clicar Implantar), o deploy pegou.
// Se continuar antiga, o Easypanel NAO reconstruiu (deploy nao disparado ou
// cache de camada Docker).
//
// O valor abaixo so aparece em ambiente local/dev (onde o Dockerfile nao roda).
export const BUILD_VERSION = 'dev-local';
