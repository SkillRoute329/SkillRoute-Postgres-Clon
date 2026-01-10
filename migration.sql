-- ENUMS
DO $$ BEGIN
    CREATE TYPE "Role" AS ENUM ('SuperAdmin', 'Admin', 'User');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "ShiftStatus" AS ENUM ('Created', 'Public', 'Assigned', 'Completed', 'Cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 0. Tenants
CREATE TABLE IF NOT EXISTS "Tenant" (
    "id" SERIAL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_slug_key" ON "Tenant"("slug");

-- 1. Users
CREATE TABLE IF NOT EXISTS "User" (
    "id" SERIAL PRIMARY KEY,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "internalNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "fullName" VARCHAR(255) NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "whatsappLink" TEXT,
    "role" "Role" NOT NULL DEFAULT 'User',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLogin" TIMESTAMP(3),
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_tenantId_internalNumber_key" ON "User"("tenantId", "internalNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "User_tenantId_email_key" ON "User"("tenantId", "email");

-- 2. Shift Categories
CREATE TABLE IF NOT EXISTS "ShiftCategory" (
    "id" SERIAL PRIMARY KEY,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "baseValue" DECIMAL(10, 2) NOT NULL,
    "extraHourValue" DECIMAL(10, 2) NOT NULL,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ShiftCategory_tenantId_name_key" ON "ShiftCategory"("tenantId", "name");

CREATE TABLE IF NOT EXISTS "ShiftCategoryPriceHistory" (
    "id" SERIAL PRIMARY KEY,
    "categoryId" INTEGER NOT NULL,
    "baseValue" DECIMAL(10, 2) NOT NULL,
    "extraHourValue" DECIMAL(10, 2) NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("categoryId") REFERENCES "ShiftCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 3. Shifts
CREATE TABLE IF NOT EXISTS "Shift" (
    "id" SERIAL PRIMARY KEY,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "categoryId" INTEGER NOT NULL,
    "serviceNumber" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "time" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5),
    "line" TEXT NOT NULL,
    "relief" TEXT,
    "carNumber" TEXT NOT NULL,
    "extraHours" DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    "tip" BOOLEAN NOT NULL DEFAULT false,
    "tipValue" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    "totalValue" DECIMAL(10, 2) NOT NULL,
    "transformaFacil" BOOLEAN NOT NULL DEFAULT false,
    "transformaFacilDiscount" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "customValues" JSONB,
    "status" "ShiftStatus" NOT NULL DEFAULT 'Created',
    "createdBy" INTEGER NOT NULL,
    "assignedTo" INTEGER,
    "approvedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("categoryId") REFERENCES "ShiftCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- 4. Transactions
CREATE TABLE IF NOT EXISTS "ShiftTransaction" (
    "id" SERIAL PRIMARY KEY,
    "shiftId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(10, 2) NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 5. Custom Fields
CREATE TABLE IF NOT EXISTS "CustomFieldDefinition" (
    "id" SERIAL PRIMARY KEY,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 6. System Config
CREATE TABLE IF NOT EXISTS "SystemConfig" (
    "key" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("tenantId", "key"),
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 7. Payment
CREATE TABLE IF NOT EXISTS "Payment" (
    "id" SERIAL PRIMARY KEY,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "userId" INTEGER NOT NULL,
    "amount" DECIMAL(10, 2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 8. Audit Logs
CREATE TABLE IF NOT EXISTS "ActionLog" (
    "id" SERIAL PRIMARY KEY,
    "tenantId" INTEGER NOT NULL,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- 9. Notifications
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'INFO',
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- EXISTING ALTERS and FIXES
ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "endTime" VARCHAR(5);
ALTER TABLE "ShiftCategory" ADD COLUMN IF NOT EXISTS "extraHourValue" DECIMAL(10, 2) DEFAULT 0;
UPDATE "ShiftCategory" SET "extraHourValue" = 0 WHERE "extraHourValue" IS NULL;

-- NEW COLUMNS FOR USER (Redundant if table recreated, but safe due to IF NOT EXISTS)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappLink" TEXT;
