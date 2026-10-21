import { getCtx } from "@/lib/auth";
import { probeBrightData } from "@/lib/brightdata-probe";
import { isBrightDataId } from "@/lib/collectors/brightdata";

// La prueba espera la respuesta de Bright Data (suele tardar menos de un minuto).
export const maxDuration = 120;

export async function POST(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return new Response("No autorizado", { status: 401 });
  if (!ctx.isAdmin || Number(ctx.workspace.is_demo ?? 0) === 1) return new Response("Solo el equipo de ChapaGEO puede probar conectores.", { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { collector?: string };
  if (!body.collector || !isBrightDataId(body.collector)) return Response.json({ ok: false, message: "Conector inválido." }, { status: 400 });
  return Response.json(await probeBrightData(body.collector));
}
