import React, { useState } from 'react';
import { ProcessNode, SubsystemType, ThemeStyle } from '../types';

interface ResourceTreemapViewProps {
  processes: ProcessNode[];
  selectedProcessId: string;
  onSelectProcess: (id: string) => void;
  onIsolateProcess: (id: string) => void;
  onRestartProcess: (id: string) => void;
  onKillProcess: (id: string) => void;
  themeStyle: ThemeStyle;
}

export const ResourceTreemapView: React.FC<ResourceTreemapViewProps> = ({
  processes,
  selectedProcessId,
  onSelectProcess,
  onIsolateProcess,
  onRestartProcess,
  onKillProcess,
  themeStyle,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [onlyCauseFilter, setOnlyCauseFilter] = useState<boolean>(true);
  const [metricMode, setMetricMode] = useState<'ram' | 'cpu'>('ram');
  const [sortDesc, setSortDesc] = useState<boolean>(true);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const isPrecision = themeStyle === 'precision';

  const selectedProcess =
    processes.find((p) => p.id === selectedProcessId) || processes[8]; // default Webpack

  const handleActionClick = (action: 'isolate' | 'restart' | 'kill') => {
    if (!selectedProcess) return;
    if (action === 'isolate') {
      onIsolateProcess(selectedProcess.id);
      setActionNotice(`Process PID ${selectedProcess.pid} isolated into sandbox cgroup.`);
    } else if (action === 'restart') {
      onRestartProcess(selectedProcess.id);
      setActionNotice(`Worker PID ${selectedProcess.pid} dispatched SIGTERM. New PID spawned.`);
    } else if (action === 'kill') {
      onKillProcess(selectedProcess.id);
      setActionNotice(`SIGKILL sent to PID ${selectedProcess.pid}. Reclaimed ${selectedProcess.ramDisplay}.`);
    }
    setTimeout(() => setActionNotice(null), 3500);
  };

  // Group processes by subsystem
  const containersList = processes.filter((p) => p.subsystem === 'containers');
  const ideList = processes.filter((p) => p.subsystem === 'ide');
  const terminalList = processes.filter((p) => p.subsystem === 'terminal');
  const browserList = processes.filter((p) => p.subsystem === 'browser');

  const matchesCategory = (subsystem: SubsystemType) => {
    if (activeCategory === 'all') return true;
    if (activeCategory === 'ide' && subsystem === 'ide') return true;
    if (activeCategory === 'terminal' && subsystem === 'terminal') return true;
    if (activeCategory === 'containers' && subsystem === 'containers') return true;
    if (activeCategory === 'browser' && subsystem === 'browser') return true;
    return false;
  };

  const isDimmed = (proc: ProcessNode) => {
    if (activeCategory !== 'all' && !matchesCategory(proc.subsystem)) return true;
    if (onlyCauseFilter && !proc.isCause && selectedProcessId !== proc.id) return false; // subtle
    return false;
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#0a0e14] overflow-hidden select-none">
      {/* Sub-Toolbar: Treemap Controls & Breadcrumbs */}
      <div
        className={`h-10 px-4 border-b flex items-center justify-between shrink-0 gap-2 ${
          isPrecision
            ? 'bg-[#181c22] border-[#3e484f]'
            : 'bg-[#0d1218] border-slate-800/80'
        }`}
      >
        {/* Breadcrumb Hierarchy + Depth Indicator */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setActiveCategory('all')}
            className={`flex items-center gap-1 px-2 py-0.5 border text-xs font-mono transition-colors cursor-pointer ${
              isPrecision
                ? 'bg-[#1c2026] hover:bg-[#262a31] border-[#3e484f] text-[#dfe2eb] rounded-xs'
                : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 text-slate-300 rounded-md'
            }`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
              arrow_back
            </span>
            <span>Back</span>
          </button>
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-slate-400">
            <span className="hover:text-slate-200 cursor-pointer">Root</span>
            <span className="text-slate-600">/</span>
            <span className="hover:text-slate-200 cursor-pointer">System Hierarchy</span>
            <span className="text-slate-600">/</span>
            <span className="text-sky-300 font-medium">Workspaces</span>
          </div>
          <span
            className={`px-1.5 py-0.2 text-[10px] font-mono border ${
              isPrecision
                ? 'bg-[#31353c] text-[#38bdf8] border-[#3e484f] rounded-xs'
                : 'bg-slate-800/80 text-sky-300 border-slate-700/60 rounded-full'
            }`}
          >
            DEPTH: L2
          </span>
        </div>

        {/* Middle: Category Filters */}
        <div className="flex items-center gap-1 font-mono text-xs">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-2 py-0.5 border transition-colors ${
              isPrecision ? 'rounded-xs' : 'rounded-lg'
            } ${
              activeCategory === 'all'
                ? isPrecision
                  ? 'bg-[#31353c] text-white border-[#87929a]'
                  : 'bg-slate-800 text-slate-100 border-slate-700'
                : 'bg-[#1c2026] text-slate-400 border-transparent hover:border-[#3e484f]'
            }`}
          >
            ALL (17)
          </button>
          <button
            onClick={() => setActiveCategory('ide')}
            className={`px-2 py-0.5 border flex items-center gap-1 transition-colors ${
              isPrecision ? 'rounded-xs' : 'rounded-lg'
            } ${
              activeCategory === 'ide'
                ? 'bg-[#38bdf8]/20 text-[#38bdf8] border-[#38bdf8]'
                : 'bg-[#1c2026] text-slate-400 border-transparent hover:border-[#38bdf8]/50'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8]" />
            <span>IDE</span>
          </button>
          <button
            onClick={() => setActiveCategory('terminal')}
            className={`px-2 py-0.5 border flex items-center gap-1 transition-colors ${
              isPrecision ? 'rounded-xs' : 'rounded-lg'
            } ${
              activeCategory === 'terminal'
                ? 'bg-[#fb923c]/20 text-[#fb923c] border-[#fb923c]'
                : 'bg-[#1c2026] text-slate-400 border-transparent hover:border-[#fb923c]/50'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#fb923c]" />
            <span>Terminal</span>
          </button>
          <button
            onClick={() => setActiveCategory('containers')}
            className={`px-2 py-0.5 border flex items-center gap-1 transition-colors ${
              isPrecision ? 'rounded-xs' : 'rounded-lg'
            } ${
              activeCategory === 'containers'
                ? 'bg-[#4ade80]/20 text-[#4ade80] border-[#4ade80]'
                : 'bg-[#1c2026] text-slate-400 border-transparent hover:border-[#4ade80]/50'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
            <span>Docker / Git</span>
          </button>
          <button
            onClick={() => setActiveCategory('browser')}
            className={`px-2 py-0.5 border flex items-center gap-1 transition-colors ${
              isPrecision ? 'rounded-xs' : 'rounded-lg'
            } ${
              activeCategory === 'browser'
                ? 'bg-[#c084fc]/20 text-[#c084fc] border-[#c084fc]'
                : 'bg-[#1c2026] text-slate-400 border-transparent hover:border-[#c084fc]/50'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#c084fc]" />
            <span>Browser</span>
          </button>
        </div>

        {/* Right: Toggle Controls & Metric Switch */}
        <div className="flex items-center gap-2">
          {/* Cause / High Usage toggle */}
          <button
            onClick={() => setOnlyCauseFilter(!onlyCauseFilter)}
            className={`flex items-center gap-1.5 px-2 py-0.5 border text-xs font-mono transition-all cursor-pointer ${
              onlyCauseFilter
                ? isPrecision
                  ? 'bg-rose-950/40 border-rose-500 text-rose-300 rounded-xs font-semibold'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-300 rounded-lg'
                : 'bg-[#1c2026] border-slate-700 text-slate-400'
            }`}
          >
            <span className="material-symbols-outlined text-xs">
              {isPrecision ? 'warning' : 'info'}
            </span>
            <span>
              {isPrecision
                ? `Flagged as Cause: ${onlyCauseFilter ? 'ACTIVE' : 'OFF'}`
                : `High usage: 3 tools`}
            </span>
          </button>

          {/* Metric switcher: RAM vs CPU */}
          <div
            className={`flex items-center p-0.5 border text-xs font-mono ${
              isPrecision
                ? 'bg-[#1c2026] border-[#3e484f] rounded-xs'
                : 'bg-slate-900 border-slate-700 rounded-lg'
            }`}
          >
            <button
              onClick={() => setMetricMode('ram')}
              className={`px-2 py-0.2 rounded transition-colors ${
                metricMode === 'ram'
                  ? 'bg-[#38bdf8] text-[#00354a] font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              RAM (GB)
            </button>
            <button
              onClick={() => setMetricMode('cpu')}
              className={`px-2 py-0.2 rounded transition-colors ${
                metricMode === 'cpu'
                  ? 'bg-[#38bdf8] text-[#00354a] font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              CPU (%)
            </button>
          </div>

          <button
            onClick={() => setSortDesc(!sortDesc)}
            className={`flex items-center gap-1 px-1.5 py-0.5 border text-slate-400 hover:text-slate-200 text-xs font-mono cursor-pointer ${
              isPrecision
                ? 'bg-[#1c2026] border-[#3e484f] rounded-xs'
                : 'bg-slate-800/60 border-slate-700 rounded-lg'
            }`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
              sort
            </span>
            <span>{sortDesc ? 'DESC' : 'ASC'}</span>
          </button>
        </div>
      </div>

      {/* Main Treemap Canvas Grid */}
      <main
        className={`flex-1 p-2 overflow-hidden flex flex-col ${
          isPrecision ? 'bg-grid-telemetry-precision' : 'bg-grid-telemetry-calm'
        }`}
      >
        <div className="w-full h-full grid grid-cols-12 grid-rows-12 gap-1.5">
          {/* ================= CATEGORY 1: DOCKER / CONTAINERS (Cols 1-7, Rows 1-7) ================= */}
          <div
            className={`col-span-7 row-span-7 flex flex-col p-1.5 relative overflow-hidden transition-all ${
              isPrecision
                ? 'bg-[#4ade80]/5 border border-[#4ade80]/40 rounded-xs'
                : 'bg-emerald-950/15 border border-emerald-500/20 rounded-xl'
            } ${matchesCategory('containers') ? 'opacity-100' : 'opacity-25'}`}
          >
            <div className="flex items-center justify-between pb-1 mb-1 border-b border-[#4ade80]/20 text-[11px] font-mono text-[#4ade80]">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
                <span className="font-semibold tracking-wide">
                  {isPrecision ? 'DOCKER / CONTAINERS' : 'CONTAINERS & SERVICES'}
                </span>
                <span className="text-slate-400 text-[10px]">
                  (Total: 4.14 GB · 21.2% CPU)
                </span>
              </div>
              <span className="text-[10px] text-[#4ade80]/80">4 PROCESSES</span>
            </div>

            <div className="flex-1 grid grid-cols-6 grid-rows-6 gap-1">
              {/* Docker daemon (Col 1-4, Row 1-6) */}
              {containersList[0] && (
                <div
                  onClick={() => onSelectProcess(containersList[0].id)}
                  className={`col-span-4 row-span-6 p-2.5 flex flex-col justify-between relative group cursor-pointer transition-all ${
                    isPrecision
                      ? 'bg-[#1c2026] border-2 rounded-xs'
                      : 'bg-slate-900/80 border rounded-lg'
                  } ${
                    selectedProcessId === containersList[0].id
                      ? isPrecision
                        ? 'border-[#ff5252] ring-1 ring-red-500'
                        : 'border-amber-400 ring-1 ring-amber-400/50'
                      : containersList[0].isCause
                      ? isPrecision
                        ? 'border-rose-500/70 hover:border-rose-400'
                        : 'border-amber-500/40 hover:border-amber-400'
                      : 'border-slate-700/60'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
                        <span className="text-xs font-semibold text-slate-100 truncate max-w-[200px]">
                          {containersList[0].name}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                        PID: {containersList[0].pid} · {containersList[0].details}
                      </div>
                    </div>
                    <span
                      className={`flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-mono font-bold tracking-wider rounded ${
                        isPrecision
                          ? 'bg-rose-950/80 text-rose-300 border border-rose-500'
                          : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[11px]">warning</span>
                      <span>{isPrecision ? 'CAUSE' : 'HEAVY LOAD'}</span>
                    </span>
                  </div>
                  <div className="flex items-end justify-between border-t border-slate-700/40 pt-1">
                    <div>
                      <span className="text-lg font-mono font-semibold text-sky-300">
                        {metricMode === 'ram'
                          ? containersList[0].ramDisplay
                          : `${containersList[0].cpuPercent}%`}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-emerald-400">
                      {metricMode === 'ram'
                        ? `${containersList[0].cpuPercent}% CPU`
                        : containersList[0].ramDisplay}
                    </span>
                  </div>
                </div>
              )}

              {/* PostgreSQL 16 (Col 5-6, Row 1-4) */}
              {containersList[1] && (
                <div
                  onClick={() => onSelectProcess(containersList[1].id)}
                  className={`col-span-2 row-span-4 p-2 flex flex-col justify-between cursor-pointer border transition-colors ${
                    isPrecision
                      ? 'bg-[#181c22] border-[#3e484f] rounded-xs hover:border-[#4ade80]'
                      : 'bg-slate-900/60 border-slate-800 rounded-lg hover:border-emerald-500/40'
                  } ${selectedProcessId === containersList[1].id ? 'ring-1 ring-[#4ade80]' : ''}`}
                >
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]/70" />
                      <span className="text-xs text-slate-200 truncate">
                        {containersList[1].name}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">
                      PID: {containersList[1].pid}
                    </div>
                  </div>
                  <div className="flex items-baseline justify-between border-t border-slate-700/30 pt-1">
                    <span className="text-xs font-mono text-slate-200 font-medium">
                      {containersList[1].ramDisplay}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {containersList[1].cpuPercent}%
                    </span>
                  </div>
                </div>
              )}

              {/* Redis (Col 5-6, Row 5) */}
              {containersList[2] && (
                <div
                  onClick={() => onSelectProcess(containersList[2].id)}
                  className={`col-span-2 row-span-1 px-2 py-0.5 flex items-center justify-between border cursor-pointer ${
                    isPrecision
                      ? 'bg-[#181c22] border-[#3e484f] rounded-xs hover:border-[#4ade80]'
                      : 'bg-slate-900/50 border-slate-800 rounded-md hover:border-emerald-500/40'
                  } ${selectedProcessId === containersList[2].id ? 'ring-1 ring-[#4ade80]' : ''}`}
                >
                  <span className="text-xs font-mono text-slate-300 truncate">
                    {containersList[2].name}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {containersList[2].ramDisplay}
                  </span>
                </div>
              )}

              {/* Git daemon (Col 5-6, Row 6) */}
              {containersList[3] && (
                <div
                  onClick={() => onSelectProcess(containersList[3].id)}
                  className={`col-span-2 row-span-1 px-2 py-0.5 flex items-center justify-between border cursor-pointer ${
                    isPrecision
                      ? 'bg-[#181c22] border-[#3e484f] rounded-xs hover:border-[#4ade80]'
                      : 'bg-slate-900/50 border-slate-800 rounded-md hover:border-emerald-500/40'
                  } ${selectedProcessId === containersList[3].id ? 'ring-1 ring-[#4ade80]' : ''}`}
                >
                  <span className="text-xs font-mono text-slate-300 truncate">
                    {containersList[3].name}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {containersList[3].ramDisplay}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ================= CATEGORY 2: IDE / EDITOR (Cols 8-12, Rows 1-7) ================= */}
          <div
            className={`col-span-5 row-span-7 flex flex-col p-1.5 relative overflow-hidden transition-all ${
              isPrecision
                ? 'bg-[#38bdf8]/5 border border-[#38bdf8]/40 rounded-xs'
                : 'bg-sky-950/15 border border-sky-500/20 rounded-xl'
            } ${matchesCategory('ide') ? 'opacity-100' : 'opacity-25'}`}
          >
            <div className="flex items-center justify-between pb-1 mb-1 border-b border-[#38bdf8]/20 text-[11px] font-mono text-[#38bdf8]">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8]" />
                <span className="font-semibold tracking-wide">
                  {isPrecision ? 'IDE / EDITOR' : 'IDE & CODE EDITING'}
                </span>
                <span className="text-slate-400 text-[10px]">
                  (Total: 3.76 GB · 19.4% CPU)
                </span>
              </div>
              <span className="text-[10px] text-[#38bdf8]/80">4 PROCESSES</span>
            </div>

            <div className="flex-1 grid grid-cols-6 grid-rows-6 gap-1">
              {/* VS Code Main (Col 1-6, Row 1-3) */}
              {ideList[0] && (
                <div
                  onClick={() => onSelectProcess(ideList[0].id)}
                  className={`col-span-6 row-span-3 p-2.5 flex flex-col justify-between cursor-pointer border transition-colors ${
                    isPrecision
                      ? 'bg-[#1c2026] border-[#3e484f] rounded-xs hover:border-[#38bdf8]'
                      : 'bg-slate-900/80 border-slate-800 rounded-lg hover:border-sky-400/50'
                  } ${selectedProcessId === ideList[0].id ? 'ring-1 ring-[#38bdf8]' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8]" />
                        <span className="text-xs font-semibold text-slate-100">
                          {ideList[0].name}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                        PID: {ideList[0].pid} · {ideList[0].details}
                      </div>
                    </div>
                    <span className="text-xs font-mono text-sky-300 font-medium">
                      {ideList[0].cpuPercent}% CPU
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between border-t border-slate-700/30 pt-1">
                    <span className="text-base font-mono font-semibold text-[#8ed5ff]">
                      {ideList[0].ramDisplay}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Threads: {ideList[0].threads}
                    </span>
                  </div>
                </div>
              )}

              {/* Rust Analyzer (Col 1-3, Row 4-6) */}
              {ideList[1] && (
                <div
                  onClick={() => onSelectProcess(ideList[1].id)}
                  className={`col-span-3 row-span-3 p-2 flex flex-col justify-between cursor-pointer border transition-colors ${
                    isPrecision
                      ? 'bg-[#181c22] border-[#3e484f] rounded-xs hover:border-[#38bdf8]'
                      : 'bg-slate-900/60 border-slate-800 rounded-lg hover:border-sky-400/40'
                  } ${selectedProcessId === ideList[1].id ? 'ring-1 ring-[#38bdf8]' : ''}`}
                >
                  <div>
                    <span className="text-xs font-medium text-slate-200 block truncate">
                      {ideList[1].name}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      PID: {ideList[1].pid}
                    </span>
                  </div>
                  <div className="border-t border-slate-700/30 pt-1">
                    <div className="text-xs font-mono text-slate-200">
                      {ideList[1].ramDisplay}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">
                      {ideList[1].cpuPercent}% CPU
                    </div>
                  </div>
                </div>
              )}

              {/* TypeScript LSP (Col 4-6, Row 4-5) */}
              {ideList[2] && (
                <div
                  onClick={() => onSelectProcess(ideList[2].id)}
                  className={`col-span-3 row-span-2 p-1.5 flex flex-col justify-between cursor-pointer border transition-colors ${
                    isPrecision
                      ? 'bg-[#181c22] border-[#3e484f] rounded-xs hover:border-[#38bdf8]'
                      : 'bg-slate-900/60 border-slate-800 rounded-lg hover:border-sky-400/40'
                  } ${selectedProcessId === ideList[2].id ? 'ring-1 ring-[#38bdf8]' : ''}`}
                >
                  <span className="text-xs text-slate-200 truncate">
                    {ideList[2].name}
                  </span>
                  <div className="flex justify-between items-baseline border-t border-slate-700/30 pt-0.5">
                    <span className="text-xs font-mono text-slate-200">
                      {ideList[2].ramDisplay}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {ideList[2].cpuPercent}%
                    </span>
                  </div>
                </div>
              )}

              {/* Copilot (Col 4-6, Row 6) */}
              {ideList[3] && (
                <div
                  onClick={() => onSelectProcess(ideList[3].id)}
                  className={`col-span-3 row-span-1 px-2 flex items-center justify-between border cursor-pointer ${
                    isPrecision
                      ? 'bg-[#181c22] border-[#3e484f] rounded-xs hover:border-[#38bdf8]'
                      : 'bg-slate-900/50 border-slate-800 rounded-md hover:border-sky-400/40'
                  } ${selectedProcessId === ideList[3].id ? 'ring-1 ring-[#38bdf8]' : ''}`}
                >
                  <span className="text-xs text-slate-300 truncate">
                    {ideList[3].name}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {ideList[3].ramDisplay}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ================= CATEGORY 3: TERMINAL / SHELL (Cols 1-5, Rows 8-12) ================= */}
          <div
            className={`col-span-5 row-span-5 flex flex-col p-1.5 relative overflow-hidden transition-all ${
              isPrecision
                ? 'bg-[#fb923c]/5 border border-[#fb923c]/40 rounded-xs'
                : 'bg-amber-950/15 border border-amber-500/20 rounded-xl'
            } ${matchesCategory('terminal') ? 'opacity-100' : 'opacity-25'}`}
          >
            <div className="flex items-center justify-between pb-1 mb-1 border-b border-[#fb923c]/20 text-[11px] font-mono text-[#fb923c]">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#fb923c]" />
                <span className="font-semibold tracking-wide">
                  {isPrecision ? 'TERMINAL / SHELL' : 'TERMINAL & WORKERS'}
                </span>
                <span className="text-slate-400 text-[10px]">
                  (Total: 2.23 GB · 14.8% CPU)
                </span>
              </div>
              <span className="text-[10px] text-[#fb923c]/80">4 PROCESSES</span>
            </div>

            <div className="flex-1 grid grid-cols-4 grid-rows-4 gap-1">
              {/* Webpack dev server (Col 1-2, Row 1-4) - CAUSE */}
              {terminalList[0] && (
                <div
                  onClick={() => onSelectProcess(terminalList[0].id)}
                  className={`col-span-2 row-span-4 p-2.5 flex flex-col justify-between cursor-pointer relative group transition-all ${
                    isPrecision
                      ? 'bg-[#1c2026] border-2 rounded-xs'
                      : 'bg-slate-900/90 border-2 rounded-lg'
                  } ${
                    selectedProcessId === terminalList[0].id
                      ? isPrecision
                        ? 'border-[#ff5252] ring-1 ring-[#ff5252]'
                        : 'border-amber-400 ring-1 ring-amber-400'
                      : 'border-amber-500/60 hover:border-amber-400'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-xs font-semibold text-slate-100 truncate">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#fb923c]" />
                        {terminalList[0].name}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 text-[9px] font-mono font-bold uppercase rounded ${
                          isPrecision
                            ? 'bg-rose-950 text-rose-300 border border-rose-500'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        {isPrecision ? 'CAUSE' : 'NEEDS REVIEW'}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                      PID: {terminalList[0].pid} · {terminalList[0].details}
                    </div>
                    <div className="text-[10px] font-mono text-amber-300 mt-1 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[11px]">
                        trending_up
                      </span>
                      <span>Leak: {terminalList[0].leakRate}</span>
                    </div>
                  </div>
                  <div className="border-t border-slate-700/40 pt-1 flex items-baseline justify-between">
                    <span className="text-base font-mono font-semibold text-amber-300">
                      {terminalList[0].ramDisplay}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">node v20</span>
                  </div>
                </div>
              )}

              {/* Zsh session 3 (Col 3-4, Row 1-2) */}
              {terminalList[1] && (
                <div
                  onClick={() => onSelectProcess(terminalList[1].id)}
                  className={`col-span-2 row-span-2 p-1.5 flex flex-col justify-between cursor-pointer border transition-colors ${
                    isPrecision
                      ? 'bg-[#181c22] border-[#3e484f] rounded-xs hover:border-[#fb923c]'
                      : 'bg-slate-900/60 border-slate-800 rounded-lg hover:border-amber-400/40'
                  } ${selectedProcessId === terminalList[1].id ? 'ring-1 ring-[#fb923c]' : ''}`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-200 truncate">
                      {terminalList[1].name}
                    </span>
                    <span className="text-[10px] font-mono text-amber-400">
                      {terminalList[1].cpuPercent}% CPU
                    </span>
                  </div>
                  <span className="text-xs font-mono text-slate-300">
                    {terminalList[1].ramDisplay}
                  </span>
                </div>
              )}

              {/* esbuild worker (Col 3, Row 3-4) */}
              {terminalList[2] && (
                <div
                  onClick={() => onSelectProcess(terminalList[2].id)}
                  className={`col-span-1 row-span-2 p-1 flex flex-col justify-between cursor-pointer border transition-colors ${
                    isPrecision
                      ? 'bg-[#181c22] border-[#3e484f] rounded-xs hover:border-[#fb923c]'
                      : 'bg-slate-900/50 border-slate-800 rounded-md hover:border-amber-400/40'
                  } ${selectedProcessId === terminalList[2].id ? 'ring-1 ring-[#fb923c]' : ''}`}
                >
                  <span className="text-[10px] font-mono text-slate-300 truncate">
                    {terminalList[2].name}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {terminalList[2].ramDisplay}
                  </span>
                </div>
              )}

              {/* FastAPI (Col 4, Row 3-4) */}
              {terminalList[3] && (
                <div
                  onClick={() => onSelectProcess(terminalList[3].id)}
                  className={`col-span-1 row-span-2 p-1 flex flex-col justify-between cursor-pointer border transition-colors ${
                    isPrecision
                      ? 'bg-[#181c22] border-[#3e484f] rounded-xs hover:border-[#fb923c]'
                      : 'bg-slate-900/50 border-slate-800 rounded-md hover:border-amber-400/40'
                  } ${selectedProcessId === terminalList[3].id ? 'ring-1 ring-[#fb923c]' : ''}`}
                >
                  <span className="text-[10px] font-mono text-slate-300 truncate">
                    {terminalList[3].name}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {terminalList[3].ramDisplay}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ================= CATEGORY 4: BROWSER TABS (Cols 6-12, Rows 8-12) ================= */}
          <div
            className={`col-span-7 row-span-5 flex flex-col p-1.5 relative overflow-hidden transition-all ${
              isPrecision
                ? 'bg-[#c084fc]/5 border border-[#c084fc]/40 rounded-xs'
                : 'bg-purple-950/15 border border-purple-500/20 rounded-xl'
            } ${matchesCategory('browser') ? 'opacity-100' : 'opacity-25'}`}
          >
            <div className="flex items-center justify-between pb-1 mb-1 border-b border-[#c084fc]/20 text-[11px] font-mono text-[#c084fc]">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#c084fc]" />
                <span className="font-semibold tracking-wide">
                  {isPrecision ? 'BROWSER TABS' : 'BROWSER WORKSPACE'}
                </span>
                <span className="text-slate-400 text-[10px]">
                  (Total: 3.18 GB · 27.8% CPU)
                </span>
              </div>
              <span className="text-[10px] text-[#c084fc]/80">5 INSTANCES</span>
            </div>

            <div className="flex-1 grid grid-cols-6 grid-rows-4 gap-1">
              {/* Figma (Col 1-3, Row 1-4) - CAUSE */}
              {browserList[0] && (
                <div
                  onClick={() => onSelectProcess(browserList[0].id)}
                  className={`col-span-3 row-span-4 p-2.5 flex flex-col justify-between cursor-pointer relative group transition-all ${
                    isPrecision
                      ? 'bg-[#1c2026] border-2 rounded-xs'
                      : 'bg-slate-900/85 border border-amber-500/40 rounded-lg'
                  } ${
                    selectedProcessId === browserList[0].id
                      ? isPrecision
                        ? 'border-rose-500 ring-1 ring-rose-500'
                        : 'border-purple-400 ring-1 ring-purple-400'
                      : 'border-rose-500/60 hover:border-rose-400'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#c084fc]" />
                        <span className="text-xs font-semibold text-slate-100 truncate max-w-[150px]">
                          {browserList[0].name}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                        {browserList[0].details}
                      </div>
                    </div>
                    <span
                      className={`flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase rounded ${
                        isPrecision
                          ? 'bg-rose-950 text-rose-300 border border-rose-500'
                          : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[10px]">
                        warning
                      </span>
                      <span>{isPrecision ? 'CAUSE' : 'INTENSIVE'}</span>
                    </span>
                  </div>
                  <div className="flex items-end justify-between border-t border-slate-700/40 pt-1">
                    <span className="text-base font-mono font-semibold text-purple-300">
                      {browserList[0].ramDisplay}
                    </span>
                    <span className="text-xs font-mono text-purple-400">
                      {browserList[0].cpuPercent}% CPU
                    </span>
                  </div>
                </div>
              )}

              {/* Chrome Jira (Col 4-6, Row 1-2) */}
              {browserList[1] && (
                <div
                  onClick={() => onSelectProcess(browserList[1].id)}
                  className={`col-span-3 row-span-2 p-1.5 flex flex-col justify-between cursor-pointer border transition-colors ${
                    isPrecision
                      ? 'bg-[#181c22] border-[#3e484f] rounded-xs hover:border-[#c084fc]'
                      : 'bg-slate-900/60 border-slate-800 rounded-lg hover:border-purple-400/40'
                  } ${selectedProcessId === browserList[1].id ? 'ring-1 ring-[#c084fc]' : ''}`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-200 truncate">
                      {browserList[1].name}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      PID: {browserList[1].pid}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-slate-300">
                    {browserList[1].ramDisplay}
                  </span>
                </div>
              )}

              {/* Datadog (Col 4, Row 3-4) */}
              {browserList[2] && (
                <div
                  onClick={() => onSelectProcess(browserList[2].id)}
                  className={`col-span-1 row-span-2 p-1 flex flex-col justify-between cursor-pointer border transition-colors ${
                    isPrecision
                      ? 'bg-[#181c22] border-[#3e484f] rounded-xs hover:border-[#c084fc]'
                      : 'bg-slate-900/50 border-slate-800 rounded-md hover:border-purple-400/40'
                  } ${selectedProcessId === browserList[2].id ? 'ring-1 ring-[#c084fc]' : ''}`}
                >
                  <span className="text-[10px] font-mono text-slate-300 truncate">
                    {browserList[2].name}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {browserList[2].ramDisplay}
                  </span>
                </div>
              )}

              {/* GitHub PR (Col 5, Row 3-4) */}
              {browserList[3] && (
                <div
                  onClick={() => onSelectProcess(browserList[3].id)}
                  className={`col-span-1 row-span-2 p-1 flex flex-col justify-between cursor-pointer border transition-colors ${
                    isPrecision
                      ? 'bg-[#181c22] border-[#3e484f] rounded-xs hover:border-[#c084fc]'
                      : 'bg-slate-900/50 border-slate-800 rounded-md hover:border-purple-400/40'
                  } ${selectedProcessId === browserList[3].id ? 'ring-1 ring-[#c084fc]' : ''}`}
                >
                  <span className="text-[10px] font-mono text-slate-300 truncate">
                    {browserList[3].name}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {browserList[3].ramDisplay}
                  </span>
                </div>
              )}

              {/* Stack Overflow (Col 6, Row 3-4) */}
              {browserList[4] && (
                <div
                  onClick={() => onSelectProcess(browserList[4].id)}
                  className={`col-span-1 row-span-2 p-1 flex flex-col justify-between cursor-pointer border transition-colors ${
                    isPrecision
                      ? 'bg-[#181c22] border-[#3e484f] rounded-xs hover:border-[#c084fc]'
                      : 'bg-slate-900/50 border-slate-800 rounded-md hover:border-purple-400/40'
                  } ${selectedProcessId === browserList[4].id ? 'ring-1 ring-[#c084fc]' : ''}`}
                >
                  <span className="text-[10px] font-mono text-slate-300 truncate">
                    {browserList[4].name}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {browserList[4].ramDisplay}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Telemetry Inspector Dock */}
      <footer
        className={`h-12 px-4 border-t flex items-center justify-between shrink-0 ${
          isPrecision
            ? 'bg-[#181c22] border-[#3e484f]'
            : 'bg-[#0e131a] border-slate-800/80'
        }`}
      >
        {/* Left side: Selected Target Node Telemetry Details */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`flex items-center gap-1.5 px-2 py-0.5 border text-xs font-mono font-semibold ${
              isPrecision
                ? 'bg-[#1c2026] border-[#3e484f] text-slate-200 rounded-xs'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-300 rounded-md'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                selectedProcess.subsystem === 'containers'
                  ? 'bg-[#4ade80]'
                  : selectedProcess.subsystem === 'ide'
                  ? 'bg-[#38bdf8]'
                  : selectedProcess.subsystem === 'terminal'
                  ? 'bg-[#fb923c]'
                  : 'bg-[#c084fc]'
              }`}
            />
            <span>SELECTED NODE:</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-300 truncate">
            <span className="font-semibold text-white truncate">
              {selectedProcess.name} (PID {selectedProcess.pid})
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-sky-300">{selectedProcess.ramDisplay}</span>
            {selectedProcess.leakRate && (
              <>
                <span className="text-slate-600">·</span>
                <span className="text-rose-400 font-medium">
                  RSS Leak: {selectedProcess.leakRate}
                </span>
              </>
            )}
            {selectedProcess.recommendation && (
              <>
                <span className="text-slate-600">·</span>
                <span className="text-slate-400 font-sans hidden md:inline truncate">
                  {selectedProcess.recommendation}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right side: Remediation Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {actionNotice && (
            <span className="text-emerald-400 text-xs font-mono mr-2 animate-pulse">
              {actionNotice}
            </span>
          )}
          <button
            onClick={() => handleActionClick('isolate')}
            className={`px-2.5 py-1 border text-xs font-mono transition-colors cursor-pointer ${
              isPrecision
                ? 'bg-[#1c2026] hover:bg-[#262a31] border-[#3e484f] text-[#dfe2eb] rounded-xs'
                : 'bg-slate-800/70 hover:bg-slate-800 border-slate-700/60 text-slate-200 rounded-lg'
            }`}
          >
            Isolate Process
          </button>
          <button
            onClick={() => handleActionClick('restart')}
            className={`px-2.5 py-1 border text-xs font-mono font-medium transition-colors cursor-pointer ${
              isPrecision
                ? 'bg-[#d97722] text-[#451f00] hover:opacity-90 border-transparent rounded-xs'
                : 'bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border-sky-500/30 rounded-lg'
            }`}
          >
            Restart Worker (SIGTERM)
          </button>
          <button
            onClick={() => handleActionClick('kill')}
            className={`px-2.5 py-1 border text-xs font-mono font-bold transition-colors cursor-pointer flex items-center gap-1 ${
              isPrecision
                ? 'bg-[#93000a] text-[#ffdad6] hover:bg-red-800 border-red-700 rounded-xs'
                : 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border-red-500/40 rounded-lg'
            }`}
          >
            <span className="material-symbols-outlined text-xs">close</span>
            <span>KILL -9</span>
          </button>
        </div>
      </footer>
    </div>
  );
};
