import sqlDb from './src/config/database';

async function test() {
  try {
    const targetRoutes = await sqlDb('gtfs.routes')
       .where('route_short_name', '316')
       .select('route_id', 'route_long_name');
       
    console.log("GTFS routes for 316:", targetRoutes);
    
    const routeIds = targetRoutes.map(r => r.route_id);
    
    const competitors = await sqlDb('gtfs.competitor_overlap')
      .whereIn('base_route_id', routeIds)
      .andWhere('base_direction_id', 0) // direction 0
      .orderBy('shared_stops_count', 'desc')
      .limit(5);
      
    console.log("Competitors for 316 (Ida):", competitors);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}

test();
