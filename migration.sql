ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "endTime" VARCHAR(5);
ALTER TABLE "ShiftCategory" ADD COLUMN IF NOT EXISTS "extraHourValue" DECIMAL(10, 2) DEFAULT 0;
UPDATE "ShiftCategory" SET "extraHourValue" = 0 WHERE "extraHourValue" IS NULL;
