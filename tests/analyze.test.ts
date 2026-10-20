import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeAnswer, classifySource, cleanDomain, detectMentions, trackedSet } from "../lib/analyze";
import { botStatus, parseRobots } from "../lib/audit";

const brand = { name: "Pampa CRM", domain: "pampacrm.com.ar", aliases: [] as string[] };
const competitors = [{ name: "Andes CRM", domain: "andescrm.com" }, { name: "Ceibo Soft" }];

test("cleanDomain normaliza URLs", () => {
  assert.equal(cleanDomain("https://www.PampaCRM.com.ar/precios?x=1"), "pampacrm.com.ar");
});

test("detecta menciones en orden y sin acentos", () => {
  const m = detectMentions("1. **Andes CRM** es líder. 2. **Pampá CRM** también. Ceibo Soft es cara.", trackedSet(brand, competitors));
  assert.deepEqual(m.map((x) => [x.name, x.position]), [["Andes CRM", 1], ["Pampa CRM", 2], ["Ceibo Soft", 3]]);
});

test("no confunde palabras parciales", () => {
  const m = detectMentions("La pampacrmx no existe", trackedSet(brand, []));
  assert.equal(m.length, 0);
});

test("analiza citas, posición y marcas no seguidas", () => {
  const a = analyzeAnswer(
    "Opciones:\n1. **Tilo Systems**: buena.\n2. **Pampa CRM**: muy recomendada y confiable.",
    [{ url: "https://blog.pampacrm.com.ar/guia", domain: "blog.pampacrm.com.ar" }],
    brand,
    competitors,
  );
  assert.equal(a.brandMentioned, true);
  assert.equal(a.brandPosition, 1);
  assert.equal(a.ownCited, true);
  assert.deepEqual(a.otherBrands, ["Tilo Systems"]);
  assert.equal(a.sentiment?.label, "positivo");
});

test("clasifica fuentes", () => {
  assert.equal(classifySource("g2.com", brand.domain, competitors), "reseñas");
  assert.equal(classifySource("andescrm.com", brand.domain, competitors), "competidor");
  assert.equal(classifySource("www.lanacion.com.ar", brand.domain, competitors), "medio");
});

test("robots.txt: bloqueos específicos y genéricos", () => {
  const g = parseRobots("User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\n");
  assert.equal(botStatus(g, "GPTBot"), "bloqueado");
  assert.equal(botStatus(g, "PerplexityBot"), "parcial");
  assert.equal(botStatus(parseRobots(""), "ClaudeBot"), "permitido");
});

test("títulos descriptivos en negrita no se toman como marcas (bug «Muy fuerte en stock»)", () => {
  const a = analyzeAnswer(
    "Opciones:\n- **Muy fuerte en stock**: tiene de todo.\n- **Ideal para pymes**: barato.\n- **Mercado Libre**: marketplace.\n- **Envíos rápidos** a todo el país.\n1. **Tienda Nube**: plataforma.",
    [],
    brand,
    competitors,
  );
  assert.deepEqual(a.otherBrands.sort(), ["Mercado Libre", "Tienda Nube"]);
});

test("distingue orden de mención de puesto explícito en lista numerada", () => {
  const withList = detectMentions("Te recomiendo:\n1. Andes CRM\n2. Ceibo Soft\n3. Pampa CRM", trackedSet(brand, competitors));
  assert.deepEqual(withList.map((m) => [m.name, m.position, m.explicitRank]), [["Andes CRM", 1, 1], ["Ceibo Soft", 2, 2], ["Pampa CRM", 3, 3]]);
  const prose = detectMentions("Podés mirar Ceibo Soft y también Pampa CRM.", trackedSet(brand, competitors));
  assert.deepEqual(prose.map((m) => [m.name, m.position, m.explicitRank]), [["Ceibo Soft", 1, null], ["Pampa CRM", 2, null]]);
});

test("alias y dominio cuentan como mención; substrings ambiguos no", () => {
  const t = trackedSet({ name: "Banco Nube", domain: "banconube.com.ar", aliases: ["BNube"] }, []);
  assert.equal(detectMentions("Abrí la cuenta en bnube hoy", t).length, 1);
  assert.equal(detectMentions("Mirá banconube.com.ar", t).length, 1);
  assert.equal(detectMentions("El banco nubecita no existe", t).length, 0);
});

test("citación = enlace al dominio, no nombrarlo en el texto", () => {
  const a = analyzeAnswer("Entrá a pampacrm.com.ar para ver precios de Pampa CRM.", [{ url: "https://g2.com/x", domain: "g2.com" }], brand, competitors);
  assert.equal(a.brandMentioned, true);
  assert.equal(a.ownCited, false);
});
