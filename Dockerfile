FROM node:20-alpine
WORKDIR /app

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
# Install runtime dependencies (OpenSSL is needed for Prisma)
RUN apk add --no-cache openssl chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy migration file from root
COPY migration.sql ./

# Install Dependencies (Pure JS now, no build tools needed)
RUN npm install

# --- CACHE BUSTER ---
ENV CACHE_BUST=v8.3-CLEAN-BUILD

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
