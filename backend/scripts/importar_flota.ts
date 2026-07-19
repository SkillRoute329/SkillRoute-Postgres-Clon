import fs from 'fs';
import path from 'path';
import sqlDb from '../src/config/database'; // Ajusta si la ruta es diferente, asumiendo root backend/scripts/

async function run() {
  console.log('Iniciando ingesta de flota...');
  
  const rawText = fs.readFileSync(path.join(__dirname, 'flota_raw.txt'), 'utf8');
  const lineas = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  const vehiculos = [];
  
  let currentCoche = null;
  let i = 0;
  
  // Ignoramos encabezados 'Coche' y 'Marca' si están al principio
  if (lineas[0] === 'Coche' && lineas[1] === 'Marca') {
    i = 2;
  }
  
  while (i < lineas.length) {
    const l = lineas[i];
    
    // Si la línea es un número, asumimos que es el número de interno (coche)
    if (/^\d+$/.test(l)) {
      currentCoche = l;
      
      // La siguiente línea DEBERÍA ser la marca
      let marca = lineas[i+1] || 'Desconocido';
      
      // Manejar el caso del sufijo "-Cummins" que cayó en otra línea
      if (lineas[i+2] === '-Cummins') {
        marca += ' Cummins';
        i += 3;
      } else {
        i += 2;
      }
      
      vehiculos.push({
        id: currentCoche,
        agency_id: '70', // UCOT por defecto en el clon
        data_jsonb: JSON.stringify({
          marca: marca,
          linea_habitual: '300', // Valor por defecto
          tipo: 'diesel'
        })
      });
      
    } else {
      // Ignorar basuras o textos perdidos
      i++;
    }
  }
  
  console.log(`Se detectaron ${vehiculos.length} vehículos en el archivo DOCX.`);
  
  let insertados = 0;
  for (const v of vehiculos) {
    try {
      await sqlDb('vehiculos')
        .insert(v)
        .onConflict('id')
        .merge(['data_jsonb']);
      insertados++;
    } catch(e) {
      console.error(`Error al insertar coche ${v.id}:`, e.message);
    }
  }
  
  console.log(`\n¡Ingesta completada! ${insertados}/${vehiculos.length} guardados en PostgreSQL.`);
  process.exit(0);
}

run().catch(console.error);
