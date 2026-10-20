import { NextResponse } from "next/server";
import { all } from "@/lib/db";
import { createRun, tickRun } from "@/lib/runner";

export const maxDuration = 300;

// Corte semanal: crea corridas para marcas con más de 7 días sin medir y avanza las abiertas.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const deadline = Date.now() + 240_000;
  const weekAgo = new Date(Date.now() - 7 * 864e5 + 3600e3).toISOString();
  const due = await all<{ id: string }>(
    "SELECT id FROM brands WHERE schedule = 'weekly' AND (last_run_at IS NULL OR last_run_at < ?) AND EXISTS (SELECT 1 FROM prompts p WHERE p.brand_id = brands.id AND p.active = 1)",
    [weekAgo],
  );
  const created: string[] = [];
  for (const b of due) {
    try {
      created.push((await createRun(b.id, "cron")).id);
    } catch (e) {
      console.error("cron createRun", b.id, e);
    }
  }
  const open = await all<{ id: string }>("SELECT id FROM runs WHERE status IN ('queued','running') ORDER BY created_at");
  let ticks = 0;
  for (const r of open) {
    let status = "running";
    while (status === "running" && Date.now() < deadline) {
      status = (await tickRun(r.id)).status;
      ticks++;
    }
  }
  return NextResponse.json({ due: due.length, created, open: open.length, ticks });
}
