import React, { useState } from 'react';
import { ThemeStyle } from '../types';

interface AutoFreezeModalProps {
  isOpen: boolean;
  onClose: () => void;
  themeStyle: ThemeStyle;
  onApplyRules: (settings: any) => void;
}

export const AutoFreezeModal: React.FC<AutoFreezeModalProps> = ({
  isOpen,
  onClose,
  themeStyle,
  onApplyRules,
}) => {
  const [idleHours, setIdleHours] = useState<number>(2);
  const [ramThresholdMb, setRamThresholdMb] = useState<number>(450);
  const [protectPinned, setProtectPinned] = useState<boolean>(true);
  const [protectAudio, setProtectAudio] = useState<boolean>(true);
  const [autoReclaimGpu, setAutoReclaimGpu] = useState<boolean>(true);

  if (!isOpen) return null;

  const isPrecision = themeStyle === 'precision';

  const handleSave = () => {
    onApplyRules({
      idleHours,
      ramThresholdMb,
      protectPinned,
      protectAudio,
      autoReclaimGpu,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 select-none">
      <div
        className={`max-w-md w-full border shadow-2xl flex flex-col ${
          isPrecision
            ? 'bg-[#181c22] border-[#3e484f] rounded-xs text-[#dfe2eb]'
            : 'bg-slate-900 border-slate-700 rounded-xl text-slate-100'
        }`}
      >
        {/* Header */}
        <div className="h-11 px-4 border-b border-slate-700/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-400">tune</span>
            <span className="text-sm font-semibold font-mono">
              Auto-Freeze &amp; Tab Sleep Rules
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
        <div className="p-4 flex flex-col gap-4 text-xs font-mono">
          {/* Rule 1: Idle Timeout */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label className="text-slate-300">Idle Sleep Timeout</label>
              <span className="text-[#38bdf8] font-bold">{idleHours} hours</span>
            </div>
            <input
              type="range"
              min="1"
              max="24"
              value={idleHours}
              onChange={(e) => setIdleHours(Number(e.target.value))}
              className="w-full accent-[#38bdf8] cursor-pointer"
            />
            <span className="text-[10px] text-slate-500">
              Tabs without user interaction or network focus exceeding this threshold will automatically enter low-power sleep.
            </span>
          </div>

          {/* Rule 2: Memory Ceiling */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label className="text-slate-300">Individual Tab RSS Cap</label>
              <span className="text-amber-400 font-bold">{ramThresholdMb} MB</span>
            </div>
            <input
              type="range"
              min="100"
              max="1500"
              step="50"
              value={ramThresholdMb}
              onChange={(e) => setRamThresholdMb(Number(e.target.value))}
              className="w-full accent-amber-400 cursor-pointer"
            />
            <span className="text-[10px] text-slate-500">
              Flag tabs that exceed this memory footprint as high-utilization candidates.
            </span>
          </div>

          {/* Toggles */}
          <div className="flex flex-col gap-2.5 pt-2 border-t border-slate-700/50">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-slate-300">Protect Pinned Tabs from Auto-Freeze</span>
              <input
                type="checkbox"
                checked={protectPinned}
                onChange={(e) => setProtectPinned(e.target.checked)}
                className="accent-[#38bdf8] cursor-pointer"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-slate-300">Protect Tabs with Active Audio / WebRTC</span>
              <input
                type="checkbox"
                checked={protectAudio}
                onChange={(e) => setProtectAudio(e.target.checked)}
                className="accent-[#38bdf8] cursor-pointer"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-slate-300">Auto-purge Inactive WebGL Buffers</span>
              <input
                type="checkbox"
                checked={autoReclaimGpu}
                onChange={(e) => setAutoReclaimGpu(e.target.checked)}
                className="accent-[#38bdf8] cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="h-12 px-4 border-t border-slate-700/60 flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-mono rounded cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1 bg-[#38bdf8] hover:bg-sky-400 text-slate-950 font-semibold text-xs font-mono rounded cursor-pointer"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};
