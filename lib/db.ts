import { createClient, type Client, type InArgs, type Row } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS workspaces (
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
CREATE INDEX IF NOT EXISTS idx_events_name ON events(name, created_at);
`;

let client: Client | null = null;
let schemaReady: Promise<void> | null = null;
let seedReady: Promise<void> | null = null;
let seeding = false;

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  // Vercel solo permite escribir en /tmp: sirve para demo, no persiste entre instancias.
  if (process.env.VERCEL) return "file:/tmp/chapageo.db";
  mkdirSync("data", { recursive: true });
  return "file:data/chapageo.db";
}

function getClient(): Client {
  if (!client) {
    client = createClient({ url: databaseUrl(), authToken: process.env.DATABASE_AUTH_TOKEN });
  }
  return client;
}

export function isEphemeralDb() {
  return !process.env.DATABASE_URL && Boolean(process.env.VERCEL);
}

async function maybeSeed() {
  if (process.env.DEMO_SEED === "0") return;
  const r = await getClient().execute("SELECT COUNT(*) AS n FROM workspaces");
  if (Number(r.rows[0].n) > 0) return;
  const { seedDemo } = await import("./seed");
  await seedDemo();
}

export async function db(): Promise<Client> {
  const c = getClient();
  if (!schemaReady) {
    schemaReady = c.executeMultiple(SCHEMA).catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  await schemaReady;
  // El seed usa db() por dentro: mientras corre, no lo esperamos (evita el deadlock).
  if (!seeding) {
    if (!seedReady) {
      seeding = true;
      seedReady = maybeSeed()
        .catch((e) => console.error("seed", e))
        .finally(() => {
          seeding = false;
        });
    }
    await seedReady;
  }
  return c;
}

/** Cliente sin esperar la inicialización (solo para el seed, que corre dentro de init). */
export function rawDb(): Client {
  return getClient();
}

export async function all<T = Row>(sql: string, args: InArgs = []): Promise<T[]> {
  const r = await (await db()).execute({ sql, args });
  return r.rows as unknown as T[];
}

export async function one<T = Row>(sql: string, args: InArgs = []): Promise<T | null> {
  const rows = await all<T>(sql, args);
  return rows[0] ?? null;
}

export async function run(sql: string, args: InArgs = []) {
  return (await db()).execute({ sql, args });
}

export function id(prefix = ""): string {
  return prefix + randomBytes(9).toString("base64url");
}

export function token(): string {
  return randomBytes(18).toString("base64url");
}

export function now(): string {
  return new Date().toISOString();
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
