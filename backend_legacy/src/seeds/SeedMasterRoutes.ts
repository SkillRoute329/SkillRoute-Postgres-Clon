import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper: Interpolate points between two coords to create density
const interpolate = (start: number[], end: number[], steps: number) => {
    const arr = [];
    for (let i = 0; i <= steps; i++) {
        const lat = start[0] + (end[0] - start[0]) * (i / steps);
        const lng = start[1] + (end[1] - start[1]) * (i / steps);
        arr.push([lat, lng]);
    }
    return arr;
};

const createDensePath = (waypoints: number[][], pointsPerSegment: number = 5) => {
    let dense: number[][] = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
        const segment = interpolate(waypoints[i], waypoints[i + 1], pointsPerSegment);
        dense = dense.concat(segment.slice(0, -1)); // Avoid duplicate joints
    }
    dense.push(waypoints[waypoints.length - 1]);
    return JSON.stringify(dense);
}

// Waypoints (Simplified tracing of real avenues)
const WP_GRAL_FLORES = [
    [-34.908, -56.185], // Palacio
    [-34.895, -56.182],
    [-34.885, -56.180], // Propios
    [-34.875, -56.178],
    [-34.865, -56.175], // Hipodromo
    [-34.850, -56.160],
    [-34.839, -56.136]  // Belloni
];

const WP_8_OCTUBRE = [
    [-34.895, -56.165], // Tres Cruces
    [-34.890, -56.155],
    [-34.885, -56.150],
    [-34.882, -56.145], // Propios
    [-34.872, -56.138], // Pan de Azucar
    [-34.862, -56.132], // Curva
    [-34.839, -56.136]  // Belloni
];

const WP_AV_ITALIA = [
    [-34.895, -56.165], // Tres Cruces
    [-34.888, -56.130], // Clinicas
    [-34.886, -56.115],
    [-34.885, -56.100], // Portones
    [-34.883, -56.060],
    [-34.881, -56.031]  // Pte Carrasco
];

const WP_GIANNATTASIO = [
    [-34.881, -56.031], // Pte Carrasco
    [-34.860, -55.990], // Costa Urbana
    [-34.845, -55.955],
    [-34.832, -55.918]  // Pinar
];

const WP_RUTA_6 = [
    [-34.839, -56.136], // Belloni
    [-34.820, -56.145],
    [-34.801, -56.155], // Mendoza
    [-34.770, -56.130],
    [-34.739, -56.101], // Toledo
    [-34.690, -56.080],
    [-34.648, -56.061], // Sauce
    [-34.542, -55.962]  // San Ramon
];

export const seedMasterRoutes = async () => {
    console.log('🌱 [SEED] Updating Routes & Variants with Dense Geometry...');

    // Clear previous data
    await prisma.tariffZone.deleteMany({});
    await prisma.routeVariant.deleteMany({});
    await prisma.route.deleteMany({});
    await prisma.radar.deleteMany({});

    // --- LINEA 306 ---
    const route306 = await prisma.route.create({
        data: { name: '306', description: 'Casabó - Géant/Pte. Carrasco', type: 'URBANA' }
    });

    const geo306A = createDensePath([[-34.890, -56.250], ...WP_8_OCTUBRE.reverse(), [-34.881, -56.031]], 8);
    await prisma.routeVariant.create({
        data: {
            routeId: route306.id,
            name: 'Hacia Géant (A)',
            origin: 'Casabó',
            destination: 'Géant',
            geometry: geo306A
        }
    });

    const geo306B = createDensePath([[-34.890, -56.250], ...WP_8_OCTUBRE.reverse(), [-34.881, -56.031]], 8);
    await prisma.routeVariant.create({
        data: {
            routeId: route306.id,
            name: 'Hacia Pte. Carrasco (B)',
            origin: 'Casabó',
            destination: 'Pte. Carrasco',
            geometry: geo306B
        }
    });

    // --- LINEA 71 ---
    const route71 = await prisma.route.create({ data: { name: '71', description: 'Pocitos - Mendoza', type: 'URBANA' } });
    const geo71 = createDensePath([[-34.912, -56.148], ...WP_GRAL_FLORES], 6);
    await prisma.routeVariant.create({
        data: { routeId: route71.id, name: 'Hacia Mendoza', origin: 'Pocitos', destination: 'Mendoza', geometry: geo71 }
    });

    // --- LINEA 221 ---
    const route221 = await prisma.route.create({ data: { name: '221', description: 'Montevideo - El Pinar', type: 'SUBURBANA' } });
    const geo221 = createDensePath([...WP_AV_ITALIA, ...WP_GIANNATTASIO], 10);
    const var221 = await prisma.routeVariant.create({
        data: { routeId: route221.id, name: 'Hacia El Pinar', origin: 'Montevideo', destination: 'El Pinar', geometry: geo221 }
    });

    // Zonas Tarifarias 221
    await prisma.tariffZone.createMany({
        data: [
            { variantId: var221.id, name: 'URBANA', type: 'POINT', latitude: -34.881, longitude: -56.031, radiusMeters: 150, order: 1 },
            { variantId: var221.id, name: 'SECCIÓN 1', type: 'POINT', latitude: -34.860, longitude: -55.990, radiusMeters: 150, order: 2 },
            { variantId: var221.id, name: 'SECCIÓN 2', type: 'POINT', latitude: -34.845, longitude: -55.955, radiusMeters: 150, order: 3 },
            { variantId: var221.id, name: 'SECCIÓN 3', type: 'POINT', latitude: -34.832, longitude: -55.918, radiusMeters: 150, order: 4 },
        ]
    });

    // --- LINEA 11A ---
    const route11A = await prisma.route.create({ data: { name: '11A', description: 'Montevideo - Sauce/San Ramon', type: 'SUBURBANA' } });
    const geo11A = createDensePath([[-34.895, -56.165], ...WP_GRAL_FLORES, ...WP_RUTA_6], 10);
    const var11A = await prisma.routeVariant.create({
        data: { routeId: route11A.id, name: 'Hacia Santa Rosa', origin: 'Montevideo', destination: 'Santa Rosa', geometry: geo11A }
    });

    // --- LINEA 300 ---
    const route300 = await prisma.route.create({ data: { name: '300', description: 'Instrucciones - Central', type: 'URBANA' } });
    const geo300 = createDensePath(WP_8_OCTUBRE, 6);
    await prisma.routeVariant.create({
        data: { routeId: route300.id, name: 'Hacia Instrucciones', origin: 'Cem. Central', destination: 'Instrucciones', geometry: geo300 }
    });

    // --- LINEA XA1 ---
    const routeXA1 = await prisma.route.create({ data: { name: 'XA1', description: 'Géant - Pinar', type: 'LOCAL' } });
    const geoXA1 = createDensePath(WP_GIANNATTASIO, 5);
    await prisma.routeVariant.create({
        data: { routeId: routeXA1.id, name: 'Hacia Pinar', origin: 'Géant', destination: 'Pinar', geometry: geoXA1 }
    });

    // Radares
    await prisma.radar.createMany({
        data: [
            { name: 'Radar Av. Italia (Portones)', latitude: -34.885, longitude: -56.100, speedLimit: 60, type: 'CAMERA' },
            { name: 'Radar Rambla (Buxareo)', latitude: -34.910, longitude: -56.140, speedLimit: 45, type: 'RADAR' },
            { name: 'Radar Giannattasio km 19', latitude: -34.868, longitude: -56.010, speedLimit: 75, type: 'CAMERA' },
            { name: 'Radar 8 de Octubre (Túnel)', latitude: -34.892, longitude: -56.160, speedLimit: 45, type: 'RADAR' }
        ]
    });

    console.log('✅ [SEED] Full Fleet with Dense Geometry Updated.');
};
