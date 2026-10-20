import Link from "next/link";
import { Badge } from "@/components/ui";
import { promptPoolUsed, prospectsThisMonth, workspaceBrands } from "@/lib/access";
import { requireCtx } from "@/lib/auth";
import { ENGINE_IDS, ENGINES, engineConfigured } from "@/lib/config";
import { isEphemeralDb } from "@/lib/db";
import { helperAvailable } from "@/lib/llm";
import { updateWorkspaceAction } from "./actions";

export const metadata = { title: "Ajustes" };

export default async function Page() {
  const ctx = await requireCtx();
  const [brands, pool, prospects] = await Promise.all([workspaceBrands(ctx.workspace.id), promptPoolUsed(ctx.workspace.id), prospectsThisMonth(ctx.workspace.id)]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Ajustes</h1>
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <form action={updateWorkspaceAction} className="card space-y-4 p-6">
          <h2 className="font-bold">Tu agencia / empresa</h2>
          <div>
            <label className="label">Nombre</label>
            <input name="name" defaultValue={ctx.workspace.name} className="input" />
          </div>
          <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
            <div>
              <label className="label">Color</label>
              <input type="color" name="brand_color" defaultValue={ctx.workspace.brand_color} className="h-10 w-full cursor-pointer rounded-xl border border-line" />
            </div>
            <div>
              <label className="label">URL del logo (https)</label>
              <input name="logo_url" defaultValue={ctx.workspace.logo_url ?? ""} placeholder="https://…/logo.png" className="input" />
            </div>
          </div>
          <div>
            <label className="label">Pie de los reportes</label>
            <input name="report_footer" defaultValue={ctx.workspace.report_footer ?? ""} placeholder="Ej: Preparado por Agencia X · hola@agenciax.com" className="input" />
          </div>
          {!ctx.plan.whiteLabel ? <p className="text-xs text-mute">El white-label (logo, color y pie en reportes) se activa con el plan Agencia.</p> : null}
          <button className="btn-primary">Guardar</button>
        </form>
        <div className="space-y-5">
          <div className="card p-6">
            <h2 className="font-bold">Plan {ctx.plan.name}</h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              <li className="flex justify-between"><span className="text-mute">Marcas</span><span>{brands.length} / {ctx.plan.maxBrands}</span></li>
              <li className="flex justify-between"><span className="text-mute">Preguntas activas</span><span>{pool} / {ctx.plan.promptPool}</span></li>
              <li className="flex justify-between"><span className="text-mute">Motores por marca</span><span>{ctx.plan.maxEngines}</span></li>
              <li className="flex justify-between"><span className="text-mute">Prospecciones este mes</span><span>{prospects} / {ctx.plan.prospectsPerMonth}</span></li>
            </ul>
            <Link href="/precios" className="btn-ghost mt-4 w-full">Cambiar de plan</Link>
          </div>
          <div className="card p-6">
            <h2 className="font-bold">Motores conectados</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {ENGINE_IDS.map((e) => (
                <li key={e} className="flex items-center justify-between">
                  <span>{ENGINES[e].label} <span className="text-xs text-mute">({ENGINES[e].envKey})</span></span>
                  {engineConfigured(e) ? <Badge tone="ok">real</Badge> : <Badge tone="sol">simulado</Badge>}
                </li>
              ))}
              <li className="flex items-center justify-between">
                <span>Redacción y sugerencias</span>
                {helperAvailable() ? <Badge tone="ok">activo</Badge> : <Badge tone="sol">plantillas</Badge>}
              </li>
              <li className="flex items-center justify-between">
                <span>Base de datos</span>
                {isEphemeralDb() ? <Badge tone="sol">temporal</Badge> : <Badge tone="ok">persistente</Badge>}
              </li>
            </ul>
            <p className="mt-3 text-xs text-mute">Las claves se configuran como variables de entorno del servidor; nunca se muestran en el panel.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
