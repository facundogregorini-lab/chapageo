import { TabLink } from "@/components/NavLink";
import { RunButton } from "@/components/RunButton";
import { EngineBadge, fmtDate } from "@/components/ui";
import { brandForCtx } from "@/lib/access";
import { countryName } from "@/lib/config";
import { one } from "@/lib/db";

export default async function BrandLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { brand } = await brandForCtx(id);
  const active = await one<{ id: string; status: string; total: number; done_count: number; failed_count: number }>(
    "SELECT id, status, total, done_count, failed_count FROM runs WHERE brand_id = ? AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1",
    [id],
  );
  const base = `/app/marcas/${id}`;
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{brand.name}</h1>
            <a href={`https://${brand.domain}`} target="_blank" rel="noopener noreferrer" className="text-sm text-mute hover:text-ink">{brand.domain} ↗</a>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-mute">
            <span>{brand.category}</span>
            <span>·</span>
            <span>{brand.city ? `${brand.city}, ` : ""}{countryName(brand.country)}</span>
            <span>·</span>
            {brand.engines.map((e) => (
              <EngineBadge key={e} engine={e} />
            ))}
            <span>·</span>
            <span>Último corte: {fmtDate(brand.last_run_at, true)}</span>
          </div>
        </div>
        <div className="no-print">
          <RunButton brandId={id} activeRun={active ? { ...active, total: Number(active.total), done_count: Number(active.done_count), failed_count: Number(active.failed_count) } : null} />
        </div>
      </div>
      <nav className="no-print mt-6 flex gap-6 overflow-x-auto border-b border-line">
        <TabLink href={base} exact>Resumen</TabLink>
        <TabLink href={`${base}/respuestas`}>Respuestas</TabLink>
        <TabLink href={`${base}/fuentes`}>Fuentes</TabLink>
        <TabLink href={`${base}/acciones`}>Acciones</TabLink>
        <TabLink href={`${base}/preguntas`}>Preguntas</TabLink>
        <TabLink href={`${base}/auditoria`}>Auditoría técnica</TabLink>
        <TabLink href={`${base}/reporte`}>Reporte</TabLink>
        <TabLink href={`${base}/configuracion`}>Configuración</TabLink>
      </nav>
      <div className="mt-6">{children}</div>
    </div>
  );
}
