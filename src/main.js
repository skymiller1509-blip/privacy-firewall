// Privacy Firewall - one screen, three steps.
// 1. Paste private text + a question.
// 2. The local redaction engine (src/redact.js, plain JS, no network) cleans
//    the text ON THIS DEVICE. The user checks the cleaned copy and can black
//    out anything missed by selecting it in the Before view.
// 3. Only after the user presses Ask is anything sent, and the ONLY text the
//    Firebase AI Logic call ever receives is the cleaned variables below.
//
// No chat history, no accounts, no image support, and no storage: the
// original text and the removed values are never written to localStorage,
// sessionStorage, a database or anywhere else. They live only in this
// page's memory while the tab is open.
import { initializeApp } from "firebase/app";
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
} from "firebase/ai";
import { firebaseConfig, isConfigured } from "./firebase-config.js";
import { initAppCheck } from "./appcheck.js";
import { redactText, summarizeFindings, formatSummary } from "./redact.js";

const statusEl = document.getElementById("status");
const sourceEl = document.getElementById("sourceText");
const questionEl = document.getElementById("question");
const cleanBtn = document.getElementById("cleanBtn");
const beforeEl = document.getElementById("beforeView");
const afterEl = document.getElementById("afterView");
const summaryEl = document.getElementById("findingsSummary");
const blackoutBtn = document.getElementById("blackoutBtn");
const askBtn = document.getElementById("askBtn");
const badgeEl = document.getElementById("sourceBadge");
const answerEl = document.getElementById("answer");
const receiptEl = document.getElementById("receipt");

// State for the current cleaning round (memory only).
let cleanedText = null; // cleaned version of the pasted text
let cleanedQuestion = null; // cleaned version of the question
let totalCounts = {}; // counts per kind, for BOTH text and question
let manualRanges = []; // user-added blackout spans, positions in the original
let pendingSelection = null; // selection waiting for the blackout button

function runClean() {
  const original = sourceEl.value;
  const question = questionEl.value;

  const textResult = redactText(original, manualRanges);
  const questionResult = redactText(question);

  cleanedText = textResult.cleaned;
  cleanedQuestion = questionResult.cleaned;
  totalCounts = summarizeFindings([...textResult.findings, ...questionResult.findings]);

  beforeEl.textContent = original === "" ? "(empty)" : original;
  afterEl.textContent = cleanedText === "" ? "(empty)" : cleanedText;
  summaryEl.textContent =
    formatSummary(totalCounts) +
    (questionResult.findings.length > 0 ? " (Your question was cleaned too.)" : "");

  badgeEl.hidden = true;
  answerEl.textContent = "(no answer yet)";
  receiptEl.textContent = "";
  pendingSelection = null;
  blackoutBtn.disabled = true;
  askBtn.disabled = false;
}

cleanBtn.addEventListener("click", runClean);

// Editing the inputs invalidates the cleaned copy and any manual ranges
// (their positions refer to the old text), so Ask turns off until re-clean.
for (const el of [sourceEl, questionEl]) {
  el.addEventListener("input", () => {
    if (el === sourceEl) manualRanges = [];
    cleanedText = null;
    cleanedQuestion = null;
    askBtn.disabled = true;
    if (beforeEl.textContent !== "(nothing cleaned yet)") {
      afterEl.textContent = "(text changed - clean again)";
    }
  });
}

// --- Tap/click-to-blackout ----------------------------------------------------
// The Before view is a single text node, so the browser selection offsets
// are exactly positions in the original text.
function captureSelection() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return;
  if (!beforeEl.contains(sel.anchorNode) || !beforeEl.contains(sel.focusNode)) return;
  const start = Math.min(sel.anchorOffset, sel.focusOffset);
  const end = Math.max(sel.anchorOffset, sel.focusOffset);
  if (end > start && cleanedText !== null) {
    pendingSelection = { start, end };
    blackoutBtn.disabled = false;
  }
}
beforeEl.addEventListener("mouseup", captureSelection);
beforeEl.addEventListener("keyup", captureSelection);
beforeEl.addEventListener("touchend", captureSelection);

blackoutBtn.addEventListener("click", () => {
  if (!pendingSelection) return;
  manualRanges.push(pendingSelection);
  window.getSelection()?.removeAllRanges();
  runClean();
});

// --- Firebase AI Logic (hybrid inference) --------------------------------------
if (!isConfigured) {
  statusEl.textContent =
    "Cleaning works now - Firebase config is still a placeholder, so Ask cannot reach the model yet (see src/firebase-config.js)";
  askBtn.addEventListener("click", () => {
    answerEl.textContent =
      "Firebase is not connected yet, so nothing was sent. Once a real Firebase project config is added, this button sends ONLY the cleaned text above.";
    receiptEl.textContent =
      "Receipt: " + formatSummary(totalCounts) + " Nothing left this device.";
  });
} else {
  const app = initializeApp(firebaseConfig);
  // App Check must be initialized before any Firebase AI Logic call:
  // AI Logic rejects requests without a valid App Check token. This runs
  // only on this isConfigured branch (see src/appcheck.js).
  initAppCheck(app);
  const ai = getAI(app, { backend: new GoogleAIBackend() });

  statusEl.textContent = "Ready - cleaning is local, answers come from Firebase AI Logic";
  askBtn.addEventListener("click", async () => {
    if (cleanedText === null) return;
    answerEl.textContent = "Running...";
    badgeEl.hidden = true;
    try {
      // Per the docs, getGenerativeModel must be called on/after a user
      // interaction when using an inference mode - hence inside this handler.
      const model = getGenerativeModel(ai, {
        mode: InferenceMode.PREFER_ON_DEVICE,
      });
      // INVARIANT: the prompt is built ONLY from cleanedText and
      // cleanedQuestion. The original text is never concatenated here.
      const prompt =
        "Use only the cleaned text below. Private details have been replaced " +
        "with tokens like [PHONE] or [CODE]; never guess or reconstruct them.\n\n" +
        "Cleaned text:\n" +
        cleanedText +
        "\n\nQuestion:\n" +
        cleanedQuestion;
      const result = await model.generateContent(prompt);
      answerEl.textContent = result.response.text();

      // inferenceSource (JS SDK v12.5.0+) tells us which side answered.
      const src = result.response.inferenceSource;
      let where = "answer source not reported";
      if (src) {
        const onDevice = src === "ON_DEVICE";
        badgeEl.textContent = onDevice ? "Ran on your device" : "Sent to the cloud";
        badgeEl.className = "chip " + (onDevice ? "device" : "cloud");
        badgeEl.hidden = false;
        where = onDevice ? "ran on your device" : "sent to the cloud";
      }
      receiptEl.textContent =
        "Receipt: " +
        formatSummary(totalCounts) +
        " Cleaned text " +
        where +
        ". The original text was not sent.";
    } catch (err) {
      answerEl.textContent = "Error: " + (err && err.message ? err.message : String(err));
    }
  });
}
