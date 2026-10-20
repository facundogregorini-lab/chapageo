"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AuditButton({ brandId, label = "Revisar ahora" }: { brandId: string; label?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <button
      className="btn-primary"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        await fetch(`/api/brands/${brandId}/audit`, { method: "POST" });
        setLoading(false);
        router.refresh();
      }}
    >
      {loading ? "Revisando…" : label}
    </button>
  );
}
