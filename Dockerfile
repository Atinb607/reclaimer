# ─── Build Stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS base

RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy package files
COPY package*.json ./

# ─── Development Dependencies ─────────────────────────────────────────────────
FROM base AS dev-deps
RUN npm ci

# ─── Production Dependencies ──────────────────────────────────────────────────
FROM base AS prod-deps
RUN npm ci --omit=dev

# ─── Production Image ─────────────────────────────────────────────────────────
FROM node:20-alpine AS production

RUN apk add --no-cache dumb-init

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeapp -u 1001 -G nodejs

# Copy production deps
COPY --from=prod-deps --chown=nodeapp:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodeapp:nodejs src/ ./src/
COPY --chown=nodeapp:nodejs package*.json ./

# Create logs directory
RUN mkdir -p logs && chown nodeapp:nodejs logs

USER nodeapp

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

EXPOSE 3000

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
