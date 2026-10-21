import { getCtx } from "@/lib/auth";
import { csvCell } from "@/lib/csv";
import { all } from "@/lib/db";

export async function GET() {
  const ctx = await getCtx();
  if (!ctx?.isAdmin) return new Response("No autorizado", { status: 401 });
  const rows = await all<Record<string, unknown>>("SELECT created_at, email, name, company, phone, domain, source, offer, stage, amount_usd, note FROM leads ORDER BY created_at DESC");
  const cols = ["created_at", "email", "name", "company", "phone", "domain", "source", "offer", "stage", "amount_usd", "note"];
  // Los leads los escribe cualquiera desde la web: csvCell neutraliza fórmulas al abrirlo en Excel.
  const csv = "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="chapageo-leads.csv"' } });
}
