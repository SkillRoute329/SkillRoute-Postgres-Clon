import { PrismaClient } from '@prisma/client';
import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns';

const prisma = new PrismaClient();

export const RotationService = {
    /**
     * Calculates what service a driver/vehicle should be doing on a given date.
     */
    getPlannedAssignment: async (tenantId: number, date: Date) => {
        // 1. Get all active seasons
        const seasons = await (prisma as any).season.findMany({
            where: { tenantId, isActive: true },
            include: { rotations: true, serviceDefinitions: true }
        });

        const assignments: any[] = [];

        // 2. Get all drivers... (Query unchanged)
        // Note: Sort drivers by internalNumber to ensure stable rotation order
        const drivers = await (prisma.user as any).findMany({
            where: { tenantId, driverType: 'FIXED', assignedVehicleId: { not: null }, isActive: true },
            orderBy: { internalNumber: 'asc' }, // Stability
            include: {
                assignedVehicle: {
                    include: { rotationScheme: true }
                },
                department: true,
                jobRole: true
            }
        });

        // Group drivers by vehicle to handle rotation logic correctly
        const vehiclesMap = new Map<number, any[]>();
        for (const d of (drivers as any[])) {
            const vid = (d as any).assignedVehicleId;
            if (!vehiclesMap.has(vid)) vehiclesMap.set(vid, []);
            vehiclesMap.get(vid)?.push(d);
        }

        for (const [vehicleId, vehicleDrivers] of vehiclesMap.entries()) {
            const vehicle = vehicleDrivers[0].assignedVehicle; // All share same vehicle
            if (!vehicle) continue;

            const season = seasons[0];
            if (!season) continue;

            const rotation = vehicle.rotationScheme || season.rotations[0];
            if (!rotation) continue;

            const sequence = JSON.parse(rotation.sequenceData);
            if (!sequence || sequence.length === 0) continue;

            // --- Rotation Logic ---
            const utcStart = new Date(Date.UTC(season.startDate.getUTCFullYear(), season.startDate.getUTCMonth(), season.startDate.getUTCDate()));
            const utcTarget = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

            const dayOffset = differenceInCalendarDays(utcTarget, utcStart);
            const busOffset = parseInt(vehicle.internalNumber) % rotation.cycleLength;
            const currentStepIndex = (dayOffset + busOffset) % rotation.cycleLength;
            const plannedService = sequence[currentStepIndex];

            if (plannedService) {
                const serviceDef = season.serviceDefinitions.find((sd: any) => sd.serviceNumber === plannedService.serviceNumber);

                // Check Driver Rotation Mode
                let features: any = {};
                try { features = JSON.parse(vehicle.features || '{}'); } catch (e) { }
                const mode = features.driverRotationMode || 'ALL_SAME';

                // Determine active drivers for this day
                let activeDrivers: any[] = [];

                if (mode === 'WEEKLY' || mode === 'BIWEEKLY') {
                    // Calculate week number (Simple implementation)
                    const onejan = new Date(date.getFullYear(), 0, 1);
                    const weekNum = Math.ceil((((date.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);

                    let rotationTick = weekNum;
                    if (mode === 'BIWEEKLY') {
                        rotationTick = Math.floor(weekNum / 2);
                    }

                    const driverIndex = rotationTick % vehicleDrivers.length;
                    activeDrivers = [vehicleDrivers[driverIndex]];
                } else {
                    // ALL_SAME or FIXED_TURNS
                    // If FIXED_TURNS, we assign all drivers. The order in assignments will match the order in vehicleDrivers (which is sorted by internalNumber).
                    // This implies Driver 1 gets the first 'slot' of the assignment (if duplicates are allowed) or they just both have it.
                    activeDrivers = vehicleDrivers;
                }

                const isRestDay = serviceDef &&
                    (serviceDef.line?.toUpperCase().includes('DESCANSA') ||
                        serviceDef.line?.toUpperCase().includes('PARALIZA') ||
                        plannedService.serviceNumber === 'FRANCO');

                // Create assignments for active drivers
                for (const driver of activeDrivers) {
                    if (isRestDay) {
                        // PROTOCOLO DESCANSA: Titular libre.
                        assignments.push({
                            id: `planned-franco-${driver.id}-${date.getTime()}`,
                            status: 'Draft', // Not 'Assigned' so it doesn't count as work
                            date: date,
                            serviceNumber: 'FRANCO',
                            carNumber: vehicle.internalNumber,
                            line: 'DESCANSA',
                            time: '00:00',
                            endTime: '23:59',
                            assigneeId: driver.id,
                            assigneeName: driver.fullName,
                            assigneeInternalNumber: driver.internalNumber,
                            isPlanned: true,
                            totalValue: 0,
                            metadata: { type: 'REST_DAY' }
                        });
                        continue;
                    }

                    assignments.push({
                        id: `planned-${driver.id}-${date.getTime()}`,
                        status: 'Assigned',
                        date: date,
                        serviceNumber: plannedService.serviceNumber,
                        carNumber: vehicle.internalNumber,
                        line: serviceDef?.line || 'N/A',
                        time: serviceDef?.startTime || '00:00',
                        endTime: serviceDef?.endTime || '00:00',
                        assigneeId: driver.id,
                        assigneeName: driver.fullName,
                        assigneeInternalNumber: driver.internalNumber,
                        assigneePhone: driver.phoneNumber,
                        isPlanned: true,
                        totalValue: 0
                    });
                }

                // GOD MODE: CRITICAL CONDITION (Inject Reserves)
                // If it's a Rest Day but we simulate high demand (mocked condition or specialized flag)
                // const isHighDemand = false; // We can't easily detect this without external input 
                // However, if the ServiceDefinition actually EXISTED (meaning there IS a schedule like '10:00 - 18:00') 
                // but it was marked as a rest day for the *Vehicle* rotation step, then we need a reserve.

                // Real Logic:
                // If the SERVICE (defined in DB) is valid (has times) but the Rotation Step says "DESCANSA" (because the CAR is resting),
                // then THE SERVICE IS ORPHANED. We must assign a Reserve.

                if (!isRestDay && activeDrivers.length === 0) {
                    // ORPHANED SERVICE (No driver in rotation logic matches)
                    // Inject "Banco de Reserva" (Placeholder)
                    assignments.push({
                        id: `orphan-${plannedService.serviceNumber}-${date.getTime()}`,
                        status: 'Open', // Needs assignment
                        date: date,
                        serviceNumber: plannedService.serviceNumber,
                        carNumber: vehicle.internalNumber, // The car is running, but no driver?
                        line: serviceDef?.line || 'N/A',
                        time: serviceDef?.startTime || '00:00',
                        assigneeName: 'VACANTE - REQUERIR RESERVA',
                        isPlanned: true,
                        isVacancy: true
                    });
                }
            }
        }

        return assignments;
    }
};
