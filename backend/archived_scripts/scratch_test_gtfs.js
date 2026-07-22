import { gtfsService } from './src/services/gtfsService';

async function test() {
  try {
    console.log("Probando gtfsService para parada 3413...");
    const data = await gtfsService.getNextDepartures('3413', 5);
    console.log("RESULTADO:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("ERROR EN TEST:", err);
  } finally {
    process.exit(0);
  }
}

test();
