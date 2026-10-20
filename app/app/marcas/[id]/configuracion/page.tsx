import { deleteBrandAction, updateBrandAction } from "@/app/app/marcas/actions";
import { brandForCtx } from "@/lib/access";
import { ENGINE_IDS, ENGINES, engineConfigured } from "@/lib/config";

export const metadata = { title: "Configuración de la marca" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, brand } = await brandForCtx(id);
  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <form action={updateBrandAction.bind(null, id)} className="card space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Nombre</label>
            <input name="name" defaultValue={brand.name} className="input" />
          </div>
          <div>
            <label className="label">Rubro</label>
            <input name="category" defaultValue={brand.category ?? ""} className="input" />
          </div>
        </div>
        <div>
          <label className="label">Descripción</label>
          <textarea name="description" defaultValue={brand.description ?? ""} rows={2} className="input" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Ciudad</label>
            <input name="city" defaultValue={brand.city ?? ""} className="input" />
          </div>
          <div>
            <label className="label">Otros nombres (separados por coma)</label>
            <input name="aliases" defaultValue={brand.aliases.join(", ")} className="input" />
          </div>
        </div>
        <div>
          <label className="label">Competidores (uno por línea: Nombre, dominio)</label>
          <textarea name="competitors" rows={5} defaultValue={brand.competitors.map((c) => (c.domain ? `${c.name}, ${c.domain}` : c.name)).join("\n")} className="input font-mono text-xs" />
        </div>
        <div>
          <label className="label">Motores (hasta {ctx.plan.maxEngines})</label>
          <div className="flex flex-wrap gap-3 text-sm">
            {ENGINE_IDS.map((e) => (
              <label key={e} className="flex items-center gap-2">
                <input type="checkbox" name={`engine_${e}`} defaultChecked={brand.engines.includes(e)} />
                {ENGINES[e].label}
                {!engineConfigured(e) ? <span className="text-xs text-[#8a5a00]">(simulado)</span> : null}
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Repeticiones</label>
            <select name="repetitions" defaultValue={brand.repetitions} className="input">
              {Array.from({ length: ctx.plan.repetitions }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Frecuencia</label>
            <select name="schedule" defaultValue={brand.schedule} className="input">
              <option value="weekly">Semanal automática</option>
              <option value="manual">Manual</option>
            </select>
          </div>
        </div>
        <p className="text-xs text-mute">Los cambios de competidores aplican desde la próxima medición.</p>
        <button className="btn-primary">Guardar cambios</button>
      </form>
      <div className="card h-fit p-6">
        <h3 className="font-bold text-bad">Zona de riesgo</h3>
        <p className="mt-1 text-sm text-mute">Borrar la marca elimina preguntas, mediciones y acciones. No se puede deshacer.</p>
        <form action={deleteBrandAction.bind(null, id)} className="mt-4">
          <button className="btn border border-bad/30 text-bad hover:bg-bad-50">Borrar {brand.name}</button>
        </form>
      </div>
    </div>
  );
}
