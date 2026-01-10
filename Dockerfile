FROM node:22-alpine
WORKDIR /app

COPY package.json ./
COPY backend ./backend
COPY frontend ./frontend

# --- FRONTEND ---
WORKDIR /app/frontend
RUN npm install
RUN npm run build

# --- BACKEND ---
WORKDIR /app/backend
RUN npm install
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate
RUN rm -rf dist && npm run build

# --- FINAL ---
WORKDIR /app/backend
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "echo '📂 --- INSPECCION DE ARCHIVOS ---' && ls -F /app/frontend/dist/ || echo '❌ LA CARPETA NO EXISTE' && echo '-----------------------------' && node dist/index.js"]
