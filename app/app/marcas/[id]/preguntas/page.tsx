import { addPromptAction, deletePromptAction, togglePromptAction } from "@/app/app/marcas/actions";
import { Badge } from "@/components/ui";
import { brandForCtx, promptPoolUsed } from "@/lib/access";
import { all } from "@/lib/db";
import type { Prompt } from "@/lib/types";

export const metadata = { title: "Preguntas" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, brand } = await brandForCtx(id);
  const prompts = await all<Prompt>("SELECT * FROM prompts WHERE brand_id = ? ORDER BY active DESC, created_at", [id]);
  const used = await promptPoolUsed(ctx.workspace.id);
  const active = prompts.filter((p) => Number(p.active)).length;
  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold">Panel de preguntas</h2>
            <p className="text-sm text-mute">
              {active} activas en esta marca · {used} de {ctx.plan.promptPool} del pool de tu plan · cada corrida = {active} × {brand.engines.length} motores × {brand.repetitions} repeticiones = {active * brand.engines.length * brand.repetitions} respuestas
            </p>
          </div>
        </div>
        <p className="mt-3 rounded-xl bg-paper px-3 py-2 text-xs text-mute">
          Para comparar antes y después, mantené el panel fijo. Si cambiás preguntas, la tendencia deja de ser comparable con cortes anteriores.
        </p>
        <form action={addPromptAction.bind(null, id)} className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <input name="text" required minLength={5} placeholder="Nueva pregunta, como la escribiría tu cliente" className="input" />
          <select name="kind" className="input w-auto">
            <option value="sin_marca">Sin marca</option>
            <option value="con_marca">Con marca</option>
          </select>
          <select name="intent" className="input w-auto">
            <option value="comercial">Comercial</option>
            <option value="informativa">Informativa</option>
            <option value="transaccional">Transaccional</option>
          </select>
          <button className="btn-primary" disabled={used >= ctx.plan.promptPool}>Agregar</button>
        </form>
      </div>
      <div className="card divide-y divide-line">
        {prompts.map((p) => (
          <div key={p.id} className={`flex flex-wrap items-center gap-3 px-5 py-3 text-sm ${Number(p.active) ? "" : "opacity-50"}`}>
            <span className="flex-1">{p.text}</span>
            <Badge tone={p.kind === "con_marca" ? "sol" : "neutral"}>{p.kind === "con_marca" ? "con marca" : "sin marca"}</Badge>
            <Badge>{p.intent}</Badge>
            <form action={togglePromptAction.bind(null, id, p.id)}>
              <button className="text-xs font-semibold text-celeste-700">{Number(p.active) ? "Pausar" : "Activar"}</button>
            </form>
            <form action={deletePromptAction.bind(null, id, p.id)}>
              <button className="text-xs font-semibold text-bad">Borrar</button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
