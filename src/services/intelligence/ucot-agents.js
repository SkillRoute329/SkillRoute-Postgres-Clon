/**
 * UCOT AGENTS — Agentes Autónomos de Inteligencia Competitiva
 * Cada agente monitorea una línea UCOT cada 10 segundos
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// ─── Firebase Admin (usa credenciales del entorno) ─────────────────────────
let db = null;
try {
  const serviceAccount = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? require(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : null;

  initializeApp(
    serviceAccount ? { credential: cert(serviceAccount) } : undefined
  );
  db = getFirestore();
  console.log('✅ Firebase Admin conectado');
} catch (err) {
  console.warn('⚠️  Firebase Admin no disponible — eventos solo en consola:', err.message);
}

const BRIDGE = 'http://localhost:3099';
const MAX_HISTORIAL = 30;
const INTERVAL_MS = 10_000;

// ─── LineAgent ─────────────────────────────────────────────────────────────
class LineAgent {
  constructor(linea, sublinea = '') {
    this.linea = linea;
    this.sublinea = sublinea;
    this.historial = [];
    this.intervalId = null;
    this.ultimoNivelAlerta = null;
    this.ultimasEmpresas = new Set();
  }

  iniciar() {
    console.log(`🤖 Agente línea ${this.linea} iniciado`);
    this.tick(); // primer tick inmediato
    this.intervalId = setInterval(() => this.tick(), INTERVAL_MS);
    return this;
  }

  detener() {
    if (this.intervalId) clearInterval(this.intervalId);
    console.log(`🛑 Agente línea ${this.linea} detenido`);
  }

  async tick() {
    try {
      const res = await fetch(`${BRIDGE}/api/analysis/${this.linea}`);
      if (!res.ok) return;
      const snap = await res.json();

      // Guardar historial (max 30)
      this.historial.push(snap);
      if (this.historial.length > MAX_HISTORIAL) {
        this.historial.shift();
      }

      // CONSULTA ADICIONAL: Telemetría de los buses de esta línea
      for (const bus of snap.alertas || []) {
        const telRes = await fetch(`${BRIDGE}/api/telemetry/${bus.busUcot.codigoBus}`);
        const telData = await telRes.json();
        bus.busUcot.telemetry = telData.telemetry;
      }

      this.evaluar(snap);
    } catch (err) {
      console.error(`Error en tick agente ${this.linea}:`, err.message);
    }
  }

  evaluar(snap) {
    const nivel = snap.resumen?.nivelAlerta;
    const empresas = new Set(snap.resumen?.empresasDetectadas || []);

    // 1. Detectar cambio de nivel de alerta competitiva
    if (nivel && nivel !== this.ultimoNivelAlerta) {
      this.emitirEvento('CAMBIO_NIVEL_ALERTA', {
        nivelAnterior: this.ultimoNivelAlerta,
        nivelNuevo: nivel,
        pctFlotaEnDisputa: snap.resumen?.pctFlotaEnDisputa,
      });
      this.ultimoNivelAlerta = nivel;
    }

    // 2. Monitoreo del Mechanic Agent (Telemetría)
    for (const alerta of snap.alertas || []) {
      const tel = alerta.busUcot.telemetry;
      if (tel && tel.status === 'WARNING_OVERHEAT') {
        this.emitirEvento('ALERTA_MECANICA_CRITICA', {
          busId: alerta.busUcot.codigoBus,
          motorTemp: tel.engineTemp,
          recomendacion: "Retirar unidad de servicio inmediatamente o reducir RPM"
        });
      }
    }

    // 3. Detectar nuevas empresas competidoras
    for (const emp of empresas) {
      if (!this.ultimasEmpresas.has(emp)) {
        this.emitirEvento('NUEVA_EMPRESA_DETECTADA', {
          empresa: emp,
          nivel,
        });
      }
    }
    this.ultimasEmpresas = empresas;
  }

  async emitirEvento(tipo, payload) {
    const evento = {
      tipo,
      linea: this.linea,
      sublinea: this.sublinea,
      timestamp: new Date().toISOString(),
      ...payload,
    };

    console.log(`📡 [${this.linea}] ${tipo}:`, JSON.stringify(payload));

    if (db) {
      try {
        await db.collection('eventos_competencia').add(evento);
      } catch (err) {
        console.error('Error guardando evento en Firestore:', err.message);
      }
    }
  }
}

// ─── UCOTAgentOrchestrator ─────────────────────────────────────────────────
class UCOTAgentOrchestrator {
  constructor() {
    this.agentes = new Map();
  }

  async iniciarTodos() {
    try {
      const res = await fetch(`${BRIDGE}/api/lines/ucot`);
      const data = await res.json();

      if (!data.ok || !data.lineas?.length) {
        console.warn('⚠️  No hay líneas UCOT activas en este momento');
        return;
      }

      console.log(`\n🎯 Iniciando agentes para ${data.lineas.length} líneas UCOT...`);

      for (const linea of data.lineas) {
        const agente = new LineAgent(linea.linea, linea.sublinea || '');
        this.agentes.set(linea.linea, agente);
        agente.iniciar();

        // Pequeño delay entre arranques para no saturar el bridge
        await new Promise((r) => setTimeout(r, 200));
      }

      console.log(`✅ ${this.agentes.size} agentes activos\n`);
    } catch (err) {
      console.error('❌ Error iniciando orquestador:', err.message);
    }
  }

  detenerTodos() {
    for (const agente of this.agentes.values()) {
      agente.detener();
    }
    this.agentes.clear();
  }

  resumenGeneral() {
    const resultados = [];

    for (const agente of this.agentes.values()) {
      const ultimoSnap = agente.historial[agente.historial.length - 1];
      if (ultimoSnap?.resumen) {
        resultados.push({
          linea: agente.linea,
          sublinea: agente.sublinea,
          ...ultimoSnap.resumen,
          snapshots: agente.historial.length,
        });
      }
    }

    // Ordenar por % en disputa de mayor a menor
    return resultados.sort((a, b) => b.pctFlotaEnDisputa - a.pctFlotaEnDisputa);
  }
}

module.exports = { LineAgent, UCOTAgentOrchestrator };

// ─── ENTRY POINT — ejecutar directamente ──────────────────────────────────
if (require.main === module) {
  const orquestador = new UCOTAgentOrchestrator();
  orquestador.iniciarTodos();

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n👋 Deteniendo agentes...');
    orquestador.detenerTodos();
    process.exit(0);
  });
}
