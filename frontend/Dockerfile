# ═══════════════════════════════════════════════════════════════════════════
# DOCKERFILE - TransformaFacil Frontend (Vite)
# ═══════════════════════════════════════════════════════════════════════════

FROM node:18-alpine AS builder

WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm ci

# Copiar código fuente
COPY . .

# Build
RUN npm run build

# ═══════════════════════════════════════════════════════════════════════════
# Etapa de producción (Nginx)
# ═══════════════════════════════════════════════════════════════════════════

FROM nginx:alpine

# Copiar archivos compilados
COPY --from=builder /app/dist /usr/share/nginx/html

# Copiar configuración de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Exponer puerto
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:80 || exit 1

CMD ["nginx", "-g", "daemon off;"]
