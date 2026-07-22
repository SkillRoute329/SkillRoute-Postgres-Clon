import sqlDb from './src/config/database';

async function main() {
  try {
    const exists = await sqlDb.schema.hasTable('control_zones');
    if (!exists) {
      await sqlDb.schema.createTable('control_zones', (table) => {
        table.uuid('id').primary().defaultTo(sqlDb.raw('gen_random_uuid()'));
        table.string('name').notNullable();
        table.integer('maxSpeed').notNullable();
        table.jsonb('polygon').notNullable();
        table.boolean('active').defaultTo(true);
        table.timestamp('created_at').defaultTo(sqlDb.fn.now());
      });
      console.log('Table control_zones created successfully');
    } else {
      console.log('Table control_zones already exists');
    }
  } catch (err) {
    console.error('Error creating table:', err);
  } finally {
    sqlDb.destroy();
  }
}

main();
