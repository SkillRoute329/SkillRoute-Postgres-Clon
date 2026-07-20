import { IMMDataPipeline } from '../src/modules/gtfs-core/jobs/immDataPipeline';
import db from '../src/config/database';

async function run() {
  try {
    console.log('Testing IMMDataPipeline overlap calculation...');
    await IMMDataPipeline.precalculateCompetitorOverlap();
    console.log('Done!');
  } catch(e) {
    console.error(e);
  } finally {
    db.destroy();
  }
}
run();
