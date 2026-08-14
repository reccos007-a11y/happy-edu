FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
# Крупные пакеты (@mdi/font ~50 МБ) на нестабильной сети рвутся с ECONNRESET.
# Повторные попытки и меньше параллельных сокетов делают установку устойчивой.
RUN npm config set fetch-retries 5 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 120000 \
 && npm config set fetch-timeout 600000 \
 && npm install --no-audit --no-fund --maxsockets 3

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
