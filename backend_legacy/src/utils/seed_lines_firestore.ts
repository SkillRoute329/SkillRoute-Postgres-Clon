
import admin, { db } from '../config/firebase';

const ALL_LINES = [
    // Históricas UCOT
    '17', '71', '79', '300', '306', '316', '328', '329', '330', '370', '396', 'L12', 'L13',
    // Suburbanas / Diferenciales
    'D2', 'DM1', '11A', '221',
    // Ex-Raincoop / Absorción
    'XA1', 'XA2' // Asumo que estas son códigos internos de las absorbidas si no se especificaron números exactos como 222, 17, etc. (Wait, 17 y 71 eran Raincoop?) -> El usuario dio la lista explícita.
];

export async function seedLines() {
    console.log(`🚌 Iniciando Carga de Padrón de Líneas (${ALL_LINES.length} rutas)...`);

    const batch = db.batch();

    ALL_LINES.forEach(lineCode => {
        const ref = db.collection('lines').doc(lineCode);
        batch.set(ref, {
            code: lineCode,
            active: true,
            operator: 'UCOT',
            origin: 'Ex-Postgres',
            lastUpdated: new Date().toISOString()
        }, { merge: true });
    });

    await batch.commit();
    console.log('✅ Padrón de Líneas Sincronizado en Firestore.');
}

if (require.main === module) {
    seedLines().catch(console.error);
}
