import type { SiteAudit } from "@/lib/audit";
import { Badge } from "./ui";

export function SiteAuditView({ audit }: { audit: SiteAudit }) {
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">Salud técnica para IA</div>
            <div className="text-xs text-mute">{audit.domain}</div>
          </div>
          <div className="text-3xl font-bold">{audit.score}<span className="text-base text-mute">/100</span></div>
        </div>
        <ul className="mt-4 divide-y divide-line">
          {audit.checks.map((c) => (
            <li key={c.id} className="flex gap-3 py-3 text-sm">
              <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold ${c.ok ? "bg-ok-50 text-ok" : "bg-bad-50 text-bad"}`}>
                {c.ok ? "✓" : "!"}
              </span>
              <div>
                <div className="font-semibold">{c.label}</div>
                <div className="text-mute">{c.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="card overflow-hidden">
        <div className="border-b border-line px-5 py-3 text-sm font-semibold">
          Bots de IA en robots.txt {audit.robotsFound ? "" : <span className="font-normal text-mute">· no encontramos robots.txt (todo permitido)</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <tbody>
              {audit.bots.map((b) => (
                <tr key={b.agent} className="border-t border-line first:border-0">
                  <td className="px-5 py-2 font-mono text-xs">{b.agent}</td>
                  <td className="px-2 py-2 text-mute">{b.owner}</td>
                  <td className="px-2 py-2 text-mute">{b.purpose}{b.critical ? " · clave" : ""}</td>
                  <td className="px-5 py-2 text-right">
                    <Badge tone={b.status === "permitido" ? "ok" : b.status === "bloqueado" ? "bad" : "sol"}>{b.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-5 py-3 text-xs text-mute">
          llms.txt: {audit.llmsTxt ? "presente" : "no encontrado"} (informativo: ningún motor confirmó que lo use para recomendar).
        </div>
      </div>
    </div>
  );
}
