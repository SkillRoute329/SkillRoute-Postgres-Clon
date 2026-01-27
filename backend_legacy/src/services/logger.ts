
import pool from '../db';

export const logAction = async (tenantId: number, userId: number | null, action: string, details: string = '', ipAddress: string = '') => {
    try {
        await pool.query(
            'INSERT INTO "ActionLog" ("tenantId", "userId", "action", "details", "ipAddress", "createdAt") VALUES ($1, $2, $3, $4, $5, NOW())',
            [tenantId, userId, action, details, ipAddress]
        );
    } catch (error) {
        console.error('Failed to write audit log:', error);
        // We do not throw error here to avoid blocking main flow
    }
};
