// Checker gratis con Bright Data, contra una API simulada. No consume consultas reales.
import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import { useTempDb } from "./helpers";

useTempDb();
process.env.BRIGHTDATA_API_KEY = "tok-test";
for (const k of ["OPENAI_API_KEY", "GEMINI_API_KEY", "PERPLEXITY_API_KEY", "ANTHROPIC_API_KEY"]) delete process.env[k];
let checker: typeof import("../lib/checker");
let dbm: typeof import("../lib/db");
type FetchLike = import("../lib/collectors/brightdata").FetchLike;

before(async () => {
  dbm = await import("../lib/db");
  checker = await import("../lib/checker");
  await dbm.db();
});

beforeEach(async () => {
  await dbm.run("DELETE FROM events");
});

const DOMAIN = "ejemplo-inexistente-chapageo.com.ar";
const input = { domain: DOMAIN, category: "bancos digitales", country: "AR", brandName: "Banquito" };

/** API falsa: /trigger guarda las preguntas; el snapshot queda listo cuando se llama a setReady(). */
function fakeApi(opts: { status?: number; body?: string; failDataset?: string } = {}) {
  const calls: { url: string; body: { input: { prompt: string }[] } | undefined }[] = [];
  // Un snapshot por dataset (cada motor tiene el suyo).
  const snaps = new Map<string, { prompt: string }[]>();
  const ready = new Set<string>();
  const records = (id: string) =>
    (snaps.get(id) ?? []).map((inp, i) => ({
      prompt: inp.prompt,
      answer_text: i % 2 === 0 ? "Te recomiendo Banquito y Rival Uno." : "Rival Uno y Rival Dos son los más usados.",
      citations: [{ url: `https://${DOMAIN}/tasas`, title: "Banquito" }],
    }));
  const f: FetchLike = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, body });
    const res = (data: unknown, status = 200) => ({ ok: status < 400, status, headers: { get: () => null }, text: async () => (typeof data === "string" ? data : JSON.stringify(data)) });
    const path = new URL(url).pathname;
    if (opts.status) return res(opts.body ?? { error: "x" }, opts.status);
    if (path === "/datasets/v3/trigger") {
      const ds = new URL(url).searchParams.get("dataset_id") ?? "";
      if (ds === opts.failDataset) return res("Service Unavailable", 503);
      const id = ds === "gd_m7aof0k82r803d5bjm" ? "s_chk" : `s_${ds}`;
      snaps.set(id, body.input);
      return res({ snapshot_id: id });
    }
    const id = path.split("/").pop()!;
    if (path.startsWith("/datasets/v3/progress/")) return res({ status: ready.has(id) ? "ready" : "running" });
    if (path.startsWith("/datasets/v3/snapshot/")) return ready.has(id) ? res(records(id)) : res({ status: "building" }, 202);
    return res({}, 404);
  };
  return { f, calls, setReady: (id = "s_chk") => ready.add(id) };
}

test("de punta a punta: el chequeo queda pendiente, la página lo encuentra y se completa en la misma fila", async () => {
  const api = fakeApi();
  const r = await checker.runChecker(input, { fetch: api.f });
  assert.equal(r.method, "brightdata");
  assert.equal(r.engine, "chatgpt");
  assert.deepEqual(r.pending?.snapshots, [{ engine: "chatgpt", snapshotId: "s_chk" }], "vuelve enseguida, sin esperar la respuesta");
  assert.equal(api.calls.length, 1, "un solo envío para las 5 preguntas");
  assert.equal(api.calls[0].body?.input.length, 5);
  const ev = await dbm.one<{ props: string }>("SELECT props FROM events WHERE name = 'checker_brightdata'");
  assert.equal(JSON.parse(ev!.props).n, 5, "cuenta para el tope diario");

  // Lo que hace /api/checker: guardar y devolver el token.
  const saved = await checker.saveAudit("checker", r, { domain: DOMAIN });

  // Lo que hace /auditoria/[token] mientras Bright Data trabaja: la encuentra pendiente (no 404).
  const first = await checker.loadCheckerAudit(saved.shareToken, { fetch: api.f, retries: 0 });
  assert.ok(first, "una auditoría pendiente se encuentra");
  assert.equal(first.result.pending?.snapshots?.[0].snapshotId, "s_chk");
  assert.equal(first.result.total, 0);

  // Bright Data termina: la próxima carga completa la misma fila.
  api.setReady();
  const done = await checker.loadCheckerAudit(saved.shareToken, { fetch: api.f, retries: 0 });
  assert.ok(done && !done.result.pending);
  assert.equal(done.id, first.id);
  assert.equal(done.result.total, 5);
  assert.equal(done.result.mentioned, 3);
  assert.equal(done.result.cited, 5);
  const row = await dbm.one<{ result: string }>("SELECT result FROM audits WHERE share_token = ?", [saved.shareToken]);
  assert.equal(JSON.parse(row!.result).pending, null, "quedó guardado completo");
  assert.equal(api.calls.filter((c) => c.url.includes("/trigger")).length, 1, "no se volvió a pedir");

  // Un token que no existe sí da 404.
  assert.equal(await checker.loadCheckerAudit("no-existe", { retries: 0 }), null);
});

test("cuenta inactiva: mensaje claro y el chequeo igual muestra la revisión técnica", async () => {
  const api = fakeApi({ status: 400, body: "Customer is not active" });
  const r = await checker.runChecker(input, { fetch: api.f });
  assert.equal(r.engine, null);
  assert.equal(r.questions.length, 5);
  assert.match(r.questions[0].error ?? "", /no está activa/);
  assert.doesNotMatch(r.questions[0].error ?? "", /Bright/);
});

test("tope diario o key rechazada: no consulta Bright Data y devuelve la revisión técnica", async () => {
  process.env.BRIGHTDATA_MAX_RECORDS_PER_DAY = "3";
  try {
    const api = fakeApi();
    const r = await checker.runChecker(input, { fetch: api.f });
    assert.equal(api.calls.length, 0);
    assert.equal(r.method, undefined);
    assert.equal(r.engine, null);
  } finally {
    delete process.env.BRIGHTDATA_MAX_RECORDS_PER_DAY;
  }
  const bad = fakeApi({ status: 401 });
  const r2 = await checker.runChecker(input, { fetch: bad.f });
  assert.equal(r2.engine, null, "con la key rechazada sigue sin romperse");
  assert.equal(r2.questions.length, 5);
  assert.match(r2.questions[0].error ?? "", /rechazó la key/);
});

test("tope de chequeos gratis por día con Bright Data", async () => {
  process.env.CHECKER_BRIGHTDATA_MAX_PER_DAY = "1";
  try {
    const api = fakeApi();
    assert.equal((await checker.runChecker(input, { fetch: api.f })).method, "brightdata");
    assert.equal((await checker.runChecker(input, { fetch: api.f })).method, undefined);
    assert.equal(api.calls.length, 1);
  } finally {
    delete process.env.CHECKER_BRIGHTDATA_MAX_PER_DAY;
  }
});

test("varios motores: un lote por motor, cada uno cuenta para el tope y se completan por separado", async () => {
  const api = fakeApi();
  const r = await checker.runChecker({ ...input, engines: ["chatgpt", "gemini", "perplexity"] }, { fetch: api.f });
  assert.equal(r.method, "brightdata");
  assert.deepEqual(r.engines, ["chatgpt", "gemini", "perplexity"]);
  assert.equal(r.engineLabel, "ChatGPT, Gemini y Perplexity");
  assert.equal(api.calls.length, 3, "un envío por motor");
  assert.equal(r.questions.length, 15);
  const evs = await dbm.all<{ props: string }>("SELECT props FROM events WHERE name = 'checker_brightdata'");
  assert.equal(evs.length, 3);
  assert.equal(evs.reduce((n, e) => n + JSON.parse(e.props).n, 0), 15, "15 registros contra el tope diario");

  const saved = await checker.saveAudit("checker", r, { domain: DOMAIN });
  // Termina solo Gemini: se completa esa parte y los otros siguen pendientes.
  api.setReady("s_gd_mbz66arm2mf9cu856y");
  const part = await checker.loadCheckerAudit(saved.shareToken, { fetch: api.f, retries: 0 });
  assert.deepEqual(part!.result.pending?.snapshots?.map((s) => s.engine), ["chatgpt", "perplexity"]);
  assert.equal(part!.result.total, 5);
  assert.equal(part!.result.questions.filter((q) => q.engine === "gemini" && !q.error).length, 5);

  api.setReady("s_chk");
  api.setReady("s_gd_m7dhdot1vw9a7gc1n");
  const done = await checker.loadCheckerAudit(saved.shareToken, { fetch: api.f, retries: 0 });
  assert.equal(done!.result.pending, null);
  assert.equal(done!.result.total, 15);
  assert.equal(done!.result.mentioned, 9);
  assert.deepEqual(done!.result.byEngine?.map((e) => [e.engine, e.mentioned, e.total]), [["chatgpt", 3, 5], ["gemini", 3, 5], ["perplexity", 3, 5]]);
});

test("varios motores: si uno falla al enviarse, los demás siguen", async () => {
  const api = fakeApi({ failDataset: "gd_mbz66arm2mf9cu856y" });
  const r = await checker.runChecker({ ...input, engines: ["chatgpt", "gemini"] }, { fetch: api.f });
  assert.equal(r.method, "brightdata");
  assert.deepEqual(r.pending?.snapshots?.map((s) => s.engine), ["chatgpt"]);
  const gem = r.questions.filter((q) => q.engine === "gemini");
  assert.equal(gem.length, 5);
  assert.match(gem[0].error ?? "", /No pudimos consultar a Gemini/);
});

test("varios motores con poco cupo: se consultan solo los que entran", async () => {
  process.env.CHECKER_BRIGHTDATA_MAX_PER_DAY = "2";
  try {
    const api = fakeApi();
    const r = await checker.runChecker({ ...input, engines: ["perplexity", "gemini", "chatgpt"] }, { fetch: api.f });
    assert.deepEqual(r.engines, ["perplexity", "gemini"]);
    assert.equal(api.calls.length, 2);
    const r2 = await checker.runChecker({ ...input, engines: ["chatgpt"] }, { fetch: api.f });
    assert.equal(r2.method, undefined, "cupo agotado");
    assert.equal(api.calls.length, 2);
  } finally {
    delete process.env.CHECKER_BRIGHTDATA_MAX_PER_DAY;
  }
});

test("chequeos viejos de un solo motor (pending con snapshotId) se siguen completando", async () => {
  const api = fakeApi();
  const r = await checker.runChecker(input, { fetch: api.f });
  const legacy = { ...r, engines: undefined, questions: r.questions.map(({ engine: _e, ...q }) => q), pending: { snapshotId: "s_chk", since: r.pending!.since } };
  assert.equal(await checker.resumeChecker(legacy, api.f), null, "sigue esperando");
  api.setReady();
  const done = await checker.resumeChecker(legacy, api.f);
  assert.equal(done?.pending, null);
  assert.equal(done?.total, 5);
});
