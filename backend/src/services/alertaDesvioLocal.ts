import { Knex } from 'knex';
import { Server } from 'socket.io';

export async function notificarInspectoresDesvio(
  db: Knex, 
  io: Server, 
  cocheId: string, 
  lineaId: string, 
  lat: number, 
  lng: number, 
  metrosDistancia: number
): Promise<void> {
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

  inspectores.forEach((inspector: { id: string; socket_id: string | null }) => {
    if (inspector.socket_id) {
      io.to(inspector.socket_id).emit('alerta_trafico_urgente', payload);
    } else {
      io.to(`linea_${lineaId}_control`).emit('alerta_trafico_urgente', payload);
    }
  });
  
  console.log(`[Offline Alert] Coche ${cocheId} a ${metrosDistancia}m. Notificación emitida vía WS.`);
}
