"use client";

import { useState } from "react";
import { Markdown } from "./Markdown";

export function DraftPanel({ actionId, initial }: { actionId: string; initial: string | null }) {
  const [draft, setDraft] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/actions/${actionId}/draft`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDraft(d.draft);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost btn-sm" onClick={generate} disabled={loading}>
          {loading ? "Redactando…" : draft ? "Regenerar borrador" : "Generar borrador"}
        </button>
        {draft ? (
          <button
            className="btn-ghost btn-sm"
            onClick={async () => {
              await navigator.clipboard.writeText(draft);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "¡Copiado!" : "Copiar Markdown"}
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-xs text-bad">{error}</p> : null}
      {draft ? (
        <div className="mt-3 rounded-xl border border-line bg-paper/60 p-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#8a5a00]">Borrador · revisalo antes de publicar</div>
          <Markdown text={draft} />
        </div>
      ) : null}
    </div>
  );
}
