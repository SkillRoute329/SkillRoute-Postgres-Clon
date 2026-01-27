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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportPersonnel = exports.checkExpirations = exports.simulatePayroll = exports.updateEmployee = exports.createEmployee = exports.getPersonnel = exports.getPersonnelStats = exports.registerDailyWork = exports.transferPartner = void 0;
const firebase_1 = require("../config/firebase");
const uruguayTaxEngine_1 = require("../utils/uruguayTaxEngine");
const XLSX = __importStar(require("xlsx"));
const moment_1 = __importDefault(require("moment"));
const PERSONNEL_COLLECTION = 'personnel';
// --- ADVANCED OPERATIONS ---
// 1. RECAMBIO DE SOCIO (Identity Transfer)
const transferPartner = async (req, res) => {
    try {
        const { internalId, leavingReason } = req.body;
        const docRef = firebase_1.db.collection(PERSONNEL_COLLECTION).doc(String(internalId));
        await firebase_1.db.runTransaction(async (t) => {
            const doc = await t.get(docRef);
            if (!doc.exists)
                throw new Error("Socio no encontrado");
            const currentData = doc.data();
            // a. Archive current partner
            const historyRef = docRef.collection('history').doc(new Date().toISOString());
            t.set(historyRef, Object.assign(Object.assign({}, currentData), { archivedAt: new Date().toISOString(), leavingReason: leavingReason || 'Recambio Ordinario' }));
            // b. Clean Identity & Financials, Keep Operational Config
            const emptyStructure = {
                fullName: 'VACANTE - A DEFINIR',
                email: '',
                phone: '',
                address: '',
                healthCardExpiration: null,
                drivingLicenseExpiration: null,
                monthlyAccrued: 0,
                // Keep Operational
                internalId: currentData === null || currentData === void 0 ? void 0 : currentData.internalId,
                role: currentData === null || currentData === void 0 ? void 0 : currentData.role,
                pactoRotacion: (currentData === null || currentData === void 0 ? void 0 : currentData.pactoRotacion) || 'ROTATIVO_15',
                assignedVehicle: (currentData === null || currentData === void 0 ? void 0 : currentData.assignedVehicle) || null,
                active: true,
                updatedAt: new Date().toISOString()
            };
            t.update(docRef, emptyStructure);
        });
        res.json({ message: 'Recambio de socio exitoso. Historial archivado.' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.transferPartner = transferPartner;
// 2. DAILY WORK REGISTER (Simulates "End of Shift" Trigger)
const registerDailyWork = async (req, res) => {
    try {
        const { internalId, taskType, isExtra, date } = req.body;
        // Resolve Value
        // taskType: 'MICRERO' | 'CONDUCTOR' | 'GUARDA' | 'MANIOBRA'
        const scale = uruguayTaxEngine_1.SALARY_SCALES[taskType === null || taskType === void 0 ? void 0 : taskType.toUpperCase()] || { base: 0, extra: 0 };
        // const amountToAdd = ...
        // Interpretación: Si es "Extra", se paga EL RECARGO ADICIONAL AL BASE? O es un turno EXTRA completo?
        // Contexto UCOT: "Realiza un recargo" suele ser trabajo adicional.
        // Test A dice: "devengado suba $3.550 + $900". Implica Base + Extra si hizo ambas.
        // Asumiremos que el input dice qué componentes cobrar.
        // Simplificación para Test A: Se le pasa el monto total a sumar o se infiere.
        // Si `isExtra` es true, asumimos que es un turno que TIENE recargo (Base + Recargo).
        const amountToAdd = isExtra ? (scale.base + scale.extra) : scale.base;
        const docRef = firebase_1.db.collection(PERSONNEL_COLLECTION).doc(String(internalId));
        await firebase_1.db.runTransaction(async (t) => {
            const doc = await t.get(docRef);
            if (!doc.exists)
                throw new Error("Personal no encontrado");
            const data = doc.data();
            const currentAccrued = (data === null || data === void 0 ? void 0 : data.monthlyAccrued) || 0;
            const newAccrued = currentAccrued + amountToAdd;
            t.update(docRef, {
                monthlyAccrued: newAccrued,
                lastWorkUpdate: new Date().toISOString()
            });
            // Log work entry (optional subcollection)
            const workRef = docRef.collection('work_log').doc();
            t.set(workRef, {
                date: date || new Date().toISOString(),
                taskType,
                isExtra,
                amount: amountToAdd,
                timestamp: new Date().toISOString()
            });
        });
        res.json({ message: 'Jornal registrado', added: amountToAdd });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.registerDailyWork = registerDailyWork;
// 3. STATS (Dashboard Ribbon)
const getPersonnelStats = async (req, res) => {
    try {
        const snapshot = await firebase_1.db.collection(PERSONNEL_COLLECTION).where('active', '==', true).get();
        const employees = snapshot.docs.map(d => d.data());
        let totalAccrued = 0;
        let expiredHealth = 0;
        let expiredLicense = 0;
        const today = (0, moment_1.default)();
        employees.forEach((emp) => {
            totalAccrued += (emp.monthlyAccrued || 0);
            if (emp.healthCardExpiration && (0, moment_1.default)(emp.healthCardExpiration).isBefore(today.clone().add(15, 'days'))) {
                expiredHealth++;
            }
            if (emp.drivingLicenseExpiration && (0, moment_1.default)(emp.drivingLicenseExpiration).isBefore(today.clone().add(30, 'days'))) {
                expiredLicense++;
            }
        });
        res.json({
            activeCount: employees.length,
            totalMonthlyInvestment: totalAccrued,
            alerts: {
                health: expiredHealth,
                license: expiredLicense
            }
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getPersonnelStats = getPersonnelStats;
// --- CRUD EXISTENTE (Mantenido) ---
const getPersonnel = async (req, res) => {
    try {
        const snapshot = await firebase_1.db.collection(PERSONNEL_COLLECTION).orderBy('internalId').get();
        const list = snapshot.docs.map(doc => doc.data());
        res.json(list);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getPersonnel = getPersonnel;
const createEmployee = async (req, res) => {
    try {
        const data = req.body;
        const docId = String(data.internalId);
        await firebase_1.db.collection(PERSONNEL_COLLECTION).doc(docId).set(Object.assign(Object.assign({}, data), { monthlyAccrued: 0, status: data.status || 'POOL', active: true, createdAt: new Date().toISOString() }));
        res.status(201).json({ message: 'Employee Created', id: docId });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.createEmployee = createEmployee;
const updateEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        await firebase_1.db.collection(PERSONNEL_COLLECTION).doc(id).update(Object.assign(Object.assign({}, req.body), { updatedAt: new Date().toISOString() }));
        res.json({ message: 'Employee Updated' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateEmployee = updateEmployee;
const simulatePayroll = async (req, res) => {
    try {
        const { internalId } = req.body;
        const doc = await firebase_1.db.collection(PERSONNEL_COLLECTION).doc(String(internalId)).get();
        if (!doc.exists) {
            res.status(404).json({ message: 'Empleado no encontrado' });
            return;
        }
        const employee = doc.data();
        const role = (employee === null || employee === void 0 ? void 0 : employee.role) || 'CONDUCTOR';
        // Use Real Accrued Logic if available, else simulation inputs
        // For this Simulator, let's use the 'monthlyAccrued' as Nominal
        const nominal = (employee === null || employee === void 0 ? void 0 : employee.monthlyAccrued) || 0;
        const liquidation = calculateLiquidationWithNominal(nominal, employee === null || employee === void 0 ? void 0 : employee.metadata);
        res.json({
            employee: {
                name: employee === null || employee === void 0 ? void 0 : employee.fullName,
                internalId: employee === null || employee === void 0 ? void 0 : employee.internalId,
                role
            },
            liquidation
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.simulatePayroll = simulatePayroll;
// Helper temporal para usar nominal directo
const uruguayTaxEngine_2 = require("../utils/uruguayTaxEngine");
const calculateLiquidationWithNominal = (nominal, metadata = {}) => {
    const bps = nominal * uruguayTaxEngine_2.TAX_RATES.BPS;
    const frl = nominal * uruguayTaxEngine_2.TAX_RATES.FRL;
    const fonasaRate = metadata.hasFamily ? 0.06 : 0.045;
    const fonasa = nominal * fonasaRate;
    const irpf = (0, uruguayTaxEngine_2.calculateIRPF)(nominal);
    const totalDiscounts = bps + frl + fonasa + irpf;
    const liquid = nominal - totalDiscounts;
    return {
        nominal,
        discounts: { bps, fonasa, frl, irpf, other: 0, total: totalDiscounts },
        liquid,
        details: ['Cálculo basado en Devengado Real Acumulado']
    };
};
const checkExpirations = async (req, res) => {
    try {
        await firebase_1.db.collection(PERSONNEL_COLLECTION).where('active', '==', true).get();
        res.json({ message: 'Endpoint moved to stats' });
    }
    catch (e) { }
};
exports.checkExpirations = checkExpirations;
const exportPersonnel = async (req, res) => {
    try {
        const snapshot = await firebase_1.db.collection(PERSONNEL_COLLECTION).get();
        const data = snapshot.docs.map(d => d.data());
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, "Personal");
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=personal_rrhh.xlsx');
        res.send(buf);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.exportPersonnel = exportPersonnel;
//# sourceMappingURL=personnelController.js.map