require('dotenv').config();

/**
 * knexfile.js — Configuración centralizada de Knex para migraciones y queries.
 * Usado por: scripts/setup_server.js (npx knex migrate:latest)
 *            test_pg.js, db_validator_suite.js (vía require)
 */
module.exports = {
  development: {
    client: 'pg',
    connection: process.env.DATABASE_URL || {
      host: process.env.DB_HOST || '192.168.1.11',
      port: parseInt(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASS,
      database: process.env.DB_NAME || 'skillroute_master',
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './seeds'
    },
    pool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 10000,
      idleTimeoutMillis: 30000
    }
  },
  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL || {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './seeds'
    },
    pool: { min: 2, max: 20 }
  }
};
