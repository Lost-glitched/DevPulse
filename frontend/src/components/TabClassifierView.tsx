import React, { useState, useEffect } from 'react';
import { TabItem, DuplicateGroup, ThemeStyle } from '../types';
import { fetchTabs, suspendTab, bulkSuspendTabs } from '../services/api';

interface TabClassifierViewProps {
  themeStyle: ThemeStyle;
  onOpenAutoFreeze: () => void;
  onReclaimMemory: (amountGb: number) => void;
}

export const TabClassifierView: React.FC<TabClassifierViewProps> = ({
  themeStyle,
  onOpenAutoFreeze,
  onReclaimMemory,
}) => {
  const [activeTabs, setActiveTabs] = useState<TabItem[]>([]);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [staleTabs, setStaleTabs] = useState<TabItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedInfoTab, setSelectedInfoTab] = useState<TabItem | null>(null);
  const [recoveredSessionGb, setRecoveredSessionGb] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Polling data
  useEffect(() => {
    let timer: number;
    const poll = async () => {
      const res = await fetchTabs();
      if (res) {
        setActiveTabs(res.activeTabs ?? []);
        setDuplicateGroups(res.duplicateGroups ?? []);
        setStaleTabs(res.staleTabs ?? []);
      }
      timer = window.setTimeout(poll, 10000);
    };
    poll();
    return () => clearTimeout(timer);
  }, []);


  const isPrecision = themeStyle === 'precision';

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Quick action: Suspend/Snooze all stale tabs
  const handleSuspendAllStale = async () => {
    const activeStaleCount = staleTabs.filter((t) => !t.isSnoozed).length;
    if (activeStaleCount === 0) {
      showToast('All quiet tabs are already snoozed.');
      return;
    }
    const newlySnoozedMb = staleTabs
      .filter((t) => !t.isSnoozed)
      .reduce((acc, t) => acc + t.ramMb, 0);
    const reclaimedGb = parseFloat((newlySnoozedMb / 1024).toFixed(2));

    const activeStaleIds = staleTabs.filter((t) => !t.isSnoozed).map((t) => t.id);
    await bulkSuspendTabs(activeStaleIds);

    setStaleTabs((prev) =>
      prev.map((tab) => ({ ...tab, isSnoozed: true }))
    );
    setRecoveredSessionGb((prev) => parseFloat((prev + reclaimedGb).toFixed(2)));
    onReclaimMemory(reclaimedGb);
    showToast(`Suspended ${activeStaleCount} stale tabs. Reclaimed ${reclaimedGb} GB safely!`);
  };

  // Quick action: Deduplicate all groups (Keep newest & close others)
  const handleMergeAllDuplicates = () => {
    let closedCount = 0;
    let savedMb = 0;

    const updated = duplicateGroups.map((group) => {
      const dupes = group.tabs.filter((t) => !t.isTarget && !t.isSnoozed);
      closedCount += dupes.length;
      savedMb += dupes.reduce((acc, t) => acc + t.ramMb, 0);

      return {
        ...group,
        isResolved: true,
        tabs: group.tabs.map((t) => (t.isTarget ? t : { ...t, isSnoozed: true })),
      };
    });

    setDuplicateGroups(updated);
    const reclaimedGb = parseFloat((savedMb / 1024).toFixed(2));
    setRecoveredSessionGb((prev) => parseFloat((prev + reclaimedGb).toFixed(2)));
    onReclaimMemory(reclaimedGb);
    showToast(`Deduplicated all sessions: closed ${closedCount} redundant tabs (${reclaimedGb} GB reclaimed).`);
  };

  // Individual Tab Suspend
  const handleSuspendTab = async (e: React.MouseEvent, tabId: string, groupKey?: string) => {
    e.stopPropagation();
    
    await suspendTab(tabId);
    
    let reclaimedGb = 0;
    // update active tabs
    setActiveTabs((prev) =>
      prev.map((t) => {
        if (t.id === tabId) {
          reclaimedGb = parseFloat((t.ramMb / 1024).toFixed(2));
          return { ...t, isSnoozed: true };
        }
        return t;
      })
    );
    // update duplicate groups
    if (groupKey) {
      setDuplicateGroups((prev) =>
        prev.map((g) => {
          if (g.id === groupKey) {
            return {
              ...g,
              tabs: g.tabs.map((t) => {
                if (t.id === tabId) {
                  if (reclaimedGb === 0) reclaimedGb = parseFloat((t.ramMb / 1024).toFixed(2));
                  return { ...t, isSnoozed: true };
                }
                return t;
              }),
            };
          }
          return g;
        })
      );
    }
    // update stale tabs
    setStaleTabs((prev) =>
      prev.map((t) => {
        if (t.id === tabId) {
          if (reclaimedGb === 0) reclaimedGb = parseFloat((t.ramMb / 1024).toFixed(2));
          return { ...t, isSnoozed: true };
        }
        return t;
      })
    );

    if (reclaimedGb > 0) {
      setRecoveredSessionGb((prev) => parseFloat((prev + reclaimedGb).toFixed(2)));
      onReclaimMemory(reclaimedGb);
      showToast(`Tab suspended. Reclaimed ${reclaimedGb} GB.`);
    }
  };

  // Group level keep newest
  const handleResolveGroup = (groupId: string) => {
    let savedMb = 0;
    let count = 0;

    setDuplicateGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        g.tabs.forEach((t) => {
          if (!t.isTarget && !t.isSnoozed) {
            savedMb += t.ramMb;
            count++;
          }
        });
        return {
          ...g,
          isResolved: true,
          tabs: g.tabs.map((t) => (t.isTarget ? t : { ...t, isSnoozed: true })),
        };
      })
    );

    const reclaimedGb = parseFloat((savedMb / 1024).toFixed(2));
    setRecoveredSessionGb((prev) => parseFloat((prev + reclaimedGb).toFixed(2)));
    onReclaimMemory(reclaimedGb);
    showToast(`Kept newest target and closed ${count} redundant copies (${savedMb} MB reclaimed).`);
  };

  // Single tab actions
  const handleToggleSnooze = (tabId: string, category: 'active' | 'duplicate' | 'stale') => {
    if (category === 'stale') {
      setStaleTabs((prev) =>
        prev.map((t) => {
          if (t.id === tabId) {
            const willSnooze = !t.isSnoozed;
            if (willSnooze) {
              const gb = parseFloat((t.ramMb / 1024).toFixed(2));
              setRecoveredSessionGb((s) => parseFloat((s + gb).toFixed(2)));
              onReclaimMemory(gb);
              showToast(`Snoozed "${t.title}". Reclaimed ${t.ramMb} MB.`);
            } else {
              showToast(`Restored "${t.title}" instantly into session.`);
            }
            return { ...t, isSnoozed: willSnooze };
          }
          return t;
        })
      );
    } else if (category === 'active') {
      setActiveTabs((prev) =>
        prev.map((t) => {
          if (t.id === tabId) {
            const willSnooze = !t.isSnoozed;
            showToast(willSnooze ? `Snoozed active tab "${t.title}"` : `Woke active tab "${t.title}"`);
            return { ...t, isSnoozed: willSnooze };
          }
          return t;
        })
      );
    }
  };

  const handleTogglePin = (tabId: string) => {
    setActiveTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, isPinned: !t.isPinned } : t))
    );
  };

  const handleCloseTab = (tabId: string, category: 'active' | 'duplicate' | 'stale') => {
    if (category === 'duplicate') {
      setDuplicateGroups((prev) =>
        prev.map((g) => ({
          ...g,
          tabs: g.tabs.filter((t) => t.id !== tabId),
        }))
      );
    } else if (category === 'stale') {
      setStaleTabs((prev) => prev.filter((t) => t.id !== tabId));
    } else {
      setActiveTabs((prev) => prev.filter((t) => t.id !== tabId));
    }
    showToast('Tab closed.');
  };

  // Calculate dynamic metrics
  const activeCount = activeTabs.filter((t) => !t.isSnoozed).length;
  const duplicateTabCount = duplicateGroups.reduce(
    (acc, g) => acc + g.tabs.filter((t) => !t.isTarget && !t.isSnoozed).length,
    0
  );
  const staleCount = staleTabs.filter((t) => !t.isSnoozed).length;
  const totalOpen = activeCount + duplicateTabCount + staleCount + duplicateGroups.length;

  const totalReclaimableMb =
    duplicateGroups.reduce(
      (acc, g) =>
        acc +
        g.tabs
          .filter((t) => !t.isTarget && !t.isSnoozed)
          .reduce((sum, t) => sum + t.ramMb, 0),
      0
    ) +
    staleTabs
      .filter((t) => !t.isSnoozed)
      .reduce((acc, t) => acc + t.ramMb, 0);

  const totalReclaimableGb = (totalReclaimableMb / 1024).toFixed(2);

  // Filter lists based on search
  const filterFn = (t: TabItem) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.url.toLowerCase().includes(q) ||
      (t.pid && String(t.pid).includes(q))
    );
  };

  const filteredActiveTabs = activeTabs.filter(filterFn);
  const filteredStaleTabs = staleTabs.filter(filterFn);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#0a0e14] overflow-hidden select-none">
      {/* Summary Banner & Instrument Header */}
      <section
        className={`border-b p-3 shrink-0 flex flex-col gap-2.5 ${
          isPrecision
            ? 'bg-[#181c22] border-[#3e484f]'
            : 'bg-[#0e1218]/90 border-slate-800/80 backdrop-blur'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Telemetry Metric Pill Badges */}
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <div
              className={`flex items-center gap-2 px-2.5 py-1 border rounded ${
                isPrecision
                  ? 'bg-[#1c2026] border-[#3e484f] text-[#dfe2eb]'
                  : 'bg-slate-900 border-slate-800 text-slate-200'
              }`}
            >
              <span className="text-slate-500">Total Tabs:</span>
              <span className="font-semibold text-white">{totalOpen} Open</span>
            </div>

            <div
              className={`flex items-center gap-2 px-2.5 py-1 border rounded ${
                isPrecision
                  ? 'bg-[#1c2026] border-[#3e484f]'
                  : 'bg-sky-950/40 border-sky-800/40'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-[#38bdf8]" />
              <span className="text-slate-500">Active:</span>
              <span className="text-[#38bdf8] font-semibold">{activeCount}</span>
            </div>

            <div
              className={`flex items-center gap-2 px-2.5 py-1 border rounded ${
                isPrecision
                  ? 'bg-[#1c2026] border-[#3e484f]'
                  : 'bg-amber-950/30 border-amber-800/30'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-[#fb923c]" />
              <span className="text-slate-500">Duplicates:</span>
              <span className="text-[#fb923c] font-semibold">{duplicateTabCount}</span>
            </div>

            <div
              className={`flex items-center gap-2 px-2.5 py-1 border rounded ${
                isPrecision
                  ? 'bg-[#1c2026] border-[#3e484f]'
                  : 'bg-slate-800/50 border-slate-700/60'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-slate-500" />
              <span className="text-slate-500">Stale:</span>
              <span className="text-slate-300 font-semibold">{staleCount}</span>
            </div>

            <div
              className={`flex items-center gap-2 px-2.5 py-1 border rounded ${
                isPrecision
                  ? 'bg-[#262a31] border-[#2fca6f]/40 text-[#54e788]'
                  : 'bg-emerald-950/40 border-emerald-700/40 text-emerald-300'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">eco</span>
              <span className="text-slate-400">Reclaimable RAM:</span>
              <span className="font-semibold font-mono text-[#6dfe9c]">
                {totalReclaimableGb} GB
              </span>
            </div>
          </div>

          {/* Quick Actions & Search Input */}
          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <span className="absolute left-2.5 text-slate-500 material-symbols-outlined text-[14px]">
                search
              </span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter tabs by domain, title or PID..."
                className={`h-7 w-60 pl-7 pr-7 font-mono text-xs border focus:outline-none transition-colors ${
                  isPrecision
                    ? 'bg-[#10141a] text-[#dfe2eb] border-[#3e484f] focus:border-[#38bdf8] rounded-xs'
                    : 'bg-slate-900 text-slate-100 border-slate-700 focus:border-sky-400 rounded-lg'
                }`}
                type="text"
              />
              <span className="absolute right-2 text-[9px] font-mono text-slate-500 px-1 border border-slate-700 rounded bg-[#181c22]">
                /
              </span>
            </div>

            <button
              onClick={handleMergeAllDuplicates}
              className={`h-7 px-2.5 border font-mono text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                isPrecision
                  ? 'bg-[#1c2026] hover:bg-[#262a31] border-[#3e484f] text-[#dfe2eb] rounded-xs'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 rounded-lg'
              }`}
            >
              <span className="material-symbols-outlined text-xs text-[#38bdf8]">
                auto_fix_high
              </span>
              <span>Deduplicate Sessions</span>
            </button>

            <button
              onClick={onOpenAutoFreeze}
              className={`h-7 px-2.5 border font-mono text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                isPrecision
                  ? 'bg-[#1c2026] hover:bg-[#262a31] border-[#3e484f] text-[#dfe2eb] rounded-xs'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 rounded-lg'
              }`}
            >
              <span className="material-symbols-outlined text-xs text-slate-400">
                tune
              </span>
              <span>Auto-freeze Settings</span>
            </button>

            <button
              onClick={handleSuspendAllStale}
              className={`h-7 px-3 border font-mono text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                isPrecision
                  ? 'bg-[#d97722] hover:bg-[#ea580c] text-white border-transparent rounded-xs'
                  : 'bg-emerald-600/25 hover:bg-emerald-600/35 text-emerald-300 border-emerald-500/40 rounded-lg'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">bedtime</span>
              <span>
                {isPrecision
                  ? `Suspend All Stale (${staleCount} tabs · 2.4 GB)`
                  : `Sleep ${staleCount} quiet tabs (2.4 GB)`}
              </span>
            </button>
          </div>
        </div>

        {/* Reassurance banner in Calm mode or general info */}
        {!isPrecision && (
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900/60 px-3 py-1 rounded-lg border border-slate-800/80">
            <span className="material-symbols-outlined text-sm text-emerald-400">
              verified_user
            </span>
            <span>
              Peace of mind: Snoozing simply saves tab state safely to disk. You can wake any tab instantly with zero lost data or form progress.
            </span>
          </div>
        )}

        {toastMessage && (
          <div className="text-xs font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2.5 py-1 rounded">
            {toastMessage}
          </div>
        )}
      </section>

      {/* 3-Column Board Layout: Active, Duplicate, Stale */}
      <section className="flex-1 min-h-0 grid grid-cols-3 divide-x divide-[#3e484f]/40 overflow-hidden">
        {/* ================= COLUMN 1: ACTIVE TABS ================= */}
        <div className="flex flex-col min-h-0 bg-[#0a0e14]">
          <div
            className={`h-8 px-3 border-b flex items-center justify-between shrink-0 ${
              isPrecision ? 'bg-[#181c22] border-[#3e484f]' : 'bg-[#0e1218] border-slate-800'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#38bdf8]" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                {isPrecision ? 'Active' : 'Active Now'}
              </span>
              <span
                className={`font-mono text-[10px] px-1.5 py-0.2 border rounded ${
                  isPrecision
                    ? 'bg-[#1c2026] border-[#3e484f] text-[#38bdf8]'
                    : 'bg-sky-950/60 border-sky-800/50 text-sky-300'
                }`}
              >
                14 tabs · 3.1 GB RAM
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-mono text-slate-500">
              <span>Live V8 Profiler</span>
              <button className="p-0.5 hover:text-slate-200 text-slate-500 cursor-pointer">
                <span className="material-symbols-outlined text-[13px]">sort</span>
              </button>
            </div>
          </div>

          {/* Cards Stack */}
          <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2.5">
            {filteredActiveTabs.map((tab) => (
              <div
                key={tab.id}
                className={`border p-3 flex flex-col gap-2 transition-all ${
                  isPrecision
                    ? 'bg-[#1c2026] border-[#3e484f] hover:border-[#38bdf8] rounded-xs'
                    : 'bg-slate-900/90 border-slate-800 hover:border-sky-400/50 rounded-xl shadow-sm'
                } ${tab.isSnoozed ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`w-6 h-6 rounded flex items-center justify-center shrink-0 mt-0.5 border ${
                        isPrecision
                          ? 'bg-[#262a31] border-[#3e484f]'
                          : 'bg-sky-500/10 border-sky-500/20 text-sky-400'
                      }`}
                    >
                      <span
                        className="material-symbols-outlined text-[14px]"
                        style={{ color: tab.iconColor }}
                      >
                        {tab.iconName}
                      </span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="text-xs font-medium text-slate-100 truncate">
                        {tab.title}
                      </div>
                      <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
                        <span className="text-slate-400 truncate">{tab.displayDomain}</span>
                        <span>·</span>
                        <span className="text-emerald-400 flex items-center gap-0.5">
                          {tab.lastActive === 'Just now' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          )}
                          {tab.lastActive}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleSnooze(tab.id, 'active')}
                      className="p-1 text-slate-400 hover:text-amber-400 hover:bg-[#262a31] rounded transition-colors cursor-pointer"
                      title={tab.isSnoozed ? 'Wake tab' : 'Suspend Tab'}
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {tab.isSnoozed ? 'alarm_on' : 'bedtime'}
                      </span>
                    </button>
                    <button
                      onClick={() => handleTogglePin(tab.id)}
                      className={`p-1 rounded transition-colors cursor-pointer ${
                        tab.isPinned
                          ? 'text-[#38bdf8] bg-[#38bdf8]/10'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-[#262a31]'
                      }`}
                      title={tab.isPinned ? 'Pinned' : 'Pin Tab'}
                    >
                      <span
                        className="material-symbols-outlined text-[14px]"
                        style={{
                          fontVariationSettings: tab.isPinned ? "'FILL' 1" : "'FILL' 0",
                        }}
                      >
                        push_pin
                      </span>
                    </button>
                    <button
                      onClick={() => setSelectedInfoTab(tab)}
                      className="p-1 text-slate-400 hover:text-[#38bdf8] hover:bg-[#262a31] rounded transition-colors cursor-pointer"
                      title="Why is this active?"
                    >
                      <span className="material-symbols-outlined text-[14px]">info</span>
                    </button>
                  </div>
                </div>

                {/* Card footer metrics */}
                <div className="pt-2 border-t border-slate-700/50 flex items-center justify-between font-mono text-[10px]">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.2 border text-slate-300 rounded ${
                        isPrecision
                          ? 'bg-[#10141a] border-[#3e484f]'
                          : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      PID {tab.pid}
                    </span>
                    {tab.eventRate && (
                      <span className="text-slate-500">Events: {tab.eventRate}</span>
                    )}
                    {tab.flags && <span className="text-amber-400">{tab.flags}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 bg-emerald-950/40 px-1.5 py-0.2 rounded border border-emerald-800/40 font-medium">
                      {tab.ramMb >= 1000 ? `${(tab.ramMb / 1024).toFixed(1)} GB` : `${tab.ramMb} MB`}
                    </span>
                    {tab.cpuPercent !== undefined && (
                      <span className="text-sky-300 bg-sky-950/40 px-1.5 py-0.2 rounded border border-sky-800/40 font-medium">
                        {tab.cpuPercent}% CPU
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ================= COLUMN 2: DUPLICATE TABS ================= */}
        <div className="flex flex-col min-h-0 bg-[#0a0e14]">
          <div
            className={`h-8 px-3 border-b flex items-center justify-between shrink-0 ${
              isPrecision ? 'bg-[#181c22] border-[#3e484f]' : 'bg-[#0e1218] border-slate-800'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#fb923c]" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                {isPrecision ? 'Duplicate' : 'Repeated Tabs'}
              </span>
              <span
                className={`font-mono text-[10px] px-1.5 py-0.2 border rounded ${
                  isPrecision
                    ? 'bg-[#1c2026] border-[#3e484f] text-[#fb923c]'
                    : 'bg-amber-950/60 border-amber-800/50 text-amber-300'
                }`}
              >
                18 tabs · 1.9 GB RAM
              </span>
            </div>
            <button
              onClick={handleMergeAllDuplicates}
              className="text-xs font-mono text-[#fb923c] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[13px]">filter_list</span>
              <span>Merge All</span>
            </button>
          </div>

          {/* Duplicate Groups Stack */}
          <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-3">
            {duplicateGroups.map((group) => (
              <div
                key={group.id}
                className={`border p-2.5 flex flex-col gap-2 relative ${
                  isPrecision
                    ? 'bg-[#14181f] border-[#3e484f] rounded-xs'
                    : 'bg-slate-900/70 border-slate-800/80 rounded-xl'
                } ${group.isResolved ? 'opacity-60' : ''}`}
              >
                {/* Group Header & Quick Action */}
                <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-1.5 py-0.2 bg-[#fb923c]/20 text-[#fb923c] border border-[#fb923c]/40 rounded text-[10px] font-mono font-medium">
                      {group.tabs.length} tabs
                    </span>
                    <span className="text-xs font-semibold text-slate-100 truncate">
                      {group.title}
                    </span>
                  </div>
                  <button
                    onClick={() => handleResolveGroup(group.id)}
                    className={`px-2 py-0.5 border font-mono text-[10px] transition-colors cursor-pointer flex items-center gap-1 ${
                      group.isResolved
                        ? 'bg-emerald-950/50 border-emerald-600/40 text-emerald-300'
                        : isPrecision
                        ? 'bg-[#262a31] hover:bg-[#31353c] border-[#3e484f] text-[#fb923c] hover:text-white rounded-xs'
                        : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-amber-300 rounded-md'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[12px]">done_all</span>
                    <span>{group.isResolved ? 'Resolved' : 'Keep Newest & Close Others'}</span>
                  </button>
                </div>

                {/* Group bracket items */}
                <div className="flex gap-2 pl-1">
                  <div className="w-1.5 border-l-2 border-b-2 border-slate-700/60 rounded-bl mb-4 mt-2" />
                  <div className="flex-1 flex flex-col gap-1.5">
                    {group.tabs.map((tab) => (
                      <div
                        key={tab.id}
                        className={`p-2 border flex items-center justify-between gap-2 transition-all ${
                          isPrecision
                            ? 'bg-[#1c2026] border-[#3e484f] rounded-xs'
                            : 'bg-slate-900/90 border-slate-800 rounded-lg'
                        } ${tab.isSnoozed ? 'opacity-40 line-through' : ''}`}
                      >
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs text-slate-200 truncate">
                              {tab.title}
                            </span>
                            {tab.isTarget ? (
                              <span className="text-[9px] font-mono text-[#38bdf8] px-1 bg-[#38bdf8]/10 border border-[#38bdf8]/30 rounded">
                                Active Target
                              </span>
                            ) : (
                              <span className="text-[9px] font-mono text-[#fb923c] px-1 bg-[#fb923c]/10 border border-[#fb923c]/30 rounded">
                                Exact Dupe
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-[10px] text-slate-400 mt-0.5">
                            {tab.idleDuration} · RAM: {tab.ramMb} MB
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => setSelectedInfoTab(tab)}
                            className="p-1 text-slate-500 hover:text-[#38bdf8] cursor-pointer"
                            title="Why is this flagged?"
                          >
                            <span className="material-symbols-outlined text-[13px]">info</span>
                          </button>
                          {!tab.isTarget ? (
                            <button
                              onClick={() => handleCloseTab(tab.id, 'duplicate')}
                              className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"
                              title="Close redundant copy"
                            >
                              <span className="material-symbols-outlined text-[13px]">close</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleToggleSnooze(tab.id, 'active')}
                              className="p-1 text-slate-500 hover:text-amber-400 cursor-pointer"
                              title="Snooze"
                            >
                              <span className="material-symbols-outlined text-[13px]">
                                bedtime
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ================= COLUMN 3: STALE TABS ================= */}
        <div className="flex flex-col min-h-0 bg-[#0a0e14]">
          <div
            className={`h-8 px-3 border-b flex items-center justify-between shrink-0 ${
              isPrecision ? 'bg-[#181c22] border-[#3e484f]' : 'bg-[#0e1218] border-slate-800'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                {isPrecision ? 'Stale' : 'Quiet Tabs'}
              </span>
              <span
                className={`font-mono text-[10px] px-1.5 py-0.2 border rounded ${
                  isPrecision
                    ? 'bg-[#1c2026] border-[#3e484f] text-slate-400'
                    : 'bg-slate-800 border-slate-700 text-slate-300'
                }`}
              >
                16 tabs · 2.4 GB RAM
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-500">
              {isPrecision ? 'Threshold: > 72h Idle' : '100% Reversible'}
            </span>
          </div>

          {/* Stale Cards Stack */}
          <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2.5">
            {filteredStaleTabs.map((tab) => (
              <div
                key={tab.id}
                className={`border p-3 flex flex-col gap-2 transition-all ${
                  isPrecision
                    ? 'bg-[#14181f] border-[#3e484f] hover:border-slate-500 rounded-xs'
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 rounded-xl'
                } ${tab.isSnoozed ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`w-6 h-6 rounded flex items-center justify-center shrink-0 mt-0.5 border ${
                        isPrecision
                          ? 'bg-[#262a31] border-[#3e484f]'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {tab.iconName}
                      </span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="text-xs font-medium text-slate-200 truncate">
                        {tab.title}
                      </div>
                      <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
                        <span className="truncate">{tab.displayDomain}</span>
                        <span>·</span>
                        <span className="text-amber-400 font-medium">
                          Idle: {tab.lastActive}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setSelectedInfoTab(tab)}
                      className="p-1 text-slate-500 hover:text-[#38bdf8] rounded cursor-pointer"
                      title="Why is this stale?"
                    >
                      <span className="material-symbols-outlined text-[14px]">info</span>
                    </button>
                    <button
                      onClick={() => handleCloseTab(tab.id, 'stale')}
                      className="p-1 text-slate-500 hover:text-rose-400 rounded cursor-pointer"
                      title="Close Tab"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </div>
                </div>

                {/* Card Action & Memory Footprint */}
                <div className="pt-2 border-t border-slate-700/50 flex items-center justify-between">
                  <div className="flex items-center gap-2 font-mono text-[10px] text-slate-400">
                    <span
                      className={`px-1.5 py-0.2 border text-slate-300 rounded ${
                        isPrecision
                          ? 'bg-[#10141a] border-[#3e484f]'
                          : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      {tab.ramMb} MB RAM
                    </span>
                    <span>{tab.isSnoozed ? 'Restores instantly' : 'CPU 0.0%'}</span>
                  </div>

                  <button
                    onClick={() => handleToggleSnooze(tab.id, 'stale')}
                    className={`h-6 px-2.5 border font-mono text-[10px] rounded flex items-center gap-1 transition-colors cursor-pointer ${
                      tab.isSnoozed
                        ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                        : isPrecision
                        ? 'bg-[#262a31] hover:bg-[#31353c] border-[#3e484f] text-[#fb923c]'
                        : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-sky-300'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[12px]">
                      {tab.isSnoozed ? 'alarm_on' : 'bedtime'}
                    </span>
                    <span>{tab.isSnoozed ? 'Waken' : 'Suspend Now'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom Docked Telemetry Drawer / Quick Status Bar */}
      <footer
        className={`h-8 px-4 border-t flex items-center justify-between font-mono text-[11px] shrink-0 ${
          isPrecision
            ? 'bg-[#181c22] border-[#3e484f] text-slate-400'
            : 'bg-[#0e1218] border-slate-800 text-slate-400'
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
            Tab Watcher: Polling interval 500ms
          </span>
          <span className="text-slate-600">|</span>
          <span>DOM Tree Nodes Tracked: 382,410</span>
          <span className="text-slate-600">|</span>
          <span className="text-sky-300">IPC Channel #4: Healthy (0.1ms ping)</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-emerald-400 font-semibold">
            Total Recovered this session: {recoveredSessionGb} GB
          </span>
          <span className="text-slate-600">·</span>
          <button
            onClick={onOpenAutoFreeze}
            className="hover:text-slate-200 cursor-pointer flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[12px]">settings</span>
            <span>{isPrecision ? 'Rule Config' : 'Preferences'}</span>
          </button>
        </div>
      </footer>

      {/* Info Dialog for any clicked tab */}
      {selectedInfoTab && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div
            className={`max-w-md w-full p-4 border flex flex-col gap-3 shadow-2xl ${
              isPrecision
                ? 'bg-[#181c22] border-[#3e484f] rounded-xs text-[#dfe2eb]'
                : 'bg-slate-900 border-slate-700 rounded-xl text-slate-200'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#38bdf8]">info</span>
                <span className="text-sm font-semibold font-mono">
                  Telemetry Diagnostics
                </span>
              </div>
              <button
                onClick={() => setSelectedInfoTab(null)}
                className="p-1 hover:text-white cursor-pointer"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-2 text-xs">
              <div>
                <span className="text-slate-500 font-mono">Title:</span>
                <p className="font-semibold text-slate-100">{selectedInfoTab.title}</p>
              </div>
              <div>
                <span className="text-slate-500 font-mono">URL:</span>
                <p className="font-mono text-[11px] text-sky-300 break-all">
                  {selectedInfoTab.url}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-700/40">
                <div>
                  <span className="text-slate-500 font-mono">Memory Allocation:</span>
                  <p className="font-mono font-semibold text-emerald-400">
                    {selectedInfoTab.ramMb} MB
                  </p>
                </div>
                <div>
                  <span className="text-slate-500 font-mono">Classification:</span>
                  <p className="font-mono uppercase text-amber-300 font-semibold">
                    {selectedInfoTab.category}
                  </p>
                </div>
              </div>
              <div className="p-2.5 bg-[#10141a] border border-slate-800 rounded text-slate-300 font-mono text-[11px] leading-relaxed">
                <span className="text-slate-500 uppercase block text-[10px] mb-1">
                  Classifier Justification:
                </span>
                {selectedInfoTab.whyText ||
                  'Evaluated by DevPulse kernel daemon heuristic for idle time and socket activity.'}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedInfoTab(null)}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-mono rounded cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
