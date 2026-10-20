import Anthropic from "@anthropic-ai/sdk";
import { domainOf } from "../analyze";
import type { Source } from "../types";
import { systemFor } from "./shared";
import type { EngineAdapter } from "./types";

let client: Anthropic | null = null;
function anthropic() {
  if (!client) client = new Anthropic();
  return client;
}

export const claudeEngine: EngineAdapter = async ({ prompt, country, city, language }) => {
  const model = process.env.CLAUDE_MODEL || "claude-opus-5-5";
  const response = await anthropic().messages.create({
    model,
    max_tokens: 4000,
    output_config: { effort: "low" },
    system: systemFor(country, city, language),
    tools: [
      {
        type: "web_search_20260209",
        name: "web_search",
        max_uses: 3,
        user_location: { type: "approximate", country, ...(city ? { city } : {}) },
      },
    ],
    messages: [{ role: "user", content: prompt }],
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declinó responder esta pregunta");
  let answer = "";
  const cited: Source[] = [];
  const retrieved: Source[] = [];
  for (const block of response.content) {
    if (block.type === "text") {
      answer += block.text;
      for (const c of block.citations ?? []) {
        if (c.type === "web_search_result_location" && c.url) {
          cited.push({ url: c.url, title: c.title ?? undefined, domain: domainOf(c.url) });
        }
      }
    } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) {
        if (r.type === "web_search_result") retrieved.push({ url: r.url, title: r.title, domain: domainOf(r.url) });
      }
    }
  }
  // Preferimos lo que Claude citó; si no citó nada, mostramos lo que consultó.
  const sources = cited.length ? cited : retrieved;
  const u = response.usage;
  const searches = u.server_tool_use?.web_search_requests ?? 0;
  const costUsd = searches * 0.01 + (u.input_tokens * 4 + u.output_tokens * 20) / 1e6;
  return { answer, sources, model, costUsd, simulated: false };
};
