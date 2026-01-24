import { PrismaClient } from '@prisma/client';

async function main() {
    const prisma = new PrismaClient();
    try {
        console.log('Testing DB connection...');
        const result = await prisma.$queryRaw`SELECT 1 as connected`;
        console.log('Result:', result);
        const userCount = await prisma.user.count();
        console.log('User count:', userCount);
    } catch (e) {
        console.error('Connection FAIL:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
