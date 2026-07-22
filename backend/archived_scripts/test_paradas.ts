import { getLineGeometry } from './src/services/gtfsService';

async function test() {
  const result = await getLineGeometry('70', '316', 0);
  console.log("Stops count:", result.paradas ? result.paradas.length : 'no paradas');
  process.exit(0);
}
test();
