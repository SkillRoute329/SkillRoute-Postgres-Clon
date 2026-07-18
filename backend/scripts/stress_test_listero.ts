import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001/api/listero';
// Dummy tokens for simulation. In reality, would need real tokens.
// For testing the load, we might need a backdoor or just hit a public endpoint, 
// or sign some tokens. Let's create a helper to sign a token if JWT_SECRET is present.
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });
const SECRET = process.env.JWT_SECRET || 'skillroute_super_secret_dev_2026';

function generateToken(userId: number, agencyId: string = '70') {
  return jwt.sign({ id: userId.toString(), role: 'DRIVER', agencyId, fullName: `Conductor ${userId}` }, SECRET, { expiresIn: '1h' });
}

const TOTAL_USERS = 1000;

async function simulateUser(userId: number) {
  const token = generateToken(userId);
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const actions = [];
  
  // 1. Fetch Schedule/Shifts (Listero endpoint might not have this per user, but let's query the turnos)
  actions.push(
    fetch(`${BASE_URL}/turnos?fecha=2026-07-17`, { headers })
      .then(res => res.json())
  );

  // 2. Submit a request ("papelito")
  const payload = {
    tipoSolicitud: 'correlativo',
    fechaObjetivo: '2026-07-18',
    turnoObjetivo: 'Mañana',
    cocheObjetivo: `${100 + (userId % 50)}`, // some random bus
    notas: 'Prueba de carga'
  };

  actions.push(
    fetch(`${BASE_URL}/solicitudes`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    }).then(res => res.json())
  );

  const results = await Promise.all(actions);
  return results;
}

async function run() {
  console.log(`Starting stress test with ${TOTAL_USERS} simulated drivers...`);
  const startTime = Date.now();
  let successCount = 0;
  let errorCount = 0;
  const errors: any = {};

  // Batch to avoid maxing out sockets instantly
  const BATCH_SIZE = 50; 
  for (let i = 0; i < TOTAL_USERS; i += BATCH_SIZE) {
    const promises = [];
    for (let j = 0; j < BATCH_SIZE && (i + j) < TOTAL_USERS; j++) {
      promises.push(
        simulateUser(i + j).then(res => {
          // res is array of [turnosRes, solicitudRes]
          res.forEach(r => {
            if (r.ok) successCount++;
            else {
              errorCount++;
              const msg = r.error || r.message || JSON.stringify(r);
              errors[msg] = (errors[msg] || 0) + 1;
            }
          });
        }).catch(err => {
          errorCount++;
          const msg = err.message || 'Unknown error';
          errors[msg] = (errors[msg] || 0) + 1;
        })
      );
    }
    await Promise.all(promises);
    console.log(`Progress: ${Math.min(i + BATCH_SIZE, TOTAL_USERS)} / ${TOTAL_USERS}`);
  }

  const duration = (Date.now() - startTime) / 1000;
  console.log(`\nTest completed in ${duration}s`);
  console.log(`Successful actions: ${successCount}`);
  console.log(`Failed actions: ${errorCount}`);
  
  if (errorCount > 0) {
    console.log('\nError summary:');
    console.dir(errors);
  }
}

run();
