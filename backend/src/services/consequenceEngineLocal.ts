import { Knex } from 'knex';

export interface EventoOperativo {
    cocheId: string;
    tipo: string;
    [key: string]: unknown;
}

export interface EfectoConsecuencia {
    dominio: string;
    severidad: string;
    titulo: string;
    requiereAccion: boolean;
}

export async function propagarEventoLocal(db: Knex, evento: EventoOperativo): Promise<EfectoConsecuencia[]> {
    return await db.transaction(async (trx: Knex.Transaction) => {
        const [eventoDb] = await trx('vehicle_events').insert({
            coche_id: evento.cocheId,
            tipo_evento: evento.tipo,
            fecha_hora: db.fn.now(),
            detalles: JSON.stringify(evento)
        }).returning('*');

        const efectos: EfectoConsecuencia[] = [
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
