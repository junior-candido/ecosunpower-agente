# Imagem oficial Puppeteer ja vem com Node + Chromium + todas libs Linux
# pre-instaladas e configuradas. Resolve "libglib-2.0.so.0 missing" sem
# precisar gerenciar deps Chromium na mao.
# https://pptr.dev/guides/docker
# Cache bust: 2026-04-29-2008 (mude essa string pra forcar rebuild Docker)
FROM ghcr.io/puppeteer/puppeteer:24

# Chromium ja esta no PATH do container; pula download durante npm install.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome \
    NODE_ENV=production

# A imagem puppeteer roda como user 'pptruser' por seguranca.
# WORKDIR usa o home dele.
USER root
WORKDIR /app

# Copia package files e instala deps (sem baixar Chromium novamente).
COPY package*.json ./
RUN npm install && chown -R pptruser:pptruser /app

# Copia o resto do projeto.
COPY --chown=pptruser:pptruser . .

# Build TypeScript + copia prompts (mantém comportamento anterior).
RUN npm run build && cp -r src/prompts dist/prompts && chown -R pptruser:pptruser /app

# Volta pro user nao-root.
USER pptruser

EXPOSE 3000

CMD ["node", "dist/index.js"]
