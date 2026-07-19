import { getImmToken } from './src/services/immEtaService';
import https from 'https';

const API_BASE = 'https://api.montevideo.gub.uy/api/transportepublico/';

async function testImmApi() {
  try {
    const token = await getImmToken();
    console.log('Token obtenido!');

    const res = await new Promise<{status: number, data: string}>((resolve, reject) => {
      https.get(API_BASE + 'buses', { headers: { Authorization: `Bearer ${token}` } }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve({ status: res.statusCode || 500, data: body }));
      }).on('error', reject);
    });

    console.log('Status /buses:', res.status);
    const parsed = JSON.parse(res.data);
    console.log(`Cantidad de buses activos: ${parsed.length}`);
    const ucotBuses = parsed.filter((b: any) => b.company === 'UCOT');
    console.log(`Buses UCOT: ${ucotBuses.length}`);
    
    // Mostremos el primer bus UCOT para ver qué campos tiene
    if (ucotBuses.length > 0) {
      console.log('Ejemplo Bus UCOT:', JSON.stringify(ucotBuses[0], null, 2));
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

testImmApi();
