/* Paste Guard content script
 * - Runs on selected AI sites only (manifest matches)
 * - Detects PII/secrets in pasted text and either asks to replace or auto-replaces
 */

const DEFAULTS = {
  pasteGuard: { enabled: true, mode: 'ask' },
  scrub: { secrets: true, emails: true, phones: true, ibans: true, cards: true, pesel: false }
};

const state = {
  settings: DEFAULTS,
  lastUndo: null
};

function norm(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function isEditableTarget(t) {
  if (!t) return false;
  const el = t instanceof Element ? t : null;
  if (!el) return false;

  const tag = el.tagName?.toLowerCase();
  if (tag === 'textarea') return true;
  if (tag === 'input') {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    return ['text', 'search', 'email', 'url', 'tel', ''].includes(type);
  }
  if (el.isContentEditable) return true;

  // Some editors attach events on nested spans inside contenteditable.
  const ce = el.closest('[contenteditable="true"], [contenteditable=""]');
  return !!ce;
}

function editableRoot(t) {
  if (!t) return null;
  if (t.tagName?.toLowerCase() === 'textarea' || t.tagName?.toLowerCase() === 'input') return t;
  if (t.isContentEditable) return t;
  return t.closest('[contenteditable="true"], [contenteditable=""]');
}

function extractTextFromClipboardEvent(e) {
  try {
    return e.clipboardData?.getData('text/plain') || '';
  } catch {
    return '';
  }
}

function scrub(text) {
  const opts = state.settings?.scrub || DEFAULTS.scrub;
  return AiPiiGuard.scrubText(text, opts);
}

function hasFindings(res) {
  return (res?.findings?.length || 0) > 0;
}

function summary(res) {
  const counts = res?.counts || {};
  const parts = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`);
  return parts.join(', ');
}

function ensureToast() {
  let t = document.querySelector('[data-ai-pii-guard-toast]');
  if (t) return t;

  t = document.createElement('div');
  t.dataset.aiPiiGuardToast = '1';
  t.style.position = 'fixed';
  t.style.right = '14px';
  t.style.bottom = '14px';
  t.style.zIndex = '2147483647';
  t.style.background = 'rgba(20,27,39,0.92)';
  t.style.border = '1px solid rgba(120,140,180,0.22)';
  t.style.color = '#e6eaf2';
  t.style.padding = '10px 12px';
  t.style.borderRadius = '12px';
  t.style.fontSize = '12px';
  t.style.maxWidth = '420px';
  t.style.display = 'none';
  t.style.whiteSpace = 'pre-line';
  document.documentElement.appendChild(t);
  return t;
}

function showToast(text, { undo = null } = {}) {
  const t = ensureToast();
  t.innerHTML = '';

  const msg = document.createElement('div');
  msg.textContent = text;
  t.appendChild(msg);

  if (undo) {
    const row = document.createElement('div');
    row.style.marginTop = '8px';
    row.style.display = 'flex';
    row.style.gap = '10px';
    row.style.alignItems = 'center';

    const btn = document.createElement('button');
    btn.textContent = 'Undo';
    btn.style.cursor = 'pointer';
    btn.style.borderRadius = '10px';
    btn.style.border = '1px solid rgba(120,140,180,0.25)';
    btn.style.background = 'rgba(79,124,255,0.18)';
    btn.style.color = '#e6eaf2';
    btn.style.padding = '6px 10px';

    btn.addEventListener('click', () => {
      undo();
      hideToast();
    });

    const hint = document.createElement('div');
    hint.style.color = 'rgba(154,166,188,0.95)';
    hint.textContent = 'Ctrl+Z also works.';

    row.appendChild(btn);
    row.appendChild(hint);
    t.appendChild(row);
  }

  t.style.display = 'block';
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(() => hideToast(), 7000);
}

function hideToast() {
  const t = document.querySelector('[data-ai-pii-guard-toast]');
  if (t) t.style.display = 'none';
}

function ensureModal() {
  let m = document.querySelector('[data-ai-pii-guard-modal]');
  if (m) return m;

  m = document.createElement('div');
  m.dataset.aiPiiGuardModal = '1';
  m.style.position = 'fixed';
  m.style.inset = '0';
  m.style.zIndex = '2147483647';
  m.style.background = 'rgba(0,0,0,0.55)';
  m.style.display = 'none';

  const panel = document.createElement('div');
  panel.style.position = 'absolute';
  panel.style.left = '50%';
  panel.style.top = '14%';
  panel.style.transform = 'translateX(-50%)';
  panel.style.width = 'min(920px, 92vw)';
  panel.style.background = 'rgba(20,27,39,0.98)';
  panel.style.border = '1px solid rgba(120,140,180,0.22)';
  panel.style.borderRadius = '14px';
  panel.style.padding = '14px';
  panel.style.color = '#e6eaf2';

  panel.innerHTML = `
    <div style="display:flex; gap:10px; align-items:center; justify-content:space-between; margin-bottom:10px;">
      <div>
        <div style="font-weight:700">Potential sensitive data detected</div>
        <div data-ai-pii-guard-summary style="color: rgba(154,166,188,0.95); font-size: 12px; margin-top:2px;"></div>
      </div>
      <button data-ai-pii-guard-close style="cursor:pointer; border-radius:10px; border:1px solid rgba(120,140,180,0.25); background: transparent; color:#e6eaf2; padding:6px 10px;">Close</button>
    </div>
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
      <div>
        <div style="font-weight:600; margin-bottom:6px;">Original</div>
        <textarea data-ai-pii-guard-orig style="width:100%; min-height: 220px; background:#0e1524; border:1px solid rgba(120,140,180,0.22); color:#e6eaf2; border-radius:12px; padding:10px;"></textarea>
      </div>
      <div>
        <div style="font-weight:600; margin-bottom:6px;">Scrubbed</div>
        <textarea data-ai-pii-guard-scrub style="width:100%; min-height: 220px; background:#0e1524; border:1px solid rgba(120,140,180,0.22); color:#e6eaf2; border-radius:12px; padding:10px;"></textarea>
      </div>
    </div>
    <div style="display:flex; gap:10px; margin-top:12px; justify-content:flex-end;">
      <button data-ai-pii-guard-paste-orig style="cursor:pointer; border-radius:12px; border:1px solid rgba(120,140,180,0.25); background: transparent; color:#e6eaf2; padding:8px 12px;">Paste original</button>
      <button data-ai-pii-guard-paste-scrub style="cursor:pointer; border-radius:12px; border:1px solid rgba(79,124,255,0.55); background: rgba(79,124,255,0.18); color:#e6eaf2; padding:8px 12px;">Paste scrubbed</button>
    </div>
  `;

  m.appendChild(panel);
  document.documentElement.appendChild(m);

  // close
  const close = () => { m.style.display = 'none'; };
  m.addEventListener('click', (e) => {
    if (e.target === m) close();
  });
  panel.querySelector('[data-ai-pii-guard-close]').addEventListener('click', close);

  return m;
}

function insertText(target, text) {
  // input/textarea
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const oldValue = target.value;
    const start = target.selectionStart ?? oldValue.length;
    const end = target.selectionEnd ?? oldValue.length;
    const before = oldValue.slice(0, start);
    const after = oldValue.slice(end);
    target.value = before + text + after;
    const caret = start + text.length;
    target.selectionStart = caret;
    target.selectionEnd = caret;
    target.dispatchEvent(new Event('input', { bubbles: true }));

    return {
      undo: () => {
        target.value = oldValue;
        target.selectionStart = start;
        target.selectionEnd = end;
        target.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };
  }

  // contenteditable best-effort
  // execCommand still has best compatibility across rich editors
  const ok = document.execCommand?.('insertText', false, text);
  return {
    undo: () => {
      // Encourage user to Ctrl+Z.
      if (!ok) {
        // no-op
      }
    }
  };
}

function shouldHandlePaste(res) {
  // Handle every paste so we can show a small confirmation indicator even if clean.
  return true;
}

function notifyIndicator(kind, res) {
  try {
    chrome.runtime.sendMessage({
      type: 'pii_guard_indicator',
      kind,
      summary: res ? summary(res) : null
    });
  } catch {
    // ignore
  }
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(['settings']);
  const s = stored.settings || {};
  state.settings = {
    pasteGuard: { ...DEFAULTS.pasteGuard, ...(s.pasteGuard || {}) },
    scrub: { ...DEFAULTS.scrub, ...(s.scrub || {}) },
  };
}

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'sync') loadSettings();
});

function handleAuto(target, originalText, scrubbed, res) {
  const { undo } = insertText(target, scrubbed);
  // We scrubbed successfully -> show OK badge with details.
  notifyIndicator('scrubbed', res);
  showToast(`AI PII Guard: scrubbed paste (${summary(res) || res.findings.length})`, { undo });
}

function handleAsk(target, originalText, scrubbed, res) {
  const m = ensureModal();
  m.style.display = 'block';

  m.querySelector('[data-ai-pii-guard-summary]').textContent = summary(res) || `${res.findings.length} findings`;
  const taOrig = m.querySelector('[data-ai-pii-guard-orig]');
  const taScrub = m.querySelector('[data-ai-pii-guard-scrub]');
  taOrig.value = originalText;
  taScrub.value = scrubbed;

  const close = () => { m.style.display = 'none'; };

  const btnOrig = m.querySelector('[data-ai-pii-guard-paste-orig]');
  const btnScrub = m.querySelector('[data-ai-pii-guard-paste-scrub]');

  // Remove previous listeners by cloning nodes
  const btnOrig2 = btnOrig.cloneNode(true);
  const btnScrub2 = btnScrub.cloneNode(true);
  btnOrig.parentNode.replaceChild(btnOrig2, btnOrig);
  btnScrub.parentNode.replaceChild(btnScrub2, btnScrub);

  btnOrig2.addEventListener('click', () => {
    insertText(target, originalText);
    // User chose to paste original despite findings.
    notifyIndicator('flagged', res);
    close();
  });

  btnScrub2.addEventListener('click', () => {
    insertText(target, scrubbed);
    // Scrubbed applied -> OK badge with details.
    notifyIndicator('scrubbed', res);
    close();
  });
}

function onPaste(e) {
  if (!state.settings?.pasteGuard?.enabled) return;

  const root = editableRoot(e.target);
  if (!root) return;
  if (!isEditableTarget(e.target)) return;

  const pasted = extractTextFromClipboardEvent(e);
  if (!pasted) return;

  const res = scrub(pasted);
  if (!shouldHandlePaste(res)) return;

  // Clean paste: allow normal paste, just show a tiny confirmation.
  if (!hasFindings(res)) {
    notifyIndicator('clean', res);
    return;
  }

  // Findings: prevent default so we control the insertion.
  e.preventDefault();
  e.stopPropagation();

  const mode = state.settings?.pasteGuard?.mode || 'ask';
  if (mode === 'auto') {
    // handleAuto() will set the final indicator
    handleAuto(root, pasted, res.out, res);
  } else {
    notifyIndicator('ask', res);
    handleAsk(root, pasted, res.out, res);
  }
}

(async function init() {
  await loadSettings();

  // Capture phase so we see it before frameworks.
  document.addEventListener('paste', onPaste, true);
})();
