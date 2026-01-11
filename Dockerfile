FROM node:20

WORKDIR /app

# Copy EVERYTHING
COPY . .

# Build Backend
WORKDIR /app/backend
RUN npm install
RUN npx prisma generate
RUN npm run build

# Environment
ENV NODE_ENV=production
ENV PORT=3000
ENV CACHE_BUST=v13.0-SIMPLE-FORCE

EXPOSE 3000

# Start
CMD ["npm", "start"]
