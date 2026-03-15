# AI PII Guard (Local) — Chrome Extension MVP

Tiny MV3 extension that **scrubs PII from text locally** before you paste into AI chats.

## Features
- Local-only (no network)
- Best-effort detection + replacement:
  - Secrets/API keys → `[SECRET]`
  - Email → `[EMAIL]`
  - Phone → `[PHONE]` (heuristic)
  - IBAN → `[IBAN]` (MOD-97)
  - Payment cards (Luhn) → `[CARD]`
  - Optional: PESEL (PL) → `[PESEL]` (checksum)
- Findings list (with a few samples)
- **Paste Guard** (optional): on supported AI sites, intercept paste and either:
  - ask to replace with scrubbed text (Calm), or
  - auto-replace (Force; undo with Ctrl+Z)

## Install (unpacked)
1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `projects/ai-pii-guard-extension/src`

## Settings
Open the extension settings (Options page):
- enable/disable Paste Guard
- choose Calm vs Force mode
- choose what to detect/scrub

## Notes / limitations
- Regex heuristics can miss or over-match; this is intentionally conservative.
- No screenshot scrubbing in this MVP.

## Support / Ko-fi
If you find this useful, you can support development on Ko‑fi:
- https://ko-fi.com/V7V01UDZTK

## Privacy
No data leaves the extension. No analytics.
