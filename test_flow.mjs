// Full live flow test: clean the prefilled sample, then Ask and capture the
// real Firebase AI Logic answer, badge and receipt.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = '/home/hatch/workspace/tools/browsers/chrome-headless-shell/linux-157.0.8103.50/chrome-headless-shell-linux64/chrome-headless-shell';
const APP = '/home/hatch/workspace/hackathons/firebase/firewall';
const PORT = 4173, DBG = 9225;
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
    consoleTexts.push((m.params.args || []).map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
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
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1400, deviceScaleFactor: 1, mobile: false }, S);

async function evl(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S);
  if (r.result?.exceptionDetails) consoleTexts.push('EVAL ERR ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' }, S);
  if (r.result?.data) writeFileSync(`${APP}/${name}.png`, Buffer.from(r.result.data, 'base64'));
}

for (let i = 0; i < 40; i++) { if (await evl(`!!document.getElementById('cleanBtn')`)) break; await sleep(500); }
await sleep(3000);

await evl(`document.getElementById('cleanBtn').click()`);
await sleep(1500);
console.log('AFTER VIEW:', await evl(`document.getElementById('afterView').innerText`));
console.log('FINDINGS:', await evl(`document.getElementById('findingsSummary').innerText`));
await shot('live_test_cleaned');

console.log('ASK disabled?', await evl(`document.getElementById('askBtn').disabled`));
await evl(`document.getElementById('askBtn').click()`);
let answer = '';
for (let i = 0; i < 40; i++) {
  await sleep(2000);
  answer = await evl(`document.getElementById('answer').innerText`);
  const badge = await evl(`document.getElementById('sourceBadge').innerText`);
  if (answer && answer.trim().length > 5 && !/asking|working|thinking/i.test(answer)) { console.log('BADGE:', badge); break; }
  if (i % 5 === 4) console.log('waiting... answer so far:', (answer || '').slice(0, 120), '| badge:', badge);
}
console.log('ANSWER:', (answer || '').slice(0, 900));
console.log('BADGE FINAL:', await evl(`document.getElementById('sourceBadge').innerText`));
console.log('RECEIPT:', await evl(`document.getElementById('receipt').innerText`));
console.log('STATUS:', await evl(`document.getElementById('status').innerText`));
await shot('live_test_answer');
console.log('--- CONSOLE (filtered) ---');
for (const c of consoleTexts.filter(x => !x.includes('debug token'))) console.log(c);

chrome.kill(); server.kill();
process.exit(0);
