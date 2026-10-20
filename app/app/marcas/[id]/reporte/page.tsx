import { headers } from "next/headers";
import Link from "next/link";
import { rotateShareToken } from "@/app/app/marcas/actions";
import { CopyField } from "@/components/CopyField";
import { brandForCtx } from "@/lib/access";

export const metadata = { title: "Reporte" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, brand } = await brandForCtx(id);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const url = `${origin}/r/${brand.share_token}`;
  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
      <div className="card p-6">
        <h2 className="font-bold">Link privado para tu cliente</h2>
        <p className="mt-1 text-sm text-mute">
          Cualquiera con el link ve el reporte del último corte (sin acceso al panel). Podés imprimirlo como PDF desde el navegador.
        </p>
        <div className="mt-4"><CopyField value={url} /></div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/r/${brand.share_token}`} target="_blank" className="btn-primary">Abrir reporte</Link>
          <a href={`/api/brands/${id}/export`} className="btn-ghost">Descargar CSV</a>
          <form action={rotateShareToken.bind(null, id)}>
            <button className="btn-ghost">Revocar y generar link nuevo</button>
          </form>
        </div>
      </div>
      <div className="card p-6">
        <h2 className="font-bold">Marca del reporte</h2>
        {ctx.plan.whiteLabel ? (
          <p className="mt-1 text-sm text-mute">
            El reporte sale con el nombre <strong className="text-ink">{ctx.workspace.name}</strong>, tu color y tu logo. Cambialos en{" "}
            <Link href="/app/ajustes" className="font-semibold text-ink underline">Ajustes</Link>.
          </p>
        ) : (
          <p className="mt-1 text-sm text-mute">
            En tu plan el reporte sale con la marca ChapaGEO. Con el plan Agencia sale con tu logo y tus colores.{" "}
            <Link href="/precios" className="font-semibold text-ink underline">Ver planes</Link>
          </p>
        )}
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-line p-3">
          <span className="h-8 w-8 rounded-lg" style={{ background: ctx.plan.whiteLabel ? ctx.workspace.brand_color : "#0b1220" }} />
          <span className="text-sm font-semibold">{ctx.plan.whiteLabel ? ctx.workspace.name : "ChapaGEO"}</span>
        </div>
      </div>
    </div>
  );
}
