import { gtfsService } from './src/modules/gtfs-core/services/gtfsService';

async function test() {
  try {
    const lines = await gtfsService.listLinesForAgency('70');
    console.log("LINES:", lines);
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

test();
