import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const PdfService = {
    generateBoletinOficial: (data: any[], seasonName: string = 'VERANO 2026', dayType: string = 'HÁBIL') => {
        const doc = new jsPDF();

        // Metadata
        const now = new Date();
        const dateStr = format(now, "dd 'de' MMMM 'de' yyyy, HH:mm", { locale: es });

        // --- Header ---
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text("TRANSFORMA - BOLETÍN DE SERVICIOS", 105, 20, { align: 'center' });

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Emisión: ${dateStr}`, 105, 28, { align: 'center' });

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`TEMPORADA: ${seasonName}  |  TIPO DE DÍA: ${dayType}`, 14, 40);

        // --- Table Data Preparation ---
        // Expected data columns: Línea, Servicio, Hora Salida, Coche/Tipo, Notas
        const tableBody = data.map(item => [
            item.line || '---',
            item.serviceNumber || item.serviceCode || '???',
            item.startTime || '00:00',
            item.vehicleType || 'Estándar', // Mapping 'vehicleType' to usage
            item.variant || '', // Using variant/title as notes or description
            // Driver column left blank/placeholder as this is usually planning data
            ''
        ]);

        // --- Table Generation ---
        autoTable(doc, {
            startY: 45,
            head: [['Línea', 'Servicio', 'Hora Salida', 'Tipo Coche', 'Variante / Recorrido', 'Chofer Asignado']],
            body: tableBody,
            theme: 'grid',
            styles: {
                font: 'helvetica',
                fontSize: 9,
                cellPadding: 3,
                textColor: [20, 20, 20],
                lineColor: [200, 200, 200],
                lineWidth: 0.1,
            },
            headStyles: {
                fillColor: [240, 240, 240], // Light gray header
                textColor: [0, 0, 0],       // Black text
                fontStyle: 'bold',
                halign: 'center'
            },
            columnStyles: {
                0: { halign: 'center', fontStyle: 'bold', cellWidth: 20 }, // Linea
                1: { halign: 'center', fontStyle: 'bold', cellWidth: 25 }, // Servicio
                2: { halign: 'center', cellWidth: 25 }, // Hora
                3: { halign: 'center', cellWidth: 30 }, // Coche
                4: { halign: 'left' },                  // Variante
                5: { halign: 'center', cellWidth: 40 }  // Chofer (space for writing)
            },
            alternateRowStyles: {
                fillColor: [252, 252, 252] // Very subtle stripe
            },
            // Footer (Page numbers)
            didDrawPage: function (_data) {
                // Header is static, but we can add footer here
                const pageCount = (doc.internal as any).getNumberOfPages();
                doc.setFontSize(8);
                doc.setTextColor(150);
                const footerText = `Documento generado automáticamente por TransForma Platform - Página ${pageCount}`;
                const pageSize = doc.internal.pageSize;
                const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
                doc.text(footerText, 14, pageHeight - 10);
            }
        });

        // Save
        const fileName = `Boletin_Servicios_${seasonName.replace(/\s+/g, '_')}_${dayType}_${format(now, 'yyyyMMdd')}.pdf`;
        doc.save(fileName);
    }
};
