export type ViewMode = 'treemap' | 'tabs' | 'timeline';
export type ThemeStyle = 'precision' | 'calm';

export type SubsystemType = 'ide' | 'terminal' | 'containers' | 'browser';

export interface ProcessNode {
  id: string;
  subsystem: SubsystemType;
  subsystemTitle: string;
  name: string;
  pid: number | string;
  details: string;
  ramGb: number;
  ramDisplay: string;
  cpuPercent: number;
  threads?: number;
  statusText?: string;
  isCause?: boolean;
  causeBadgeText?: string;
  leakRate?: string;
  recommendation?: string;
  gridSpan: {
    colSpan: number;
    rowSpan: number;
  };
}

export interface TabItem {
  id: string;
  title: string;
  url: string;
  displayDomain: string;
  category: 'active' | 'duplicate' | 'stale';
  pid?: number | string;
  ramMb: number;
  cpuPercent?: number;
  lastActive: string;
  isSnoozed?: boolean;
  isPinned?: boolean;
  iconName: string;
  iconColor: string;
  whyText?: string;
  eventRate?: string;
  flags?: string;
  groupKey?: string;
  isTarget?: boolean;
  isExactDupe?: boolean;
  idleDuration?: string;
  idleDays?: number;
  restoresInstantly?: boolean;
}

export interface DuplicateGroup {
  id: string;
  title: string;
  tabs: TabItem[];
  isResolved?: boolean;
}

export interface TimelineMarker {
  id: string;
  track: SubsystemType;
  timeStr: string;
  timestampMinutes: number; // minutes from 11:00 (0 to 240)
  percentLeft: number;
  label: string;
  fullTitle: string;
  details: string;
  isSpike?: boolean;
  isUnderScrubber?: boolean;
  color: string;
}

export interface ScrubPointTelemetry {
  timeStr: string;
  isoTime: string;
  traceId: string;
  anomalyTitle: string;
  anomalyBadge: string;
  ramUsageGb: number;
  cpuPercent: number;
  narrativeHeadline: string;
  narrativeBody: string;
  swapThrashingText: string;
  subsystems: {
    ide: {
      name: string;
      rss: string;
      details: string;
      threads: number;
      latency: string;
    };
    terminal: {
      name: string;
      peak: string;
      culpritText: string;
      exitCode: string;
      spikeRate: string;
      isCulprit: boolean;
    };
    containers: {
      name: string;
      rss: string;
      services: string;
      state: string;
      ioRate: string;
    };
    browser: {
      name: string;
      rss: string;
      tabCount: string;
      gpuHeap: string;
      warningText: string;
    };
  };
}

export interface ExecutionMarker extends TimelineMarker {
  passed?: boolean;
  command?: string;
  executionResultId?: string;
  exitCode?: number;
  durationMs?: number;
}

export interface DiffFile {
  file_path: string;
  unified_diff: string;
  lines_added: number;
  lines_removed: number;
}

export interface CulpritHunk {
  file_path: string;
  hunk: string;
  score: number;
  matched_tokens: string[];
}

export interface FailureDiffResponse {
  files: DiffFile[];
  failing_commit?: string;
  passing_commit?: string;
  failing_command?: string;
  exit_code?: number;
  stderr_tail?: string;
  stdout_tail?: string;
  culprits?: CulpritHunk[];
  error?: string;
}

export interface ShadowSnapshot {
  id: string;
  timestamp: string;
  shadow_commit_hash: string;
  trigger: string;
  real_git_head?: string | null;
  execution?: {
    id: string;
    command: string;
    passed: boolean;
    exit_code: number;
    timestamp: string;
  } | null;
}

export interface DiagnosisItem {
  id: string;
  process_key: string;
  cause_label: string;
  confidence: number;
  recommendation?: string;
  signal_values: Record<string, any>;
  updated_at: string;
  fix_action?: string | null;
  fix_label?: string | null;
  fix_reversible?: boolean;
}

export interface ProjectInfo {
  project_id: string;
  displayName: string;
}
