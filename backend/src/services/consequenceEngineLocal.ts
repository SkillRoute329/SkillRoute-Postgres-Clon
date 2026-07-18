// Motor transaccional 100% offline (PostgreSQL)

export async function propagarEventoLocal(db: any, evento: any) {
    return await db.transaction(async (trx: any) => {
        const [eventoDb] = await trx('vehicle_events').insert({
            coche_id: evento.cocheId,
            tipo_evento: evento.tipo,
            fecha_hora: db.fn.now(),
            detalles: JSON.stringify(evento)
        }).returning('*');

        const efectos = [
            { dominio: 'OTP', severidad: 'advertencia', titulo: 'Retraso de línea', requiereAccion: false }
        ];

        if (efectos.length > 0) {
            await trx('consecuencias_operativas').insert(
                efectos.map(e => ({
                    evento_origen_id: eventoDb.id,
                    dominio: e.dominio,
                    severidad: e.severidad,
                    titulo: e.titulo,
                    delta_valor: 0,
                    entidad_afectada_id: '123',
                    requiere_accion_humana: e.requiereAccion
                }))
            );
        }
        
        return efectos;
    });
}
