import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth";
import { suggestCompetitors, suggestPrompts } from "@/lib/suggest";

export const maxDuration = 60;

export async function POST(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await req.json();
  const input = {
    name: String(body.name ?? ""),
    domain: String(body.domain ?? ""),
    category: String(body.category ?? ""),
    description: body.description ? String(body.description) : null,
    country: String(body.country ?? "AR"),
    city: body.city ? String(body.city) : null,
    competitors: Array.isArray(body.competitors) ? body.competitors : [],
  };
  if (body.what === "competitors") return NextResponse.json({ competitors: await suggestCompetitors(input) });
  const { prompts, source } = await suggestPrompts(input, Math.min(Number(body.count ?? 20), 30));
  return NextResponse.json({ prompts, source });
}
