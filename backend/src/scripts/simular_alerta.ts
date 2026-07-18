import knex from 'knex';

const db = knex({
  client: 'pg',
  connection: {
    host: '127.0.0.1',
    port: 5432,
    user: 'postgres',
    password: 'I0SAv9zhoQDUfTPc7L+KmkAw',
    database: 'skillroute_master'
  }
});

// Función de cruce de negocio (Controlador Central Antifatiga)
async function procesarAlertas(busId: string, adherenciaGps: number, isInsideDeviation: boolean) {
  // En lugar de tablas reales si no existen, simulamos el join con WITH (CTE)
  // para demostrar la ejecución real en PostgreSQL
  const query = db.with('vehicle_events_sim', db.raw(`SELECT ? as id_bus, ? as adherencia, ? as intersecta_desvio`, [busId, adherenciaGps, isInsideDeviation]))
    .with('maintenance_logs_sim', db.raw(`SELECT '1047' as bus_id, 'EN_REPARACION' as status UNION SELECT '1048' as bus_id, 'OK' as status`))
    .with('personnel_roster_sim', db.raw(`SELECT '1049' as assigned_bus_id, 'BAJA_PERSONAL' as status UNION SELECT '1047' as assigned_bus_id, 'ASIGNADO' as status`))
    .select(
      've.id_bus', 
      've.adherencia', 
      've.intersecta_desvio',
      'ml.status as estado_taller',
      'pr.status as estado_listero'
    )
    .from('vehicle_events_sim as ve')
    .leftJoin('maintenance_logs_sim as ml', 've.id_bus', 'ml.bus_id')
    .leftJoin('personnel_roster_sim as pr', 've.id_bus', 'pr.assigned_bus_id');

  const rawData = await query;
  
  if (rawData.length === 0) return { error: 'No data' };
  
  const coche = rawData[0];
  let estadoFinal = 'Alerta: Fuera de Ruta';
  let omitirAlerta = false;

  // Matriz de Control Antifatiga
  if (coche.adherencia < 70 && String(coche.intersecta_desvio) === 'true') {
    estadoFinal = 'Desvío Justificado (Polígono IMM)';
    omitirAlerta = true;
  } else if (coche.estado_taller === 'EN_REPARACION') {
    estadoFinal = 'En Mantenimiento (Validado por Taller)';
    omitirAlerta = true;
  } else if (coche.estado_listero === 'BAJA_PERSONAL') {
    estadoFinal = 'Servicio Cancelado (Falta de Personal)';
    omitirAlerta = true;
  }

  return {
    timestamp: new Date().toISOString(),
    id_coche: coche.id_bus,
    metricas_crudas: {
      adherencia_gps: coche.adherencia + '%',
      intersecta_poligono: coche.intersecta_desvio,
      reporte_taller: coche.estado_taller || 'SIN_DATOS',
      reporte_listero: coche.estado_listero || 'SIN_DATOS'
    },
    decision_orquestador: {
      estado_aprobado: estadoFinal,
      emitir_alarma_visual: !omitirAlerta,
      accion: omitirAlerta ? 'Silenciar Dashboard' : 'Disparar Notificación'
    }
  };
}

async function runTest() {
  try {
    // Simulamos Coche 1047: Adherencia 0%, pero está EN_REPARACION
    const resultReparacion = await procesarAlertas('1047', 0, false);
    
    // Simulamos Coche 1049: Adherencia 0%, sin chofer
    const resultListero = await procesarAlertas('1049', 0, false);
    
    // Simulamos Coche 1048: Adherencia 50%, intercepta desvío de la IMM
    const resultDesvio = await procesarAlertas('1048', 50, true);

    console.log(JSON.stringify({
      prueba_taller: resultReparacion,
      prueba_listero: resultListero,
      prueba_desvio: resultDesvio
    }, null, 2));

  } catch (error) {
    console.error("Error executing query:", error);
  } finally {
    db.destroy();
  }
}

runTest();
