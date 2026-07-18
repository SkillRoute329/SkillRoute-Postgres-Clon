exports.up = async function(knex) {
  await knex.schema.createTable('incident_reports', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('driver_id').notNullable();
    table.string('vehicle_id').notNullable();
    table.string('service_id').nullable();
    
    table.decimal('lat', 10, 7).notNullable();
    table.decimal('lon', 10, 7).notNullable();
    
    table.enum('priority', ['NORMAL', 'MEDIA', 'ALTA', 'CRITICA']).notNullable();
    table.text('message');
    table.string('status').defaultTo('OPEN');
    
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('resolved_at', { useTz: true }).nullable();
    
    table.index(['priority', 'status']);
    table.index(['created_at']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('incident_reports');
};
