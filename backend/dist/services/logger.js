"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAction = void 0;
const db_1 = __importDefault(require("../db"));
const logAction = async (tenantId, userId, action, details = '', ipAddress = '') => {
    try {
        await db_1.default.query('INSERT INTO "ActionLog" ("tenantId", "userId", "action", "details", "ipAddress", "createdAt") VALUES ($1, $2, $3, $4, $5, NOW())', [tenantId, userId, action, details, ipAddress]);
    }
    catch (error) {
        console.error('Failed to write audit log:', error);
        // We do not throw error here to avoid blocking main flow
    }
};
exports.logAction = logAction;
