const DEFAULTS = {
  pasteGuard: {
    enabled: true,
    mode: 'ask', // 'ask' | 'auto'
  },
  scrub: {
    secrets: true,
    emails: true,
    phones: true,
    ibans: true,
    cards: true,
    pesel: false,
  },
  domains: {
    extra: []
  }
};

// TODO: replace with your Ko-fi link
const KOFI_URL = 'https://ko-fi.com/YOURNAME';

const $ = (id) => document.getElementById(id);

const els = {
  pgEnabled: $('pgEnabled'),
  btnSave: $('btnSave'),
  status: $('status'),

  optSecrets: $('optSecrets'),
  optEmails: $('optEmails'),
  optPhones: $('optPhones'),
  optIbans: $('optIbans'),
  optCards: $('optCards'),
  optPesel: $('optPesel'),

  domain: $('domain'),
  btnAddDomain: $('btnAddDomain'),
  domains: $('domains'),
  btnKofi: $('btnKofi'),
};

function modeEls() {
  return Array.from(document.querySelectorAll('input[name="pgMode"]'));
}

function setMode(mode) {
  for (const r of modeEls()) r.checked = r.value === mode;
}

function getMode() {
  return modeEls().find((r) => r.checked)?.value || 'ask';
}

async function load() {
  const stored = await chrome.storage.sync.get(['settings']);
  const s = stored.settings || {};

  const merged = {
    pasteGuard: { ...DEFAULTS.pasteGuard, ...(s.pasteGuard || {}) },
    scrub: { ...DEFAULTS.scrub, ...(s.scrub || {}) },
    domains: { ...DEFAULTS.domains, ...(s.domains || {}) },
  };

  els.pgEnabled.checked = !!merged.pasteGuard.enabled;
  setMode(merged.pasteGuard.mode);

  els.optSecrets.checked = !!merged.scrub.secrets;
  els.optEmails.checked = !!merged.scrub.emails;
  els.optPhones.checked = !!merged.scrub.phones;
  els.optIbans.checked = !!merged.scrub.ibans;
  els.optCards.checked = !!merged.scrub.cards;
  els.optPesel.checked = !!merged.scrub.pesel;

  renderDomains(merged.domains.extra || []);
}

function normalizePattern(pat) {
  const p = (pat || '').trim();
  if (!p) return null;
  // Accept example.com and turn into https://example.com/*
  if (!p.includes('://')) {
    return `https://${p.replace(/\/$/, '')}/*`;
  }
  // Require wildcard path
  if (!p.endsWith('/*')) {
    return p.replace(/\/$/, '') + '/*';
  }
  return p;
}

function renderDomains(list) {
  els.domains.innerHTML = '';
  if (!list.length) {
    els.domains.textContent = 'No extra domains.';
    return;
  }

  const ul = document.createElement('ul');
  ul.style.margin = '0';
  ul.style.paddingLeft = '18px';

  for (const pat of list) {
    const li = document.createElement('li');
    li.style.margin = '6px 0';

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '10px';
    row.style.alignItems = 'center';

    const code = document.createElement('code');
    code.textContent = pat;

    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = 'Remove';
    btn.addEventListener('click', async () => {
      const next = list.filter((x) => x !== pat);
      await chrome.storage.sync.set({ settings: { ...(await getSettings()), domains: { extra: next } } });
      // best-effort drop permission
      try { await chrome.permissions.remove({ origins: [pat] }); } catch {}
      // ask background to re-register scripts
      chrome.runtime.sendMessage({ type: 'pii_guard_domains_updated' });
      renderDomains(next);
    });

    row.appendChild(code);
    row.appendChild(btn);
    li.appendChild(row);
    ul.appendChild(li);
  }

  els.domains.appendChild(ul);
}

async function getSettings() {
  const stored = await chrome.storage.sync.get(['settings']);
  const s = stored.settings || {};
  return {
    pasteGuard: { ...DEFAULTS.pasteGuard, ...(s.pasteGuard || {}) },
    scrub: { ...DEFAULTS.scrub, ...(s.scrub || {}) },
    domains: { ...DEFAULTS.domains, ...(s.domains || {}) },
  };
}

async function save() {
  const current = await getSettings();
  const settings = {
    ...current,
    pasteGuard: {
      enabled: els.pgEnabled.checked,
      mode: getMode(),
    },
    scrub: {
      secrets: els.optSecrets.checked,
      emails: els.optEmails.checked,
      phones: els.optPhones.checked,
      ibans: els.optIbans.checked,
      cards: els.optCards.checked,
      pesel: els.optPesel.checked,
    },
  };

  await chrome.storage.sync.set({ settings });
  chrome.runtime.sendMessage({ type: 'pii_guard_domains_updated' });
  els.status.textContent = 'Saved.';
  setTimeout(() => (els.status.textContent = ''), 1200);
}

els.btnAddDomain?.addEventListener('click', async () => {
  const pat = normalizePattern(els.domain.value);
  if (!pat) return;

  // Request permission for this origin.
  const granted = await chrome.permissions.request({ origins: [pat] });
  if (!granted) {
    els.status.textContent = 'Permission denied.';
    return;
  }

  const current = await getSettings();
  const extra = Array.from(new Set([...(current.domains.extra || []), pat]));
  await chrome.storage.sync.set({ settings: { ...current, domains: { extra } } });
  chrome.runtime.sendMessage({ type: 'pii_guard_domains_updated' });
  els.domain.value = '';
  renderDomains(extra);
});

els.btnKofi?.addEventListener('click', () => {
  chrome.tabs.create({ url: KOFI_URL });
});

els.btnSave.addEventListener('click', save);

load().catch((e) => {
  els.status.textContent = 'Failed to load settings.';
  console.error(e);
});
