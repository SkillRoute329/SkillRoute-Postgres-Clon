import { db } from './src/config/firebase';
async function main() {
  try {
    const cols = await db.listCollections();
    console.log('Collections:', cols.map((c) => c.id).join(', '));
  } catch (err) {
    console.error('Error listing collections:', err);
  }
}
main();
