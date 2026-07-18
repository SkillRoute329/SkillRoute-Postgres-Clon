"use strict";
/**
 * config/firebase.ts — Adaptador transparente del clon (AUTONOMO)
 *
 * Este archivo NO inicializa Firebase real. Reemplaza el SDK original con
 * un stub para que los servicios que an importan `db` o `auth` fallen
 * silenciosamente o sean atrapados por sus try/catch sin conectarse a la nube.
 * REGLA: 100% autnomo. Cero vinculacin con Google Cloud o Firebase.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = exports.db = void 0;
class MockDocRef {
    constructor(id) { this.id = id || 'mock-id'; }
    async get() { return { exists: false, data: () => ({}) }; }
    async set() { }
    async update() { }
    async delete() { }
    collection(path) { return new MockCollection(path); }
}
class MockCollection {
    constructor(path) { this.path = path; }
    doc(id) { return new MockDocRef(id || 'mock-id'); }
    async get() { return { docs: [], empty: true, forEach: () => { } }; }
    async add() { return new MockDocRef('mock-id'); }
    where() { return this; }
    orderBy() { return this; }
    limit() { return this; }
}
exports.db = {
    collection: (path) => new MockCollection(path),
    batch: () => ({
        set: () => { },
        update: () => { },
        delete: () => { },
        commit: async () => { },
    }),
};
exports.auth = {
    verifyIdToken: async () => { throw new Error('Firebase Auth is disabled in this autonomous clone.'); },
    getUser: async () => { throw new Error('Firebase Auth is disabled.'); },
    createUser: async () => { throw new Error('Firebase Auth is disabled.'); },
};
