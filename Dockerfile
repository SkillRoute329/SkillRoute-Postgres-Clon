FROM node:20

WORKDIR /app

# Copy EVERYTHING
COPY . .

# Build Backend
WORKDIR /app/backend
RUN npm install
# Provide a dummy DATABASE_URL as a plain environment variable for the build phase
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate
RUN npm run build

# Environment
ENV NODE_ENV=production
ENV PORT=3000
ENV CACHE_BUST=v15.0-PRISMA-7-FINAL

EXPOSE 3000

# Start
CMD ["node", "dist/index.js"]
