import React, { useState, useEffect } from 'react';
import { ViewMode, ThemeStyle, ProcessNode } from './types';
import { fetchResources, checkBackendHealth } from './services/api';
import { TopNavBar } from './components/TopNavBar';
import { SideNav } from './components/SideNav';
import { ResourceTreemapView } from './components/ResourceTreemapView';
import { TabClassifierView } from './components/TabClassifierView';
import { SessionTimelineView } from './components/SessionTimelineView';
import { SnapshotDumpModal } from './components/SnapshotDumpModal';
import { AutoFreezeModal } from './components/AutoFreezeModal';
import { BaselineCompareModal } from './components/BaselineCompareModal';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewMode>('treemap');
  const [themeStyle, setThemeStyle] = useState<ThemeStyle>('precision');
  const [isObserverPaused, setIsObserverPaused] = useState<boolean>(false);
  
  const [processes, setProcesses] = useState<ProcessNode[]>([]);
  const [selectedProcessId, setSelectedProcessId] = useState<string>('proc-webpack');
  const [systemMemoryUsedGb, setSystemMemoryUsedGb] = useState<number>(0);
  const [isBackendConnected, setIsBackendConnected] = useState(true);

  // Modals
  const [isSnapshotOpen, setIsSnapshotOpen] = useState<boolean>(false);
  const [isAutoFreezeOpen, setIsAutoFreezeOpen] = useState<boolean>(false);
  const [isBaselineOpen, setIsBaselineOpen] = useState<boolean>(false);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.key === '1') setCurrentView('treemap');
      if (e.key === '2') setCurrentView('tabs');
      if (e.key === '3') setCurrentView('timeline');
      if (e.key.toLowerCase() === 'p') {
        setThemeStyle((prev) => (prev === 'precision' ? 'calm' : 'precision'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Polling data
  useEffect(() => {
    let timer: number;
    
    const poll = async () => {
      if (!isObserverPaused) {
        const res = await fetchResources();
        if (res) {
          setProcesses(res.processes);
          setSystemMemoryUsedGb(res.systemMemoryUsedGb);
        }
      }
      timer = window.setTimeout(poll, 2000);
    };
    
    // Initial fetch
    checkBackendHealth().then(isHealthy => setIsBackendConnected(isHealthy));
    poll();
    
    return () => clearTimeout(timer);
  }, [isObserverPaused]);

  // Process actions
  const handleIsolateProcess = (id: string) => {
    setProcesses((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              details: `${p.details} [SANDBOXED]`,
              statusText: 'ISOLATED',
              cpuPercent: Math.max(0.1, Number((p.cpuPercent * 0.4).toFixed(1))),
            }
          : p
      )
    );
  };

  const handleRestartProcess = (id: string) => {
    setProcesses((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          const newPid = Math.floor(10000 + Math.random() * 89999);
          const nominalRam = Number((p.ramGb * 0.35).toFixed(2));
          return {
            ...p,
            pid: newPid,
            ramGb: nominalRam,
            ramDisplay: `${nominalRam} GB`,
            leakRate: undefined,
            isCause: false,
            causeBadgeText: undefined,
            cpuPercent: 1.2,
          };
        }
        return p;
      })
    );
    // Lower system memory
    setSystemMemoryUsedGb((mem) => Math.max(4.0, Number((mem - 0.72).toFixed(2))));
  };

  const handleKillProcess = (id: string) => {
    const proc = processes.find((p) => p.id === id);
    if (!proc) return;
    setProcesses((prev) => prev.filter((p) => p.id !== id));
    setSystemMemoryUsedGb((mem) => Math.max(3.5, Number((mem - proc.ramGb).toFixed(2))));
  };

  const handleReclaimMemory = (amountGb: number) => {
    setSystemMemoryUsedGb((mem) => Math.max(3.5, Number((mem - amountGb).toFixed(2))));
  };

  const handleNavigateToTreemap = (processId?: string) => {
    if (processId) {
      setSelectedProcessId(processId);
    }
    setCurrentView('treemap');
  };

  return (
    <div
      className={`flex h-screen w-screen overflow-hidden ${
        themeStyle === 'precision'
          ? 'bg-[#10141a] text-[#dfe2eb]'
          : 'bg-[#0b0f14] text-slate-100'
      }`}
    >
      {/* Side Navigation Bar */}
      <SideNav
        currentView={currentView}
        onViewChange={setCurrentView}
        themeStyle={themeStyle}
        activeTabsCount={48}
      />

      {/* Main App Workspace */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header Dock */}
        <TopNavBar
          currentView={currentView}
          themeStyle={themeStyle}
          onThemeStyleChange={setThemeStyle}
          isObserverPaused={isObserverPaused}
          onToggleObserver={() => setIsObserverPaused(!isObserverPaused)}
          onOpenSnapshotDump={() => setIsSnapshotOpen(true)}
          systemMemoryUsedGb={systemMemoryUsedGb}
        />

        {/* Dynamic View Display */}
        <div className="flex-1 flex min-h-0 overflow-hidden relative">
          {currentView === 'treemap' && (
            <ResourceTreemapView
              processes={processes}
              selectedProcessId={selectedProcessId}
              onSelectProcess={setSelectedProcessId}
              onIsolateProcess={handleIsolateProcess}
              onRestartProcess={handleRestartProcess}
              onKillProcess={handleKillProcess}
              themeStyle={themeStyle}
            />
          )}

          {currentView === 'tabs' && (
            <TabClassifierView
              themeStyle={themeStyle}
              onOpenAutoFreeze={() => setIsAutoFreezeOpen(true)}
              onReclaimMemory={handleReclaimMemory}
            />
          )}

          {currentView === 'timeline' && (
            <SessionTimelineView
              themeStyle={themeStyle}
              onNavigateToTreemap={handleNavigateToTreemap}
              onOpenBaselineCompare={() => setIsBaselineOpen(true)}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      <SnapshotDumpModal
        isOpen={isSnapshotOpen}
        onClose={() => setIsSnapshotOpen(false)}
        processes={processes}
        themeStyle={themeStyle}
        systemMemoryUsedGb={systemMemoryUsedGb}
      />

      <AutoFreezeModal
        isOpen={isAutoFreezeOpen}
        onClose={() => setIsAutoFreezeOpen(false)}
        themeStyle={themeStyle}
        onApplyRules={() => {}}
      />

      <BaselineCompareModal
        isOpen={isBaselineOpen}
        onClose={() => setIsBaselineOpen(false)}
        themeStyle={themeStyle}
      />
    </div>
  );
}

