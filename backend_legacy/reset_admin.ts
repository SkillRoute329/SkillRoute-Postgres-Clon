import * as fs from 'fs';
import * as path from 'path';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';

// Manually load .env
try {
  const envPath = path.resolve(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    console.log('Loading .env from:', envPath);
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach((line) => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const val = valueParts
          .join('=')
          .trim()
          .replace(/^["']|["']$/g, '');
        process.env[key.trim()] = val;
      }
    });
  } else {
    console.error('.env file not found at:', envPath);
  }
} catch (e) {
  console.error('Error loading .env:', e);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

console.log('DATABASE_URL loaded:', process.env.DATABASE_URL ? 'YES' : 'NO');

async function resetAdmin() {
  try {
    console.log('Connecting to DB...');

    let targetUser = null;

    // Find admin
    let res = await pool.query(`SELECT * FROM "User" WHERE role = 'Admin' ORDER BY id LIMIT 1`);

    if (res.rows.length === 0) {
      console.log('No user with role=Admin found.');
      // Try to find ANY user
      res = await pool.query(`SELECT * FROM "User" ORDER BY id LIMIT 1`);

      if (res.rows.length > 0) {
        console.log('Found a non-admin user. Promoting to Admin...');
        targetUser = res.rows[0];
        await pool.query('UPDATE "User" SET role = \'Admin\' WHERE id = $1', [targetUser.id]);
      } else {
        console.log('No users found at all. Creating new Admin...');
        const hash = await bcrypt.hash('12345678', 10);
        const insert = await pool.query(
          `
                    INSERT INTO "User" ("internalNumber", "firstName", "lastName", "fullName", "passwordHash", role, "isActive")
                    VALUES ('9999', 'Admin', 'System', 'Admin System', $1, 'Admin', true)
                    RETURNING *
                `,
          [hash],
        );
        targetUser = insert.rows[0];
      }
    } else {
      console.log('Existing Admin found.');
      targetUser = res.rows[0];
    }

    if (targetUser) {
      console.log(`-------------------------------------------`);
      console.log(`TARGET ADMIN: ${targetUser.firstName} ${targetUser.lastName}`);
      console.log(`INTERNAL NUMBER (USUARIO): ${targetUser.internalNumber}`);
      // Reset password
      const newPass = '12345678';
      const hash = await bcrypt.hash(newPass, 10);
      await pool.query('UPDATE "User" SET "passwordHash" = $1, "isActive" = true WHERE id = $2', [
        hash,
        targetUser.id,
      ]);
      console.log(`PASSWORD (CONTRASEÑA): ${newPass}`);
      console.log(`-------------------------------------------`);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

resetAdmin();
