const https = require('https');

function checkUrl(url) {
    return new Promise((resolve) => {
        https.get(url, { method: 'HEAD' }, (res) => {
            console.log(`[${res.statusCode}] ${url}`);
            resolve(res.statusCode);
        }).on('error', (e) => {
            console.log(`[ERR] ${url} : ${e.message}`);
            resolve(500);
        });
    });
}

async function run() {
    const months = ['04', '05', '06'];
    for (const m of months) {
        // Attempt 1: ckan
        await checkUrl(`https://ckan-data.montevideo.gub.uy/dataset/1205fc5c-b1b5-4478-b43e-c7411949ff15/resource/a54caf572e94/download/viajes_stm_${m}2026.zip`);
        // Attempt 2: catalogodatos
        await checkUrl(`https://catalogodatos.gub.uy/dataset/viajes-stm/resource/download/viajes_stm_${m}2026.zip`);
    }
}
run();
