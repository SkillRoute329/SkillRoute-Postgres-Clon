
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper Geometries (Approximate tracing of main avenues)
// 8 de Octubre Axis (Tres Cruces -> Belloni)
const GEO_8_OCTUBRE = [
    [-34.895, -56.165], // Tres Cruces
    [-34.890, -56.155], // Luis A de Herrera
    [-34.882, -56.145], // Propios
    [-34.872, -56.138], // Pan de Azucar
    [-34.862, -56.132], // Curva de Maroñas
    [-34.839, -56.136]  // Belloni (Intercambiador)
];

// Av Italia / Giannattasio Axis (Tres Cruces -> Pinar)
const GEO_AV_ITALIA_GIANNATTASIO = [
    [-34.895, -56.165], // Tres Cruces
    [-34.888, -56.130], // Hospital de Clinicas area
    [-34.885, -56.100], // Portones area
    [-34.881, -56.031], // Puente Carrasco
    [-34.860, -55.990], // Costa Urbana
    [-34.832, -55.918]  // El Pinar
];

// General Flores Axis (Palacio -> Instrucciones)
const GEO_GRAL_FLORES = [
    [-34.908, -56.185], // Palacio Legislativo
    [-34.885, -56.180], // Propios
    [-34.865, -56.175], // Hipódromo
    [-34.839, -56.136]  // Belloni
];

// 11A Ruta 6/33 Axis
const GEO_RUTA_6 = [
    [-34.839, -56.136], // Belloni
    [-34.801, -56.155], // Mendoza e Instrucciones
    [-34.739, -56.101], // Toledo
    [-34.648, -56.061], // Sauce
    [-34.542, -55.962]  // San Ramon (Approx)
];

const stringifyGeo = (geo: number[][]) => JSON.stringify(geo);

// Centric Zone Polygon (Ciudad Vieja & Centro)
const CENTRIC_POLYGON = JSON.stringify([
    [-34.906, -56.211], [-34.902, -56.208], [-34.901, -56.195], [-34.910, -56.188],
    [-34.915, -56.195], [-34.912, -56.210]
]);

export const seedMasterRoutes = async () => {
    console.log('🌱 [SEED] Updating Fleet: Full UCOT & Regional List...');

    // Clear previous data
    await prisma.tariffZone.deleteMany({});
    await prisma.masterRoute.deleteMany({});
    await prisma.radar.deleteMany({});

    const routes = [
        // --- A. URBANAS ---
        { line: '71', variant: 'Pocitos-Mendoza', origin: 'Pocitos', destination: 'Mendoza', geo: GEO_GRAL_FLORES },
        { line: '79', variant: 'Ciudad Vieja-Villa Española', origin: 'Ciudad Vieja', destination: 'Villa Española', geo: [[-34.906, -56.211], [-34.895, -56.165], [-34.870, -56.140]] }, // Approx
        { line: '300', variant: 'Instrucciones-Central', origin: 'Instrucciones', destination: 'Cem. Central', geo: GEO_8_OCTUBRE },
        { line: '306', variant: 'Géant-Casabó (A)', origin: 'Géant', destination: 'Casabó', geo: [[-34.881, -56.031], ...GEO_8_OCTUBRE, [-34.890, -56.250]] },
        { line: '306', variant: 'Pte Carrasco-Casabó (B)', origin: 'Pte Carrasco', destination: 'Casabó', geo: [[-34.881, -56.031], ...GEO_8_OCTUBRE, [-34.890, -56.250]] },
        { line: '316', variant: 'Cno. Maldonado-Pocitos', origin: 'Km 16 Cno Maldonado', destination: 'Pocitos', geo: GEO_8_OCTUBRE },
        { line: '328', variant: 'Punta Carretas-Mendoza', origin: 'Punta Carretas', destination: 'Mendoza', geo: [...GEO_8_OCTUBRE, [-34.801, -56.155]] },
        { line: '329', variant: 'Punta Carretas-Melilla', origin: 'Punta Carretas', destination: 'Melilla', geo: GEO_GRAL_FLORES },
        { line: '330', variant: 'Ciudad Vieja-Instrucciones', origin: 'Ciudad Vieja', destination: 'Instrucciones', geo: GEO_GRAL_FLORES },
        { line: '370', variant: 'Portones-Cerro', origin: 'Portones', destination: 'Cerro', geo: [[-34.885, -56.100], [-34.895, -56.165], [-34.880, -56.240]] },
        { line: '396', variant: 'Ciudad Vieja-Punta Gorda', origin: 'Ciudad Vieja', destination: 'Punta Gorda', geo: [[-34.906, -56.211], [-34.895, -56.165], [-34.890, -56.100]] },
        { line: 'D2', variant: 'Ciudad Vieja-Terminal', origin: 'Ciudad Vieja', destination: 'Terminal', geo: GEO_8_OCTUBRE },

        // --- B. LOCALES ---
        { line: 'L12', variant: 'Ptas. Sayago - Instrucciones', origin: 'Ptas. Sayago', destination: 'Instrucciones', geo: GEO_GRAL_FLORES }, // Approx
        { line: 'L13', variant: 'Mendoza - Toledo', origin: 'Mendoza', destination: 'Toledo', geo: [[-34.801, -56.155], [-34.739, -56.101]] },
        { line: 'L31', variant: 'Pinar Local', origin: 'Pinar', destination: 'Pinar', geo: [[-34.832, -55.918], [-34.820, -55.910]] },
        { line: 'L32', variant: 'Pinar Local', origin: 'Pinar', destination: 'Pinar', geo: [[-34.832, -55.918], [-34.820, -55.910]] },
        { line: 'L33', variant: 'Pinar Local', origin: 'Pinar', destination: 'Pinar', geo: [[-34.832, -55.918], [-34.820, -55.910]] },

        // --- C. SUBURBANAS & REGIONALES ---
        { line: '221', variant: 'Montevideo-Pinar', origin: 'Montevideo', destination: 'El Pinar', geo: GEO_AV_ITALIA_GIANNATTASIO },
        { line: '11A', variant: 'Montevideo-Sauce', origin: 'Montevideo', destination: 'Sauce', geo: GEO_RUTA_6 },
        { line: '11A', variant: 'Montevideo-San Ramón', origin: 'Montevideo', destination: 'San Ramón', geo: GEO_RUTA_6 },
        { line: '11A', variant: 'Montevideo-Chamizo', origin: 'Montevideo', destination: 'Chamizo', geo: GEO_RUTA_6 },
        { line: '11A', variant: 'Montevideo-Santa Rosa', origin: 'Montevideo', destination: 'Santa Rosa', geo: GEO_RUTA_6 },

        // --- NUEVAS ---
        { line: 'XA1', variant: 'Geant-Pinar', origin: 'Géant', destination: 'Pinar', geo: [[-34.881, -56.031], [-34.832, -55.918]] },
        { line: 'XA2', variant: 'Geant-Pinar', origin: 'Géant', destination: 'Pinar', geo: [[-34.881, -56.031], [-34.832, -55.918]] },
        { line: 'San Jacinto', variant: 'Montevideo-San Jacinto', origin: 'Montevideo', destination: 'San Jacinto', geo: [[-34.839, -56.136], [-34.5, -55.8]] }, // Very rough approx
        { line: 'Tala', variant: 'Montevideo-Tala', origin: 'Montevideo', destination: 'Tala', geo: [[-34.839, -56.136], [-34.3, -55.7]] },
        { line: 'Canelones', variant: 'Montevideo-Canelones', origin: 'Montevideo', destination: 'Canelones', geo: [[-34.9, -56.2], [-34.5, -56.3]] }
    ];

    for (const r of routes) {
        const route = await prisma.masterRoute.create({
            data: {
                line: r.line,
                variant: r.variant,
                origin: r.origin,
                destination: r.destination,
                geometry: stringifyGeo(r.geo),
                tenantId: 1
            }
        });

        // 1. ZONAS GENERALES (Para todas las líneas, si pasan por ahí)
        // Se asume que Urbanas tocan Montevideo.
        if (['71', '79', '300', '306', '316', '328', '329', '330', '370', '396', 'D2', '221', '11A'].includes(r.line)) {
            // Céntrica
            await prisma.tariffZone.create({
                data: { routeId: route.id, name: 'CÉNTRICA', type: 'POLYGON', latitude: -34.906, longitude: -56.198, geometry: CENTRIC_POLYGON, order: 0 }
            });
            // Zonal E
            await prisma.tariffZone.create({
                data: { routeId: route.id, name: 'ZONAL E', type: 'CIRCLE', latitude: -34.869, longitude: -56.212, radiusMeters: 1000, order: 0 }
            });
            // Zonal L
            await prisma.tariffZone.create({
                data: { routeId: route.id, name: 'ZONAL L', type: 'CIRCLE', latitude: -34.839, longitude: -56.136, radiusMeters: 1000, order: 0 }
            });
        }

        // 2. SUBURBANA 221
        if (r.line === '221' || r.line === 'XA1' || r.line === 'XA2') {
            await prisma.tariffZone.createMany({
                data: [
                    { routeId: route.id, name: 'URBANA', type: 'POINT', latitude: -34.881, longitude: -56.031, radiusMeters: 150, order: 1 },
                    { routeId: route.id, name: 'SECCIÓN 1', type: 'POINT', latitude: -34.860, longitude: -55.990, radiusMeters: 150, order: 2 },
                    { routeId: route.id, name: 'SECCIÓN 2', type: 'POINT', latitude: -34.845, longitude: -55.955, radiusMeters: 150, order: 3 },
                    { routeId: route.id, name: 'SECCIÓN 3', type: 'POINT', latitude: -34.832, longitude: -55.918, radiusMeters: 150, order: 4 },
                ]
            });
        }

        // 3. SUBURBANA 11A / SAN JACINTO / TALA
        if (['11A', 'San Jacinto', 'Tala'].includes(r.line)) {
            await prisma.tariffZone.createMany({
                data: [
                    { routeId: route.id, name: 'URBANA', type: 'POINT', latitude: -34.801, longitude: -56.155, radiusMeters: 150, order: 1 }, // Límite Depto
                    { routeId: route.id, name: 'TOLEDO', type: 'POINT', latitude: -34.739, longitude: -56.101, radiusMeters: 150, order: 2 },
                    { routeId: route.id, name: 'SAUCE', type: 'POINT', latitude: -34.648, longitude: -56.061, radiusMeters: 150, order: 3 },
                ]
            });
        }
    }

    // Radares (Full List Demo)
    await prisma.radar.createMany({
        data: [
            { name: 'Radar Av. Italia (Portones)', latitude: -34.885, longitude: -56.100, speedLimit: 60, type: 'CAMERA' },
            { name: 'Radar Rambla (Buxareo)', latitude: -34.910, longitude: -56.140, speedLimit: 45, type: 'RADAR' },
            { name: 'Radar Giannattasio km 19', latitude: -34.868, longitude: -56.010, speedLimit: 75, type: 'CAMERA' },
            { name: 'Radar 8 de Octubre (Túnel)', latitude: -34.892, longitude: -56.160, speedLimit: 45, type: 'RADAR' }
        ]
    });

    console.log('✅ [SEED] UCOT Fleet Update Complete.');
};
