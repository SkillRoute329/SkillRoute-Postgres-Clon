// E2E del bus de propagación: abre socket al backend, dispara una ausencia
// en /api/listero/ausencia y verifica que lleguen los eventos al cliente.
const { io } = require('socket.io-client');
const http = require('http');

const BACKEND = 'http://127.0.0.1:3001';

async function login() {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${BACKEND}/api/auth/login`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            resolve(j.data?.token || j.token || '');
          } catch (e) { reject(e); }
        });
      },
    );
    req.on('error', reject);
    req.write(JSON.stringify({ internalNumber: '329', password: 'Skill329' }));
    req.end();
  });
}

async function postAusencia(tok) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      conductorId: 'conductor-test-bus',
      conductorNombre: 'Test Bus',
      fecha: new Date().toISOString().slice(0, 10),
      motivo: 'ausencia_injustificada',
    });
    const req = http.request(
      `${BACKEND}/api/listero/ausencia`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Authorization: `Bearer ${tok}`,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  const tok = await login();
  if (!tok) {
    console.log('LOGIN FAIL');
    process.exit(1);
  }
  console.log('Login OK · token len=' + tok.length);

  const socket = io(BACKEND, {
    transports: ['websocket', 'polling'],
    auth: { token: tok, user: { id: '329', internalNumber: '329', fullName: 'Test', role: 'SuperAdmin' } },
  });

  const eventos = [];
  const interestingEvents = ['bus:cascade:summary', 'bus:operation:any', 'bus:operation:ausencia', 'bus:db:any'];

  socket.on('connect', () => {
    console.log('Socket conectado · id=' + socket.id);
  });
  for (const e of interestingEvents) {
    socket.on(e, (data) => {
      eventos.push({ event: e, ts: new Date().toISOString().slice(11, 19), data });
    });
  }
  socket.on('connect_error', (e) => console.log('socket err:', e?.message?.slice(0, 100)));

  await new Promise((r) => setTimeout(r, 1500));

  console.log('\n>>> Disparo POST /api/listero/ausencia');
  const r = await postAusencia(tok);
  console.log('   status=' + r.status + ' · body=' + r.body.slice(0, 100));

  // Esperar 4s para captura
  await new Promise((r) => setTimeout(r, 4000));

  console.log('\n═══ Eventos del bus recibidos: ' + eventos.length + ' ═══');
  for (const e of eventos) {
    const tipo = e.data?.evento?.tipo ?? e.data?.tipo ?? e.data?.collection ?? '';
    const efectos = e.data?.efectos?.length;
    const sev = e.data?.resumen?.severidadGlobal;
    const det = [tipo, efectos ? efectos + ' efectos' : '', sev ? 'sev=' + sev : ''].filter(Boolean).join(' · ');
    console.log(`  [${e.ts}] ${e.event}  ${det}`);
  }

  socket.disconnect();
  process.exit(0);
})().catch((e) => { console.log('FATAL', String(e).slice(0, 200)); process.exit(1); });
