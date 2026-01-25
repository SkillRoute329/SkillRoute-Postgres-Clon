
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class TransportCoreService {

    /**
     * 1. Motor de Predicción Secuencial (Algoritmo de Rotación)
     * Determina qué servicio le toca a una unidad basándose en su historial.
     */
    static async predictNextService(tenantId: number, unitNumber: string, currentServiceCode: string, seasonId: number): Promise<string | null> {
        // En un esquema real, esto buscaría en `RotationScheme`.
        // Por ahora, simulamos lógica correlativa simple: Si es 1015, sigue 1016 (si existe en la definición de servicios)

        // Buscar servicio actual para obtener metadatos si fuera necesario
        const currentDef = await prisma.serviceDefinition.findFirst({
            where: { tenantId, seasonId, serviceCode: currentServiceCode }
        });

        if (!currentDef) return null;

        // Lógica simplificada: Incremento numérico (Placeholder para lógica compleja de grafo)
        const nextCodeInt = parseInt(currentServiceCode) + 1;
        const nextCode = nextCodeInt.toString().padStart(4, '0');

        // Validar que el siguiente servicio EXISTE en la temporada
        const nextDef = await prisma.serviceDefinition.findFirst({
            where: { tenantId, seasonId, serviceCode: nextCode }
        });

        return nextDef ? nextCode : null; // Si no existe, es fin de rotación o lógica especial
    }

    /**
     * 2. Regla de Seguridad: Gap de 45 Minutos (Correlativos)
     * Verifica que entre el fin del Turno A y el inicio del Turno B haya al menos 45 min.
     */
    static async validateReliefGap(tenantId: number, userId: number, newShiftStart: Date): Promise<{ valid: boolean; conflictReason?: string }> {
        // 1. Buscar último turno del usuario que termine antes de newShiftStart
        const lastShift = await prisma.shift.findFirst({
            where: {
                tenantId,
                assignedTo: userId,
                date: { // Asumiendo que date es la base, necesitaríamos concatenar fecha+hora real
                    // Simplificación: buscamos turnos del mismo día o día previo
                    lte: newShiftStart
                },
                // status: active...
            },
            orderBy: { date: 'desc' }, // Aproximación, idealmente ordenar por endTime calculado
            include: { category: true }
        });

        if (!lastShift || !lastShift.endTime) return { valid: true };

        // Construir Date objects reales
        // Nota: En production esto requiere parseo robusto de strings "HH:mm" vs Dates UTC
        const dateBase = lastShift.date;
        const [endHour, endMin] = lastShift.endTime.split(':').map(Number);

        const lastShiftEnd = new Date(dateBase);
        lastShiftEnd.setHours(endHour, endMin, 0, 0);

        // Diferencia en minutos
        const diffMs = newShiftStart.getTime() - lastShiftEnd.getTime();
        const diffMinutes = Math.floor(diffMs / 60000);

        if (diffMinutes < 45) {
            return {
                valid: false,
                conflictReason: `CONFLICTO_OPERATIVO: Descanso insuficiente (${diffMinutes} min < 45 min requeridos).`
            };
        }

        return { valid: true };
    }

    /**
     * 3. Validación de Capacidad de Flota
     * Verifica si asignar un coche respeta su tipo (Híbrido vs Convencional)
     */
    static async validateVehicleCapability(tenantId: number, serviceInternalId: string, vehicleId: number): Promise<boolean> {
        // Obtener requerimientos del servicio (Cartón)
        // Esto asume que ServiceDefinition tiene un campo de tipo requerido (agregado en ServiceDefinition: vehicleType)
        const service = await prisma.serviceDefinition.findFirst({
            where: { serviceCode: serviceInternalId, tenantId } // Simplificado
        });

        const vehicle = await prisma.vehicle.findUnique({
            where: { id: vehicleId },
            include: { fleetCategory: true }
        });

        if (!service || !vehicle) return false;

        // Regla: Si servicio requiere HIBRIDO, el coche debe ser HIBRIDO
        if (service.vehicleType === 'HIBRIDO' && vehicle.fleetCategory?.name !== 'HIBRIDO') {
            return false;
        }

        return true;
    }
}
