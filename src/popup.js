/* AI PII Guard (Local)
 * - local-only, no network
 * - best-effort PII + secret scrubbing
 */

const $ = (id) => document.getElementById(id);

const els = {
  input: $("input"),
  output: $("output"),
  findings: $("findings"),
  stats: $("stats"),

  optSecrets: $("optSecrets"),
  optEmails: $("optEmails"),
  optPhones: $("optPhones"),
  optIbans: $("optIbans"),
  optCards: $("optCards"),
  optPesel: $("optPesel"),

  btnPaste: $("btnPaste"),
  btnPasteScrubCopy: $("btnPasteScrubCopy"),
  btnClear: $("btnClear"),
  btnScrub: $("btnScrub"),
  btnScrubCopy: $("btnScrubCopy"),
  btnCopy: $("btnCopy"),
  btnSettings: $("btnSettings"),
  btnSupport: $("btnSupport")
};

function renderFindings(result) {
  els.findings.innerHTML = "";

  const total = result.findings.length;
  if (!total) {
    els.stats.textContent = "0";
    const li = document.createElement("li");
    li.textContent = "No matches (or they didn’t pass validation).";
    els.findings.appendChild(li);
    return;
  }

  const parts = Object.entries(result.counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`);
  els.stats.textContent = `${total} (${parts.join(", ")})`;

  for (const f of result.findings.slice(0, 12)) {
    const li = document.createElement("li");
    li.textContent = `${f.type}: ${f.sample}`;
    els.findings.appendChild(li);
  }
  if (total > 12) {
    const li = document.createElement("li");
    li.textContent = `…and ${total - 12} more`;
    els.findings.appendChild(li);
  }
}

async function pasteIntoInput() {
  try {
    const txt = await navigator.clipboard.readText();
    if (txt) {
      els.input.value = txt;
      els.stats.textContent = 'Pasted.';
    }
  } catch (e) {
    // Clipboard read can be blocked depending on browser settings/policies.
    console.warn('clipboard read failed', e);
    els.stats.textContent = 'Clipboard paste blocked — use Ctrl+V in Input.';
  }
}

async function copyOutput() {
  const txt = els.output.value || "";
  if (!txt) return;
  await navigator.clipboard.writeText(txt);
}

function currentOpts() {
  return {
    secrets: els.optSecrets.checked,
    emails: els.optEmails.checked,
    phones: els.optPhones.checked,
    ibans: els.optIbans.checked,
    cards: els.optCards.checked,
    pesel: els.optPesel.checked
  };
}

function scrub() {
  const src = els.input.value || "";
  const res = AiPiiGuard.scrubText(src, currentOpts());
  els.output.value = res.out;
  renderFindings(res);
  return res;
}

async function scrubAndCopy() {
  scrub();
  await copyOutput();
}

async function pasteScrubCopy() {
  let pasted = false;
  try {
    const txt = await navigator.clipboard.readText();
    if (txt) {
      els.input.value = txt;
      pasted = true;
    }
  } catch (e) {
    console.warn('clipboard read failed', e);
    els.stats.textContent = 'Clipboard paste blocked — use Ctrl+V then Scrub & Copy.';
  }

  scrub();

  try {
    await copyOutput();
    if (pasted) els.stats.textContent = 'Pasted → scrubbed → copied.';
  } catch (e) {
    console.warn('clipboard write failed', e);
    els.stats.textContent = 'Copy failed — use Ctrl+C from Output.';
  }
}

function clearAll() {
  els.input.value = "";
  els.output.value = "";
  els.findings.innerHTML = "";
  els.stats.textContent = "—";
}

els.btnPaste.addEventListener("click", pasteIntoInput);
els.btnPasteScrubCopy.addEventListener("click", pasteScrubCopy);
els.btnClear.addEventListener("click", clearAll);
els.btnScrub.addEventListener("click", scrub);
els.btnScrubCopy.addEventListener("click", scrubAndCopy);
els.btnCopy.addEventListener("click", copyOutput);

els.btnSettings?.addEventListener('click', async () => {
  try {
    await chrome.runtime.openOptionsPage();
  } catch {
    // fallback
    const url = chrome.runtime.getURL('options.html');
    chrome.tabs.create({ url });
  }
});

els.btnSupport?.addEventListener('click', () => {
  const url = chrome.runtime.getURL('options.html#support');
  chrome.tabs.create({ url });
});

clearAll();
