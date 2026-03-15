# Chrome Web Store draft

## Name
AI PII Guard (Local)

## Short description
Scrub PII + secrets locally before pasting text into AI chats.

## Detailed description
AI PII Guard is a tiny, local-only scrubber for sensitive text.

It helps prevent accidental leaks when you paste logs/emails/customer data into AI chats.

**Two ways to use it:**
1) Popup workflow: paste → scrub → copy
2) Paste Guard (optional): on supported AI sites, detect sensitive data on paste and either:
   - ask to replace with scrubbed text (Calm mode), or
   - auto-replace (Force mode; undo with Ctrl+Z)

Detects (best-effort):
- Secrets/API keys → `[SECRET]`
- Emails → `[EMAIL]`
- Phones → `[PHONE]`
- IBAN → `[IBAN]`
- Payment cards (Luhn) → `[CARD]`
- Optional: PESEL (PL) → `[PESEL]`

- Local-only: no network requests
- No analytics

Disclaimer: Detection is best-effort; always review the output before sharing.

## Category
Productivity

## Privacy practices
- Does not collect personal information
- Does not sell or transfer user data
- Does not use data for unrelated purposes

## Support / Contact
(Add your support email)

## Monetization idea
Optional Ko-fi link in the description + “Support development” page.
