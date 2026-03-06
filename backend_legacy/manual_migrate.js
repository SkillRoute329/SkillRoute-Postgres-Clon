const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const query = `
CREATE TABLE IF NOT EXISTS "ShiftCategoryPriceHistory" (
    "id" SERIAL PRIMARY KEY,
    "categoryId" INTEGER NOT NULL,
    "baseValue" DECIMAL(10, 2) NOT NULL,
    "extraHourValue" DECIMAL(10, 2) NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftCategoryPriceHistory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ShiftCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
`;

(async () => {
  try {
    console.log('Connecting to', process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@'));
    await pool.query(query);
    console.log('Table ShiftCategoryPriceHistory created successfully.');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
