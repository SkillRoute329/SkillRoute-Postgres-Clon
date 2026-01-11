"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = __importDefault(require("../src/db"));
async function fixDecimalPrecision() {
    console.log('--- Fixing Decimal Precision ---');
    try {
        const queries = [
            'ALTER TABLE "ShiftCategory" ALTER COLUMN "baseValue" TYPE DECIMAL(10,2)',
            'ALTER TABLE "ShiftCategory" ALTER COLUMN "extraHourValue" TYPE DECIMAL(10,2)',
            'ALTER TABLE "Shift" ALTER COLUMN "extraHours" TYPE DECIMAL(5,2)',
            'ALTER TABLE "Shift" ALTER COLUMN "tipValue" TYPE DECIMAL(10,2)',
            'ALTER TABLE "Shift" ALTER COLUMN "totalValue" TYPE DECIMAL(10,2)',
            'ALTER TABLE "Shift" ALTER COLUMN "transformaFacilDiscount" TYPE DECIMAL(10,2)',
            'ALTER TABLE "ShiftTransaction" ALTER COLUMN "amount" TYPE DECIMAL(10,2)',
        ];
        for (const query of queries) {
            await db_1.default.query(query);
            console.log(`✓ ${query}`);
        }
        console.log('Decimal precision fixed successfully!');
    }
    catch (err) {
        console.error('Error:', err);
    }
    finally {
        process.exit(0);
    }
}
fixDecimalPrecision();
//# sourceMappingURL=fix-decimals.js.map