"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type RunState = { id: string; status: string; total: number; done_count: number; failed_count: number };

export function RunButton({ brandId, activeRun }: { brandId: string; activeRun: RunState | null }) {
  const router = useRouter();
  const [run, setRun] = useState<RunState | null>(activeRun);
  const [error, setError] = useState<string | null>(null);
  const looping = useRef(false);

  const loop = useCallback(
    async (runId: string) => {
      if (looping.current) return;
      looping.current = true;
      try {
        for (;;) {
          const r = await fetch(`/api/runs/${runId}/tick`, { method: "POST" });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error ?? "Error");
          setRun(d.run);
          if (d.run.status !== "running" && d.run.status !== "queued") break;
        }
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        looping.current = false;
      }
    },
    [router],
  );

  const start = useCallback(async () => {
    setError(null);
    const r = await fetch(`/api/brands/${brandId}/runs`, { method: "POST" });
    const d = await r.json();
    if (!r.ok) return setError(d.error);
    setRun(d.run);
    void loop(d.run.id);
  }, [brandId, loop]);

  // Si el servidor trae una corrida abierta (p. ej. recién creada desde el onboarding), la seguimos.
  useEffect(() => {
    if (activeRun && (activeRun.status === "running" || activeRun.status === "queued")) {
      setRun(activeRun);
      void loop(activeRun.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRun?.id]);

  const running = run && (run.status === "running" || run.status === "queued");
  if (running) {
    const progress = run.total ? (run.done_count + run.failed_count) / run.total : 0;
    return (
      <div className="w-64">
        <div className="flex justify-between text-xs font-semibold">
          <span>Midiendo…</span>
          <span>{run.done_count + run.failed_count} / {run.total}</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-celeste transition-all" style={{ width: `${Math.max(4, progress * 100)}%` }} />
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-end">
      <button className="btn-primary" onClick={start}>Medir ahora</button>
      {error ? <span className="mt-1 text-xs text-bad">{error}</span> : null}
    </div>
  );
}
