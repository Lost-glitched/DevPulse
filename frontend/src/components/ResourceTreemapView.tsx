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
    processes.find((p) => p.id === selectedProcessId) || processes[0] || null;

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
          {/* Dynamic Subsystem Sections */}
          {(() => {
            const subsystemConfig: {
              key: SubsystemType;
              label: string;
              labelAlt: string;
              color: string;
              bgColor: string;
              bgColorPrecision: string;
              borderColor: string;
              borderColorPrecision: string;
              textColor: string;
              tileHoverBorder: string;
              tileRingColor: string;
              colSpan: string;
              rowSpan: string;
            }[] = [
              {
                key: 'containers',
                label: 'CONTAINERS & SERVICES',
                labelAlt: 'DOCKER / CONTAINERS',
                color: '#4ade80',
                bgColor: 'bg-emerald-950/15 border-emerald-500/20',
                bgColorPrecision: 'bg-[#4ade80]/5 border-[#4ade80]/40',
                borderColor: 'border-[#4ade80]/20',
                borderColorPrecision: 'border-[#4ade80]/40',
                textColor: 'text-[#4ade80]',
                tileHoverBorder: 'hover:border-emerald-400/40',
                tileRingColor: 'ring-[#4ade80]',
                colSpan: 'col-span-7',
                rowSpan: 'row-span-7',
              },
              {
                key: 'ide',
                label: 'IDE & EDITOR',
                labelAlt: 'IDE / EDITOR',
                color: '#38bdf8',
                bgColor: 'bg-sky-950/15 border-sky-500/20',
                bgColorPrecision: 'bg-[#38bdf8]/5 border-[#38bdf8]/40',
                borderColor: 'border-[#38bdf8]/20',
                borderColorPrecision: 'border-[#38bdf8]/40',
                textColor: 'text-[#38bdf8]',
                tileHoverBorder: 'hover:border-sky-400/40',
                tileRingColor: 'ring-[#38bdf8]',
                colSpan: 'col-span-5',
                rowSpan: 'row-span-7',
              },
              {
                key: 'terminal',
                label: 'TERMINALS & CLI',
                labelAlt: 'TERMINAL / SHELL',
                color: '#fb923c',
                bgColor: 'bg-amber-950/15 border-amber-500/20',
                bgColorPrecision: 'bg-[#fb923c]/5 border-[#fb923c]/40',
                borderColor: 'border-[#fb923c]/20',
                borderColorPrecision: 'border-[#fb923c]/40',
                textColor: 'text-[#fb923c]',
                tileHoverBorder: 'hover:border-amber-400/40',
                tileRingColor: 'ring-[#fb923c]',
                colSpan: 'col-span-5',
                rowSpan: 'row-span-5',
              },
              {
                key: 'browser',
                label: 'BROWSER INSTANCES',
                labelAlt: 'BROWSER / WEB',
                color: '#c084fc',
                bgColor: 'bg-purple-950/15 border-purple-500/20',
                bgColorPrecision: 'bg-[#c084fc]/5 border-[#c084fc]/40',
                borderColor: 'border-[#c084fc]/20',
                borderColorPrecision: 'border-[#c084fc]/40',
                textColor: 'text-[#c084fc]',
                tileHoverBorder: 'hover:border-purple-400/40',
                tileRingColor: 'ring-[#c084fc]',
                colSpan: 'col-span-7',
                rowSpan: 'row-span-5',
              },
            ];

            return subsystemConfig.map((cfg) => {
              const list = processes.filter((p) => p.subsystem === cfg.key);
              const totalRam = list.reduce((s, p) => s + p.ramGb, 0);
              const totalCpu = list.reduce((s, p) => s + p.cpuPercent, 0);

              return (
                <div
                  key={cfg.key}
                  className={`${cfg.colSpan} ${cfg.rowSpan} flex flex-col p-1.5 relative overflow-hidden transition-all ${
                    isPrecision
                      ? `${cfg.bgColorPrecision} border rounded-xs`
                      : `${cfg.bgColor} border rounded-xl`
                  } ${matchesCategory(cfg.key) ? 'opacity-100' : 'opacity-25'}`}
                >
                  {/* Section Header */}
                  <div
                    className={`flex items-center justify-between pb-1 mb-1 border-b ${cfg.borderColor} text-[11px] font-mono ${cfg.textColor}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: cfg.color }}
                      />
                      <span className="font-semibold tracking-wide">
                        {isPrecision ? cfg.labelAlt : cfg.label}
                      </span>
                      <span className="text-slate-400 text-[10px]">
                        (Total: {totalRam >= 1 ? `${totalRam.toFixed(2)} GB` : `${Math.round(totalRam * 1024)} MB`} · {totalCpu.toFixed(1)}% CPU)
                      </span>
                    </div>
                    <span className="text-[10px]" style={{ color: `${cfg.color}cc` }}>
                      {list.length} {list.length === 1 ? 'PROCESS' : 'PROCESSES'}
                    </span>
                  </div>

                  {/* Dynamic Process Tiles */}
                  {list.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-xs font-mono text-slate-500">
                      No {cfg.label.toLowerCase()} detected
                    </div>
                  ) : (
                    <div className="flex-1 grid grid-cols-6 grid-rows-6 gap-1 auto-rows-fr">
                      {list.map((proc, idx) => {
                        // First process gets the largest tile, subsequent get progressively smaller
                        const isFirst = idx === 0;
                        const isSmall = idx >= 3;
                        const colSpan = isFirst
                          ? Math.min(4, Math.max(2, 6 - list.length + 1))
                          : isSmall
                          ? 1
                          : 2;
                        const rowSpan = isFirst
                          ? 6
                          : isSmall
                          ? 2
                          : Math.max(2, Math.floor(6 / Math.max(1, list.length - 1)));

                        const isSelected = selectedProcessId === proc.id;
                        const isCause = proc.isCause;

                        return (
                          <div
                            key={proc.id}
                            onClick={() => onSelectProcess(proc.id)}
                            className={`col-span-${colSpan} row-span-${rowSpan} p-${isFirst ? '2.5' : '1.5'} flex flex-col justify-between cursor-pointer border transition-all ${
                              isPrecision
                                ? `bg-[#1c2026] rounded-xs ${
                                    isSelected
                                      ? 'border-[#ff5252] ring-1 ring-red-500'
                                      : isCause
                                      ? 'border-rose-500/70 hover:border-rose-400'
                                      : 'border-[#3e484f] hover:border-slate-500'
                                  }`
                                : `bg-slate-900/${isFirst ? '80' : '60'} rounded-${isFirst ? 'lg' : 'md'} ${
                                    isSelected
                                      ? `border-amber-400 ring-1 ring-amber-400/50`
                                      : isCause
                                      ? 'border-amber-500/40 hover:border-amber-400'
                                      : `border-slate-${isFirst ? '700/60' : '800'} ${cfg.tileHoverBorder}`
                                  }`
                            } ${isDimmed(proc) ? 'opacity-30' : ''}`}
                            style={{
                              gridColumn: `span ${colSpan}`,
                              gridRow: `span ${rowSpan}`,
                            }}
                          >
                            {/* Tile Header */}
                            <div className="flex items-start justify-between min-w-0">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{ backgroundColor: cfg.color }}
                                  />
                                  <span
                                    className={`${
                                      isFirst ? 'text-xs' : 'text-[10px]'
                                    } font-semibold text-slate-100 truncate`}
                                  >
                                    {proc.name}
                                  </span>
                                </div>
                                {isFirst && (
                                  <div className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">
                                    PID: {proc.pid} · {proc.details}
                                  </div>
                                )}
                              </div>

                              {/* Cause / Warning Badge */}
                              {isCause && proc.causeBadgeText && isFirst && (
                                <span
                                  className={`flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-mono font-bold tracking-wider rounded shrink-0 ${
                                    isPrecision
                                      ? 'bg-rose-950/80 text-rose-300 border border-rose-500'
                                      : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                  }`}
                                >
                                  <span className="material-symbols-outlined text-[11px]">
                                    warning
                                  </span>
                                  <span>{proc.causeBadgeText}</span>
                                </span>
                              )}

                              {!isFirst && (
                                <span className="text-[10px] font-mono" style={{ color: cfg.color }}>
                                  {proc.cpuPercent}% CPU
                                </span>
                              )}
                            </div>

                            {/* Tile Footer - Metrics */}
                            <div
                              className={`${
                                isFirst
                                  ? 'flex items-end justify-between border-t border-slate-700/40 pt-1'
                                  : 'mt-auto'
                              }`}
                            >
                              <span
                                className={`font-mono font-semibold ${
                                  isFirst ? 'text-lg' : 'text-xs'
                                }`}
                                style={{ color: isFirst ? cfg.color : undefined }}
                              >
                                {metricMode === 'ram' ? proc.ramDisplay : `${proc.cpuPercent}%`}
                              </span>
                              {isFirst && (
                                <div className="flex flex-col items-end text-[10px] font-mono text-slate-400">
                                  <span>{proc.threads} threads</span>
                                  <span>{proc.cpuPercent}% CPU</span>
                                </div>
                              )}

                              {/* Leak rate badge for first tile */}
                              {isFirst && proc.leakRate && (
                                <span
                                  className={`absolute bottom-2 left-2 text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                                    isPrecision
                                      ? 'bg-rose-950/80 text-rose-300 border-rose-500'
                                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                  }`}
                                >
                                  {proc.leakRate}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()}
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
          {selectedProcess ? (
            <>
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
            </>
          ) : (
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <span className="material-symbols-outlined text-sm text-slate-500">info</span>
              <span>No process selected. Click any block above to inspect telemetry.</span>
            </div>
          )}
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
            disabled={!selectedProcess}
            className={`px-2.5 py-1 border text-xs font-mono transition-colors ${
              !selectedProcess
                ? 'opacity-40 cursor-not-allowed border-slate-800 text-slate-600'
                : 'cursor-pointer'
            } ${
              isPrecision
                ? 'bg-[#1c2026] hover:bg-[#262a31] border-[#3e484f] text-[#dfe2eb] rounded-xs'
                : 'bg-slate-800/70 hover:bg-slate-800 border-slate-700/60 text-slate-200 rounded-lg'
            }`}
          >
            Isolate Process
          </button>
          <button
            onClick={() => handleActionClick('restart')}
            disabled={!selectedProcess}
            className={`px-2.5 py-1 border text-xs font-mono font-medium transition-colors ${
              !selectedProcess
                ? 'opacity-40 cursor-not-allowed border-slate-800 text-slate-600'
                : 'cursor-pointer'
            } ${
              isPrecision
                ? 'bg-[#d97722] text-[#451f00] hover:opacity-90 border-transparent rounded-xs'
                : 'bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border-sky-500/30 rounded-lg'
            }`}
          >
            Restart Worker (SIGTERM)
          </button>
          <button
            onClick={() => handleActionClick('kill')}
            disabled={!selectedProcess}
            className={`px-2.5 py-1 border text-xs font-mono font-bold transition-colors flex items-center gap-1 ${
              !selectedProcess
                ? 'opacity-40 cursor-not-allowed border-slate-800 text-slate-600'
                : 'cursor-pointer'
            } ${
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
