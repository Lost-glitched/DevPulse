/**
 * DevPulse Tab Tracker — Chrome Extension Background Service Worker
 *
 * Connects to the DevPulse backend over WebSocket and streams tab lifecycle
 * events (open, close, focus, update) in real time.  Tracks cumulative
 * active_ms_total per tab and sends periodic heartbeats.  Listens for
 * suspend_tab / restore_tab commands pushed from the backend.
 */

const WS_URL = "ws://127.0.0.1:8000/ws/tabs";
const RECONNECT_DELAY_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 30000;

let ws = null;
let heartbeatTimer = null;

// Per-tab tracking state
// { [tabId]: { active_ms_total, last_activated_at, url, title, favicon_url } }
const tabState = {};

// Currently active tab + whether the browser window is focused
let activeTabId = null;
let windowFocused = true;

// ─── WebSocket Connection ───────────────────────────────────────────

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    ws = new WebSocket(WS_URL);
  } catch (e) {
    console.debug("[DevPulse] WebSocket creation failed, retrying...", e);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log("[DevPulse] Connected to backend WebSocket");
    startHeartbeat();
    // Send current tab snapshot on connect
    sendCurrentTabSnapshot();
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleBackendCommand(msg);
    } catch (e) {
      console.debug("[DevPulse] Failed to parse backend message:", e);
    }
  };

  ws.onclose = () => {
    console.debug("[DevPulse] WebSocket closed, scheduling reconnect");
    stopHeartbeat();
    ws = null;
    scheduleReconnect();
  };

  ws.onerror = (err) => {
    console.debug("[DevPulse] WebSocket error:", err);
    // onclose will fire after onerror, which handles reconnect
  };
}

function scheduleReconnect() {
  setTimeout(() => connect(), RECONNECT_DELAY_MS);
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// ─── Heartbeat (periodic active tab update) ─────────────────────────

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (activeTabId != null && tabState[activeTabId]) {
      flushActiveTime(activeTabId);
      const state = tabState[activeTabId];
      send({
        type: "tab_updated",
        tab_id: activeTabId,
        url: state.url || "",
        title: state.title || "",
        favicon_url: state.favicon_url || "",
        active_ms_total: state.active_ms_total || 0,
      });
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// ─── Active Time Tracking ───────────────────────────────────────────

function flushActiveTime(tabId) {
  const state = tabState[tabId];
  if (!state || !state.last_activated_at) return;
  if (!windowFocused) return;

  const now = Date.now();
  const elapsed = now - state.last_activated_at;
  state.active_ms_total = (state.active_ms_total || 0) + elapsed;
  state.last_activated_at = now;
}

function setActiveTab(tabId) {
  // Flush time for the previously active tab
  if (activeTabId != null && tabState[activeTabId]) {
    flushActiveTime(activeTabId);
    tabState[activeTabId].last_activated_at = null;
  }

  activeTabId = tabId;

  // Start tracking the new active tab
  if (tabId != null && tabState[tabId] && windowFocused) {
    tabState[tabId].last_activated_at = Date.now();
  }
}

// ─── Tab Event Listeners ────────────────────────────────────────────

chrome.tabs.onCreated.addListener((tab) => {
  tabState[tab.id] = {
    active_ms_total: 0,
    last_activated_at: null,
    url: tab.url || tab.pendingUrl || "",
    title: tab.title || "",
    favicon_url: tab.favIconUrl || "",
  };

  send({
    type: "tab_opened",
    tab_id: tab.id,
    url: tab.url || tab.pendingUrl || "",
    title: tab.title || "",
    favicon_url: tab.favIconUrl || "",
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  // Flush any remaining active time
  if (tabId === activeTabId) {
    flushActiveTime(tabId);
    activeTabId = null;
  }

  send({
    type: "tab_closed",
    tab_id: tabId,
    active_ms_total: tabState[tabId]?.active_ms_total || 0,
  });

  delete tabState[tabId];
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  setActiveTab(activeInfo.tabId);

  send({
    type: "tab_focus",
    tab_id: activeInfo.tabId,
    active_ms_total: tabState[activeInfo.tabId]?.active_ms_total || 0,
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only send when title or URL actually changes
  if (!changeInfo.title && !changeInfo.url && !changeInfo.favIconUrl) {
    return;
  }

  // Update local state
  if (tabState[tabId]) {
    if (changeInfo.url) tabState[tabId].url = changeInfo.url;
    if (changeInfo.title) tabState[tabId].title = changeInfo.title;
    if (changeInfo.favIconUrl) tabState[tabId].favicon_url = changeInfo.favIconUrl;
  } else {
    tabState[tabId] = {
      active_ms_total: 0,
      last_activated_at: null,
      url: tab.url || "",
      title: tab.title || "",
      favicon_url: tab.favIconUrl || "",
    };
  }

  // Flush active time if this is the active tab
  if (tabId === activeTabId) {
    flushActiveTime(tabId);
    if (windowFocused) {
      tabState[tabId].last_activated_at = Date.now();
    }
  }

  send({
    type: "tab_updated",
    tab_id: tabId,
    url: tab.url || "",
    title: tab.title || "",
    favicon_url: tab.favIconUrl || "",
    active_ms_total: tabState[tabId]?.active_ms_total || 0,
  });
});

// ─── Window Focus Tracking ──────────────────────────────────────────

chrome.windows.onFocusChanged.addListener((windowId) => {
  const wasFocused = windowFocused;
  windowFocused = windowId !== chrome.windows.WINDOW_ID_NONE;

  if (!windowFocused && wasFocused) {
    // Browser lost focus — stop counting active time
    if (activeTabId != null && tabState[activeTabId]) {
      flushActiveTime(activeTabId);
      tabState[activeTabId].last_activated_at = null;
    }
  } else if (windowFocused && !wasFocused) {
    // Browser gained focus — resume counting
    if (activeTabId != null && tabState[activeTabId]) {
      tabState[activeTabId].last_activated_at = Date.now();
    }
  }
});

// ─── Backend Commands ───────────────────────────────────────────────

function handleBackendCommand(msg) {
  if (msg.command === "suspend_tab") {
    const tabId = msg.tab_id;
    if (typeof tabId === "number") {
      chrome.tabs.discard(tabId).then(() => {
        console.log("[DevPulse] Discarded tab", tabId);
        send({ type: "tab_suspended_ack", tab_id: tabId, success: true });
      }).catch((err) => {
        console.warn("[DevPulse] Failed to discard tab", tabId, err);
        send({ type: "tab_suspended_ack", tab_id: tabId, success: false, error: String(err) });
      });
    }
  } else if (msg.command === "restore_tab") {
    // chrome.tabs.discard is not reversible — the best we can do is reload
    const tabId = msg.tab_id;
    if (typeof tabId === "number") {
      chrome.tabs.reload(tabId).then(() => {
        console.log("[DevPulse] Reloaded (restored) tab", tabId);
        send({ type: "tab_restored_ack", tab_id: tabId, success: true });
      }).catch((err) => {
        console.warn("[DevPulse] Failed to reload tab", tabId, err);
        send({ type: "tab_restored_ack", tab_id: tabId, success: false, error: String(err) });
      });
    }
  }
}

// ─── Initial Tab Snapshot ───────────────────────────────────────────

async function sendCurrentTabSnapshot() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      tabState[tab.id] = tabState[tab.id] || {
        active_ms_total: 0,
        last_activated_at: null,
        url: tab.url || "",
        title: tab.title || "",
        favicon_url: tab.favIconUrl || "",
      };

      send({
        type: "tab_opened",
        tab_id: tab.id,
        url: tab.url || "",
        title: tab.title || "",
        favicon_url: tab.favIconUrl || "",
      });
    }

    // Identify the currently active tab
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab) {
      setActiveTab(activeTab.id);
    }
  } catch (e) {
    console.debug("[DevPulse] Failed to send initial tab snapshot:", e);
  }
}

// ─── Initialize ─────────────────────────────────────────────────────

connect();
