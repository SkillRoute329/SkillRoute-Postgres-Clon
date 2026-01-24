
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
}

export interface ParsedLine {
    code: string;
    name: string;
    sheetName?: string;
}

export interface ParsedData {
    type: 'CARTON' | 'BOLETIN' | 'MATRIZ_COMPLEJA';
    lines: ParsedLine[];
    services: ServiceData[];
    stats: {
        totalSheetsProcessed: number;
        totalServicesFound: number;
    }
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
                        totalServicesFound: 0
                    };

                    const allServices: ServiceData[] = [];
                    const foundLines = new Map<string, ParsedLine>();

                    console.log("📂 ExcelParser: Abriendo libro con hojas:", workbook.SheetNames);

                    // ITERATE ALL SHEETS (Smart Multi-Tab Support)
                    workbook.SheetNames.forEach(sheetName => {
                        // Skip system sheets or empty names
                        if (!sheetName || sheetName.toUpperCase().includes('LEGEND')) return;

                        const sheet = workbook.Sheets[sheetName];
                        const range = XLSX.utils.decode_range(sheet['!ref'] || "A1:A1");

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
                                sheetName
                            });
                        }

                        // PARSE CONTENT (Matrix Strategy)
                        try {
                            const sheetServices = parseMatrixSheet(sheet, lineCode, variant);
                            sheetServices.forEach(s => allServices.push(s));
                        } catch (err) {
                            console.warn(`⚠️ Error parsing sheet ${sheetName}:`, err);
                        }
                    });

                    meta.totalServicesFound = allServices.length;

                    resolve({
                        type: 'MATRIZ_COMPLEJA', // Specific type for this multi-tab format
                        lines: Array.from(foundLines.values()),
                        services: allServices,
                        stats: meta
                    });

                } catch (error) {
                    console.error("❌ ExcelParser Critical Error:", error);
                    reject(error);
                }
            };

            reader.onerror = (error) => reject(error);
            reader.readAsArrayBuffer(file);
        });
    }
};

/**
 * Extract Line and Variant from "300a", "300b", "306a"
 */
function parseSheetName(name: string): { lineCode: string, variant: string } {
    const clean = name.trim().toUpperCase();
    const match = clean.match(/^(\d+)([A-Z]?)/);

    if (match) {
        return {
            lineCode: match[1],
            variant: match[2] || 'A' // Default to A if no suffix
        };
    }

    // Fallback for names like "L-12a" or just text
    return { lineCode: clean, variant: 'A' };
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
        const sysIdx = row.findIndex((c: any) =>
            String(c).toUpperCase().includes('SERVICIO') ||
            String(c).toUpperCase().trim() === 'TURNO'
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
    const stopCols: { name: string, idx: number }[] = [];

    for (let c = serviceColIdx + 1; c < headers.length; c++) {
        const headerVal = String(headers[c]).trim();
        // Ignore empty headers or metadata cols like "Obs"
        if (headerVal && headerVal.length > 2 && !['OBS', 'NOTAS', 'INTERNO'].includes(headerVal.toUpperCase())) {
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

        stopCols.forEach(col => {
            const cellVal = row[col.idx];
            if (isValidTime(cellVal)) {
                stops.push({
                    stopName: col.name,
                    time: formatTime(cellVal)
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
                dayType: 'HABIL' // Default, backend can override via Season
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

function formatExcelTime(excelSerial: number): string {
    const totalMinutes = Math.round(excelSerial * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${pad(hours)}:${pad(minutes)}`;
}

function formatTime(val: any): string {
    if (!val) return '00:00';
    if (typeof val === 'number') return formatExcelTime(val);

    const str = String(val).trim();
    if (str.includes(':')) {
        const parts = str.split(':');
        // Ensure 05:00 not 5:0
        let h = Math.abs(Number(parts[0]));
        let m = Math.abs(Number(parts[1]));
        if (isNaN(h)) h = 0;
        if (isNaN(m)) m = 0;
        return `${pad(h)}:${pad(m)}`;
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
    let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    // Handle day crossing
    if (diff < 0) diff += 24 * 60;
    return diff;
}
