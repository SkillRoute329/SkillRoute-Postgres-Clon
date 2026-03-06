import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: true }));
app.use(express.json());

// Health para producción y monitoreo
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'transformafacil-api',
    timestamp: new Date().toISOString(),
  });
});

// SuperAdmin oficial: 329 / admin123. Cualquier otro usuario también se acepta (modo demo).
const SUPERADMIN_USER = '329';
const SUPERADMIN_PASSWORD = 'admin123';

app.post('/api/auth/login', (req, res) => {
  const { internalNumber, password } = req.body ?? {};
  if (!internalNumber || !password) {
    return res.status(400).json({ error: 'Faltan internalNumber o password' });
  }
  const isSuperAdmin =
    String(internalNumber).trim() === SUPERADMIN_USER && password === SUPERADMIN_PASSWORD;
  const fullName = isSuperAdmin ? 'SuperAdministrador' : 'Usuario Demo';
  const role = isSuperAdmin ? 'SuperAdmin' : 'Admin';
  res.json({
    token: 'demo-token-' + Date.now(),
    user: {
      id: 1,
      internalNumber: String(internalNumber).trim() || '329',
      fullName,
      firstName: fullName.split(' ')[0] || fullName,
      lastName: fullName.split(' ').slice(1).join(' ') || '',
      role,
    },
  });
});

app.listen(PORT, () => {
  console.log(`Backend TransformaFacil en http://localhost:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/api/health`);
});
