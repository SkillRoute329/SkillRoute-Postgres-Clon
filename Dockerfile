FROM node:20-alpine
WORKDIR /app

# Copiar archivos de configuración
COPY package.json ./

# Copiar carpetas del proyecto
COPY backend ./backend
COPY frontend ./frontend

# --- FRONTEND ---
WORKDIR /app/frontend
RUN npm install
RUN npm run build

# --- BACKEND ---
WORKDIR /app/backend
RUN npm install
RUN npm run build

# Volver a la raíz para ejecutar
WORKDIR /app

# Exponer puerto
EXPOSE 3000

# Comando de inicio
CMD ["npm", "start"]
