# ─── Root Dockerfile ──────────────────────────────────────────────────────────
# Copies backend source from the college submission folder structure
# Folder: Reclaimer(2210990195,2210990991,2210990265)/source code/backend

FROM node:20-alpine AS base
RUN apk add --no-cache dumb-init
WORKDIR /app

# Copy package files from nested backend folder
COPY ["Reclaimer(2210990195,2210990991,2210990265)/source code/backend/package*.json", "./"]

# Install production dependencies
RUN npm ci --omit=dev

# Copy application source
COPY ["Reclaimer(2210990195,2210990991,2210990265)/source code/backend/src/", "./src/"]

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeapp -u 1001 -G nodejs && \
    mkdir -p logs && \
    chown -R nodeapp:nodejs /app

USER nodeapp

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:10000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

EXPOSE 10000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]