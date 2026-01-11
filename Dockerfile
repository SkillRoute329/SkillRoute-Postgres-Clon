# Build Stage
FROM node:20-slim AS builder
WORKDIR /app

# Copy all files
COPY . .

# Build Frontend
WORKDIR /app/frontend
RUN npm install
RUN npm run build

# Build Backend
WORKDIR /app/backend
RUN npm install
RUN npx prisma generate
RUN npm run build

# Final Stage
FROM node:20-slim
WORKDIR /app

# Install openssl for Prisma
RUN apt-get update && apt-get install -y openssl --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Copy built files
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/backend/package.json ./backend/package.json
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY --from=builder /app/frontend/dist ./frontend/dist
COPY --from=builder /app/migration.sql ./migration.sql

# Environment
ENV NODE_ENV=production
ENV PORT=3000
ENV CACHE_BUST=v11.0-FORCE-DEPLOY

EXPOSE 3000

# Start
WORKDIR /app/backend
CMD ["node", "dist/index.js"]
