-- 0. Ensure Tenant table exists
CREATE TABLE IF NOT EXISTS "Tenant" (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    "isActive" BOOLEAN DEFAULT TRUE,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- 1. Create Notification table if not exists
CREATE TABLE IF NOT EXISTS "Notification" (
    id SERIAL PRIMARY KEY,
    "userId" INTEGER REFERENCES "User"(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    "createdAt" TIMESTAMP DEFAULT NOW()
);

-- 2. Add phoneNumber column to User table if not exists
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneNumber" VARCHAR(255);

-- 3. Seed default Tenant if not exists
INSERT INTO "Tenant" (id, name, slug, "isActive")
SELECT 1, 'TransformaFacil', 'default', true
WHERE NOT EXISTS (SELECT 1 FROM "Tenant" WHERE id = 1);
