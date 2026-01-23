
import * as XLSX from 'xlsx';

export interface StopTime {
    stopName: string;
    time: string; // HH:mm
}

export interface ServiceData {
    lineCode: string;
    serviceNumber: string;
    startTime: string; // HH:mm
    endTime?: string;
    durationMinutes: number;
    routeData: StopTime[]; // Full sequence
    dayType?: string; // HABIL, SABADO, DOMINGO (Detected or Default)
}

export interface ParsedData {
    type: 'CARTON' | 'BOLETIN' | 'UNKNOWN';
    lines: { code: string; name: string }[];
    services: ServiceData[];
}

export const ExcelParser = {
    parse: async (file: File): Promise<ParsedData> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const fileName = file.name.toUpperCase();

                    // 1. DETECTOR DE ESTRATEGIA
                    if (fileName.startsWith('CARTONES')) {
                        console.log("🧩 ExcelParser: Estrategia 'CARTON' detectada.");
                        resolve(parseCarton(sheet));
                    } else if (fileName.startsWith('BOLETIN')) {
                        console.log("🧩 ExcelParser: Estrategia 'BOLETIN' detectada.");
                        resolve(parseBulletin(sheet));
                    } else {
                        // Estrategia Fallback (Genérica / Legacy)
                        console.warn("⚠️ ExcelParser: Formato desconocido. Intentando parser genérico.");
                        resolve(parseGeneric(sheet));
                    }

                } catch (error) {
                    console.error("❌ ExcelParser Error:", error);
                    reject(error);
                }
            };

            reader.onerror = (error) => reject(error);
            reader.readAsArrayBuffer(file);
        });
    }
};

/**
 * ESTRATEGIA 1: CARTÓN (Reporte Individual)
 * - Metadata: B2 (Línea), K2 (Servicio)
 * - Data: Start Row 7 (Index 6)
 */
function parseCarton(sheet: XLSX.WorkSheet): ParsedData {
    // 1. Extraer Metadatos (Direct Cell Access)
    const cellB2 = sheet['B2']?.v; // Línea
    const cellK2 = sheet['K2']?.v; // Servicio

    const lineCodeRaw = String(cellB2 || "A DEFINIR").trim();
    // Sanitizar "300.0" -> "300"
    const lineCode = lineCodeRaw.replace(/\.0$/, '');

    // Servicio often comes as number
    const serviceNumRaw = String(cellK2 || "0000").trim();
    const serviceNumber = serviceNumRaw.replace(/\.0$/, '');

    // 2. Iterar filas de tiempos (Skip 6 rows header)
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:Z100');
    const startRow = 6; // Fila 7

    const stops: StopTime[] = [];

    for (let R = startRow; R <= range.e.r; ++R) {
        // En formato Cartón, asumimos columnas fijas para Ubicación y Hora?
        // O buscamos la hora decimal?
        // simple Heuristic: First string is Loc, First number (0-1) is Time
        let rowTime = "";
        let rowLoc = "";

        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellAddr = XLSX.utils.encode_cell({ c: C, r: R });
            const cell = sheet[cellAddr];
            if (!cell) continue;

            if (cell.t === 'n' && (!rowTime)) {
                // Es un número. Check si es hora Excel (0.0 a 1.0)
                const val = cell.v;
                if (val >= 0 && val < 2.0) { // Tolerate > 1 for > 24h? Usually 0-1.
                    rowTime = formatExcelTime(val);
                }
            } else if (cell.t === 's' && !rowLoc) {
                rowLoc = cell.v;
            }
        }

        if (rowTime && rowLoc && rowLoc !== "ESPERAS") {
            stops.push({ stopName: rowLoc, time: rowTime });
        }
    }

    if (stops.length === 0) {
        // Warning but let it pass if critical metadata exists
        console.warn("Carton with no stops detected.");
    }

    const startTime = stops.length > 0 ? stops[0].time : '00:00';
    const endTime = stops.length > 0 ? stops[stops.length - 1].time : '00:00';

    return {
        type: 'CARTON',
        lines: [{ code: lineCode, name: `Línea ${lineCode}` }],
        services: [{
            lineCode,
            serviceNumber,
            startTime,
            endTime,
            durationMinutes: calculateDuration(startTime, endTime),
            routeData: stops,
            dayType: 'HABIL' // Default for Cartones if not specified
        }]
    };
}

/**
 * ESTRATEGIA 2: BOLETÍN (Matriz Gigante)
 * - Row 2 (Index 1): Headers (Paradas)
 * - Col A: Service Code
 */
function parseBulletin(sheet: XLSX.WorkSheet): ParsedData {
    const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    if (rawData.length < 3) throw new Error("Boletín vacío o sin cabecera suficiente.");

    // Row 2 are headers (Index 1)
    const headers = rawData[1];

    // Detect stop columns (Header is string)
    const stopIndices: { index: number, name: string }[] = [];
    headers.forEach((h: any, idx: number) => {
        if (idx > 0 && typeof h === 'string' && h.trim().length > 0) {
            stopIndices.push({ index: idx, name: h.trim() });
        }
    });

    const services: ServiceData[] = [];
    const uniqueLines = new Set<string>();

    // Start data from Row 3 (Index 2)
    for (let i = 2; i < rawData.length; i++) {
        const row = rawData[i];
        const serviceRaw = row[0]; // Col A
        if (!serviceRaw) continue;

        const serviceNumber = String(serviceRaw).replace(/\.0$/, '').trim();

        // Build Stops
        const stops: StopTime[] = [];
        stopIndices.forEach(stopCtx => {
            const val = row[stopCtx.index];
            if (val !== undefined && val !== null && val !== "") {
                const timeStr = (typeof val === 'number') ? formatExcelTime(val) : String(val).trim();
                stops.push({ stopName: stopCtx.name, time: timeStr });
            }
        });

        if (stops.length > 0) {
            const startTime = stops[0].time;
            const endTime = stops[stops.length - 1].time;

            let lineCode = "A DEFINIR";
            // Check headers for "Linea"
            const lineColIdx = headers.findIndex((h: any) => String(h).toUpperCase().includes("LINEA"));
            if (lineColIdx > -1) {
                lineCode = String(row[lineColIdx]).trim();
            }

            lineCode = lineCode.replace(/\.0$/, '');
            uniqueLines.add(lineCode);

            services.push({
                lineCode,
                serviceNumber,
                startTime,
                endTime,
                durationMinutes: calculateDuration(startTime, endTime),
                routeData: stops,
                dayType: 'HABIL'
            });
        }
    }

    return {
        type: 'BOLETIN',
        lines: Array.from(uniqueLines).map(c => ({ code: c, name: `Línea ${c}` })),
        services
    };
}

/**
 * ESTRATEGIA 3: GENÉRICO (Fallback)
 */
function parseGeneric(sheet: XLSX.WorkSheet): ParsedData {
    const jsonData: any[] = XLSX.utils.sheet_to_json(sheet);
    const uniqueLines = new Set<string>();
    const services: ServiceData[] = [];

    jsonData.forEach((row) => {
        const lineCode = String(row['Línea'] || row['Linea'] || row['LINEA'] || '??').replace(/\.0$/, '').trim();
        const serviceNum = String(row['Servicio'] || row['SERVICIO'] || row['Turno'] || '??').replace(/\.0$/, '').trim();
        const timeStr = formatTime(row['Hora'] || row['HORA'] || row['Salida'] || row['HoraInicio'] || '00:00');

        if (lineCode !== '??' && serviceNum !== '??') {
            uniqueLines.add(lineCode);
            services.push({
                lineCode: lineCode,
                serviceNumber: serviceNum,
                startTime: timeStr,
                durationMinutes: 60,
                routeData: [], // Generic doesn't have stops
                dayType: 'HABIL'
            });
        }
    });

    return {
        type: 'UNKNOWN',
        lines: Array.from(uniqueLines).map(code => ({
            code,
            name: `Línea ${code}`
        })),
        services: services
    };
}

// --- UTILS ---

function formatExcelTime(excelSerial: number): string {
    // Excel time is fraction of day. 0.5 = 12:00
    const totalMinutes = Math.round(excelSerial * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${pad(hours)}:${pad(minutes)}`;
}

function formatTime(val: any): string {
    if (!val) return '00:00';
    if (typeof val === 'number') return formatExcelTime(val);
    return String(val).trim();
}

function pad(n: number) {
    return n < 10 ? '0' + n : n;
}

function calculateDuration(start: string, end: string | undefined): number {
    if (!end) return 60;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    return (h2 * 60 + m2) - (h1 * 60 + m1);
}
