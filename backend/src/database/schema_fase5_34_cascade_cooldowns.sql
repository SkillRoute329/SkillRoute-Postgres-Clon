-- FASE 5.34 (2026-05-22) — Cooldowns persistentes del motor de
-- consecuencias. Antes vivían en Map() en memoria del scheduler y se
-- perdían en cada restart, lo que producía oleadas de re-disparos
-- inmediatamente tras un reinicio. Ahora viven en DB → resilientes.
--
-- Convención:
--   entity_type ∈ ('linea','coche','par_buses','linea_cobertura')
--   entity_id   id natural de la entidad
--   evento_tipo tipo del evento que disparó el cooldown
--   fired_at    timestamp del último disparo

CREATE TABLE IF NOT EXISTS cascade_cooldowns (
  entity_type   VARCHAR(50) NOT NULL,
  entity_id     VARCHAR(255) NOT NULL,
  evento_tipo   VARCHAR(50) NOT NULL,
  fired_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data_jsonb    JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (entity_type, entity_id, evento_tipo)
);
CREATE INDEX IF NOT EXISTS idx_cascade_cooldowns_fired
  ON cascade_cooldowns(fired_at DESC);
