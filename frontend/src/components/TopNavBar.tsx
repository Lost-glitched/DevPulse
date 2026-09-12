import React, { useState, useEffect } from 'react';
import { ViewMode, ThemeStyle } from '../types';

interface TopNavBarProps {
  currentView: ViewMode;
  themeStyle: ThemeStyle;
  onThemeStyleChange: (style: ThemeStyle) => void;
  isObserverPaused: boolean;
  onToggleObserver: () => void;
  onOpenSnapshotDump: () => void;
  systemMemoryUsedGb: number;
  systemMemoryTotalGb: number;
}

export const TopNavBar: React.FC<TopNavBarProps> = ({
  currentView,
  themeStyle,
  onThemeStyleChange,
  isObserverPaused,
  onToggleObserver,
  onOpenSnapshotDump,
  systemMemoryUsedGb,
  systemMemoryTotalGb,
}) => {
  const [seconds, setSeconds] = useState(6138); // 01h 42m 18s

  useEffect(() => {
    if (isObserverPaused) return;
    const interval = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isObserverPaused]);

  const formatElapsed = (totalSec: number) => {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  };

  const isPrecision = themeStyle === 'precision';

  return (
    <header
      className={`h-11 border-b flex justify-between items-center w-full px-4 shrink-0 select-none z-30 transition-colors duration-150 ${
        isPrecision
          ? 'bg-[#181c22] border-[#3e484f] text-[#dfe2eb]'
          : 'bg-[#0f141a]/95 backdrop-blur border-slate-800/80 text-slate-200'
      }`}
    >
      {/* Left cluster: Brand & Breadcrumb telemetry */}
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`w-2 h-2 rounded-full ${
              isObserverPaused ? 'bg-amber-400' : 'bg-[#38bdf8] animate-pulse'
            }`}
          />
          <span className="text-sm font-semibold tracking-tight text-white">DevPulse</span>
          <span className="text-slate-500 font-mono text-xs">/</span>
          <span className="text-[#8ed5ff] font-mono text-xs truncate">mono-repo / core-engine</span>
        </div>

        <div className="hidden lg:flex items-center gap-3 text-slate-400 font-mono text-xs border-l border-slate-700/60 pl-4">
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 14 }}>
              schedule
            </span>
            <span>Session: {formatElapsed(seconds)}</span>
          </span>
          <span className="text-slate-600">·</span>
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 14 }}>
              memory
            </span>
            <span>
              Memory: <strong className="text-slate-200 font-semibold">{(systemMemoryUsedGb ?? 0).toFixed(2)} GB</strong> / {(systemMemoryTotalGb ?? 16).toFixed(1)} GB
            </span>
          </span>
        </div>
      </div>

      {/* Right cluster: Style toggle & Actions */}
      <div className="flex items-center gap-2">
        {/* Style mode selector */}
        <div
          className={`flex items-center p-0.5 border rounded-lg text-xs font-mono mr-2 ${
            isPrecision
              ? 'bg-[#10141a] border-[#3e484f]'
              : 'bg-slate-900 border-slate-800'
          }`}
          title="Switch design theme between Precision Telemetry & Calm Telemetry"
        >
          <button
            onClick={() => onThemeStyleChange('precision')}
            className={`px-2 py-0.5 rounded transition-colors text-[11px] ${
              isPrecision
                ? 'bg-[#262a31] text-[#38bdf8] font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Precision
          </button>
          <button
            onClick={() => onThemeStyleChange('calm')}
            className={`px-2 py-0.5 rounded transition-colors text-[11px] ${
              !isPrecision
                ? 'bg-slate-800 text-sky-300 font-semibold shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Calm
          </button>
        </div>

        {/* Snapshot Dump button */}
        <button
          onClick={onOpenSnapshotDump}
          className={`h-7 px-2.5 border font-mono text-xs flex items-center gap-1.5 transition-colors duration-100 cursor-pointer ${
            isPrecision
              ? 'bg-[#1c2026] hover:bg-[#262a31] border-[#3e484f] text-[#dfe2eb] rounded-xs'
              : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 text-slate-300 rounded-lg'
          }`}
        >
          <span className="material-symbols-outlined text-[#8ed5ff]" style={{ fontSize: 14 }}>
            tune
          </span>
          <span>Snapshot Dump</span>
        </button>

        {/* Pause Observer button */}
        <button
          onClick={onToggleObserver}
          className={`h-7 px-2.5 border font-mono text-xs flex items-center gap-1.5 transition-colors duration-100 cursor-pointer ${
            isObserverPaused
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              : isPrecision
              ? 'bg-[#38bdf8]/10 hover:bg-[#38bdf8]/20 text-[#38bdf8] border-[#38bdf8]/30 rounded-xs'
              : 'bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border-sky-500/30 rounded-lg'
          }`}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 14 }}
          >
            {isObserverPaused ? 'play_arrow' : 'pause'}
          </span>
          <span>{isObserverPaused ? 'Resume Observer' : 'Pause Observer'}</span>
        </button>
      </div>
    </header>
  );
};
