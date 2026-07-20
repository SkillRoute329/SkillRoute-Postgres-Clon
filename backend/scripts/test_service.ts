import { gtfsService } from '../src/modules/gtfs-core/services/gtfsService';

async function run() {
  try {
    const lines = await gtfsService.listLinesForAgency('70');
    console.log(`Total lines: ${lines.length}`);
    console.table(lines);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
run();
