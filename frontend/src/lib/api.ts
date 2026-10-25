import type {
  AccessibilityResponse,
  HealthResponse,
  ImportHistory,
  ImportReport,
  MetaResponse,
  OverviewResponse,
  RecommendationsResponse,
  Scenario,
  ScenarioListResponse,
  ServiceId,
  SimulationResponse,
} from "@/lib/types";

const DEFAULT_API_URL = "http://localhost:8000";

export const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL
).replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

type QueryValue = string | number | boolean | null | undefined;

export function apiUrl(path: string, params?: Record<string, QueryValue>): string {
  const url = new URL(`${API_BASE}${path.startsWith("/") ? path : `/${path}`}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function parseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      detail?: unknown;
      errors?: unknown;
    };
    if (typeof payload.detail === "string") return payload.detail;
    if (Array.isArray(payload.detail)) {
      const messages = payload.detail
        .map((item) =>
          typeof item === "object" && item && "msg" in item
            ? String((item as { msg: unknown }).msg)
            : null,
        )
        .filter(Boolean);
      if (messages.length) return messages.join("; ");
    }
    return `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

export async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(
      0,
      `CareGap could not reach the analysis API at ${API_BASE}. Start the backend and try again.`,
    );
  }
  if (!response.ok) {
    throw new ApiError(response.status, await parseError(response));
  }
  return (await response.json()) as T;
}

export async function getHealth(signal?: AbortSignal) {
  return requestJson<HealthResponse>(apiUrl("/health"), { signal });
}

export async function getMeta(signal?: AbortSignal) {
  return requestJson<MetaResponse>(apiUrl("/api/v1/meta"), { signal });
}

export async function getOverview(
  service: string,
  thresholdMinutes: number | null,
  signal?: AbortSignal,
) {
  return requestJson<OverviewResponse>(
    apiUrl("/api/v1/overview", {
      service,
      threshold_minutes: thresholdMinutes,
    }),
    { signal },
  );
}

export async function getAccessibility(
  service: string,
  thresholdMinutes: number,
  signal?: AbortSignal,
) {
  return requestJson<AccessibilityResponse>(
    apiUrl("/api/v1/accessibility", {
      service,
      threshold_minutes: thresholdMinutes,
    }),
    { signal },
  );
}

export interface RecommendationQuery {
  service: ServiceId | string;
  threshold_minutes: number;
  intervention_type: string;
  equity_weight: number;
  limit: number;
  set_size: number;
  strategy: "equity_weighted" | "max_coverage";
}

export async function getRecommendations(
  query: RecommendationQuery,
  signal?: AbortSignal,
) {
  return requestJson<RecommendationsResponse>(
    apiUrl("/api/v1/recommendations", { ...query }),
    { signal },
  );
}

export interface ScenarioPayload {
  name: string;
  service: string;
  threshold_minutes: number;
  interventions: Array<{
    intervention_type: string;
    name?: string;
    lon: number;
    lat: number;
  }>;
}

export async function createScenario(payload: ScenarioPayload) {
  return requestJson<Scenario>(apiUrl("/api/v1/scenarios"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function simulateScenario(
  scenarioId: string,
  signal?: AbortSignal,
) {
  return requestJson<SimulationResponse>(
    apiUrl(`/api/v1/scenarios/${scenarioId}/simulate`),
    { method: "POST", signal },
  );
}

export async function getScenarioSimulation(
  scenarioId: string,
  signal?: AbortSignal,
) {
  return requestJson<SimulationResponse>(
    apiUrl(`/api/v1/scenarios/${scenarioId}/simulate`),
    { signal },
  );
}

export async function getScenarios(limit = 10, signal?: AbortSignal) {
  return requestJson<ScenarioListResponse>(
    apiUrl("/api/v1/scenarios", { limit }),
    { signal },
  );
}

export async function getImportHistory(
  limit = 20,
  signal?: AbortSignal,
) {
  return requestJson<ImportHistory>(
    apiUrl("/api/v1/data/imports", { limit }),
    { signal },
  );
}

export async function importData(
  file: File,
  kind: "facilities" | "areas",
): Promise<ImportReport> {
  const body = new FormData();
  body.append("file", file);
  body.append("kind", kind);
  return requestJson<ImportReport>(apiUrl("/api/v1/data/import"), {
    method: "POST",
    body,
  });
}
