import { deleteBrandAction, updateBrandAction } from "@/app/app/marcas/actions";
import { brandForCtx } from "@/lib/access";
import { DemoReadOnly } from "@/components/ui";
import { isDemoCtx } from "@/lib/auth";
import { COUNTRIES } from "@/lib/config";

export const metadata = { title: "Configuración del cliente" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, brand } = await brandForCtx(id);
  const demo = isDemoCtx(ctx);
  return (
    <div className="space-y-5">
    {demo ? <DemoReadOnly what="editar ni borrar clientes" /> : null}
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <form action={updateBrandAction.bind(null, id)} className="card p-6">
        <fieldset disabled={demo} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="b-name">Nombre de la marca</label>
            <input id="b-name" name="name" defaultValue={brand.name} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="b-category">Categoría</label>
            <input id="b-category" name="category" defaultValue={brand.category ?? ""} className="input" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="b-description">Descripción del negocio</label>
          <textarea id="b-description" name="description" defaultValue={brand.description ?? ""} rows={3} className="input" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="b-country">País objetivo</label>
            <select id="b-country" name="country" defaultValue={brand.country} className="input">
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="b-language">Idioma</label>
            <select id="b-language" name="language" defaultValue={brand.language} className="input">
              <option value="es">Español</option>
              <option value="pt">Portugués</option>
              <option value="en">Inglés</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="b-aliases">Alias y variantes</label>
            <input id="b-aliases" name="aliases" defaultValue={brand.aliases.join(", ")} className="input" placeholder="Separados por coma" />
          </div>
        </div>
        <div>
          <label className="label">Competidores (hasta 3)</label>
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-2">
                <input name={`comp_name_${i}`} defaultValue={brand.competitors[i]?.name ?? ""} placeholder="Nombre" className="input" />
                <input name={`comp_domain_${i}`} defaultValue={brand.competitors[i]?.domain ?? ""} placeholder="dominio.com" className="input" />
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-mute">Los cambios aplican a los próximos análisis. Los anteriores conservan lo que se detectó cuando se ejecutaron.</p>
        <button className="btn-primary disabled:opacity-50">Guardar cambios</button>
        </fieldset>
      </form>
      {demo ? null : (
      <div className="card h-fit p-6">
        <h3 className="font-bold text-bad">Zona de riesgo</h3>
        <p className="mt-1 text-sm text-mute">Borrar el cliente elimina preguntas, análisis, respuestas y capturas. No se puede deshacer.</p>
        <form action={deleteBrandAction.bind(null, id)} className="mt-4 space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirm" required className="mt-1" />
            <span>Entiendo que se borra todo lo de {brand.name} y no se puede recuperar.</span>
          </label>
          <button className="btn border border-bad/30 text-bad hover:bg-bad-50">Borrar {brand.name}</button>
        </form>
      </div>
      )}
    </div>
    </div>
  );
}
