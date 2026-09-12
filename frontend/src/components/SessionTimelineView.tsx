import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TimelineMarker, ThemeStyle, ScrubPointTelemetry } from '../types';
import { fetchTimeline, fetchTelemetryAtTime, fetchResourceHistory } from '../services/api';

interface SessionTimelineViewProps {
  themeStyle: ThemeStyle;
  onNavigateToTreemap: (processId?: string) => void;
  onOpenBaselineCompare: () => void;
}

export const SessionTimelineView: React.FC<SessionTimelineViewProps> = ({
  themeStyle,
  onNavigateToTreemap,
  onOpenBaselineCompare,
}) => {
  // Scrub position: percentage across the time window (default to 100 = live edge)
  const [scrubPercent, setScrubPercent] = useState<number>(100);
  const [timeRange, setTimeRange] = useState<'1h' | '4h' | '8h'>('1h');
  const [isReplaying, setIsReplaying] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<TimelineMarker | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const isPrecision = themeStyle === 'precision';

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const [timelineMarkers, setTimelineMarkers] = useState<TimelineMarker[]>([]);
  const [currentTelemetry, setCurrentTelemetry] = useState<ScrubPointTelemetry | null>(null);
  const [historySeries, setHistorySeries] = useState<
    Array<{
      time: string;
      total: number;
      ide: number;
      terminal: number;
      containers: number;
      browser: number;
    }>
  >([]);

  // Compute local time at any scrub percentage
  const getScrubDate = (pct: number) => {
    const now = new Date();
    const rangeMinutes = timeRange === '1h' ? 60 : timeRange === '4h' ? 240 : 480;
    const targetMs = now.getTime() - ((100 - pct) / 100) * rangeMinutes * 60 * 1000;
    return new Date(targetMs);
  };

  const cursorTimeStr = useMemo(() => {
    return getScrubDate(scrubPercent).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, [scrubPercent, timeRange]);

  // Fetch timeline markers & resource history
  useEffect(() => {
    let timer: number;
    const poll = async () => {
      const [timelineRes, historyRes] = await Promise.all([
        fetchTimeline(timeRange),
        fetchResourceHistory(timeRange),
      ]);
      if (timelineRes) {
        setTimelineMarkers(timelineRes.markers ?? []);
      }
      if (historyRes && historyRes.series) {
        setHistorySeries(historyRes.series);
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
      const target = getScrubDate(scrubPercent);
      const timeKey = target.toISOString();

      const res = await fetchTelemetryAtTime(timeKey);
      if (res) {
        setCurrentTelemetry(res as ScrubPointTelemetry);
      }
    };

    poll(); // fetch immediately
    timer = window.setTimeout(poll, 5000); // regular refresh
    return () => clearTimeout(timer);
  }, [scrubPercent, timeRange]);

  // Dynamic SVG Waveform generation
  const maxRam = useMemo(() => {
    const vals = historySeries.map((s) => s.total || 0);
    return Math.max(16, ...vals);
  }, [historySeries]);

  const { ramAreaPath, ramLinePath, cpuLinePath, peakPoint } = useMemo(() => {
    if (historySeries.length < 2) {
      // Fallback baseline when only starting
      const baselineRam = historySeries[0]?.total || 14.2;
      const y = Math.round(145 - (baselineRam / maxRam) * 110);
      return {
        ramAreaPath: `M 0,${y} L 1000,${y} L 1000,160 L 0,160 Z`,
        ramLinePath: `M 0,${y} L 1000,${y}`,
        cpuLinePath: `M 0,140 L 1000,140`,
        peakPoint: { x: 1000, y, val: baselineRam },
      };
    }

    const n = historySeries.length;
    let maxPt = { x: 0, y: 150, val: 0 };

    const pts = historySeries.map((pt, idx) => {
      const x = Math.round((idx / (n - 1)) * 1000);
      const val = pt.total || 0;
      const y = Math.round(145 - (val / maxRam) * 120);
      if (val > maxPt.val) {
        maxPt = { x, y, val };
      }
      return { x, y };
    });

    const ramLine = `M ${pts[0].x},${pts[0].y} ` + pts.slice(1).map((p) => `L ${p.x},${p.y}`).join(' ');
    const ramArea = `${ramLine} L 1000,160 L 0,160 Z`;

    // CPU secondary curve based on terminal activity
    const cpuPts = historySeries.map((pt, idx) => {
      const x = Math.round((idx / (n - 1)) * 1000);
      const cpuVal = (pt.terminal || 0.5) * 15;
      const y = Math.max(20, Math.round(150 - Math.min(100, cpuVal) * 1.1));
      return { x, y };
    });
    const cpuLine = `M ${cpuPts[0].x},${cpuPts[0].y} ` + cpuPts.slice(1).map((p) => `L ${p.x},${p.y}`).join(' ');

    return {
      ramAreaPath: ramArea,
      ramLinePath: ramLine,
      cpuLinePath: cpuLine,
      peakPoint: maxPt,
    };
  }, [historySeries, maxRam]);

  // Dynamic Time Ruler Labels based on actual current time
  const timeLabels = useMemo(() => {
    const count = 7;
    const rangeMinutes = timeRange === '1h' ? 60 : timeRange === '4h' ? 240 : 480;
    const step = rangeMinutes / (count - 1);
    const now = new Date();
    const labels: { text: string; isEdge: boolean }[] = [];
    for (let i = 0; i < count; i++) {
      const ms = now.getTime() - (count - 1 - i) * step * 60 * 1000;
      const d = new Date(ms);
      labels.push({
        text: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isEdge: i === count - 1,
      });
    }
    return labels;
  }, [timeRange]);

  // Jump to Last Anomaly
  const handleJumpToAnomaly = () => {
    const spike = [...timelineMarkers].reverse().find((m) => m.isSpike);
    if (spike) {
      setScrubPercent(spike.percentLeft);
      setSelectedMarker(spike);
      showToast(`Jumped to anomaly at ${spike.timeStr}`);
    } else {
      const peakPct = (peakPoint.x / 1000) * 100;
      setScrubPercent(peakPct);
      showToast(`Jumped to peak RAM usage (${peakPoint.val.toFixed(1)} GB)`);
    }
  };

  // Replay animation
  const handleReplayWindow = () => {
    if (isReplaying) return;
    setIsReplaying(true);
    setScrubPercent(20);
    showToast('Replaying session telemetry from start of window...');

    let current = 20;
    const interval = setInterval(() => {
      current += 2;
      if (current >= 100) {
        clearInterval(interval);
        setIsReplaying(false);
        setScrubPercent(100);
        showToast('Session replay completed.');
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

  const handleExportCSV = () => {
    const rows = [
      'timestamp,total_ram_gb,ide_ram_gb,terminal_ram_gb,browser_ram_gb,containers_ram_gb',
    ];
    for (const pt of historySeries) {
      rows.push(
        `${pt.time},${pt.total},${pt.ide},${pt.terminal},${pt.browser},${pt.containers}`
      );
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `devpulse-timeline-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exported telemetry timeline CSV.');
  };

  // Helper to render track markers with collision prevention
  const renderTrackMarkers = (trackKey: 'ide' | 'terminal' | 'containers' | 'browser') => {
    const trackMarkers = timelineMarkers.filter((m) => m.track === trackKey);
    if (trackMarkers.length === 0) {
      return (
        <span className="text-[10px] font-mono text-slate-600 italic pl-2 select-none">
          Nominal activity · No anomalous events
        </span>
      );
    }

    // Sort by timestamp
    const sorted = [...trackMarkers].sort((a, b) => a.percentLeft - b.percentLeft);

    return sorted.map((marker, idx) => {
      const isSelected = selectedMarker?.id === marker.id;
      // Alternate vertical lane if adjacent marker is within 8%
      const prev = sorted[idx - 1];
      const isClustered = prev && Math.abs(marker.percentLeft - prev.percentLeft) < 8;
      const isRightEdge = marker.percentLeft > 70;

      return (
        <button
          key={marker.id}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedMarker(marker);
            setScrubPercent(marker.percentLeft);
          }}
          className={`absolute px-2 py-0.5 text-[10px] font-mono border rounded transition-all cursor-pointer whitespace-nowrap max-w-[170px] truncate shadow-sm ${
            isClustered ? 'translate-y-2' : '-translate-y-2'
          } ${
            isSelected
              ? 'bg-sky-950 text-sky-200 border-sky-400 ring-2 ring-sky-400/50 z-30'
              : marker.isSpike
              ? isPrecision
                ? 'bg-rose-950/90 text-rose-200 border-rose-500 font-semibold hover:border-rose-400 z-20'
                : 'bg-amber-500/25 text-amber-200 border-amber-500 font-semibold hover:border-amber-400 z-20'
              : 'bg-[#1c2026] text-slate-300 border-[#3e484f] hover:border-slate-400 z-10'
          }`}
          style={
            isRightEdge
              ? { right: `${Math.max(1, 100 - marker.percentLeft)}%` }
              : { left: `${Math.max(1, marker.percentLeft)}%` }
          }
          title={`${marker.timeStr} - ${marker.fullTitle} (${marker.details})`}
        >
          {marker.isSpike && '⚠️ '}
          {marker.label}
        </button>
      );
    });
  };

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
              Cursor: <strong className="text-slate-200">{cursorTimeStr}</strong>
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
            onClick={() => showToast(`Snapshot bookmarked at ${cursorTimeStr}`)}
            className={`h-7 px-2.5 border font-mono text-xs text-slate-300 hover:text-white transition-colors cursor-pointer ${
              isPrecision
                ? 'bg-[#1c2026] hover:bg-[#262a31] border-[#3e484f] rounded-xs'
                : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 rounded-lg'
            }`}
          >
            Bookmark Point
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

          {/* Reference lines */}
          <div className="absolute top-2 right-4 text-[10px] font-mono text-rose-400 flex items-center gap-1">
            <span className="w-2 h-0.5 bg-rose-500" />
            <span>Memory Ceiling ({maxRam.toFixed(1)} GB)</span>
          </div>
          <div className="absolute top-7 right-4 text-[10px] font-mono text-amber-400 flex items-center gap-1">
            <span className="w-2 h-0.5 bg-amber-400 border-dashed" />
            <span>80% Baseline ({(maxRam * 0.8).toFixed(1)} GB)</span>
          </div>

          <div className="absolute top-[20%] left-0 right-0 border-b border-rose-900/40 border-dashed pointer-events-none" />
          <div className="absolute top-[40%] left-0 right-0 border-b border-amber-900/30 border-dashed pointer-events-none" />
          <div className="absolute top-[75%] left-0 right-0 border-b border-slate-800/40 pointer-events-none" />

          {/* Dynamic SVG Curves for RAM and CPU */}
          <svg
            className="w-full h-full absolute inset-0 pointer-events-none"
            preserveAspectRatio="none"
            viewBox="0 0 1000 160"
          >
            <defs>
              <linearGradient id="ramGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ff5252" stopOpacity="0.4" />
                <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* RAM Area Curve */}
            <path d={ramAreaPath} fill="url(#ramGradient)" />

            {/* RAM Stroke Curve */}
            <path
              d={ramLinePath}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.5"
            />

            {/* CPU Waveform (Amber dashed) */}
            <path
              d={cpuLinePath}
              fill="none"
              stroke="#fb923c"
              strokeWidth="1.5"
              strokeDasharray="4 2"
            />

            {/* Peak indicator dot */}
            {peakPoint.val > 0 && (
              <>
                <circle cx={peakPoint.x} cy={peakPoint.y} r="4" fill="#ff5252" className="animate-ping" />
                <circle cx={peakPoint.x} cy={peakPoint.y} r="4" fill="#ff5252" />
              </>
            )}
          </svg>

          {/* Time Ruler Labels at bottom of waveform */}
          <div className="absolute bottom-1 left-0 right-0 flex justify-between px-6 text-[10px] font-mono text-slate-500 pointer-events-none">
            {timeLabels.map((lbl, idx) => (
              <span
                key={idx}
                className={lbl.isEdge ? 'text-sky-400 font-semibold' : ''}
              >
                {lbl.text}
              </span>
            ))}
          </div>

          {/* Playhead Scrubber Line + Draggable Badge */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-[#38bdf8] pointer-events-none z-30"
            style={{ left: `${scrubPercent}%` }}
          >
            {/* Top Playhead Handle Badge */}
            <div
              className={`absolute top-2 -left-20 px-2 py-0.5 font-mono text-[10px] whitespace-nowrap shadow-lg flex items-center gap-1.5 pointer-events-auto cursor-grab ${
                isPrecision
                  ? 'bg-[#181c22] text-[#38bdf8] border border-[#38bdf8]/60 rounded-xs'
                  : 'bg-slate-900 text-sky-200 border border-sky-500 rounded-md'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] animate-pulse" />
              <span>
                {cursorTimeStr} · {scrubPercent >= 97 ? 'Live Edge' : (currentTelemetry?.anomalyTitle || 'Telemetry Point')}
              </span>
            </div>

            {/* Vertical glowing bar */}
            <div className="w-full h-full bg-[#38bdf8] shadow-[0_0_10px_#38bdf8]" />
          </div>
        </div>

        {/* 4 Categorized Horizontal Event Marker Tracks */}
        <div
          className={`flex flex-col divide-y ${
            isPrecision
              ? 'bg-[#10141a] divide-[#3e484f]/40'
              : 'bg-[#0d1117] divide-slate-800/60'
          }`}
        >
          {/* TRACK 1: IDE / EDITOR */}
          <div className="h-12 px-3 flex items-center relative group hover:bg-[#181c22]/50 transition-colors overflow-hidden">
            <div className="w-32 shrink-0 flex items-center gap-2 font-mono text-xs text-slate-300 z-20 bg-[#10141a]/90 pr-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8]" />
              <span className="truncate font-medium">IDE / Editor</span>
            </div>
            <div className="flex-1 relative h-full flex items-center">
              {renderTrackMarkers('ide')}
            </div>
          </div>

          {/* TRACK 2: TERMINAL / SHELL */}
          <div className="h-12 px-3 flex items-center relative group hover:bg-[#181c22]/50 transition-colors overflow-hidden">
            <div className="w-32 shrink-0 flex items-center gap-2 font-mono text-xs text-slate-300 z-20 bg-[#10141a]/90 pr-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#fb923c]" />
              <span className="truncate font-medium">Terminal / CLI</span>
            </div>
            <div className="flex-1 relative h-full flex items-center">
              {renderTrackMarkers('terminal')}
            </div>
          </div>

          {/* TRACK 3: GIT / CONTAINERS */}
          <div className="h-12 px-3 flex items-center relative group hover:bg-[#181c22]/50 transition-colors overflow-hidden">
            <div className="w-32 shrink-0 flex items-center gap-2 font-mono text-xs text-slate-300 z-20 bg-[#10141a]/90 pr-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
              <span className="truncate font-medium">Git / Containers</span>
            </div>
            <div className="flex-1 relative h-full flex items-center">
              {renderTrackMarkers('containers')}
            </div>
          </div>

          {/* TRACK 4: BROWSER TABS */}
          <div className="h-12 px-3 flex items-center relative group hover:bg-[#181c22]/50 transition-colors overflow-hidden">
            <div className="w-32 shrink-0 flex items-center gap-2 font-mono text-xs text-slate-300 z-20 bg-[#10141a]/90 pr-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#c084fc]" />
              <span className="truncate font-medium">Browser Tabs</span>
            </div>
            <div className="flex-1 relative h-full flex items-center">
              {renderTrackMarkers('browser')}
            </div>
          </div>
        </div>

        {/* Selected Marker Details Drawer (if clicked) */}
        {selectedMarker && (
          <div className="p-3 bg-[#181c22] border-t border-slate-700/60 flex items-center justify-between text-xs font-mono animate-fadeIn">
            <div className="flex items-center gap-2 min-w-0">
              <span className="px-2 py-0.5 bg-sky-950 text-sky-300 border border-sky-600 rounded font-semibold">
                {selectedMarker.timeStr}
              </span>
              <span className="font-semibold text-white truncate">
                {selectedMarker.fullTitle}
              </span>
              <span className="text-slate-400 truncate hidden sm:inline">
                {selectedMarker.details}
              </span>
            </div>
            <button
              onClick={() => setSelectedMarker(null)}
              className="p-1 hover:text-white cursor-pointer text-slate-400"
              title="Close marker details"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        )}

        {/* Bottom Contextual Detail Inspection Panel */}
        <section
          className={`border-t p-4 flex flex-col gap-3 shrink-0 ${
            isPrecision
              ? 'bg-[#181c22] border-[#3e484f]'
              : 'bg-[#0f141a] border-slate-800/80'
          }`}
        >
          {!currentTelemetry ? (
            <div className="flex items-center justify-center h-28 text-xs font-mono text-slate-400 gap-2">
              <span className="material-symbols-outlined text-sky-400 animate-spin text-lg">progress_activity</span>
              <span>Loading telemetry snapshot for {cursorTimeStr}...</span>
            </div>
          ) : (
            <>
              {/* Header row */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/50 pb-2.5">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-semibold text-white">
                    {currentTelemetry.timeStr || cursorTimeStr}
                  </span>
                  <span
                    className={`px-2 py-0.5 font-mono text-xs font-bold uppercase rounded border ${
                      currentTelemetry.anomalyTitle?.toLowerCase().includes('high')
                        ? isPrecision
                          ? 'bg-rose-950 text-rose-300 border-rose-500'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-emerald-950/80 text-emerald-300 border-emerald-600'
                    }`}
                  >
                    {currentTelemetry.anomalyBadge || 'Nominal Flow'}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    RAM: <strong className="text-slate-200">{currentTelemetry.ramUsageGb} GB</strong> · CPU: <strong className="text-slate-200">{currentTelemetry.cpuPercent}%</strong>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onNavigateToTreemap()}
                    className={`px-3 py-1 text-xs font-mono font-medium border flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isPrecision
                        ? 'bg-[#262a31] hover:bg-[#31353c] border-[#3e484f] text-[#38bdf8] rounded-xs'
                        : 'bg-sky-500/15 hover:bg-sky-500/25 border-sky-500/30 text-sky-200 rounded-lg'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[13px]">search</span>
                    <span>Pinpoint in Treemap</span>
                  </button>

                  <button
                    onClick={handleReplayWindow}
                    disabled={isReplaying}
                    className={`px-3 py-1 text-xs font-mono border flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isReplaying
                        ? 'opacity-50 cursor-not-allowed bg-slate-800'
                        : isPrecision
                        ? 'bg-[#1c2026] hover:bg-[#262a31] border-[#3e484f] text-[#dfe2eb] rounded-xs'
                        : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 rounded-lg'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[13px]">
                      {isReplaying ? 'sync' : 'replay'}
                    </span>
                    <span>{isReplaying ? 'Replaying...' : 'Replay Window'}</span>
                  </button>

                  <button
                    onClick={onOpenBaselineCompare}
                    className={`px-3 py-1 text-xs font-mono border flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isPrecision
                        ? 'bg-[#1c2026] hover:bg-[#262a31] border-[#3e484f] text-[#dfe2eb] rounded-xs'
                        : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 rounded-lg'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[13px]">compare</span>
                    <span>Compare Baseline</span>
                  </button>
                </div>
              </div>

              {/* Incident narrative */}
              <div className="flex items-start gap-3 p-3 bg-[#10141a] border border-slate-800/80 rounded-lg">
                <span className="material-symbols-outlined text-sky-400 mt-0.5 text-base">
                  analytics
                </span>
                <div className="flex flex-col gap-1 text-xs">
                  <span className="font-semibold text-slate-200">
                    {currentTelemetry.narrativeHeadline}
                  </span>
                  <p className="text-slate-400 leading-relaxed font-sans">
                    {currentTelemetry.narrativeBody}
                  </p>
                  {currentTelemetry.swapThrashingText && (
                    <span className="text-[11px] font-mono text-amber-300/90 mt-0.5">
                      {currentTelemetry.swapThrashingText}
                    </span>
                  )}
                </div>
              </div>

              {/* Active Tools Matrix at scrub time (4 Subsystem status cards) */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
                {/* 1. IDE Subsystem */}
                <div
                  className={`p-2.5 border flex flex-col justify-between text-xs font-mono ${
                    isPrecision
                      ? 'bg-[#1c2026] border-[#3e484f] rounded-xs'
                      : 'bg-slate-900/80 border-slate-800 rounded-lg'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[11px] flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8]" /> IDE Processes
                      </span>
                      <span className="text-sky-300 font-semibold">
                        {currentTelemetry.subsystems?.ide?.rss || '0 MB'}
                      </span>
                    </div>
                    <div className="font-semibold text-slate-200 mt-1 truncate">
                      {currentTelemetry.subsystems?.ide?.name || 'IDE'}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
                      {currentTelemetry.subsystems?.ide?.details || 'Active monitoring'}
                    </p>
                  </div>
                  <div className="border-t border-slate-700/40 pt-1.5 mt-2 flex justify-between text-[10px] text-slate-400">
                    <span>Threads: {currentTelemetry.subsystems?.ide?.threads || 0}</span>
                    <span>Latency: {currentTelemetry.subsystems?.ide?.latency || 'Normal'}</span>
                  </div>
                </div>

                {/* 2. Terminal / Exec */}
                <div
                  className={`p-2.5 border flex flex-col justify-between text-xs font-mono ${
                    currentTelemetry.subsystems?.terminal?.isCulprit
                      ? isPrecision
                        ? 'bg-rose-950/25 border-rose-500/70 rounded-xs'
                        : 'bg-amber-950/20 border-amber-500/60 rounded-lg'
                      : isPrecision
                      ? 'bg-[#1c2026] border-[#3e484f] rounded-xs'
                      : 'bg-slate-900/80 border-slate-800 rounded-lg'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[11px] flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#fb923c]" /> Terminal / Shell
                      </span>
                      <span className="text-amber-400 font-semibold">
                        {currentTelemetry.subsystems?.terminal?.peak || '0 MB'}
                      </span>
                    </div>
                    <div className="font-semibold text-amber-300 mt-1 truncate">
                      {currentTelemetry.subsystems?.terminal?.name || 'Terminal'}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
                      {currentTelemetry.subsystems?.terminal?.culpritText || 'Active sessions'}
                    </p>
                  </div>
                  <div className="border-t border-slate-700/40 pt-1.5 mt-2 flex justify-between text-[10px] text-slate-400">
                    <span>Exit: {currentTelemetry.subsystems?.terminal?.exitCode || '0'}</span>
                    <span className="text-amber-400">
                      {currentTelemetry.subsystems?.terminal?.spikeRate || 'Nominal'}
                    </span>
                  </div>
                </div>

                {/* 3. Containers & Git */}
                <div
                  className={`p-2.5 border flex flex-col justify-between text-xs font-mono ${
                    isPrecision
                      ? 'bg-[#1c2026] border-[#3e484f] rounded-xs'
                      : 'bg-slate-900/80 border-slate-800 rounded-lg'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[11px] flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" /> Containers &amp; Git
                      </span>
                      <span className="text-emerald-400 font-semibold">
                        {currentTelemetry.subsystems?.containers?.rss || '0 MB'}
                      </span>
                    </div>
                    <div className="font-semibold text-slate-200 mt-1 truncate">
                      {currentTelemetry.subsystems?.containers?.name || 'Containers'}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
                      {currentTelemetry.subsystems?.containers?.services || 'Daemon state'}
                    </p>
                  </div>
                  <div className="border-t border-slate-700/40 pt-1.5 mt-2 flex justify-between text-[10px] text-slate-400">
                    <span>State: {currentTelemetry.subsystems?.containers?.state || 'Idle'}</span>
                    <span>I/O: {currentTelemetry.subsystems?.containers?.ioRate || 'Nominal'}</span>
                  </div>
                </div>

                {/* 4. Web Runtime */}
                <div
                  className={`p-2.5 border flex flex-col justify-between text-xs font-mono ${
                    isPrecision
                      ? 'bg-[#1c2026] border-[#3e484f] rounded-xs'
                      : 'bg-slate-900/80 border-slate-800 rounded-lg'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-[11px] flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#c084fc]" /> Browser Instances
                      </span>
                      <span className="text-purple-300 font-semibold">
                        {currentTelemetry.subsystems?.browser?.rss || '0 MB'}
                      </span>
                    </div>
                    <div className="font-semibold text-slate-200 mt-1 truncate">
                      {currentTelemetry.subsystems?.browser?.name || 'Browser'}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
                      {currentTelemetry.subsystems?.browser?.tabCount || 'Tabs active'}
                    </p>
                  </div>
                  <div className="border-t border-slate-700/40 pt-1.5 mt-2 flex justify-between text-[10px] text-slate-400">
                    <span>GPU Heap: {currentTelemetry.subsystems?.browser?.gpuHeap || 'Shared'}</span>
                    <span className="text-slate-400">
                      {currentTelemetry.subsystems?.browser?.warningText || 'Nominal'}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </section>
    </div>
  );
};
