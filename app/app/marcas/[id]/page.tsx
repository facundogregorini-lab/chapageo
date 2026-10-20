import { AutoRun } from "@/components/AutoRun";
import { BrandOverview } from "@/components/BrandOverview";
import { brandForCtx } from "@/lib/access";
import { listActions } from "@/lib/actions";
import { brandMetrics, brandTrend } from "@/lib/metrics";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ correr?: string }> }) {
  const { id } = await params;
  const { correr } = await searchParams;
  const { brand } = await brandForCtx(id);
  const [m, trend, actions] = await Promise.all([brandMetrics(brand), brandTrend(brand), listActions(brand.id)]);
  return (
    <>
      {correr ? <AutoRun brandId={id} /> : null}
      <BrandOverview brand={brand} m={m} trend={trend} actions={actions.filter((a) => a.status === "pendiente" || a.status === "en_curso")} />
    </>
  );
}
