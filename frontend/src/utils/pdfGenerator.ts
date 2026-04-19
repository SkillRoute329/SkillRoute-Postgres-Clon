import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { type Shift, type User } from '../services/firestore/types';

export const generateShiftTicket = (shift: Shift, user: User) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [80, 150], // Ticket format width 80mm
  });

  const centerX = 40;
  let y = 10;

  // Header
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('TransForma-', centerX, y, { align: 'center' });
  y += 5;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Comprobante de Turno', centerX, y, { align: 'center' });
  y += 8;

  // Separator
  doc.setLineWidth(0.5);
  doc.line(5, y, 75, y);
  y += 5;

  // Shift Details
  doc.setFontSize(9);
  doc.text(
    `Fecha: ${format(shift.date ? new Date(shift.date) : new Date(), 'dd/MM/yyyy', { locale: es })}`,
    5,
    y,
  );
  y += 5;
  doc.text(`Hora: ${shift.time} - ${shift.endTime || '?'}`, 5, y);
  y += 5;
  doc.text(`Móvil: ${shift.carNumber}`, 5, y);
  y += 5;
  doc.text(`Línea: ${shift.line}`, 5, y);
  y += 5;
  if (shift.relief) {
    doc.text(`Relevo: ${shift.relief}`, 5, y);
    y += 5;
  }
  doc.text(`Servicio: ${shift.serviceNumber}`, 5, y);
  y += 8;

  // Value Section
  doc.setFont('helvetica', 'bold');
  doc.text('Detalle Financiero:', 5, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(`Valor Total: $${Number(shift.totalValue).toFixed(2)}`, 5, y);
  y += 5;
  if (Number(shift.extraHourValue) > 0) {
    doc.text(`Horas Extra: $${Number(shift.extraHourValue).toFixed(2)}`, 5, y);
    y += 5;
  }

  // User Info
  y += 5;
  doc.line(5, y, 75, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Tomado por:', 5, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(`${user.firstName} ${user.lastName}`, 5, y);
  y += 5;
  doc.text(`Legajo: ${user.internalNumber}`, 5, y);
  y += 8;

  // Footer
  doc.setFontSize(7);
  doc.text(`Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}`, centerX, y, {
    align: 'center',
  });

  // Save
  doc.save(`ticket_turno_${shift.id}.pdf`);
};
