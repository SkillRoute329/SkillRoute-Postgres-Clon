const http = require('http');

const options = {
  hostname: 'localhost',
  port: 11434,
  path: '/api/pull',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
};

const req = http.request(options, (res) => {
  console.log('STATUS: ' + res.statusCode);
  res.setEncoding('utf8');
  let count = 0;
  res.on('data', (chunk) => {
    try {
      const data = JSON.parse(chunk.split('\n')[0]);
      if (data.status && data.completed) {
        console.log(`[LIVE PROBE] Estado: ${data.status}`);
        console.log(`[LIVE PROBE] Descargado: ${(data.completed / (1024*1024)).toFixed(2)} MB / ${(data.total / (1024*1024)).toFixed(2)} MB`);
        req.destroy(); // Cerrar conexión tras recibir datos vivos
        process.exit(0);
      } else {
        console.log('[LIVE PROBE] Status Object:', data);
        count++;
        if (count > 5) {
           req.destroy();
           process.exit(0);
        }
      }
    } catch(e) {
      // A veces el chunk es cortado
    }
  });
});

req.write(JSON.stringify({ name: 'llama3.1:8b' }));
req.end();

setTimeout(() => { console.log("Probe timeout"); process.exit(1); }, 10000);
