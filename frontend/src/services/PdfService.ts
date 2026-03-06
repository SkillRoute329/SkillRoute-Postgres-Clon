import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import QRCode from 'qrcode';

export const PdfService = {
  generateBoletinOficial: async (
    data: any[],
    seasonName: string = 'VERANO 2026',
    dayType: string = 'HÁBIL',
  ) => {
    const doc = new jsPDF();

    // Metadata
    const now = new Date();
    const dateStr = format(now, "dd 'de' MMMM 'de' yyyy, HH:mm", { locale: es });

    // --- Header ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('TRANSFORMA - BOLETÍN DE SERVICIOS', 105, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Emisión: ${dateStr}`, 105, 28, { align: 'center' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`TEMPORADA: ${seasonName}  |  TIPO DE DÍA: ${dayType}`, 14, 40);

    // --- Table Data Preparation (Async QR Generation) ---
    const tableBody = await Promise.all(
      data.map(async (item) => {
        const qrData = JSON.stringify({
          id: item.serviceNumber || item.serviceCode,
          line: item.line,
          time: item.startTime,
        });

        // Generate QR as DataURL
        let qrImage = '';
        try {
          qrImage = await QRCode.toDataURL(qrData, {
            margin: 1,
            width: 64,
            errorCorrectionLevel: 'L',
          });
        } catch (e) {
          console.error('QR Generation Error', e);
        }

        return [
          qrImage, // First column is now QR (base64)
          item.line || '---',
          item.serviceNumber || item.serviceCode || '???',
          item.startTime || '00:00',
          item.vehicleType || 'Estándar',
          item.variant || '',
          '',
        ];
      }),
    );

    // --- Table Generation ---
    autoTable(doc, {
      startY: 45,
      head: [
        [
          'Link',
          'Línea',
          'Servicio',
          'Hora Salida',
          'Tipo Coche',
          'Variante / Recorrido',
          'Chofer Asignado',
        ],
      ],
      body: tableBody,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 9,
        cellPadding: 2,
        valign: 'middle', // Align text vertically
        textColor: [20, 20, 20],
        lineColor: [200, 200, 200],
        lineWidth: 0.1,
        minCellHeight: 18, // Force height for QR
      },
      headStyles: {
        fillColor: [240, 240, 240], // Light gray header
        textColor: [0, 0, 0], // Black text
        fontStyle: 'bold',
        halign: 'center',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 18 }, // QR Column
        1: { halign: 'center', fontStyle: 'bold', cellWidth: 15 }, // Linea
        2: { halign: 'center', fontStyle: 'bold', cellWidth: 20 }, // Servicio
        3: { halign: 'center', cellWidth: 20 }, // Hora
        4: { halign: 'center', cellWidth: 25 }, // Coche
        5: { halign: 'left' }, // Variante
        6: { halign: 'center', cellWidth: 40 }, // Chofer
      },
      alternateRowStyles: {
        fillColor: [252, 252, 252], // Very subtle stripe
      },

      // Hook to draw QR Image
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 0) {
          // Get image from cell data (we put base64 string there)
          const base64Img = data.cell.raw as string;
          if (base64Img) {
            const dim = 14;
            const x = data.cell.x + (data.cell.width - dim) / 2;
            const y = data.cell.y + (data.cell.height - dim) / 2;
            doc.addImage(base64Img, 'PNG', x, y, dim, dim);
          }
          // Hide text if any (base64 string is long)
          data.cell.text = [];
        }
      },

      // Footer (Page numbers)
      didDrawPage: function (_data) {
        const pageCount = (doc.internal as any).getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(150);
        const footerText = `Documento generado automáticamente por TransForma Platform - Página ${pageCount}`;
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
        doc.text(footerText, 14, pageHeight - 10);
      },
    });

    // Save
    const fileName = `Boletin_SmartPaper_${seasonName.replace(/\s+/g, '_')}_${dayType}_${format(now, 'yyyyMMdd')}.pdf`;
    doc.save(fileName);
  },
};
