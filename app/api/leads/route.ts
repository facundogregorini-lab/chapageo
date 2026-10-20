import { getCtx } from "@/lib/auth";
import { all } from "@/lib/db";

export async function GET() {
  const ctx = await getCtx();
  if (!ctx?.isAdmin) return new Response("No autorizado", { status: 401 });
  const rows = await all<Record<string, unknown>>("SELECT created_at, email, name, company, phone, domain, source, offer, stage, amount_usd, note FROM leads ORDER BY created_at DESC");
  const cols = ["created_at", "email", "name", "company", "phone", "domain", "source", "offer", "stage", "amount_usd", "note"];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="chapageo-leads.csv"' } });
}
