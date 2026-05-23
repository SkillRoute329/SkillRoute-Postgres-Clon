-- FASE 5.28 (2026-05-19) — Pase 2 de cierre del mapa de auditoría.
-- Tablas mínimas para que los endpoints faltantes restantes (shifts payments,
-- config salarial) tengan dónde escribir. Conforme a la regla "feature da
-- dato REAL o no existe": las tablas nacen vacías y se llenan desde el flujo
-- operativo. NO se siembran datos demo.

-- ─── shift_payments ────────────────────────────────────────────────────────
-- Cada registro de pago o cobro entre la administración y un conductor.
-- AdminBalances escribe acá vía POST /api/shifts/payment (parcial) y
-- POST /api/shifts/pay (saldar todo). El cálculo de balance es:
--   balance = SUM(shifts asignados a U).totalValue
--           - SUM(shifts cedidos por U).totalValue
--           - SUM(shift_payments).monto
CREATE TABLE IF NOT EXISTS shift_payments (
  id          VARCHAR(128) PRIMARY KEY,
  user_id     VARCHAR(128) NOT NULL,
  agency_id   VARCHAR(50),
  monto       NUMERIC(12, 2) NOT NULL,        -- positivo = pago al chofer; negativo = cobro al chofer
  tipo        VARCHAR(50) NOT NULL DEFAULT 'manual', -- manual | parcial | saldo_total
  motivo      TEXT,
  registrado_por VARCHAR(128),
  fecha       DATE NOT NULL DEFAULT CURRENT_DATE,
  data_jsonb  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shift_pay_user ON shift_payments(user_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_shift_pay_fecha ON shift_payments(fecha DESC);

-- ─── system_config seeds para config-salarial ─────────────────────────────
-- ConfigSalarialTab espera dos keys; las inicializamos vacías (objetos) si
-- no existían. Esto evita 404 y permite que el primer PUT desde la UI las
-- llene con valores reales acordados por administración.
INSERT INTO system_config (key, value_jsonb, updated_at)
VALUES
  ('config_salarial_turnos',     '{"categorias":{},"vigenciaDesde":null}'::jsonb, NOW()),
  ('config_salarial_descuentos', '{"items":[],"vigenciaDesde":null}'::jsonb,      NOW())
ON CONFLICT (key) DO NOTHING;
