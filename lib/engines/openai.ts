import { domainOf } from "../analyze";
import type { Source } from "../types";
import { fetchJson, systemFor } from "./shared";
import type { EngineAdapter } from "./types";

// ChatGPT vía Responses API con la herramienta de búsqueda web (lo más parecido a ChatGPT con búsqueda).
// Ojo: la API no es la interfaz de consumo; lo rotulamos así en el panel.
export const openaiEngine: EngineAdapter = async ({ prompt, country, city, language }) => {
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const data = await fetchJson("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      instructions: systemFor(country, city, language),
      input: prompt,
      tools: [
        {
          type: "web_search",
          user_location: { type: "approximate", country, ...(city ? { city } : {}) },
        },
      ],
    }),
  });
  let answer = "";
  const sources: Source[] = [];
  for (const item of data.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type !== "output_text") continue;
      answer += part.text;
      for (const a of part.annotations ?? []) {
        if (a.type === "url_citation" && a.url) sources.push({ url: a.url, title: a.title, domain: domainOf(a.url) });
      }
    }
  }
  const inTok = data.usage?.input_tokens ?? 0;
  const outTok = data.usage?.output_tokens ?? 0;
  // Estimación: tarifa de búsqueda + tokens a precio de modelo chico. Ajustar con la factura real.
  const costUsd = 0.01 + (inTok * 0.4 + outTok * 1.6) / 1e6;
  return { answer, sources, model, costUsd, simulated: false };
};
