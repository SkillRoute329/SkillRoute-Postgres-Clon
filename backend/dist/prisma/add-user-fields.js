"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = __importDefault(require("../src/db"));
async function addUserFields() {
    console.log('--- Adding phoneNumber and whatsappLink fields to User table ---');
    try {
        await db_1.default.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneNumber" VARCHAR(20)');
        console.log('✓ Added phoneNumber column');
        await db_1.default.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappLink" VARCHAR(255)');
        console.log('✓ Added whatsappLink column');
        console.log('User table updated successfully!');
    }
    catch (err) {
        console.error('Error:', err);
    }
    finally {
        process.exit(0);
    }
}
addUserFields();
//# sourceMappingURL=add-user-fields.js.map