import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "./SiteChrome";

export const LEGAL_UPDATED = "21 de octubre de 2026";

export function LegalPage({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-mute">Última actualización: {LEGAL_UPDATED}</p>
        <div className="prose-md mt-8 text-[15px] text-ink">{children}</div>
        <p className="mt-10 text-sm text-mute">
          ¿Dudas? Escribinos desde <Link href="/contacto" className="font-semibold text-ink underline">contacto</Link>.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
