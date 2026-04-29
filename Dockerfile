# Imagem oficial Puppeteer ja vem com Node + Chromium + todas libs Linux
# pre-instaladas e configuradas. Resolve "libglib-2.0.so.0 missing" sem
# precisar gerenciar deps Chromium na mao.
# https://pptr.dev/guides/docker
# Cache bust: 2026-04-29-2008 (mude essa string pra forcar rebuild Docker)
FROM ghcr.io/puppeteer/puppeteer:24

# A imagem oficial puppeteer ja tras o Chromium em ~pptruser/.cache/puppeteer.
# Puppeteer detecta automaticamente — NAO setar PUPPETEER_EXECUTABLE_PATH
# (caminho varia entre versoes da imagem).
# NAO setar NODE_ENV=production AINDA — npm pularia devDependencies (typescript, @types/*)
# que sao necessarias pro build TypeScript funcionar.

# A imagem puppeteer roda como user 'pptruser' por seguranca.
USER root
WORKDIR /app

# Copia package files e instala TODAS deps (incluindo dev pra ter tsc + @types).
COPY package*.json ./
RUN npm install --include=dev && chown -R pptruser:pptruser /app

# Copia o resto do projeto.
COPY --chown=pptruser:pptruser . .

# Build TypeScript + copia prompts.
RUN npm run build && cp -r src/prompts dist/prompts && chown -R pptruser:pptruser /app

# AGORA sim, setar NODE_ENV=production pro runtime. Build ja foi feito,
# devDependencies nao sao mais necessarias em runtime.
ENV NODE_ENV=production

# Volta pro user nao-root.
USER pptruser

EXPOSE 3000

CMD ["node", "dist/index.js"]
