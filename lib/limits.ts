// Límites de uso por agencia y por análisis. Se configuran por variables de entorno
// para poder ajustarlos sin desplegar código. Los valores por defecto son conservadores.

function int(name: string, fallback: number, min = 0): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= min ? Math.floor(v) : fallback;
}

export const LIMITS = {
  minPrompts: 5,
  maxPrompts: 20,
  maxCompetitors: 3,
  maxRepetitions: 3,
  get maxExecutionsPerAnalysis() {
    return int("MAX_EXECUTIONS_PER_ANALYSIS", 120, 1);
  },
  get maxDailyExecutionsPerAgency() {
    return int("MAX_DAILY_EXECUTIONS_PER_AGENCY", 300, 1);
  },
  get maxActiveAnalysesPerAgency() {
    return int("MAX_ACTIVE_ANALYSES_PER_AGENCY", 2, 1);
  },
  get maxClientsPerAgency() {
    return int("MAX_CLIENTS_PER_AGENCY", 15, 1);
  },
  /** Intentos totales por ejecución (1 + reintentos), solo para errores transitorios. */
  get jobMaxAttempts() {
    return int("JOB_MAX_ATTEMPTS", 3, 1);
  },
  /** Sin heartbeat durante este tiempo, una ejecución "en curso" se considera interrumpida. */
  get staleJobMs() {
    return int("STALE_JOB_SECONDS", 120, 1) * 1000;
  },
  /** Un worker sin heartbeat durante este tiempo se muestra como apagado. */
  get workerOfflineMs() {
    return int("WORKER_OFFLINE_SECONDS", 90, 15) * 1000;
  },
};
