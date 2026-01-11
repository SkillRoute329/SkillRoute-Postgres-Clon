# Use a Node 22 image that is guaranteed to be recent enough for Prisma 7
FROM node:22-bookworm

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    openssl \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    librandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy root package files
COPY package.json ./

# Copy backend and frontend package files to install dependencies first
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install dependencies (using --legacy-peer-deps to avoid conflicts in monorepo)
RUN npm install --legacy-peer-deps

# Copy the rest of the code
COPY . .

# Generate Prisma client
RUN cd backend && npx prisma generate

# Build everything
RUN npm run build

# Expose the API port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
