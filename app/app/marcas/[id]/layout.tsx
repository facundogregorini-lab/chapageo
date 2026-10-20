import { TabLink } from "@/components/NavLink";
import { StatusBadge } from "@/components/analysis";
import { fmtDate } from "@/components/ui";
import { brandForCtx } from "@/lib/access";
import { countryName } from "@/lib/config";
import { latestRun } from "@/lib/metrics";
import Link from "next/link";

export default async function BrandLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, brand } = await brandForCtx(id);
  const last = await latestRun(ctx.workspace.id, id);
  const base = `/app/marcas/${id}`;
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{brand.name}</h1>
            <a href={`https://${brand.domain}`} target="_blank" rel="noopener noreferrer" className="text-sm text-mute hover:text-ink">{brand.domain} ↗</a>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-mute">
            <span>{brand.category}</span>
            <span>·</span>
            <span>{countryName(brand.country)} · {brand.language}</span>
            <span>·</span>
            <span>Competidores: {brand.competitors.map((c) => c.name).join(", ") || "—"}</span>
          </div>
        </div>
        <div className="no-print flex items-center gap-2 text-sm">
          {last ? (
            <Link href={`${base}/analisis/${last.id}`} className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2">
              <span className="text-xs text-mute">Último análisis {fmtDate(last.created_at, true)}</span>
              <StatusBadge status={last.status} />
            </Link>
          ) : null}
          <Link href={`${base}/analisis`} className="btn-primary">Nuevo análisis</Link>
        </div>
      </div>
      <nav className="no-print mt-6 flex gap-6 overflow-x-auto border-b border-line">
        <TabLink href={base} exact>Resumen</TabLink>
        <TabLink href={`${base}/preguntas`}>Preguntas</TabLink>
        <TabLink href={`${base}/analisis`}>Análisis</TabLink>
        <TabLink href={`${base}/informe`}>Informe</TabLink>
        <TabLink href={`${base}/auditoria`}>Auditoría técnica</TabLink>
        <TabLink href={`${base}/configuracion`}>Configuración</TabLink>
      </nav>
      <div className="mt-6">{children}</div>
    </div>
  );
}
