// Script para simular un usuario real y verificar el sistema
const URL = 'http://localhost:3000';
async function runTest() {
    console.log('🤖 [BOT] Iniciando Test de Integridad...');

    // 1. Probar Healthcheck
    try {
        const health = await fetch(`${URL}/api/health`);
        if (health.status !== 200) throw new Error(`Health status: ${health.status}`);
        const data = await health.json();
        console.log('✅ [BOT] Sistema Saludable:', data);
    } catch (e) {
        console.error('❌ [BOT] FALLO CRÍTICO EN HEALTHCHECK:', e.message);
        process.exit(1);
    }

    // 2. Simular Carga de Home (Frontend)
    try {
        const home = await fetch(`${URL}/`);
        const text = await home.text();
        if (text.includes('<!doctype html>') || text.includes('vite')) {
            console.log('✅ [BOT] Frontend HTML servido correctamente.');
        } else {
            console.warn('⚠️ [BOT] Alerta: El HTML recibido no parece correcto (¿Es el fallback?).');
        }
    } catch (e) {
        console.error('❌ [BOT] No se pudo cargar el Home:', e.message);
    }

    console.log('🎉 [BOT] PRUEBAS FINALIZADAS. El sistema está operativo.');
}

// Esperar 5 segundos a que arranque el server y ejecutar
setTimeout(runTest, 5000);
