/**
 * Parser específico para archivos de rotación R-xxx.xls.
 * No modifica ExcelParserV2; solo lee R-*.xls y devuelve servicios con vehículo (para el motor de rotación).
 */
import * as XLSX from 'xlsx';
import type { ServicioCarton } from '../types/rotation';

function isValidTime(val: unknown): boolean {
  if (val == null) return false;
  if (typeof val === 'number') return val >= 0 && val < 1;
  const s = String(val).trim();
  return /^\d{1,2}:\d{2}/.test(s) || /^\d+\.\d*$/.test(s);
}

function formatTime(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'number') {
    const h = Math.floor(val * 24);
    const m = Math.round((val * 24 - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const s = String(val).trim();
  if (/^\d{1,2}:\d{2}/.test(s)) return s.slice(0, 5);
  const n = parseFloat(s);
  if (!Number.isNaN(n) && n >= 0 && n < 1) {
    const h = Math.floor(n * 24);
    const m = Math.round((n * 24 - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  return '';
}

export interface HRRotationParseResult {
  date?: string;
  services: ServicioCarton[];
  stats: { totalServices: number; vehicles: number };
}

/**
 * Parsea un archivo R-xxx.xls (File o ArrayBuffer).
 * Estructura esperada: fila de cabecera con "Coche", "Scio.", "Hora", "Línea", "Expreso a:" repetidos en bloques.
 */
export async function parseHRRotationFile(file: File): Promise<HRRotationParseResult> {
  const buf = await file.arrayBuffer();
  return parseHRRotationBuffer(buf);
}

export function parseHRRotationBuffer(arrayBuffer: ArrayBuffer): HRRotationParseResult {
  const data = new Uint8Array(arrayBuffer);
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as unknown[][];

  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const rowStr = (rows[r] as unknown[])
      .map((c) => String(c))
      .join(' ')
      .toUpperCase();
    if (rowStr.includes('COCHE') && (rowStr.includes('SCIO') || rowStr.includes('SERVICIO'))) {
      headerRowIdx = r;
      break;
    }
  }

  const services: ServicioCarton[] = [];
  const vehiclesSeen = new Set<string>();

  if (headerRowIdx === -1) {
    return { services, stats: { totalServices: 0, vehicles: 0 } };
  }

  const header = (rows[headerRowIdx] as unknown[]).map((c) => String(c).trim().toUpperCase());
  const blocks: {
    vehicleIdx: number;
    serviceIdx: number;
    timeIdx: number;
    lineIdx: number;
    destIdx: number;
  }[] = [];

  header.forEach((val, idx) => {
    if (val === 'COCHE' || val === 'INT.') {
      let serviceIdx = -1;
      let timeIdx = -1;
      let lineIdx = -1;
      for (let offset = 1; offset <= 5; offset++) {
        const ti = idx + offset;
        if (ti >= header.length) break;
        const n = header[ti];
        if (n === 'COCHE' || n === 'INT.') break;
        if (n.includes('SCIO') || n.includes('SERVICIO')) serviceIdx = ti;
        if (n.includes('SALE') || n === 'HORA' || n === 'SALIDA') timeIdx = ti;
        if (n.includes('LÍNEA') || n.includes('LINEA') || n === 'L.') lineIdx = ti;
      }
      if (lineIdx === -1) lineIdx = idx + 3;
      let destIdx = -1;
      for (let offset = 1; offset <= 6; offset++) {
        const ti = idx + offset;
        if (ti >= header.length) break;
        const n = header[ti];
        if (n.includes('EXPRESO') || n.includes('DESTINO') || n.includes('A:')) {
          destIdx = ti;
          break;
        }
      }
      if (destIdx === -1 && lineIdx !== -1) destIdx = lineIdx + 1;
      blocks.push({ vehicleIdx: idx, serviceIdx, timeIdx, lineIdx, destIdx });
    }
  });

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (!row) continue;
    const rowStr = (row as unknown[])
      .map((c) => String(c))
      .join(' ')
      .toUpperCase();
    if (rowStr.includes('COCHE')) continue;

    blocks.forEach((block) => {
      const vehicleVal = row[block.vehicleIdx];
      const serviceVal = row[block.serviceIdx];
      const timeVal = row[block.timeIdx];
      const lineVal = row[block.lineIdx];
      const destVal = row[block.destIdx];

      if (!serviceVal) return;
      const serviceNum = String(serviceVal).trim();
      if (!/^\d/.test(serviceNum)) return;

      let lineCode = 'UNKNOWN';
      if (lineVal) {
        const raw = String(lineVal).trim().toUpperCase();
        const m = raw.match(/(\d{3,4})([A-Z]?)/);
        if (m) lineCode = m[1];
        else if (raw.length > 0) lineCode = raw;
      }
      if (lineCode === 'UNKNOWN' && serviceNum.length >= 3)
        lineCode = serviceNum.length === 4 ? serviceNum.substring(0, 3) : serviceNum;

      if (isValidTime(timeVal)) {
        const vehicleNum = String(vehicleVal).trim();
        if (vehicleNum) vehiclesSeen.add(vehicleNum);
        services.push({
          serviceNumber: serviceNum,
          lineCode,
          startTime: formatTime(timeVal),
          endTime: '',
          vehicleInternalNumber: vehicleNum || undefined,
          dayType: 'HABIL',
        });
      }
    });
  }

  return {
    services,
    stats: { totalServices: services.length, vehicles: vehiclesSeen.size },
  };
}
