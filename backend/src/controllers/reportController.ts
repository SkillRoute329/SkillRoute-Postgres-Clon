
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import PDFDocument from 'pdfkit';

const prisma = new PrismaClient();

export const generateShiftsReport = async (req: Request, res: Response) => {
    const { startDate, endDate, tenantId } = req.query;

    try {
        const where: any = {
            tenantId: Number(tenantId || 1), // Default tenant
        };

        if (startDate && endDate) {
            where.date = {
                gte: new Date(startDate as string),
                lte: new Date(endDate as string),
            };
        }

        const shifts = await prisma.shift.findMany({
            where,
            include: {
                category: true,
                transactions: true,
            },
            orderBy: { date: 'asc' }
        });

        const doc = new PDFDocument({ margin: 30, size: 'A4' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=reporte-turnos.pdf');

        doc.pipe(res);

        // Header
        doc.fontSize(18).text('Reporte de Turnos', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Fecha: ${new Date().toLocaleDateString()}`);
        if (startDate && endDate) {
            doc.text(`Periodo: ${startDate} - ${endDate}`);
        }
        doc.moveDown();

        // Table Header
        const tableTop = 150;
        const itemHeight = 20;

        let y = tableTop;

        doc.font('Helvetica-Bold');
        doc.text('Fecha', 30, y);
        doc.text('Ficha', 100, y);
        doc.text('Coche', 160, y);
        doc.text('Línea', 220, y);
        doc.text('Valor Total', 300, y);
        doc.text('TF Desc.', 400, y);
        doc.text('Neto', 480, y);

        doc.font('Helvetica');
        y += itemHeight;

        let grandTotal = 0;

        shifts.forEach(shift => {
            if (y > 750) {
                doc.addPage();
                y = 50;
            }

            const dateStr = new Date(shift.date).toLocaleDateString();
            const discount = Number(shift.transformaFacilDiscount);
            const total = Number(shift.totalValue);
            const net = total - discount;
            grandTotal += net;

            doc.text(dateStr, 30, y);
            doc.text(shift.serviceNumber, 100, y);
            doc.text(shift.carNumber, 160, y);
            doc.text(shift.line.substring(0, 10), 220, y);
            doc.text(total.toFixed(2), 300, y);
            doc.text(discount.toFixed(2), 400, y);
            doc.text(net.toFixed(2), 480, y);

            y += itemHeight;
        });

        doc.moveDown();
        doc.font('Helvetica-Bold').text(`Total General: $${grandTotal.toFixed(2)}`, { align: 'right' });

        doc.end();

    } catch (error) {
        console.error('Error calculating report:', error);
        res.status(500).json({ error: 'Error generating PDF report' });
    }
};
