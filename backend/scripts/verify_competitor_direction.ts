import sqlDb from '../src/config/database';

async function verify() {
  const baseLine = '306';
  const competitorLine = '195';
  const baseDir = 0; // Ida

  console.log(`\n=== VERIFICACIÓN MATEMÁTICA GTFS: ${baseLine} vs ${competitorLine} ===`);

  try {
    // 1. Obtener los route_ids
    const baseRoutes = await sqlDb('gtfs.routes').where('route_short_name', baseLine).select('route_id');
    const compRoutes = await sqlDb('gtfs.routes').where('route_short_name', competitorLine).select('route_id');

    const baseRouteId = baseRoutes[0]?.route_id;
    const compRouteId = compRoutes[0]?.route_id;

    console.log(`[Rutas] Base (${baseLine}): ${baseRouteId} | Competidor (${competitorLine}): ${compRouteId}`);

    if (!baseRouteId || !compRouteId) {
      console.log('Faltan rutas en GTFS.');
      process.exit(1);
    }

    // 2. Obtener el overlap para determinar qué sentido del competidor cruza con nuestro sentido 0 (Ida)
    const overlaps = await sqlDb('gtfs.competitor_overlap')
      .where('base_route_id', baseRouteId)
      .andWhere('competitor_route_id', compRouteId);

    console.log(`\n[Solapamiento Oficial (Competitor Overlap)]`);
    let targetCompDir = -1;
    overlaps.forEach(o => {
      console.log(` - Nuestro sentido ${o.base_direction_id} compite fuertemente con el sentido ${o.competitor_direction_id} del competidor (Paradas compartidas: ${o.shared_stops_count})`);
      if (o.base_direction_id === baseDir) targetCompDir = o.competitor_direction_id;
    });

    if (targetCompDir === -1) {
      console.log('No hay solapamiento registrado para nuestra Ida.');
    }

    // 3. Obtener variantes (shapes) del competidor
    console.log(`\n[Variantes del Competidor (${competitorLine})]`);
    const compVariants = await sqlDb('gtfs.trips as t')
      .join('gtfs.routes as r', 't.route_id', 'r.route_id')
      .where('r.route_short_name', competitorLine)
      .select('t.shape_id', 't.direction_id')
      .distinct();

    const variantsByDir: any = { 0: [], 1: [] };
    compVariants.forEach(v => {
      if (v.direction_id !== null && v.shape_id !== null) {
         variantsByDir[v.direction_id].push(v.shape_id);
      }
    });

    console.log(` - Variantes que van hacia Sentido 0:`, variantsByDir[0]);
    console.log(` - Variantes que van hacia Sentido 1:`, variantsByDir[1]);

    // 4. Conclusión
    console.log(`\n[CONCLUSIÓN MATEMÁTICA]`);
    console.log(`Si un coche en vivo de la línea ${competitorLine} reporta la variante ${variantsByDir[targetCompDir]?.[0] || 'X'} (o cualquier otra del Sentido ${targetCompDir}),`);
    console.log(`estamos 100% seguros de que pertenece a nuestro mapa de Ida (Sentido ${baseDir}), sin importar si geográficamente está más cerca o más lejos en este momento.`);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

verify();
