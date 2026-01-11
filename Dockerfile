FROM node:20

WORKDIR /app

# Copy EVERYTHING
COPY . .

# Build Backend
WORKDIR /app/backend
RUN npm install
# Force DATABASE_URL for Prisma Build Config
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate
RUN npm run build

# Environment
ENV NODE_ENV=production
ENV PORT=3000
ENV CACHE_BUST=v13.3-PRISMA-FIX

EXPOSE 3000

# Start
CMD ["node", "dist/index.js"]
