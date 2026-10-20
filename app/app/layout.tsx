import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { NavLink } from "@/components/NavLink";
import { Logo } from "@/components/ui";
import { workspaceBrands } from "@/lib/access";
import { requireCtx } from "@/lib/auth";
import { isEphemeralDb } from "@/lib/db";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  const brands = await workspaceBrands(ctx.workspace.id);
  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-white lg:flex">
        <div className="px-5 py-5">
          <Logo />
        </div>
        <div className="mx-3 rounded-xl border border-line bg-paper px-3 py-2.5">
          <div className="truncate text-sm font-semibold">{ctx.workspace.name}</div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-mute">
            Plan {ctx.plan.name}
            {ctx.workspace.plan === "prueba" ? <Link href="/precios" className="font-semibold text-celeste-700">Mejorar</Link> : null}
          </div>
        </div>
        <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3 text-sm">
          <NavLink href="/app" exact>Cartera</NavLink>
          <div className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-mute">Marcas</div>
          {brands.map((b) => (
            <NavLink key={b.id} href={`/app/marcas/${b.id}`}>
              <span className="truncate">{b.name}</span>
            </NavLink>
          ))}
          <NavLink href="/app/marcas/nueva" exact>
            <span className="text-celeste-700">+ Nueva marca</span>
          </NavLink>
          <div className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-mute">Crecer</div>
          <NavLink href="/app/prospeccion">Prospección</NavLink>
          {ctx.isAdmin ? <NavLink href="/app/validacion">Validación (PMF)</NavLink> : null}
          <NavLink href="/app/ajustes">Ajustes</NavLink>
        </nav>
        <div className="border-t border-line px-5 py-4 text-xs text-mute">
          <div className="truncate">{ctx.user.email}</div>
          <form action={logoutAction}>
            <button className="mt-1 font-semibold text-ink hover:underline">Salir</button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="no-print flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:hidden">
          <Logo />
          <div className="flex gap-3 text-sm font-semibold">
            <Link href="/app">Cartera</Link>
            <Link href="/app/ajustes">Ajustes</Link>
          </div>
        </div>
        {isEphemeralDb() ? (
          <div className="no-print border-b border-sol/40 bg-sol-50 px-4 py-2 text-center text-xs text-[#6b4700]">
            Base de datos temporal: los cambios pueden perderse. Configurá <code>DATABASE_URL</code> (Turso) para producción.
          </div>
        ) : null}
        {ctx.user.email === "demo@chapageo.lat" ? (
          <div className="no-print border-b border-celeste/30 bg-celeste-50 px-4 py-2 text-center text-xs text-celeste-700">
            Estás en la demo: marcas ficticias y respuestas simuladas. <Link href="/registro" className="font-semibold underline">Creá tu cuenta</Link> para medir tu marca.
          </div>
        ) : null}
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
