// prisma.config.ts
import 'dotenv/config'  // Carga automáticamente .env
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL') || 'postgresql://dummy:dummy@localhost:5432/dummy',
  },
})