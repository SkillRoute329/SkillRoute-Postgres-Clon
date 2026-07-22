import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, server } from '../src/index';

describe('Smoke Tests - Verificación de Salud del Sistema', () => {
  afterAll(() => {
    // Cerramos el servidor para que vitest termine correctamente
    if (server) {
      server.close();
    }
  });

  it('La API debería responder en la ruta raíz con información del sistema', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name', 'TransformaFacil 2.0 Backend');
    expect(res.body).toHaveProperty('environment');
  });

  it('El endpoint de Health Check debería estar activo', async () => {
    const res = await request(app).get('/api/health');
    // Incluso si la BD está offline, debería responder (tal vez con 500, pero la API responde)
    expect([200, 503, 500]).toContain(res.status);
  });
});
