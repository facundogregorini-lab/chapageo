import { AuthShell } from "@/components/AuthShell";
import { GoogleButton, LoginForm } from "@/components/AuthForms";
import { googleEnabled } from "@/lib/google-auth";

export const metadata = { title: "Ingresar" };

const ERRORS: Record<string, string> = {
  google: "No pudimos completar el ingreso con Google. Probá de nuevo.",
  google_estado: "El ingreso con Google venció o se abrió en otra pestaña. Probá de nuevo.",
  google_cancelado: "Cancelaste el ingreso con Google.",
  google_off: "El ingreso con Google no está disponible por ahora. Usá tu email y contraseña.",
};

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const message = error ? ERRORS[error] : undefined;
  return (
    <AuthShell title="Ingresá a ChapaGEO" subtitle="Tu panel de visibilidad en IA.">
      {message ? <p className="mb-4 rounded-xl bg-bad-50 px-3 py-2 text-sm text-bad">{message}</p> : null}
      {googleEnabled() ? <GoogleButton next={next} label="Continuar con Google" /> : null}
      <LoginForm next={next} />
      <div className="mt-6 border-t border-line pt-4 text-center text-sm">
        <a href="/demo" className="font-semibold text-celeste-700">Entrar a la demo sin cuenta →</a>
      </div>
    </AuthShell>
  );
}
