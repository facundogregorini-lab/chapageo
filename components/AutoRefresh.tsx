"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Solo LEE el estado: refresca la página cada tanto. El trabajo lo hace el worker, no el navegador. */
export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
