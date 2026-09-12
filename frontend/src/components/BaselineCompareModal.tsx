import React from 'react';
import { ThemeStyle } from '../types';

interface BaselineCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  themeStyle: ThemeStyle;
}

export const BaselineCompareModal: React.FC<BaselineCompareModalProps> = ({
  isOpen,
  onClose,
  themeStyle,
}) => {
  if (!isOpen) return null;

  const isPrecision = themeStyle === 'precision';

  const rows = [
    {
      metric: 'Total Host RSS Memory',
      baseline: '4.8 GB',
      anomaly: '15.1 GB',
      delta: '+10.3 GB (+214%)',
      isWarning: true,
    },
    {
      metric: 'Aggregate CPU Load',
      baseline: '24.5%',
      anomaly: '98.4%',
      delta: '+73.9% (Spike)',
      isWarning: true,
    },
    {
      metric: 'Kernel Swap Thrashing',
      baseline: '0 MB/s',
      anomaly: '612 MB/s',
      delta: '+612 MB/s (Soft-Paging)',
      isWarning: true,
    },
    {
      metric: 'LSP Completion Latency',
      baseline: '38 ms',
      anomaly: '420 ms',
      delta: '+382 ms (11x slower)',
      isWarning: true,
    },
    {
      metric: 'Active Browser Tab Memory',
      baseline: '1.7 GB (12 tabs)',
      anomaly: '4.0 GB (42 tabs)',
      delta: '+2.3 GB',
      isWarning: false,
    },
    {
      metric: 'Terminal Process Peak',
      baseline: '420 MB (zsh)',
      anomaly: '6.2 GB (cargo test)',
      delta: '+5.78 GB (OOM Cause)',
      isWarning: true,
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 select-none">
      <div
        className={`max-w-2xl w-full border shadow-2xl flex flex-col ${
          isPrecision
            ? 'bg-[#181c22] border-[#3e484f] rounded-xs text-[#dfe2eb]'
            : 'bg-slate-900 border-slate-700 rounded-xl text-slate-100'
        }`}
      >
        {/* Header */}
        <div className="h-11 px-4 border-b border-slate-700/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#38bdf8]">compare</span>
            <span className="text-sm font-semibold font-mono">
              Telemetry Baseline vs Incident Comparison
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white cursor-pointer"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content Table */}
        <div className="p-4 flex flex-col gap-3 font-mono text-xs overflow-x-auto">
          <div className="grid grid-cols-12 pb-2 border-b border-slate-700/60 text-slate-400 text-[11px] font-semibold">
            <span className="col-span-4">Metric</span>
            <span className="col-span-3">Nominal (11:30)</span>
            <span className="col-span-2 text-rose-300">Peak (13:42:10)</span>
            <span className="col-span-3 text-right">Delta Difference</span>
          </div>

          <div className="flex flex-col gap-2">
            {rows.map((r, i) => (
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
        </div>

        {/* Footer */}
        <div className="h-12 px-4 border-t border-slate-700/60 flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-mono rounded cursor-pointer text-slate-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
