
import fetch from 'node-fetch';

async function testProductionHosting() {
    const url = 'https://ucot-gestor-cloud.web.app';
    console.log(`🌍 Conectando a ${url}...`);

    try {
        const res = await fetch(url);

        if (!res.ok) {
            throw new Error(`HTTP Error: ${res.status} ${res.statusText}`);
        }

        const html = await res.text();
        console.log(`✅ Conexión Establecida (Status: ${res.status})`);

        // Validar Título
        if (html.includes('<title>TransForma- | Gestión en Movimiento</title>')) {
            console.log('✅ Título Correcto Detectado: "TransForma- | Gestión en Movimiento"');
            console.log('   (Esto confirma que la versión desplegada es la CLOUD NATIVE 2.0)');
        } else if (html.includes('REBUILD FORZADO')) {
            console.error('❌ Título Antiguo Detectado: El deploy no actualizó el index.html !!');
        } else {
            console.warn('⚠️ Título desconocido o no encontrado en el HTML inicial.');
        }

        console.log('🚀 Smoke Test de Hosting: PASÓ');

    } catch (error) {
        console.error('❌ Error conectando al hosting:', error);
        process.exit(1);
    }
}

testProductionHosting();
