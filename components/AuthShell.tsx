import type { ReactNode } from "react";
import { Logo } from "./ui";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(50%_40%_at_50%_0%,rgba(59,159,224,0.16),transparent_70%)] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="card p-7 shadow-sm">
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-mute">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
