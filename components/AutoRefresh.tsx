"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Refresca la página cada tanto. El trabajo real lo hace el worker, no el navegador.
 * Única excepción: en la demo, `demoStepUrl` pide a la web que genere unas pocas respuestas
 * simuladas por vuelta, para que la demo funcione sin worker.
 */
export function AutoRefresh({ seconds = 5, demoStepUrl }: { seconds?: number; demoStepUrl?: string }) {
  const router = useRouter();
  useEffect(() => {
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        if (demoStepUrl) await fetch(demoStepUrl, { method: "POST" }).catch(() => undefined);
        router.refresh();
      } finally {
        busy = false;
      }
    };
    if (demoStepUrl) void tick();
    const t = setInterval(tick, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds, demoStepUrl]);
  return null;
}
