import { NextResponse } from "next/server";
import { brandForApi } from "@/lib/access";
import { one } from "@/lib/db";
import { tickRun } from "@/lib/runner";

export const maxDuration = 60;

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await one<{ brand_id: string }>("SELECT brand_id FROM runs WHERE id = ?", [id]);
  if (!run || !(await brandForApi(run.brand_id))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const updated = await tickRun(id);
  return NextResponse.json({ run: updated });
}
