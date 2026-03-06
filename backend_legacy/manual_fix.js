const { Pool } = require('pg');

// Usar la variable de entorno de Railway (TROJAN HORSE STRATEGY)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function repair() {
  console.log('🔥 INICIANDO REPARACIÓN MANUAL DE BD...');
  try {
    const client = await pool.connect();

    // 1. Crear Tabla Notification
    console.log('1. Creando tabla Notification...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Notification" (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER REFERENCES "User"(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        read BOOLEAN DEFAULT FALSE,
        "createdAt" TIMESTAMP DEFAULT NOW()
      );
    `);

    // 2. Agregar Columna phoneNumber
    console.log('2. Agregando columna phoneNumber...');
    await client.query(`
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneNumber" VARCHAR(255);
    `);

    console.log('✅ ¡ÉXITO! BASE DE DATOS REPARADA.');
    client.release();
    process.exit(0);
  } catch (err) {
    console.error('❌ ERROR FATAL:', err);
    process.exit(1);
  }
}

repair();
