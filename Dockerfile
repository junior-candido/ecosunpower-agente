FROM node:20-slim

# Bibliotecas do Chromium pra Puppeteer rodar (geracao de PDF das propostas).
# node:20-slim eh Debian slim, vem sem GUI libs. Sem isso o Chromium falha com
# "libglib-2.0.so.0: cannot open shared object file" ao iniciar.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation fonts-noto fonts-noto-color-emoji \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 \
    libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libglib2.0-0 \
    libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 \
    libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
    libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \
    lsb-release wget xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build
RUN cp -r src/prompts dist/prompts

EXPOSE 3000

CMD ["node", "dist/index.js"]
