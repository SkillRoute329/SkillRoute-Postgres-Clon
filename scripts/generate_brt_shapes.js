const fs = require('fs');

const paradasA = [
  { lat: -34.7871, lng: -56.0715 }, // Zonamérica
  { lat: -34.8160, lng: -56.1040 }, // Cno Maldonado
  { lat: -34.8556, lng: -56.1326 }, // Belloni
  { lat: -34.8720, lng: -56.1420 }, // 8 de Octubre / Comercio
  { lat: -34.8774, lng: -56.1478 }, // Propios
  { lat: -34.8870, lng: -56.1620 }, // Dr Luis Morquio
  { lat: -34.8925, lng: -56.1671 }, // Tres Cruces
  { lat: -34.9030, lng: -56.1803 }, // Plaza 33
  { lat: -34.9050, lng: -56.1870 }, // Explanada
  { lat: -34.9056, lng: -56.1942 }, // Plaza Fabini
  { lat: -34.9064, lng: -56.1997 }, // Plaza Independencia
];

const paradasB = [
  { lat: -34.8042, lng: -55.9285 },
  { lat: -34.8138, lng: -55.9415 },
  { lat: -34.8228, lng: -55.9548 },
  { lat: -34.8365, lng: -55.9715 },
  { lat: -34.8508, lng: -55.9953 },
  { lat: -34.8725, lng: -56.0360 },
  { lat: -34.8860, lng: -56.1150 }, // Av. Italia & Propios (Forzado)
  { lat: -34.8925, lng: -56.1671 }, // Tres Cruces
  { lat: -34.9030, lng: -56.1803 }, // Plaza 33
  { lat: -34.9056, lng: -56.1942 }, // Plaza Fabini
  { lat: -34.9064, lng: -56.1997 }, // Plaza Independencia
];

async function getRoute(paradas) {
  const coords = paradas.map(p => p.lng + ',' + p.lat).join(';');
  const url = 'http://router.project-osrm.org/route/v1/driving/' + coords + '?geometries=geojson&overview=full';
  const res = await fetch(url);
  const data = await res.json();
  if (data.code !== 'Ok') throw new Error('OSRM error: ' + data.message);
  // OSRM returns [lng, lat]. We need [lat, lng] for Leaflet polyline.
  return data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
}

async function run() {
  console.log('Fetching A...');
  const shapeA = await getRoute(paradasA);
  console.log('Fetching B...');
  const shapeB = await getRoute(paradasB);
  
  const content = `// Auto-generated BRT Shapes using OSRM
export const BRT_SHAPES: Record<string, [number, number][]> = {
  'A': ${JSON.stringify(shapeA)},
  'B': ${JSON.stringify(shapeB)},
};
`;
  fs.writeFileSync('frontend/src/pages/traffic/data/brtShapes.ts', content);
  console.log('Saved brtShapes.ts successfully.');
}

run().catch(console.error);
