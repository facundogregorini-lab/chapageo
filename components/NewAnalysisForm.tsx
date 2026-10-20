"use client";

import { useActionState, useState } from "react";
import { startAnalysisAction, type StartState } from "@/app/app/marcas/actions";

type Opt = { id: string; label: string; method: string; selectable: boolean; status: string; reason: string | null; workerOnline: boolean };

const STATUS_TEXT: Record<string, string> = {
  available: "Disponible",
  unverified: "Sin verificar",
  requires_intervention: "Requiere intervención",
  unavailable: "No disponible",
  not_configured: "No habilitado",
};

export function NewAnalysisForm({
  brandId,
  options,
  approved,
  maxExecutions,
  maxReps,
  minPrompts,
  maxPrompts,
  anyWorkerOnline,
  idem,
}: {
  brandId: string;
  options: Opt[];
  approved: number;
  maxExecutions: number;
  maxReps: number;
  minPrompts: number;
  maxPrompts: number;
  anyWorkerOnline: boolean;
  /** Generada en el servidor: evita diferencias de hidratación y hace idempotente el doble envío. */
  idem: string;
}) {
  const [state, action, pending] = useActionState<StartState, FormData>(startAnalysisAction.bind(null, brandId), undefined);
  const [selected, setSelected] = useState<string[]>(() => options.filter((o) => o.selectable).slice(0, 2).map((o) => o.id));
  const [reps, setReps] = useState(1);
  const total = approved * selected.length * reps;
  const promptsOk = approved >= minPrompts && approved <= maxPrompts;
  const tooMany = total > maxExecutions;

  return (
    <form action={action} className="card space-y-5 p-5 sm:p-6">
      <input type="hidden" name="idem" value={idem} />
      <div>
        <h2 className="font-bold">Motores</h2>
        <p className="text-sm text-mute">Solo se pueden elegir los que el worker verificó con una consulta real. Captura web y API oficial son mediciones distintas.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {options.map((o) => {
            const on = selected.includes(o.id);
            return (
              <label
                key={o.id}
                className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ${!o.selectable ? "cursor-not-allowed border-line bg-paper text-mute" : on ? "border-ink bg-white shadow-sm" : "border-line"}`}
              >
                <input
                  type="checkbox"
                  name="collectors"
                  value={o.id}
                  disabled={!o.selectable}
                  checked={on}
                  onChange={() => setSelected(on ? selected.filter((x) => x !== o.id) : [...selected, o.id])}
                  className="mt-1"
                />
                <span>
                  <span className="font-semibold">{o.label}</span>
                  <span className="block text-xs">
                    {STATUS_TEXT[o.status] ?? o.status}
                    {o.selectable && !o.workerOnline ? " · worker apagado: arranca cuando vuelva" : ""}
                    {o.reason && !o.selectable ? ` · ${o.reason}` : ""}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="repetitions">Repeticiones por pregunta y motor</label>
          <select id="repetitions" name="repetitions" className="input" value={reps} onChange={(e) => setReps(Number(e.target.value))}>
            {Array.from({ length: maxReps }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-mute">Repetir ayuda a ver la variación de las respuestas.</p>
        </div>
        <div className="rounded-xl bg-paper p-4">
          <div className="text-xs font-semibold text-mute">Total de ejecuciones</div>
          <div className="mt-1 text-2xl font-bold">{total}</div>
          <div className="text-xs text-mute">{approved} preguntas aprobadas × {selected.length} {selected.length === 1 ? "motor" : "motores"} × {reps} {reps === 1 ? "repetición" : "repeticiones"}</div>
          {tooMany ? <div className="mt-1 text-xs text-bad">Supera el máximo de {maxExecutions} por análisis.</div> : null}
        </div>
      </div>
      {!promptsOk ? <p className="rounded-xl bg-sol-50 px-3 py-2 text-sm text-[#6b4700]">Necesitás entre {minPrompts} y {maxPrompts} preguntas aprobadas (hay {approved}).</p> : null}
      {!anyWorkerOnline ? (
        <p className="rounded-xl bg-paper px-3 py-2 text-xs text-mute">
          El worker no está enviando señal en este momento. El análisis queda en cola y avanza cuando el worker vuelva; podés cerrar la pestaña.
        </p>
      ) : null}
      {state?.error ? <p className="rounded-xl bg-bad-50 px-3 py-2 text-sm text-bad">{state.error}</p> : null}
      <button className="btn-primary" disabled={pending || !selected.length || !promptsOk || tooMany}>
        {pending ? "Creando…" : `Iniciar análisis (${total} ejecuciones)`}
      </button>
      <p className="text-xs text-mute">El análisis corre en el worker, no en tu navegador: podés cerrar la pestaña y volver después.</p>
    </form>
  );
}
