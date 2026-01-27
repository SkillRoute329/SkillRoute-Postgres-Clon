
import { db } from '../config/firebase';
import { Request, Response } from 'express';
import { SALARY_SCALES } from '../utils/uruguayTaxEngine';
import * as XLSX from 'xlsx';
import moment from 'moment';

const PERSONNEL_COLLECTION = 'personnel';

// --- ADVANCED OPERATIONS ---

// 1. RECAMBIO DE SOCIO (Identity Transfer)
export const transferPartner = async (req: Request, res: Response) => {
    try {
        const { internalId, leavingReason } = req.body;
        const docRef = db.collection(PERSONNEL_COLLECTION).doc(String(internalId));

        await db.runTransaction(async (t) => {
            const doc = await t.get(docRef);
            if (!doc.exists) throw new Error("Socio no encontrado");

            const currentData = doc.data();

            // a. Archive current partner
            const historyRef = docRef.collection('history').doc(new Date().toISOString());
            t.set(historyRef, {
                ...currentData,
                archivedAt: new Date().toISOString(),
                leavingReason: leavingReason || 'Recambio Ordinario'
            });

            // b. Clean Identity & Financials, Keep Operational Config
            const emptyStructure = {
                fullName: 'VACANTE - A DEFINIR',
                email: '',
                phone: '',
                address: '',
                healthCardExpiration: null,
                drivingLicenseExpiration: null,
                monthlyAccrued: 0, // Reset financials
                // Keep Operational
                internalId: currentData?.internalId,
                role: currentData?.role, // Maintains defaults usually
                pactoRotacion: currentData?.pactoRotacion || 'ROTATIVO_15',
                assignedVehicle: currentData?.assignedVehicle || null,
                active: true, // Spot is active
                updatedAt: new Date().toISOString()
            };

            t.update(docRef, emptyStructure);
        });

        res.json({ message: 'Recambio de socio exitoso. Historial archivado.' });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// 2. DAILY WORK REGISTER (Simulates "End of Shift" Trigger)
export const registerDailyWork = async (req: Request, res: Response) => {
    try {
        const { internalId, taskType, isExtra, date } = req.body;

        // Resolve Value
        // taskType: 'MICRERO' | 'CONDUCTOR' | 'GUARDA' | 'MANIOBRA'
        const scale = (SALARY_SCALES as any)[taskType?.toUpperCase()] || { base: 0, extra: 0 };

        // const amountToAdd = ...
        // Interpretación: Si es "Extra", se paga EL RECARGO ADICIONAL AL BASE? O es un turno EXTRA completo?
        // Contexto UCOT: "Realiza un recargo" suele ser trabajo adicional.
        // Test A dice: "devengado suba $3.550 + $900". Implica Base + Extra si hizo ambas.
        // Asumiremos que el input dice qué componentes cobrar.
        // Simplificación para Test A: Se le pasa el monto total a sumar o se infiere.
        // Si `isExtra` es true, asumimos que es un turno que TIENE recargo (Base + Recargo).

        const amountToAdd = isExtra ? (scale.base + scale.extra) : scale.base;

        const docRef = db.collection(PERSONNEL_COLLECTION).doc(String(internalId));

        await db.runTransaction(async (t) => {
            const doc = await t.get(docRef);
            if (!doc.exists) throw new Error("Personal no encontrado");
            const data = doc.data();

            const currentAccrued = data?.monthlyAccrued || 0;
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
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// 3. STATS (Dashboard Ribbon)
export const getPersonnelStats = async (req: Request, res: Response) => {
    try {
        const snapshot = await db.collection(PERSONNEL_COLLECTION).where('active', '==', true).get();
        const employees = snapshot.docs.map(d => d.data());

        let totalAccrued = 0;
        let expiredHealth = 0;
        let expiredLicense = 0;
        const today = moment();

        employees.forEach((emp: any) => {
            totalAccrued += (emp.monthlyAccrued || 0);

            if (emp.healthCardExpiration && moment(emp.healthCardExpiration).isBefore(today.clone().add(15, 'days'))) {
                expiredHealth++;
            }
            if (emp.drivingLicenseExpiration && moment(emp.drivingLicenseExpiration).isBefore(today.clone().add(30, 'days'))) {
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
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// --- CRUD EXISTENTE (Mantenido) ---

export const getPersonnel = async (req: Request, res: Response) => {
    try {
        const snapshot = await db.collection(PERSONNEL_COLLECTION).orderBy('internalId').get();
        const list = snapshot.docs.map(doc => doc.data());
        res.json(list);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const createEmployee = async (req: Request, res: Response) => {
    try {
        const data = req.body;
        const docId = String(data.internalId);
        await db.collection(PERSONNEL_COLLECTION).doc(docId).set({
            ...data,
            monthlyAccrued: 0,
            status: data.status || 'POOL',
            active: true,
            createdAt: new Date().toISOString()
        });
        res.status(201).json({ message: 'Employee Created', id: docId });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const updateEmployee = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await db.collection(PERSONNEL_COLLECTION).doc(id as string).update({
            ...req.body,
            updatedAt: new Date().toISOString()
        });
        res.json({ message: 'Employee Updated' });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const simulatePayroll = async (req: Request, res: Response) => {
    try {
        const { internalId } = req.body;

        const doc = await db.collection(PERSONNEL_COLLECTION).doc(String(internalId)).get();
        if (!doc.exists) {
            res.status(404).json({ message: 'Empleado no encontrado' });
            return;
        }

        const employee = doc.data();
        const role = employee?.role || 'CONDUCTOR';

        // Use Real Accrued Logic if available, else simulation inputs
        // For this Simulator, let's use the 'monthlyAccrued' as Nominal

        const nominal = employee?.monthlyAccrued || 0;
        const liquidation = calculateLiquidationWithNominal(nominal, employee?.metadata);

        res.json({
            employee: {
                name: employee?.fullName,
                internalId: employee?.internalId,
                role
            },
            liquidation
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// Helper temporal para usar nominal directo
import { calculateLiquidation as _calcEngine, TAX_RATES, calculateIRPF, LiquidationResult } from '../utils/uruguayTaxEngine';
const calculateLiquidationWithNominal = (nominal: number, metadata: any = {}): LiquidationResult => {
    const bps = nominal * TAX_RATES.BPS;
    const frl = nominal * TAX_RATES.FRL;
    const fonasaRate = metadata.hasFamily ? 0.06 : 0.045;
    const fonasa = nominal * fonasaRate;
    const irpf = calculateIRPF(nominal);
    const totalDiscounts = bps + frl + fonasa + irpf;
    const liquid = nominal - totalDiscounts;

    return {
        nominal,
        discounts: { bps, fonasa, frl, irpf, other: 0, total: totalDiscounts },
        liquid,
        details: ['Cálculo basado en Devengado Real Acumulado']
    };
}

export const checkExpirations = async (req: Request, res: Response) => {
    try {
        await db.collection(PERSONNEL_COLLECTION).where('active', '==', true).get();
        res.json({ message: 'Endpoint moved to stats' });
    } catch (e) { }
};

export const exportPersonnel = async (req: Request, res: Response) => {
    try {
        const snapshot = await db.collection(PERSONNEL_COLLECTION).get();
        const data = snapshot.docs.map(d => d.data());

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, "Personal");

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=personal_rrhh.xlsx');
        res.send(buf);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
