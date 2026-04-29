FROM node:20-alpine AS base
RUN apk add --no-cache dumb-init
WORKDIR /app
COPY Reclaimer-2210990195/source\ code/backend/package*.json ./
RUN npm ci --omit=dev
COPY Reclaimer-2210990195/source\ code/backend/src/ ./src/
RUN mkdir -p logs
EXPOSE 10000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]