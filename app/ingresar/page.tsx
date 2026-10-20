import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { LoginForm } from "@/components/AuthForms";

export const metadata = { title: "Ingresar" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthShell title="Ingresá a ChapaGEO" subtitle="Tu panel de visibilidad en IA.">
      <LoginForm next={next} />
      <div className="mt-6 border-t border-line pt-4 text-center text-sm">
        <Link href="/demo" className="font-semibold text-celeste-700">Entrar a la demo sin cuenta →</Link>
      </div>
    </AuthShell>
  );
}
