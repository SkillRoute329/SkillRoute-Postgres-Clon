
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    const defs = await prisma.serviceDefinition.findMany();
    console.log(JSON.stringify(defs, null, 2));
}

run().catch(console.error).finally(() => prisma.$disconnect());
