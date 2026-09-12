import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TimelineMarker, ExecutionMarker, ThemeStyle, ScrubPointTelemetry, FailureDiffResponse } from '../types';
import { fetchTimeline, fetchTelemetryAtTime, fetchFailureDiff, fetchResourceHistory } from '../services/api';

interface SessionTimelineViewProps {
  themeStyle: ThemeStyle;
  onNavigateToTreemap: (processId?: string) => void;
  onOpenBaselineCompare: (diff?: FailureDiffResponse) => void;
  systemMemoryTotalGb?: number;
}

const INITIAL_LIVE_TELEMETRY: ScrubPointTelemetry = {
  timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  isoTime: new Date().toISOString(),
  traceId: '#TRC-live-session',
  anomalyTitle: 'Active Telemetry Monitoring',
  anomalyBadge: 'Nominal · Live Telemetry',
  ramUsageGb: 0,
  cpuPercent: 0,
  narrativeHeadline: 'Monitoring live system telemetry and active processes...',
  narrativeBody: 'System memory and CPU within nominal operational envelope.',
  swapThrashingText: 'Swap idle. No page thrashing.',
  subsystems: {
    ide: { name: 'IDE / Editor', rss: '0 MB', details: 'Active', threads: 0, latency: 'N/A' },
    terminal: { name: 'Terminal / Shell', peak: '0 MB', culpritText: 'Nominal', exitCode: '0', spikeRate: 'Stable', isCulprit: false },
    containers: { name: 'Docker / Services', rss: '0 MB', services: '0 containers', state: 'Idle', ioRate: 'N/A' },
    browser: { name: 'Browser Subsystem', rss: '0 MB', tabCount: '0 tabs', gpuHeap: 'N/A', warningText: 'Nominal' },
  },
};

export const SessionTimelineView: React.FC<SessionTimelineViewProps> = ({
  themeStyle,
  onNavigateToTreemap,
  onOpenBaselineCompare,
  systemMemoryTotalGb = 16.0,
}) => {
  const [scrubPercent, setScrubPercent] = useState<number>(100);
  const [timeRange, setTimeRange] = useState<'1h' | '4h' | '8h'>('4h');
  const [rangeStartIso, setRangeStartIso] = useState<string>('');
  const [rangeEndIso, setRangeEndIso] = useState<string>('');
  const [historySeries, setHistorySeries] = useState<Array<{ time: string; total: number; cpu?: number }>>([]);

  const [isReplaying, setIsReplaying] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<TimelineMarker | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const [timelineMarkers, setTimelineMarkers] = useState<TimelineMarker[]>([]);
  const [currentTelemetry, setCurrentTelemetry] = useState<ScrubPointTelemetry>(INITIAL_LIVE_TELEMETRY);

  const isPrecision = themeStyle === 'precision';

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleInspectFailure = async (marker: ExecutionMarker) => {
    if (!marker.executionResultId) {
      onOpenBaselineCompare();
      return;
    }
    showToast(`Loading failure diff for: ${marker.command || marker.label}...`);
    try {
      const diffData = await fetchFailureDiff(marker.executionResultId);
      if (diffData) {
        onOpenBaselineCompare(diffData);
      } else {
        onOpenBaselineCompare();
      }
    } catch {
      onOpenBaselineCompare();
    }
  };

  // Fetch timeline markers and range boundaries
  useEffect(() => {
    let timer: number;
    const poll = async () => {
      const res = await fetchTimeline(timeRange);
      if (res) {
        if (res.markers) setTimelineMarkers(res.markers);
        if (res.rangeStartIso) setRangeStartIso(res.rangeStartIso);
        if (res.rangeEndIso) setRangeEndIso(res.rangeEndIso);
      }
      timer = window.setTimeout(poll, 15000);
    };
    poll();
    return () => clearTimeout(timer);
  }, [timeRange]);

  // Fetch resource history series for waveform
  useEffect(() => {
    let timer: number;
    const poll = async () => {
      const res = await fetchResourceHistory(timeRange);
      if (res && res.series && res.series.length > 0) {
        setHistorySeries(res.series);
      }
      timer = window.setTimeout(poll, 10000);
    };
    poll();
    return () => clearTimeout(timer);
  }, [timeRange]);

  // Fetch telemetry at scrub position
  useEffect(() => {
    let timer: number;
    const poll = async () => {
      const startMs = rangeStartIso ? new Date(rangeStartIso).getTime() : Date.now() - (timeRange === '1h' ? 1 : timeRange === '4h' ? 4 : 8) * 3600000;
      const endMs = rangeEndIso ? new Date(rangeEndIso).getTime() : Date.now();
      const targetMs = startMs + (scrubPercent / 100) * (endMs - startMs);
      const targetIso = new Date(targetMs).toISOString();

      const res = await fetchTelemetryAtTime(targetIso);
      if (res) {
        setCurrentTelemetry(res as ScrubPointTelemetry);
      }
    };

    timer = window.setTimeout(poll, 250); // debounce scrub
    return () => clearTimeout(timer);
  }, [scrubPercent, rangeStartIso, rangeEndIso, timeRange]);

  // Jump to Last Anomaly Spike
  const handleJumpToAnomaly = () => {
    const spike = timelineMarkers.find((m) => m.isSpike);
    if (spike) {
      setScrubPercent(spike.percentLeft);
      showToast(`Snapping scrubber to anomaly: ${spike.label} (${spike.timeStr})`);
    } else {
      showToast('No critical anomaly spikes detected in active range.');
    }
  };

  // Replay animation
  const handleReplayWindow = () => {
    if (isReplaying) return;
    setIsReplaying(true);
    setScrubPercent(10);
    showToast('Replaying session telemetry sequence (0% -> 100%)...');

    let current = 10;
    const interval = setInterval(() => {
      current += 2.0;
      if (current >= 100) {
        clearInterval(interval);
        setIsReplaying(false);
        setScrubPercent(100);
        showToast('Session telemetry replay completed.');
      } else {
        setScrubPercent(current);
      }
    }, 100);
  };

  // Timeline scrubber interaction
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
    setScrubPercent(pct);
  };

  // Dynamic CSV Export
  const handleExportCSV = () => {
    const header = 'timestamp,ram_usage_gb,cpu_percent\n';
    let rows = '';
    if (historySeries.length > 0) {
      rows = historySeries.map((s) => `${s.time},${s.total},${s.cpu ?? 0}`).join('\n');
    } else {
      rows = `${currentTelemetry.isoTime},${currentTelemetry.ramUsageGb},${currentTelemetry.cpuPercent}`;
    }
    const csvContent = header + rows;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `devpulse-telemetry-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exported telemetry timeline CSV.');
  };

  // Dynamic SVG Waveform Calculations
  const { ramAreaPath, ramStrokePath, cpuStrokePath, scrubberDotY } = useMemo(() => {
    const ceiling = Math.max(systemMemoryTotalGb, 1.0);
    const pts = historySeries.length > 0 ? historySeries : [
      { time: '', total: currentTelemetry.ramUsageGb, cpu: currentTelemetry.cpuPercent },
      { time: '', total: currentTelemetry.ramUsageGb, cpu: currentTelemetry.cpuPercent }
    ];

    const n = pts.length;
    const ramCoords: Array<[number, number]> = [];
    const cpuCoords: Array<[number, number]> = [];

    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 500 : (i / (n - 1)) * 1000;
      const ramVal = pts[i].total || 0;
      const cpuVal = pts[i].cpu ?? 15;

      const yRam = Math.max(15, Math.min(150, 150 - (ramVal / ceiling) * 135));
      const yCpu = Math.max(15, Math.min(150, 150 - (cpuVal / 100) * 135));

      ramCoords.push([Math.round(x * 10) / 10, Math.round(yRam * 10) / 10]);
      cpuCoords.push([Math.round(x * 10) / 10, Math.round(yCpu * 10) / 10]);
    }

    // Build SVG paths
    const ramStroke = ramCoords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c[0]},${c[1]}`).join(' ');
    const ramArea = `${ramStroke} L 1000,160 L 0,160 Z`;
    const cpuStroke = cpuCoords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c[0]},${c[1]}`).join(' ');

    // Estimate scrubber Y position on ram curve
    const scrubX = (scrubPercent / 100) * 1000;
    let dotY = 130;
    for (let i = 0; i < ramCoords.length - 1; i++) {
      if (scrubX >= ramCoords[i][0] && scrubX <= ramCoords[i + 1][0]) {
        const segRatio = (scrubX - ramCoords[i][0]) / (ramCoords[i + 1][0] - ramCoords[i][0] || 1);
        dotY = ramCoords[i][1] + segRatio * (ramCoords[i + 1][1] - ramCoords[i][1]);
        break;
      }
    }

    return {
      ramAreaPath: ramArea,
      ramStrokePath: ramStroke,
      cpuStrokePath: cpuStroke,
      scrubberDotY: Math.round(dotY * 10) / 10,
    };
  }, [historySeries, systemMemoryTotalGb, currentTelemetry, scrubPercent]);

  // Dynamic bottom time ruler labels (7 points)
  const timeRulerLabels = useMemo(() => {
    const rangeHours = timeRange === '1h' ? 1 : timeRange === '4h' ? 4 : 8;
    const startMs = rangeStartIso ? new Date(rangeStartIso).getTime() : Date.now() - rangeHours * 3600000;
    const endMs = rangeEndIso ? new Date(rangeEndIso).getTime() : Date.now();
    const labels: string[] = [];
    const count = 7;
    for (let i = 0; i < count; i++) {
      const t = new Date(startMs + (i / (count - 1)) * (endMs - startMs));
      labels.push(t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }
    return labels;
  }, [rangeStartIso, rangeEndIso, timeRange]);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#0a0e14] overflow-hidden select-none">
      {/* Sub-Toolbar: Timeline Controls & Incident Nav */}
      <section
        className={`h-10 px-4 border-b flex items-center justify-between shrink-0 gap-3 ${
          isPrecision
            ? 'bg-[#181c22] border-[#3e484f]'
            : 'bg-[#0d1218] border-slate-800/80'
        }`}
      >
        {/* Left: Range Selectors */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-500 uppercase mr-1">Range:</span>
          <div
            className={`flex items-center p-0.5 border text-xs font-mono ${
              isPrecision
                ? 'bg-[#1c2026] border-[#3e484f] rounded-xs'
                : 'bg-slate-900 border-slate-800 rounded-lg'
            }`}
          >
            <button
              onClick={() => setTimeRange('1h')}
              className={`px-2 py-0.5 rounded transition-colors ${
                timeRange === '1h'
                  ? 'bg-[#262a31] text-sky-300 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Last 1 Hour
            </button>
            <button
              onClick={() => setTimeRange('4h')}
              className={`px-2 py-0.5 rounded transition-colors ${
                timeRange === '4h'
                  ? 'bg-[#262a31] text-sky-300 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Last 4 Hours
            </button>
            <button
              onClick={() => setTimeRange('8h')}
              className={`px-2 py-0.5 rounded transition-colors ${
                timeRange === '8h'
                  ? 'bg-[#262a31] text-sky-300 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Full Session (8h)
            </button>
          </div>

          <div className="hidden lg:flex items-center gap-2 text-xs font-mono text-slate-400 border-l border-slate-700/60 pl-3">
            <span className="material-symbols-outlined text-[14px]">access_time</span>
            <span>
              Cursor: <strong className="text-slate-200">{currentTelemetry.timeStr}</strong>
            </span>
          </div>
        </div>

        {/* Right: Quick Jumps & Tools */}
        <div className="flex items-center gap-2">
          {toastMessage && (
            <span className="text-xs font-mono text-emerald-400 mr-2 animate-pulse truncate max-w-xs">
              {toastMessage}
            </span>
          )}

          <button
            onClick={handleJumpToAnomaly}
            className={`h-7 px-2.5 border font-mono text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
              isPrecision
                ? 'bg-rose-950/40 hover:bg-rose-950/70 border-rose-500 text-rose-300 rounded-xs'
                : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-300 rounded-lg'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">bolt</span>
            <span>Jump to Last Anomaly</span>
          </button>

          <button
            onClick={() => showToast(`Snapshot point bookmarked at ${currentTelemetry.timeStr}`)}
            className={`h-7 px-2.5 border font-mono text-xs text-slate-300 hover:text-white transition-colors cursor-pointer ${
              isPrecision
                ? 'bg-[#1c2026] hover:bg-[#262a31] border-[#3e484f] rounded-xs'
                : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 rounded-lg'
            }`}
          >
            Bookmark Timestamp
          </button>

          <button
            onClick={handleExportCSV}
            className={`h-7 px-2.5 border font-mono text-xs text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1 ${
              isPrecision
                ? 'bg-[#1c2026] hover:bg-[#262a31] border-[#3e484f] rounded-xs'
                : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 rounded-lg'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">download</span>
            <span>Export CSV</span>
          </button>
        </div>
      </section>

      {/* Main Interactive Waveform & Event Tracks Area */}
      <section className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        {/* Top Waveform Display (RAM + CPU synchronized) */}
        <div
          ref={timelineRef}
          onClick={handleTimelineClick}
          className={`relative h-44 border-b shrink-0 cursor-crosshair overflow-hidden select-none ${
            isPrecision
              ? 'bg-[#10141a] border-[#3e484f]'
              : 'bg-[#0b0f14] border-slate-800/80'
          }`}
        >
          {/* Background Grid & Threshold Guidemarks */}
          <div className="absolute inset-0 bg-grid-telemetry-precision opacity-40 pointer-events-none" />

          {/* Dynamic Reference lines */}
          <div className="absolute top-2 right-4 text-[10px] font-mono text-rose-400 flex items-center gap-1">
            <span className="w-2 h-0.5 bg-rose-500" />
            <span>Memory Ceiling ({systemMemoryTotalGb.toFixed(1)} GB)</span>
          </div>
          <div className="absolute top-8 right-4 text-[10px] font-mono text-amber-400 flex items-center gap-1">
            <span className="w-2 h-0.5 bg-amber-400 border-dashed" />
            <span>80% Baseline ({(systemMemoryTotalGb * 0.8).toFixed(1)} GB)</span>
          </div>

          <div className="absolute top-[20%] left-0 right-0 border-b border-rose-900/40 border-dashed pointer-events-none" />
          <div className="absolute top-[40%] left-0 right-0 border-b border-amber-900/30 border-dashed pointer-events-none" />
          <div className="absolute top-[75%] left-0 right-0 border-b border-slate-800/40 pointer-events-none" />

          {/* SVG Curves for RAM and CPU */}
          <svg
            className="w-full h-full absolute inset-0 pointer-events-none"
            preserveAspectRatio="none"
            viewBox="0 0 1000 160"
          >
            <defs>
              <linearGradient id="ramGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
                <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Dynamic RAM Area Curve */}
            <path d={ramAreaPath} fill="url(#ramGradient)" />

            {/* Dynamic RAM Stroke Curve */}
            <path d={ramStrokePath} fill="none" stroke="#38bdf8" strokeWidth="2.5" />

            {/* Dynamic CPU Waveform (Amber dashed) */}
            <path
              d={cpuStrokePath}
              fill="none"
              stroke="#fb923c"
              strokeWidth="1.5"
              strokeDasharray="4 2"
            />

            {/* Live Scrubber Curve Dot */}
            <circle
              cx={(scrubPercent / 100) * 1000}
              cy={scrubberDotY}
              r="4.5"
              fill="#38bdf8"
              className="animate-pulse"
            />
          </svg>

          {/* Dynamic Time Ruler Labels at bottom of waveform */}
          <div className="absolute bottom-1 left-0 right-0 flex justify-between px-6 text-[10px] font-mono text-slate-500 pointer-events-none">
            {timeRulerLabels.map((lbl, idx) => (
              <span key={idx} className={idx === timeRulerLabels.length - 1 ? 'text-sky-400 font-semibold' : ''}>
                {lbl}
              </span>
            ))}
          </div>

          {/* Playhead Scrubber Line + Draggable Badge */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-[#38bdf8] pointer-events-none z-20"
            style={{ left: `${scrubPercent}%` }}
          >
            {/* Top Playhead Handle Badge */}
            <div
              className={`absolute top-2 -left-20 px-2 py-0.5 font-mono text-[10px] whitespace-nowrap shadow-lg flex items-center gap-1 pointer-events-auto cursor-grab ${
                isPrecision
                  ? 'bg-rose-950 text-rose-200 border border-rose-500 rounded-xs'
                  : 'bg-slate-900 text-sky-200 border border-sky-500 rounded-md'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              <span>
                {currentTelemetry.timeStr} ·{' '}
                {currentTelemetry.ramUsageGb > 0
                  ? `${currentTelemetry.ramUsageGb.toFixed(1)} GB RAM`
                  : 'Live Telemetry'}
              </span>
            </div>

            {/* Vertical glowing bar */}
            <div className="w-full h-full bg-[#38bdf8] shadow-[0_0_10px_#38bdf8]" />
          </div>
        </div>

        {/* 4 Categorized Horizontal Event Marker Tracks */}
        <div
          className={`flex flex-col divide-y shrink-0 ${
            isPrecision
              ? 'bg-[#10141a] divide-[#3e484f]/40'
              : 'bg-[#0d1117] divide-slate-800/60'
          }`}
        >
          {/* TRACK 1: IDE / EDITOR */}
          <div className="h-11 px-3 flex items-center relative group hover:bg-[#181c22]/50 transition-colors">
            <div className="w-28 shrink-0 flex items-center gap-2 font-mono text-xs text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8]" />
              <span className="truncate">IDE / Editor</span>
            </div>
            <div className="flex-1 relative h-full flex items-center overflow-hidden">
              {timelineMarkers.filter((m) => m.track === 'ide').length === 0 ? (
                <span className="text-[11px] font-mono text-slate-600 italic">No IDE events logged in this window</span>
              ) : (
                timelineMarkers.filter((m) => m.track === 'ide').map((marker) => (
                  <button
                    key={marker.id}
                    onClick={() => setSelectedMarker(marker)}
                    className={`absolute px-2 py-0.5 text-[10px] font-mono border rounded transition-all cursor-pointer truncate ${
                      marker.isUnderScrubber
                        ? 'bg-[#38bdf8]/20 text-[#38bdf8] border-[#38bdf8] ring-1 ring-[#38bdf8]/50'
                        : 'bg-[#1c2026] text-slate-300 border-[#3e484f] hover:border-[#38bdf8]'
                    }`}
                    style={{ left: `${marker.percentLeft}%`, maxWidth: `${Math.min(180, Math.max(60, (100 - marker.percentLeft) * 1.8))}px` }}
                    title={`${marker.timeStr} - ${marker.fullTitle}`}
                  >
                    {marker.label}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* TRACK 2: TERMINAL / SHELL */}
          <div className="h-11 px-3 flex items-center relative group hover:bg-[#181c22]/50 transition-colors">
            <div className="w-28 shrink-0 flex items-center gap-2 font-mono text-xs text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-[#fb923c]" />
              <span className="truncate">Terminal</span>
            </div>
            <div className="flex-1 relative h-full flex items-center overflow-hidden">
              {timelineMarkers.filter((m) => m.track === 'terminal').length === 0 ? (
                <span className="text-[11px] font-mono text-slate-600 italic">No terminal command events logged</span>
              ) : (
                timelineMarkers.filter((m) => m.track === 'terminal').map((marker) => {
                  const execMarker = marker as ExecutionMarker;
                  const isExec = Boolean(execMarker.executionResultId);
                  const isFailure = isExec && execMarker.passed === false;

                  return (
                    <button
                      key={marker.id}
                      onClick={() => {
                        setSelectedMarker(marker);
                        if (isFailure) {
                          handleInspectFailure(execMarker);
                        }
                      }}
                      className={`absolute px-2 py-0.5 text-[10px] font-mono border rounded transition-all cursor-pointer truncate flex items-center gap-1 ${
                        isFailure
                          ? 'bg-rose-950 text-rose-200 border-rose-500 font-semibold ring-2 ring-rose-500/50'
                          : isExec
                          ? 'bg-emerald-950/60 text-emerald-200 border-emerald-600/60 hover:border-emerald-400'
                          : marker.isSpike
                          ? isPrecision
                            ? 'bg-rose-950 text-rose-200 border-rose-500 font-semibold ring-2 ring-rose-500/50'
                            : 'bg-amber-500/20 text-amber-200 border-amber-500 ring-2 ring-amber-500/40 font-semibold'
                          : 'bg-[#1c2026] text-slate-300 border-[#3e484f] hover:border-[#fb923c]'
                      }`}
                      style={{ left: `${marker.percentLeft}%`, maxWidth: `${Math.min(180, Math.max(60, (100 - marker.percentLeft) * 1.8))}px` }}
                      title={
                        isFailure
                          ? `FAILED: ${execMarker.command || marker.label} — Click to inspect failure diff`
                          : `${marker.timeStr} - ${marker.fullTitle}`
                      }
                    >
                      {isExec ? (
                        <span className={execMarker.passed ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                          {execMarker.passed ? '✓' : '✗'}
                        </span>
                      ) : marker.isSpike ? (
                        '⚠️ '
                      ) : null}
                      <span className="truncate">{marker.label}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* TRACK 3: GIT / CONTAINERS */}
          <div className="h-11 px-3 flex items-center relative group hover:bg-[#181c22]/50 transition-colors">
            <div className="w-28 shrink-0 flex items-center gap-2 font-mono text-xs text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
              <span className="truncate">Git / Docker</span>
            </div>
            <div className="flex-1 relative h-full flex items-center overflow-hidden">
              {timelineMarkers.filter((m) => m.track === 'containers').length === 0 ? (
                <span className="text-[11px] font-mono text-slate-600 italic">No git or container lifecycle events</span>
              ) : (
                timelineMarkers.filter((m) => m.track === 'containers').map((marker) => (
                  <button
                    key={marker.id}
                    onClick={() => setSelectedMarker(marker)}
                    className="absolute px-2 py-0.5 text-[10px] font-mono border rounded transition-all cursor-pointer truncate bg-[#1c2026] text-slate-300 border-[#3e484f] hover:border-[#4ade80]"
                    style={{ left: `${marker.percentLeft}%`, maxWidth: `${Math.min(180, Math.max(60, (100 - marker.percentLeft) * 1.8))}px` }}
                    title={`${marker.timeStr} - ${marker.fullTitle}`}
                  >
                    {marker.label}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* TRACK 4: BROWSER TABS */}
          <div className="h-11 px-3 flex items-center relative group hover:bg-[#181c22]/50 transition-colors">
            <div className="w-28 shrink-0 flex items-center gap-2 font-mono text-xs text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-[#c084fc]" />
              <span className="truncate">Browser</span>
            </div>
            <div className="flex-1 relative h-full flex items-center overflow-hidden">
              {timelineMarkers.filter((m) => m.track === 'browser').length === 0 ? (
                <span className="text-[11px] font-mono text-slate-600 italic">No browser tab lifecycle events</span>
              ) : (
                timelineMarkers.filter((m) => m.track === 'browser').map((marker) => (
                  <button
                    key={marker.id}
                    onClick={() => setSelectedMarker(marker)}
                    className={`absolute px-2 py-0.5 text-[10px] font-mono border rounded transition-all cursor-pointer truncate ${
                      marker.isUnderScrubber
                        ? 'bg-purple-950/70 text-purple-200 border-purple-400 ring-1 ring-purple-400/50'
                        : 'bg-[#1c2026] text-slate-300 border-[#3e484f] hover:border-[#c084fc]'
                    }`}
                    style={{ left: `${marker.percentLeft}%`, maxWidth: `${Math.min(180, Math.max(60, (100 - marker.percentLeft) * 1.8))}px` }}
                    title={`${marker.timeStr} - ${marker.fullTitle}`}
                  >
                    {marker.label}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Selected Marker Details Drawer (if clicked) */}
        {selectedMarker && (
          <div className="p-3 bg-[#181c22] border-t border-slate-700/60 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2 min-w-0">
              <span className="px-1.5 py-0.2 bg-sky-950 text-sky-300 border border-sky-700/50 rounded">
                {selectedMarker.timeStr}
              </span>
              <span className="font-semibold text-white truncate">
                {selectedMarker.fullTitle}
              </span>
              <span className="text-slate-400 truncate hidden sm:inline">
                {selectedMarker.details}
              </span>
              {(selectedMarker as ExecutionMarker).executionResultId &&
                (selectedMarker as ExecutionMarker).passed === false && (
                  <button
                    onClick={() => handleInspectFailure(selectedMarker as ExecutionMarker)}
                    className="ml-2 px-2.5 py-0.5 bg-rose-900/70 hover:bg-rose-800 border border-rose-500 rounded text-rose-200 cursor-pointer flex items-center gap-1 text-[11px] font-mono whitespace-nowrap shadow transition-colors"
                  >
                    <span className="material-symbols-outlined text-[13px]">troubleshoot</span>
                    <span>Inspect Failure Diff & Culprits</span>
                  </button>
                )}
            </div>
            <button
              onClick={() => setSelectedMarker(null)}
              className="p-1 hover:text-white cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        )}

        {/* Bottom Contextual Detail Panel — Compact */}
        <section
          className={`border-t p-3 flex flex-col gap-2 shrink-0 ${
            isPrecision
              ? 'bg-[#181c22] border-[#3e484f]'
              : 'bg-[#0f141a] border-slate-800/80'
          }`}
        >
          {/* Header row: Timestamp + Badge + Actions */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-xs font-semibold text-white whitespace-nowrap">
                {currentTelemetry.isoTime ? new Date(currentTelemetry.isoTime).toLocaleTimeString() : currentTelemetry.timeStr}
              </span>
              <span
                className={`px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase rounded border whitespace-nowrap ${
                  currentTelemetry.anomalyBadge && currentTelemetry.anomalyBadge.includes('High')
                    ? isPrecision
                      ? 'bg-rose-950 text-rose-300 border-rose-500'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-emerald-950 text-emerald-300 border-emerald-600'
                }`}
              >
                {currentTelemetry.anomalyBadge}
              </span>
              <span className="text-[11px] text-slate-400 font-mono truncate hidden md:inline">
                {currentTelemetry.narrativeHeadline}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => onNavigateToTreemap()}
                className={`px-2.5 py-1 text-[11px] font-mono font-medium border flex items-center gap-1 transition-colors cursor-pointer ${
                  isPrecision
                    ? 'bg-[#262a31] hover:bg-[#31353c] border-[#3e484f] text-[#38bdf8] rounded-xs'
                    : 'bg-sky-500/15 hover:bg-sky-500/25 border-sky-500/30 text-sky-200 rounded-lg'
                }`}
              >
                <span className="material-symbols-outlined text-[12px]">search</span>
                <span>Inspect in Treemap</span>
              </button>

              <button
                onClick={handleReplayWindow}
                disabled={isReplaying}
                className={`px-2.5 py-1 text-[11px] font-mono border flex items-center gap-1 transition-colors cursor-pointer ${
                  isReplaying
                    ? 'opacity-50 cursor-not-allowed bg-slate-800'
                    : isPrecision
                    ? 'bg-[#1c2026] hover:bg-[#262a31] border-[#3e484f] text-[#dfe2eb] rounded-xs'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 rounded-lg'
                }`}
              >
                <span className="material-symbols-outlined text-[12px]">
                  {isReplaying ? 'sync' : 'replay'}
                </span>
                <span>{isReplaying ? 'Replaying...' : 'Replay'}</span>
              </button>

              <button
                onClick={() => onOpenBaselineCompare()}
                className={`px-2.5 py-1 text-[11px] font-mono border flex items-center gap-1 transition-colors cursor-pointer ${
                  isPrecision
                    ? 'bg-[#1c2026] hover:bg-[#262a31] border-[#3e484f] text-[#dfe2eb] rounded-xs'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 rounded-lg'
                }`}
              >
                <span className="material-symbols-outlined text-[12px]">compare</span>
                <span>Baseline</span>
              </button>
            </div>
          </div>

          {/* Compact narrative + swap info */}
          <div className="flex items-center gap-2 px-2 py-1.5 bg-[#10141a] border border-slate-800/60 rounded text-[11px]">
            <span className="material-symbols-outlined text-amber-400 text-sm shrink-0">crisis_alert</span>
            <p className="text-slate-400 font-sans truncate">
              {currentTelemetry.narrativeBody}
            </p>
            <span className="font-mono text-amber-300/80 whitespace-nowrap shrink-0 hidden lg:inline">
              {currentTelemetry.swapThrashingText}
            </span>
          </div>

          {/* Compact Subsystem Status Row */}
          <div className="flex items-stretch gap-2 overflow-x-auto">
            {/* IDE */}
            <div className={`flex-1 min-w-0 px-2.5 py-1.5 border flex items-center justify-between text-[11px] font-mono ${
              isPrecision ? 'bg-[#1c2026] border-[#3e484f] rounded-xs' : 'bg-slate-900/80 border-slate-800 rounded-lg'
            }`}>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] shrink-0" />
                <span className="text-slate-300 truncate">{currentTelemetry.subsystems.ide.name}</span>
              </div>
              <span className="text-sky-300 font-semibold shrink-0 ml-2">{currentTelemetry.subsystems.ide.rss}</span>
            </div>

            {/* Terminal */}
            <div className={`flex-1 min-w-0 px-2.5 py-1.5 border flex items-center justify-between text-[11px] font-mono ${
              currentTelemetry.subsystems.terminal.isCulprit
                ? isPrecision ? 'bg-rose-950/25 border-rose-500/70 rounded-xs' : 'bg-amber-950/20 border-amber-500/60 rounded-lg'
                : isPrecision ? 'bg-[#1c2026] border-[#3e484f] rounded-xs' : 'bg-slate-900/80 border-slate-800 rounded-lg'
            }`}>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#fb923c] shrink-0" />
                <span className="text-rose-300 truncate">{currentTelemetry.subsystems.terminal.name}</span>
              </div>
              <span className="text-amber-400 font-semibold shrink-0 ml-2">{currentTelemetry.subsystems.terminal.peak}</span>
            </div>

            {/* Containers */}
            <div className={`flex-1 min-w-0 px-2.5 py-1.5 border flex items-center justify-between text-[11px] font-mono ${
              isPrecision ? 'bg-[#1c2026] border-[#3e484f] rounded-xs' : 'bg-slate-900/80 border-slate-800 rounded-lg'
            }`}>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] shrink-0" />
                <span className="text-slate-300 truncate">{currentTelemetry.subsystems.containers.name}</span>
              </div>
              <span className="text-emerald-400 font-semibold shrink-0 ml-2">{currentTelemetry.subsystems.containers.rss}</span>
            </div>

            {/* Browser */}
            <div className={`flex-1 min-w-0 px-2.5 py-1.5 border flex items-center justify-between text-[11px] font-mono ${
              isPrecision ? 'bg-[#1c2026] border-[#3e484f] rounded-xs' : 'bg-slate-900/80 border-slate-800 rounded-lg'
            }`}>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#c084fc] shrink-0" />
                <span className="text-slate-300 truncate">{currentTelemetry.subsystems.browser.name}</span>
              </div>
              <span className="text-purple-300 font-semibold shrink-0 ml-2">{currentTelemetry.subsystems.browser.rss}</span>
            </div>
          </div>
        </section>
      </section>
    </div>
  );
};
