
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    const def = await prisma.serviceDefinition.findFirst({
        where: { serviceNumber: '2290' }
    });
    if (def) {
        console.log('Route Data:', def.routeData);
    } else {
        console.log('No service 2290 found');
    }
}

run().catch(console.error).finally(() => prisma.$disconnect());
