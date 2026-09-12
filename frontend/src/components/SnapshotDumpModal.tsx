import React, { useState } from 'react';
import { ThemeStyle, ProcessNode } from '../types';

interface SnapshotDumpModalProps {
  isOpen: boolean;
  onClose: () => void;
  processes: ProcessNode[];
  themeStyle: ThemeStyle;
  systemMemoryUsedGb: number;
}

export const SnapshotDumpModal: React.FC<SnapshotDumpModalProps> = ({
  isOpen,
  onClose,
  processes,
  themeStyle,
  systemMemoryUsedGb,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const isPrecision = themeStyle === 'precision';

  const dumpObject = {
    app: 'DevPulse Telemetry Engine',
    version: '2.14.8-telemetry',
    timestamp: new Date().toISOString(),
    session_id: 'sess-89104-prod-core',
    host_metrics: {
      total_ram_gb: 16.0,
      allocated_ram_gb: parseFloat(systemMemoryUsedGb.toFixed(2)),
      utilization_percentage: parseFloat(((systemMemoryUsedGb / 16) * 100).toFixed(1)),
      cpu_cores_active: 8,
      kernel_version: '6.5.0-35-generic',
      active_subsystems: ['ide', 'terminal', 'containers', 'browser'],
    },
    monitored_processes: processes.map((p) => ({
      id: p.id,
      pid: p.pid,
      name: p.name,
      subsystem: p.subsystem,
      memory_allocation_gb: p.ramGb,
      cpu_percent: p.cpuPercent,
      is_flagged_cause: !!p.isCause,
      leak_rate: p.leakRate || null,
      recommendation: p.recommendation || null,
    })),
  };

  const jsonString = JSON.stringify(dumpObject, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `devpulse-snapshot-${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 select-none">
      <div
        className={`max-w-2xl w-full max-h-[85vh] flex flex-col border shadow-2xl ${
          isPrecision
            ? 'bg-[#181c22] border-[#3e484f] rounded-xs text-[#dfe2eb]'
            : 'bg-slate-900 border-slate-700 rounded-xl text-slate-100'
        }`}
      >
        {/* Header */}
        <div className="h-11 px-4 border-b border-slate-700/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#38bdf8]">receipt_long</span>
            <span className="text-sm font-semibold font-mono">
              Raw Telemetry Snapshot Dump
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/30 rounded">
              JSON v2
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white cursor-pointer"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 overflow-y-auto font-mono text-xs">
          <pre className="p-3 bg-[#0c1017] border border-slate-800 rounded text-sky-200 overflow-x-auto leading-relaxed select-text">
            {jsonString}
          </pre>
        </div>

        {/* Footer actions */}
        <div className="h-12 px-4 border-t border-slate-700/60 flex items-center justify-between shrink-0">
          <span className="text-[11px] font-mono text-slate-400">
            {processes.length} processes registered in kernel table
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-mono rounded border border-slate-600 flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-xs">
                {copied ? 'done' : 'content_copy'}
              </span>
              <span>{copied ? 'Copied!' : 'Copy JSON'}</span>
            </button>
            <button
              onClick={handleDownload}
              className="px-3 py-1 bg-[#38bdf8] hover:bg-sky-400 text-slate-950 font-semibold text-xs font-mono rounded flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-xs">download</span>
              <span>Download File</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
