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
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libgtk-3-0 \
    libxss1 \
    libxcursor1 \
    libu2f-udev \
    xdg-utils \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Copy root package files
COPY package.json ./

# Copy backend and frontend package files to install dependencies first
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install dependencies explicitly for each part of the monorepo
# This is crucial because the root package.json does not use workspaces
RUN npm install
RUN cd backend && npm install
RUN cd frontend && npm install

# Copy the rest of the code
COPY . .

# Generate Prisma client
RUN cd backend && npx prisma generate

# Build everything (Standard)
RUN cd backend && npm run build

EXPOSE 3000

# Start the SAFE BOOT application directly
CMD ["node", "backend/dist/index.js"]
