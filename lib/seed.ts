// Espacio de DEMOSTRACIÓN (workspace is_demo = 1) con marcas ficticias. Las respuestas salen del
// conector demo (sin llamadas externas), quedan rotuladas como "demo" y nunca se mezclan con
// clientes reales: viven en otro workspace y los conectores demo solo se ofrecen ahí.

import { analyzeAnswer } from "./analyze";
import { hashPassword } from "./auth-hash";
import type { CollectorId } from "./collectors/registry";
import { db, token } from "./db";
import { simulatedAnswer } from "./engines/simulated";
import { jobId, promptSetHash } from "./queue";
import { templatePrompts } from "./suggest";
import type { EngineId } from "./config";
import type { Competitor } from "./types";

export const DEMO_EMAIL = "demo@chapageo.lat";
const DEMO_SHARE_SUFFIX = "-reporte-demo";

type DemoBrand = {
  name: string;
  domain: string;
  description: string;
  category: string;
  city: string | null;
  competitors: Competitor[];
  engines: EngineId[];
};

const BRANDS: DemoBrand[] = [
  {
    name: "Pampa CRM",
    domain: "pampacrm.com.ar",
    description: "CRM y gestión comercial para pymes argentinas, con facturación electrónica integrada.",
    category: "software CRM para pymes",
    city: null,
    competitors: [
      { name: "Andes CRM", domain: "andescrm.com" },
      { name: "Ceibo Soft", domain: "ceibosoft.com.ar" },
      { name: "Rioplata Cloud", domain: "rioplatacloud.com" },
    ],
    engines: ["chatgpt", "gemini", "perplexity"],
  },
  {
    name: "Café Malbec",
    domain: "cafemalbec.com.ar",
    description: "Cafetería de especialidad con tostado propio en Palermo.",
    category: "cafetería de especialidad",
    city: "Palermo, Buenos Aires",
    competitors: [
      { name: "Tostado Sur", domain: "tostadosur.com.ar" },
      { name: "La Molienda", domain: "lamolienda.com.ar" },
      { name: "Bruma Café", domain: "brumacafe.com" },
    ],
    engines: ["chatgpt", "gemini"],
  },
];

export async function seedDemo() {
  const c = await db();
  const ts = new Date();
  // IDs fijos: si dos instancias siembran a la vez (o cada una tiene su base en /tmp),
  // la demo queda con los mismos IDs y la sesión sirve en cualquiera.
  const wsId = "ws_demo";
  const userId = "usr_demo";
  await c.execute({
    sql: "INSERT INTO workspaces (id, name, plan, brand_color, report_footer, is_demo, created_at) VALUES (?, ?, 'agencia', '#0f766e', ?, 1, ?)",
    args: [wsId, "Agencia Demo", "Informe de demostración · Datos simulados", ts.toISOString()],
  });
  await c.execute({
    sql: "INSERT INTO users (id, email, name, password_hash, workspace_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [userId, DEMO_EMAIL, "Equipo demo", await hashPassword(token()), wsId, ts.toISOString()],
  });

  const collectors: CollectorId[] = ["demo_chatgpt", "demo_gemini"];
  for (const [i, b] of BRANDS.entries()) {
    const brandId = `brd_demo${i + 1}`;
    const brand = { name: b.name, domain: b.domain, aliases: [] as string[], competitors: b.competitors };
    await c.execute({
      sql: `INSERT INTO brands (id, workspace_id, name, domain, description, category, country, city, language, aliases, competitors, engines, repetitions, schedule, share_token, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'AR', NULL, 'es', '[]', ?, '[]', 2, 'manual', ?, ?)`,
      args: [brandId, wsId, b.name, b.domain, b.description, b.category, JSON.stringify(b.competitors), `demo${i + 1}${DEMO_SHARE_SUFFIX}`, new Date(ts.getTime() - 21 * 864e5).toISOString()],
    });
    const prompts = templatePrompts({ name: b.name, domain: b.domain, category: b.category, country: "AR", city: b.city, competitors: b.competitors }, 12).map((p, k) => ({
      ...p,
      id: `prm_demo${i + 1}_${k + 1}`,
    }));
    for (const p of prompts) {
      await c.execute({
        sql: "INSERT INTO prompts (id, brand_id, text, kind, intent, topic, active, category, approved, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, 1, 'plantilla', ?, ?)",
        args: [p.id, brandId, p.text, p.category === "marca" ? "con_marca" : "sin_marca", p.intent, p.topic, p.category, ts.toISOString(), ts.toISOString()],
      });
    }
    const hash = promptSetHash(prompts, collectors);
    // Dos análisis comparables (mismas preguntas y motores), con dos semanas de diferencia.
    for (const week of [2, 0]) {
      const when = new Date(ts.getTime() - week * 7 * 864e5).toISOString();
      const runId = `run_demo${i + 1}_${week}`;
      const stmts: { sql: string; args: (string | number | null)[] }[] = [];
      let ok = 0;
      let failed = 0;
      for (const [k, p] of prompts.entries())
        for (const col of collectors)
          for (let rep = 1; rep <= 2; rep++) {
            const engine: EngineId = col === "demo_chatgpt" ? "chatgpt" : "gemini";
            const jid = jobId(runId, p.id, col, rep);
            // Un par de errores simulados en el último análisis, para mostrar cobertura y estados.
            if (week === 0 && rep === 2 && k < 2 && col === "demo_gemini") {
              failed++;
              stmts.push({
                sql: `INSERT INTO responses (id, run_id, brand_id, workspace_id, prompt_id, prompt_text, prompt_kind, prompt_category, engine, collector, collection_method,
                        repetition, status, attempts, max_attempts, error, error_code, country, language, simulated, created_at, executed_at, location_verification, session_type, search_mode)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo', ?, 'failed', 3, 3, 'Error simulado para la demostración (tiempo agotado)', 'timeout', 'AR', 'es', 1, ?, ?, 'no_aplica', 'simulada', 'simulado')`,
                args: [jid, runId, brandId, wsId, p.id, p.text, p.category === "marca" ? "con_marca" : "sin_marca", p.category, engine, col, rep, when, when],
              });
              continue;
            }
            const res = simulatedAnswer(
              { prompt: p.text, country: "AR", language: "es" },
              { engine, repetition: rep + (2 - week) * 3, brand: b, competitors: b.competitors, branded: p.category === "marca" },
            );
            const a = analyzeAnswer(res.answer, res.sources, brand, b.competitors);
            ok++;
            stmts.push({
              sql: `INSERT INTO responses (id, run_id, brand_id, workspace_id, prompt_id, prompt_text, prompt_kind, prompt_category, engine, collector, collection_method, model,
                      repetition, status, attempts, max_attempts, answer, sources, mentions, other_brands, brand_mentioned, brand_position, own_cited, sentiment, sentiment_score,
                      cost_usd, latency_ms, country, language, simulated, created_at, executed_at, observed_country, location_verification, session_type, search_mode, conditions)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo', 'simulado', ?, 'completed', 1, 3, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'AR', 'es', 1, ?, ?, NULL, 'no_aplica', 'simulada', 'simulado', ?)`,
              args: [
                jid, runId, brandId, wsId, p.id, p.text, p.category === "marca" ? "con_marca" : "sin_marca", p.category, engine, col, rep, res.answer,
                JSON.stringify(res.sources), JSON.stringify(a.mentions), JSON.stringify(a.otherBrands), a.brandMentioned ? 1 : 0, a.brandPosition, a.ownCited ? 1 : 0,
                a.sentiment?.label ?? null, a.sentiment?.score ?? null, when, when, JSON.stringify({ collectionMethod: "demo", requestedCountry: "AR", language: "es" }),
              ],
            });
          }
      await c.batch(
        [
          {
            sql: `INSERT INTO runs (id, brand_id, workspace_id, status, trigger, total, done_count, failed_count, simulated, is_demo, cost_usd, collectors, repetitions,
                    requested_country, language, idempotency_key, prompt_set_hash, brand_snapshot, created_at, started_at, finished_at)
                  VALUES (?, ?, ?, ?, 'demo', ?, ?, ?, 1, 1, 0, ?, 2, 'AR', 'es', ?, ?, ?, ?, ?, ?)`,
            args: [runId, brandId, wsId, failed ? "partial" : "completed", ok + failed, ok, failed, JSON.stringify(collectors), runId, hash, JSON.stringify(brand), when, when, when],
          },
          ...stmts,
        ],
        "write",
      );
      await c.execute({ sql: "UPDATE brands SET last_run_at = ? WHERE id = ?", args: [when, brandId] });
    }
  }
}
