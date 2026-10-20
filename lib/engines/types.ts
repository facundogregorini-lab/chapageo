import type { EngineId } from "../config";
import type { Source } from "../types";

export type EngineRequest = {
  prompt: string;
  country: string;
  city?: string | null;
  language: string;
};

export type EngineResult = {
  answer: string;
  sources: Source[];
  model: string;
  costUsd: number;
  simulated: boolean;
};

export type EngineAdapter = (req: EngineRequest) => Promise<EngineResult>;

export type { EngineId };
