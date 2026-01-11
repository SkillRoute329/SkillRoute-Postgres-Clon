FROM node:22-alpine
WORKDIR /app

COPY package.json ./
COPY migration.sql ./
COPY backend ./backend
COPY frontend ./frontend

# --- FRONTEND ---
WORKDIR /app/frontend
RUN npm install
RUN npm run build

# --- BACKEND ---
# --- BACKEND ---
WORKDIR /app/backend
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont openssl python3 make g++
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
# Copy migration file from root
COPY migration.sql ./

# Install Dependencies (CRITICAL FIX)
RUN npm install

# --- CACHE BUSTER ---
ENV CACHE_BUST=v5.1

# Explicitly generate Prisma Client for the added binary targets
RUN npx prisma generate

# Construir TypeScript
RUN npm run build

# --- FINAL ---
WORKDIR /app/backend
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
