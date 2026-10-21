// Base temporal aislada por archivo de test (cada archivo corre en su propio proceso).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export function useTempDb() {
  const dir = mkdtempSync(path.join(tmpdir(), "chapageo-test-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;
  delete process.env.TURSO_DATABASE_URL;
  process.env.DEMO_SEED = "0";
  // Los tests de cola usan los conectores del worker; en producción están ocultos por defecto.
  process.env.WORKER_ENABLED ??= "1";
  return process.env.DATABASE_URL;
}

export async function setupAgency(name: string, opts: { demo?: boolean; prompts?: number } = {}) {
  const { run, id, now } = await import("../lib/db");
  const ws = id("ws_");
  const brand = id("brd_");
  const ts = now();
  await run("INSERT INTO workspaces (id, name, plan, is_demo, created_at) VALUES (?, ?, 'prueba', ?, ?)", [ws, name, opts.demo ? 1 : 0, ts]);
  await run(
    `INSERT INTO brands (id, workspace_id, name, domain, category, country, language, aliases, competitors, share_token, created_at)
     VALUES (?, ?, ?, ?, 'software', 'AR', 'es', '[]', ?, ?, ?)`,
    [brand, ws, `Marca ${name}`, `marca-${name.toLowerCase()}.com.ar`, JSON.stringify([{ name: "Rival Uno", domain: "rivaluno.com" }]), id("tok_"), ts],
  );
  const prompts: string[] = [];
  for (let i = 0; i < (opts.prompts ?? 5); i++) {
    const pid = id("prm_");
    prompts.push(pid);
    await run(
      "INSERT INTO prompts (id, brand_id, text, kind, intent, active, category, approved, source, created_at) VALUES (?, ?, ?, 'sin_marca', 'comercial', 1, ?, 1, 'manual', ?)",
      [pid, brand, `¿Cuál es el mejor software número ${i + 1}?`, i === 4 ? "marca" : "descubrimiento", ts],
    );
  }
  return { ws, brand, prompts };
}

export function okResult(text = "1. Rival Uno\n2. Marca", over: Record<string, unknown> = {}) {
  return {
    status: "completed" as const,
    answerText: text,
    citations: [{ url: "https://g2.com/x", domain: "g2.com" }],
    screenshotReference: null,
    collectedAt: new Date().toISOString(),
    engine: "claude" as const,
    modelIfVisible: "m",
    collectionMethod: "official_api" as const,
    observedCountry: null,
    locationVerification: "no_aplica" as const,
    searchMode: "api_web_search",
    sessionType: "api" as const,
    duration: 10,
    error: null,
    ...over,
  };
}
