# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package.json ./

# Copy backend and frontend
COPY backend ./backend
COPY frontend ./frontend

# Install dependencies and build Frontend
WORKDIR /app/frontend
RUN npm install
RUN npm run build

# Install dependencies and build Backend
WORKDIR /app/backend
RUN npm install
RUN npm run build

# Production Stage
FROM node:20-alpine

WORKDIR /app

# Copy Backend Build
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/package.json ./package.json
COPY --from=builder /app/backend/node_modules ./node_modules
# Copy Prisma Schema and Migration (needed for runtime migration)
COPY --from=builder /app/backend/prisma ./prisma
# Copy Migration SQL from root of builder context to root of runtime
COPY --from=builder /app/backend/prisma/schema.prisma ./prisma/
COPY --from=builder /app/backend/../migration.sql ./migration.sql

# Copy Frontend Build (to be served by Backend)
# We copy to ../frontend/dist because backend looks for it at ../../frontend/dist relative to dist/src/index.js
# Adjusted path: backend/dist/index.js -> runs in /app/dist
# index.js looks for path.resolve(__dirname, '../../frontend/dist')
# If __dirname is /app/dist, ../.. is /
# So we place frontend/dist at /frontend/dist in the container
COPY --from=builder /app/frontend/dist ./frontend/dist

# Install production dependencies only (if needed, but we copied node_modules)
# If node_modules clean is preferred:
# COPY --from=builder /app/backend/package.json .
# RUN npm install --production

# Environment variables
ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

# Start command
CMD ["node", "dist/index.js"]

# Dockerfile verified and re-saved
