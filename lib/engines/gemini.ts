import { domainOf } from "../analyze";
import type { Source } from "../types";
import { fetchJson, systemFor } from "./shared";
import type { EngineAdapter } from "./types";

// Gemini con grounding en Google Search (misma técnica que usa el checker de Lumen).
export const geminiEngine: EngineAdapter = async ({ prompt, country, city, language }) => {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const data = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemFor(country, city, language) }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      }),
    },
  );
  const cand = data.candidates?.[0];
  const answer = (cand?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  const sources: Source[] = [];
  for (const chunk of cand?.groundingMetadata?.groundingChunks ?? []) {
    const web = chunk.web;
    if (!web?.uri) continue;
    // Gemini devuelve URLs de redirección (vertexaisearch...); el título suele traer el dominio real.
    const title: string = web.title ?? "";
    const domain = /\./.test(title) && !/\s/.test(title) ? title.toLowerCase() : domainOf(web.uri);
    sources.push({ url: web.uri, title, domain });
  }
  const inTok = data.usageMetadata?.promptTokenCount ?? 0;
  const outTok = data.usageMetadata?.candidatesTokenCount ?? 0;
  const costUsd = 0.014 + (inTok * 0.3 + outTok * 2.5) / 1e6;
  return { answer, sources, model, costUsd, simulated: false };
};
