FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
# npm ci ставит ровно те версии, что записаны в package-lock.json, и падает,
# если lock разошёлся с package.json. Сборка одинакова у всех и на сервере.
RUN npm ci --omit=dev --no-audit --no-fund

COPY src ./src
COPY migrations ./migrations

EXPOSE 3000
CMD ["node", "src/index.js"]
