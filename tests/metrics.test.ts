import assert from "node:assert/strict";
import { test } from "node:test";
import { computeAnalysisMetrics, slice } from "../lib/metrics";
import { buildOpportunities } from "../lib/opportunities";
import type { Brand, JobStatus, Mention, PromptCategory, ResponseRow } from "../lib/types";

const brand = {
  id: "b1",
  workspace_id: "w1",
  name: "Pampa",
  domain: "pampa.com.ar",
  competitors: [{ name: "Andes", domain: "andes.com" }, { name: "Ceibo" }],
  aliases: [],
} as unknown as Brand;

let n = 0;
function job(p: { status?: JobStatus; cat?: PromptCategory; collector?: string; names?: string[]; links?: string[]; answer?: string | null; prompt?: string }): ResponseRow {
  n++;
  const names = p.names ?? [];
  const mentions: Mention[] = names.map((name, i) => ({ name, own: name === "Pampa", position: i + 1, explicitRank: null, count: 1, snippet: "" }));
  return {
    id: `j${n}`,
    run_id: "r1",
    brand_id: "b1",
    workspace_id: "w1",
    prompt_id: p.prompt ?? `p${n}`,
    prompt_text: p.prompt ?? `pregunta ${n}`,
    prompt_kind: "sin_marca",
    prompt_category: p.cat ?? "descubrimiento",
    engine: "chatgpt",
    collector: p.collector ?? "chatgpt_web",
    collection_method: "web_capture",
    status: p.status ?? "completed",
    answer: p.answer === undefined ? "texto" : p.answer,
    sources: (p.links ?? []).map((d) => ({ url: `https://${d}/x`, domain: d })),
    mentions,
    other_brands: [],
    brand_mentioned: names.includes("Pampa") ? 1 : 0,
    own_cited: (p.links ?? []).includes("pampa.com.ar") ? 1 : 0,
    cost_usd: 0,
    attempts: 1,
    max_attempts: 3,
    repetition: 1,
  } as unknown as ResponseRow;
}

test("errores, parciales y bloqueos no cuentan como ausencia ni entran al denominador", () => {
  const jobs = [
    job({ names: ["Pampa", "Andes"] }),
    job({ names: ["Andes"] }),
    job({ status: "failed", answer: null }),
    job({ status: "requires_intervention", answer: null }),
    job({ status: "partial", answer: "texto cortado", names: ["Pampa"] }),
    job({ status: "pending", answer: null }),
  ];
  const m = computeAnalysisMetrics(brand, null, jobs);
  const s = slice(m, "descubrimiento", "chatgpt_web")!;
  assert.deepEqual([s.own.presence.num, s.own.presence.den], [1, 2]);
  assert.deepEqual([m.coverage.num, m.coverage.den], [2, 6]);
  assert.equal(m.byStatus.failed, 1);
  assert.equal(m.byStatus.requires_intervention, 1);
});

test("una respuesta válida vacía tampoco cuenta como válida", () => {
  const m = computeAnalysisMetrics(brand, null, [job({ answer: "   " }), job({ names: ["Pampa"] })]);
  assert.equal(m.valid, 1);
});

test("cuota de menciones: cada marca una vez por respuesta, denominador = suma de apariciones", () => {
  const jobs = [job({ names: ["Pampa", "Andes"] }), job({ names: ["Andes", "Ceibo"] }), job({ names: ["Andes"] }), job({ names: [] })];
  const s = slice(computeAnalysisMetrics(brand, null, jobs), "descubrimiento", "chatgpt_web")!;
  const by = Object.fromEntries(s.brands.map((b) => [b.name, b]));
  assert.deepEqual([by.Pampa.share.num, by.Pampa.share.den], [1, 5]);
  assert.deepEqual([by.Andes.share.num, by.Andes.share.den], [3, 5]);
  assert.deepEqual([by.Andes.presence.num, by.Andes.presence.den], [3, 4]);
  assert.deepEqual([by.Ceibo.presence.num, by.Ceibo.presence.den], [1, 4]);
});

test("citaciones = respuestas válidas que enlazan al dominio", () => {
  const jobs = [job({ names: ["Pampa"], links: ["pampa.com.ar", "g2.com"] }), job({ names: ["Pampa"], links: ["g2.com"] }), job({ status: "failed", answer: null, links: ["pampa.com.ar"] })];
  const m = computeAnalysisMetrics(brand, null, jobs);
  const s = slice(m, "descubrimiento", "chatgpt_web")!;
  assert.deepEqual([s.own.citation.num, s.own.citation.den], [1, 2]);
  assert.deepEqual(m.sources.map((x) => [x.domain, x.responses]), [["g2.com", 2], ["pampa.com.ar", 1]]);
});

test("los tipos de pregunta no se mezclan y el agregado suma solo dentro del tipo", () => {
  const jobs = [
    job({ cat: "descubrimiento", names: ["Andes"] }),
    job({ cat: "descubrimiento", collector: "gemini_web", names: ["Pampa"] }),
    job({ cat: "marca", names: ["Pampa"] }),
    job({ cat: "marca", collector: "gemini_web", names: ["Pampa"] }),
  ];
  const m = computeAnalysisMetrics(brand, null, jobs);
  const disc = slice(m, "descubrimiento", "todos")!;
  assert.deepEqual([disc.own.presence.num, disc.own.presence.den], [1, 2]);
  const marca = slice(m, "marca", "todos")!;
  assert.deepEqual([marca.own.presence.num, marca.own.presence.den], [2, 2]);
  assert.deepEqual([slice(m, "descubrimiento", "chatgpt_web")!.own.presence.num, slice(m, "descubrimiento", "gemini_web")!.own.presence.num], [0, 1]);
});

test("oportunidades: sin evidencia suficiente lo dice; con evidencia enlaza ejecuciones", () => {
  const few = buildOpportunities(brand, computeAnalysisMetrics(brand, null, [job({ names: ["Andes"] })]));
  assert.equal(few.items.length, 0);
  assert.match(few.note ?? "", /Evidencia insuficiente/);
  const jobs = [
    ...Array.from({ length: 4 }, () => job({ prompt: "mejor crm", names: ["Andes"], links: ["g2.com"] })),
    job({ names: ["Pampa"], links: ["g2.com"] }),
    job({ names: ["Pampa"] }),
  ];
  const r = buildOpportunities(brand, computeAnalysisMetrics(brand, null, jobs));
  assert.ok(r.items.length >= 2);
  const gap = r.items.find((o) => o.id.startsWith("gap-"))!;
  assert.equal(gap.jobIds.length, 4);
  assert.match(gap.observed, /4 de 4/);
});
