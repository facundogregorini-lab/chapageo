"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Refresca la página cada tanto. Con `stepUrl`, antes pide a la web que avance lo que puede
 * avanzar sin worker (demo simulada y lotes de Bright Data). El resto lo hace el worker.
 */
export function AutoRefresh({ seconds = 5, stepUrl }: { seconds?: number; stepUrl?: string }) {
  const router = useRouter();
  useEffect(() => {
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        if (stepUrl) await fetch(stepUrl, { method: "POST" }).catch(() => undefined);
        router.refresh();
      } finally {
        busy = false;
      }
    };
    if (stepUrl) void tick();
    const t = setInterval(tick, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds, stepUrl]);
  return null;
}
