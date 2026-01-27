
import admin, { db } from '../config/firebase';

const CATEGORIES = [
    { id: 'cat_convencional', name: 'Convencional', description: 'Unidades estándar (Líneas 300, 370)' },
    { id: 'cat_pisobajo', name: 'Piso Bajo', description: 'Accesibilidad universal (Líneas 300, 306, 316)' },
    { id: 'cat_hibrido', name: 'Híbrido', description: 'Alta rotación (Ej: Coche 95)' },
    { id: 'cat_mt15', name: 'MT15', description: 'Media distancia' },
    { id: 'cat_electricos', name: 'Eléctricos', description: 'E-Bus UCOT' },
    { id: 'cat_suburbana', name: 'Carolinas / MT12 / Inter', description: 'Servicios suburbanos e inter' }
];

// Ejemplo del "Híbrido" mencionado: Servicio 1010 -> pasa a 1015
const SAMPLE_SERVICES = [
    {
        id: 'svc_1010',
        categoryId: 'cat_hibrido',
        serviceNumber: '1010',
        line: '300',
        description: '04:50 a 12:20 - 07:30\'',
        nextServiceId: 'svc_1015', // La clave de la rotación
        shifts: [
            { type: 'MORNING', start: '04:50', end: '12:20', notes: 'Turno 1' },
            { type: 'AFTERNOON', start: '12:20', end: '20:30', notes: 'Turno 2' }
        ]
    },
    {
        id: 'svc_1015',
        categoryId: 'cat_hibrido',
        serviceNumber: '1015',
        line: '306',
        description: 'Servicio en Blanco',
        nextServiceId: 'svc_1016',
        shifts: [
            { type: 'MORNING', start: '08:30', end: '15:48', notes: 'Turno 1' },
            { type: 'AFTERNOON', start: '15:48', end: '23:15', notes: 'Turno 2' }
        ]
    }
];

async function seedCartonStructure() {
    console.log("🚌 [CARTON] Inyectando Estructura de Flota y Servicios...");

    const batch = db.batch();

    // 1. Categorías
    CATEGORIES.forEach(cat => {
        const ref = db.collection('vehicle_categories').doc(cat.id);
        batch.set(ref, cat, { merge: true });
    });

    // 2. Definiciones de Servicio (El "Papel" digitalizado)
    SAMPLE_SERVICES.forEach(svc => {
        const ref = db.collection('service_definitions').doc(svc.id);
        batch.set(ref, svc, { merge: true });
    });

    await batch.commit();
    console.log("✅ [CARTON] Categorías y Servicios de Ejemplo Cargados.");
}

if (require.main === module) {
    seedCartonStructure().catch(console.error);
}
