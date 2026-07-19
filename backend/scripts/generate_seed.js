const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');

async function generate() {
  const docxPath = 'C:/Users/jonat/Desktop/doc Ucot/FLOTA1-1.docx';
  const csvPath = 'C:/Users/jonat/Desktop/PROYECTOS/TRANFORMABOOT/scripts/conductores_raw.csv';
  
  // 1. Parse DOCX (Vehiculos)
  const docxResult = await mammoth.extractRawText({ path: docxPath });
  const docxLines = docxResult.value.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  const vehiculos = [];
  // Skip headers if they are 'Coche' and 'Marca'
  let startIndex = 0;
  if (docxLines[0] === 'Coche' && docxLines[1] === 'Marca') {
    startIndex = 2;
  }
  
  for (let i = startIndex; i < docxLines.length; i += 2) {
    const interno = docxLines[i];
    const marca = docxLines[i+1] || 'Desconocida';
    if (!isNaN(parseInt(interno))) {
      vehiculos.push({ interno, marca });
    }
  }

  // 2. Parse CSV (Personal)
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const csvLines = csvContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  const personal = [];
  let pastHeader = false;
  
  for (const line of csvLines) {
    if (line.includes('Número de Interno') || line.includes('LISTADO DE LINEAS')) {
      if (line.includes('Número de Interno')) pastHeader = true;
      continue;
    }
    if (!pastHeader) continue;
    
    // Some lines at the bottom might not have internally formatted numbers
    const parts = line.split(',');
    const interno = parts[0]?.trim();
    const nombre = parts[1]?.trim();
    const cargo = parts[2]?.trim();
    const telefono = parts[3]?.trim();
    
    if (interno && nombre && !isNaN(parseInt(interno))) {
       personal.push({ interno, nombre, cargo, telefono });
    }
  }

  const output = { vehiculos, personal };
  fs.writeFileSync(
    path.join(__dirname, '../data/initial_seed.json'), 
    JSON.stringify(output, null, 2)
  );
  
  console.log(`Generated seed with ${vehiculos.length} vehiculos and ${personal.length} personal.`);
}

generate().catch(console.error);
