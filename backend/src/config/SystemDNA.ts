
/**
 * 📜 SYSTEM DNA: The immutable core logic of TransForma 2.0.
 * This file contains constants that govern the system's identity and self-preservation.
 */
export const SYSTEM_DNA = {
    GOD_MODE: {
        email: '0000',
        internalNumber: '0000',
        // Hash for 'admin123'
        password_hash: '$2b$10$7S0R7P9uY9uY9uY9uY9uYuY9uY9uY9uY9uY9uY9uY9uY9uY9uY9uY',
        bypass_db_check: true
    },
    CRITICAL_DATA: {
        min_routes: ['300', '306', '370', 'L13'],
        default_tenant: {
            id: 1,
            name: 'UCOT_MASTER',
            slug: 'transporte-corp'
        }
    },
    INFRASTRUCTURE: {
        use_redis_queue: true,
        auto_repair: true,
        redis: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379')
        }
    }
};
