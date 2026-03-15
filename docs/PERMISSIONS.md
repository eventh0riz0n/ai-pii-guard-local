# Permissions justification — AI PII Guard (Local)

## permissions
- `storage`: store settings (Paste Guard mode, enabled detectors, extra domains list).
- `clipboardWrite`: copy scrubbed text from the popup.

## host permissions
Default (built-in):
- `https://chatgpt.com/*`
- `https://chat.openai.com/*`
- `https://claude.ai/*`
- `https://gemini.google.com/*`

Used only if Paste Guard is enabled.

## optional_host_permissions
- `https://*/*`

Used only if you add an extra domain in Settings; Chrome will ask you to approve that domain.

## background
The service worker is used to:
- show a small action badge indicator (OK / ! / ?) after paste checks
- register/unregister Paste Guard content scripts for extra user-approved domains
