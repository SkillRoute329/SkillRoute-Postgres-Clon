
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../legacy_data');

const carton306Geant = `
TABLA DE HORARIOS - UCOT
LINEA 306 - HACIA GEANT (A)
VIGENCIA 2026

Servicio,Sale,Tres Cruces,Curva,Belloni,Geant
1001,05:00,05:15,05:30,05:45,06:00
1003,0.368055555,09:10,09:25,09:40,10:00
1005,12:00,12:15,12:30,12:45,13:00
`;

const carton306Pte = `
TABLA DE HORARIOS
LINEA 306 - HACIA PTE. CARRASCO (B)

Servicio,Sale,Tres Cruces,Curva,Belloni,Pte. Carrasco
1002,05:15,05:30,05:45,06:00,06:15
1004,10:00,10:15,10:30,10:45,11:00
`;

const daily = `
ASIGNACION DIARIA - 21/01/2026

Línea,Servicio,Coche,Conductor,Sale
306,1001,64,1001,05:00
306,1002,65,1002,05:15
306,1003,10,1003,08:50
300,555,64,1001,21:00
`; // Note: Coche 64 assigned to 300 later

fs.writeFileSync(path.join(dir, 'CARTON_LINEA_306_GEANT.csv'), carton306Geant.trim());
fs.writeFileSync(path.join(dir, 'CARTON_LINEA_306_PTE_CARRASCO.csv'), carton306Pte.trim());
fs.writeFileSync(path.join(dir, 'R-21.01.2026_COCHES_Y_SERVICIOS.csv'), daily.trim());

console.log("Mock data created in backend/legacy_data/");
