import { NextResponse } from "next/server";
import { brandForApi } from "@/lib/access";
import { createRun } from "@/lib/runner";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await brandForApi(id);
  if (!access) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const run = await createRun(id, "manual");
    return NextResponse.json({ run });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
