import Link from "next/link";
import { refreshActionsAction, updateActionStatus } from "@/app/app/marcas/actions";
import { KIND_LABEL } from "@/components/BrandOverview";
import { DraftPanel } from "@/components/DraftPanel";
import { Badge, Empty, fmtDate } from "@/components/ui";
import { brandForCtx } from "@/lib/access";
import { listActions } from "@/lib/actions";

export const metadata = { title: "Acciones" };

const STATUS: Record<string, string> = { pendiente: "Pendiente", en_curso: "En curso", hecha: "Hecha", descartada: "Descartada" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { brand } = await brandForCtx(id);
  const actions = await listActions(brand.id);
  const counts = Object.fromEntries(Object.keys(STATUS).map((s) => [s, actions.filter((a) => a.status === s).length]));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-sm">
          {Object.entries(STATUS).map(([k, l]) => (
            <Badge key={k} tone={k === "hecha" ? "ok" : k === "en_curso" ? "celeste" : "neutral"}>{l}: {counts[k]}</Badge>
          ))}
        </div>
        <form action={refreshActionsAction.bind(null, id)}>
          <button className="btn-ghost btn-sm">Recalcular con el último corte</button>
        </form>
      </div>
      {actions.length === 0 ? (
        <Empty title="Sin acciones por ahora">Aparecen cuando una medición detecta preguntas donde gana la competencia, fuentes clave o problemas técnicos.</Empty>
      ) : (
        <div className="space-y-3">
          {actions.map((a) => (
            <div key={a.id} className={`card p-5 ${a.status === "hecha" || a.status === "descartada" ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-start gap-3">
                <Badge tone={a.priority === 1 ? "bad" : a.priority === 2 ? "sol" : "neutral"}>Prioridad {a.priority === 1 ? "alta" : a.priority === 2 ? "media" : "baja"}</Badge>
                <Badge tone="celeste">{KIND_LABEL[a.kind]}</Badge>
                <span className="ml-auto text-xs text-mute">Actualizada {fmtDate(a.updated_at)}</span>
              </div>
              <h3 className="mt-3 font-bold">{a.title}</h3>
              <p className="mt-1 text-sm text-mute">{a.detail}</p>
              {a.evidence.responseIds?.length || a.evidence.domains?.length ? (
                <div className="mt-2 text-xs text-mute">
                  Evidencia: {a.evidence.responseIds?.length ?? 0} respuestas
                  {a.evidence.domains?.length ? ` · ${a.evidence.domains.join(", ")}` : ""}
                  {a.evidence.prompts?.length ? (
                    <>
                      {" · "}
                      <Link href={`/app/marcas/${id}/respuestas?q=${encodeURIComponent(a.evidence.prompts[0].slice(0, 40))}`} className="font-semibold text-celeste-700">ver respuestas</Link>
                    </>
                  ) : null}
                </div>
              ) : null}
              <form action={updateActionStatus.bind(null, id, a.id)} className="mt-4 flex flex-wrap items-center gap-2">
                <select name="status" defaultValue={a.status} className="input w-auto py-1.5">
                  {Object.entries(STATUS).map(([k, l]) => (
                    <option key={k} value={k}>{l}</option>
                  ))}
                </select>
                <input name="owner" defaultValue={a.owner ?? ""} placeholder="Responsable" className="input w-44 py-1.5" />
                <button className="btn-ghost btn-sm">Guardar</button>
              </form>
              <div className="mt-4 border-t border-line pt-4">
                <DraftPanel actionId={a.id} initial={a.draft} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
