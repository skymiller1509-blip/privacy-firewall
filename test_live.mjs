// Live local test driver: loads Privacy Firewall in headless Chrome,
// captures console output (for the App Check debug token), and dumps page text.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = '/home/hatch/workspace/tools/browsers/chrome-headless-shell/linux-157.0.8103.50/chrome-headless-shell-linux64/chrome-headless-shell';
const APP = '/home/hatch/workspace/hackathons/firebase/firewall';
const PORT = 4173, DBG = 9224;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1'], { cwd: APP, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--no-sandbox', '--disable-gpu', `--remote-debugging-port=${DBG}`, '--user-data-dir=/tmp/chrome-prof-fw', 'about:blank'], { stdio: 'ignore' });

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`http://localhost:${DBG}/json/version`); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch {}
    await sleep(500);
  }
  throw new Error('chrome debug port never came up');
}

const ws = new WebSocket(await getWsUrl());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let nextId = 0; const pending = new Map(); const consoleTexts = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled') {
    const txt = (m.params.args || []).map(a => a.value ?? a.description ?? '').join(' ');
    consoleTexts.push(txt);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    consoleTexts.push('EXCEPTION: ' + JSON.stringify(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').slice(0, 400));
  }
};
function send(method, params = {}, sessionId) {
  return new Promise((resolve) => { const id = ++nextId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
}

const t = await send('Target.createTarget', { url: `http://localhost:${PORT}/` });
const att = await send('Target.attachToTarget', { targetId: t.result.targetId, flatten: true });
const S = att.result.sessionId;
await send('Page.enable', {}, S);
await send('Runtime.enable', {}, S);

async function evl(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S);
  if (r.result?.exceptionDetails) consoleTexts.push('EVAL ERR ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
}

for (let i = 0; i < 40; i++) { const ok = await evl(`document.body && document.body.innerText.length > 50`); if (ok) break; await sleep(500); }
await sleep(5000);

const bodyText = await evl(`document.body.innerText.slice(0, 1200)`);
console.log('--- PAGE TEXT ---');
console.log(bodyText);
console.log('--- CONSOLE ---');
for (const c of consoleTexts) console.log(c.slice(0, 500));
const tokenMatch = consoleTexts.join('\n').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
if (tokenMatch) { writeFileSync(APP + '/debug_token.txt', tokenMatch[0]); console.log('DEBUG TOKEN SAVED:', tokenMatch[0]); }

const shot = await send('Page.captureScreenshot', { format: 'png' }, S);
if (shot.result?.data) writeFileSync(APP + '/live_test_home.png', Buffer.from(shot.result.data, 'base64'));

chrome.kill(); server.kill();
process.exit(0);
