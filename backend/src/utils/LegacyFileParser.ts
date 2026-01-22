
import * as xlsx from 'xlsx';

export interface ParsedData {
    type: 'CARTON' | 'BOLETIN' | 'DAILY' | 'UNKNOWN';
    metadata: any;
    data: any[];
}

export const excelDateToJS = (serial: number | string): string => {
    // If string already has colon, assume it's "HH:MM"
    if (typeof serial === 'string' && serial.includes(':')) {
        return serial.trim();
    }

    // If number (Excel serial date like 0.25 -> 06:00:00)
    const val = Number(serial);
    if (isNaN(val)) return '';

    const totalSeconds = Math.floor(val * 86400);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

export const LegacyFileParser = async (buffer: Buffer, filename: string): Promise<ParsedData> => {
    const wb = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rawData: any[][] = xlsx.utils.sheet_to_json(ws, { header: 1 });

    // 1. Detection Strategy
    const filenameUpper = filename.toUpperCase();
    let type: ParsedData['type'] = 'UNKNOWN';

    if (filenameUpper.includes('CARTON')) type = 'CARTON';
    else if (filenameUpper.includes('BOLETIN')) type = 'BOLETIN';
    else if (filenameUpper.includes('COCHES Y SERVICIOS') || filenameUpper.includes('DIARIO')) type = 'DAILY';

    // 2. Header Skipping Logic
    let headerRowIndex = 0;

    if (type === 'CARTON') {
        // Look for row starting with 'Servicio' or similar
        headerRowIndex = rawData.findIndex(row => row && row.some((cell: any) => String(cell).toUpperCase().includes('SERVICIO') || String(cell).toUpperCase().includes('SALE')));
    } else if (type === 'DAILY') {
        // Look for 'Coche', 'Scio'
        headerRowIndex = rawData.findIndex(row => row && row.some((cell: any) => String(cell).toUpperCase().includes('COCHE')));
    }

    if (headerRowIndex === -1) headerRowIndex = 0; // Fallback

    const headers = (rawData[headerRowIndex] as string[] || []).map(h => h ? String(h).trim().replace(/\r\n/g, '') : '');
    const body = rawData.slice(headerRowIndex + 1);

    // 3. Transform Body to JSON with proper keys
    const finalData = body.map(row => {
        const obj: any = {};
        headers.forEach((h, i) => {
            if (h) {
                const cellVal = row[i];
                // Heuristic: If detecting Carton/Daily and headers implies time
                // Improved check: if the column looks like a time column
                const isTimeCol = type === 'CARTON' && (h.toUpperCase().includes('SALE') || i > 1);
                const isSaleCol = type === 'DAILY' && h.toUpperCase().includes('SALE');

                if ((isTimeCol || isSaleCol) && cellVal !== undefined && cellVal !== null) {
                    obj[h] = excelDateToJS(cellVal);
                } else {
                    obj[h] = cellVal;
                }
            }
        });
        // Filter out empty rows (sometimes Excel has phantom rows)
        return Object.values(obj).some(v => v !== undefined && v !== null && v !== '') ? obj : null;
    }).filter(r => r !== null);

    return {
        type,
        metadata: { filename, sheetName, detectedHeaderRow: headerRowIndex },
        data: finalData
    };
};
