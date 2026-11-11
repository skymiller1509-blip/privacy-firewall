# Privacy Firewall - Build Log

## v1 built: 2026-11-11

First working version, built to the locked spec in
`~/workspace/hackathons/firebase/SPEC_LOCKED.md`. Base was the starter
skeleton (`../starter/`, Vite + firebase 13.2.0); its local git history was
not carried over - this folder is a fresh local repo, nothing pushed.

Pitch: **"Ask AI anything without leaking anything."**

## What was built

- `index.html` - one screen, three steps: paste text + question; before /
  after panels (side by side on wide screens, stacked on mobile); Ask step
  with answer area, source badge and receipt line. Carries a clearly fake
  prefilled sample (555 phone, test email) so the first run shows cleaning.
- `src/redact.js` - the redaction engine. Plain JS, fully local, no network.
  Finds: EMAIL; PHONE (Nigerian plain/spaced, + international, (415) style,
  3-3-4 style); CODE (values beside code / OTP / PIN / password / passcode /
  CVV / verification code, plus "482916 is your code"); CARD (13-19 digit
  runs that pass the Luhn check); ID (labelled NIN / BVN / account / passport
  / licence numbers, plus unlabelled 9-12 digit runs); ADDRESS ("address
  is ..." lines and "<number> ... Street/Road/Avenue/..." patterns).
  Overlaps resolve by start, then priority, then length (labelled IDs and
  phones outrank generic long numbers). Returns cleaned text + findings as
  kinds and positions only; removed values appear in no output.
- `src/main.js` - flow wiring. Cleaning also runs over the question.
  Tap/click-to-blackout: selecting text in the Before view (a single text
  node, so selection offsets are original-text positions) enables a button
  that adds a MANUAL redaction and re-cleans. Editing either input
  invalidates the cleaned copy and manual ranges, and disables Ask until
  re-cleaned. The Ask handler builds its prompt ONLY from the cleaned
  variables (invariant is commented at the call site) and calls Firebase AI
  Logic with `InferenceMode.PREFER_ON_DEVICE`, kept from the skeleton.
  Badge text is exactly "Ran on your device" (ON_DEVICE) or
  "Sent to the cloud" (IN_CLOUD), from `response.inferenceSource`. The
  receipt line reports counts per kind + where the cleaned text was
  answered. No storage APIs are called anywhere (the words localStorage /
  sessionStorage appear only in a comment stating they are not used;
  verified by grep). No history, no accounts, no images.
- `src/firebase-config.js` - copied from the skeleton UNCHANGED: the
  `REPLACE_ME` placeholder and `isConfigured` guard are intact.
- `LICENSE` - Apache-2.0, full text.
- `README.md` - pitch, how it works, how Firebase AI Logic is used, the
  honest note that the finder is on-device pattern code (not a cloud call,
  works offline), approval-before-send, setup and deploy steps.
- `test/redact.test.js` - node test runner, no new dependencies.

## Test results

`npm test` (node --test): **13 tests, 13 pass, 0 fail.**
Coverage: email; Nigerian phone plain + spaced; international phones;
OTP beside "code"; PIN and password; Luhn-valid card (4242...42) flagged
as CARD; Luhn-invalid 16-digit number (4242...41) NOT flagged as a card and
left in the text; labelled NIN as ID; unlabelled 10-digit number as ID;
street address; manual range blackout; clean text passes through
unchanged; summary counts kinds and serialises with no removed values.

## Build result

`npm install`: 149 packages, clean. `npm run build` (vite 7.3.8):
**success** - dist/index.html 3.86 kB, JS bundle 64.96 kB (gzip 20.45 kB).

Smoke check of the prefilled sample through the engine: phone, gate code,
account number and email all replaced, counts line correct.

## Update 2026-11-11: App Check wired

Context: the real Firebase config for `privacy-firewall-583a4` landed
(commit d56646a), and App Check was registered in the Firebase console
for the web app with the Fraud Defense (reCAPTCHA Enterprise) provider.

- `src/firebase-config.js` - new exported constant `appCheckSiteKey`
  holding the public reCAPTCHA Enterprise site key, with a comment that
  it is a public client identifier, not a secret. No secret keys anywhere.
- `src/appcheck.js` (new) - `initAppCheck(app)` calls
  `initializeAppCheck` from `firebase/app-check` with
  `new ReCaptchaEnterpriseProvider(appCheckSiteKey)` and
  `isTokenAutoRefreshEnabled: true` (console token TTL: 1 hour).
  Local development: when `window.location.hostname` is `localhost` or
  `127.0.0.1`, it sets `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` BEFORE
  `initializeAppCheck`, so the SDK prints a debug token in the browser
  console for one-time registration in the console (debug tokens are for
  local testing only; the hackathon notes say they are accepted in
  submissions). Production hostnames never take that branch.
- `src/main.js` - imports `initAppCheck` and calls it in the configured
  branch immediately after `initializeApp(firebaseConfig)` and before
  `getAI(...)`, so no Firebase AI Logic model call can precede it. The
  unconfigured (placeholder) branch never initializes App Check.
- `README.md` - new "App Check" section documenting the provider,
  registration, 1-hour TTL, the public site key, and the localhost-only
  debug-token behaviour.

Checks after this change: `npm test` - **13 tests, 13 pass, 0 fail**
(unchanged). `npm run build` - **success** (vite 7.3.8; dist/index.html
3.86 kB, JS bundle 79.89 kB, gzip 25.57 kB - larger than v1 because the
app-check module is now bundled). Grep of the built bundle confirms the
debug-token flag and the site key are present.

## Deliberately stubbed / not done

- **Real Firebase config**: stubbed on purpose. With the placeholder, the
  whole cleaning flow works and Ask reports that Firebase is not connected
  and nothing was sent. The real config lands after Eddie's Firebase
  project creation / sign-in step; then Ask reaches the model.
- **App Check**: WIRED 2026-11-11 (see the update section above).
- **Origin Trial token** for public on-device inference: meta tag spot
  still commented in index.html, as in the skeleton.
- Demo video, hosting deploy and Devpost submission: later steps, not
  part of this build.

## 2026-11-11 afternoon: LIVE END TO END
- Firebase CLI login completed (XDG_CONFIG_HOME workaround: configstore chown EPERM fixed by a root-group, non-setgid config dir at ~/workspace/.config-fb3). Deploy: `firebase deploy --only hosting --project privacy-firewall-583a4` succeeded.
- Hosting URL: https://privacy-firewall-583a4.web.app
- Full flow verified live in a real browser at that URL with the prefilled sample: Clean produced "[PHONE] ... [CODE] ... [ID] ... [EMAIL]" with findings "Removed: 1 x CODE, 1 x EMAIL, 1 x ID, 1 x PHONE." Ask returned a real Gemini answer (polite rent-extension letter, placeholder [ID] preserved), badge "Sent to the cloud", receipt "Removed: 1 x CODE, 1 x EMAIL, 1 x ID, 1 x PHONE. Cleaned text sent to the cloud. The original text was not sent."
- App Check debug token "Mabel VM test" registered in console (for localhost testing only).
