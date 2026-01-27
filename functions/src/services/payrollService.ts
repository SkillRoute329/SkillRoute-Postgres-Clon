import { db } from '../config/firebase';

export class PayrollService {

    // Constants from "Uruguay 2026" Decree (Updated per Report)
    private static readonly VALUES = {
        BPC: 6864, // Base de Prestaciones y Contribuciones

        // Retention Rates
        BPS_RATE: 0.15, // 15%
        FONASA_RATE: 0.045, // 4.5% Standard
        FRL_RATE: 0.001, // 0.1% Fondo Reconversión Laboral
        MIN_INTANGIBLE_PERCENT: 0.35, // 35% of Nominal must remain untouched (Validation Rule)

        // Task-Based Daily Wages (Jornales)
        SALARY_MICRERO: 3550,
        SALARY_MANIOBRA: 2800,
        SALARY_CONDUCTOR: 2700,
        SALARY_GUARDA: 2500,

        // Surcharges (Recargos)
        SURCHARGE_HIGH: 900,
        SURCHARGE_MID: 700,
        SURCHARGE_LOW: 650
    };

    /**
     * Calculates the financial breakdown for a specific shift execution.
     * Logic: Gross = Base (Task) + Surcharge
     *        Net = Gross - Deductions (BPS, FONASA, FRL, IRPF)
     */
    static async calculateShiftSalary(userId: string, isExtra: boolean = false, manualRole?: string) {
        // 1. Fetch User Data
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) throw new Error("User not found");

        const user = userDoc.data();

        // 2. Determine Base Salary by Task (Role)
        let baseAmount = 0;
        // Priority: Manual Override > User Assigned Role > Fallback Conductor
        const roleName = manualRole || user?.roleName || 'Conductor';
        const normalizedRole = roleName.toLowerCase();

        if (normalizedRole.includes('micrero')) {
            baseAmount = this.VALUES.SALARY_MICRERO;
        } else if (normalizedRole.includes('maniobra')) {
            baseAmount = this.VALUES.SALARY_MANIOBRA;
        } else if (normalizedRole.includes('guarda')) {
            baseAmount = this.VALUES.SALARY_GUARDA;
        } else {
            baseAmount = this.VALUES.SALARY_CONDUCTOR;
        }

        // 3. Apply Surcharges
        let surcharge = 0;
        if (isExtra) {
            // Defaulting to High for now, logic can be refined if we know it's Sunday vs Holiday
            surcharge = this.VALUES.SURCHARGE_HIGH;
        }

        const grossTotal = baseAmount + surcharge;

        // 4. Calculate Deductions
        let totalDeductions = 0;
        const deductionDetails: any[] = [];

        // 4a. BPS (15%)
        const bps = grossTotal * this.VALUES.BPS_RATE;
        totalDeductions += bps;
        deductionDetails.push({ name: 'BPS (15%)', amount: bps });

        // 4b. FONASA (4.5%)
        const fonasa = grossTotal * this.VALUES.FONASA_RATE;
        totalDeductions += fonasa;
        deductionDetails.push({ name: 'FONASA (4.5%)', amount: fonasa });

        // 4c. FRL (0.1%)
        const frl = grossTotal * this.VALUES.FRL_RATE;
        totalDeductions += frl;
        deductionDetails.push({ name: 'FRL (0.1%)', amount: frl });

        // 4d. IRPF (Projection)
        // Rule: If Monthly Projection > 7 BPC ($48,048), apply retention.
        // We assume 25 shifts/month for projection.
        const projectedMonthly = grossTotal * 25;
        const irpfThreshold = 7 * this.VALUES.BPC;

        if (projectedMonthly > irpfThreshold) {
            // Simplified progressive scale entry point (approx 10% on excess)
            // This is an estimation for daily accrual. Real IRPF is monthly.
            const excess = projectedMonthly - irpfThreshold;
            const monthlyIrpf = excess * 0.10; // 10% on the excess
            const dailyIrpf = monthlyIrpf / 25;

            totalDeductions += dailyIrpf;
            deductionDetails.push({ name: 'IRPF (Est. Diario)', amount: dailyIrpf });
        }

        // 4e. Intangible Safeguard
        // The deductions cannot exceed 65% of the gross (Employee must receive at least 35%)
        // Usually applies to credit deductions, but good to track.
        const maxDeduction = grossTotal * (1 - this.VALUES.MIN_INTANGIBLE_PERCENT);
        // Note: Legal taxes usually override this, but credit deductions don't.

        const netSalary = grossTotal - totalDeductions;

        return {
            grossTotal,
            netSalary,
            breakdown: {
                base: baseAmount,
                surcharge,
                deductions: deductionDetails
            },
            meta: {
                roleApplied: roleName,
                isIntangibleSafe: netSalary >= (grossTotal * this.VALUES.MIN_INTANGIBLE_PERCENT),
                maxDeductionAllowed: maxDeduction
            }
        };
    }

    /**
     * Accrues the salary to the user's account (Transaction in Firestore).
     */
    static async accrueSalary(shiftId: string, userId: string, extraHours: number) {
        if (!shiftId || !userId) return;

        // Calculate
        const financials = await this.calculateShiftSalary(userId, extraHours > 0);

        // Record Transaction (Credit to Employee)
        const transactionRef = db.collection('transactions').doc();
        await transactionRef.set({
            shiftId: shiftId,
            userId: userId,
            type: 'ACCRUAL_SALARY',
            amount: financials.netSalary,
            transactionDate: new Date().toISOString(),
            financials: financials
        });

        // Update Shift Metadata
        await db.collection('shifts').doc(shiftId).update({
            'metadata.financials': financials,
            'isAccrued': true
        });

        return financials;
    }
}
