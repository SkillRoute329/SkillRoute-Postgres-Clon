
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const GENERIC_GEOMETRY = JSON.stringify([
    [-34.895, -56.165], [-34.896, -56.166], [-34.897, -56.168], [-34.900, -56.170],
    [-34.905, -56.175], [-34.910, -56.180], [-34.915, -56.185], [-34.920, -56.190]
]);

// Centric Zone Polygon (Ciudad Vieja & Centro)
const CENTRIC_POLYGON = JSON.stringify([
    [-34.906, -56.211], [-34.902, -56.208], [-34.901, -56.195], [-34.910, -56.188],
    [-34.915, -56.195], [-34.912, -56.210]
]);

export const seedMasterRoutes = async () => {
    console.log('🌱 [SEED] Advanced Revenue Geography: UCOT Master Seed...');

    await prisma.tariffZone.deleteMany({});
    await prisma.masterRoute.deleteMany({});

    const routes = [
        { line: '71', variant: 'Pocitos-Mendoza', origin: 'Pocitos', destination: 'Mendoza' },
        { line: '300', variant: 'Instrucciones-Central', origin: 'Instrucciones', destination: 'Cem. Central' },
        { line: '306', variant: 'Géant-Casabó', origin: 'Géant', destination: 'Casabó' },
        { line: '221', variant: 'Montevideo-Pinar', origin: 'Montevideo', destination: 'El Pinar' },
        { line: '11A', variant: 'Montevideo-Sauce', origin: 'Montevideo', destination: 'San Ramón' }
    ];

    for (const r of routes) {
        const route = await prisma.masterRoute.create({
            data: {
                line: r.line,
                variant: r.variant,
                origin: r.origin,
                destination: r.destination,
                geometry: GENERIC_GEOMETRY,
                tenantId: 1
            }
        });

        // 1. Common Montevideo Zones for all Urban lines (and urban part of suburban)
        if (['71', '300', '306', '221', '11A'].includes(r.line)) {
            // Centric Zone
            await prisma.tariffZone.create({
                data: {
                    routeId: route.id,
                    name: 'CÉNTRICA',
                    type: 'POLYGON',
                    latitude: -34.906,
                    longitude: -56.198, // Center handle
                    geometry: CENTRIC_POLYGON,
                    order: 0
                }
            });

            // Zonal E (Paso Molino)
            await prisma.tariffZone.create({
                data: {
                    routeId: route.id,
                    name: 'ZONAL E',
                    type: 'CIRCLE',
                    latitude: -34.869,
                    longitude: -56.212, // Viaducto
                    radiusMeters: 1000,
                    order: 0
                }
            });

            // Zonal L (Belloni)
            await prisma.tariffZone.create({
                data: {
                    routeId: route.id,
                    name: 'ZONAL L',
                    type: 'CIRCLE',
                    latitude: -34.839,
                    longitude: -56.136, // Belloni e Instrucciones 
                    radiusMeters: 1000,
                    order: 0
                }
            });
        }

        // 2. Suburban Specific Limits
        if (r.line === '221') {
            await prisma.tariffZone.createMany({
                data: [
                    { routeId: route.id, name: 'URBANA', type: 'POINT', latitude: -34.881, longitude: -56.031, radiusMeters: 150, order: 1 }, // Puente Carrasco
                    { routeId: route.id, name: 'SECCIÓN 1', type: 'POINT', latitude: -34.860, longitude: -55.990, radiusMeters: 150, order: 2 }, // Almenara
                    { routeId: route.id, name: 'SECCIÓN 2', type: 'POINT', latitude: -34.845, longitude: -55.955, radiusMeters: 150, order: 3 }, // Márquez Castro
                    { routeId: route.id, name: 'SECCIÓN 3', type: 'POINT', latitude: -34.832, longitude: -55.918, radiusMeters: 150, order: 4 }, // Entrada Pinar
                ]
            });
        }

        if (r.line === '11A') {
            await prisma.tariffZone.createMany({
                data: [
                    { routeId: route.id, name: 'URBANA', type: 'POINT', latitude: -34.801, longitude: -56.155, radiusMeters: 150, order: 1 }, // Límite Depto
                    { routeId: route.id, name: 'TOLEDO', type: 'POINT', latitude: -34.739, longitude: -56.101, radiusMeters: 150, order: 2 },
                    { routeId: route.id, name: 'SAUCE', type: 'POINT', latitude: -34.648, longitude: -56.061, radiusMeters: 150, order: 3 },
                ]
            });
        }
    }

    // Radares (Static demo)
    await prisma.radar.deleteMany({});
    await prisma.radar.createMany({
        data: [
            { name: 'Radar Av. Italia', latitude: -34.885, longitude: -56.120, speedLimit: 60, type: 'CAMERA' },
            { name: 'Radar Rambla', latitude: -34.910, longitude: -56.150, speedLimit: 45, type: 'RADAR' }
        ]
    });

    console.log('✅ [SEED] Revenue Geography Seeded Successfully.');
};
