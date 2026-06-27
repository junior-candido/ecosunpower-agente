# Imagem oficial Puppeteer ja vem com Node + Chromium + todas libs Linux
# pre-instaladas e configuradas. Resolve "libglib-2.0.so.0 missing" sem
# precisar gerenciar deps Chromium na mao.
# https://pptr.dev/guides/docker
# Cache bust: 2026-06-12-ecosof (mude essa string pra forcar rebuild Docker)
FROM ghcr.io/puppeteer/puppeteer:24

# A imagem oficial puppeteer ja tras UM Chromium em ~pptruser/.cache/puppeteer.
# MAS: 'ghcr.io/puppeteer/puppeteer:24' eh major-pinning (latest 24.x.y) e
# 'puppeteer ^24.42.0' tambem eh range. As duas podem RESOLVER pra versoes
# diferentes na hora do build, gerando erro:
#   "Could not find Chrome (ver. 147.0.7727.57). cache: /home/pptruser/.cache/puppeteer"
# Fix: APOS npm install, rodar 'puppeteer browsers install chrome' que detecta
# a versao do puppeteer no node_modules e baixa o Chrome correspondente.
# NAO setar PUPPETEER_EXECUTABLE_PATH — puppeteer detecta o cache automaticamente.

USER root
WORKDIR /app

# Garante ffmpeg disponivel pro fluent-ffmpeg (extracao de frame de video).
# A base puppeteer e Debian-based; instala se nao existir.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

# Copia package files e instala TODAS deps (incluindo dev pra ter tsc + @types).
COPY package*.json ./
# --legacy-peer-deps: openai@4 declara peerOptional zod@^3 (helpers zod, nao usados),
# conflita com zod@4 do projeto. npm strict falha; o peer eh OPCIONAL e nao usado.
RUN npm install --include=dev --legacy-peer-deps && chown -R pptruser:pptruser /app

# Garante que o Chrome compativel com a versao EXATA do puppeteer instalado
# esta presente no cache do pptruser. Sem isso, a imagem base pode trazer um
# Chrome de versao diferente do que o puppeteer recem-instalado pede.
# Roda como pptruser pra cache cair em /home/pptruser/.cache/puppeteer.
USER pptruser
RUN cd /app && npx puppeteer browsers install chrome
USER root

# Copia o resto do projeto.
COPY --chown=pptruser:pptruser . .

# Carimbo de build automatico: grava a data/hora real do build em build-info.ts,
# que o /health expoe no campo "build". Como este RUN vem DEPOIS do "COPY . ."
# (que invalida o cache de camada sempre que qualquer arquivo do repo muda), ele
# re-executa a cada deploy com codigo novo — entao o "build" do /health sempre
# reflete o ultimo deploy, sem ninguem precisar editar nada na mao.
RUN echo "export const BUILD_VERSION = 'build-$(date -u +%Y%m%d-%H%M%SZ)';" > src/build-info.ts \
  && cat src/build-info.ts

# Build TypeScript + copia prompts.
RUN npm run build && cp -r src/prompts dist/prompts && chown -R pptruser:pptruser /app

# AGORA sim, setar NODE_ENV=production pro runtime. Build ja foi feito,
# devDependencies nao sao mais necessarias em runtime.
ENV NODE_ENV=production

# Volta pro user nao-root.
USER pptruser

EXPOSE 3000

CMD ["node", "dist/index.js"]
