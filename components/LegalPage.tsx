import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "./SiteChrome";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16">
        <div className="eyebrow">Legales</div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-mute">Última actualización: {updated}</p>
        <div className="prose-md mt-8 text-[15px]">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}
