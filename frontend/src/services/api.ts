/**
 * DevPulse Frontend API Service
 *
 * Fetches live data from the backend and falls back to mock data
 * when the backend is unreachable.
 */

const API_BASE = '/api';

// Track whether the backend is reachable
let _backendAvailable = true;
let _lastCheck = 0;
const CHECK_INTERVAL_MS = 2_000;

async function apiFetch<T>(path: string, fallback: T): Promise<T> {
  // If backend was recently unreachable, skip fetch for a bit to avoid noise
  const now = Date.now();
  if (!_backendAvailable && now - _lastCheck < CHECK_INTERVAL_MS) {
    return fallback;
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    _backendAvailable = true;
    _lastCheck = now;
    return await response.json();
  } catch (error) {
    _backendAvailable = false;
    _lastCheck = now;
    console.debug(`[DevPulse API] ${path} unavailable:`, error);
    return fallback;
  }
}

// ─── Resource APIs ───────────────────────────────────────────

export interface ResourcesResponse {
  processes: any[];
  systemMemoryUsedGb: number;
  systemMemoryTotalGb: number;
  processCount: number;
}

export async function fetchResources(): Promise<ResourcesResponse | null> {
  return apiFetch<ResourcesResponse | null>('/resources/current', null);
}

export interface ResourceHistoryResponse {
  range: string;
  series: Array<{
    time: string;
    ide: number;
    terminal: number;
    containers: number;
    browser: number;
    total: number;
  }>;
  categories: string[];
}

export async function fetchResourceHistory(
  range: '1h' | '4h' | '8h' = '4h'
): Promise<ResourceHistoryResponse | null> {
  return apiFetch<ResourceHistoryResponse | null>(
    `/resources/history?range=${range}`,
    null
  );
}

// ─── Tab APIs ────────────────────────────────────────────────

export interface TabsResponse {
  activeTabs: any[];
  duplicateGroups: any[];
  staleTabs: any[];
  totalMemoryMb: number;
  tabCount: number;
}

export async function fetchTabs(): Promise<TabsResponse | null> {
  return apiFetch<TabsResponse | null>('/tabs', null);
}

export async function suspendTab(tabId: string): Promise<void> {
  await apiFetch(`/tabs/${tabId}/suspend`, null);
}

export async function bulkSuspendTabs(tabIds: string[]): Promise<void> {
  try {
    await fetch(`${API_BASE}/tabs/bulk-suspend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tab_ids: tabIds }),
    });
  } catch {
    // silent fail
  }
}

// ─── Timeline APIs ───────────────────────────────────────────

export interface TimelineResponse {
  range: string;
  markers: any[];
  rangeStartIso: string;
  rangeEndIso: string;
}

export async function fetchTimeline(
  range: '1h' | '4h' | '8h' | 'full' = '4h'
): Promise<TimelineResponse | null> {
  return apiFetch<TimelineResponse | null>(
    `/timeline?range=${range}`,
    null
  );
}

export async function fetchTelemetryAtTime(
  time: string
): Promise<any | null> {
  return apiFetch<any | null>(`/timeline/telemetry?time=${encodeURIComponent(time)}`, null);
}

// ─── Health Check ────────────────────────────────────────────

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    _backendAvailable = response.ok;
    return response.ok;
  } catch {
    _backendAvailable = false;
    return false;
  }
}

export function isBackendAvailable(): boolean {
  return _backendAvailable;
}
