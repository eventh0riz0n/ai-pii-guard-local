/* scrub.js - pure functions (browser + node)
 * Exposes: globalThis.AiPiiGuard.scrubText
 */

(function (root) {
  function digitsOnly(s) {
    return (s.match(/\d/g) || []).join("");
  }

  function luhnCheck(num) {
    let sum = 0;
    let dbl = false;
    for (let i = num.length - 1; i >= 0; i--) {
      let d = num.charCodeAt(i) - 48;
      if (d < 0 || d > 9) return false;
      if (dbl) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      dbl = !dbl;
    }
    return sum % 10 === 0;
  }

  function peselIsValid(peselDigits) {
    if (!/^\d{11}$/.test(peselDigits)) return false;
    const w = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
    let s = 0;
    for (let i = 0; i < 10; i++) s += w[i] * Number(peselDigits[i]);
    const c = (10 - (s % 10)) % 10;
    return c === Number(peselDigits[10]);
  }

  function normalizeIbanCandidate(raw) {
    return raw.replace(/[ \t-]/g, "").toUpperCase();
  }

  function ibanIsValid(iban) {
    // Basic IBAN validation via MOD-97.
    // https://en.wikipedia.org/wiki/International_Bank_Account_Number
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
    if (iban.length < 15 || iban.length > 34) return false;

    const rearranged = iban.slice(4) + iban.slice(0, 4);
    let acc = 0;
    for (const ch of rearranged) {
      let chunk;
      if (ch >= '0' && ch <= '9') {
        chunk = ch;
      } else {
        chunk = String(ch.charCodeAt(0) - 55); // A=10..Z=35
      }
      for (const d of chunk) {
        acc = (acc * 10 + (d.charCodeAt(0) - 48)) % 97;
      }
    }
    return acc === 1;
  }

  function scrubText(text, opts) {
    const findings = [];
    let out = text;

    // Secrets / API keys (conservative: only obvious prefixes)
    if (opts.secrets) {
      // First: multi-line secrets blocks (private keys)
      const keyBlock = /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g;
      out = out.replace(keyBlock, (m) => {
        findings.push({ type: 'SECRET', sample: 'PRIVATE_KEY: ' + m.slice(0, 20) + '…' });
        return '[SECRET]';
      });

      const rules = [
        { type: "GITHUB_TOKEN", re: /\bghp_[A-Za-z0-9]{36}\b/g },
        { type: "GITHUB_PAT", re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g },
        { type: "GITLAB_PAT", re: /\bglpat-[A-Za-z0-9_\-]{20,}\b/g },

        { type: "AWS_ACCESS_KEY_ID", re: /\bAKIA[0-9A-Z]{16}\b/g },
        { type: "GOOGLE_API_KEY", re: /\bAIza[0-9A-Za-z\-_]{35}\b/g },
        { type: "SLACK_TOKEN", re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g },

        // Stripe
        { type: "STRIPE_SK", re: /\bsk_(?:live|test)_[A-Za-z0-9]{10,}\b/g },
        { type: "STRIPE_RK", re: /\brk_(?:live|test)_[A-Za-z0-9]{10,}\b/g },
        { type: "STRIPE_WEBHOOK", re: /\bwhsec_[A-Za-z0-9]{10,}\b/g },

        // Discord bot token
        { type: "DISCORD_TOKEN", re: /\b\d{17,20}\.[A-Za-z0-9_\-]{6}\.[A-Za-z0-9_\-]{27}\b/g },

        // Telegram bot token
        { type: "TELEGRAM_BOT_TOKEN", re: /\b\d{6,12}:[A-Za-z0-9_\-]{30,}\b/g },

        // JWT (common bearer token shape)
        { type: "JWT", re: /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g },

        // Generic "sk-..." keys (OpenAI-style, but can be other vendors too)
        { type: "API_KEY", re: /\bsk-[A-Za-z0-9]{20,}\b/g }
      ];

      for (const r of rules) {
        out = out.replace(r.re, (m) => {
          findings.push({ type: "SECRET", sample: `${r.type}: ${m.slice(0, 6)}…${m.slice(-4)}` });
          return "[SECRET]";
        });
      }
    }

    // Emails
    if (opts.emails) {
      const re = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
      out = out.replace(re, (m) => {
        findings.push({ type: "EMAIL", sample: m });
        return "[EMAIL]";
      });
    }

    // Advanced: SSN (US)
    if (opts.ssnUs) {
      const re = /\b(\d{3})-(\d{2})-(\d{4})\b/g;
      out = out.replace(re, (m, a, b, c) => {
        // basic validity: avoid 000/00/0000 and disallow 666 / 9xx
        const area = Number(a);
        const group = Number(b);
        const serial = Number(c);
        if (area === 0 || group === 0 || serial === 0) return m;
        if (area === 666) return m;
        if (area >= 900) return m;
        findings.push({ type: 'SSN', sample: m });
        return '[SSN]';
      });
    }

    // Advanced: NINO (UK)
    if (opts.ninoUk) {
      // e.g. AB123456C or AB 12 34 56 C
      const re = /\b([A-Z]{2})\s*(\d{2})\s*(\d{2})\s*(\d{2})\s*([A-D])\b/gi;
      const bad = new Set(['D','F','I','Q','U','V','O']);
      out = out.replace(re, (m, p1, d1, d2, d3, suf) => {
        const a = String(p1).toUpperCase();
        const s = String(suf).toUpperCase();
        if (bad.has(a[0]) || bad.has(a[1])) return m;
        findings.push({ type: 'NINO', sample: `${a}${d1}${d2}${d3}${s}` });
        return '[NINO]';
      });
    }

    // Advanced: NIP (PL)
    if (opts.nipPl) {
      const re = /\b\d{10}\b/g;
      const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
      out = out.replace(re, (m) => {
        // exclude PESEL (11 digits) not matched; ok
        const digits = m.split('').map((x) => Number(x));
        let sum = 0;
        for (let i = 0; i < 9; i++) sum += weights[i] * digits[i];
        const mod = sum % 11;
        if (mod === 10) return m;
        if (mod !== digits[9]) return m;
        findings.push({ type: 'NIP', sample: m });
        return '[NIP]';
      });
    }

    // Advanced: REGON (PL) 9-digit
    if (opts.regonPl) {
      const re = /\b\d{9}\b/g;
      const weights = [8, 9, 2, 3, 4, 5, 6, 7];
      out = out.replace(re, (m) => {
        const digits = m.split('').map((x) => Number(x));
        let sum = 0;
        for (let i = 0; i < 8; i++) sum += weights[i] * digits[i];
        let mod = sum % 11;
        if (mod === 10) mod = 0;
        if (mod !== digits[8]) return m;
        findings.push({ type: 'REGON', sample: m });
        return '[REGON]';
      });
    }

    // Advanced: IPv4 addresses
    if (opts.ip) {
      const re = /\b(?:(?:\d{1,3})\.){3}(?:\d{1,3})\b/g;
      out = out.replace(re, (m) => {
        const parts = m.split('.').map((x) => Number(x));
        if (parts.length !== 4) return m;
        if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return m;
        findings.push({ type: 'IP', sample: m });
        return '[IP]';
      });
    }

    // Advanced: MAC addresses
    if (opts.mac) {
      const re = /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g;
      out = out.replace(re, (m) => {
        findings.push({ type: 'MAC', sample: m.toLowerCase() });
        return '[MAC]';
      });
    }

    // Advanced: SWIFT/BIC
    if (opts.swift) {
      const re = /\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g;
      out = out.replace(re, (m) => {
        // avoid scrubbing if it looks like a normal short word (already prevented by pattern)
        findings.push({ type: 'SWIFT', sample: m });
        return '[SWIFT]';
      });
    }

    // IBAN (best-effort)
    if (opts.ibans) {
      // Avoid newlines to prevent over-capturing across lines.
      const re = /\b[A-Z]{2}\d{2}[A-Z0-9 \t-]{11,32}\b/g;
      out = out.replace(re, (m) => {
        const norm = normalizeIbanCandidate(m);
        if (!ibanIsValid(norm)) return m;
        findings.push({ type: "IBAN", sample: norm.slice(0, 6) + "…" + norm.slice(-4) });
        return "[IBAN]";
      });
    }

    // Payment cards (Luhn)
    if (opts.cards) {
      const re = /\b(?:\d[ -]*?){13,19}\b/g;
      out = out.replace(re, (m) => {
        const d = digitsOnly(m);
        if (d.length < 13 || d.length > 19) return m;
        if (!luhnCheck(d)) return m;
        findings.push({ type: "CARD", sample: d.slice(0, 6) + "…" + d.slice(-4) });
        return "[CARD]";
      });
    }

    // Phones (heuristic)
    if (opts.phones) {
      // Replace the whole number including leading '+', but keep any leading whitespace.
      const re = /(^|\s)(\+?\d[\d \t().-]{6,}\d)\b/gm;
      out = out.replace(re, (full, lead, num) => {
        const d = digitsOnly(num);
        if (d.length < 9 || d.length > 15) return full;
        if (/^\d{4}\d{2}\d{2}$/.test(d)) return full; // avoid YYYYMMDD
        findings.push({ type: "PHONE", sample: num });
        return lead + "[PHONE]";
      });
    }

    // PESEL (optional)
    if (opts.pesel) {
      const re = /\b\d{11}\b/g;
      out = out.replace(re, (m) => {
        if (!peselIsValid(m)) return m;
        findings.push({ type: "PESEL", sample: m.slice(0, 3) + "…" + m.slice(-2) });
        return "[PESEL]";
      });
    }

    const counts = findings.reduce((acc, f) => {
      acc[f.type] = (acc[f.type] || 0) + 1;
      return acc;
    }, {});

    return { out, findings, counts };
  }

  const api = { scrubText, _internal: { luhnCheck, peselIsValid } };

  // Browser global
  root.AiPiiGuard = api;

  // Node/CommonJS
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
