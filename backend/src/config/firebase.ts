/**
 * config/firebase.ts — Adaptador transparente del clon (AUTONOMO)
 * 
 * Este archivo NO inicializa Firebase real. Reemplaza el SDK original con
 * un stub para que los servicios que an importan `db` o `auth` fallen 
 * silenciosamente o sean atrapados por sus try/catch sin conectarse a la nube.
 * REGLA: 100% autnomo. Cero vinculacin con Google Cloud o Firebase.
 */

class MockDocRef {
  id: string;
  constructor(id: string) { this.id = id || 'mock-id'; }
  async get() { return { exists: false, data: () => ({}) }; }
  async set() {}
  async update() {}
  async delete() {}
  collection(path: string) { return new MockCollection(path); }
}

class MockCollection {
  path: string;
  constructor(path: string) { this.path = path; }
  doc(id?: string) { return new MockDocRef(id || 'mock-id'); }
  async get() { return { docs: [], empty: true, forEach: () => {} }; }
  async add() { return new MockDocRef('mock-id'); }
  where() { return this; }
  orderBy() { return this; }
  limit() { return this; }
}

export const db = {
  collection: (path: string) => new MockCollection(path),
  batch: () => ({
    set: () => {},
    update: () => {},
    delete: () => {},
    commit: async () => {},
  }),
} as any;

export const auth = {
  verifyIdToken: async () => { throw new Error('Firebase Auth is disabled in this autonomous clone.'); },
  getUser: async () => { throw new Error('Firebase Auth is disabled.'); },
  createUser: async () => { throw new Error('Firebase Auth is disabled.'); },
} as any;
