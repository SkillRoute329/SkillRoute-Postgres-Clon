import sqlDb from '../src/config/database';
import axios from 'axios';

// Función auxiliar para calcular distancia (Haversine)
function haversineMetros(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function runSimulation() {
  console.log("==========================================================");
  console.log(" SIMULADOR DE CENTRO DE MONITOREO - LIVE COMPETITIVE RADAR ");
  console.log("==========================================================");
  
  console.log("\n[1] Obteniendo posiciones GPS reales del STM en vivo...");
  let busesAPI: any[] = [];
  try {
     const stmRes = await axios.post('https://www.montevideo.gub.uy/buses/rest/stm-online', {
       empresa: -1
     }, {
       headers: {
         'Content-Type': 'application/json'
       }
     });
     
     // STM API devuelve FeatureCollection
     if (stmRes.data && stmRes.data.features) {
        busesAPI = stmRes.data.features.map((f: any) => ({
           id: f.properties.id,
           codigoEmpresa: f.properties.codigoEmpresa,
           empresa: "Test",
           codigoBus: f.properties.codigoBus,
           variante: f.properties.variante,
           linea: f.properties.linea,
           destino: f.properties.destinoDesc,
           destinoDesc: f.properties.destinoDesc,
           lat: f.geometry.coordinates[1],
           lng: f.geometry.coordinates[0]
        }));
     }
     console.log(` -> OK. Recibidos ${busesAPI.length} ómnibus en vivo.`);
  } catch (err) {
     console.error(" Error obteniendo GPS", err.message);
     process.exit(1);
  }

  const lineasABuscar = ['306', '145', '370', '192', '329'];
  console.log(`\n[2] Inicializando monitoreo de 5 líneas de prueba: ${lineasABuscar.join(', ')}`);

  const searchRadius = 1500;
  
  for (const baseRouteShortName of lineasABuscar) {
      console.log(`\n-----------------------------------------------------------`);
      console.log(`🎯 ANALIZANDO LÍNEA: ${baseRouteShortName}`);
      
      const baseRoutes = await sqlDb('gtfs.routes').where('route_short_name', baseRouteShortName).select('route_id');
      if (baseRoutes.length === 0) {
          console.log(` -> Advertencia: Línea ${baseRouteShortName} no encontrada en GTFS local.`);
          continue;
      }
      const baseRouteId = baseRoutes[0].route_id;

      const overlapsIda = await sqlDb('gtfs.competitor_overlap').where({ base_route_id: baseRouteId, base_direction_id: 0 });
      const overlapsVuelta = await sqlDb('gtfs.competitor_overlap').where({ base_route_id: baseRouteId, base_direction_id: 1 });
      const officialCompetitors = [...overlapsIda, ...overlapsVuelta];

      const uniqueCompIds = Array.from(new Set(officialCompetitors.map(c => c.competitor_route_id)));
      
      const competitorVariantMaps: Record<string, Record<string, number>> = {};
      for (const compId of uniqueCompIds) {
          const r = await sqlDb('gtfs.routes').where('route_id', compId).first();
          if (!r) continue;
          
          const trips = await sqlDb('gtfs.trips').where('route_id', compId).select('shape_id', 'direction_id').distinct();
          const mapping: Record<string, number> = {};
          trips.forEach(t => { if (t.shape_id) mapping[t.shape_id] = t.direction_id; });
          competitorVariantMaps[r.route_short_name] = mapping;
      }

      const busesDeLineaSeleccionada = busesAPI.filter((b: any) => b.linea.replace(/[ab]$/i, '') === baseRouteShortName);
      if (busesDeLineaSeleccionada.length === 0) {
          console.log(` -> 0 coches activos de la línea ${baseRouteShortName}. Saltando.`);
          continue;
      }

      const destinos = Array.from(new Set(busesDeLineaSeleccionada.map((b: any) => b.destinoDesc?.trim() || b.destino)));
      const destIda = destinos[0] || 'Ida';
      const destVuelta = destinos[1] || 'Vuelta';

      const isIda = (b: any) => (b.destinoDesc?.trim() || b.destino) === destIda;
      
      const serviciosRivales = busesAPI.filter((b: any) => b.linea.replace(/[ab]$/i, '') !== baseRouteShortName);

      console.log(` -> Coches Propios Activos: ${busesDeLineaSeleccionada.length} (Ida: ${busesDeLineaSeleccionada.filter(isIda).length}, Vuelta: ${busesDeLineaSeleccionada.length - busesDeLineaSeleccionada.filter(isIda).length})`);
      
      // 1. MACRO MATCHES
      const macroMatches: any[] = [];
      for (const r of serviciosRivales) {
          const baseRivalLine = r.linea.replace(/[ab]$/i, '');
          const rivalVariantMap = competitorVariantMaps[baseRivalLine];
          let rivalActualDirId = -1;
          if (rivalVariantMap && r.variante !== undefined) {
             rivalActualDirId = rivalVariantMap[r.variante.toString()];
          }
          
          let officialComp = officialCompetitors.find(c => {
             const compRouteStr = Object.keys(competitorVariantMaps).find(k => k === baseRivalLine);
             return compRouteStr && c.competitor_direction_id === rivalActualDirId;
          });
          
          if (!officialComp) continue; 
          
          let minDistance = Infinity;
          let minIdaDist = Infinity;
          let minVueltaDist = Infinity;
          
          for (const miBus of busesDeLineaSeleccionada) {
            const d = haversineMetros(miBus.lat, miBus.lng, r.lat, r.lng);
            if (d < minDistance) minDistance = d;
            if (isIda(miBus)) { if (d < minIdaDist) minIdaDist = d; }
            else { if (d < minVueltaDist) minVueltaDist = d; }
          }
          
          let assignedDestino = minIdaDist <= minVueltaDist ? destIda : destVuelta;
          if (rivalActualDirId !== -1 && officialComp) {
             assignedDestino = officialComp.base_direction_id === 0 ? destIda : destVuelta;
          }
          
          macroMatches.push({
            linea: r.linea, codigoBus: r.codigoBus,
            assignedDestino,
            rivalActualDirId, baseDirAsignado: officialComp.base_direction_id,
            threatScore: 50 + (officialComp.shared_stops_count * 2)
          });
      }
      
      const macroIda = macroMatches.filter(m => m.assignedDestino === destIda);
      const macroVuelta = macroMatches.filter(m => m.assignedDestino === destVuelta);
      
      console.log(` -> MACRO: Rivales asignados a mapa IDA (${destIda}): ${macroIda.length}`);
      console.log(` -> MACRO: Rivales asignados a mapa VUELTA (${destVuelta}): ${macroVuelta.length}`);
      
      // 2. SIMULAR SELECCIÓN IDA
      const cocheIdaSeleccionado = busesDeLineaSeleccionada.find(isIda);
      if (cocheIdaSeleccionado) {
          console.log(`\n --- SIMULANDO CLICK: Coche IDA #${cocheIdaSeleccionado.codigoBus} ---`);
          
          const microMatchesIda: any[] = [];
          for (const r of serviciosRivales) {
            const dist = haversineMetros(cocheIdaSeleccionado.lat, cocheIdaSeleccionado.lng, r.lat, r.lng);
            if (dist > searchRadius) continue; 
            
            const baseRivalLine = r.linea.replace(/[ab]$/i, '');
            const rivalVariantMap = competitorVariantMaps[baseRivalLine];
            let rivalActualDirId = -1;
            if (rivalVariantMap && r.variante !== undefined) {
               rivalActualDirId = rivalVariantMap[r.variante.toString()];
            }
            
            let officialComp = officialCompetitors.find(c => {
               const compRouteStr = Object.keys(competitorVariantMaps).find(k => k === baseRivalLine);
               return compRouteStr && c.competitor_direction_id === rivalActualDirId;
            });
            
            let assignedDestino = undefined;
            if (rivalActualDirId !== -1 && officialComp) {
               assignedDestino = officialComp.base_direction_id === 0 ? destIda : destVuelta;
            } else if (officialComp && officialComp.base_direction_id !== undefined) {
               assignedDestino = officialComp.base_direction_id === 0 ? destIda : destVuelta;
            } else {
               let minIdaDist = Infinity;
               let minVueltaDist = Infinity;
               for (const miBus of busesDeLineaSeleccionada) {
                 const d2 = haversineMetros(miBus.lat, miBus.lng, r.lat, r.lng);
                 if (isIda(miBus)) { if (d2 < minIdaDist) minIdaDist = d2; }
                 else { if (d2 < minVueltaDist) minVueltaDist = d2; }
               }
               assignedDestino = minIdaDist <= minVueltaDist ? destIda : destVuelta;
            }
            
            if (assignedDestino !== destIda) continue;

            microMatchesIda.push({ linea: r.linea, codigoBus: r.codigoBus, dist, rivalActualDirId });
          }
          
          console.log(` -> [Panel Ida] Modo MICRO activado: Muestra ${microMatchesIda.length} competidores acechando a este bus.`);
          console.log(` -> [Panel Vuelta] Sigue mostrando los ${macroVuelta.length} rivales MACRO. ¡NO SE VIO AFECTADO!`);
      }
      
      // 3. SIMULAR SELECCIÓN VUELTA
      const cocheVueltaSeleccionado = busesDeLineaSeleccionada.find((b:any) => !isIda(b));
      if (cocheVueltaSeleccionado) {
          console.log(`\n --- SIMULANDO CLICK: Coche VUELTA #${cocheVueltaSeleccionado.codigoBus} ---`);
          const microMatchesVuelta: any[] = [];
          for (const r of serviciosRivales) {
            const dist = haversineMetros(cocheVueltaSeleccionado.lat, cocheVueltaSeleccionado.lng, r.lat, r.lng);
            if (dist > searchRadius) continue; 
            
            const baseRivalLine = r.linea.replace(/[ab]$/i, '');
            const rivalVariantMap = competitorVariantMaps[baseRivalLine];
            let rivalActualDirId = -1;
            if (rivalVariantMap && r.variante !== undefined) {
               rivalActualDirId = rivalVariantMap[r.variante.toString()];
            }
            
            let officialComp = officialCompetitors.find(c => {
               const compRouteStr = Object.keys(competitorVariantMaps).find(k => k === baseRivalLine);
               return compRouteStr && c.competitor_direction_id === rivalActualDirId;
            });
            
            let assignedDestino = undefined;
            if (rivalActualDirId !== -1 && officialComp) {
               assignedDestino = officialComp.base_direction_id === 0 ? destIda : destVuelta;
            } else if (officialComp && officialComp.base_direction_id !== undefined) {
               assignedDestino = officialComp.base_direction_id === 0 ? destIda : destVuelta;
            } else {
               let minIdaDist = Infinity;
               let minVueltaDist = Infinity;
               for (const miBus of busesDeLineaSeleccionada) {
                 const d2 = haversineMetros(miBus.lat, miBus.lng, r.lat, r.lng);
                 if (isIda(miBus)) { if (d2 < minIdaDist) minIdaDist = d2; }
                 else { if (d2 < minVueltaDist) minVueltaDist = d2; }
               }
               assignedDestino = minIdaDist <= minVueltaDist ? destIda : destVuelta;
            }
            
            if (assignedDestino !== destVuelta) continue;

            microMatchesVuelta.push({linea: r.linea, codigoBus: r.codigoBus, dist});
          }
          
          console.log(` -> [Panel Vuelta] Modo MICRO activado: Muestra ${microMatchesVuelta.length} competidores acechando a este bus.`);
          console.log(` -> [Panel Ida] Sigue mostrando los ${macroIda.length} rivales MACRO. ¡NO SE VIO AFECTADO!`);
      }
  }

  process.exit(0);
}

runSimulation();
