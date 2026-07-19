import { getConductoresDia, getTurnosByFecha, buscarVehiculosReserva } from '../src/services/listeroService';

async function test() {
  const hoy = new Date().toISOString().split('T')[0];
  console.log('--- Conductores ---');
  const conductores = await getConductoresDia(hoy);
  console.log(conductores);

  console.log('\n--- Vehiculos Reserva ---');
  const vehiculos = await buscarVehiculosReserva(hoy);
  console.log(vehiculos);
  
  process.exit(0);
}

test().catch(console.error);
