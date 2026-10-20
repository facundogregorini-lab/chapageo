import { getEvidenceInWorkspace } from "@/lib/access";
import { getCtx } from "@/lib/auth";

// Evidencia (capturas) solo para usuarios de la agencia dueña: se filtra por workspace.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return new Response("No autorizado", { status: 401 });
  const { id } = await params;
  const ev = await getEvidenceInWorkspace(ctx.workspace.id, id);
  if (!ev) return new Response("No encontrado", { status: 404 });
  const mime = ev.mime === "image/png" ? "image/png" : "image/jpeg";
  return new Response(ev.data as unknown as BodyInit, {
    headers: { "content-type": mime, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" },
  });
}
