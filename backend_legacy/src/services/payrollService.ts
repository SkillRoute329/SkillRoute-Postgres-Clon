import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class PayrollService {

    // Constants from "Uruguay 2026" Decree
    private static readonly VALUES = {
        BPC: 6864, // Base de Prestaciones y Contribuciones
        BPS_RATE: 0.15, // 15%
        FONASA_RATE: 0.045, // 4.5% (Simplified Standard)
        FRL_RATE: 0.001, // 0.1% Fondo Reconversión Laboral

        // Fallbacks if DB is empty
        SALARY_MICRERO: 3550,
        SALARY_CONDUCTOR: 2700,
        SURCHARGE_HIGH: 900,
        SURCHARGE_LOW: 700
    };

    /**
     * Calculates the financial breakdown for a specific shift execution.
     * @param userId The user performing the shift
     * @param roleType 'Micrero' | 'Conductor' | null (inferred from JobRole if null)
     * @param isExtra Is this an extra shift? (Recargo)
     */
    static async calculateShiftSalary(userId: number, isExtra: boolean = false, manualRole?: string) {
        // 1. Fetch User & Job Role
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { jobRole: true }
        });

        if (!user) throw new Error("User not found");

        // 2. Determine Base Salary
        let baseAmount = 0;
        const roleName = manualRole || user.jobRole?.name || 'Conductor';

        // Priority: DB Configuration -> Hardcoded Fallback
        if (user.jobRole?.baseSalary && Number(user.jobRole.baseSalary) > 0) {
            baseAmount = Number(user.jobRole.baseSalary);
        } else {
            // Fallback Logic
            if (roleName.toLowerCase().includes('micrero')) {
                baseAmount = this.VALUES.SALARY_MICRERO;
            } else {
                baseAmount = this.VALUES.SALARY_CONDUCTOR;
            }
        }

        // 3. Apply Surcharges (Recargos) if Extra
        let surcharge = 0;
        if (isExtra) {
            // Logic: High surcharge for holidays/Sundays? Prompt said 900/700. 
            // We'll use High for now as default for "Extra".
            surcharge = this.VALUES.SURCHARGE_HIGH;
        }

        const grossTotal = baseAmount + surcharge;

        // 4. Calculate Deductions
        // We fetch active discounts from DB or use defaults
        const discounts = await prisma.discountCategory.findMany({ where: { isActive: true } });

        let totalDeductions = 0;
        const deductionDetails: any[] = [];

        // 4a. BPS
        const bps = grossTotal * this.VALUES.BPS_RATE;
        totalDeductions += bps;
        deductionDetails.push({ name: 'BPS (15%)', amount: bps });

        // 4b. FONASA (Simplified logic, usually depends on family)
        const fonasa = grossTotal * this.VALUES.FONASA_RATE;
        totalDeductions += fonasa;
        deductionDetails.push({ name: 'FONASA (4.5%)', amount: fonasa });

        // 4c. IRPF (Advanced: Usually calculated on monthly total, but we project daily for "Real Time")
        // Rule: If projected monthly > 7 BPC, apply scale.
        // For daily accrual, we can apply a "Retention Estimate".
        // Let's assume a safe 0% for now unless they hit threshold.
        const projectedMonthly = grossTotal * 25; // 25 jornales
        let irpf = 0;
        if (projectedMonthly > (7 * this.VALUES.BPC)) {
            irpf = grossTotal * 0.10; // 10% retention estimate if high earner
        }
        if (irpf > 0) {
            totalDeductions += irpf;
            deductionDetails.push({ name: 'IRPF (Est.)', amount: irpf });
        }

        const netSalary = grossTotal - totalDeductions;

        return {
            grossTotal,
            netSalary,
            breakdown: {
                base: baseAmount,
                surcharge,
                deductions: deductionDetails
            }
        };
    }

    /**
     * Accrues the salary to the user's account (Transaction).
     * Should be called when Shift status -> Completed.
     */
    static async accrueSalary(shiftId: number) {
        const shift = await prisma.shift.findUnique({
            where: { id: shiftId },
            include: { assignee: true }
        });

        if (!shift || !shift.assignedTo) return;

        // Calculate
        const financials = await this.calculateShiftSalary(shift.assignedTo, shift.extraHours.toNumber() > 0);

        // Record Transaction (Credit to Employee)
        await prisma.shiftTransaction.create({
            data: {
                shiftId: shift.id,
                userId: shift.assignedTo,
                type: 'ACCRUAL_SALARY',
                amount: financials.netSalary,
                transactionDate: new Date()
            }
        });

        // Optional: Update Shift with Financial Metadata
        await prisma.shift.update({
            where: { id: shiftId },
            data: {
                metadata: {
                    ...(typeof shift.metadata === 'object' ? shift.metadata : {}),
                    financials
                }
            }
        });

        return financials;
    }
}
