FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build
RUN cp -r src/prompts dist/prompts

EXPOSE 3000

CMD ["node", "dist/index.js"]
