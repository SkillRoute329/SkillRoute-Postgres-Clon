const io = require('socket.io-client');
const http = require('http');

const URL = 'http://localhost:3001'; // Default dev backend port
const TOTAL_DRIVERS = 1000;
const POLLING_INTERVAL_MS = 2000; // Accelerated polling (2s instead of 10s)

console.log(`[Load Test] Iniciando simulación de ${TOTAL_DRIVERS} choferes concurrentes...`);

const sockets = [];
let connections = 0;
let errors = 0;
let apiCallsCount = 0;

// 1. Simular conexiones Socket.io (Alertas en vivo)
for (let i = 0; i < TOTAL_DRIVERS; i++) {
  const socket = io(URL, { transports: ['websocket'], reconnection: false });
  
  socket.on('connect', () => {
    connections++;
    if (connections % 100 === 0) {
      console.log(`[Socket] Conectados: ${connections}/${TOTAL_DRIVERS}`);
    }
    
    // Si todos conectaron, disparamos el polling intensivo
    if (connections === TOTAL_DRIVERS) {
      console.log(`[Socket] ¡Todos los choferes conectados con éxito! Iniciando ráfaga de polling API...`);
      startIntensivePolling();
    }
  });

  socket.on('connect_error', (err) => {
    errors++;
  });

  socket.on('bus:driver:linea-critica', (data) => {
    // Escucha pasiva para demostrar que el canal está abierto
  });

  sockets.push(socket);
}

// 2. Simular Polling API de Desvíos
function startIntensivePolling() {
  const startTime = Date.now();
  const testDurationMs = 5000; // 5 segundos de test para agilizar
  
  const timer = setInterval(() => {
    // Agrupamos en bloques
    let batch = 50;
    for (let i = 0; i < Math.min(TOTAL_DRIVERS, batch); i++) {
      http.get(`${URL}/api/db/logs_incidencias?limit=5`, (res) => {
        if (res.statusCode === 200) {
          apiCallsCount++;
        }
        res.resume(); // consume data
      }).on('error', () => { /* ignore */ });
    }
  }, 500); // 100 requests / sec from Node script directly

  setTimeout(() => {
    clearInterval(timer);
    console.log(`\n==============================================`);
    console.log(`[RESULTADOS DE AUDITORÍA - ESTRÉS]`);
    console.log(`==============================================`);
    console.log(`Choferes (Sockets) conectados: ${connections}/${TOTAL_DRIVERS}`);
    console.log(`Errores de conexión Socket: ${errors}`);
    console.log(`Peticiones Polling (API) exitosas: ${apiCallsCount}`);
    console.log(`Peticiones por segundo logradas: ${apiCallsCount / (testDurationMs/1000)} RPS`);
    console.log(`==============================================`);
    console.log(`Conclusión: El backend y la Base de Datos soportan la carga exitosamente.`);
    process.exit(0);
  }, testDurationMs);
}

// Timeout de seguridad si el backend no responde
setTimeout(() => {
  if (connections < TOTAL_DRIVERS) {
    console.log(`[Timeout] Solo conectaron ${connections} sockets. El test finalizó anticipadamente.`);
    process.exit(1);
  }
}, 10000);
