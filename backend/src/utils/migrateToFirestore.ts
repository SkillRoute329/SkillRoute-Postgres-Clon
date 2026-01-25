
import admin, { db } from '../config/firebase';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * UTILIDAD DE MIGRACIÓN: SQL -> NO-SQL (Firestore)
 * Prioridad: Reportes e Inspectores
 */
export async function migrateCriticalData() {
    console.log('🚀 Iniciando Migración a Firestore...');

    // 1. MIGRAR INSPECCIONES (Relacionado con Inspectores)
    console.log('🔄 Migrando Inspecciones...');
    const inspections = await prisma.inspection.findMany({
        include: {
            user: true,
            vehicle: true,
            damages: true
        },
        take: 100 // Límite por seguridad en prueba
    });

    const batch = db.batch();
    let count = 0;

    for (const insp of inspections) {
        const docRef = db.collection('inspections').doc(insp.id.toString());

        batch.set(docRef, {
            id: insp.id,
            date: insp.createdAt.toISOString(),
            inspector: {
                id: insp.user.id,
                name: insp.user.fullName,
                internalNumber: insp.user.internalNumber
            },
            vehicle: {
                id: insp.vehicle.id,
                number: insp.vehicle.internalNumber
            },
            status: insp.status,
            odometer: insp.odometer,
            fuelLevel: insp.fuelLevel,
            damages: insp.damages.map(d => ({
                zone: d.zone,
                description: d.description,
                photoUrl: d.photoUrl
            }))
        });

        count++;
        if (count >= 400) { // Firestore batch limit is 500
            await batch.commit();
            console.log('📦 Batch guardado...');
            count = 0;
        }
    }

    if (count > 0) await batch.commit();
    console.log(`✅ ${inspections.length} Inspecciones migradas.`);

    // 2. MIGRAR REPORTES (Maintenance)
    console.log('🔄 Migrando Reportes de Mantenimiento...');
    const reports = await prisma.maintenanceReport.findMany({
        include: { vehicle: true, reportedBy: true },
        take: 100
    });

    const batchReports = db.batch();
    count = 0;

    for (const rep of reports) {
        const docRef = db.collection('maintenance_reports').doc(rep.id.toString());

        batchReports.set(docRef, {
            id: rep.id,
            title: rep.title,
            description: rep.description,
            priority: rep.priority,
            status: rep.status,
            vehicle: rep.vehicle.internalNumber,
            reporter: rep.reportedBy.fullName,
            evidence: rep.evidencePhotos, // Simplificación, en DB es string
            createdAt: rep.createdAt.toISOString()
        });
        count++;
    }

    if (count > 0) await batchReports.commit();
    console.log(`✅ ${reports.length} Reportes migrados.`);

    console.log('🏁 Migración Finalizada.');
}

if (require.main === module) {
    migrateCriticalData()
        .catch(console.error)
        .finally(async () => await prisma.$disconnect());
}
