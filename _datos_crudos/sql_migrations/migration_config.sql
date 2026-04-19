CREATE TABLE IF NOT EXISTS "SystemConfig" (
    "key" TEXT PRIMARY KEY, 
    "value" TEXT, 
    "description" TEXT, 
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
