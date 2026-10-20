import { AuthShell } from "@/components/AuthShell";
import { RegisterForm } from "@/components/AuthForms";

export const metadata = { title: "Crear cuenta" };

export default function Page() {
  return (
    <AuthShell title="Creá tu cuenta" subtitle="Configurá tu marca en 2 minutos y corré la primera medición.">
      <RegisterForm />
    </AuthShell>
  );
}
