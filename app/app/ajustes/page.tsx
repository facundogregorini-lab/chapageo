import { BrightDataProbe } from "@/components/BrightDataProbe";
import { Badge, DemoReadOnly } from "@/components/ui";
import { prospectsThisMonth, workspaceBrands } from "@/lib/access";
import { isDemoCtx, requireCtx } from "@/lib/auth";
import { isBrightDataId } from "@/lib/collectors/brightdata";
import { isEphemeralDb } from "@/lib/db";
import { LIMITS } from "@/lib/limits";
import { helperAvailable } from "@/lib/llm";
import { collectorAvailability } from "@/lib/queue";
import { updateWorkspaceAction } from "./actions";

export const metadata = { title: "Ajustes" };

const COLLECTOR_STATUS: Record<string, string> = {
  available: "disponible",
  unverified: "sin verificar",
  requires_intervention: "requiere intervención",
  unavailable: "no disponible",
  not_configured: "no configurado",
};

export default async function Page({ searchParams }: { searchParams: Promise<{ guardado?: string }> }) {
  const ctx = await requireCtx();
  const { guardado } = await searchParams;
  const demo = isDemoCtx(ctx);
  const [brands, prospects, avail] = await Promise.all([
    workspaceBrands(ctx.workspace.id),
    prospectsThisMonth(ctx.workspace.id),
    collectorAvailability(Number(ctx.workspace.is_demo ?? 0) === 1),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Ajustes</h1>
      {demo ? <DemoReadOnly what="cambiar los datos de la agencia" /> : null}
      {guardado && !demo ? <p className="rounded-xl bg-ok-50 px-4 py-3 text-sm text-ok">Guardamos los cambios.</p> : null}
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <form action={updateWorkspaceAction} className="card p-6">
          <fieldset disabled={demo} className="space-y-4">
          <h2 className="font-bold">Tu agencia / empresa</h2>
          <div>
            <label className="label" htmlFor="ws-name">Nombre</label>
            <input id="ws-name" name="name" defaultValue={ctx.workspace.name} className="input" />
          </div>
          <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
            <div>
              <label className="label" htmlFor="ws-color">Color</label>
              <input id="ws-color" type="color" name="brand_color" defaultValue={ctx.workspace.brand_color} className="h-10 w-full cursor-pointer rounded-xl border border-line" />
            </div>
            <div>
              <label className="label" htmlFor="ws-logo">URL del logo (https)</label>
              <input id="ws-logo" name="logo_url" defaultValue={ctx.workspace.logo_url ?? ""} placeholder="https://…/logo.png" className="input" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="ws-footer">Pie de los reportes</label>
            <input id="ws-footer" name="report_footer" defaultValue={ctx.workspace.report_footer ?? ""} placeholder="Ej: Preparado por Agencia X · hola@agenciax.com" className="input" />
          </div>
          {!ctx.plan.whiteLabel ? <p className="text-xs text-mute">El white-label (logo, color y pie en reportes) se activa con el plan Agencia. <a href="/app/plan?plan=agencia" className="underline">Ver planes</a></p> : null}
          <button className="btn-primary disabled:opacity-50">Guardar</button>
          </fieldset>
        </form>
        <div className="space-y-5">
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Límites de uso · plan {ctx.plan.name}</h2>
              <a href="/app/plan" className="text-sm font-semibold text-celeste-700 hover:underline">Cambiar plan</a>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm">
              <li className="flex justify-between"><span className="text-mute">Clientes</span><span>{brands.length} / {Math.min(ctx.plan.maxBrands, LIMITS.maxClientsPerAgency)}</span></li>
              <li className="flex justify-between"><span className="text-mute">Preguntas por análisis</span><span>{LIMITS.minPrompts}–{Math.min(ctx.plan.promptPool, LIMITS.maxPrompts)}</span></li>
              <li className="flex justify-between"><span className="text-mute">Motores y repeticiones</span><span>{ctx.plan.maxEngines} motores · {ctx.plan.repetitions} rep.</span></li>
              {ctx.plan.analysesPerMonth != null ? <li className="flex justify-between"><span className="text-mute">Análisis por mes</span><span>{ctx.plan.analysesPerMonth}</span></li> : null}
              <li className="flex justify-between"><span className="text-mute">Ejecuciones por análisis</span><span>hasta {LIMITS.maxExecutionsPerAnalysis}</span></li>
              <li className="flex justify-between"><span className="text-mute">Ejecuciones por día</span><span>hasta {LIMITS.maxDailyExecutionsPerAgency}</span></li>
              <li className="flex justify-between"><span className="text-mute">Análisis en curso a la vez</span><span>{LIMITS.maxActiveAnalysesPerAgency}</span></li>
              <li className="flex justify-between"><span className="text-mute">Prospecciones este mes</span><span>{prospects} / {ctx.plan.prospectsPerMonth}</span></li>
            </ul>
          </div>
          <div className="card p-6">
            <h2 className="font-bold">Motores de recolección</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {avail.map((a) => (
                <li key={a.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <span>{a.label}</span>
                    <Badge tone={a.selectable ? "ok" : a.status === "requires_intervention" ? "sol" : "neutral"} title={a.reason ?? undefined}>{COLLECTOR_STATUS[a.status] ?? a.status}</Badge>
                  </div>
                  {a.reason && !a.selectable ? <p className="text-xs text-mute">{a.reason}</p> : null}
                  {isBrightDataId(a.id) && a.status !== "not_configured" && ctx.isAdmin ? <BrightDataProbe collector={a.id} label="conexión" /> : null}
                </li>
              ))}
              <li className="flex items-center justify-between">
                <span>Sugerencias de preguntas</span>
                {helperAvailable() ? <Badge tone="ok">IA</Badge> : <Badge tone="sol">plantillas</Badge>}
              </li>
              <li className="flex items-center justify-between">
                <span>Base de datos</span>
                {isEphemeralDb() ? <Badge tone="sol">temporal</Badge> : <Badge tone="ok">persistente</Badge>}
              </li>
            </ul>
            <p className="mt-3 text-xs text-mute">
              Los motores los opera el equipo de ChapaGEO. La agencia no necesita claves de API, cuentas ni extensiones.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
