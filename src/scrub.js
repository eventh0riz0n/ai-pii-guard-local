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
      const rules = [
        { type: "GITHUB_TOKEN", re: /\bghp_[A-Za-z0-9]{36}\b/g },
        { type: "GITHUB_PAT", re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g },
        { type: "AWS_ACCESS_KEY_ID", re: /\bAKIA[0-9A-Z]{16}\b/g },
        { type: "GOOGLE_API_KEY", re: /\bAIza[0-9A-Za-z\-_]{35}\b/g },
        { type: "SLACK_TOKEN", re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g },
        // OpenAI-style keys are often sk-... (can be other vendors too). Keep generic.
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
