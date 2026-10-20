// LLM auxiliar para tareas internas (sugerir preguntas y competidores, redactar borradores).
// No se usa para medir visibilidad: eso lo hacen los motores en lib/engines.

import Anthropic from "@anthropic-ai/sdk";
import { fetchJson } from "./engines/shared";

export function helperAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY);
}

let anthropicClient: Anthropic | null = null;

export async function complete(system: string, user: string, maxTokens = 3000): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) {
    anthropicClient ??= new Anthropic();
    const r = await anthropicClient.messages.create({
      model: process.env.CLAUDE_MODEL || "claude-opus-5-5",
      max_tokens: Math.max(maxTokens, 4000),
      output_config: { effort: "low" },
      system,
      messages: [{ role: "user", content: user }],
    });
    if (r.stop_reason === "refusal") throw new Error("El modelo declinó la tarea");
    return r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  }
  if (process.env.OPENAI_API_KEY) {
    const d = await fetchJson("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4.1-mini", instructions: system, input: user }),
    });
    return (d.output ?? [])
      .flatMap((o: any) => o.content ?? [])
      .map((p: any) => p.text ?? "")
      .join("");
  }
  if (process.env.GEMINI_API_KEY) {
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const d = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
      }),
    });
    return (d.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
  }
  throw new Error("No hay ningún modelo configurado");
}

/** Pide JSON y lo extrae aunque venga envuelto en ```json. */
export async function completeJson<T>(system: string, user: string): Promise<T> {
  const text = await complete(system + "\nRespondé solo con JSON válido, sin texto adicional.", user);
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (m ? m[1] : text).trim();
  const start = raw.search(/[[{]/);
  return JSON.parse(raw.slice(start)) as T;
}
