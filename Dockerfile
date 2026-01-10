FROM node:22-alpine
WORKDIR /app

COPY package.json ./
COPY backend ./backend
COPY frontend ./frontend

# --- FRONTEND ---
WORKDIR /app/frontend
RUN npm install
RUN npm run build

# --- BACKEND ---
WORKDIR /app/backend
RUN npm install
RUN npx prisma generate
RUN npm run build

# --- FINAL ---
WORKDIR /app/backend
EXPOSE 3000
CMD ["npm", "start"]
