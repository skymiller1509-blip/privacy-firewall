// ============================================================================
// Firebase web config for the Privacy Firewall project.
// ----------------------------------------------------------------------------
// Project: Privacy Firewall (privacy-firewall-583a4), registered 2026-11-11
// under Eddie's Google account. These are the public web identifiers shown
// on the console's "Add Firebase SDK" step; they identify the app but are
// not passwords. Access is controlled by Firebase (App Check + the Gemini
// Developer API provider set up under AI Logic), not by hiding these values.
//
// Do NOT put a Gemini API key in this file. With Firebase AI Logic the key
// stays server-side behind the Firebase proxy (see docs in PREP.md).
// ============================================================================

export const firebaseConfig = {
  apiKey: "AIzaSyAK7OWxYjmtzihUeABVjogOk7XK4X9nzqg",
  authDomain: "privacy-firewall-583a4.firebaseapp.com",
  projectId: "privacy-firewall-583a4",
  storageBucket: "privacy-firewall-583a4.firebasestorage.app",
  messagingSenderId: "840375627222",
  appId: "1:840375627222:web:878fe62359c121b30b8877",
  measurementId: "G-17GK4MN5GC",
};

export const isConfigured = !Object.values(firebaseConfig).includes("REPLACE_ME");

// App Check site key for this project's web app (Fraud Defense provider,
// i.e. reCAPTCHA Enterprise, registered in the Firebase console for
// project privacy-firewall-583a4 on 2026-11-11). This is a PUBLIC
// identifier: it is meant to ship in client code and names the site to
// the provider. It is NOT a secret key - the reCAPTCHA Enterprise secret
// key never belongs in this repo or in any client code.
export const appCheckSiteKey = "6LdDIxouAAAAADcc9HVpaitcDt7MdTWk65PQdvej";
