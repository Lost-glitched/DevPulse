import React, { useState, useEffect } from 'react';
import { ViewMode, ThemeStyle } from '../types';

interface SideNavProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  themeStyle: ThemeStyle;
  activeTabsCount: number;
}

export const SideNav: React.FC<SideNavProps> = ({
  currentView,
  onViewChange,
  themeStyle,
  activeTabsCount,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);

  useEffect(() => {
    let timer: any;
    if (isRecording) {
      timer = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } else {
      setRecSeconds(0);
    }
    return () => clearInterval(timer);
  }, [isRecording]);

  const formatRecTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const isPrecision = themeStyle === 'precision';

  return (
    <aside
      aria-label="DevPulse Application Navigation"
      className={`w-60 h-screen flex flex-col shrink-0 select-none border-r transition-colors duration-150 ${
        isPrecision
          ? 'bg-[#10141a] border-[#3e484f]'
          : 'bg-[#0e1218] border-slate-800/80'
      }`}
    >
      {/* Brand Section */}
      <div
        className={`h-11 flex items-center gap-2.5 px-3 border-b shrink-0 ${
          isPrecision
            ? 'bg-[#181c22] border-[#3e484f]'
            : 'bg-[#0e1218] border-slate-800/80'
        }`}
      >
        <div
          className={`w-6 h-6 border flex items-center justify-center shrink-0 ${
            isPrecision
              ? 'bg-[#262a31] border-[#3e484f] text-[#38bdf8] rounded-xs'
              : 'bg-sky-500/10 border-sky-500/20 text-sky-400 rounded-md'
          }`}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            terminal
          </span>
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 leading-none">
            <span className="text-sm font-semibold text-slate-100 tracking-tight">DevPulse</span>
            <span
              className={`text-[9px] font-mono px-1 py-0.2 rounded ${
                isPrecision
                  ? 'bg-[#262a31] text-slate-400 border border-[#3e484f]'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              v2.4
            </span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
            mono-repo / core-engine
          </span>
        </div>
      </div>

      {/* Main Container */}
      <div className="h-full flex flex-col justify-between p-3">
        <div className="flex flex-col gap-3">
          {/* Record Session Button */}
          <button
            onClick={() => setIsRecording(!isRecording)}
            className={`w-full py-1.5 px-2.5 text-xs font-mono flex items-center justify-center gap-2 border transition-all cursor-pointer ${
              isRecording
                ? 'bg-rose-950/50 border-rose-500/60 text-rose-300 animate-pulse'
                : isPrecision
                ? 'bg-[#262a31] hover:bg-[#31353c] text-[#dfe2eb] border-[#3e484f] rounded-xs'
                : 'bg-sky-500/15 hover:bg-sky-500/25 border-sky-500/30 text-sky-200 rounded-lg'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isRecording ? 'bg-rose-500 animate-ping' : 'bg-emerald-400'
              }`}
            />
            <span>
              {isRecording ? `Recording... ${formatRecTime(recSeconds)}` : 'Record Session'}
            </span>
          </button>

          {/* Navigation Links */}
          <nav aria-label="Workspaces" className="flex flex-col gap-1">
            {/* Item 1: Resource Treemap */}
            <button
              onClick={() => onViewChange('treemap')}
              className={`h-8 px-2.5 flex items-center gap-2 text-xs font-medium transition-colors cursor-pointer w-full text-left ${
                isPrecision ? 'rounded-xs' : 'rounded-lg'
              } ${
                currentView === 'treemap'
                  ? isPrecision
                    ? 'bg-[#262a31] text-[#38bdf8] border-l-2 border-[#38bdf8]'
                    : 'bg-sky-500/10 text-sky-300 border border-sky-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#1c2026] border-l-2 border-transparent'
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                account_tree
              </span>
              <span>Resource Treemap</span>
            </button>

            {/* Item 2: Tab Classifier */}
            <button
              onClick={() => onViewChange('tabs')}
              className={`h-8 px-2.5 flex items-center gap-2 text-xs font-medium transition-colors cursor-pointer w-full text-left ${
                isPrecision ? 'rounded-xs' : 'rounded-lg'
              } ${
                currentView === 'tabs'
                  ? isPrecision
                    ? 'bg-[#262a31] text-[#38bdf8] border-l-2 border-[#38bdf8]'
                    : 'bg-sky-500/10 text-sky-300 border border-sky-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#1c2026] border-l-2 border-transparent'
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                category
              </span>
              <span>Tab Classifier</span>
              <span
                className={`ml-auto text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                  isPrecision
                    ? 'bg-[#31353c] text-[#38bdf8] border-[#3e484f]'
                    : 'bg-sky-950/80 text-sky-300 border-sky-500/30'
                }`}
              >
                {activeTabsCount}
              </span>
            </button>

            {/* Item 3: Session Timeline */}
            <button
              onClick={() => onViewChange('timeline')}
              className={`h-8 px-2.5 flex items-center gap-2 text-xs font-medium transition-colors cursor-pointer w-full text-left ${
                isPrecision ? 'rounded-xs' : 'rounded-lg'
              } ${
                currentView === 'timeline'
                  ? isPrecision
                    ? 'bg-[#262a31] text-[#38bdf8] border-l-2 border-[#38bdf8]'
                    : 'bg-sky-500/10 text-sky-300 border border-sky-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#1c2026] border-l-2 border-transparent'
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                timeline
              </span>
              <span>Session Timeline</span>
            </button>
          </nav>

          <div className={`my-1 border-t ${isPrecision ? 'border-[#3e484f]' : 'border-slate-800/80'}`} />

          {/* Subsystems List */}
          <div className="flex flex-col gap-1.5">
            <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider px-1">
              Subsystems
            </div>
            <div className="flex flex-col gap-0.5 text-xs font-mono">
              <div
                onClick={() => onViewChange('treemap')}
                className="flex items-center justify-between px-2 py-1 hover:bg-[#1c2026] rounded cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-1.5 text-slate-300 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8]" /> IDE Processes
                </span>
                <span className="text-slate-500 text-[11px]">4 Active</span>
              </div>
              <div
                onClick={() => onViewChange('treemap')}
                className="flex items-center justify-between px-2 py-1 hover:bg-[#1c2026] rounded cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-1.5 text-slate-300 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#fb923c]" /> Terminals / CLI
                </span>
                <span className="text-slate-500 text-[11px]">2 Active</span>
              </div>
              <div
                onClick={() => onViewChange('treemap')}
                className="flex items-center justify-between px-2 py-1 hover:bg-[#1c2026] rounded cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-1.5 text-slate-300 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" /> Docker &amp; Git
                </span>
                <span className="text-slate-500 text-[11px]">Up (6)</span>
              </div>
              <div
                onClick={() => onViewChange('tabs')}
                className="flex items-center justify-between px-2 py-1 hover:bg-[#1c2026] rounded cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-1.5 text-slate-300 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#c084fc]" /> Browser Instances
                </span>
                <span className="text-slate-500 text-[11px]">42 Tabs</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Status Footer */}
        <div
          className={`pt-2 border-t flex flex-col gap-1 text-[10px] font-mono ${
            isPrecision ? 'border-[#3e484f] text-slate-400' : 'border-slate-800/80 text-slate-400'
          }`}
        >
          <div className="flex items-center gap-1.5 px-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
            <span className="truncate">DevPulse Daemon: 0.8% CPU · 42MB</span>
          </div>
          <div className="flex items-center justify-between px-1 text-slate-500 text-[9px]">
            <span>v2.14.8-telemetry</span>
            <span className="flex items-center gap-1 text-emerald-400/80">
              <span className="w-1 h-1 bg-emerald-400 rounded-full" /> Synced
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
