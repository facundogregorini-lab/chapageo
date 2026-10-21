import { createClient, type Client, type InArgs, type Row } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { migrate } from "./migrations";


// Vercel Storage (Turso) crea TURSO_DATABASE_URL y TURSO_AUTH_TOKEN; aceptamos los dos nombres.
const DB_URL = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL;
const DB_TOKEN = process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;

let client: Client | null = null;
let schemaReady: Promise<void> | null = null;
let seedReady: Promise<void> | null = null;
let seeding = false;

function databaseUrl(): string {
  if (DB_URL) return DB_URL;
  // Vercel solo permite escribir en /tmp: sirve para demo, no persiste entre instancias.
  if (process.env.VERCEL) return "file:/tmp/chapageo.db";
  mkdirSync("data", { recursive: true });
  return "file:data/chapageo.db";
}

const isBusy = (e: unknown) => /SQLITE_BUSY|database is locked/i.test(String((e as { code?: string })?.code ?? "") + String((e as Error)?.message ?? ""));

/**
 * Con SQLite en archivo, la web y el worker (u otros workers) comparten la base desde procesos
 * distintos: una escritura puede encontrar la base ocupada un instante. Reintentamos con espera
 * corta en vez de fallar. Turso/libSQL remoto no lo necesita.
 */
function withBusyRetry(c: Client): Client {
  const retry = async <T>(fn: () => Promise<T>): Promise<T> => {
    for (let i = 0; ; i++) {
      try {
        return await fn();
      } catch (e) {
        if (!isBusy(e) || i >= 40) throw e;
        await new Promise((r) => setTimeout(r, 25 + Math.random() * 100));
      }
    }
  };
  const execute = c.execute.bind(c) as (...a: unknown[]) => Promise<unknown>;
  const batch = c.batch.bind(c) as (...a: unknown[]) => Promise<unknown>;
  return Object.assign(c, {
    execute: (...a: unknown[]) => retry(() => execute(...a)),
    batch: (...a: unknown[]) => retry(() => batch(...a)),
  }) as Client;
}

function getClient(): Client {
  if (!client) {
    const url = databaseUrl();
    client = createClient({ url, authToken: DB_TOKEN });
    if (url.startsWith("file:")) {
      client = withBusyRetry(client);
      void client.execute("PRAGMA journal_mode = WAL").catch(() => undefined);
    }
  }
  return client;
}

/** En Vercel, cualquier base en archivo (sin Turso o con DATABASE_URL=file:…) vive en una sola instancia. */
export function isEphemeralDb() {
  return Boolean(process.env.VERCEL) && databaseUrl().startsWith("file:");
}

/** Para los logs: esquema y host de la base, sin credenciales. */
export function dbFingerprint(): string {
  const url = databaseUrl();
  try {
    const u = new URL(url);
    return u.protocol.startsWith("file") ? url : `${u.protocol}//${u.host}`;
  } catch {
    return url.split("?")[0];
  }
}

async function maybeSeed() {
  if (process.env.DEMO_SEED === "0") return;
  const r = await getClient().execute("SELECT COUNT(*) AS n FROM workspaces");
  if (Number(r.rows[0].n) > 0) return;
  const { seedDemo } = await import("./seed");
  try {
    await seedDemo();
  } catch (e) {
    // Dos instancias nuevas sembrando a la vez: la otra ya creó la demo (mismos ids), no es un error.
    if (/UNIQUE constraint failed: workspaces\.id/.test(String((e as Error)?.message))) return;
    throw e;
  }
}

export async function db(): Promise<Client> {
  const c = getClient();
  if (!schemaReady) {
    schemaReady = migrate(c).then(() => undefined).catch((e) => {
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
