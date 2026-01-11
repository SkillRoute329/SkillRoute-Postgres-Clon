FROM node:20-bookworm-slim
WORKDIR /app

# Install system dependencies for Prisma and Puppeteer
RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    chromium \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY package.json ./
COPY migration.sql ./
COPY .dockerignore ./
COPY backend ./backend
COPY frontend ./frontend

# --- FRONTEND ---
WORKDIR /app/frontend
RUN npm install
RUN npm run build

# --- BACKEND ---
WORKDIR /app/backend
# Copy migration file from root
COPY migration.sql ./

# Install Dependencies
RUN npm install

# --- CACHE BUSTER ---
ENV CACHE_BUST=v8.5-ULTIMATE-BYPASS

# Generate Prisma Client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# --- FINAL ---
WORKDIR /app/backend
ENV NODE_ENV=production
ENV DEBUG=prisma:client,prisma:engine
EXPOSE 3000
CMD ["node", "dist/index.js"]
