import { PrismaClient } from '@prisma/client';

export async function seedServicesVerano2026(prisma: PrismaClient) {
    console.log('🚀 [DISABLED] Skipping Auto-Seed services_verano_2026 to prevent data overwrite.');
    /*
    console.log('🚀 Iniciando Carga Masiva: Sábana de Servicios Verano 2026...');

    const tenant = await prisma.tenant.findFirst({ where: { slug: 'ucot' } }) || { id: 1 };
    const tenantId = tenant.id;

    // 1. Asegurar Temporada
    let season = await prisma.season.findFirst({
        where: { tenantId, name: 'VERANO 2026' }
    });

    if (!season) {
        console.log('📅 Creando Temporada VERANO 2026...');
        season = await prisma.season.create({
            data: {
                tenantId,
                name: 'VERANO 2026',
                startDate: new Date('2025-12-15'),
                isActive: true
            }
        });
    }

    // WARNING: This deletes user data!
    // console.log('🧹 Limpiando servicios previos de Verano 2026...');
    // await prisma.serviceDefinition.deleteMany({
    //    where: { seasonId: season.id }
    // });
    
    // ... Logic omitted to protect data ...
    */
}
