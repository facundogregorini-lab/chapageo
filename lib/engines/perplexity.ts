import { domainOf } from "../analyze";
import type { Source } from "../types";
import { fetchJson, systemFor } from "./shared";
import type { EngineAdapter } from "./types";

export const perplexityEngine: EngineAdapter = async ({ prompt, country, city, language }) => {
  const model = process.env.PERPLEXITY_MODEL || "sonar";
  const data = await fetchJson("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemFor(country, city, language) },
        { role: "user", content: prompt },
      ],
      web_search_options: { user_location: { country, ...(city ? { city } : {}) } },
    }),
  });
  const answer: string = data.choices?.[0]?.message?.content ?? "";
  const sources: Source[] = [];
  const results: { url: string; title?: string }[] =
    data.search_results ?? (data.citations ?? []).map((url: string) => ({ url }));
  for (const r of results) if (r.url) sources.push({ url: r.url, title: r.title, domain: domainOf(r.url) });
  const costUsd = 0.005 + ((data.usage?.total_tokens ?? 0) * 1) / 1e6;
  return { answer, sources, model, costUsd, simulated: false };
};
