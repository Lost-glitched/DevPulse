/**
 * DevPulse Frontend API Service
 *
 * Fetches live data from the backend and falls back to mock data
 * when the backend is unreachable.
 */

const API_BASE = '/api';

// Track whether the backend is reachable
let _backendAvailable = false;

async function apiFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    _backendAvailable = true;
    return await response.json();
  } catch (error) {
    _backendAvailable = false;
    console.debug(`[DevPulse API] ${path} fetch failed, using fallback`);
    return fallback;
  }
}

// ─── Resource APIs ───────────────────────────────────────────

export interface ResourcesResponse {
  processes: any[];
  systemMemoryUsedGb: number;
  systemMemoryTotalGb: number;
  processCount: number;
  cpuPercent?: number;
  cpuCores?: number;
  osPlatform?: string;
  subsystemTotals?: Record<string, { ramGb: number; cpuPercent: number; count: number }>;
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
    cpu?: number;
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
  extensionConnected?: boolean;
  isFallback?: boolean;
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
  return apiFetch<any | null>(`/timeline/telemetry?time=${time}`, null);
}

// ─── Health Check ────────────────────────────────────────────

export interface DaemonHealthInfo {
  status: string;
  version: string;
  collectors: Record<string, boolean>;
  background_tasks: number;
  system: { ram_percent: number; cpu_percent: number };
  daemon?: { rss_mb: number; cpu_percent: number; pid: number; version: string };
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    _backendAvailable = response.ok;
    return response.ok;
  } catch {
    _backendAvailable = false;
    return false;
  }
}

export async function fetchDaemonHealth(): Promise<DaemonHealthInfo | null> {
  return apiFetch<DaemonHealthInfo | null>('/health', null);
}

export function isBackendAvailable(): boolean {
  return _backendAvailable;
}

// ─── Project APIs ────────────────────────────────────────────

export interface ProjectInfoResponse {
  project_id: string;
  displayName: string;
}

export async function fetchProjectInfo(): Promise<ProjectInfoResponse | null> {
  return apiFetch<ProjectInfoResponse | null>('/project/current', null);
}

// ─── Shadow Timeline APIs ────────────────────────────────────

export async function fetchSnapshots(
  range?: string,
  limit: number = 50
): Promise<{ snapshots: any[]; total: number } | null> {
  const q = range ? `?range=${range}&limit=${limit}` : `?limit=${limit}`;
  return apiFetch<{ snapshots: any[]; total: number } | null>(
    `/timeline/snapshots${q}`,
    null
  );
}

export async function fetchFailureDiff(
  executionResultId: string
): Promise<any | null> {
  return apiFetch<any | null>(
    `/timeline/failure/${executionResultId}/diff`,
    null
  );
}

export async function revertToSnapshot(
  snapshotId: string,
  mode: 'preview' | 'apply' = 'preview',
  confirm: boolean = false,
  force: boolean = false
): Promise<any | null> {
  try {
    const response = await fetch(`${API_BASE}/timeline/revert/${snapshotId}?mode=${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm, force }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Reversion failed' }));
      throw new Error(err.detail || 'Reversion failed');
    }
    return await response.json();
  } catch (error) {
    console.error('[DevPulse API] revertToSnapshot error:', error);
    throw error;
  }
}

// ─── Diagnoses & Remediation APIs ────────────────────────────

export async function fetchDiagnoses(): Promise<{ diagnoses: any[]; total: number } | null> {
  return apiFetch<{ diagnoses: any[]; total: number } | null>('/diagnoses', null);
}

export async function executeFix(
  diagnosisId: string,
  confirm: boolean = false
): Promise<any | null> {
  try {
    const response = await fetch(`${API_BASE}/diagnoses/${diagnosisId}/fix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Remediation failed' }));
      throw new Error(err.detail || 'Remediation failed');
    }
    return await response.json();
  } catch (error) {
    console.error('[DevPulse API] executeFix error:', error);
    throw error;
  }
}
