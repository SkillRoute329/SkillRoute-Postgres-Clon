"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runHealthCheck = void 0;
const db_1 = __importDefault(require("../db"));
const runHealthCheck = async (req, res) => {
    const status = {
        status: 'OK',
        checks: [],
        errors: []
    };
    try {
        const user = req.user;
        // 1. Auth & Tenant Check
        if (!user || !user.tenantId) {
            status.status = 'DEGRADED';
            status.errors.push('CRITICAL: Tenant ID missing in request context');
        }
        else {
            status.checks.push({ name: 'Auth', status: 'OK', tenantId: user.tenantId });
        }
        const tenantId = user?.tenantId || 0;
        // 2. Categories Check
        try {
            const catResult = await db_1.default.query('SELECT count(*) FROM "ShiftCategory" WHERE "tenantId" = $1', [tenantId]);
            status.checks.push({ name: 'Categories', status: 'OK', count: catResult.rows[0].count });
        }
        catch (e) {
            status.status = 'DEGRADED';
            status.errors.push(`Categories Error: ${e.message}`);
        }
        // 3. System Config Check
        try {
            const configResult = await db_1.default.query('SELECT count(*) FROM "SystemConfig" WHERE "tenantId" = $1', [tenantId]);
            status.checks.push({ name: 'SystemConfig', status: 'OK', count: configResult.rows[0].count });
        }
        catch (e) {
            status.status = 'DEGRADED';
            status.errors.push(`SystemConfig Error: ${e.message}`);
        }
        // 4. Shifts Check (No crash check)
        try {
            await db_1.default.query('SELECT id FROM "Shift" WHERE "tenantId" = $1 LIMIT 1', [tenantId]);
            status.checks.push({ name: 'Shifts', status: 'OK' });
        }
        catch (e) {
            status.status = 'DEGRADED';
            status.errors.push(`Shifts Error: ${e.message}`);
        }
    }
    catch (globalError) {
        status.status = 'DEGRADED';
        status.errors.push(`Global Error: ${globalError.message}`);
    }
    const httpCode = status.status === 'OK' ? 200 : 503;
    res.status(httpCode).json(status);
};
exports.runHealthCheck = runHealthCheck;
