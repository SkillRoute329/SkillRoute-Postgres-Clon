
import admin, { storage } from './src/config/firebase'; // Asegúrate que tu firebase.ts exporte 'storage' o admin

// Si tu config no exporta 'storage' explícitamente, lo obtenemos de admin:
const bucket = admin.storage().bucket('ucot-gestor-cloud.firebasestorage.app');

async function auditBucket() {
    console.log("🔍 [AUDITORÍA DE STORAGE] Iniciando escaneo del Bucket...");
    console.log(`📡 Target Bucket: ${bucket.name}`);

    try {
        const [files] = await bucket.getFiles({ prefix: 'sanciones/' }); // Filtramos para no traer todo si hubiera mucho

        if (files.length === 0) {
            console.log("⚠️ El bucket parece estar vacío (o no hay archivos en /sanciones).");
            console.log("   -> Posible error de permisos o ruta en el Frontend.");
        } else {
            console.log(`✅ ¡ENCONTRADOS! Se detectaron ${files.length} archivos.`);
            console.log("---------------------------------------------------");
            files.forEach(file => {
                console.log(`📄 Name: ${file.name}`);
                console.log(`   📅 Created: ${file.metadata.timeCreated}`);
                console.log(`   🔗 Size: ${file.metadata.size} bytes`);
                console.log("---------------------------------------------------");
            });
            console.log("🎉 ¡Confirmado! La foto ya está en la nube de Google.");
        }

    } catch (error) {
        console.error("❌ ERROR CRÍTICO AL LEER BUCKET:", error);
    }
}

auditBucket();
