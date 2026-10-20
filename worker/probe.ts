// Prueba real de UN conector con UNA consulta neutral (no usa datos de ninguna agencia):
//   npm run worker:probe -- chatgpt_web
//   npm run worker:probe -- claude_api --prompt "¿Qué bancos digitales hay en Argentina?"
//   npm run worker:probe -- chatgpt_web --requeue   (además devuelve a la cola lo frenado)
// Si la respuesta llega completa, el conector queda "available" y la web permite elegirlo.
// Si aparece CAPTCHA/login/límite, queda "requires_intervention". Si falla, "unavailable".
// La captura de evidencia se guarda en ./probe-output/ para revisarla a mano.

import "./env";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { COLLECTORS, isCollectorId } from "../lib/collectors/registry";
import { requeueIntervention, setCollectorStatus } from "../lib/queue";
import { buildCollector } from "./collectors";

const DEFAULT_PROMPT = "¿Cuáles son los mejores bancos digitales para abrir una cuenta en Argentina?";

async function main() {
  const id = process.argv[2];
  if (!id || !isCollectorId(id) || COLLECTORS[id].method === "demo") {
    console.error("Uso: npm run worker:probe -- <chatgpt_web|gemini_web|chatgpt_api|gemini_api|claude_api|perplexity_api> [--prompt \"…\"] [--requeue]");
    process.exit(1);
  }
  const pIdx = process.argv.indexOf("--prompt");
  const prompt = pIdx > 0 ? process.argv[pIdx + 1] : DEFAULT_PROMPT;
  const outDir = path.resolve("probe-output");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const c = buildCollector(id);
  const abort = new AbortController();
  console.log(`Probando ${COLLECTORS[id].label} con: «${prompt}»`);
  const r = await c.collect(
    { prompt, engine: c.engine, requestedCountry: "AR", language: "es", runId: "probe", jobId: `probe-${stamp}` },
    {
      saveEvidence: async (data, mime) => {
        const file = path.join(outDir, `${id}-${stamp}.${mime === "image/png" ? "png" : "jpg"}`);
        writeFileSync(file, data);
        return file;
      },
      signal: abort.signal,
      log: (m) => console.log("  ", m),
    },
  );
  await c.close?.();
  writeFileSync(path.join(outDir, `${id}-${stamp}.json`), JSON.stringify(r, null, 2));
  console.log(JSON.stringify({ ...r, answerText: r.answerText?.slice(0, 600) }, null, 2));

  if (r.status === "completed" && r.answerText) {
    await setCollectorStatus(id, "available", null, null, {
      verified: true,
      details: { probe: true, sessionType: r.sessionType, observedCountry: r.observedCountry, locationVerification: r.locationVerification, model: r.modelIfVisible },
    });
    console.log(`✔ ${id} verificado: ya se puede elegir en la web.`);
    if (process.argv.includes("--requeue")) console.log(`Devueltas a la cola: ${await requeueIntervention(id)} ejecuciones.`);
  } else if (r.status === "requires_intervention") {
    await setCollectorStatus(id, "requires_intervention", r.error?.message ?? "Requiere intervención", null, { details: { probe: true, code: r.error?.code } });
    console.log(`✖ ${id} requiere intervención: ${r.error?.message}. Probá npm run worker:login -- ${id}`);
  } else {
    await setCollectorStatus(id, "unavailable", r.error?.message ?? `Prueba con estado ${r.status}`, null, { details: { probe: true, code: r.error?.code } });
    console.log(`✖ ${id} no disponible: ${r.error?.message ?? r.status}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
