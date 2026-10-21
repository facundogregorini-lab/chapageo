import { getCtx } from "@/lib/auth";
import { stepOpenRuns } from "@/lib/run-step";

// Al abrir el panel, guarda lo que Bright Data terminó mientras la pestaña estaba cerrada.
export const maxDuration = 60;

export async function POST() {
  const ctx = await getCtx();
  if (!ctx) return new Response("No autorizado", { status: 401 });
  const processed = await stepOpenRuns(ctx.workspace.id);
  return Response.json({ processed });
}
