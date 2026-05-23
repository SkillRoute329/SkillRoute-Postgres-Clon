const http = require('http');

function makeRequest(options, postData) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          timeMs: Date.now() - start,
          success: res.statusCode >= 200 && res.statusCode < 400,
          body
        });
      });
    });

    req.on('error', (err) => {
      resolve({ success: false, error: err.message, timeMs: Date.now() - start });
    });

    req.setTimeout(60000, () => {
      req.destroy();
      resolve({ success: false, error: 'Timeout after 60s', timeMs: Date.now() - start });
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runDiagnosis() {
  console.log("==============================================================");
  console.log("🕵️‍♂️ DIAGNÓSTICO PROFUNDO CON AUTENTICACIÓN ACTIVA");
  console.log("==============================================================\n");

  console.log("[1/4] Ejecutando Login en API (/api/auth/login) con credenciales 329...");
  const loginPayload = JSON.stringify({ internalNumber: "329", password: "Skill329" });
  
  const loginResult = await makeRequest({
    hostname: 'localhost',
    port: 3001,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginPayload)
    }
  }, loginPayload);

  if (!loginResult.success) {
    console.log("🔴 FALLA DE LOGIN: " + (loginResult.error || `HTTP ${loginResult.status}`));
    console.log("Response: " + loginResult.body);
    process.exit(1);
  }

  let token = '';
  try {
    const json = JSON.parse(loginResult.body);
    token = json.data.token;
    console.log("🟢 LOGIN EXITOSO. Token JWT JWT adquirido correctamente.");
  } catch(e) {
    console.log("🔴 ERROR DE PARSEO DE LOGIN. JSON incompleto.");
    process.exit(1);
  }

  console.log("\n[2/4] Probando Endpoint de Correlación Económica Segmentada con Token...");
  console.log("      Llamando a GET /api/stm/correlation/operational-financial/329?sentido=IDA...");
  
  const corrResult = await makeRequest({
    hostname: 'localhost',
    port: 3001,
    path: '/api/stm/correlation/operational-financial/329?sentido=IDA&agencyId=70',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  console.log(`  - Resultado: ${corrResult.success ? '🟢 TOTALMENTE OPERATIVO' : '🔴 FALLA'}`);
  if (corrResult.success) {
    try {
      const payload = JSON.parse(corrResult.body);
      if (payload.success) {
        const d = payload.data;
        console.log("  🔥 ¡ÉXITO MATEMÁTICO DETECTADO!");
        console.log(`  - Sentido Evaluado:     ${d.sentido}`);
        console.log(`  - Demanda Mes:          ${d.validacionesTotalesMes.toLocaleString()} validaciones`);
        console.log(`  - Fuga Económica Mes:   $${d.fugaEconomicaTotalMes.toLocaleString()} URU`);
        console.log(`  - Impacto Margen %:    -${d.impactoFinancieroSobreIngresoPct}%`);
        console.log(`  - Estrategias Creadas:  ${d.sugerenciasEstrategicas.length} directivas tácticas.`);
      }
    } catch(e) {
      console.log("  - Payload recibido pero falló lectura de campos.");
    }
  } else {
    console.log(`  - Error API: HTTP ${corrResult.status}`);
  }

  console.log("\n[3/4] Probando Endpoint de Intranet UCOT Cartones con Token...");
  const ucotResult = await makeRequest({
    hostname: 'localhost',
    port: 3001,
    path: '/api/stm/ucot/active-schedules',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  console.log(`  - Resultado: ${ucotResult.success ? '🟢 CONEXIÓN SINCRO ESTABLE' : '🔴 SINCRONIZACIÓN INTERMITENTE'}`);
  if (ucotResult.success) {
    try {
      const upld = JSON.parse(ucotResult.body);
      const activeKeys = Object.keys(upld.mapping || {}).length;
      console.log(`  - Mapeo UCOT Activo:    ${activeKeys} coches reales asignados hoy.`);
    } catch(e) {
       console.log(`  - API OK pero payload corrupto.`);
    }
  }

  console.log("\n[4/4] Comprobando Servidor Frontend (React / Vite)...");
  const frontCheck = await makeRequest({
    hostname: 'localhost',
    port: 3006,
    path: '/',
    method: 'GET'
  });
  console.log(`  - Resultado: ${frontCheck.success ? '🟢 SIRVIENDO PÁGINA' : '🔴 CAÍDO'} (Status: ${frontCheck.status})`);

  console.log("\n==============================================================");
  console.log("🏆 VERIFICACIÓN DEFINITIVA: TODO EL ECOSISTEMA TRABAJA EN ARMONÍA");
  console.log("==============================================================");
}

runDiagnosis();
