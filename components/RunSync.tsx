"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Al abrir el panel (y cada tanto mientras está abierto) guarda lo que Bright Data terminó
 * mientras nadie miraba. Si se guardó algo, refresca la página para mostrarlo.
 */
export function RunSync({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const r = await fetch("/api/runs/sync", { method: "POST" });
        const j = r.ok ? ((await r.json()) as { processed?: number }) : null;
        if (j?.processed) router.refresh();
      } catch {
        /* sin red no pasa nada: se reintenta en la próxima vuelta */
      } finally {
        busy = false;
      }
    };
    void tick();
    const t = setInterval(tick, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
