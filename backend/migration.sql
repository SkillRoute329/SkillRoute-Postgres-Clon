-- 1. Crear tabla Notification si no existe
CREATE TABLE IF NOT EXISTS "Notification" (
    id SERIAL PRIMARY KEY,
    "userId" INTEGER REFERENCES "User"(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    "createdAt" TIMESTAMP DEFAULT NOW()
);

-- 2. Agregar columna phoneNumber a la tabla User si no existe
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneNumber" VARCHAR(255);
