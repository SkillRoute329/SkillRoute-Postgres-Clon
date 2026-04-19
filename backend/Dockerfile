# ═══════════════════════════════════════════════════════════════════════════
# DOCKERFILE - TransformaFacil Backend
# ═══════════════════════════════════════════════════════════════════════════
# Build: docker build -t transformafacil-backend:latest .
# Run: docker run -p 3002:3002 -p 3099:3099 transformafacil-backend:latest

FROM node:18-alpine AS builder

WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production && \
    npm ci --only=development

# Copiar código fuente
COPY . .

# Compilar TypeScript
RUN npm run build

# ═══════════════════════════════════════════════════════════════════════════
# Etapa de producción (imagen final)
# ═══════════════════════════════════════════════════════════════════════════

FROM node:18-alpine

WORKDIR /app

# Instalar curl para health checks
RUN apk add --no-cache curl

# Copiar package.json
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm ci --only=production

# Copiar archivos compilados de la etapa anterior
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src

# Crear usuario no-root por seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Exponer puertos
EXPOSE 3002 3099

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3002/health || exit 1

# Ejecutar aplicación
CMD ["node", "dist/index.js"]
