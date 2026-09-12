import React, { useState, useEffect, useRef } from 'react';
import { TimelineMarker, ThemeStyle, ScrubPointTelemetry } from '../types';
import { fetchTimeline, fetchTelemetryAtTime } from '../services/api';
import { TIMELINE_MARKERS, SCRUB_TELEMETRY_DATA } from '../data/telemetryData';

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
  // Scrub position: percentage across the 4-hour window (11:00 to 15:00 = 240 mins)
  // 13:42:10 is at (162 mins / 240 mins) = 67.5%
  const [scrubPercent, setScrubPercent] = useState<number>(67.5);
  const [timeRange, setTimeRange] = useState<'1h' | '4h' | '8h'>('4h');
  const [isReplaying, setIsReplaying] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<TimelineMarker | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const isPrecision = themeStyle === 'precision';

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const [timelineMarkers, setTimelineMarkers] = useState<TimelineMarker[]>(TIMELINE_MARKERS);
  const [currentTelemetry, setCurrentTelemetry] = useState<ScrubPointTelemetry>(
    SCRUB_TELEMETRY_DATA['13:42:10']
  );

  // Fetch timeline markers
  useEffect(() => {
    let timer: number;
    const poll = async () => {
      const res = await fetchTimeline(timeRange);
      if (res && res.markers.length > 0) {
        setTimelineMarkers(res.markers);
      }
      timer = window.setTimeout(poll, 15000);
    };
    poll();
    return () => clearTimeout(timer);
  }, [timeRange]);

  // Fetch telemetry at scrub position
  useEffect(() => {
    let timer: number;
    // Calculate approximate time based on scrubPercent (0-100) across 4 hours (240 mins)
    const poll = async () => {
      // In a real implementation we would convert the percent back to a timestamp
      // based on rangeStartIso. For the mockup we just map it to our 3 states.
      let timeKey = '13:42:10';
      if (scrubPercent < 40) timeKey = '11:30:00';
      else if (scrubPercent > 75) timeKey = '14:28:45';
      
      const res = await fetchTelemetryAtTime(timeKey);
      if (res) {
        setCurrentTelemetry(res as ScrubPointTelemetry);
      } else {
        setCurrentTelemetry(SCRUB_TELEMETRY_DATA[timeKey] || SCRUB_TELEMETRY_DATA['13:42:10']);
      }
    };
    
    timer = window.setTimeout(poll, 500); // debounce scrub
    return () => clearTimeout(timer);
  }, [scrubPercent]);

  // Jump to Last Anomaly
  const handleJumpToAnomaly = () => {
    setScrubPercent(67.5);
    showToast('Snapping scrubber to Incident #TRC-89104-e2 (13:42:10 UTC)');
  };

  // Replay animation
  const handleReplayWindow = () => {
    if (isReplaying) return;
    setIsReplaying(true);
    setScrubPercent(55); // start around 13:10
    showToast('Replaying incident telemetry sequence (13:10 -> 14:00)...');

    let current = 55;
    const interval = setInterval(() => {
      current += 1.25;
      if (current >= 75) {
        clearInterval(interval);
        setIsReplaying(false);
        setScrubPercent(67.5);
        showToast('Incident replay completed.');
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
    const csvContent =
      'timestamp,ram_usage_gb,cpu_percent,incident_id,culprit\n' +
      '11:00:00,3.8,14.2,NOMINAL,none\n' +
      '12:00:00,4.2,22.1,NOMINAL,none\n' +
      '13:00:00,6.5,45.8,WARNING,webpack\n' +
      '13:42:10,15.1,98.4,OOM_ANOMALY,cargo_test_release_8192\n' +
      '14:28:45,6.4,18.2,STABILIZED,none\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `devpulse-timeline-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exported telemetry timeline CSV.');
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
            onClick={() => showToast(`Incident bookmarked at ${currentTelemetry.timeStr}`)}
            className={`h-7 px-2.5 border font-mono text-xs text-slate-300 hover:text-white transition-colors cursor-pointer ${
              isPrecision
                ? 'bg-[#1c2026] hover:bg-[#262a31] border-[#3e484f] rounded-xs'
                : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 rounded-lg'
            }`}
          >
            Bookmark Incident
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
            <span>Export Flamegraph</span>
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
            <span>Memory Ceiling (16.0 GB)</span>
          </div>
          <div className="absolute top-8 right-4 text-[10px] font-mono text-amber-400 flex items-center gap-1">
            <span className="w-2 h-0.5 bg-amber-400 border-dashed" />
            <span>80% Baseline (12.8 GB)</span>
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
                <stop offset="0%" stopColor="#ff5252" stopOpacity="0.4" />
                <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="cpuGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#fb923c" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#fb923c" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* RAM Area Curve */}
            <path
              d="
                M 0,130
                L 80,128
                L 150,122
                L 240,118
                L 350,115
                L 450,110
                L 550,105
                L 620,95
                L 650,45
                L 675,18
                L 700,75
                L 740,110
                L 820,115
                L 920,112
                L 1000,110
                L 1000,160
                L 0,160
                Z
              "
              fill="url(#ramGradient)"
            />

            {/* RAM Stroke Curve */}
            <path
              d="
                M 0,130
                L 80,128
                L 150,122
                L 240,118
                L 350,115
                L 450,110
                L 550,105
                L 620,95
                L 650,45
                L 675,18
                L 700,75
                L 740,110
                L 820,115
                L 920,112
                L 1000,110
              "
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.5"
            />

            {/* CPU Waveform (Amber) */}
            <path
              d="
                M 0,140
                L 60,135
                L 140,120
                L 210,138
                L 310,110
                L 420,130
                L 510,95
                L 610,120
                L 655,30
                L 675,12
                L 695,45
                L 730,130
                L 820,135
                L 900,142
                L 1000,138
              "
              fill="none"
              stroke="#fb923c"
              strokeWidth="1.5"
              strokeDasharray="4 2"
            />

            {/* Peak indicator dot at 675 (67.5% = 13:42:10) */}
            <circle cx="675" cy="18" r="4" fill="#ff5252" className="animate-ping" />
            <circle cx="675" cy="18" r="4" fill="#ff5252" />
          </svg>

          {/* Time Ruler Labels at bottom of waveform */}
          <div className="absolute bottom-1 left-0 right-0 flex justify-between px-6 text-[10px] font-mono text-slate-500 pointer-events-none">
            <span>11:00</span>
            <span>11:30</span>
            <span>12:00</span>
            <span>12:30</span>
            <span>13:00</span>
            <span>13:30</span>
            <span className="text-amber-400 font-semibold">14:00 (Incident)</span>
            <span>14:30</span>
            <span>15:00</span>
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
                {scrubPercent >= 60 && scrubPercent <= 72
                  ? 'OOM Warning Event'
                  : 'Active Flow'}
              </span>
            </div>

            {/* Vertical glowing bar */}
            <div className="w-full h-full bg-[#38bdf8] shadow-[0_0_10px_#38bdf8]" />
          </div>
        </div>

        {/* 4 Categorized Horizontal Event Marker Tracks */}
        <div
          className={`flex-1 flex flex-col divide-y ${
            isPrecision
              ? 'bg-[#10141a] divide-[#3e484f]/40'
              : 'bg-[#0d1117] divide-slate-800/60'
          }`}
        >
          {/* TRACK 1: IDE / EDITOR */}
          <div className="h-11 px-3 flex items-center relative group hover:bg-[#181c22]/50 transition-colors">
            <div className="w-32 shrink-0 flex items-center gap-2 font-mono text-xs text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8]" />
              <span className="truncate">IDE / Editor</span>
            </div>
            <div className="flex-1 relative h-full flex items-center">
              {timelineMarkers.filter((m) => m.track === 'ide').map((marker) => (
                <button
                  key={marker.id}
                  onClick={() => setSelectedMarker(marker)}
                  className={`absolute px-2 py-0.5 text-[10px] font-mono border rounded transition-all cursor-pointer truncate max-w-[200px] ${
                    marker.isUnderScrubber
                      ? 'bg-[#38bdf8]/20 text-[#38bdf8] border-[#38bdf8] ring-1 ring-[#38bdf8]/50'
                      : 'bg-[#1c2026] text-slate-300 border-[#3e484f] hover:border-[#38bdf8]'
                  }`}
                  style={{ left: `${marker.percentLeft}%` }}
                  title={`${marker.timeStr} - ${marker.fullTitle}`}
                >
                  {marker.label}
                </button>
              ))}
            </div>
          </div>

          {/* TRACK 2: TERMINAL / SHELL */}
          <div className="h-11 px-3 flex items-center relative group hover:bg-[#181c22]/50 transition-colors">
            <div className="w-32 shrink-0 flex items-center gap-2 font-mono text-xs text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-[#fb923c]" />
              <span className="truncate">Terminal / Shell</span>
            </div>
            <div className="flex-1 relative h-full flex items-center">
              {timelineMarkers.filter((m) => m.track === 'terminal').map((marker) => (
                <button
                  key={marker.id}
                  onClick={() => setSelectedMarker(marker)}
                  className={`absolute px-2 py-0.5 text-[10px] font-mono border rounded transition-all cursor-pointer truncate max-w-[210px] ${
                    marker.isSpike
                      ? isPrecision
                        ? 'bg-rose-950 text-rose-200 border-rose-500 font-semibold ring-2 ring-rose-500/50'
                        : 'bg-amber-500/20 text-amber-200 border-amber-500 ring-2 ring-amber-500/40 font-semibold'
                      : 'bg-[#1c2026] text-slate-300 border-[#3e484f] hover:border-[#fb923c]'
                  }`}
                  style={{ left: `${marker.percentLeft}%` }}
                  title={`${marker.timeStr} - ${marker.fullTitle}`}
                >
                  {marker.isSpike && '⚠️ '}
                  {marker.label}
                </button>
              ))}
            </div>
          </div>

          {/* TRACK 3: GIT / CONTAINERS */}
          <div className="h-11 px-3 flex items-center relative group hover:bg-[#181c22]/50 transition-colors">
            <div className="w-32 shrink-0 flex items-center gap-2 font-mono text-xs text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
              <span className="truncate">Git / Containers</span>
            </div>
            <div className="flex-1 relative h-full flex items-center">
              {timelineMarkers.filter((m) => m.track === 'containers').map((marker) => (
                <button
                  key={marker.id}
                  onClick={() => setSelectedMarker(marker)}
                  className="absolute px-2 py-0.5 text-[10px] font-mono border rounded transition-all cursor-pointer truncate max-w-[190px] bg-[#1c2026] text-slate-300 border-[#3e484f] hover:border-[#4ade80]"
                  style={{ left: `${marker.percentLeft}%` }}
                  title={`${marker.timeStr} - ${marker.fullTitle}`}
                >
                  {marker.label}
                </button>
              ))}
            </div>
          </div>

          {/* TRACK 4: BROWSER TABS */}
          <div className="h-11 px-3 flex items-center relative group hover:bg-[#181c22]/50 transition-colors">
            <div className="w-32 shrink-0 flex items-center gap-2 font-mono text-xs text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-[#c084fc]" />
              <span className="truncate">Browser Tabs</span>
            </div>
            <div className="flex-1 relative h-full flex items-center">
              {timelineMarkers.filter((m) => m.track === 'browser').map((marker) => (
                <button
                  key={marker.id}
                  onClick={() => setSelectedMarker(marker)}
                  className={`absolute px-2 py-0.5 text-[10px] font-mono border rounded transition-all cursor-pointer truncate max-w-[220px] ${
                    marker.isUnderScrubber
                      ? 'bg-purple-950/70 text-purple-200 border-purple-400 ring-1 ring-purple-400/50'
                      : 'bg-[#1c2026] text-slate-300 border-[#3e484f] hover:border-[#c084fc]'
                  }`}
                  style={{ left: `${marker.percentLeft}%` }}
                  title={`${marker.timeStr} - ${marker.fullTitle}`}
                >
                  {marker.label}
                </button>
              ))}
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
            </div>
            <button
              onClick={() => setSelectedMarker(null)}
              className="p-1 hover:text-white cursor-pointer"
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
          {/* Header row */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/50 pb-2.5">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-semibold text-white">
                {currentTelemetry.isoTime}
              </span>
              <span
                className={`px-2 py-0.5 font-mono text-xs font-bold uppercase rounded border ${
                  currentTelemetry.anomalyBadge === 'OOM_ANOMALY'
                    ? isPrecision
                      ? 'bg-rose-950 text-rose-300 border-rose-500'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-emerald-950 text-emerald-300 border-emerald-600'
                }`}
              >
                {currentTelemetry.anomalyBadge}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onNavigateToTreemap('proc-webpack')}
                className={`px-3 py-1 text-xs font-mono font-medium border flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isPrecision
                    ? 'bg-[#262a31] hover:bg-[#31353c] border-[#3e484f] text-[#38bdf8] rounded-xs'
                    : 'bg-sky-500/15 hover:bg-sky-500/25 border-sky-500/30 text-sky-200 rounded-lg'
                }`}
              >
                <span className="material-symbols-outlined text-[13px]">search</span>
                <span>Pinpoint / Inspect in Treemap</span>
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
            <span className="material-symbols-outlined text-amber-400 mt-0.5">
              crisis_alert
            </span>
            <div className="flex flex-col gap-1 text-xs">
              <span className="font-semibold text-slate-200">
                {currentTelemetry.narrativeHeadline}
              </span>
              <p className="text-slate-400 leading-relaxed font-sans">
                {currentTelemetry.narrativeBody}
              </p>
              <span className="text-[11px] font-mono text-amber-300/90 mt-0.5">
                {currentTelemetry.swapThrashingText}
              </span>
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
                  <span className="text-slate-400 text-[11px]">IDE Subsystem</span>
                  <span className="text-sky-300 font-semibold">
                    {currentTelemetry.subsystems.ide.rss}
                  </span>
                </div>
                <div className="font-semibold text-slate-200 mt-1">
                  {currentTelemetry.subsystems.ide.name}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
                  {currentTelemetry.subsystems.ide.details}
                </p>
              </div>
              <div className="border-t border-slate-700/40 pt-1.5 mt-2 flex justify-between text-[10px] text-slate-400">
                <span>Threads: {currentTelemetry.subsystems.ide.threads}</span>
                <span>Latency: {currentTelemetry.subsystems.ide.latency}</span>
              </div>
            </div>

            {/* 2. Terminal / Exec (Culprit callout) */}
            <div
              className={`p-2.5 border flex flex-col justify-between text-xs font-mono ${
                currentTelemetry.subsystems.terminal.isCulprit
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
                  <span className="text-slate-400 text-[11px]">Terminal / Exec</span>
                  <span className="text-amber-400 font-semibold">
                    {currentTelemetry.subsystems.terminal.peak}
                  </span>
                </div>
                <div className="font-semibold text-rose-300 mt-1 truncate">
                  {currentTelemetry.subsystems.terminal.name}
                </div>
                <p className="text-[11px] text-rose-400/90 mt-0.5 font-sans">
                  {currentTelemetry.subsystems.terminal.culpritText}
                </p>
              </div>
              <div className="border-t border-slate-700/40 pt-1.5 mt-2 flex justify-between text-[10px] text-slate-400">
                <span>Exit: {currentTelemetry.subsystems.terminal.exitCode}</span>
                <span className="text-rose-400">
                  {currentTelemetry.subsystems.terminal.spikeRate}
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
                  <span className="text-slate-400 text-[11px]">Containers &amp; Git</span>
                  <span className="text-emerald-400 font-semibold">
                    {currentTelemetry.subsystems.containers.rss}
                  </span>
                </div>
                <div className="font-semibold text-slate-200 mt-1">
                  {currentTelemetry.subsystems.containers.name}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
                  {currentTelemetry.subsystems.containers.services}
                </p>
              </div>
              <div className="border-t border-slate-700/40 pt-1.5 mt-2 flex justify-between text-[10px] text-slate-400">
                <span>State: {currentTelemetry.subsystems.containers.state}</span>
                <span>I/O: {currentTelemetry.subsystems.containers.ioRate}</span>
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
                  <span className="text-slate-400 text-[11px]">Web Runtime</span>
                  <span className="text-purple-300 font-semibold">
                    {currentTelemetry.subsystems.browser.rss}
                  </span>
                </div>
                <div className="font-semibold text-slate-200 mt-1">
                  {currentTelemetry.subsystems.browser.name}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
                  {currentTelemetry.subsystems.browser.tabCount}
                </p>
              </div>
              <div className="border-t border-slate-700/40 pt-1.5 mt-2 flex justify-between text-[10px] text-slate-400">
                <span>GPU Heap: {currentTelemetry.subsystems.browser.gpuHeap}</span>
                <span className="text-amber-400">
                  {currentTelemetry.subsystems.browser.warningText}
                </span>
              </div>
            </div>
          </div>
        </section>
      </section>
    </div>
  );
};
