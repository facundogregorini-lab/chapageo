// Conector de Bright Data contra una API simulada que imita los endpoints documentados
// (trigger → progress → snapshot). No consume consultas reales.
import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import { setupAgency, useTempDb } from "./helpers";

useTempDb();
process.env.BRIGHTDATA_API_KEY = "tok-test";
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
type Inp = { url: string; prompt: string; country?: string };

/**
 * API falsa: guarda las entradas de cada snapshot y responde según `status`.
 * `/scrape` contesta 200 con los registros, o 202 + snapshot si `scrape: "async"`.
 * `fail` permite forzar códigos de error por endpoint (se consumen en orden).
 */
function fakeApi(
  opts: {
    triggerStatus?: number;
    scrape?: "sync" | "async";
    fail?: Partial<Record<"scrape" | "trigger" | "progress" | "snapshot", number[]>>;
    record?: (input: Inp, i: number) => Record<string, unknown>;
  } = {},
) {
  const calls: Call[] = [];
  const snaps = new Map<string, { inputs: Inp[]; status: string }>();
  let n = 0;
  const recordsFor = (inputs: Inp[]) =>
    inputs.map(
      (inp, i) =>
        opts.record?.(inp, i) ?? {
          url: inp.url,
          prompt: inp.prompt,
          country: inp.country,
          model: "gpt-5",
          web_search_triggered: true,
          timestamp: "2026-10-21T12:00:00.000Z",
          answer_text: `Para «${inp.prompt}»: 1. Rival Uno 2. Marca Otra. Fuente: g2.`,
          citations: [{ url: "https://www.g2.com/x?utm_source=chatgpt.com", title: "G2", position: 1 }],
          links_attached: [{ url: "https://chatgpt.com/c/123", text: "propio" }, { url: "https://rivaluno.com/precios", text: "Rival" }],
        },
    );
  const f: import("../lib/collectors/brightdata").FetchLike = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method ?? "GET", url, headers: init.headers ?? {}, body });
    const ok = (data: unknown, status = 200) => ({
      ok: status < 400,
      status,
      headers: { get: (h: string) => (h === "retry-after" && status === 202 ? "0" : null) },
      text: async () => (typeof data === "string" ? data : JSON.stringify(data)),
    });
    const path = new URL(url).pathname;
    const kind = path.split("/")[3] as "scrape" | "trigger" | "progress" | "snapshot";
    const forced = opts.fail?.[kind]?.shift();
    if (forced) return ok("error forzado", forced);
    if (path === "/datasets/v3/scrape") {
      if (opts.scrape !== "async") return ok(recordsFor(body.input));
      const id = `s_test${++n}`;
      snaps.set(id, { inputs: body.input, status: "running" });
      return ok({ snapshot_id: id, message: "Request is taking longer than expected" }, 202);
    }
    if (path === "/datasets/v3/trigger") {
      if (opts.triggerStatus) return ok("Unauthorized", opts.triggerStatus);
      const id = `s_test${++n}`;
      snaps.set(id, { inputs: body.input, status: "running" });
      return ok({ snapshot_id: id });
    }
    const m = path.match(/^\/datasets\/v3\/(progress|snapshot)\/(.+)$/);
    const snap = m ? snaps.get(decodeURIComponent(m[2])) : undefined;
    if (!m || !snap) return ok({ error: "not found" }, 404);
    if (m[1] === "progress") return ok({ status: snap.status });
    if (snap.status !== "ready") return ok({ status: "building", message: "Snapshot is building" }, 202);
    // Bright Data no garantiza el orden: lo devolvemos invertido.
    return ok(recordsFor(snap.inputs).reverse());
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
  const inputs = (trig[0].body as { input: Inp[] }).input;
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
  const api = fakeApi({ scrape: "async" });
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
  assert.equal(api.calls.filter((c) => c.url.includes("/scrape")).length, 1);
  const avail = (await q.collectorAvailability(false)).find((x) => x.id === "brightdata_chatgpt");
  assert.equal(avail?.selectable, true);

  const again = await probe.probeBrightData("brightdata_chatgpt", fast);
  assert.equal(again.ok, false);
  assert.equal(api.calls.filter((c) => c.url.includes("/scrape")).length, 1, "no gastó otra consulta");
});

test("sin key el motor figura como no configurado; los datasets salen del panel o de la variable", async () => {
  const env = { ...process.env, BRIGHTDATA_API_KEY: "", BRIGHTDATA_API_TOKEN: "" };
  const c1 = bd.brightDataConfig("brightdata_chatgpt", env);
  assert.ok("missing" in c1 && /BRIGHTDATA_API_KEY/.test(c1.missing));
  const c0 = bd.brightDataConfig("brightdata_chatgpt", { ...env, BRIGHTDATA_API_TOKEN: "viejo" });
  assert.ok(!("missing" in c0) && c0.token === "viejo", "acepta el nombre anterior de la variable");
  const c2 = bd.brightDataConfig("brightdata_gemini", { ...process.env, BRIGHTDATA_DATASET_GEMINI: "" });
  assert.ok(!("missing" in c2) && c2.datasetId === bd.GEMINI_DATASET_ID, "variable vacía = dataset del panel");
  const c3 = bd.brightDataConfig("brightdata_gemini", { ...process.env, BRIGHTDATA_DATASET_GEMINI: "gd_otro" });
  assert.ok(!("missing" in c3) && c3.datasetId === "gd_otro");
  // Con la key cargada, Gemini usa el dataset del panel y se puede elegir sin la prueba manual.
  const avail = (await q.collectorAvailability(false)).find((x) => x.id === "brightdata_gemini");
  assert.equal(avail?.status, "available");
  assert.equal(avail?.selectable, true);
  // Una prueba que falló por algo transitorio no lo bloquea; una key rechazada sí.
  await q.setCollectorStatus("brightdata_gemini", "unverified", "Última prueba falló: timeout", "brightdata");
  assert.equal((await q.collectorAvailability(false)).find((x) => x.id === "brightdata_gemini")?.selectable, true);
  await q.setCollectorStatus("brightdata_gemini", "unavailable", "Bright Data respondió 401", "brightdata");
  assert.equal((await q.collectorAvailability(false)).find((x) => x.id === "brightdata_gemini")?.selectable, false);
});

test("cliente sincrónico: (proveedor, pregunta) → texto, fuentes, proveedor, fecha y registro crudo", async () => {
  const api = fakeApi();
  const a = await bd.queryBrightData("chatgpt", "mejor banco digital", { fetch: api.f });
  assert.equal(a.provider, "chatgpt");
  assert.equal(a.mode, "sync");
  assert.equal(a.snapshotId, null);
  assert.match(a.text, /Rival Uno/);
  assert.deepEqual(a.citations.map((c) => c.url), ["https://www.g2.com/x", "https://rivaluno.com/precios"]);
  assert.equal(a.timestamp, "2026-10-21T12:00:00.000Z");
  assert.equal(a.model, "gpt-5");
  assert.equal((a.raw as { prompt: string }).prompt, "mejor banco digital");
  assert.equal(api.calls.length, 1);
  const c = api.calls[0];
  assert.equal(c.method, "POST");
  assert.match(c.url, /\/datasets\/v3\/scrape\?dataset_id=gd_m7aof0k82r803d5bjm&notify=false&include_errors=true/);
  assert.equal(c.headers.authorization, "Bearer tok-test");
  assert.deepEqual(c.body, { input: [{ url: "https://chatgpt.com/", prompt: "mejor banco digital", country: "AR", web_search: false, additional_prompt: "" }] });
});

test("entradas de Gemini y Perplexity con el formato del panel y sus datasets", async () => {
  const api = fakeApi({ record: (inp) => ({ prompt: inp.prompt, answer_text: "ok", links_attached: [{ url: "https://www.google.com/url?q=https://bna.com.ar/x&sa=U" }] }) });
  const g = await bd.queryBrightData("gemini", "p", { fetch: api.f });
  assert.match(api.calls[0].url, /dataset_id=gd_mbz66arm2mf9cu856y/);
  assert.deepEqual(api.calls[0].body, { input: [{ url: "https://gemini.google.com/", prompt: "p", index: 1 }] });
  assert.deepEqual(g.citations.map((c) => c.url), ["https://bna.com.ar/x"], "desarma el redirect de Google");
  await bd.queryBrightData("perplexity", "p", { fetch: api.f });
  assert.match(api.calls[1].url, /dataset_id=gd_m7dhdot1vw9a7gc1n/);
  assert.deepEqual(api.calls[1].body, { input: [{ url: "https://www.perplexity.ai", prompt: "p" }] });
});

test("si el sincrónico no alcanza (202), sigue por el snapshot sin volver a pedir", async () => {
  const api = fakeApi({ scrape: "async" });
  let polls = 0;
  const f: typeof api.f = async (url, init) => {
    if (url.includes("/progress/") && ++polls >= 2) for (const s of api.snaps.values()) s.status = "ready";
    return api.f(url, init);
  };
  const a = await bd.queryBrightData("chatgpt", "x", { fetch: f, pollMs: 1, maxWaitMs: 5000 });
  assert.equal(a.mode, "async");
  assert.equal(a.snapshotId, "s_test1");
  assert.match(a.text, /«x»/);
  assert.equal(api.calls.filter((c) => c.url.includes("/scrape")).length, 1);
  assert.equal(api.calls.filter((c) => c.url.includes("/snapshot/")).length, 1);

  // Si no termina a tiempo, error de timeout (transitorio) con el snapshot para retomarlo.
  const slow = fakeApi({ scrape: "async" });
  await assert.rejects(bd.queryBrightData("chatgpt", "x", { fetch: slow.f, pollMs: 1, maxWaitMs: 30 }), (e: InstanceType<typeof bd.BrightDataError>) => {
    assert.equal(e.code, "timeout");
    assert.equal(e.transient, true);
    return true;
  });
});

test("reintentos acotados: los GET se reintentan; los POST solo si Bright Data no los procesó", async () => {
  const fast = { pollMs: 1, maxWaitMs: 5000, retryBaseMs: 1 };
  // progress falla dos veces con 503: se reintenta y termina bien.
  const a = fakeApi({ scrape: "async", fail: { progress: [503, 503] } });
  for (const s of a.snaps.values()) s.status = "ready";
  const f: typeof a.f = async (url, init) => {
    const r = await a.f(url, init);
    for (const s of a.snaps.values()) s.status = "ready";
    return r;
  };
  assert.equal((await bd.queryBrightData("chatgpt", "x", { ...fast, fetch: f })).mode, "async");
  assert.equal(a.calls.filter((c) => c.url.includes("/progress/")).length, 3);

  // 500 en /scrape: pudo haberse procesado (y cobrado), así que no se repite.
  const b = fakeApi({ fail: { scrape: [500] } });
  await assert.rejects(bd.queryBrightData("chatgpt", "x", { ...fast, fetch: b.f }));
  assert.equal(b.calls.length, 1);

  // 429 en /scrape: no se procesó; un reintento y listo.
  const c = fakeApi({ fail: { scrape: [429] } });
  assert.equal((await bd.queryBrightData("chatgpt", "x", { ...fast, fetch: c.f })).mode, "sync");
  assert.equal(c.calls.length, 2);

  // 429 persistente: como máximo dos pedidos.
  const d = fakeApi({ fail: { scrape: [429, 429, 429] } });
  await assert.rejects(bd.queryBrightData("chatgpt", "x", { ...fast, fetch: d.f }), (e: InstanceType<typeof bd.BrightDataError>) => e.status === 429);
  assert.equal(d.calls.length, 2);

  // 401: key inválida, sin reintento y no transitorio.
  const e = fakeApi({ fail: { scrape: [401] } });
  await assert.rejects(bd.queryBrightData("chatgpt", "x", { ...fast, fetch: e.f }), (err: unknown) => bd.errorFrom(err).code === "sin_credenciales" && !bd.errorFrom(err).transient);
  assert.equal(e.calls.length, 1);
});

test("timeout por pedido: si Bright Data no contesta, corta con error de timeout", async () => {
  const hang: import("../lib/collectors/brightdata").FetchLike = (_url, init) =>
    new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
  await assert.rejects(bd.queryBrightData("chatgpt", "x", { fetch: hang, timeoutMs: 20 }), (e: InstanceType<typeof bd.BrightDataError>) => e.code === "timeout");
});

test("sin WORKER_ENABLED solo se ofrecen los motores de Bright Data", async () => {
  const prev = process.env.WORKER_ENABLED;
  delete process.env.WORKER_ENABLED;
  try {
    const ids = (await q.collectorAvailability(false)).map((x) => x.id);
    assert.deepEqual(ids.sort(), ["brightdata_chatgpt", "brightdata_gemini", "brightdata_perplexity"]);
  } finally {
    process.env.WORKER_ENABLED = prev;
  }
});
