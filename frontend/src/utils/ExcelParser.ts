
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

                    // Heuristic Detection
                    // 1. Check for Matrix/Bulletin structure (Header row with many stops)
                    const jsonPreview = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, defval: "" }) as any[][];
                    const isBulletin = detectBulletinStructure(jsonPreview);

                    if (isBulletin || fileName.startsWith('BOLETIN')) {
                        console.log("🧩 ExcelParser: Estrategia 'BOLETIN' detectada.");
                        resolve(parseBulletin(sheet));
                    } else {
                        // Fallback to Smart Carton/Generic Parser
                        console.log("🧩 ExcelParser: Estrategia 'FLEXIBLE' detectada.");
                        resolve(parseFlexible(sheet));
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
 * HELPER: Detect if sheet looks like a Bulletin Matrix
 * Look for a row that has many time-like values or string headers followed by times
 */
function detectBulletinStructure(rows: any[][]): boolean {
    // Check first 10 rows for a wider than tall structure with repeated headers
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const row = rows[i];
        if (row.length > 5) { // Arbitrary width threshold
            // Count non-empty strings
            const strings = row.filter(c => typeof c === 'string' && c.length > 2).length;
            if (strings > 4) return true; // Likely headers
        }
    }
    return false;
}

/**
 * ESTRATEGIA FLEXIBLE: Scans for metadata keywords anywhere
 */
function parseFlexible(sheet: XLSX.WorkSheet): ParsedData {
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];

    // 1. Scan for Metadata (Line, Service)
    let lineCode = "GENERICA";
    let serviceNumber = "0000";
    let startTime = "00:00";
    let foundStops: StopTime[] = [];

    // Scan the first 20 rows for keywords
    for (let r = 0; r < Math.min(rawData.length, 20); r++) {
        const row = rawData[r];
        const rowStr = row.join(' ').toUpperCase();

        // Extract Line
        if (rowStr.includes('LINEA') || rowStr.includes('LÍNEA')) {
            // Try to find the value in the row
            row.forEach((cell: any) => {
                const str = String(cell).toUpperCase();
                // If cell is just the number or "LINEA 123"
                const match = str.match(/(?:LINEA|LÍNEA)\s*[:.]?\s*(\w+)/) || str.match(/^(\d{3})$/);
                if (match && match[1]) lineCode = match[1];
                else if (str !== 'LINEA' && str !== 'LÍNEA' && /^\d+$/.test(str)) lineCode = str;
            });
        }

        // Extract Service/Turno
        if (rowStr.includes('SERVICIO') || rowStr.includes('TURNO')) {
            row.forEach((cell: any) => {
                const str = String(cell).toUpperCase();
                const match = str.match(/(?:SERVICIO|TURNO)\s*[:.]?\s*(\w+)/);
                if (match && match[1]) serviceNumber = match[1];
                else if (!str.includes('SERVICIO') && /^\d{3,4}$/.test(str)) serviceNumber = str;
            });
        }
    }

    // 2. Scan for Route Data (Time + Location pairs)
    // We look for rows that contain a Time-like pattern and a String loc
    for (let r = 0; r < rawData.length; r++) {
        const row = rawData[r];
        let rowTime = "";
        let rowLoc = "";

        // Heuristic: A row with a Time (HH:mm or decimal < 1) and a String is likely a Stop
        for (const cell of row) {
            if (!cell) continue;

            if (isValidTime(cell)) {
                if (!rowTime) rowTime = formatTime(cell);
            } else if (typeof cell === 'string' && cell.length > 3 && !rowLoc) {
                // Ignore frequent non-loc keywords
                if (!['SERVICIO', 'LINEA', 'HORA', 'TURNO', 'LLEGADA', 'SALIDA'].includes(cell.toUpperCase())) {
                    rowLoc = cell;
                }
            }
        }

        if (rowTime && rowLoc) {
            foundStops.push({ stopName: rowLoc, time: rowTime });
        }
    }

    // Sort stops by time if found (optional, assumes sequential)

    if (foundStops.length > 0) {
        startTime = foundStops[0].time;
    }

    const endTime = foundStops.length > 0 ? foundStops[foundStops.length - 1].time : formatTime(startTime); // Fallback

    return {
        type: 'CARTON',
        lines: [{ code: lineCode, name: `Línea ${lineCode}` }],
        services: [{
            lineCode,
            serviceNumber,
            startTime,
            endTime,
            durationMinutes: calculateDuration(startTime, endTime),
            routeData: foundStops,
            dayType: 'HABIL'
        }]
    };
}

/**
 * ESTRATEGIA 2: BOLETÍN (Matriz Gigante)
 */
function parseBulletin(sheet: XLSX.WorkSheet): ParsedData {
    const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    if (rawData.length < 3) throw new Error("Boletín vacío o sin cabecera suficiente.");

    // Find the header row (the one with the most string columns)
    let headerRowIdx = 0;
    let maxStrings = 0;

    for (let i = 0; i < Math.min(10, rawData.length); i++) {
        const strCount = rawData[i].filter(c => typeof c === 'string').length;
        if (strCount > maxStrings) {
            maxStrings = strCount;
            headerRowIdx = i;
        }
    }

    const headers = rawData[headerRowIdx];

    // Detect stop columns
    const stopIndices: { index: number, name: string }[] = [];
    headers.forEach((h: any, idx: number) => {
        if (h && typeof h === 'string' && h.trim().length > 0) {
            // Exclude common metadata columns
            if (!['LINEA', 'SERVICIO', 'TURNO', 'COCHE', 'CHOFER', 'OBS'].includes(h.toUpperCase())) {
                stopIndices.push({ index: idx, name: h.trim() });
            }
        }
    });

    const services: ServiceData[] = [];
    const uniqueLines = new Set<string>();

    // Start data from next row
    for (let i = headerRowIdx + 1; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || row.length === 0) continue;

        // Try to find Service Number in first few columns
        let serviceNumber = "0000";
        // Look for the first numeric-ish column that isn't a time
        /* Simple heuristic: Column 0 or Column 1 usually */
        const possibleService = String(row[0] || row[1] || '').trim();
        if (possibleService.length >= 3) serviceNumber = possibleService;

        // Build Stops
        const stops: StopTime[] = [];
        stopIndices.forEach(stopCtx => {
            const val = row[stopCtx.index];
            if (isValidTime(val)) {
                const timeStr = formatTime(val);
                stops.push({ stopName: stopCtx.name, time: timeStr });
            }
        });

        if (stops.length > 0) {
            const startTime = stops[0].time;
            const endTime = stops[stops.length - 1].time;

            let lineCode = "A DEFINIR";
            // Do we have a Linea column?
            // Try to find a column with "370", "L1", etc.
            // For now, heuristic: "GENERICA" if not found

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


// --- UTILS ---

function isValidTime(val: any): boolean {
    if (val === undefined || val === null || val === '') return false;
    if (typeof val === 'number') {
        // Excel time 0.0 to 1.0 (approx)
        return val >= 0 && val < 1.5;
    }
    if (typeof val === 'string') {
        return /^\d{1,2}:\d{2}/.test(val);
    }
    return false;
}

function formatExcelTime(excelSerial: number): string {
    const totalMinutes = Math.round(excelSerial * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${pad(hours)}:${pad(minutes)}`;
}

function formatTime(val: any): string {
    if (!val) return '00:00';
    if (typeof val === 'number') return formatExcelTime(val);

    // Normalize string time "6:30" -> "06:30"
    const str = String(val).trim();
    if (str.includes(':')) {
        const parts = str.split(':');
        return `${pad(Number(parts[0]))}:${pad(Number(parts[1]))}`;
    }
    return str;
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
