import * as dotenv from 'dotenv';
dotenv.config();

export default {
  development: {
    client: 'pg',
    connection: {
      host: '192.168.1.11',
      port: 5432,
      database: 'skillroute_master',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASS || 'postgres'
    },
    migrations: {
      directory: './migrations'
    },
    pool: {
      min: 10,
      max: 100,
      idleTimeoutMillis: 30000
    }
  },
  production: {
    client: 'pg',
    connection: {
      host: '192.168.1.11',
      port: 5432,
      database: 'skillroute_master',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASS || 'postgres'
    },
    migrations: {
      directory: './migrations'
    },
    pool: {
      min: 10,
      max: 100,
      idleTimeoutMillis: 30000
    }
  }
};
