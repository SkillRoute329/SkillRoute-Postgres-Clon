import * as XLSX from 'xlsx';

export interface StopTime {
  stopName: string;
  time: string; // HH:mm
}

export interface ServiceData {
  lineCode: string;
  serviceNumber: string;
  variant?: string; // NEW: "A" (Ida), "B" (Vuelta)
  startTime: string; // HH:mm
  endTime?: string;
  durationMinutes: number;
  routeData: StopTime[]; // Full sequence
  dayType?: string; // HABIL, SABADO, DOMINGO
  vehicleInternalNumber?: string;
  stops?: string[];
  fullSchedule?: { id: string; startTime: string; checkpoints: string[] }[];
  destination?: string; // NEW: For Rotation Destination/Notes
}

export interface ParsedLine {
  code: string;
  name: string;
  sheetName?: string;
}

export interface ParsedData {
  type: 'CARTON' | 'BOLETIN' | 'MATRIZ_COMPLEJA' | 'ROTACION';
  lines: ParsedLine[];
  services: ServiceData[];
  stats: {
    totalSheetsProcessed: number;
    totalServicesFound: number;
  };
}

export const ExcelParser = {
  parse: async (file: File): Promise<ParsedData> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });

          const meta = {
            totalSheetsProcessed: 0,
            totalServicesFound: 0,
          };

          const allServices: ServiceData[] = [];
          const foundLines = new Map<string, ParsedLine>();
          const firstSheetName = workbook.SheetNames[0];
          const firstSheet = workbook.Sheets[firstSheetName];

          console.log('📂 ExcelParser: Abriendo libro con hojas:', workbook.SheetNames);

          // HEURISTIC: Check if this is a Rotation Sheet (Vehicle Assignment)
          if (isRotationSheet(firstSheet)) {
            console.log("🧩 ExcelParser: Estrategia 'ROTACION' detectada.");
            const rotationData = parseRotationSheet(firstSheet);

            resolve({
              type: 'ROTACION',
              lines: [],
              services: rotationData,
              stats: {
                totalSheetsProcessed: 1,
                totalServicesFound: rotationData.length,
              },
            });
            return;
          }

          // HEURISTIC: "Sábana" (Distribution/Shifts)
          if (isSabanaSheet(firstSheet)) {
            console.log("📄 ExcelParser: Estrategia 'SABANA' (Distribución) detectada.");
            const sabanaData = parseSabanaSheet(firstSheet);

            resolve({
              type: 'BOLETIN',
              lines: [],
              services: sabanaData,
              stats: {
                totalSheetsProcessed: 1,
                totalServicesFound: sabanaData.length,
              },
            });
            return;
          }

          // HEURISTIC: Check if this is a "Cartón" (One Service per Tab)
          // We check the first few tabs. If they look like Service Numbers ("1044", "1046"), assume Carton Mode.
          const isCartonMode = workbook.SheetNames.slice(0, 3).every((name) =>
            /^\d{3,4}[A-Z]?$/.test(name.trim()),
          );

          if (isCartonMode || workbook.SheetNames.length > 50) {
            // Assume large workbook is Carton/Services
            console.log(
              `🎫 ExcelParser: Estrategia 'CARTON' (Fichas Individuales) detectada. Total Hojas: ${workbook.SheetNames.length}`,
            );

            workbook.SheetNames.forEach((sheetName, idx) => {
              if (idx % 10 === 0)
                console.log(
                  `Procesando hoja ${idx + 1} de ${workbook.SheetNames.length}... (${sheetName})`,
                );

              const sheet = workbook.Sheets[sheetName];
              // Skip legends/metadata tabs
              if (!/^\d/.test(sheetName)) return;

              try {
                const cartonService = parseCartonSheet(sheet, sheetName);
                // STRICT VALIDATION: If parser returns null (empty/invalid), SKIP.
                if (cartonService) {
                  allServices.push(cartonService);

                  // Register Line (if new)
                  if (!foundLines.has(cartonService.lineCode)) {
                    foundLines.set(cartonService.lineCode, {
                      code: cartonService.lineCode,
                      name: `Línea ${cartonService.lineCode}`,
                      sheetName,
                    });
                  }
                } else {
                  console.warn(`⚠️ Hoja ${sheetName} vacía o inválida estructura. Ignorando.`);
                }
                meta.totalSheetsProcessed++;
              } catch (e) {
                console.warn(`Error parsing carton ${sheetName}`, e);
              }
            });

            meta.totalServicesFound = allServices.length;
            resolve({
              type: 'CARTON',
              lines: Array.from(foundLines.values()),
              services: allServices,
              stats: meta,
            });
            return;
          }

          // DEFAULT: Multi-Sheet Matrix Strategy
          workbook.SheetNames.forEach((sheetName) => {
            // Skip system sheets or empty names
            if (!sheetName || sheetName.toUpperCase().includes('LEGEND')) return;

            const sheet = workbook.Sheets[sheetName];
            const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');

            // heuristic: if sheet is tiny, skip
            if (range.e.r < 5) return;

            meta.totalSheetsProcessed++;

            // Parse Sheet Name for Line Info (e.g., "300a" -> Line 300, Var A)
            const { lineCode, variant } = parseSheetName(sheetName);

            // Register Line
            if (!foundLines.has(lineCode)) {
              foundLines.set(lineCode, {
                code: lineCode,
                name: `Línea ${lineCode}`,
                sheetName,
              });
            }

            // PARSE CONTENT (Matrix Strategy)
            try {
              const sheetServices = parseMatrixSheet(sheet, lineCode, variant);
              sheetServices.forEach((s) => allServices.push(s));
            } catch (err) {
              console.warn(`⚠️ Error parsing sheet ${sheetName}:`, err);
            }
          });

          meta.totalServicesFound = allServices.length;

          resolve({
            type: 'MATRIZ_COMPLEJA', // Specific type for this multi-tab format
            lines: Array.from(foundLines.values()),
            services: allServices,
            stats: meta,
          });
        } catch (error) {
          console.error('❌ ExcelParser Critical Error:', error);
          reject(error);
        }
      };

      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(file);
    });
  },
};

/**
 * Extract Line and Variant from "300a", "300b", "306a"
 */
function parseSheetName(name: string): { lineCode: string; variant: string } {
  const clean = name.trim().toUpperCase();
  const match = clean.match(/^(\d+)([A-Z]?)/);

  if (match) {
    return {
      lineCode: match[1],
      variant: match[2] || 'A', // Default to A if no suffix
    };
  }

  // Fallback for names like "L-12a" or just text
  return { lineCode: clean, variant: 'A' };
}

/**
 * STRATEGY: ROTATION SHEET
 * Detects headers: "Coche", "Scio.", "Sale", "Línea" (Repeated horizontally)
 */
function isRotationSheet(sheet: XLSX.WorkSheet): boolean {
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, defval: '' }) as any[][];
  // Check first 5 rows
  for (let r = 0; r < Math.min(data.length, 5); r++) {
    const rowStr = data[r].join(' ').toUpperCase();
    if (rowStr.includes('COCHE') && (rowStr.includes('SCIO') || rowStr.includes('SERVICIO'))) {
      return true;
    }
  }
  return false;
}

function parseRotationSheet(sheet: XLSX.WorkSheet): ServiceData[] {
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
  const services: ServiceData[] = [];

  // 1. Find the header row (the one with 'Coche')
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(data.length, 10); r++) {
    const rowStr = data[r].join(' ').toUpperCase();
    if (rowStr.includes('COCHE') && (rowStr.includes('SCIO') || rowStr.includes('SERVICIO'))) {
      headerRowIdx = r;
      break;
    }
  }

  if (headerRowIdx === -1) {
    console.warn('⚠️ ExcelParser: No header row found for Rotation strategy.');
    return [];
  }

  const header = data[headerRowIdx].map((c) => String(c).trim().toUpperCase());
  console.log('🧩 Header Row Detected:', header);

  // 2. Identify "Blocks" of columns
  // Strategy: Find every "COCHE" column. For each, look ahead for SCIO, SALE, LINEA until the next COCHE or end.
  const blocks: {
    vehicleIdx: number;
    serviceIdx: number;
    timeIdx: number;
    lineIdx: number;
    destIdx: number;
  }[] = [];

  header.forEach((val, idx) => {
    if (val === 'COCHE' || val === 'INT.') {
      // Found a block start. Scan ahead for partners.
      let serviceIdx = -1;
      let timeIdx = -1;
      let lineIdx = -1;

      // Look in next 5 columns (heuristic limit)
      for (let offset = 1; offset <= 5; offset++) {
        const targetIdx = idx + offset;
        if (targetIdx >= header.length) break;
        const nextHeader = header[targetIdx];

        // Stop if we hit another Block Start
        if (nextHeader === 'COCHE' || nextHeader === 'INT.') break;

        if (nextHeader.includes('SCIO') || nextHeader.includes('SERVICIO')) serviceIdx = targetIdx;
        if (nextHeader.includes('SALE') || nextHeader === 'HORA' || nextHeader === 'SALIDA')
          timeIdx = targetIdx;
        if (nextHeader.includes('LÍNEA') || nextHeader.includes('LINEA') || nextHeader === 'L.')
          lineIdx = targetIdx;
      }

      // Fallback: If not found by name, assume standard adjacent positions if they are emptyish?
      // Better to rely on found indices. If some missing, try +1, +2 defaults if strict mode fails.
      if (lineIdx === -1) lineIdx = idx + 3;

      // Look for Destination/Expreso (usually after Line)
      let destIdx = -1;
      for (let offset = 1; offset <= 6; offset++) {
        const targetIdx = idx + offset;
        if (targetIdx >= header.length) break;
        const nextHeader = header[targetIdx];
        if (
          nextHeader.includes('EXPRESO') ||
          nextHeader.includes('DESTINO') ||
          nextHeader.includes('A:')
        ) {
          destIdx = targetIdx;
          break;
        }
      }
      // Fallback: usually Line + 1
      if (destIdx === -1 && lineIdx !== -1) destIdx = lineIdx + 1;

      blocks.push({ vehicleIdx: idx, serviceIdx, timeIdx, lineIdx, destIdx });
    }
  });

  console.log('🧩 Rotation Blocks Layout:', blocks);

  // 3. Iterate rows BELOW header
  for (let r = headerRowIdx + 1; r < data.length; r++) {
    const row = data[r];
    if (!row) continue;

    // Skip rows that look like another header
    const rowStr = row.join(' ').toUpperCase();
    if (rowStr.includes('COCHE')) continue;

    // For each block in this row
    blocks.forEach((block) => {
      const vehicleVal = row[block.vehicleIdx];
      const serviceVal = row[block.serviceIdx];
      const timeVal = row[block.timeIdx];
      const lineVal = row[block.lineIdx];
      // @ts-ignore
      const destVal = row[block.destIdx];

      // Basic Validation: Must have a Service Number
      if (!serviceVal) return;

      const serviceNum = String(serviceVal).trim();
      // Skip headers repeated in data or empty
      if (!/^\d/.test(serviceNum)) return;

      // Line Parsing - Robust
      let lineCode = 'UNKNOWN';
      let variant = 'A';

      if (lineVal) {
        const rawLine = String(lineVal).trim().toUpperCase();
        // Regex to capture pure number, avoiding "L-" or "Línea"
        // Matches "370", "L-370", "L370A", "370 A"
        const lineMatch = rawLine.match(/(\d{3,4})([A-Z]?)/);
        if (lineMatch) {
          lineCode = lineMatch[1];
          variant = lineMatch[2] || 'A';
        } else if (rawLine.length > 0) {
          // Fallback for non-numeric lines like "PLAYA"
          lineCode = rawLine;
        }
      }

      // Fallback: Infer Line from Service Number (e.g. 3061 -> 306)
      if (lineCode === 'UNKNOWN' && serviceNum.length >= 3) {
        // Heuristic: First 3 digits of service usually match line in 4-digit services
        if (serviceNum.length === 4) {
          lineCode = serviceNum.substring(0, 3);
        }
      }

      if (isValidTime(timeVal)) {
        services.push({
          lineCode,
          serviceNumber: serviceNum,
          variant,
          startTime: formatTime(timeVal),
          endTime: '', // No especificado en hojas de rotación; no inventar valor
          durationMinutes: 0,
          routeData: [], // Empty
          dayType: 'HABIL',
          vehicleInternalNumber: String(vehicleVal).trim(),
          destination: destVal ? String(destVal).trim() : '',
        });
      }
    });
  }

  return services;
}

/**
 * STRATEGY: SABANA / DISTRIBUTION LIST
 * Detects headers or content like "1° 06:38 a 14:05"
 */
function isSabanaSheet(sheet: XLSX.WorkSheet): boolean {
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, defval: '' }) as any[][];
  // Scan first 10 rows for patterns
  for (let r = 0; r < Math.min(data.length, 10); r++) {
    const rowStr = data[r].join(' ').toUpperCase();
    // Check for specific keywords or time patterns
    if (
      rowStr.includes('TOTAL DE SERVICIOS') ||
      rowStr.includes('DISTRIBUCIÓN') ||
      /\d{2}:\d{2}\s*A\s*\d{2}:\d{2}/i.test(rowStr)
    ) {
      return true;
    }
  }
  return false;
}

function parseSabanaSheet(sheet: XLSX.WorkSheet): ServiceData[] {
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
  const services: ServiceData[] = [];

  // Find header row or start of data
  // We assume data starts when we find a Service Number (Col A usually)

  for (const row of data) {
    if (!row || row.length < 3) continue;

    // Try to identify Service and Line columns
    // Heuristic: First numeric column is Service, Second is Line
    // Or specific indices if known. Let's try flexible search.

    let serviceVal: any = null;
    let lineVal: any = null;
    const contentCols: string[] = [];

    // Simple iterator to find first 2 number-like fields
    let numsFound = 0;
    for (const cell of row) {
      const str = String(cell).trim();
      if (/^\d{3,5}$/.test(str)) {
        // 3 to 5 digits (e.g. 1001, 300)
        if (numsFound === 0) serviceVal = str;
        else if (numsFound === 1) lineVal = str;
        numsFound++;
      } else if (str.length > 5) {
        // Potential content column
        contentCols.push(str);
      }
    }

    if (serviceVal && lineVal) {
      // Process Content Columns for Shifts
      // Format: "1° 06:38 a 14:05 - 07:27'"

      let startTime = '';
      let endTime = '';
      const splits: any[] = [];

      const timeRegex = /(\d{1,2}[:.]\d{2})\s*[aA]\s*(\d{1,2}[:.]\d{2})/i;

      contentCols.forEach((colTxt) => {
        const match = colTxt.match(timeRegex);
        if (match) {
          const start = formatTime(match[1]);
          const end = formatTime(match[2]);
          splits.push({ start, end, raw: colTxt });

          // Logic to determine global start/end
          if (!startTime || compareTimes(start, startTime) < 0) startTime = start;
          if (!endTime || compareTimes(end, endTime) > 0) endTime = end;
        }
      });

      if (splits.length > 0) {
        // If we have splits, assume valid service row
        // Duration calc
        const duration = calculateDuration(startTime, endTime);

        services.push({
          lineCode: String(lineVal),
          serviceNumber: String(serviceVal),
          variant: 'A', // Default, difficult to extract from plain text
          startTime,
          endTime,
          durationMinutes: duration,
          routeData: [],
          dayType: 'HABIL', // Guessing from header usually
          // Store splits in routeData or metadata?
          // Let's overload routeData with special "Metadata" point if needed, or just leave it blank
          // and let the backend store the times.
          // The backend ingestion uses `startTime` and `endTime` fields explicitly.
        });
      }
    }
  }

  return services;
}

function compareTimes(t1: string, t2: string): number {
  return Number(t1.replace(':', '')) - Number(t2.replace(':', ''));
}

/**
 * STRATEGY: CARTON INDIVIDUAL
 * Sheet Name = Service Number (e.g. "1044")
 */
/**
 * STRATEGY: CARTON INDIVIDUAL
 * Sheet Name = Service Number (e.g. "1044")
 */
function parseCartonSheet(sheet: XLSX.WorkSheet, sheetName: string): ServiceData | null {
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
  if (data.length < 5) return null;

  // 1. Extract Header Info (Line and Service)
  let lineCode = 'UNKNOWN';
  let serviceNumber = sheetName.replace(/\D/g, ''); // Default to digits of tab name

  // Scan top 15 rows for metadata (Smart Header Scanner - Frontend V2)
  for (let r = 0; r < Math.min(data.length, 15); r++) {
    const row = data[r];
    if (!row) continue;
    const rowStr = row.join(' ').toUpperCase();

    // Extract Line: "LÍNEA 300", "L. CE1B", "300", "CE1B"
    const lineMatch = rowStr.match(/(?:L(?:Í|I)NEA|L\.?)\s*([A-Z0-9\-]+)/i);
    if (lineMatch) {
      lineCode = lineMatch[1].trim().toUpperCase();
    } else {
      for (const cell of row) {
        const val = String(cell).trim();
        if (/^\d{3}[A-Z]?$/.test(val)) lineCode = val;
        else if (/^[A-Z]{2,}\d*[A-Z]?$/i.test(val) && val.length >= 2) lineCode = val.toUpperCase(); // CE1B, DM1B, L-12B
      }
    }

    // Extract Service
    // Patterns: "SERVICIO N° 1044", "SERVICIO 1044", "1044" (big number)
    const svcMatch = rowStr.match(/(?:SERVICIO|TURNO|SCIO)\s*(?:N[º°\.]?)?\s*(\d{3,4})/i);
    if (svcMatch) {
      serviceNumber = svcMatch[1];
    } else if (serviceNumber === sheetName) {
      // Check for standalone 4-digit number (common for service N)
      for (const cell of row) {
        const val = String(cell).trim();
        if (/^\d{4}$/.test(val) && val !== '2026') {
          // Avoid Year
          serviceNumber = val;
        }
      }
    }
  }

  if (lineCode === 'UNKNOWN') {
    console.warn(`[ExcelParser] Line UNKNOWN for sheet ${sheetName}`);
  }

  // 2. Fila de cabeceras = nombres de paradas (ej: "TRES CRUCES", "EJIDO", "PZA INDEPEND")
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(data.length, 25); r++) {
    const row = data[r];
    if (!row || row.length < 2) continue;
    let potentialStops = 0;
    let timeCount = 0;
    for (const cell of row) {
      const val = String(cell).trim();
      if (!val) continue;
      if (isValidTime(cell)) timeCount++;
      else if (val.length >= 2 && /[a-zA-Z]/.test(val) && !/^\d{1,2}:\d{2}$/.test(val))
        potentialStops++;
    }
    if (potentialStops >= 2 && timeCount <= potentialStops) {
      headerRowIdx = r;
      break;
    }
  }
  if (headerRowIdx === -1) return null;

  const headerRow = data[headerRowIdx];
  const stops: string[] = (headerRow as unknown[]).map((c: unknown, i: number) => {
    const s = String(c).trim();
    return s.length > 0 && /[a-zA-Z]/.test(s) ? s : `Punto ${i + 1}`;
  });

  // 3. Filas de datos = viajes; cada celda = tiempo (decimal Excel → HH:mm)
  const fullSchedule: { id: string; startTime: string; checkpoints: string[] }[] = [];
  let earliest = '23:59';
  let latest = '';
  let maxCols = stops.length;

  for (let r = headerRowIdx + 1; r < data.length; r++) {
    const row = data[r];
    if (!row) continue;
    const rowStr = row.join(' ');
    if (
      rowStr.length > 50 &&
      !/\d{1,2}:\d{2}/.test(rowStr.slice(0, 30)) &&
      /[a-zA-Z]{5,}/.test(rowStr)
    )
      break;

    if (row.length > maxCols) maxCols = row.length;
    const checkpoints: string[] = [];
    let validTimeCount = 0;
    for (let c = 0; c < maxCols; c++) {
      const cell = row[c];
      const hhmm = formatTime(cell);
      if (hhmm) validTimeCount++;
      checkpoints.push(hhmm || '--:--');
    }
    if (validTimeCount < 1) continue;
    const startTime = checkpoints.find((x) => x && x !== '--:--') || '';
    if (!startTime) continue;

    while (checkpoints.length < maxCols) checkpoints.push('--:--');
    fullSchedule.push({ id: `trip-${r}`, startTime, checkpoints });
    if (startTime > '03:00' && startTime < earliest) earliest = startTime;
    if (startTime > latest || (startTime < '03:00' && latest > '20:00')) latest = startTime;
  }

  while (stops.length < maxCols) stops.push(`Punto ${stops.length + 1}`);

  if (fullSchedule.length === 0) return null;

  return {
    lineCode,
    serviceNumber,
    variant: 'A',
    startTime: earliest || '',
    endTime: latest || '',
    durationMinutes: calculateDuration(earliest || '', latest || ''),
    routeData: [],
    stops,
    dayType: 'HABIL',
    fullSchedule,
  };
}

/**
 * Core Logic for the "Matriz Inspección" Format
 */
function parseMatrixSheet(sheet: XLSX.WorkSheet, lineCode: string, variant: string): ServiceData[] {
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
  const services: ServiceData[] = [];

  // 1. Locate Header Row (Look for "Servicio" or "Turno")
  let headerRowIdx = -1;
  let serviceColIdx = -1;

  for (let r = 0; r < Math.min(data.length, 10); r++) {
    const row = data[r];
    const sysIdx = row.findIndex(
      (c: any) =>
        String(c).toUpperCase().includes('SERVICIO') || String(c).toUpperCase().trim() === 'TURNO',
    );

    if (sysIdx !== -1) {
      headerRowIdx = r;
      serviceColIdx = sysIdx;
      break;
    }
  }

  if (headerRowIdx === -1) return []; // No recognizable table here

  const headers = data[headerRowIdx];

  // 2. Identify Stop Columns (Any column after Service that has a name)
  const stopCols: { name: string; idx: number }[] = [];

  for (let c = serviceColIdx + 1; c < headers.length; c++) {
    const headerVal = String(headers[c]).trim();
    // Ignore empty headers or metadata cols like "Obs"
    if (
      headerVal &&
      headerVal.length > 2 &&
      !['OBS', 'NOTAS', 'INTERNO'].includes(headerVal.toUpperCase())
    ) {
      stopCols.push({ name: headerVal, idx: c });
    }
  }

  // 3. Scan Rows for Data
  for (let r = headerRowIdx + 1; r < data.length; r++) {
    const row = data[r];
    if (!row) continue;

    const serviceNum = String(row[serviceColIdx]).trim();
    // Skip rows without valid service number (e.g. totals or empty)
    if (!serviceNum || serviceNum.length < 3 || !/^\d+$/.test(serviceNum)) continue;

    const stops: StopTime[] = [];

    stopCols.forEach((col) => {
      const cellVal = row[col.idx];
      if (isValidTime(cellVal)) {
        stops.push({
          stopName: col.name,
          time: formatTime(cellVal),
        });
      }
    });

    if (stops.length > 1) {
      // Sort stops by time? Usually sequential in matrix, so preserve order.
      // But handle day crossing (23:50 -> 00:10)?
      // Simple approach: trust cell order.

      const startTime = stops[0].time;
      const endTime = stops[stops.length - 1].time;

      services.push({
        lineCode,
        serviceNumber: serviceNum,
        variant,
        startTime,
        endTime,
        durationMinutes: calculateDuration(startTime, endTime),
        routeData: stops,
        dayType: 'HABIL', // Default, backend can override via Season
      });
    }
  }

  return services;
}

// --- UTILS (Preserved) ---

function isValidTime(val: any): boolean {
  if (val === undefined || val === null || val === '') return false;
  if (typeof val === 'number') {
    // Excel time 0.0 to 1.5
    return val >= 0 && val < 2.0;
  }
  if (typeof val === 'string') {
    return /^\d{1,2}:\d{2}/.test(val);
  }
  return false;
}

// Parser exacto: sin inventar datos. Valores inválidos → cadena vacía (no "00:00").
function formatExcelTime(serial: number): string {
  if (serial === undefined || serial === null || isNaN(serial)) return '';
  const totalSeconds = Math.round(serial * 86400);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  // Handle Day Crossing (24+) if needed, but usually we wrap to 24h format
  const h = hours % 24;

  return `${pad(h)}:${pad(minutes)}`;
}

function formatTime(val: any): string {
  if (val === undefined || val === null || val === '') return '';
  if (typeof val === 'number') {
    const t = formatExcelTime(val);
    return t === '' ? '' : t;
  }
  const str = String(val).trim();
  if (!str || !str.includes(':')) return '';
  const parts = str.split(':');
  const h = Math.abs(Number(parts[0]));
  const m = Math.abs(Number(parts[1]));
  if (isNaN(h) || isNaN(m)) return '';
  return `${pad(h)}:${pad(m)}`;
}

function pad(n: number) {
  return n < 10 ? '0' + n : n;
}

function calculateDuration(start: string, end: string | undefined): number {
  if (!start || !end || start === '' || end === '') return 0;
  const [h1, m1] = start.split(':').map(Number);
  const [h2, m2] = end.split(':').map(Number);
  let diff = h2 * 60 + m2 - (h1 * 60 + m1);
  // Handle day crossing
  if (diff < 0) diff += 24 * 60;
  return diff;
}
