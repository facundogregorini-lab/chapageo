import { Badge, Bar, Empty, SectionTitle } from "@/components/ui";
import { brandForCtx } from "@/lib/access";
import { brandMetrics } from "@/lib/metrics";

export const metadata = { title: "Fuentes" };

const TONE: Record<string, "ok" | "bad" | "sol" | "celeste" | "neutral"> = {
  propio: "ok",
  competidor: "bad",
  reseñas: "sol",
  medio: "celeste",
  comunidad: "celeste",
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { brand } = await brandForCtx(id);
  const m = await brandMetrics(brand);
  if (!m.run) return <Empty title="Todavía no hay fuentes">Corré una medición para ver qué sitios usa la IA.</Empty>;
  const max = Math.max(1, ...m.sources.map((s) => s.count));
  const byClass = new Map<string, number>();
  for (const s of m.sources) byClass.set(s.cls, (byClass.get(s.cls) ?? 0) + s.count);
  const totalCites = [...byClass.values()].reduce((a, b) => a + b, 0);
  const gaps = m.sources.filter((s) => s.cls !== "propio" && s.cls !== "competidor" && s.withoutBrand >= 2);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <div className="card p-5">
          <SectionTitle title="Tipo de fuente">Qué tipo de sitios consulta la IA para tu rubro.</SectionTitle>
          <div className="space-y-3">
            {[...byClass.entries()].sort((a, b) => b[1] - a[1]).map(([cls, n]) => (
              <div key={cls}>
                <div className="flex justify-between text-sm"><span className="capitalize">{cls}</span><span className="text-mute">{Math.round((n / totalCites) * 100)}%</span></div>
                <Bar value={n / totalCites} className="mt-1" />
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <SectionTitle title="Brechas de fuentes">Sitios que la IA cita cuando recomienda a otros y no a vos. Ahí conviene estar.</SectionTitle>
          {gaps.length ? (
            <ul className="divide-y divide-line text-sm">
              {gaps.slice(0, 8).map((s) => (
                <li key={s.domain} className="flex items-center justify-between py-2.5">
                  <span className="flex items-center gap-2"><span className="font-semibold">{s.domain}</span><Badge tone={TONE[s.cls] ?? "neutral"}>{s.cls}</Badge></span>
                  <span className="text-xs text-mute">{s.withoutBrand} respuestas sin vos</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-mute">No encontramos brechas claras en este corte.</p>
          )}
        </div>
      </div>
      <div className="card overflow-hidden">
        <div className="p-5 pb-2"><SectionTitle title={`Todos los dominios citados (${m.sources.length})`}>Cantidad de respuestas válidas que citan cada dominio.</SectionTitle></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-paper text-left text-xs text-mute">
              <tr><th className="px-5 py-2.5">Dominio</th><th className="px-3 py-2.5">Tipo</th><th className="px-3 py-2.5 w-1/3">Citas</th><th className="px-5 py-2.5">URLs de ejemplo</th></tr>
            </thead>
            <tbody>
              {m.sources.map((s) => (
                <tr key={s.domain} className="border-t border-line align-top">
                  <td className="px-5 py-3 font-semibold">{s.domain}</td>
                  <td className="px-3 py-3"><Badge tone={TONE[s.cls] ?? "neutral"}>{s.cls}</Badge></td>
                  <td className="px-3 py-3"><div className="flex items-center gap-2"><Bar value={s.count / max} /><span className="w-8 text-right text-xs">{s.count}</span></div></td>
                  <td className="px-5 py-3 text-xs">
                    {s.urls.slice(0, 3).map((u) => (
                      <a key={u} href={u} target="_blank" rel="noopener noreferrer nofollow" className="block max-w-xs truncate text-celeste-700 hover:underline">{u.replace(/^https?:\/\//, "")}</a>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
