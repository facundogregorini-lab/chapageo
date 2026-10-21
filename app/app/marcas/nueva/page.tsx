import { BrandWizard } from "@/components/BrandWizard";
import { workspaceBrands } from "@/lib/access";
import { DemoReadOnly } from "@/components/ui";
import { isDemoCtx, requireCtx } from "@/lib/auth";
import { COUNTRIES } from "@/lib/config";
import { LIMITS } from "@/lib/limits";
import { helperAvailable } from "@/lib/llm";

export const metadata = { title: "Nuevo cliente" };

export default async function Page() {
  const ctx = await requireCtx();
  if (isDemoCtx(ctx)) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Nuevo cliente</h1>
        <DemoReadOnly what="cargar clientes" />
      </div>
    );
  }
  const brands = await workspaceBrands(ctx.workspace.id);
  if (brands.length >= LIMITS.maxClientsPerAgency) {
    return (
      <div className="card mx-auto max-w-xl p-8 text-center">
        <h1 className="text-xl font-bold">Llegaste al límite de clientes</h1>
        <p className="mt-2 text-sm text-mute">Por ahora cada agencia puede tener {LIMITS.maxClientsPerAgency} clientes. Escribinos si necesitás más.</p>
      </div>
    );
  }
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Nuevo cliente</h1>
      <p className="mb-6 text-sm text-mute">Datos del cliente, competidores y preguntas. Todo se puede editar después.</p>
      <BrandWizard
        countries={COUNTRIES.map((c) => ({ code: c.code, name: c.name }))}
        helper={helperAvailable()}
        minPrompts={LIMITS.minPrompts}
        maxPrompts={LIMITS.maxPrompts}
        maxCompetitors={LIMITS.maxCompetitors}
      />
    </div>
  );
}
