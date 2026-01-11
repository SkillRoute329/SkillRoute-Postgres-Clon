FROM node:20
WORKDIR /app

# Install simple dependencies
RUN apt-get update && apt-get install -y openssl --no-install-recommends && rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY migration.sql ./
COPY backend ./backend

# --- BACKEND ---
WORKDIR /app/backend
COPY migration.sql ./
RUN npm install
ENV CACHE_BUST=v9.0-BACKEND-ONLY
RUN npx prisma generate
RUN npm run build

# --- FINAL ---
WORKDIR /app/backend
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
