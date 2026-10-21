import { getCtx } from "@/lib/auth";
import { advanceDemoRun } from "@/lib/demo-step";

// Paso corto de un análisis DEMO (respuestas simuladas, sin red). Lo llama la página del análisis
// mientras está abierta. Solo actúa sobre análisis demo del espacio demo del usuario.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return new Response("No autorizado", { status: 401 });
  if (Number(ctx.workspace.is_demo ?? 0) !== 1) return Response.json({ processed: 0 });
  const { id } = await params;
  const processed = await advanceDemoRun(ctx.workspace.id, id);
  return Response.json({ processed });
}
