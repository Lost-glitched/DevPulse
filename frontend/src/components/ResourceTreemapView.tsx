import React, { useState } from 'react';
import { ProcessNode, SubsystemType, ThemeStyle } from '../types';
import { executeFix, fetchDiagnoses } from '../services/api';

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
  const [isFixing, setIsFixing] = useState<boolean>(false);

  const isPrecision = themeStyle === 'precision';

  const selectedProcess =
    processes.find((p) => p.id === selectedProcessId) || processes[0] || null;

  const handleFixThis = async () => {
    if (!selectedProcess) return;
    const confirmed = window.confirm(
      `Execute automatic remediation for ${selectedProcess.name} (PID ${selectedProcess.pid})?\n\nRecommendation: ${selectedProcess.recommendation || 'Purge / restart process'}`
    );
    if (!confirmed) return;

    setIsFixing(true);
    try {
      const diagRes = await fetchDiagnoses();
      const pidStr = String(selectedProcess.pid);
      const matched = diagRes?.diagnoses.find(
        (d) =>
          d.process_key?.includes(pidStr) ||
          d.signal_values?.pid === selectedProcess.pid ||
          d.signal_values?.process_name === selectedProcess.name
      );

      if (matched) {
        const fixRes = await executeFix(matched.id, true);
        const msg = fixRes?.result?.message || `Fix executed for PID ${selectedProcess.pid}`;
        setActionNotice(msg);
      } else {
        onRestartProcess(selectedProcess.id);
        setActionNotice(`Auto-fix applied: Worker PID ${selectedProcess.pid} restarted.`);
      }
    } catch {
      onRestartProcess(selectedProcess.id);
      setActionNotice(`Auto-fix applied: Process PID ${selectedProcess.pid} restarted.`);
    } finally {
      setIsFixing(false);
      setTimeout(() => setActionNotice(null), 4000);
    }
  };

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

  const causeCount = processes.filter((p) => p.isCause).length;

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
            <span>All</span>
          </button>
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-slate-400">
            <span className="hover:text-slate-200 cursor-pointer" onClick={() => setActiveCategory('all')}>Root</span>
            <span className="text-slate-600">/</span>
            <span className="text-sky-300 font-medium">
              {activeCategory === 'all' ? 'System Processes' : activeCategory.toUpperCase()}
            </span>
          </div>
          <span
            className={`px-1.5 py-0.2 text-[10px] font-mono border ${
              isPrecision
                ? 'bg-[#31353c] text-[#38bdf8] border-[#3e484f] rounded-xs'
                : 'bg-slate-800/80 text-sky-300 border-slate-700/60 rounded-full'
            }`}
          >
            {processes.length} Processes
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
            ALL ({processes.length})
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
            <span>IDE ({ideList.length})</span>
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
            <span>Terminal ({terminalList.length})</span>
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
            <span>Docker ({containersList.length})</span>
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
            <span>Browser ({browserList.length})</span>
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
              Flagged as Cause ({causeCount})
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
        {processes.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-lg text-slate-500 font-mono">
            <span className="material-symbols-outlined text-3xl mb-2 animate-spin text-sky-400">
              progress_activity
            </span>
            <span className="text-sm text-slate-300 font-semibold">
              Sampling Workspace Processes
            </span>
            <span className="text-xs text-slate-500 mt-1">
              DevPulse system collector is reading the OS process table...
            </span>
          </div>
        ) : (
          <div className="w-full h-full grid grid-cols-12 grid-rows-12 gap-1.5">
            {[
              {
                subsystem: 'containers' as SubsystemType,
                title: isPrecision ? 'DOCKER / CONTAINERS' : 'CONTAINERS & SERVICES',
                color: '#4ade80',
                list: containersList,
                emptyIcon: 'inventory_2',
                emptyHint: 'No Docker containers or local daemon instances active',
                gridArea: activeCategory === 'all' ? 'col-span-12 md:col-span-7 row-span-7' : 'col-span-12 row-span-12',
              },
              {
                subsystem: 'ide' as SubsystemType,
                title: isPrecision ? 'IDE / EDITOR' : 'IDE & CODE EDITING',
                color: '#38bdf8',
                list: ideList,
                emptyIcon: 'code',
                emptyHint: 'No IDE instances or language servers detected',
                gridArea: activeCategory === 'all' ? 'col-span-12 md:col-span-5 row-span-7' : 'col-span-12 row-span-12',
              },
              {
                subsystem: 'terminal' as SubsystemType,
                title: isPrecision ? 'TERMINAL / SHELL' : 'TERMINAL & WORKERS',
                color: '#fb923c',
                list: terminalList,
                emptyIcon: 'terminal',
                emptyHint: 'No shell processes or background tasks active',
                gridArea: activeCategory === 'all' ? 'col-span-12 md:col-span-5 row-span-5' : 'col-span-12 row-span-12',
              },
              {
                subsystem: 'browser' as SubsystemType,
                title: isPrecision ? 'BROWSER TABS' : 'BROWSER WORKSPACE',
                color: '#c084fc',
                list: browserList,
                emptyIcon: 'language',
                emptyHint: 'No browser processes or tabs connected via extension',
                gridArea: activeCategory === 'all' ? 'col-span-12 md:col-span-7 row-span-5' : 'col-span-12 row-span-12',
              },
            ].map((cat) => {
              const isVisible = activeCategory === 'all' || activeCategory === cat.subsystem;
              if (!isVisible) return null;

              const totalRam = cat.list.reduce((sum, p) => sum + (p.ramGb || 0), 0);
              const totalCpu = cat.list.reduce((sum, p) => sum + (p.cpuPercent || 0), 0);
              const ramDisp = totalRam >= 1.0 ? `${totalRam.toFixed(2)} GB` : `${Math.round(totalRam * 1024)} MB`;
              const cpuDisp = `${totalCpu.toFixed(1)}% CPU`;

              let filtered = cat.list;
              if (onlyCauseFilter) {
                const causes = filtered.filter((p) => p.isCause || selectedProcessId === p.id);
                if (causes.length > 0) filtered = causes;
              }
              const sorted = [...filtered].sort((a, b) => {
                const valA = metricMode === 'ram' ? (a.ramGb || 0) : (a.cpuPercent || 0);
                const valB = metricMode === 'ram' ? (b.ramGb || 0) : (b.cpuPercent || 0);
                return sortDesc ? valB - valA : valA - valB;
              });

              return (
                <div
                  key={cat.subsystem}
                  className={`${cat.gridArea} flex flex-col p-1.5 relative overflow-hidden transition-all ${
                    isPrecision
                      ? 'border rounded-xs'
                      : 'border rounded-xl'
                  }`}
                  style={{
                    backgroundColor: `${cat.color}08`,
                    borderColor: `${cat.color}40`,
                  }}
                >
                  {/* Category Header */}
                  <div
                    className="flex items-center justify-between pb-1 mb-1 border-b text-[11px] font-mono shrink-0"
                    style={{ borderColor: `${cat.color}30`, color: cat.color }}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                      <span className="font-semibold tracking-wide truncate">{cat.title}</span>
                      <span className="text-slate-400 text-[10px] whitespace-nowrap hidden sm:inline">
                        (Total: {ramDisp} · {cpuDisp})
                      </span>
                    </div>
                    <span className="text-[10px] font-mono shrink-0 ml-2" style={{ color: `${cat.color}dd` }}>
                      {cat.list.length} {cat.list.length === 1 ? 'PROCESS' : 'PROCESSES'}
                    </span>
                  </div>

                  {/* Body: Process Tiles or Empty State */}
                  {sorted.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-4 text-center border border-dashed border-slate-800/60 rounded bg-slate-950/20">
                      <span className="material-symbols-outlined text-slate-600 mb-1" style={{ fontSize: 24 }}>
                        {cat.emptyIcon}
                      </span>
                      <span className="text-xs font-mono text-slate-400 font-medium">
                        {cat.emptyHint}
                      </span>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto pr-0.5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 auto-rows-[minmax(64px,auto)] gap-1">
                      {sorted.map((proc) => {
                        const isSelected = selectedProcessId === proc.id;
                        const isCause = !!proc.isCause;

                        return (
                          <div
                            key={proc.id}
                            onClick={() => onSelectProcess(proc.id)}
                            className={`p-2 flex flex-col justify-between relative group cursor-pointer transition-all border ${
                              isPrecision ? 'rounded-xs' : 'rounded-lg'
                            } ${
                              isSelected
                                ? isPrecision
                                  ? 'border-[#ff5252] ring-1 ring-red-500 bg-[#222831]'
                                  : 'border-amber-400 ring-1 ring-amber-400/50 bg-slate-800'
                                : isCause
                                ? isPrecision
                                  ? 'border-rose-500/70 bg-rose-950/20 hover:border-rose-400'
                                  : 'border-amber-500/40 bg-amber-950/20 hover:border-amber-400'
                                : isPrecision
                                ? 'bg-[#181c22] border-[#3e484f] hover:border-slate-500'
                                : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1 min-w-0">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                                  <span className="text-xs font-semibold text-slate-100 truncate block">
                                    {proc.name}
                                  </span>
                                </div>
                                <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5" title={proc.details || proc.name}>
                                  PID {proc.pid} {proc.details && proc.details !== proc.name ? `· ${proc.details}` : ''}
                                </div>
                              </div>
                              {isCause && (
                                <span
                                  className={`flex items-center gap-0.5 px-1 py-0.2 text-[9px] font-mono font-bold tracking-wider rounded shrink-0 ${
                                    isPrecision
                                      ? 'bg-rose-950/80 text-rose-300 border border-rose-500'
                                      : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                  }`}
                                >
                                  <span className="material-symbols-outlined text-[10px]">warning</span>
                                  <span>{proc.causeBadgeText || 'CAUSE'}</span>
                                </span>
                              )}
                            </div>

                            {proc.leakRate && (
                              <div className="text-[9px] font-mono text-amber-300 mt-1 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[10px]">trending_up</span>
                                <span>Leak: {proc.leakRate}</span>
                              </div>
                            )}

                            <div className="flex items-end justify-between border-t border-slate-700/30 pt-1 mt-1">
                              <span className="text-xs font-mono font-semibold text-sky-300">
                                {metricMode === 'ram' ? proc.ramDisplay : `${proc.cpuPercent}%`}
                              </span>
                              <span className="text-[10px] font-mono text-emerald-400">
                                {metricMode === 'ram' ? `${proc.cpuPercent}% CPU` : proc.ramDisplay}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Bottom Telemetry Inspector Dock */}
      <footer
        className={`min-h-[48px] px-4 py-2 border-t flex items-center justify-between shrink-0 gap-3 ${
          isPrecision
            ? 'bg-[#181c22] border-[#3e484f]'
            : 'bg-[#0e131a] border-slate-800/80'
        }`}
      >
        {selectedProcess ? (
          <>
            {/* Left side: Selected Target Node Telemetry Details */}
            <div className="flex items-center gap-2 min-w-0 overflow-hidden">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  selectedProcess.subsystem === 'containers'
                    ? 'bg-[#4ade80]'
                    : selectedProcess.subsystem === 'ide'
                    ? 'bg-[#38bdf8]'
                    : selectedProcess.subsystem === 'terminal'
                    ? 'bg-[#fb923c]'
                    : 'bg-[#c084fc]'
                }`}
              />
              <span className="text-xs font-mono font-semibold text-white truncate whitespace-nowrap">
                {selectedProcess.name}
              </span>
              <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap shrink-0">
                PID {selectedProcess.pid}
              </span>
              <span className="text-slate-600 shrink-0">·</span>
              <span className="text-xs font-mono text-sky-300 whitespace-nowrap shrink-0">{selectedProcess.ramDisplay}</span>
              {selectedProcess.leakRate && (
                <>
                  <span className="text-slate-600 shrink-0">·</span>
                  <span className="text-[10px] font-mono text-rose-400 whitespace-nowrap shrink-0">
                    Leak: {selectedProcess.leakRate}
                  </span>
                </>
              )}
            </div>

            {/* Right side: Remediation Action Buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              {actionNotice && (
                <span className="text-emerald-400 text-[10px] font-mono mr-1 animate-pulse whitespace-nowrap max-w-[200px] truncate">
                  {actionNotice}
                </span>
              )}
              {selectedProcess.recommendation && (
                <button
                  onClick={handleFixThis}
                  disabled={isFixing}
                  className={`px-2.5 py-1 border text-[11px] font-mono font-bold transition-all cursor-pointer flex items-center gap-1 shadow-md ${
                    isPrecision
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-300 rounded-xs'
                      : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 border-amber-300 rounded-lg'
                  }`}
                  title={selectedProcess.recommendation}
                >
                  <span className="material-symbols-outlined text-[12px]">auto_fix_high</span>
                  <span>{isFixing ? 'Fixing...' : 'Fix'}</span>
                </button>
              )}
              <button
                onClick={() => handleActionClick('isolate')}
                className={`px-2 py-1 border text-[11px] font-mono transition-colors cursor-pointer ${
                  isPrecision
                    ? 'bg-[#1c2026] hover:bg-[#262a31] border-[#3e484f] text-[#dfe2eb] rounded-xs'
                    : 'bg-slate-800/70 hover:bg-slate-800 border-slate-700/60 text-slate-200 rounded-lg'
                }`}
              >
                Isolate
              </button>
              <button
                onClick={() => handleActionClick('restart')}
                className={`px-2 py-1 border text-[11px] font-mono font-medium transition-colors cursor-pointer ${
                  isPrecision
                    ? 'bg-[#d97722] text-[#451f00] hover:opacity-90 border-transparent rounded-xs'
                    : 'bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border-sky-500/30 rounded-lg'
                }`}
              >
                Restart
              </button>
              <button
                onClick={() => handleActionClick('kill')}
                className={`px-2 py-1 border text-[11px] font-mono font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                  isPrecision
                    ? 'bg-[#93000a] text-[#ffdad6] hover:bg-red-800 border-red-700 rounded-xs'
                    : 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border-red-500/40 rounded-lg'
                }`}
              >
                <span className="material-symbols-outlined text-[11px]">close</span>
                <span>Kill</span>
              </button>
            </div>
          </>
        ) : (
          <div className="text-xs font-mono text-slate-500">No active process selected</div>
        )}
      </footer>
    </div>
  );
};
