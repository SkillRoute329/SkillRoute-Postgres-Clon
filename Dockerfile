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
# --- BACKEND ---
WORKDIR /app/backend
RUN npm install
# Limpieza agresiva
RUN rm -rf dist tsconfig.tsbuildinfo
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate
# Compilación
RUN npm run build

# --- DIAGNÓSTICO FINAL DEL BUILD ---
RUN echo "📂 ESTRUCTURA FINAL DE DIST:" && ls -R dist

# --- FINAL ---
WORKDIR /app/backend
ENV NODE_ENV=production
EXPOSE 3000
# COMANDO DE ARRANQUE A PRUEBA DE FALLOS
CMD ["sh", "-c", "echo '🚀 INICIANDO...' && FILE=$(find dist -name 'index.js' | head -n 1) && echo \"📄 Ejecutando archivo encontrado: $FILE\" && node $FILE"]
