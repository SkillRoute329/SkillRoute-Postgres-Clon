import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    // @ts-ignore - Prisma 7 property
    datasourceUrl: process.env.DATABASE_URL,
    log: ['error', 'warn']
});

export default prisma;
