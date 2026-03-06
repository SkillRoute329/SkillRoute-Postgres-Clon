/**
 * @deprecated PROHIBICIÓN DE SIMULACIÓN (orden de proyecto).
 * No usar en producción. Los datos deben venir exclusivamente de Firestore, API o ingesta real (ucotMaster, Excel, GTFS).
 * Este adapter queda solo para referencia o tests aislados; ningún flujo de la app debe importarlo.
 */
// Mock Adapter for 'Zero-Changes' Simulation Mode - DEPRECATED

// We'll create a simple in-memory store
class SimulationStore {
  private memoryDb: Record<string, any[]> = {};
  private initialized = false;

  constructor() {
    this.memoryDb = {
      vehiculos: [],
      incidencias: [],
      users: [],
      service_matrices: [],
      shifts: [],
    };
  }

  async initialize() {
    if (this.initialized) return;
    console.log('🎮 [SIMULATION] Initializing Sandbox DB...');

    // Seed with GENESIS Data Structure (Hardcoded for stability)
    this.memoryDb['vehiculos'] = Array.from({ length: 20 }, (_, i) => ({
      id: (100 + i).toString(),
      internalNumber: (100 + i).toString(),
      matricula: `STU-${1000 + i}`,
      estado_operativo: i % 5 === 0 ? 'MANTENIMIENTO' : 'OPERATIVO',
      caracteristicas: { marca: 'Mercedes', modelo: 'O500' },
    }));

    this.memoryDb['incidencias'] = [
      {
        id: 'sim-1',
        type: 'Inspection',
        status: 'Closed',
        vehicle_id: '100',
        description: 'Simulated Inspection',
        timestamp: { seconds: Date.now() / 1000 },
      },
    ];

    this.memoryDb['service_matrices'] = [
      {
        id: 'sim-matrix-1',
        fileName: 'Matriz_Simulada_300.xlsx',
        uploadedAt: { seconds: Date.now() / 1000 },
        area: 'TRAFFIC',
        fileUrl: '#',
      },
    ];

    this.initialized = true;
  }

  // CRUD Mocks
  async get(collection: string) {
    await this.initialize();
    return this.memoryDb[collection] || [];
  }

  async add(collection: string, data: any) {
    await this.initialize();
    const doc = { id: `sim-${Date.now()}`, ...data };
    if (!this.memoryDb[collection]) this.memoryDb[collection] = [];
    this.memoryDb[collection].push(doc);
    console.log(`🎮 [SIMULATION] Added to ${collection}:`, doc);
    return { id: doc.id, ...data };
  }

  async update(collection: string, id: string, data: any) {
    await this.initialize();
    if (!this.memoryDb[collection]) return;
    const index = this.memoryDb[collection].findIndex((d) => d.id === id);
    if (index !== -1) {
      this.memoryDb[collection][index] = { ...this.memoryDb[collection][index], ...data };
      console.log(`🎮 [SIMULATION] Updated ${collection}/${id}`);
    }
  }
}

export const SimulationAdapter = new SimulationStore();
