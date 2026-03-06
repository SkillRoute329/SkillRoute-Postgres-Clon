/**
 * Verifica que el login 329/admin123 funcione en el navegador.
 * Uso: node scripts/verificar-login.js
 * Requiere: backend y frontend en marcha (npm start o ambos por separado).
 */
const http = require('http');

function request(method, url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname,
        method,
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      },
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('1. Health backend 3001...');
  try {
    const health = await request('GET', 'http://localhost:3001/api/health');
    if (health.status !== 200) throw new Error('Health ' + health.status);
    console.log('   OK');
  } catch (e) {
    console.log('   FALLO:', e.message);
    console.log('   Arranca el backend: cd backend && npm run dev');
    process.exit(1);
  }

  console.log('2. Login 329 / admin123 en backend...');
  try {
    const login = await request('POST', 'http://localhost:3001/api/auth/login', {
      internalNumber: '329',
      password: 'admin123',
    });
    if (login.status !== 200) throw new Error(login.body?.error || login.status);
    if (login.body?.user?.role !== 'SuperAdmin') throw new Error('Rol no es SuperAdmin');
    console.log('   OK ->', login.body.user.fullName, login.body.user.role);
  } catch (e) {
    console.log('   FALLO:', e.message);
    process.exit(1);
  }

  console.log('3. Login vía frontend (proxy 5173)...');
  try {
    const login2 = await request('POST', 'http://localhost:5173/api/auth/login', {
      internalNumber: '329',
      password: 'admin123',
    });
    if (login2.status !== 200) throw new Error(login2.body?.error || login2.status);
    console.log('   OK ->', login2.body.user.role);
  } catch (e) {
    console.log('   FALLO:', e.message);
    console.log('   Arranca el frontend: cd frontend && npm run dev');
    process.exit(1);
  }

  console.log(
    '\nTodo correcto. Entra en http://localhost:5173 con usuario 329 y contraseña admin123',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
