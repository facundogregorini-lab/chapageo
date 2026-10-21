"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProbeOutcome } from "@/lib/brightdata-probe";

/** Botón de prueba de un motor de Bright Data: hace UNA consulta real y muestra lo que volvió. */
export function BrightDataProbe({ collector, label }: { collector: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<ProbeOutcome | null>(null);
  const probe = async () => {
    setBusy(true);
    setOut(null);
    try {
      const r = await fetch("/api/brightdata/probe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ collector }) });
      setOut(r.status === 403 || r.status === 401 ? { ok: false, message: await r.text() } : ((await r.json()) as ProbeOutcome));
      router.refresh();
    } catch (e) {
      setOut({ ok: false, message: String((e as Error).message) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="text-xs">
      <button type="button" onClick={probe} disabled={busy} className="btn-ghost btn-sm">
        {busy ? "Probando… (hasta 2 min)" : `Probar ${label}`}
      </button>
      {out ? (
        <div className={`mt-2 rounded-lg border px-2 py-1.5 ${out.ok ? "border-ok/40 text-ink" : "border-sol/40 text-[#6b4700]"}`}>
          <div className="font-semibold">{out.message}</div>
          {out.ok ? (
            <div className="mt-1 space-y-0.5 text-mute">
              <div>
                Modelo: {out.model ?? "no informado"} · País: {out.country ?? "no informado"} · Fuentes: {out.citations} · {out.seconds} s
              </div>
              <div className="whitespace-pre-wrap text-ink">{out.excerpt}…</div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
