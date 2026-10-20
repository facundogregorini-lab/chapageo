// Datos de demostración con marcas ficticias. Las respuestas salen del motor SIMULADO
// (sin llamadas externas) y quedan marcadas como simuladas.

import { analyzeAnswer } from "./analyze";
import { generateActions } from "./actions";
import { hashPassword } from "./auth-hash";
import { db, id, token } from "./db";
import { simulatedAnswer } from "./engines/simulated";
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
    sql: "INSERT INTO workspaces (id, name, plan, brand_color, report_footer, created_at) VALUES (?, ?, 'agencia', '#0f766e', ?, ?)",
    args: [wsId, "Agencia Demo", "Reporte preparado por Agencia Demo · Datos simulados de demostración", ts.toISOString()],
  });
  await c.execute({
    sql: "INSERT INTO users (id, email, name, password_hash, workspace_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [userId, DEMO_EMAIL, "Equipo demo", await hashPassword(token()), wsId, ts.toISOString()],
  });

  for (const [i, b] of BRANDS.entries()) {
    const brandId = `brd_demo${i + 1}`;
    await c.execute({
      sql: `INSERT INTO brands (id, workspace_id, name, domain, description, category, country, city, language, aliases, competitors, engines, repetitions, schedule, share_token, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'AR', ?, 'es', '[]', ?, ?, 3, 'weekly', ?, ?)`,
      args: [brandId, wsId, b.name, b.domain, b.description, b.category, b.city, JSON.stringify(b.competitors), JSON.stringify(b.engines), `demo${i + 1}${DEMO_SHARE_SUFFIX}`, new Date(ts.getTime() - 21 * 864e5).toISOString()],
    });
    const prompts = templatePrompts({ name: b.name, domain: b.domain, category: b.category, country: "AR", city: b.city, competitors: b.competitors }, 12);
    const promptIds: string[] = [];
    for (const p of prompts) {
      const pid = id("prm_");
      promptIds.push(pid);
      await c.execute({
        sql: "INSERT INTO prompts (id, brand_id, text, kind, intent, topic, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
        args: [pid, brandId, p.text, p.kind, p.intent, p.topic, ts.toISOString()],
      });
    }
    // Tres cortes semanales para que se vea la tendencia
    for (let week = 2; week >= 0; week--) {
      const when = new Date(ts.getTime() - week * 7 * 864e5).toISOString();
      const runId = id("run_");
      const stmts: { sql: string; args: (string | number | null)[] }[] = [];
      let ok = 0;
      prompts.forEach((p, i) => {
        for (const engine of b.engines)
          for (let rep = 1; rep <= 3; rep++) {
            const res = simulatedAnswer(
              { prompt: p.text, country: "AR", city: b.city, language: "es" },
              { engine, repetition: rep + (2 - week) * 3, brand: b, competitors: b.competitors, branded: p.kind === "con_marca" },
            );
            const a = analyzeAnswer(res.answer, res.sources, { name: b.name, domain: b.domain, aliases: [] }, b.competitors);
            ok++;
            stmts.push({
              sql: `INSERT INTO responses (id, run_id, brand_id, prompt_id, prompt_text, prompt_kind, engine, model, repetition, status, answer, sources, mentions, other_brands,
                    brand_mentioned, brand_position, own_cited, sentiment, sentiment_score, cost_usd, latency_ms, country, language, simulated, created_at, executed_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'simulado', ?, 'ok', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'AR', 'es', 1, ?, ?)`,
              args: [
                id("res_"), runId, brandId, promptIds[i], p.text, p.kind, engine, rep, res.answer, JSON.stringify(res.sources), JSON.stringify(a.mentions),
                JSON.stringify(a.otherBrands), a.brandMentioned ? 1 : 0, a.brandPosition, a.ownCited ? 1 : 0, a.sentiment?.label ?? null, a.sentiment?.score ?? null, when, when,
              ],
            });
          }
      });
      await c.batch(
        [
          {
            sql: "INSERT INTO runs (id, brand_id, status, trigger, total, done_count, failed_count, simulated, cost_usd, created_at, finished_at) VALUES (?, ?, 'done', 'cron', ?, ?, 0, 1, 0, ?, ?)",
            args: [runId, brandId, ok, ok, when, when],
          },
          ...stmts,
        ],
        "write",
      );
      await c.execute({ sql: "UPDATE brands SET last_run_at = ? WHERE id = ?", args: [when, brandId] });
    }
    await generateActions(brandId);
  }
}
