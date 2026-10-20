"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, exact, children }: { href: string; exact?: boolean; children: React.ReactNode }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(href + "/");
  return (
    <Link href={href} className={`flex items-center rounded-lg px-3 py-2 font-medium transition ${active ? "bg-ink text-white" : "text-ink-2 hover:bg-paper"}`}>
      {children}
    </Link>
  );
}

export function TabLink({ href, exact, children }: { href: string; exact?: boolean; children: React.ReactNode }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(href + "/");
  return (
    <Link href={href} className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-semibold transition ${active ? "border-ink text-ink" : "border-transparent text-mute hover:text-ink"}`}>
      {children}
    </Link>
  );
}
