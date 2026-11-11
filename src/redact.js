// ============================================================================
// Privacy Firewall - local redaction engine
// ----------------------------------------------------------------------------
// This module runs FULLY on the device, in plain JavaScript. It is pattern
// matching code, NOT an AI model and NOT a network call. It works offline.
//
// It finds common sensitive items in pasted text and replaces each one with
// a token like [PHONE]. The user reviews the cleaned text and can add manual
// redactions before anything is sent anywhere (see main.js).
//
// Findings are reported as { kind, token, start, end } only in memory. The
// removed values are never stored, logged or returned in the summary counts.
// ============================================================================

export const TOKENS = {
  EMAIL: "[EMAIL]",
  PHONE: "[PHONE]",
  CARD: "[CARD]",
  CODE: "[CODE]",
  ID: "[ID]",
  ADDRESS: "[ADDRESS]",
  MANUAL: "[REDACTED]",
};

// Priority when two candidate findings overlap (lower number wins).
// Generic long-number IDs rank last so a Nigerian phone number (which is
// also an 11-digit run) is claimed by the phone rule first; a labelled ID
// ("NIN is ...", "account number ...") passes an explicit higher priority.
const PRIORITY = { EMAIL: 1, CODE: 1, CARD: 1, PHONE: 2, ADDRESS: 3, ID: 5, MANUAL: 0 };

// --- Luhn check -------------------------------------------------------------
// Standard digit check for card numbers. A long number only counts as a
// card when it passes, so harmless long reference numbers are left alone.
export function luhnValid(digits) {
  const d = String(digits).replace(/\D/g, "");
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let doubleIt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (doubleIt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    doubleIt = !doubleIt;
  }
  return sum % 10 === 0;
}

function addCandidate(list, kind, start, end, prio) {
  if (end > start)
    list.push({ kind, token: TOKENS[kind], start, end, prio: prio ?? PRIORITY[kind] });
}

// --- Detectors --------------------------------------------------------------
// Each detector pushes { kind, start, end } candidates into `out`.
// Detectors never see or return the matched text in their output objects
// beyond positions; the caller slices the ORIGINAL (in memory) only to
// build the cleaned string.

function detectEmails(text, out) {
  const re = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  for (const m of text.matchAll(re)) addCandidate(out, "EMAIL", m.index, m.index + m[0].length);
}

function detectSecrets(text, out) {
  // "<keyword> ... <value>" e.g. "Your code is 482916", "PIN: 1234",
  // "password = hunter2x". The value must contain a digit for code-like
  // keywords, so ordinary sentences are not eaten.
  const re =
    /\b(otp|one[-\s]?time\s+(?:code|password|pin)|verification\s+code|security\s+code|access\s+code|code|pin|passcode|password|cvv)\b[\s\S]{0,24}?[:=#]?\s*([A-Za-z0-9][A-Za-z0-9._-]{2,19})/gi;
  for (const m of text.matchAll(re)) {
    const keyword = m[1].toLowerCase();
    const value = m[2];
    const digitOnlyKinds = ["otp", "code", "pin", "cvv"];
    const isDigitKind =
      digitOnlyKinds.some((k) => keyword.includes(k)) ||
      keyword.includes("verification") ||
      keyword.includes("security") ||
      keyword.includes("access") ||
      keyword.includes("one");
    if (isDigitKind && !/\d/.test(value)) continue;
    // Strip trailing words that are not part of a credential: if the value
    // captured is purely alphabetic and long, it is prose, not a secret.
    if (!/\d/.test(value) && keyword !== "password" && keyword !== "passcode") continue;
    const start = m.index + m[0].length - value.length;
    addCandidate(out, "CODE", start, start + value.length);
  }
  // "<value> is your/the code" e.g. "482916 is your code".
  const rev = /\b(\d{4,8})\s+is\s+(?:your|the)\s+(?:code|otp|pin)\b/gi;
  for (const m of text.matchAll(rev)) addCandidate(out, "CODE", m.index, m.index + m[1].length);
}

function detectCards(text, out) {
  // Runs of 13-19 digits, allowing single spaces or dashes between digits.
  const re = /\b\d(?:[ -]?\d){12,18}\b/g;
  for (const m of text.matchAll(re)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
      addCandidate(out, "CARD", m.index, m.index + m[0].length);
    }
  }
}

function detectPhones(text, out) {
  const patterns = [
    // International with leading + : +234 803 555 1234, +1 415 555 0132
    /\+\d[\d\s().-]{7,}\d/g,
    // Nigerian local, spaced or plain: 0803 555 1234 / 08035551234
    /\b0[789]\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g,
    /\b0[789][01]\d{8}\b/g,
    // (415) 555-0132 style
    /\(\d{3}\)\s*\d{3}[- ]\d{4}/g,
    // 415-555-0132 / 415 555 0132 style (3-3-4 with separators)
    /\b\d{3}[- ]\d{3}[- ]\d{4}\b/g,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const digits = m[0].replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 15) continue;
      addCandidate(out, "PHONE", m.index, m.index + m[0].length);
    }
  }
}

function detectLabelledIds(text, out) {
  // "NIN is 12345678901", "account number: 0123456789", "passport no A01234567"
  const re =
    /\b(nin|bvn|national\s+id|id\s+(?:number|no\.?|card)|account\s+(?:number|no\.?|num)|acct\.?\s*(?:number|no\.?)?|passport\s+(?:number|no\.?)?|driver'?s?\s+licen[cs]e\s*(?:number|no\.?)?)\b[\s\S]{0,16}?[:=#]?\s*([A-Za-z0-9][A-Za-z0-9-]{4,19})/gi;
  for (const m of text.matchAll(re)) {
    const value = m[2];
    if (!/\d/.test(value)) continue;
    const start = m.index + m[0].length - value.length;
    addCandidate(out, "ID", start, start + value.length, 1);
  }
}

function detectLongNumbers(text, out) {
  // Unlabelled runs of 9-12 digits: account numbers (10), NIN (11) and
  // similar. Longer runs are left to the card detector (Luhn decides).
  const re = /\b\d{9,12}\b/g;
  for (const m of text.matchAll(re)) addCandidate(out, "ID", m.index, m.index + m[0].length);
}

function detectAddresses(text, out) {
  // "address is <...>" / "address: <...>" up to the end of the line.
  const labelled = /\baddress\b\s*(?:is|:|-)?\s*([^\n]+)/gi;
  for (const m of text.matchAll(labelled)) {
    const value = m[1].trim();
    if (value.length < 4) continue;
    const start = m.index + m[0].length - m[1].length + m[1].indexOf(value);
    addCandidate(out, "ADDRESS", start, start + value.length);
  }
  // "<number> <words> Street/Road/Avenue/Close/..." optionally ", <Area>"
  const street =
    /\b\d{1,4}\s+(?:[A-Za-z][A-Za-z.'-]*\s+){0,4}?(?:Street|St\.?|Road|Rd\.?|Avenue|Ave\.?|Close|Crescent|Drive|Dr\.?|Lane|Ln\.?|Way|Boulevard|Blvd\.?)\b(?:\s*,\s*[A-Za-z][A-Za-z ]+?)?(?=[,.;\n]|$)/gi;
  for (const m of text.matchAll(street)) {
    addCandidate(out, "ADDRESS", m.index, m.index + m[0].length);
  }
}

// --- Public API ---------------------------------------------------------------

/**
 * Redact sensitive items from `text`.
 * @param {string} text original text (kept only in the caller's memory)
 * @param {Array<{start:number,end:number}>} manualRanges extra user-chosen
 *   spans to black out (tap/click-to-blackout), positions in `text`.
 * @returns {{cleaned: string, findings: Array<{kind:string, token:string, start:number, end:number}>}}
 *   `findings` positions refer to the ORIGINAL text. Removed values are not
 *   included anywhere in the return value.
 */
export function redactText(text, manualRanges = []) {
  const src = String(text ?? "");
  const candidates = [];

  detectEmails(src, candidates);
  detectSecrets(src, candidates);
  detectCards(src, candidates);
  detectLabelledIds(src, candidates);
  detectPhones(src, candidates);
  detectAddresses(src, candidates);
  detectLongNumbers(src, candidates);

  for (const r of manualRanges || []) {
    const start = Math.max(0, Math.min(src.length, r.start | 0));
    const end = Math.max(0, Math.min(src.length, r.end | 0));
    if (end > start)
      candidates.push({ kind: "MANUAL", token: TOKENS.MANUAL, start, end, prio: PRIORITY.MANUAL });
  }

  // Resolve overlaps: earliest start first; ties broken by priority, then
  // by the longer match. Keep a candidate only if it does not overlap an
  // already accepted one.
  candidates.sort(
    (a, b) =>
      a.start - b.start || a.prio - b.prio || (b.end - b.start) - (a.end - a.start),
  );
  const findings = [];
  let coveredUntil = -1;
  for (const c of candidates) {
    if (c.start < coveredUntil) continue;
    findings.push({ kind: c.kind, token: c.token, start: c.start, end: c.end });
    coveredUntil = c.end;
  }

  // Build the cleaned string from the accepted findings.
  let cleaned = "";
  let pos = 0;
  for (const f of findings) {
    cleaned += src.slice(pos, f.start) + f.token;
    pos = f.end;
  }
  cleaned += src.slice(pos);

  return { cleaned, findings };
}

/**
 * Counts per kind, e.g. { PHONE: 2, CODE: 1 }. Never includes values.
 */
export function summarizeFindings(findings) {
  const counts = {};
  for (const f of findings || []) counts[f.kind] = (counts[f.kind] || 0) + 1;
  return counts;
}

export function formatSummary(counts) {
  const kinds = Object.keys(counts || {});
  if (kinds.length === 0) return "Nothing sensitive found.";
  const parts = kinds
    .sort()
    .map((k) => `${counts[k]} x ${k}`);
  return `Removed: ${parts.join(", ")}.`;
}
