FROM node:20

WORKDIR /app

# Copy EVERYTHING
COPY . .

# Build Backend
WORKDIR /app/backend
RUN npm install
# Now that schema.prisma has 'url = env("DATABASE_URL")', we can provide a dummy one for build
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate
RUN npm run build

# Environment
ENV NODE_ENV=production
ENV PORT=3000
ENV CACHE_BUST=v14.0-FINAL-SCHEMA-FIX

EXPOSE 3000

# Start
CMD ["node", "dist/index.js"]
