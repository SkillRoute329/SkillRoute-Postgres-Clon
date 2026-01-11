"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSchema = exports.updateSystemConfig = exports.getSystemConfig = void 0;
const db_1 = __importDefault(require("../db"));
const getSystemConfig = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        if (!tenantId) {
            return res.status(401).json({ message: 'Token obsoleto. Por favor reloguee.' });
        }
        const result = await db_1.default.query('SELECT * FROM "SystemConfig" WHERE "tenantId" = $1', [tenantId]);
        const config = {};
        result.rows.forEach(row => {
            config[row.key] = row.value;
        });
        res.json(config);
    }
    catch (error) {
        console.error('Error fetching system config:', error);
        res.status(500).json({ message: 'Error retrieving system configuration' });
    }
};
exports.getSystemConfig = getSystemConfig;
const updateSystemConfig = async (req, res) => {
    const { key, value } = req.body;
    const tenantId = req.user.tenantId;
    try {
        if (!tenantId) {
            return res.status(401).json({ message: 'Token obsoleto' });
        }
        await db_1.default.query(`INSERT INTO "SystemConfig" ("key", "value", "updatedAt", "tenantId") 
             VALUES ($1, $2, NOW(), $3) 
             ON CONFLICT ("tenantId", "key") 
             DO UPDATE SET "value" = $2, "updatedAt" = NOW()`, [key, value, tenantId]);
        res.json({ message: 'Config updated', key, value });
    }
    catch (error) {
        console.error('Error updating system config:', error);
        res.status(500).json({ message: 'Error updating configuration' });
    }
};
exports.updateSystemConfig = updateSystemConfig;
// Internal migration trigger
const initSchema = async (req, res) => {
    try {
        // 1. Create SystemConfig Table
        await db_1.default.query(`
            CREATE TABLE IF NOT EXISTS "SystemConfig" (
                "key" TEXT NOT NULL,
                "value" TEXT NOT NULL,
                "description" TEXT,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
            );
        `);
        // 2. Add baseValue to ShiftCategory
        try {
            await db_1.default.query(`
                ALTER TABLE "ShiftCategory" 
                ADD COLUMN "baseValue" DECIMAL(10,2) NOT NULL DEFAULT 0;
            `);
        }
        catch (e) {
            // Ignore if exists
        }
        res.json({ message: 'Schema initialized successfully' });
    }
    catch (error) {
        console.error('Migration error:', error);
        res.status(500).json({ message: 'Migration failed', error: error.message });
    }
};
exports.initSchema = initSchema;
