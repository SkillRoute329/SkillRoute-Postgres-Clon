
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
    vehicleInternalNumber?: string; // NEW: For Rotation Sheets
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
                    const firstSheetName = workbook.SheetNames[0];
                    const firstSheet = workbook.Sheets[firstSheetName];

                    console.log("📂 ExcelParser: Abriendo libro con hojas:", workbook.SheetNames);

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
                                totalServicesFound: rotationData.length
                            }
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
                                totalServicesFound: sabanaData.length
                            }
                        });
                        return;
                    }

                    // HEURISTIC: Check if this is a "Cartón" (One Service per Tab)
                    // We check the first few tabs. If they look like Service Numbers ("1044", "1046"), assume Carton Mode.
                    const isCartonMode = workbook.SheetNames.slice(0, 3).every(name => /^\d{3,4}[A-Z]?$/.test(name.trim()));

                    if (isCartonMode) {
                        console.log("🎫 ExcelParser: Estrategia 'CARTON' (Fichas Individuales) detectada.");

                        workbook.SheetNames.forEach(sheetName => {
                            const sheet = workbook.Sheets[sheetName];
                            // Skip legends/metadata tabs
                            if (!/^\d/.test(sheetName)) return;

                            try {
                                const cartonService = parseCartonSheet(sheet, sheetName);
                                if (cartonService) {
                                    allServices.push(cartonService);

                                    // Register Line (if new)
                                    if (!foundLines.has(cartonService.lineCode)) {
                                        foundLines.set(cartonService.lineCode, {
                                            code: cartonService.lineCode,
                                            name: `Línea ${cartonService.lineCode}`,
                                            sheetName
                                        });
                                    }
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
                            stats: meta
                        });
                        return;
                    }

                    // DEFAULT: Multi-Sheet Matrix Strategy
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
 * STRATEGY: ROTATION SHEET
 * Detects headers: "Coche", "Scio.", "Sale", "Línea" (Repeated horizontally)
 */
function isRotationSheet(sheet: XLSX.WorkSheet): boolean {
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, defval: "" }) as any[][];
    // Check first 5 rows
    for (let r = 0; r < Math.min(data.length, 5); r++) {
        const rowStr = data[r].join(" ").toUpperCase();
        if (rowStr.includes("COCHE") && (rowStr.includes("SCIO") || rowStr.includes("SERVICIO"))) {
            return true;
        }
    }
    return false;
}

function parseRotationSheet(sheet: XLSX.WorkSheet): ServiceData[] {
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    const services: ServiceData[] = [];

    // 1. Find the header row (the one with 'Coche')
    let headerRowIdx = -1;
    for (let r = 0; r < Math.min(data.length, 5); r++) {
        const rowStr = data[r].join(" ").toUpperCase();
        if (rowStr.includes("COCHE") && (rowStr.includes("SCIO") || rowStr.includes("SERVICIO"))) {
            headerRowIdx = r;
            break;
        }
    }

    if (headerRowIdx === -1) return [];

    const header = data[headerRowIdx];

    // 2. Identify "Blocks" of columns (Groups of Coche, Scio, Sale, Linea)
    // We scan the header row to find the start index of each "Coche" column
    const blockIndices: number[] = [];
    header.forEach((val, idx) => {
        if (String(val).trim().toUpperCase() === "COCHE") {
            blockIndices.push(idx);
        }
    });

    console.log("Blocks found at indices:", blockIndices);

    // 3. Iterate rows BELOW header
    for (let r = headerRowIdx + 1; r < data.length; r++) {
        const row = data[r];
        if (!row) continue;

        // For each block in this row
        blockIndices.forEach(startIdx => {
            // Expecting: [Vehicle] [Service] [Start] [Line] (based on screenshot)
            // But let's be flexible. Let's look at relative offsets from startIdx.
            // Screenshot: Coche | Scio. | Sale | Línea

            const vehicleVal = row[startIdx];
            const serviceVal = row[startIdx + 1];
            const timeVal = row[startIdx + 2];
            const lineVal = row[startIdx + 3];

            // Basic Validation
            if (!serviceVal || !lineVal) return;

            const serviceNum = String(serviceVal).trim();
            // Line often looks like "300b", "306p"
            const rawLine = String(lineVal).trim();

            // Extract code and variant from rawLine
            const lineMatch = rawLine.match(/^(\d+)([A-Z]?)/i);
            let lineCode = "UNKNOWN";
            let variant = "A"; // Default

            if (lineMatch) {
                lineCode = lineMatch[1];
                variant = lineMatch[2].toUpperCase();
            } else {
                lineCode = rawLine;
            }

            if (serviceNum.length >= 3 && isValidTime(timeVal)) {
                services.push({
                    lineCode,
                    serviceNumber: serviceNum,
                    variant,
                    startTime: formatTime(timeVal),
                    endTime: "00:00", // Not in file
                    durationMinutes: 0,
                    routeData: [], // Empty
                    dayType: 'HABIL',
                    vehicleInternalNumber: String(vehicleVal).trim()
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
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, defval: "" }) as any[][];
    // Scan first 10 rows for patterns
    for (let r = 0; r < Math.min(data.length, 10); r++) {
        const rowStr = data[r].join(" ").toUpperCase();
        // Check for specific keywords or time patterns
        if (rowStr.includes("TOTAL DE SERVICIOS") || rowStr.includes("DISTRIBUCIÓN") || /\d{2}:\d{2}\s*A\s*\d{2}:\d{2}/i.test(rowStr)) {
            return true;
        }
    }
    return false;
}

function parseSabanaSheet(sheet: XLSX.WorkSheet): ServiceData[] {
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
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
        let contentCols: string[] = [];

        // Simple iterator to find first 2 number-like fields
        let numsFound = 0;
        for (const cell of row) {
            const str = String(cell).trim();
            if (/^\d{3,5}$/.test(str)) { // 3 to 5 digits (e.g. 1001, 300)
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

            let startTime = "00:00";
            let endTime = "00:00";
            const splits: any[] = [];

            const timeRegex = /(\d{1,2}[:.]\d{2})\s*[aA]\s*(\d{1,2}[:.]\d{2})/i;

            contentCols.forEach(colTxt => {
                const match = colTxt.match(timeRegex);
                if (match) {
                    const start = formatTime(match[1]);
                    const end = formatTime(match[2]);
                    splits.push({ start, end, raw: colTxt });

                    // Logic to determine global start/end
                    if (startTime === "00:00" || compareTimes(start, startTime) < 0) startTime = start;
                    if (compareTimes(end, endTime) > 0) endTime = end;
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
function parseCartonSheet(sheet: XLSX.WorkSheet, sheetName: string): ServiceData | null {
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    if (data.length < 5) return null;

    // 1. Extract Header Info (Line and Service)
    // Row 0 or 1 usually has "Línea 300" ... "Servicio 1044"
    let lineCode = "UNKNOWN";
    let serviceNumber = sheetName; // Default to tab name

    // Scan top 3 rows for metadata
    for (let r = 0; r < 3; r++) {
        const rowStr = data[r].join(" ").toUpperCase();
        // Extract Line
        const lineMatch = rowStr.match(/LÍNEA\s*(\d+[A-Z]?)/i); // e.g. "Línea 300"
        if (lineMatch) lineCode = lineMatch[1];
        else {
            // Fallback: look for just big number "300" in Col A
            const possibleLine = String(data[r][0]).trim();
            if (/^\d{3}[A-Z]?$/.test(possibleLine)) lineCode = possibleLine;
        }

        // Extract Service from cell content if explicit
        const svcMatch = rowStr.match(/SERVICIO\s*N[º°]?\s*(\d+)/i);
        if (svcMatch) serviceNumber = svcMatch[1];
    }

    // 2. Locate Stop Header Row
    // Looks for "Crio. Central", "Tres Cruces", etc.
    // Heuristic: Row with many non-empty strings, usually below row 3
    let headerRowIdx = -1;
    for (let r = 3; r < 10; r++) {
        const row = data[r];
        const validCols = row.filter((c: any) => c && String(c).length > 3).length;
        if (validCols > 3) {
            headerRowIdx = r;
            break;
        }
    }

    if (headerRowIdx === -1) return null;

    const stops: string[] = data[headerRowIdx].map(c => String(c).trim());

    // 3. Scan Trip Rows (Time Sequences)
    // Rows below header that contain exclusively time-like strings
    const allStopTimes: StopTime[] = [];
    let earliest = "23:59";
    let latest = "00:00";

    for (let r = headerRowIdx + 1; r < data.length; r++) {
        const row = data[r];
        // Stop if we hit footer text (long text like "SACA COCHE...")
        const rowStr = row.join(" ");
        if (rowStr.length > 50 && !/\d{2}:\d{2}/.test(rowStr.substring(0, 20))) break;

        // Extract times
        row.forEach((cell, cIdx) => {
            const val = formatTime(cell);
            if (isValidTime(cell)) {
                const stopName = stops[cIdx] || `Stop ${cIdx}`;
                allStopTimes.push({ stopName, time: val });

                // Update bounds
                // Handle midnight crossing logic for bounds is tricky without full dates
                // Simple string compare for now
                if (val < earliest && val > "03:00") earliest = val; // Ignore post-midnight early AM for start
                if (val > latest || (val < "03:00" && latest > "20:00")) latest = val;
            }
        });
    }

    // 4. Extract Footer Info (Shift details)
    // Look for "TURNO DE ... a ..."
    let shiftMetadata = "";
    for (let r = data.length - 10; r < data.length; r++) {
        if (data[r]) {
            const str = data[r].join(" ").toUpperCase();
            if (str.includes("TURNO")) {
                shiftMetadata = str.trim();
                // Try to refine start/end from this authoritative line
                const timeMatch = str.match(/(\d{2}:\d{2})\s*A\s*(\d{2}:\d{2})/);
                if (timeMatch) {
                    earliest = timeMatch[1];
                    latest = timeMatch[2];
                }
                break;
            }
        }
    }

    // Construct Service Data
    // NOTE: 'routeData' here is massive (all stops of all trips). 
    // Usually we want just the SEQUENCE Pattern, not every single time execution.
    // For "ServiceDefinition", we need the GENERAL start/end.

    return {
        lineCode,
        serviceNumber,
        variant: 'A', // Default
        startTime: earliest,
        endTime: latest,
        durationMinutes: calculateDuration(earliest, latest),
        routeData: allStopTimes.slice(0, stops.length), // Just take first trip as "Sample Pattern"
        dayType: 'HABIL',
        // metadata: shiftMetadata // Store this if UI supports it
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
