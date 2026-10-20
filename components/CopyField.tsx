"use client";

import { useState } from "react";

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={value} className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      <button
        className="btn-ghost"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "¡Listo!" : "Copiar"}
      </button>
    </div>
  );
}
