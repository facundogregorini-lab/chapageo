import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { GoogleButton, RegisterForm } from "@/components/AuthForms";
import { isSubscriptionPlan, PLANS } from "@/lib/config";
import { getCtx } from "@/lib/auth";
import { googleEnabled } from "@/lib/google-auth";

export const metadata = { title: "Crear cuenta" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  const chosen = plan && isSubscriptionPlan(plan) ? PLANS[plan] : null;
  if (chosen && (await getCtx())) redirect(`/app/plan?plan=${chosen.id}`);
  return (
    <AuthShell
      title={chosen ? `Creá tu cuenta · plan ${chosen.name}` : "Creá tu cuenta"}
      subtitle={chosen ? "Creás la cuenta, pagás con Mercado Pago y el plan se activa solo." : "Configurá tu marca en 2 minutos y corré la primera medición."}
    >
      {googleEnabled() ? <GoogleButton next={chosen ? `/app/plan?plan=${chosen.id}` : undefined} label="Crear cuenta con Google" /> : null}
      <RegisterForm plan={chosen?.id} planName={chosen?.name} />
    </AuthShell>
  );
}
