const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const CLIENT_ID = process.env.IMM_CLIENT_ID;
const CLIENT_SECRET = process.env.IMM_CLIENT_SECRET;
const TOKEN_ENDPOINT = 'https://mvdapi-auth.montevideo.gub.uy/auth/realms/pci/protocol/openid-connect/token';
// URI extraído de la documentación técnica encontrada en el repositorio
const ZIP_URL = 'https://api.montevideo.gub.uy/api/transportepublico/buses/gtfs/static/latest/google_transit.zip';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("ERROR: Faltan credenciales en el archivo .env");
  process.exit(1);
}

console.log("🔐 Iniciando túnel seguro con credenciales IMM oficiales...");

async function getToken() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data).access_token);
        } else {
          reject(new Error(`Fallo Auth: ${res.statusCode} - ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function downloadFile(token) {
  console.log("🚀 Descargando el Catálogo Supremo (GTFS Oficial)...");
  const destPath = path.join('C:\\Users\\jonat\\Desktop\\PROYECTOS\\SkillRoute-Postgres-Remoto', 'google_transit.zip');
  const file = fs.createWriteStream(destPath);

  return new Promise((resolve, reject) => {
    https.get(ZIP_URL, {
      headers: { 'Authorization': `Bearer ${token}` }
    }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
         // Handle redirect si existe
         console.log("Redirecting to:", res.headers.location);
         https.get(res.headers.location, file2 => {
             file2.pipe(file);
             file.on('finish', () => { file.close(); resolve(destPath); });
         });
         return;
      }
      if (res.statusCode !== 200) {
         reject(new Error(`Fallo descarga: ${res.statusCode}`));
         return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    }).on('error', reject);
  });
}

(async () => {
  try {
    const token = await getToken();
    console.log("✅ Token obtenido exitosamente.");
    const path = await downloadFile(token);
    console.log(`🔥 DESCARGA EXITOSA: Guardado en ${path}`);
  } catch (e) {
    console.error("❌ CRITICAL ERROR:", e.message);
  }
})();
