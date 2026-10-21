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

/** /scrape responde 200 con un registro por pregunta, o 202 si `async`. */
function fakeApi(opts: { async?: boolean; status?: number } = {}) {
  const calls: { url: string; body: { input: { prompt: string }[] } | undefined }[] = [];
  let inputs: { prompt: string }[] = [];
  let ready = false;
  const records = () =>
    inputs.map((inp, i) => ({
      prompt: inp.prompt,
      answer_text: i % 2 === 0 ? "Te recomiendo Banquito y Rival Uno." : "Rival Uno y Rival Dos son los más usados.",
      citations: [{ url: `https://${DOMAIN}/tasas`, title: "Banquito" }],
    }));
  const f: FetchLike = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, body });
    const res = (data: unknown, status = 200) => ({ ok: status < 400, status, headers: { get: () => null }, text: async () => JSON.stringify(data) });
    const path = new URL(url).pathname;
    if (opts.status) return res({ error: "x" }, opts.status);
    if (path === "/datasets/v3/scrape") {
      inputs = body.input;
      return opts.async ? res({ snapshot_id: "s_chk" }, 202) : res(records());
    }
    if (path.startsWith("/datasets/v3/progress/")) return res({ status: ready ? "ready" : "running" });
    if (path.startsWith("/datasets/v3/snapshot/")) return ready ? res(records()) : res({ status: "building" }, 202);
    return res({}, 404);
  };
  return { f, calls, setReady: () => (ready = true) };
}

test("checker gratis: 5 preguntas a ChatGPT en un solo pedido a Bright Data", async () => {
  const api = fakeApi();
  const r = await checker.runChecker(input, { fetch: api.f });
  assert.equal(r.method, "brightdata");
  assert.equal(r.engine, "chatgpt");
  assert.equal(api.calls.length, 1, "un solo pedido para las 5 preguntas");
  assert.equal(api.calls[0].body?.input.length, 5);
  assert.equal(r.total, 5);
  assert.equal(r.mentioned, 3);
  assert.equal(r.cited, 5);
  assert.ok(!r.pending);
  const ev = await dbm.one<{ props: string }>("SELECT props FROM events WHERE name = 'checker_brightdata'");
  assert.equal(JSON.parse(ev!.props).n, 5, "cuenta para el tope diario de Bright Data");
});

test("si Bright Data tarda, el resultado queda pendiente y se completa al abrirlo", async () => {
  const api = fakeApi({ async: true });
  const r = await checker.runChecker(input, { fetch: api.f, deadline: Date.now() + 50 });
  assert.equal(r.pending?.snapshotId, "s_chk");
  assert.equal(r.total, 0);
  assert.equal(await checker.resumeChecker(r, api.f), null, "todavía no está listo");
  api.setReady();
  const done = await checker.resumeChecker(r, api.f);
  assert.ok(done && !done.pending);
  assert.equal(done.total, 5);
  assert.equal(done.mentioned, 3);
  assert.equal(api.calls.filter((c) => c.url.includes("/scrape")).length, 1, "no se volvió a pedir");
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
