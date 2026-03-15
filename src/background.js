// MV3 service worker:
// - show tiny confirmation via extension action badge
// - register Paste Guard content scripts for extra user-approved domains

const DEFAULT_CLEAR_MS = 2500;

const tabTimers = new Map();

function setBadge(tabId, { text, color, title }) {
  if (typeof tabId !== 'number') return;

  chrome.action.setBadgeText({ tabId, text: text || '' });
  if (color) chrome.action.setBadgeBackgroundColor({ tabId, color });
  if (title) chrome.action.setTitle({ tabId, title });

  // auto-clear
  if (tabTimers.has(tabId)) {
    clearTimeout(tabTimers.get(tabId));
    tabTimers.delete(tabId);
  }

  const t = setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: '' });
    tabTimers.delete(tabId);
  }, DEFAULT_CLEAR_MS);

  tabTimers.set(tabId, t);
}

async function getExtraDomains() {
  const stored = await chrome.storage.sync.get(['settings']);
  const extra = stored?.settings?.domains?.extra;
  return Array.isArray(extra) ? extra : [];
}

function scriptIdFor(pattern) {
  // stable id (but keep it short)
  const safe = pattern.replace(/[^a-z0-9]/gi, '_').slice(0, 60);
  return `pg_${safe}`;
}

async function refreshExtraDomainScripts() {
  const extra = await getExtraDomains();

  // Get existing registrations
  let existing = [];
  try {
    existing = await chrome.scripting.getRegisteredContentScripts();
  } catch {
    existing = [];
  }

  const ours = existing.filter((s) => s.id?.startsWith('pg_')).map((s) => s.id);
  if (ours.length) {
    try { await chrome.scripting.unregisterContentScripts({ ids: ours }); } catch {}
  }

  if (!extra.length) return;

  // Register for each pattern
  for (const pat of extra) {
    try {
      await chrome.scripting.registerContentScripts([{
        id: scriptIdFor(pat),
        matches: [pat],
        js: ['scrub.js', 'paste-guard.js'],
        runAt: 'document_idle',
        allFrames: false
      }]);
    } catch {
      // ignore per-pattern failures
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  refreshExtraDomainScripts();
});

chrome.runtime.onStartup.addListener(() => {
  refreshExtraDomainScripts();
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'pii_guard_domains_updated') {
    refreshExtraDomainScripts();
    return;
  }

  if (!msg || msg.type !== 'pii_guard_indicator') return;

  const tabId = sender?.tab?.id;
  const kind = msg.kind;

  if (kind === 'clean') {
    setBadge(tabId, {
      text: 'OK',
      color: '#1bb55c',
      title: 'AI PII Guard: paste checked (no issues found)'
    });
  } else if (kind === 'scrubbed') {
    const summary = msg.summary ? ` (${msg.summary})` : '';
    setBadge(tabId, {
      text: 'OK',
      color: '#1bb55c',
      title: `AI PII Guard: scrubbed paste applied${summary}`
    });
  } else if (kind === 'flagged') {
    const summary = msg.summary ? ` (${msg.summary})` : '';
    setBadge(tabId, {
      text: '!',
      color: '#ff9f0a',
      title: `AI PII Guard: sensitive data detected${summary}`
    });
  } else if (kind === 'ask') {
    const summary = msg.summary ? ` (${msg.summary})` : '';
    setBadge(tabId, {
      text: '?',
      color: '#4f7cff',
      title: `AI PII Guard: confirm replacement${summary}`
    });
  }
});
