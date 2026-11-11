# Privacy Firewall

**Ask AI anything without leaking anything.**

An entry for the Firebase Hybrid AI Hackathon (#BuildHybridAI 2026), Web platform.

## What it does

1. You paste private text and a question about it.
2. The app cleans the text **on your device first**: phone numbers (Nigerian
   and international), email addresses, one-time codes, PINs and passwords,
   bank card numbers (checked with the Luhn digit test), ID and account
   numbers, and street addresses are replaced with tokens like `[PHONE]`,
   `[CODE]`, `[CARD]`.
3. You see a before-and-after view. Anything the finder missed, you can
   black out yourself by selecting it in the Before view.
4. Only when you press **Ask** is anything sent, and the app sends **only the
   cleaned text** to the AI. The original text never leaves the device.
5. Every answer carries a badge, **"Ran on your device"** or
   **"Sent to the cloud"**, plus a receipt line: what was removed (counts and
   kinds only, never the removed values) and where the cleaned text was
   answered.

No chat history. No accounts. No image support. The original text is never
stored anywhere: there is no localStorage, database or history of it.

## How Firebase AI Logic is used

All AI inference goes through **Firebase AI Logic** (the `firebase/ai` JS
SDK). Nothing else calls a model.

- The model is created with `InferenceMode.PREFER_ON_DEVICE`, so Chrome's
  on-device Gemini Nano answers when it is available and the cloud Gemini
  model answers otherwise.
- Every response's `inferenceSource` (`ON_DEVICE` / `IN_CLOUD`) drives the
  badge, so the label on each answer is the SDK's own report, not a guess.
- The prompt is built only from the cleaned text and the cleaned question,
  and the model is told never to guess or reconstruct the blacked-out parts.

## App Check

Firebase AI Logic requires **App Check**, and it is wired up in
`src/appcheck.js`:

- **Provider:** Fraud Defense (**reCAPTCHA Enterprise**), registered for
  this web app in the Firebase console for project
  `privacy-firewall-583a4`. Token TTL is **1 hour**, with auto-refresh
  enabled (`isTokenAutoRefreshEnabled: true`).
- `initAppCheck(app)` runs immediately after `initializeApp()` and before
  `getAI()` / any model call, and only when the real Firebase config is in
  place.
- The reCAPTCHA Enterprise **site key** lives in `src/firebase-config.js`
  as `appCheckSiteKey`. It is a public identifier that ships in client
  code by design; the provider's secret key is never in this repo.
- **Local development:** on `localhost` / `127.0.0.1` only, the app sets
  `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` before initializing App
  Check, so the SDK prints a debug token in the browser console for
  one-time registration in the console (App Check > Apps > debug tokens).
  Debug tokens are for local testing only; the hackathon notes say debug
  tokens are accepted in submissions. Production hostnames never set it.

## Honest note about the finder

The sensitive-part finder is **on-device pattern-matching code**
(`src/redact.js`, plain JavaScript), not an AI model and not a cloud call.
It runs fully offline, on any device, and that is deliberate: pattern code,
not a local model, is what guarantees the same coverage everywhere,
including phones with no on-device AI. Pattern matching is good, not
perfect, which is why the cleaned copy always needs your approval before
sending, and why you can black out anything it missed yourself.

## Run it locally

```sh
npm install
npm test        # redaction engine unit tests (node test runner)
npm run dev     # Vite dev server
npm run build   # production build into dist/
```

Cleaning, the before-and-after view and manual blackout all work with the
placeholder config. To get real answers you need a Firebase project:

1. Create the Firebase project (a Google-account sign-in step).
2. In the Firebase console, open the **AI Logic** page and run the guided
   **Get started** workflow with the **Gemini Developer API** provider
   (free tier; no billing needed to start). App Check is required by
   Firebase AI Logic; debug tokens are accepted for submissions.
3. Register a Web app in the project and paste its config into
   `src/firebase-config.js` (replace the `REPLACE_ME` values). Never put a
   Gemini API key in the code; with Firebase AI Logic the key stays
   server-side.
4. For on-device inference in desktop Chrome: Chrome v139+. A publicly
   hosted demo that shows on-device inference to visitors needs a Prompt
   API Chrome Origin Trial token (meta tag spot is marked in `index.html`).

## Deploy (Firebase Hosting)

```sh
npm run build
firebase deploy --only hosting   # firebase-tools CLI
```

## License

Apache License 2.0. See `LICENSE`.
