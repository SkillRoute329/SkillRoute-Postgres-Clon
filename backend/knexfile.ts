import * as dotenv from 'dotenv';
dotenv.config();

export default {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 5433,
      database: process.env.DB_NAME || 'skillroute_soberano',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASS || 'Skill329'
    },
    migrations: {
      directory: './migrations'
    },
    seeds: {
      directory: './seeds'
    },
    pool: {
      min: 10,
      max: 100,
      acquireTimeoutMillis: 5000,
      createTimeoutMillis: 8000,
      idleTimeoutMillis: 10000
    }
  },
  production: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 5433,
      database: process.env.DB_NAME || 'skillroute_soberano',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASS || 'Skill329'
    },
    migrations: {
      directory: './migrations'
    },
    seeds: {
      directory: './seeds'
    },
    pool: {
      min: 10,
      max: 100,
      acquireTimeoutMillis: 5000,
      createTimeoutMillis: 8000,
      idleTimeoutMillis: 10000
    }
  }
};
