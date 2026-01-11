"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = __importDefault(require("../src/db"));
async function fixTimeColumn() {
    console.log('--- Fixing time column type ---');
    try {
        // Change time column from TIMESTAMP to VARCHAR(5) 
        await db_1.default.query('ALTER TABLE "Shift" ALTER COLUMN "time" TYPE VARCHAR(5) USING to_char("time", \'HH24:MI\')');
        console.log('✓ Changed time column to VARCHAR(5)');
        // Change date column to DATE type
        await db_1.default.query('ALTER TABLE "Shift" ALTER COLUMN "date" TYPE DATE');
        console.log('✓ Changed date column to DATE');
        console.log('Shift table updated successfully!');
    }
    catch (err) {
        console.error('Error:', err);
    }
    finally {
        process.exit(0);
    }
}
fixTimeColumn();
//# sourceMappingURL=fix-time-column.js.map