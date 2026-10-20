import { NextResponse } from "next/server";
import { brandForApi } from "@/lib/access";
import { draftForAction } from "@/lib/actions";
import { now, one, run } from "@/lib/db";

export const maxDuration = 60;

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const action = await one<{ brand_id: string }>("SELECT brand_id FROM actions WHERE id = ?", [id]);
  if (!action || !(await brandForApi(action.brand_id))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const draft = await draftForAction(id);
    await run("UPDATE actions SET draft = ?, updated_at = ? WHERE id = ?", [draft, now(), id]);
    return NextResponse.json({ draft });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
