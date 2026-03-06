import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const PDFService = {
  generateDailyReport: (shifts: any[], dateLabel: string) => {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(18);
    doc.text(`Reporte de Movimientos - ${dateLabel}`, 14, 20);

    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleString()}`, 14, 28);

    // Table Data
    const tableData = shifts.map((s) => [
      s.serviceNumber,
      s.time,
      s.line || '-',
      s.carNumber || '-',
      `${s.firstName || ''} ${s.lastName || ''}`,
      s.category || '-',
      `$${Number(s.totalValue).toLocaleString()}`,
    ]);

    autoTable(doc, {
      startY: 35,
      head: [['Servicio', 'Hora', 'Línea', 'Coche', 'Chofer', 'Categoría', 'Valor']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
      styles: { fontSize: 8 },
    });

    // Totals
    const total = shifts.reduce((sum, s) => sum + Number(s.totalValue), 0);
    const finalY = (doc as any).lastAutoTable.finalY + 10;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total del Día: $${total.toLocaleString()}`, 14, finalY);

    doc.save(`reporte_diario_${dateLabel.replace(/\//g, '-')}.pdf`);
    return true;
  },

  generateUserStatement: (user: any, shifts: any[]) => {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(18);
    doc.text(`Estado de Cuenta - ${user.firstName} ${user.lastName}`, 14, 20);

    doc.setFontSize(12);
    doc.text(`Interno: #${user.internalNumber}`, 14, 28);
    doc.text(`Generado: ${new Date().toLocaleString()}`, 14, 34);

    // Calculate Totals for Context
    let totalTaken = 0;
    let totalGiven = 0;

    // Table Data
    const tableData = shifts.map((s) => {
      const isTaken = s.transactionType === 'TOMADO';
      const amount = Number(s.totalValue);

      if (isTaken) totalTaken += amount;
      else totalGiven += amount;

      return [
        new Date(s.date).toLocaleDateString(),
        s.serviceNumber,
        isTaken ? 'Realizado' : 'Cedido',
        isTaken ? `+$${amount.toLocaleString()}` : '-',
        !isTaken ? `-$${amount.toLocaleString()}` : '-',
        s.isPaid ? 'Pagado' : 'Pendiente',
      ];
    });

    autoTable(doc, {
      startY: 45,
      head: [['Fecha', 'Servicio', 'Tipo', 'Debe (Realizado)', 'Haber (Cedido)', 'Estado']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [52, 73, 94] },
      columnStyles: {
        3: { textColor: [39, 174, 96], fontStyle: 'bold', halign: 'right' }, // Green for Taken
        4: { textColor: [231, 76, 60], fontStyle: 'bold', halign: 'right' }, // Red for Given
      },
    });

    // Summary
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    const balance = totalTaken - totalGiven;

    doc.setFillColor(240, 240, 240);
    doc.rect(14, finalY, 180, 25, 'F');

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text('Resumen del Período (Pendientes):', 20, finalY + 8);

    doc.text(`Total Realizados: $${totalTaken.toLocaleString()}`, 20, finalY + 16);
    doc.text(`Total Cedidos: $${totalGiven.toLocaleString()}`, 100, finalY + 16);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    if (balance >= 0) {
      doc.setTextColor(39, 174, 96);
      doc.text(`Saldo a Favor: $${balance.toLocaleString()}`, 20, finalY + 28);
    } else {
      doc.setTextColor(231, 76, 60);
      doc.text(`Saldo Deudor: $${Math.abs(balance).toLocaleString()}`, 20, finalY + 28);
    }

    doc.save(`estado_cuenta_${user.internalNumber}.pdf`);
    return true;
  },
};
