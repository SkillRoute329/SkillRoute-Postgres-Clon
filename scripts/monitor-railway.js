const https = require('https');

const TARGET_URL = 'https://transformafacil-20-production.up.railway.app/api/health';
const MAX_RETRIES = 60; // 10 minutes (10s interval)
let retryCount = 0;

console.log(`📡Iniciando Monitor de Despliegue para: ${TARGET_URL}`);
console.log('Esperando a que Railway termine el build y despliegue...');

const interval = setInterval(() => {
    retryCount++;
    const req = https.get(TARGET_URL, (res) => {
        const now = new Date().toLocaleTimeString();

        if (res.statusCode === 200) {
            console.log(`[${now}] ✅ ÉXITO: El servidor respondió 200 OK!`);
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log('📦 Respuesta:', data);
                console.log('🎉 EL SISTEMA ESTÁ VIVO Y RESPONDIENDO.');
                process.exit(0);
            });
        } else {
            console.log(`[${now}] ⏳ Estado: ${res.statusCode} (Intento ${retryCount}/${MAX_RETRIES})`);
            console.log('💡 TIP: Si esto falla mucho tiempo, corre "railway logs" en tu terminal para ver errores reales.');
        }
    });

    req.on('error', (e) => {
        console.log(`[${new Date().toLocaleTimeString()}] ❌ Error de conexión: ${e.message}`);
    });

    if (retryCount >= MAX_RETRIES) {
        console.log('❌ TIEMPO DE ESPERA AGOTADO. El despliegue no respondió en 10 minutos.');
        clearInterval(interval);
        process.exit(1);
    }
}, 10000); // 10 segundos
