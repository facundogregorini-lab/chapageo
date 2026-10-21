// Conector de Bright Data contra una API simulada que imita los endpoints documentados
// (trigger → progress → snapshot). No consume consultas reales.
import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import { setupAgency, useTempDb } from "./helpers";

useTempDb();
process.env.BRIGHTDATA_API_TOKEN = "tok-test";
let q: typeof import("../lib/queue");
let bd: typeof import("../lib/collectors/brightdata");
let batch: typeof import("../lib/brightdata-batch");
let probe: typeof import("../lib/brightdata-probe");
let dbm: typeof import("../lib/db");

before(async () => {
  dbm = await import("../lib/db");
  q = await import("../lib/queue");
  bd = await import("../lib/collectors/brightdata");
  batch = await import("../lib/brightdata-batch");
  probe = await import("../lib/brightdata-probe");
  await dbm.db();
});

type Call = { method: string; url: string; headers: Record<string, string>; body: unknown };

/** API falsa: guarda las entradas de cada snapshot y responde según `state`. */
function fakeApi(opts: { triggerStatus?: number; record?: (input: { prompt: string; country: string }, i: number) => Record<string, unknown> } = {}) {
  const calls: Call[] = [];
  const snaps = new Map<string, { inputs: { url: string; prompt: string; country: string }[]; status: string }>();
  let n = 0;
  const f: import("../lib/collectors/brightdata").FetchLike = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method ?? "GET", url, headers: init.headers ?? {}, body });
    const ok = (data: unknown, status = 200) => ({ ok: status < 400, status, text: async () => (typeof data === "string" ? data : JSON.stringify(data)) });
    const path = new URL(url).pathname;
    if (path === "/datasets/v3/trigger") {
      if (opts.triggerStatus) return ok("Unauthorized", opts.triggerStatus);
      const id = `s_test${++n}`;
      snaps.set(id, { inputs: body, status: "running" });
      return ok({ snapshot_id: id });
    }
    const m = path.match(/^\/datasets\/v3\/(progress|snapshot)\/(.+)$/);
    const snap = m ? snaps.get(decodeURIComponent(m[2])) : undefined;
    if (!m || !snap) return ok({ error: "not found" }, 404);
    if (m[1] === "progress") return ok({ status: snap.status });
    // Bright Data no garantiza el orden: lo devolvemos invertido.
    const recs = snap.inputs.map(
      (inp, i) =>
        opts.record?.(inp, i) ?? {
          url: inp.url,
          prompt: inp.prompt,
          country: inp.country,
          model: "gpt-5",
          web_search_triggered: true,
          answer_text: `Para «${inp.prompt}»: 1. Rival Uno 2. Marca Otra. Fuente: g2.`,
          citations: [{ url: "https://www.g2.com/x?utm_source=chatgpt.com", title: "G2", domain: "g2.com" }],
          links_attached: [{ url: "https://chatgpt.com/c/123", text: "propio" }, { url: "https://rivaluno.com/precios", text: "Rival" }],
        },
    );
    return ok(recs.reverse());
  };
  return { f, calls, snaps };
}

beforeEach(async () => {
  await dbm.run("DELETE FROM collector_status");
});

test("lectura de un registro: texto, fuentes limpias, modelo, búsqueda y país declarado por el proveedor", () => {
  const cfg = { costPerRecord: 0.0015 };
  const r = bd.recordToResult(
    {
      prompt: "x",
      answer_text: "Hola",
      model: "gpt-5",
      web_search_triggered: false,
      country: "ar",
      citations: [{ url: "https://www.g2.com/a?utm_source=chatgpt.com", title: "G2" }, "https://reddit.com/r/x", { link: "javascript:alert(1)" }],
      links_attached: [{ url: "https://chatgpt.com/share/1" }, { url: "https://www.g2.com/a" }],
    },
    "brightdata_chatgpt",
    cfg,
    Date.now(),
    "AR",
  );
  assert.equal(r.status, "completed");
  assert.equal(r.collectionMethod, "third_party_capture");
  assert.equal(r.answerText, "Hola");
  assert.equal(r.modelIfVisible, "gpt-5");
  assert.equal(r.searchMode, "sin_busqueda_observada");
  assert.equal(r.observedCountry, "AR");
  assert.equal(r.locationVerification, "declarada_por_proveedor");
  assert.deepEqual(
    r.citations.map((c) => c.url),
    ["https://www.g2.com/a", "https://reddit.com/r/x"],
    "sin utm, sin duplicados, sin links propios de ChatGPT ni esquemas peligrosos",
  );
  assert.equal(r.costUsd, 0.0015);

  const e = bd.recordToResult({ prompt: "x", error: "Captcha detected", error_code: "blocked" }, "brightdata_chatgpt", cfg, Date.now(), "AR");
  assert.equal(e.status, "failed");
  assert.equal(e.error?.code, "captcha");
  assert.equal(e.costUsd, 0, "un registro fallido no suma costo");
});

test("análisis sin worker: un solo envío por motor, resultados emparejados por pregunta, sin duplicados", async () => {
  const a = await setupAgency("BD");
  await q.setCollectorStatus("brightdata_chatgpt", "available", null, "test", { verified: true });
  const run = await q.createAnalysis({ workspaceId: a.ws, brandId: a.brand, collectors: ["brightdata_chatgpt"], repetitions: 2, idempotencyKey: "bd-1" });
  assert.equal(run.total, 10);
  const api = fakeApi();

  assert.equal(await batch.dispatchRun(run.id, { fetch: api.f }), 10);
  const trig = api.calls.filter((c) => c.url.includes("/trigger"));
  assert.equal(trig.length, 1, "las 10 ejecuciones van en un solo snapshot");
  assert.match(trig[0].url, /dataset_id=gd_m7aof0k82r803d5bjm/);
  assert.match(trig[0].url, /include_errors=true/);
  assert.equal(trig[0].headers.authorization, "Bearer tok-test");
  const inputs = trig[0].body as { url: string; prompt: string; country: string }[];
  assert.equal(inputs.length, 10);
  assert.ok(inputs.every((i) => i.url === "https://chatgpt.com/" && i.country === "AR"));

  // Un segundo paso no reenvía lo que ya está en Bright Data.
  assert.equal(await batch.dispatchRun(run.id, { fetch: api.f }), 0);
  // La recuperación de ejecuciones colgadas del worker no las toca.
  await q.recoverStaleJobs(0);
  const running = await dbm.one<{ n: number }>("SELECT COUNT(*) AS n FROM responses WHERE run_id = ? AND status = 'running' AND lease_id LIKE 'bd:s_test%'", [run.id]);
  assert.equal(Number(running?.n), 10);

  // Todavía corriendo: no cierra nada.
  assert.equal(await batch.collectRun(run.id, { fetch: api.f }), 0);
  // Listo: guarda las 10 (aunque vengan desordenadas) y el análisis termina.
  for (const s of api.snaps.values()) s.status = "ready";
  assert.equal(await batch.collectRun(run.id, { fetch: api.f }), 10);
  const rows = await dbm.all<{ prompt_text: string; answer: string; status: string; collection_method: string; cost_usd: number; sources: string; brand_mentioned: number }>(
    "SELECT * FROM responses WHERE run_id = ?",
    [run.id],
  );
  assert.ok(rows.every((r) => r.status === "completed" && r.collection_method === "third_party_capture"));
  assert.ok(rows.every((r) => r.answer.includes(`«${r.prompt_text}»`)), "cada respuesta quedó en la ejecución de su pregunta");
  assert.ok(rows.every((r) => !String(r.sources).includes("chatgpt.com")));
  const status = await dbm.one<{ status: string }>("SELECT status FROM runs WHERE id = ?", [run.id]);
  assert.equal(status?.status, "completed");
  // Un paso más no duplica ni vuelve a enviar.
  assert.equal(await batch.collectRun(run.id, { fetch: api.f }), 0);
  assert.equal(await batch.dispatchRun(run.id, { fetch: api.f }), 0);
  assert.equal(api.calls.filter((c) => c.url.includes("/trigger")).length, 1);
});

test("token inválido: no reintenta, falla con motivo claro y el motor deja de estar disponible", async () => {
  const a = await setupAgency("BD401");
  await q.setCollectorStatus("brightdata_chatgpt", "available", null, "test", { verified: true });
  const run = await q.createAnalysis({ workspaceId: a.ws, brandId: a.brand, collectors: ["brightdata_chatgpt"], repetitions: 1, idempotencyKey: "bd-2" });
  const api = fakeApi({ triggerStatus: 401 });
  await batch.dispatchRun(run.id, { fetch: api.f });
  const rows = await dbm.all<{ status: string; error_code: string }>("SELECT status, error_code FROM responses WHERE run_id = ?", [run.id]);
  assert.ok(rows.every((r) => r.status === "failed" && r.error_code === "sin_credenciales"));
  const avail = (await q.collectorAvailability(false)).find((x) => x.id === "brightdata_chatgpt");
  assert.equal(avail?.selectable, false);
});

test("respuestas con error o sin resultado vuelven a la cola con tope de intentos", async () => {
  const a = await setupAgency("BDerr");
  await q.setCollectorStatus("brightdata_chatgpt", "available", null, "test", { verified: true });
  const run = await q.createAnalysis({ workspaceId: a.ws, brandId: a.brand, collectors: ["brightdata_chatgpt"], repetitions: 1, idempotencyKey: "bd-3" });
  const api = fakeApi({ record: (inp, i) => (i === 0 ? { prompt: inp.prompt, error: "Timed out waiting for answer" } : { prompt: inp.prompt, answer_text: "ok" }) });
  await batch.dispatchRun(run.id, { fetch: api.f });
  for (const s of api.snaps.values()) s.status = "ready";
  await batch.collectRun(run.id, { fetch: api.f });
  const rows = await dbm.all<{ status: string; error_code: string | null; attempts: number }>("SELECT status, error_code, attempts FROM responses WHERE run_id = ?", [run.id]);
  assert.equal(rows.filter((r) => r.status === "completed").length, 4);
  const retry = rows.find((r) => r.status === "pending");
  assert.equal(retry?.error_code, "timeout");
  assert.equal(Number(retry?.attempts), 1);
});

test("tope diario de registros: no envía más de lo permitido", async () => {
  process.env.BRIGHTDATA_MAX_RECORDS_PER_DAY = "3";
  try {
    const a = await setupAgency("BDcap");
    await q.setCollectorStatus("brightdata_chatgpt", "available", null, "test", { verified: true });
    const run = await q.createAnalysis({ workspaceId: a.ws, brandId: a.brand, collectors: ["brightdata_chatgpt"], repetitions: 1, idempotencyKey: "bd-4" });
    const api = fakeApi();
    const used = await dbm.one<{ n: number }>("SELECT COUNT(*) AS n FROM responses WHERE collector LIKE 'brightdata_%' AND claimed_at >= ?", [new Date().toISOString().slice(0, 10)]);
    const sent = await batch.dispatchRun(run.id, { fetch: api.f });
    assert.equal(sent, Math.max(0, 3 - Number(used?.n ?? 0)));
  } finally {
    delete process.env.BRIGHTDATA_MAX_RECORDS_PER_DAY;
  }
});

test("emparejamiento: registros sin pregunta solo se asignan si no hay ambigüedad", () => {
  const jobs = [
    { id: "a", prompt_text: "Pregunta A" },
    { id: "b", prompt_text: "Pregunta B" },
    { id: "c", prompt_text: "Pregunta C" },
  ];
  const r1 = batch.matchRecords(jobs, [{ answer_text: "?" }, { prompt: "pregunta  b", answer_text: "B" }, { answer_text: "??" }]);
  assert.deepEqual(r1.pairs.map(([j]) => j.id), ["b"]);
  assert.deepEqual(r1.unmatched.map((j) => j.id), ["a", "c"], "dos registros sin pregunta y dos preguntas distintas: no se adivina");
  const r2 = batch.matchRecords([{ id: "x", prompt_text: "P" }, { id: "y", prompt_text: "P" }], [{ answer_text: "1" }, { answer_text: "2" }]);
  assert.equal(r2.pairs.length, 2);
});

test("prueba de conexión: una consulta, deja el motor disponible y no se repite en 5 minutos", async () => {
  const api = fakeApi();
  const fast = { fetch: api.f, pollMs: 1, maxWaitMs: 2000 };
  // El snapshot pasa a listo en el segundo control de progreso.
  const orig = api.f;
  let polls = 0;
  fast.fetch = async (url, init) => {
    if (url.includes("/progress/")) {
      polls++;
      if (polls > 1) for (const s of api.snaps.values()) s.status = "ready";
    }
    return orig(url, init);
  };
  const out = await probe.probeBrightData("brightdata_chatgpt", fast);
  assert.equal(out.ok, true, out.message);
  assert.equal(out.model, "gpt-5");
  assert.equal(api.calls.filter((c) => c.url.includes("/trigger")).length, 1);
  const avail = (await q.collectorAvailability(false)).find((x) => x.id === "brightdata_chatgpt");
  assert.equal(avail?.selectable, true);

  const again = await probe.probeBrightData("brightdata_chatgpt", fast);
  assert.equal(again.ok, false);
  assert.equal(api.calls.filter((c) => c.url.includes("/trigger")).length, 1, "no gastó otra consulta");
});

test("sin token o sin id de dataset, el motor figura como no configurado con el motivo", async () => {
  const env = { ...process.env, BRIGHTDATA_API_TOKEN: "" };
  const c1 = bd.brightDataConfig("brightdata_chatgpt", env);
  assert.ok("missing" in c1 && /BRIGHTDATA_API_TOKEN/.test(c1.missing));
  const c2 = bd.brightDataConfig("brightdata_gemini", { ...process.env, BRIGHTDATA_DATASET_GEMINI: "" });
  assert.ok("missing" in c2 && /BRIGHTDATA_DATASET_GEMINI/.test(c2.missing));
  const avail = (await q.collectorAvailability(false)).find((x) => x.id === "brightdata_gemini");
  assert.equal(avail?.status, "not_configured");
  assert.equal(avail?.selectable, false);
});
