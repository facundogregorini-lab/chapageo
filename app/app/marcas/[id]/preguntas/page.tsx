import { addPromptAction, deletePromptAction, setApprovalAction, suggestMorePromptsAction, updatePromptAction } from "@/app/app/marcas/actions";
import { Badge } from "@/components/ui";
import { DemoReadOnly } from "@/components/ui";
import { brandForCtx } from "@/lib/access";
import { isDemoCtx } from "@/lib/auth";
import { all } from "@/lib/db";
import { LIMITS } from "@/lib/limits";
import { helperAvailable } from "@/lib/llm";
import { CATEGORY_LABEL, PROMPT_CATEGORIES, toPrompt } from "@/lib/types";

export const metadata = { title: "Preguntas" };

const HINT: Record<string, string> = {
  descubrimiento: "No nombran a la marca ni a competidores. Base de la métrica de presencia.",
  comparacion: "Comparaciones y alternativas. Pueden nombrar competidores, no a la marca.",
  marca: "Nombran a la marca: se miden aparte porque sesgan la mención.",
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await brandForCtx(id);
  const demo = isDemoCtx(ctx);
  const prompts = (await all("SELECT * FROM prompts WHERE brand_id = ? AND active = 1 ORDER BY created_at", [id])).map((r) => toPrompt(r as Record<string, unknown>));
  const approved = prompts.filter((p) => p.approved).length;
  const ok = approved >= LIMITS.minPrompts && approved <= LIMITS.maxPrompts;
  return (
    <fieldset disabled={demo} className="space-y-5">
      {demo ? <DemoReadOnly what="editar preguntas" /> : null}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">Preguntas que harían los clientes potenciales</h2>
            <p className="text-sm text-mute">
              Aprobadas: <strong className={ok ? "text-ok" : "text-bad"}>{approved}</strong> (entre {LIMITS.minPrompts} y {LIMITS.maxPrompts}). Solo las aprobadas
              entran en un análisis. Editar una pregunta la vuelve a dejar pendiente de aprobación.
            </p>
          </div>
          <form action={suggestMorePromptsAction.bind(null, id)}>
            <button className="btn-ghost btn-sm">{helperAvailable() ? "Sugerir más (IA + sitio)" : "Sugerir más (plantillas)"}</button>
          </form>
        </div>
        <form action={addPromptAction.bind(null, id)} className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input name="text" required minLength={8} maxLength={300} placeholder="Nueva pregunta, como la escribiría un cliente" className="input" />
          <select name="category" className="input sm:w-auto">
            {PROMPT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
            ))}
          </select>
          <button className="btn-primary">Agregar</button>
        </form>
        <p className="mt-2 text-xs text-mute">El grupo se verifica al guardar: si la pregunta nombra a la marca pasa a «Sobre la marca»; si nombra a un competidor, a «Comparación».</p>
      </div>
      {PROMPT_CATEGORIES.map((cat) => {
        const items = prompts.filter((p) => p.category === cat);
        return (
          <div key={cat} className="card overflow-hidden">
            <div className="border-b border-line px-5 py-3">
              <div className="font-semibold">{CATEGORY_LABEL[cat]} <span className="font-normal text-mute">· {items.filter((p) => p.approved).length} aprobadas de {items.length}</span></div>
              <div className="text-xs text-mute">{HINT[cat]}</div>
            </div>
            <div className="divide-y divide-line">
              {items.map((p) => (
                <div key={p.id} className="flex flex-col gap-2 px-5 py-3 text-sm lg:flex-row lg:items-center">
                  <form action={updatePromptAction.bind(null, id, p.id)} className="flex flex-1 flex-col gap-2 sm:flex-row">
                    <input name="text" defaultValue={p.text} minLength={8} maxLength={300} className="input flex-1 py-1.5" />
                    <select name="category" defaultValue={p.category} className="input py-1.5 text-xs sm:w-auto">
                      {PROMPT_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                      ))}
                    </select>
                    <button className="btn-ghost btn-sm">Guardar</button>
                  </form>
                  <div className="flex items-center gap-2">
                    {p.approved ? <Badge tone="ok">Aprobada</Badge> : <Badge tone="sol">Pendiente</Badge>}
                    <Badge>{p.source === "ia" ? "IA" : p.source === "plantilla" ? "plantilla" : "manual"}</Badge>
                    <form action={setApprovalAction.bind(null, id, p.id, !p.approved)}>
                      <button className="text-xs font-semibold text-celeste-700">{p.approved ? "Quitar aprobación" : "Aprobar"}</button>
                    </form>
                    <form action={deletePromptAction.bind(null, id, p.id)}>
                      <button className="text-xs font-semibold text-bad">Borrar</button>
                    </form>
                  </div>
                </div>
              ))}
              {!items.length ? <p className="px-5 py-4 text-sm text-mute">Sin preguntas en este grupo.</p> : null}
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}
