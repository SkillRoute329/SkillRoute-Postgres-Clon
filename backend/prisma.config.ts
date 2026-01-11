// prisma.config.ts for Prisma 7
import { defineConfig } from 'prisma/config'

export default defineConfig({
    schema: 'prisma/schema.prisma',
    datasource: {
        // We use process.env instead of the 'env' helper to avoid strict build-time validation errors in Railway
        url: process.env.DATABASE_URL || 'postgresql://dummy:dummy@localhost:5432/dummy',
    },
})
