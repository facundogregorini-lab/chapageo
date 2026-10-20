import { brandForApi } from "@/lib/access";
import { one } from "@/lib/db";
import { csvForBrand } from "@/lib/csv";
import { toBrand, type Brand } from "@/lib/types";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shareToken = new URL(req.url).searchParams.get("t");
  let brand: Brand | null = null;
  if (shareToken) {
    const row = await one("SELECT * FROM brands WHERE id = ? AND share_token = ?", [id, shareToken]);
    brand = row ? toBrand(row as Record<string, unknown>) : null;
  } else {
    brand = (await brandForApi(id))?.brand ?? null;
  }
  if (!brand) return new Response("No autorizado", { status: 401 });
  const slug = brand.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return new Response(await csvForBrand(brand), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="chapageo-${slug}.csv"` },
  });
}
