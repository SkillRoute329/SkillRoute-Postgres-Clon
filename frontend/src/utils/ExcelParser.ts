
import * as XLSX from 'xlsx';

export interface ParsedData {
    lines: { code: string; name: string }[];
    services: {
        lineCode: string;
        serviceNumber: string;
        startTime: string; // HH:mm
        durationMinutes: number; // calculated or default
    }[];
}

export const ExcelParser = {
    parse: async (file: File): Promise<ParsedData> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });

                    // Assume first sheet is the target
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];

                    const jsonData: any[] = XLSX.utils.sheet_to_json(sheet);

                    if (jsonData.length === 0) {
                        return reject(new Error("El archivo Excel está vacío."));
                    }

                    // Extract Lines (Unique)
                    const uniqueLines = new Set<string>();
                    const services: any[] = [];

                    jsonData.forEach((row, index) => {
                        // Adapt these keys to what represents the data in the Excel
                        // Heuristics for column detection
                        const lineCode = String(row['Línea'] || row['Linea'] || row['LINEA'] || '??').trim();
                        const serviceNum = String(row['Servicio'] || row['SERVICIO'] || row['Turno'] || '??').trim();
                        const timeStr = String(row['Hora'] || row['HORA'] || row['Salida'] || '00:00').trim();

                        if (lineCode !== '??' && serviceNum !== '??') {
                            uniqueLines.add(lineCode);
                            services.push({
                                lineCode: lineCode,
                                serviceNumber: serviceNum,
                                startTime: formatTime(timeStr),
                                durationMinutes: 60 // Default, can be refined
                            });
                        }
                    });

                    const parsedLines = Array.from(uniqueLines).map(code => ({
                        code,
                        name: `Línea ${code}`
                    }));

                    resolve({
                        lines: parsedLines,
                        services: services
                    });

                } catch (error) {
                    reject(error);
                }
            };

            reader.onerror = (error) => reject(error);
            reader.readAsArrayBuffer(file);
        });
    }
};

function formatTime(val: string): string {
    // Basic normalization for Excel time serials or strings
    if (!val) return '00:00';
    // If it's a decimal (Excel time), convert?
    // For now assuming string HH:mm
    return val;
}
