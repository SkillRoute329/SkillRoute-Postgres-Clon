// prisma.config.ts
import 'dotenv/config'  // Carga automáticamente .env
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),  // Lee DATABASE_URL del .env
  },
})