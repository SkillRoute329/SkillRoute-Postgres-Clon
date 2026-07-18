// Bypass de Firebase Cloud Messaging - Despacho nativo por Intranet vía WebSockets

export async function notificarInspectoresDesvio(db: any, io: any, cocheId: string, lineaId: string, lat: number, lng: number, metrosDistancia: number) {
  const inspectores = await db('personnel_roster')
    .where('rol', 'INSPECTOR')
    .andWhere('estado', 'ACTIVO')
    .andWhere('corredor_asignado', lineaId)
    .select('id', 'socket_id');

  const payload = {
    tipo: 'DESVIO_NO_AUTORIZADO',
    coche_id: cocheId,
    linea_id: lineaId,
    metros: Math.round(metrosDistancia),
    lat,
    lng,
    timestamp: new Date().toISOString()
  };

  inspectores.forEach((inspector: any) => {
    if (inspector.socket_id) {
      io.to(inspector.socket_id).emit('alerta_trafico_urgente', payload);
    } else {
      io.to(`linea_${lineaId}_control`).emit('alerta_trafico_urgente', payload);
    }
  });
  
  console.log(`[Offline Alert] Coche ${cocheId} a ${metrosDistancia}m. Notificación emitida vía WS.`);
}
