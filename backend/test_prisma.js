
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    try {
        console.log('Checking Prism Model...');
        if (prisma.bulletinEntry) {
            console.log('✅ prisma.bulletinEntry exists');
            const count = await prisma.bulletinEntry.count();
            console.log('Count:', count);
        } else {
            console.error('❌ prisma.bulletinEntry DOES NOT EXIST on client');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

test();
