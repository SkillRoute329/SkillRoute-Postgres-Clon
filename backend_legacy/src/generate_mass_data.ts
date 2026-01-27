
import fs from 'fs';
import path from 'path';

const DATA_DIR = 'c:/Users/jonat/Desktop/trasnfomaFacil2.0/TransformaFacil-2.0/backend/legacy_data';

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const ROUTES = [
    '300', '316', '370', '329', 'L13',
    '106', '110', '111', '112', '113',
    '115', '121', '141', '142', '144',
    '405', '407', 'CA1', '306', 'L1'
];

const generateCarton = (line: string, variant: string) => {
    return `TABLA DE HORARIOS - UCOT
LINEA ${line} - ${variant}
VIGENCIA 2026

Servicio,Sale,P1,P2,P3,P4,Llegada
1001,05:00,05:10,05:20,05:30,05:40,05:50
1003,06:00,06:10,06:20,06:30,06:40,06:50
1005,07:00,07:15,07:30,07:45,08:00,08:15
1007,08:00,08:15,08:30,08:45,09:00,09:15
1009,09:00,09:15,09:30,09:45,10:00,10:15
${Math.random() > 0.5 ? '1011,10:00,10:15,10:30,10:45,11:00,11:15' : ''}
`;
};

// Generate Cartones
ROUTES.forEach(route => {
    fs.writeFileSync(path.join(DATA_DIR, `BOLETIN_LINEA_${route}a.csv`), generateCarton(route, 'IDA'));
    fs.writeFileSync(path.join(DATA_DIR, `BOLETIN_LINEA_${route}b.csv`), generateCarton(route, 'VUELTA'));
});

// Generate Daily Fleet Report
let dailyContent = `ASIGNACION DIARIA - 21/01/2026
Línea,Servicio,Coche,Conductor,Sale
`;

let carCounter = 1;
ROUTES.forEach(route => {
    // Generate ~8 shifts per route
    for (let i = 0; i < 8; i++) {
        const car = carCounter++;
        dailyContent += `${route},${1000 + i},${car},${5000 + i},0${5 + i}:00\n`;
    }
});

// Add specific QA case: Car 64 on Line 300
dailyContent += `300,5555,64,9999,21:00\n`;

fs.writeFileSync(path.join(DATA_DIR, 'R-21.01.2026_COCHES_Y_SERVICIOS.csv'), dailyContent);

console.log(`✅ Generated ${ROUTES.length * 2} Cartones + 1 Daily Report with ${carCounter} vehicles.`);
