"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** Arranca la primera medición después del onboarding y limpia el parámetro de la URL. */
export function AutoRun({ brandId }: { brandId: string }) {
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    fetch(`/api/brands/${brandId}/runs`, { method: "POST" }).finally(() => {
      router.replace(`/app/marcas/${brandId}`);
      router.refresh();
    });
  }, [brandId, router]);
  return null;
}
