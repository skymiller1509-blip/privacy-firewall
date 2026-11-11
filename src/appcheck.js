// ============================================================================
// Firebase App Check for Privacy Firewall.
//
// Firebase AI Logic requires App Check: it proves the request comes from
// this real app before the Gemini Developer API proxy accepts it. Our
// provider is Fraud Defense (reCAPTCHA Enterprise), registered for this
// web app in the Firebase console, token TTL 1 hour, auto-refreshed.
//
// initAppCheck() is called from src/main.js right after initializeApp()
// and BEFORE getAI() / any getGenerativeModel() call, and only when the
// real config is in place (isConfigured). The site key is a public
// identifier (see src/firebase-config.js) - no secret keys exist here.
// ============================================================================
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";
import { appCheckSiteKey } from "./firebase-config.js";

function isLocalhost() {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

export function initAppCheck(app) {
  // --- Local development debug token -------------------------------------
  // On localhost / 127.0.0.1 ONLY, ask the SDK to use a debug token
  // instead of reCAPTCHA: it prints a token in the browser console, which
  // gets registered once in the Firebase console (App Check > Apps >
  // debug tokens) so local testing can call AI Logic without a real
  // reCAPTCHA challenge. Debug tokens are for local testing only - the
  // hackathon submission notes say they are accepted in submissions -
  // and this branch can never run on a production hostname.
  if (isLocalhost()) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }

  return initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}
