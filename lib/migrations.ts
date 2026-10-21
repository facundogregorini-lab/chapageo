// Migraciones versionadas. Cada una corre una sola vez y queda registrada en schema_migrations.
// La 001 es el esquema original (idempotente, porque la base de producción ya lo tiene);
// las siguientes son cambios incrementales que se aplican en una transacción.

import type { Client } from "@libsql/client";

export type Migration = { id: string; sql: string };

export const MIGRATIONS: Migration[] = [
  {
    id: "001_base",
    sql: `CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'prueba',
  brand_color TEXT NOT NULL DEFAULT '#1f6feb',
  logo_url TEXT,
  report_footer TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  password_hash TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  description TEXT,
  category TEXT,
  country TEXT NOT NULL DEFAULT 'AR',
  city TEXT,
  language TEXT NOT NULL DEFAULT 'es',
  aliases TEXT NOT NULL DEFAULT '[]',
  competitors TEXT NOT NULL DEFAULT '[]',
  engines TEXT NOT NULL DEFAULT '["chatgpt","gemini"]',
  repetitions INTEGER NOT NULL DEFAULT 3,
  schedule TEXT NOT NULL DEFAULT 'weekly',
  share_token TEXT NOT NULL,
  last_run_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'sin_marca',
  intent TEXT NOT NULL DEFAULT 'comercial',
  topic TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  trigger TEXT NOT NULL DEFAULT 'manual',
  total INTEGER NOT NULL DEFAULT 0,
  done_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  simulated INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS responses (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  brand_id TEXT NOT NULL,
  prompt_id TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  prompt_kind TEXT NOT NULL,
  engine TEXT NOT NULL,
  model TEXT,
  repetition INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  claimed_at TEXT,
  error TEXT,
  answer TEXT,
  sources TEXT NOT NULL DEFAULT '[]',
  mentions TEXT NOT NULL DEFAULT '[]',
  other_brands TEXT NOT NULL DEFAULT '[]',
  brand_mentioned INTEGER NOT NULL DEFAULT 0,
  brand_position INTEGER,
  own_cited INTEGER NOT NULL DEFAULT 0,
  sentiment TEXT,
  sentiment_score REAL,
  cost_usd REAL NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  country TEXT,
  language TEXT,
  simulated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  executed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_responses_run ON responses(run_id, status);
CREATE INDEX IF NOT EXISTS idx_responses_brand ON responses(brand_id, created_at);
CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 2,
  evidence TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pendiente',
  owner TEXT,
  draft TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (brand_id, fingerprint)
);
CREATE TABLE IF NOT EXISTS audits (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  brand_id TEXT,
  kind TEXT NOT NULL,
  domain TEXT NOT NULL,
  share_token TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  company TEXT,
  phone TEXT,
  domain TEXT,
  source TEXT NOT NULL,
  offer TEXT,
  note TEXT,
  audit_id TEXT,
  stage TEXT NOT NULL DEFAULT 'nuevo',
  amount_usd REAL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  props TEXT NOT NULL DEFAULT '{}',
  visitor TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_name ON events(name, created_at)
`,
  },
  {
    id: "002_cola_y_recolectores",
    sql: `
ALTER TABLE workspaces ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;
UPDATE workspaces SET is_demo = 1 WHERE id = 'ws_demo';

ALTER TABLE prompts ADD COLUMN category TEXT NOT NULL DEFAULT 'descubrimiento';
UPDATE prompts SET category = CASE WHEN kind = 'con_marca' THEN 'marca' ELSE 'descubrimiento' END;
ALTER TABLE prompts ADD COLUMN approved INTEGER NOT NULL DEFAULT 1;
ALTER TABLE prompts ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE prompts ADD COLUMN updated_at TEXT;

ALTER TABLE runs ADD COLUMN workspace_id TEXT;
UPDATE runs SET workspace_id = (SELECT workspace_id FROM brands WHERE brands.id = runs.brand_id);
ALTER TABLE runs ADD COLUMN collectors TEXT NOT NULL DEFAULT '[]';
ALTER TABLE runs ADD COLUMN repetitions INTEGER NOT NULL DEFAULT 1;
ALTER TABLE runs ADD COLUMN requested_country TEXT NOT NULL DEFAULT 'AR';
ALTER TABLE runs ADD COLUMN language TEXT NOT NULL DEFAULT 'es';
ALTER TABLE runs ADD COLUMN idempotency_key TEXT;
ALTER TABLE runs ADD COLUMN prompt_set_hash TEXT;
ALTER TABLE runs ADD COLUMN started_at TEXT;
ALTER TABLE runs ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE runs ADD COLUMN status_detail TEXT;
ALTER TABLE runs ADD COLUMN brand_snapshot TEXT;
UPDATE runs SET status = CASE status WHEN 'done' THEN 'completed' WHEN 'queued' THEN 'pending' ELSE status END;
UPDATE runs SET is_demo = simulated;
CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_idem ON runs(workspace_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_runs_ws ON runs(workspace_id, brand_id, created_at);

ALTER TABLE responses ADD COLUMN workspace_id TEXT;
UPDATE responses SET workspace_id = (SELECT workspace_id FROM brands WHERE brands.id = responses.brand_id);
ALTER TABLE responses ADD COLUMN collector TEXT;
UPDATE responses SET collector = CASE WHEN simulated = 1 THEN 'demo_' || engine ELSE engine || '_api' END;
ALTER TABLE responses ADD COLUMN collection_method TEXT;
UPDATE responses SET collection_method = CASE WHEN simulated = 1 THEN 'demo' ELSE 'official_api' END;
ALTER TABLE responses ADD COLUMN prompt_category TEXT;
UPDATE responses SET prompt_category = CASE WHEN prompt_kind = 'con_marca' THEN 'marca' ELSE 'descubrimiento' END;
ALTER TABLE responses ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE responses ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3;
ALTER TABLE responses ADD COLUMN next_attempt_at TEXT;
ALTER TABLE responses ADD COLUMN lease_id TEXT;
ALTER TABLE responses ADD COLUMN worker_id TEXT;
ALTER TABLE responses ADD COLUMN heartbeat_at TEXT;
ALTER TABLE responses ADD COLUMN started_at TEXT;
ALTER TABLE responses ADD COLUMN error_code TEXT;
ALTER TABLE responses ADD COLUMN observed_country TEXT;
ALTER TABLE responses ADD COLUMN location_verification TEXT;
ALTER TABLE responses ADD COLUMN search_mode TEXT;
ALTER TABLE responses ADD COLUMN session_type TEXT;
ALTER TABLE responses ADD COLUMN screenshot_id TEXT;
ALTER TABLE responses ADD COLUMN conditions TEXT NOT NULL DEFAULT '{}';
UPDATE responses SET status = CASE status WHEN 'ok' THEN 'completed' WHEN 'error' THEN 'failed' WHEN 'processing' THEN 'pending' ELSE status END;
CREATE UNIQUE INDEX IF NOT EXISTS idx_responses_job ON responses(run_id, prompt_id, collector, repetition);
CREATE INDEX IF NOT EXISTS idx_responses_queue ON responses(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_responses_ws ON responses(workspace_id, run_id);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  response_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_ws ON evidence(workspace_id, response_id);

CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY,
  hostname TEXT,
  collectors TEXT NOT NULL DEFAULT '[]',
  info TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  heartbeat_at TEXT NOT NULL,
  stopped_at TEXT
);

CREATE TABLE IF NOT EXISTS collector_status (
  collector TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  reason TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  verified_at TEXT,
  updated_at TEXT NOT NULL,
  worker_id TEXT
);
`,
  },
  {
    id: "003_ingreso_google",
    // Cuentas creadas con Google no tienen contraseña: quedan con password_hash vacío.
    sql: `ALTER TABLE users ADD COLUMN google_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);
`,
  },
  {
    id: "004_suscripciones_mp",
    // workspaces.plan pasa a ser el plan vigente que calcula lib/billing.ts a partir de las suscripciones.
    // plan_expires_at: hasta cuándo vale ese plan (NULL = sin vencimiento, p. ej. asignado a mano).
    sql: `ALTER TABLE workspaces ADD COLUMN plan_expires_at TEXT;
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT,
  plan TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'mercadopago',
  provider_id TEXT,
  status TEXT NOT NULL DEFAULT 'creating',
  payer_email TEXT,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ARS',
  checkout_url TEXT,
  last_charged_at TEXT,
  next_payment_at TEXT,
  paid_until TEXT,
  raw TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_provider ON subscriptions(provider, provider_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_ws ON subscriptions(workspace_id, status);
CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  topic TEXT NOT NULL,
  resource_id TEXT,
  subscription_id TEXT,
  result TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_billing_events_res ON billing_events(provider, resource_id, created_at);
`,
  },
];

function statements(sql: string): string[] {
  return sql
    .split(/;\s*\n/)
    .map((s) => s.trim().replace(/;$/, ""))
    .filter(Boolean);
}

/** Aplica las migraciones pendientes. Seguro ante instancias concurrentes. */
export async function migrate(c: Client): Promise<string[]> {
  await c.execute("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const applied = new Set((await c.execute("SELECT id FROM schema_migrations")).rows.map((r) => String(r.id)));
  const done: string[] = [];
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    try {
      await c.batch(
        [...statements(m.sql), { sql: "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)", args: [m.id, new Date().toISOString()] }],
        "write",
      );
      done.push(m.id);
    } catch (e) {
      // Otra instancia pudo haberla aplicado en paralelo: si quedó registrada, seguimos.
      const again = await c.execute({ sql: "SELECT 1 FROM schema_migrations WHERE id = ?", args: [m.id] });
      if (!again.rows.length) throw e;
    }
  }
  return done;
}
