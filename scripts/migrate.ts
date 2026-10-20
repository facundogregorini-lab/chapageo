// Aplica las migraciones pendientes contra DATABASE_URL / TURSO_DATABASE_URL (o la base local).
//   npm run db:migrate
import "../worker/env";
import { createClient } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { migrate } from "../lib/migrations";

const url = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || "file:data/chapageo.db";
if (url.startsWith("file:data/")) mkdirSync("data", { recursive: true });
const c = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN });
migrate(c)
  .then((done) => {
    console.log(done.length ? `Aplicadas: ${done.join(", ")}` : "La base ya estaba al día.");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
