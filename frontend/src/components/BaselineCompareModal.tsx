import React, { useState } from 'react';
import { FailureDiffResponse, ThemeStyle } from '../types';

interface BaselineCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  themeStyle: ThemeStyle;
  failureDiff?: FailureDiffResponse | null;
  systemMemoryUsedGb?: number;
  systemMemoryTotalGb?: number;
  cpuPercent?: number;
  subsystemTotals?: Record<string, { ramGb: number; cpuPercent: number; count: number }>;
}

export const BaselineCompareModal: React.FC<BaselineCompareModalProps> = ({
  isOpen,
  onClose,
  themeStyle,
  failureDiff,
  systemMemoryUsedGb = 0,
  systemMemoryTotalGb = 16,
  cpuPercent = 0,
  subsystemTotals,
}) => {
  const [selectedFileIdx, setSelectedFileIdx] = useState<number>(0);

  if (!isOpen) return null;

  const isPrecision = themeStyle === 'precision';

  const used = systemMemoryUsedGb;
  const total = systemMemoryTotalGb;
  const baselineMem = parseFloat((total * 0.45).toFixed(1));
  const memDelta = parseFloat((used - baselineMem).toFixed(1));

  const cpu = cpuPercent;
  const baselineCpu = 15.0;
  const cpuDelta = parseFloat((cpu - baselineCpu).toFixed(1));

  const ide = subsystemTotals?.ide;
  const term = subsystemTotals?.terminal;
  const cont = subsystemTotals?.containers;
  const brow = subsystemTotals?.browser;

  const defaultRows = [
    {
      metric: 'Total Host RSS Memory',
      baseline: `${baselineMem.toFixed(1)} GB (Nominal)`,
      anomaly: `${used.toFixed(1)} GB / ${total.toFixed(1)} GB`,
      delta: `${memDelta >= 0 ? '+' : ''}${memDelta.toFixed(1)} GB (${((used / (total || 1)) * 100).toFixed(0)}% load)`,
      isWarning: used / (total || 1) > 0.8,
    },
    {
      metric: 'Aggregate CPU Load',
      baseline: `${baselineCpu.toFixed(1)}% (Idle baseline)`,
      anomaly: `${cpu.toFixed(1)}% (Live system)`,
      delta: `${cpuDelta >= 0 ? '+' : ''}${cpuDelta.toFixed(1)}%`,
      isWarning: cpu > 75,
    },
    {
      metric: 'IDE / Editor Subsystem',
      baseline: '1.2 GB',
      anomaly: ide ? `${ide.ramGb.toFixed(1)} GB (${ide.count} procs)` : '0.0 GB',
      delta: ide ? `${ide.cpuPercent.toFixed(1)}% CPU` : 'Idle',
      isWarning: ide ? ide.ramGb > 6.0 : false,
    },
    {
      metric: 'Terminal / Shell Subsystem',
      baseline: '0.4 GB',
      anomaly: term ? `${term.ramGb.toFixed(1)} GB (${term.count} procs)` : '0.0 GB',
      delta: term ? `${term.cpuPercent.toFixed(1)}% CPU` : 'Idle',
      isWarning: term ? term.ramGb > 4.0 : false,
    },
    {
      metric: 'Containers / Docker Subsystem',
      baseline: '0.0 GB',
      anomaly: cont ? `${cont.ramGb.toFixed(1)} GB (${cont.count} procs)` : '0.0 GB (0 active)',
      delta: cont ? `${cont.cpuPercent.toFixed(1)}% CPU` : 'Nominal',
      isWarning: cont ? cont.ramGb > 8.0 : false,
    },
    {
      metric: 'Browser Tab Subsystem',
      baseline: '1.5 GB',
      anomaly: brow ? `${brow.ramGb.toFixed(1)} GB (${brow.count} procs)` : '0.0 GB',
      delta: brow ? `${brow.cpuPercent.toFixed(1)}% CPU` : 'Nominal',
      isWarning: brow ? brow.ramGb > 5.0 : false,
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 select-none">
      <div
        className={`max-w-4xl w-full border shadow-2xl flex flex-col max-h-[85vh] ${
          isPrecision
            ? 'bg-[#181c22] border-[#3e484f] rounded-xs text-[#dfe2eb]'
            : 'bg-slate-900 border-slate-700 rounded-xl text-slate-100'
        }`}
      >
        {/* Header */}
        <div className="h-12 px-4 border-b border-slate-700/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#38bdf8]">
              {failureDiff ? 'troubleshoot' : 'compare'}
            </span>
            <span className="text-sm font-semibold font-mono">
              {failureDiff
                ? 'Execution Failure Diff & Culprit Blame Analysis'
                : 'Telemetry Baseline vs Incident Comparison'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white cursor-pointer"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-4 font-mono text-xs">
          {failureDiff ? (
            <>
              {/* Summary Bar */}
              <div className="p-3 bg-[#10141a] border border-slate-800 rounded flex flex-col gap-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[11px] bg-rose-950 text-rose-300 border border-rose-600/70 font-semibold">
                      FAILED (exit {failureDiff.exit_code ?? 1})
                    </span>
                    <span className="text-slate-300 font-semibold text-xs">
                      {failureDiff.failing_command || 'Command failed'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-2">
                    <span>
                      Passing:{' '}
                      <code className="text-emerald-400">
                        {failureDiff.passing_commit ? failureDiff.passing_commit.slice(0, 8) : 'root'}
                      </code>
                    </span>
                    <span>→</span>
                    <span>
                      Failing:{' '}
                      <code className="text-rose-400">
                        {failureDiff.failing_commit ? failureDiff.failing_commit.slice(0, 8) : 'head'}
                      </code>
                    </span>
                  </div>
                </div>

                {failureDiff.stderr_tail && (
                  <div className="mt-1 p-2 bg-black/50 border border-rose-950/60 rounded text-[11px] text-rose-300 whitespace-pre-wrap font-mono max-h-28 overflow-y-auto">
                    {failureDiff.stderr_tail}
                  </div>
                )}
              </div>

              {/* Suspected Culprits Section */}
              {failureDiff.culprits && failureDiff.culprits.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs">
                    <span className="material-symbols-outlined text-sm">warning</span>
                    <span>Deterministic Culprit Analysis ({failureDiff.culprits.length} suspect hunks)</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {failureDiff.culprits.map((c, i) => (
                      <div
                        key={i}
                        className="p-2.5 bg-amber-950/20 border border-amber-500/40 rounded flex flex-col gap-1.5"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-amber-200 font-medium truncate max-w-[240px]">
                            {c.file_path}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 text-[10px] border border-amber-600/40">
                            Score {c.score}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {c.matched_tokens.map((token, ti) => (
                            <span
                              key={ti}
                              className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] text-slate-300 border border-slate-700"
                            >
                              {token}
                            </span>
                          ))}
                        </div>
                        <pre className="p-1.5 bg-black/60 rounded text-[10px] text-slate-300 overflow-x-auto max-h-24 whitespace-pre">
                          {c.hunk}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Diff Viewer */}
              <div className="flex flex-col gap-2 mt-1">
                <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-1">
                  <span>Modified Files ({failureDiff.files?.length || 0})</span>
                </div>

                {failureDiff.files && failureDiff.files.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {/* File Tabs */}
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {failureDiff.files.map((file, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedFileIdx(idx)}
                          className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                            selectedFileIdx === idx
                              ? 'bg-[#202630] border-[#38bdf8] text-sky-200'
                              : 'bg-[#10141a] border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <span className="truncate max-w-[180px]">{file.file_path}</span>
                          <span className="text-[10px] text-emerald-400">+{file.lines_added}</span>
                          <span className="text-[10px] text-rose-400">-{file.lines_removed}</span>
                        </button>
                      ))}
                    </div>

                    {/* Diff lines display */}
                    {failureDiff.files[selectedFileIdx] && (
                      <div className="p-3 bg-[#0d1117] border border-slate-800 rounded overflow-x-auto max-h-72 font-mono text-[11px] leading-relaxed">
                        {failureDiff.files[selectedFileIdx].unified_diff
                          .split('\n')
                          .map((line, li) => {
                            let lineClass = 'text-slate-400';
                            if (line.startsWith('+') && !line.startsWith('+++')) {
                              lineClass = 'text-emerald-400 bg-emerald-950/30';
                            } else if (line.startsWith('-') && !line.startsWith('---')) {
                              lineClass = 'text-rose-400 bg-rose-950/30';
                            } else if (line.startsWith('@@')) {
                              lineClass = 'text-cyan-400 font-semibold bg-cyan-950/20';
                            }
                            return (
                              <div key={li} className={`px-1 rounded-xs ${lineClass}`}>
                                {line}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-6 text-center text-slate-500 font-mono text-xs">
                    No file differences recorded between passing and failing snapshots.
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Baseline Comparison Table */
            <>
              <div className="grid grid-cols-12 pb-2 border-b border-slate-700/60 text-slate-400 text-[11px] font-semibold">
                <span className="col-span-4">Metric</span>
                <span className="col-span-3">Nominal (11:30)</span>
                <span className="col-span-2 text-rose-300">Peak (13:42:10)</span>
                <span className="col-span-3 text-right">Delta Difference</span>
              </div>

              <div className="flex flex-col gap-2">
                {defaultRows.map((r, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-12 items-center py-1.5 border-b border-slate-800/60 text-[11px]"
                  >
                    <span className="col-span-4 text-slate-200 font-sans font-medium">
                      {r.metric}
                    </span>
                    <span className="col-span-3 text-emerald-400">{r.baseline}</span>
                    <span className="col-span-2 text-rose-400 font-semibold">{r.anomaly}</span>
                    <span className="col-span-3 text-right">
                      <span
                        className={`px-1.5 py-0.2 rounded border ${
                          r.isWarning
                            ? 'bg-rose-950/70 border-rose-500/60 text-rose-300'
                            : 'bg-slate-800 border-slate-700 text-slate-300'
                        }`}
                      >
                        {r.delta}
                      </span>
                    </span>
                  </div>
                ))}
              </div>

              <div className="p-2.5 bg-[#10141a] border border-slate-800 rounded mt-2 text-[11px] text-slate-300 leading-relaxed font-sans">
                <strong className="text-amber-400 font-mono block mb-0.5">Kernel Diagnosis:</strong>
                The incident at 13:42:10 was provoked by a release test runner in Terminal 2 allocating +2.1 GB in 12 seconds while language servers were simultaneously re-indexing after a branch switch, pushing host RSS beyond the 15 GB ceiling.
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="h-12 px-4 border-t border-slate-700/60 flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-mono rounded cursor-pointer text-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
