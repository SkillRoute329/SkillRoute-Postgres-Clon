
import { seedMasterRoutes } from './seeds/SeedMasterRoutes';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

(async () => {
    try {
        // Ensure Tenant 1 exists
        const tenant = await prisma.tenant.findUnique({ where: { id: 1 } });
        if (!tenant) {
            console.log('Creating Default Tenant...');
            await prisma.tenant.create({
                data: { id: 1, name: 'Transportes Default', slug: 'transportes-default' }
            });
        }

        await seedMasterRoutes();
        console.log('Seed completed successfully.');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
