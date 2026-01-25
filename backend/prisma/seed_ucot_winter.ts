
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * SEED SCRIPT: U.C.O.T. WINTER PRE-LOAD
 * 
 * Capability: Arquitectura de Temporadas & Ingesta de Flota Estricta
 */
async function main() {
    console.log('🚍 INCIANDO PROTOCOLO DE PRE-CARGA U.C.O.T. (TransportCore)...');

    // 1. Obtener o Crear Tenant
    const tenant = await prisma.tenant.upsert({
        where: { slug: 'ucot-coop' },
        update: {},
        create: {
            name: 'U.C.O.T.',
            slug: 'ucot-coop',
            isActive: true
        }
    });

    console.log(`✅ Tenant Activo: ${tenant.name} (ID: ${tenant.id})`);

    // 2. Arquitectura de Temporadas (SeasonScope)
    // Crear "Invierno 2026" en modo DRAFT (Activo pero sin colisionar con Verano si existiera)
    // Nota: En producción real, podría estar isActive=false hasta el switch-over.
    const season = await prisma.season.create({
        data: {
            tenantId: tenant.id,
            name: 'Invierno 2026 - Oficial',
            startDate: new Date('2026-06-21T00:00:00Z'),
            isActive: true // Mantenemos activo para permitir ingestión inmediata
        }
    });

    console.log(`✅ SeasonScope Creado: ${season.name} (ID: ${season.id}) -> Waiting for Data`);

    // 3. Ingesta de Flota y Categorías (Master Data)
    // Definimos las categorías estrictas requeridas por operativa
    const categories = [
        { name: 'HIBRIDO', description: 'Unidad Yutong Híbrida Eléctrica' },
        { name: 'CONVENCIONAL', description: 'Unidad Diesel Estándar' },
        { name: 'ARTICULADO', description: 'Unidad de Alta Capacidad' },
        { name: 'MICRO', description: 'Unidad de Baja Capacidad (Local)' }
    ];

    const categoryMap = new Map();

    for (const cat of categories) {
        const record = await prisma.fleetCategory.upsert({
            where: {
                tenantId_name: {
                    tenantId: tenant.id,
                    name: cat.name
                }
            },
            update: {},
            create: {
                tenantId: tenant.id,
                name: cat.name,
                description: cat.description
            }
        });
        categoryMap.set(cat.name, record.id);
        console.log(`   🔸 Categoría Validada: ${cat.name}`);
    }

    // 4. Pre-Carga de Unidades (Ejemplo Representativo)
    // Basado en evidencia de coches reales (95, 107, etc)
    const fleetData = [
        { number: '95', type: 'HIBRIDO' },
        { number: '107', type: 'HIBRIDO' },
        { number: '33', type: 'CONVENCIONAL' },
        { number: '45', type: 'ARTICULADO' },
        // Se pueden añadir más aquí o cargar vía Excel después
    ];

    for (const unit of fleetData) {
        const catId = categoryMap.get(unit.type);
        if (!catId) throw new Error(`CRITICAL: Category ${unit.type} not found`);

        await prisma.vehicle.upsert({
            where: {
                tenantId_internalNumber: {
                    tenantId: tenant.id,
                    internalNumber: unit.number
                }
            },
            update: {
                fleetCategoryId: catId,
                shiftsCapacity: 3, // Regla de negocio
                status: 'OPERATIONAL'
            },
            create: {
                tenantId: tenant.id,
                internalNumber: unit.number,
                fleetCategoryId: catId,
                shiftsCapacity: 3,
                status: 'OPERATIONAL'
            }
        });
    }

    console.log(`✅ Flota Maestra Sincronizada: ${fleetData.length} Unidades Críticas.`);
    console.log('🚀 SYSTEM READY FOR MASSIVE EXCEL INGESTION UNDER WINTER SCOPE.');
}

main()
    .catch((e) => {
        console.error('❌ Error en Pre-Carga:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
