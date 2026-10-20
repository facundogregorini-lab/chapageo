// Arma todo lo que necesita el resumen / informe de un análisis (misma fuente para panel, informe y link público).

import { analysisMetrics, brandForRun, comparableRuns, headlineSlice, latestRun, runJobs, computeAnalysisMetrics, type AnalysisMetrics, type Ratio } from "./metrics";
import { buildOpportunities, type OpportunityReport } from "./opportunities";
import { getRunInWorkspace } from "./access";
import type { Brand, Run } from "./types";

export type Report = { m: AnalysisMetrics; opp: OpportunityReport; previous: { run: Run; discovery: Ratio | null }[] };

export async function loadReport(brand: Brand, runId?: string | null): Promise<Report | null> {
  const run = runId ? await getRunInWorkspace(brand.workspace_id, runId) : await latestRun(brand.workspace_id, brand.id, { terminalOnly: true }) ?? (await latestRun(brand.workspace_id, brand.id));
  if (!run || run.brand_id !== brand.id) return null;
  const m = await analysisMetrics(brand, run);
  const opp = buildOpportunities(brandForRun(brand, run), m);
  const prev = await comparableRuns(brand, run);
  const previous = await Promise.all(
    prev.map(async (r) => {
      const pm = computeAnalysisMetrics(brandForRun(brand, r), r, await runJobs(brand.workspace_id, r.id));
      return { run: r, discovery: headlineSlice(pm, "descubrimiento")?.own.presence ?? null };
    }),
  );
  return { m, opp, previous };
}
