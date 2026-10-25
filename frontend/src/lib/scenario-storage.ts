const LAST_SCENARIO_KEY = "caregap:last-scenario";

export function rememberScenario(scenarioId: string): void {
  try {
    window.sessionStorage.setItem(LAST_SCENARIO_KEY, scenarioId);
  } catch {
    // Session storage may be unavailable in private browsing; the workspace still works.
  }
}

export function recallScenario(): string | null {
  try {
    return window.sessionStorage.getItem(LAST_SCENARIO_KEY);
  } catch {
    return null;
  }
}

export function forgetScenario(): void {
  try {
    window.sessionStorage.removeItem(LAST_SCENARIO_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}
