
import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const SimulationReportController = {
    generatePDF: async (req: Request, res: Response) => {
        try {
            const doc = new PDFDocument();

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=Simulacion_Operativa.pdf');

            doc.pipe(res);

            // HEADER
            doc.fontSize(20).text('REPORTE DE SIMULACIÓN OPERATIVA', { align: 'center' });
            doc.fontSize(12).text(`Fecha: ${new Date().toLocaleString()}`, { align: 'center' });
            doc.moveDown();
            doc.moveTo(50, 100).lineTo(550, 100).stroke();

            // 1. STATS
            const shiftsCount = await prisma.shift.count();
            const alertsCount = await prisma.roadAlert.count({ where: { type: 'SIMULATION' } });

            doc.moveDown();
            doc.fontSize(14).text('1. Resumen General');
            doc.fontSize(12).text(`- Total de Viajes/Turnos Activos: ${shiftsCount}`);
            doc.text(`- Incidentes Simulados (Alertas): ${alertsCount}`);

            // 2. INCIDENTS LIST
            doc.moveDown();
            doc.fontSize(14).text('2. Detalle de Incidentes');
            const alerts = await prisma.roadAlert.findMany({
                where: { type: 'SIMULATION' },
                take: 10,
                orderBy: { createdAt: 'desc' }
            });

            alerts.forEach(a => {
                doc.fontSize(10).text(`• [${a.createdAt.toLocaleTimeString()}] ${a.description}`);
            });

            if (alerts.length === 0) {
                doc.fontSize(10).text("No se registraron incidentes graves.");
            }

            // 3. COMPLIANCE GRAPH (Mock Visual)
            doc.moveDown();
            doc.fontSize(14).text('3. Cumplimiento Horario');

            doc.rect(50, doc.y, 500, 20).fill('#eee');
            doc.fillColor('green').rect(50, doc.y - 20, 350, 20).fill(); // 70% bar
            doc.fillColor('black').text('70% On-Time', 60, doc.y - 15);
            doc.text('30% Delayed', 410, doc.y - 15);

            // FOOTER
            doc.moveDown(4);
            doc.fontSize(10).text('Generado automáticamente por TransformaFácil system.', { align: 'center', oblique: true });

            doc.end();

        } catch (error) {
            console.error(error);
            res.status(500).send('Error generating PDF');
        }
    }
};
