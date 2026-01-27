"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const admin = __importStar(require("firebase-admin"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Local execution check
if (!admin.apps.length) {
    const serviceAccountPath = path.resolve(__dirname, '../../serviceAccountKey.json');
    if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }
    else {
        // Fallback or error
        console.warn("⚠️ No serviceAccountKey.json found. Ensure valid auth environment if running locally.");
        admin.initializeApp();
    }
}
const db = admin.firestore();
async function main() {
    console.log('🔥 FIREBASE: INICIANDO CERTIFICACIÓN DE PRODUCCIÓN (UCOT 2026) 🔥');
    // 1. Roles & Financial Config (Stored in 'config' or 'roles' collection)
    const rolesRef = db.collection('roles');
    await rolesRef.doc('Micrero').set({
        name: 'Micrero',
        baseSalary: 3550.00,
        extraHourValue: 900.00,
        description: 'Operador de Micrófono / Jefe de Coche'
    });
    await rolesRef.doc('Conductor').set({
        name: 'Conductor',
        baseSalary: 2700.00,
        extraHourValue: 700.00,
        description: 'Conductor Profesional'
    });
    console.log('✅ Roles Financieros Configurados (Firestore).');
    // 2. Generate 50 Users
    // Note: In strict Firebase, we create Auth Users separately. 
    // Here we simulate the "Firestore Profile" side.
    console.log('👥 Generando 50 Perfiles de Usuario...');
    const usersBatch = db.batch();
    const usersRef = db.collection('users');
    for (let i = 1; i <= 50; i++) {
        const internalStr = i.toString().padStart(3, '0');
        const isMicrero = i >= 40;
        const role = isMicrero ? 'Micrero' : 'Conductor';
        // ID strategy: use Internal Number as Doc ID for easy lookup, or auto-id
        // Let's use internalNumber as ID for uniqueness in this seed
        const userDoc = usersRef.doc(internalStr);
        usersBatch.set(userDoc, {
            tenantId: 1,
            internalNumber: internalStr,
            firstName: isMicrero ? `Micrero` : `Conductor`,
            lastName: `Prueba ${internalStr}`,
            fullName: isMicrero ? `Micrero Prueba ${internalStr}` : `Conductor Prueba ${internalStr}`,
            roleName: role,
            email: `usuario${internalStr}@ucot.example.com`,
            driverStatus: 'A_LA_ORDEN',
            createdAt: new Date().toISOString()
        });
        // Batches have limit 500
    }
    await usersBatch.commit();
    // 3. Create Fleet
    const fleetBatch = db.batch();
    const vehiclesRef = db.collection('vehicles');
    const fleetModels = ['Yutong ZK6128', 'Yutong E12 Pro', 'Marcopolo Gran Viale'];
    console.log('🚌 Generando Flota...');
    for (let i = 1000; i < 1020; i++) {
        const carDoc = vehiclesRef.doc(i.toString());
        fleetBatch.set(carDoc, {
            tenantId: 1,
            internalNumber: i.toString(),
            plate: `STP ${i}`,
            make: 'Yutong',
            model: fleetModels[i % 3],
            year: 2024,
            status: 'OPERATIONAL',
            shiftsCapacity: 3
        });
    }
    await fleetBatch.commit();
    console.log('✅ Certificación de Datos Completada (Firestore).');
    console.log('   - 50 Perfiles de Usuario creados.');
    console.log('   - 20 Vehículos creados.');
}
main().catch(console.error);
//# sourceMappingURL=seed_production_firestore.js.map