const https = require('https');
const http = require('http');

const urlArg = process.argv[2];

if (!urlArg) {
    console.error('❌ ERROR: Debes proporcionar la URL de la app.');
    console.error('Uso: npm run deploy:verify <URL>');
    console.error('Ejemplo: npm run deploy:verify https://mi-app.com');
    process.exit(1);
}

// Normalizar URL (quitar slash final)
const BASE_URL = urlArg.replace(/\/$/, '');

console.log(`🔎 INICIANDO VERIFICACIÓN REMOTA: ${BASE_URL}`);
console.log('==========================================');

const TIMEOUT_MS = 60000; // 60 segundos totales de espera
const RETRY_DELAY = 5000; // 5 segundos entre intentos
const START_TIME = Date.now();

function check(url, type) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, (res) => {
            if (res.statusCode === 200) {
                resolve(true);
            } else {
                reject(new Error(`Status ${res.statusCode}`));
            }
        });
        req.on('error', (err) => reject(err));
        req.end();
    });
}

async function waitForService() {
    console.log('⏳ Esperando que el servicio responda (Polling)...');

    while (Date.now() - START_TIME < TIMEOUT_MS) {
        try {
            await check(`${BASE_URL}/api/health`, 'API');
            console.log('✅ API Health: Responde 200 OK');

            await check(`${BASE_URL}/`, 'Frontend');
            console.log('✅ Frontend Root: Responde 200 OK');

            return true;
        } catch (e) {
            process.stdout.write('.'); // Feedback visual de espera
            await new Promise(r => setTimeout(r, RETRY_DELAY));
        }
    }
    throw new Error('Timeout: El servicio no respondió después de 60 segundos.');
}

(async () => {
    try {
        await waitForService();
        console.log('\n\n🚀 ¡DESPLIEGUE VERIFICADO CON ÉXITO! 🚀');
        console.log('La aplicación está 100% operativa.');
    } catch (error) {
        console.error(`\n\n❌ VERIFICACIÓN FALLIDA: ${error.message}`);
        console.error('SUGERENCIAS:');
        console.error('1. Revisa los logs en el panel de DigitalOcean/Render.');
        console.error('2. Verifica que las variables de entorno (DATABASE_URL, etc.) estén bien puestas.');
        console.error('3. Asegúrate de que el "Start Command" sea "npm start".');
        process.exit(1);
    }
})();
