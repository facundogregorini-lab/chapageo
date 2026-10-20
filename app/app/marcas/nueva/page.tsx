import Link from "next/link";
import { BrandWizard } from "@/components/BrandWizard";
import { promptPoolUsed, workspaceBrands } from "@/lib/access";
import { requireCtx } from "@/lib/auth";
import { COUNTRIES, ENGINE_IDS, ENGINES, engineConfigured } from "@/lib/config";
import { helperAvailable } from "@/lib/llm";

export const metadata = { title: "Nueva marca" };

export default async function Page() {
  const ctx = await requireCtx();
  const brands = await workspaceBrands(ctx.workspace.id);
  const poolLeft = ctx.plan.promptPool - (await promptPoolUsed(ctx.workspace.id));
  if (brands.length >= ctx.plan.maxBrands || poolLeft <= 0) {
    return (
      <div className="card mx-auto max-w-xl p-8 text-center">
        <h1 className="text-xl font-bold">Llegaste al límite de tu plan</h1>
        <p className="mt-2 text-sm text-mute">
          El plan {ctx.plan.name} incluye {ctx.plan.maxBrands} marca(s) y {ctx.plan.promptPool} preguntas. Podés pausar preguntas de otra marca o pasar a un plan mayor.
        </p>
        <Link href="/precios" className="btn-primary mt-5">Ver planes</Link>
      </div>
    );
  }
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Nueva marca</h1>
      <p className="mb-6 text-sm text-mute">Cinco pasos. Lo podés cambiar todo después.</p>
      <BrandWizard
        engines={ENGINE_IDS.map((id) => ({ id, label: ENGINES[id].label, color: ENGINES[id].color, configured: engineConfigured(id) }))}
        countries={COUNTRIES.map((c) => ({ code: c.code, name: c.name }))}
        maxEngines={ctx.plan.maxEngines}
        maxReps={ctx.plan.repetitions}
        poolLeft={poolLeft}
        helper={helperAvailable()}
      />
    </div>
  );
}
