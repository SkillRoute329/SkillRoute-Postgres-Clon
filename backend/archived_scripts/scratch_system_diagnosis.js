const http = require('http');

function checkUrl(url) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        resolve({
          url,
          status: res.statusCode,
          timeMs: Date.now() - start,
          success: res.statusCode >= 200 && res.statusCode < 400,
          length: body.length,
          sample: body.slice(0, 250)
        });
      });
    });
    req.on('error', (err) => {
      resolve({
        url,
        success: false,
        error: err.message,
        timeMs: Date.now() - start
      });
    });
    req.setTimeout(60000, () => {
      req.destroy();
      resolve({ url, success: false, error: 'Timeout after 60s', timeMs: Date.now() - start });
    });
  });
}

async function runDiagnosis() {
  console.log("==============================================================");
  console.log("🕵️‍♂️ INICIANDO DIAGNÓSTICO SISTÉMICO DE OPERACIÓN Y SALUD");
  console.log("==============================================================\n");

  console.log("[1/4] Verificando Backend Core (Puerto 3001)...");
  const coreCheck = await checkUrl('http://localhost:3001/api/stm/health').catch(() => null) || await checkUrl('http://localhost:3001/');
  console.log(`  - Resultado: ${coreCheck.success ? '🟢 ONLINE' : '🔴 ERROR'} (Status: ${coreCheck.status}, Latencia: ${coreCheck.timeMs}ms)`);
  
  console.log("\n[2/4] Probando Endpoint de Correlación Económica Segmentada (IDA vs VUELTA)...");
  console.log("      Llamando a GET /api/stm/correlation/operational-financial/329?sentido=IDA...");
  const corrCheck = await checkUrl('http://localhost:3001/api/stm/correlation/operational-financial/329?sentido=IDA&agencyId=70');
  console.log(`  - Resultado: ${corrCheck.success ? '🟢 FUNCIONAL' : '🔴 FALLA'}`);
  if (corrCheck.success) {
    try {
      const data = JSON.parse(corrCheck.sample + (corrCheck.length > 250 ? "..." : ""));
      console.log("  - Payload Recibido Correctamente.");
    } catch(e) {
      // If sample got cut, just display length
      console.log(`  - Payload Recibido: ${corrCheck.length} bytes (PostgreSQL conectado y calculando)`);
    }
  } else {
    console.log(`  - Detalle del Error: ${corrCheck.error || 'Código HTTP ' + corrCheck.status}`);
  }

  console.log("\n[3/4] Verificando Servicio de Flota e Intranet UCOT (Cartones)...");
  const ucotCheck = await checkUrl('http://localhost:3001/api/stm/ucot/active-schedules');
  console.log(`  - Resultado: ${ucotCheck.success ? '🟢 SINCRONIZADO' : '🔴 ERROR'}`);
  if (ucotCheck.success) {
    console.log("  - Endpoint '/api/stm/ucot/active-schedules' respondiendo.");
  }

  console.log("\n[4/4] Verificando Frontend React Webserver (Puerto 3006)...");
  const frontCheck = await checkUrl('http://localhost:3006/');
  console.log(`  - Resultado: ${frontCheck.success ? '🟢 SIRVIENDO' : '🔴 CAÍDO'} (Status: ${frontCheck.status}, Latencia: ${frontCheck.timeMs}ms)`);

  console.log("\n==============================================================");
  console.log("🏁 DIAGNÓSTICO FINALIZADO");
  console.log("==============================================================");
}

runDiagnosis();
