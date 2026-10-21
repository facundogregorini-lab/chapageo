import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

export const metadata = { title: "Página no encontrada" };

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 py-24 text-center">
        <div className="eyebrow">Error 404</div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">No encontramos esta página</h1>
        <p className="mt-3 text-mute">Puede que el link esté mal copiado o que el contenido ya no exista.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn-primary">Ir al inicio</Link>
          <Link href="/checker" className="btn-ghost">Probar el checker gratis</Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
