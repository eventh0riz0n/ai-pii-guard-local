#!/usr/bin/env node
/* Quick local smoke test for scrubber logic (Node).
   Run:
     node scripts/smoke_test.js
*/

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg || "assert failed");
};

const { scrubText } = require("../src/scrub.js");

const opts = {
  secrets: true,
  emails: true,
  phones: true,
  ibans: true,
  cards: true,
  pesel: true,

  ssnUs: true,
  ninoUk: true,
  nipPl: true,
  regonPl: true,
  ip: true,
  mac: true,
  swift: true,
};

const input = [
  "Email: john.doe@example.com",
  "Phone: +48 600 700 800",
  "IBAN: PL61 1090 1014 0000 0712 1981 2874",
  "Card: 4242 4242 4242 4242",
  "GitHub: ghp_1234567890abcdef1234567890abcdef1234",
  "SSN: 123-45-6789",
  "NINO: AB 12 34 56 C",
  "NIP: 1234563218",
  "REGON: 123456785",
  "IP: 192.168.0.12",
  "MAC: aa:bb:cc:dd:ee:ff",
  "SWIFT: DEUTDEFF",
  "Date: 2026-03-13"
].join("\n");

const res = scrubText(input, opts);

assert(res.out.includes("[EMAIL]"), "email not scrubbed");
assert(res.out.includes("[PHONE]"), "phone not scrubbed");
assert(res.out.includes("[IBAN]"), "iban not scrubbed");
assert(!res.out.includes("[IBAN]Card"), "iban regex over-captured across newline");
assert(res.out.includes("[CARD]"), "card not scrubbed");
assert(res.out.includes("[SECRET]"), "secret not scrubbed");
assert(res.out.includes("[SSN]"), "ssn not scrubbed");
assert(res.out.includes("[NINO]"), "nino not scrubbed");
assert(res.out.includes("[NIP]"), "nip not scrubbed");
assert(res.out.includes("[REGON]"), "regon not scrubbed");
assert(res.out.includes("[IP]"), "ip not scrubbed");
assert(res.out.includes("[MAC]"), "mac not scrubbed");
assert(res.out.includes("[SWIFT]"), "swift not scrubbed");
assert(res.out.includes("2026-03-13"), "date should not be scrubbed as phone");

console.log("OK: smoke test passed");
console.log("Findings:", res.counts);
