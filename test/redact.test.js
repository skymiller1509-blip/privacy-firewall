// Unit tests for the local redaction engine. Plain node test runner:
//   npm test   (node --test test/)
// All sample values below are fake / well-known test values.
import { test } from "node:test";
import assert from "node:assert/strict";
import { redactText, summarizeFindings, luhnValid } from "../src/redact.js";

function kinds(result) {
  return result.findings.map((f) => f.kind);
}

test("email is redacted", () => {
  const r = redactText("Write to adaeze.example@testmail.com please.");
  assert.deepEqual(kinds(r), ["EMAIL"]);
  assert.equal(r.cleaned, "Write to [EMAIL] please.");
});

test("Nigerian phone, plain and spaced, is redacted as PHONE", () => {
  const plain = redactText("Call me on 08035551234 today.");
  assert.deepEqual(kinds(plain), ["PHONE"]);
  assert.equal(plain.cleaned, "Call me on [PHONE] today.");

  const spaced = redactText("Call me on 0803 555 1234 today.");
  assert.deepEqual(kinds(spaced), ["PHONE"]);
  assert.equal(spaced.cleaned, "Call me on [PHONE] today.");
});

test("international phone with + is redacted as PHONE", () => {
  const r = redactText("Reach the office at +234 803 555 1234 or +1 415 555 0132.");
  assert.deepEqual(kinds(r), ["PHONE", "PHONE"]);
  assert.ok(!r.cleaned.includes("803"));
  assert.ok(!r.cleaned.includes("415"));
});

test("one-time code next to the word code is redacted", () => {
  const r = redactText("Your code is 482916, do not share it.");
  assert.deepEqual(kinds(r), ["CODE"]);
  assert.equal(r.cleaned, "Your code is [CODE], do not share it.");
});

test("PIN and password values are redacted", () => {
  const pin = redactText("My PIN: 7392 must stay secret.");
  assert.deepEqual(kinds(pin), ["CODE"]);
  assert.ok(!pin.cleaned.includes("7392"));

  const pw = redactText("The password is sunMoon42 for the test account.");
  assert.deepEqual(kinds(pw), ["CODE"]);
  assert.ok(!pw.cleaned.includes("sunMoon42"));
});

test("Luhn-valid card number is redacted as CARD", () => {
  assert.equal(luhnValid("4242424242424242"), true);
  const r = redactText("Charge 4242 4242 4242 4242 for the ticket.");
  assert.deepEqual(kinds(r), ["CARD"]);
  assert.equal(r.cleaned, "Charge [CARD] for the ticket.");
});

test("Luhn-invalid long number is NOT flagged as a card", () => {
  assert.equal(luhnValid("4242424242424241"), false);
  const r = redactText("Reference 4242424242424241 is just an order number.");
  assert.ok(!kinds(r).includes("CARD"));
  assert.ok(r.cleaned.includes("4242424242424241"));
});

test("labelled ID number is redacted as ID", () => {
  const r = redactText("My NIN is 12345678901 and it is private.");
  assert.deepEqual(kinds(r), ["ID"]);
  assert.ok(!r.cleaned.includes("12345678901"));
});

test("unlabelled 10-digit account-style number is redacted as ID", () => {
  const r = redactText("Send it to 0123456789 when you can.");
  assert.deepEqual(kinds(r), ["ID"]);
  assert.equal(r.cleaned, "Send it to [ID] when you can.");
});

test("street address is redacted as ADDRESS", () => {
  const r = redactText("Deliver to 14 Allen Avenue, Ikeja this week.");
  assert.deepEqual(kinds(r), ["ADDRESS"]);
  assert.ok(r.cleaned.startsWith("Deliver to [ADDRESS]"));
  assert.ok(!r.cleaned.includes("Allen"));
});

test("manual range is blacked out as MANUAL", () => {
  const text = "My name is Adaeze and I live in Lagos.";
  const start = text.indexOf("Adaeze");
  const r = redactText(text, [{ start, end: start + "Adaeze".length }]);
  assert.deepEqual(kinds(r), ["MANUAL"]);
  assert.equal(r.cleaned, "My name is [REDACTED] and I live in Lagos.");
});

test("clean text passes through unchanged with no findings", () => {
  const text = "The meeting is at noon tomorrow and lunch is rice and beans.";
  const r = redactText(text);
  assert.equal(r.cleaned, text);
  assert.deepEqual(r.findings, []);
});

test("summary counts kinds and never contains removed values", () => {
  const r = redactText(
    "Call 08035551234 or 0803 555 1234. Your code is 482916. Mail me at a.b@testmail.com.",
  );
  const counts = summarizeFindings(r.findings);
  assert.equal(counts.PHONE, 2);
  assert.equal(counts.CODE, 1);
  assert.equal(counts.EMAIL, 1);
  const serialised = JSON.stringify(counts);
  assert.ok(!serialised.includes("482916"));
  assert.ok(!serialised.includes("0803"));
});
