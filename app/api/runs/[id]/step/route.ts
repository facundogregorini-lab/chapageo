import { getCtx } from "@/lib/auth";
import { stepRun } from "@/lib/run-step";

// Avanza un análisis abierto desde la web: demo simulada o lotes de Bright Data.
// Los análisis con captura propia o API siguen siendo del worker.
export const maxDuration = 60;

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return new Response("No autorizado", { status: 401 });
  const { id } = await params;
  const processed = await stepRun(ctx.workspace.id, id);
  return Response.json({ processed });
}
