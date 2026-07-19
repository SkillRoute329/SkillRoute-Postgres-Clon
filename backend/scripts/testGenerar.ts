import sqlDb from '../src/config/database';
import * as listeroService from '../src/services/listeroService';
import { v4 as uuidv4 } from 'uuid';

async function testGenerar() {
  const fecha = new Date().toISOString().slice(0, 10);
  const rows = await sqlDb('vehiculos');
  console.log(`Vehiculos found: ${rows.length}`);
  
  let created = 0;
  for (const r of rows) {
    const line = r.data_jsonb?.linea_habitual ?? '300';
    try {
      await listeroService.createTurno({
        fecha,
        vehiculoId: r.id,
        vehiculoInterno: r.id,
        lineaId: line,
        turno: 'mañana',
        horaSalida: '06:00',
        horaLlegadaEstimada: '14:00',
        conductorId: null,
        conductorNombre: null,
        conductorInterno: null,
        servicioId: null,
      } as never);
      created += 1;
    } catch (e) {
      console.log('Error inserting:', e);
    }
  }
  console.log(`Created: ${created} turnos.`);
  
  const turnos = await sqlDb('turnos_dia').count('*');
  console.log(`Total turnos in DB:`, turnos);
  
  process.exit(0);
}

testGenerar();
