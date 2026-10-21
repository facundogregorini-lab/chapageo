import { AuthShell } from "@/components/AuthShell";
import { GoogleButton, RegisterForm } from "@/components/AuthForms";
import { googleEnabled } from "@/lib/google-auth";

export const metadata = { title: "Crear cuenta" };
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AuthShell title="Creá tu cuenta" subtitle="Configurá tu marca en 2 minutos y corré la primera medición.">
      {googleEnabled() ? <GoogleButton label="Crear cuenta con Google" /> : null}
      <RegisterForm />
    </AuthShell>
  );
}
