'use strict';

/**
 * Black-box integration test: real FamilyTV server (child process) driving a
 * fake adb, exercised over HTTP and through the control_tv AI runner.
 * No Google TV hardware required.
 */

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runControlTv } = require('../ai/familytv-tool-runner');

const SERVER_PORT = 3997;
const BASE = `http://127.0.0.1:${SERVER_PORT}`;
const ROOT = path.join(__dirname, '..');
const FAKE_ADB = path.join(__dirname, 'fake-adb.js');
const ADB_LOG = path.join(os.tmpdir(), `familytv-adb-${process.pid}.log`);

let serverProc;

function readLog() {
  try { return fs.readFileSync(ADB_LOG, 'utf8').trim().split('\n').filter(Boolean); }
  catch { return []; }
}

async function waitForHealthy(timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not become healthy');
}

before(async () => {
  fs.chmodSync(FAKE_ADB, 0o755);
  serverProc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      LISTEN_HOST: '127.0.0.1',
      DRIVER: 'google-tv',
      ADB_BIN: FAKE_ADB,
      ADB_LOG,
      GOOGLE_TV_ADDR: 'mock:5555',
    },
    stdio: 'ignore',
  });
  await waitForHealthy();
});

after(() => {
  if (serverProc) serverProc.kill();
  try { fs.unlinkSync(ADB_LOG); } catch { /* ignore */ }
});

beforeEach(() => { try { fs.writeFileSync(ADB_LOG, ''); } catch { /* ignore */ } });

test('GET /health reports the device reachable with its model', async () => {
  const body = await (await fetch(`${BASE}/health`)).json();
  assert.equal(body.ok, true);
  assert.equal(body.model, 'Google TV Streamer');
});

test('GET /config advertises driver, apps, and keys', async () => {
  const cfg = await (await fetch(`${BASE}/config`)).json();
  assert.equal(cfg.driver, 'google-tv');
  assert.ok(cfg.apps.includes('netflix'));
  assert.ok(cfg.keys.includes('home'));
});

test('PWA assets are served for home-screen install', async () => {
  const manifestRes = await fetch(`${BASE}/manifest.webmanifest`);
  assert.equal(manifestRes.status, 200);
  assert.match(manifestRes.headers.get('content-type'), /manifest\+json/);
  const manifest = await manifestRes.json();
  assert.equal(manifest.name, 'FamilyTV Remote');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.type === 'image/png'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.type === 'image/png'));

  const swRes = await fetch(`${BASE}/sw.js`);
  assert.equal(swRes.status, 200);
  assert.match(swRes.headers.get('content-type'), /javascript/);

  const iconRes = await fetch(`${BASE}/icons/icon-192.png`);
  assert.equal(iconRes.status, 200);
  assert.equal(iconRes.headers.get('content-type'), 'image/png');
  const icon = Buffer.from(await iconRes.arrayBuffer());
  assert.equal(icon.slice(1, 4).toString(), 'PNG');
});

test('GET /current-app parses the foreground package', async () => {
  const c = await (await fetch(`${BASE}/current-app`)).json();
  assert.equal(c.package, 'com.google.android.youtube.tv');
  assert.equal(c.app, 'youtube');
});

test('GET /apps lists installed packages', async () => {
  const apps = await (await fetch(`${BASE}/apps`)).json();
  assert.ok(apps.some((a) => a.package === 'com.netflix.ninja' && a.app === 'netflix'));
});

test('POST /remote/:key sends the mapped keyevent', async () => {
  const res = await fetch(`${BASE}/remote/home`, { method: 'POST' });
  assert.equal(res.status, 200);
  assert.deepEqual(readLog(), ['keyevent KEYCODE_HOME']);
});

test('POST /remote/:key with an unknown key is a 400', async () => {
  const res = await fetch(`${BASE}/remote/launch_nukes`, { method: 'POST' });
  assert.equal(res.status, 400);
  assert.deepEqual(readLog(), []);
});

test('POST /command opens an app from natural language', async () => {
  const res = await fetch(`${BASE}/command`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'open hulu' }),
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.parsed.action, 'open_app');
  assert.equal(body.parsed.app_name, 'hulu');
  assert.deepEqual(readLog(), ['launch com.hulu.livingroomplus']);
});

test('POST /command presses a remote key from natural language', async () => {
  const res = await fetch(`${BASE}/command`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'press right' }),
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.parsed.action, 'press_button');
  assert.equal(body.parsed.key, 'right');
  assert.deepEqual(readLog(), ['keyevent KEYCODE_DPAD_RIGHT']);
});

test('POST /command types text from natural language', async () => {
  const res = await fetch(`${BASE}/command`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'type Dr Phil' }),
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.parsed.action, 'type_text');
  assert.equal(body.parsed.text, 'Dr Phil');
  assert.deepEqual(readLog(), ['text Dr%sPhil']);
});

test('POST /command opens Google TV search from natural language', async () => {
  const res = await fetch(`${BASE}/command`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'open Gemini' }),
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.parsed.action, 'open_tv_assistant');
  assert.deepEqual(readLog(), ['assistant_open']);
});

test('POST /command sends a dictated query to Google TV search', async () => {
  const res = await fetch(`${BASE}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'ask Gemini weather' }),
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.parsed.action, 'ask_tv_assistant');
  assert.equal(body.parsed.query, 'weather');
  assert.deepEqual(readLog(), ['assistant_query weather']);
});

test('POST /command sends a multi-word dictated query to Google TV search', async () => {
  const res = await fetch(`${BASE}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'ask Google TV to find Shrek' }),
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.parsed.action, 'ask_tv_assistant');
  assert.equal(body.parsed.query, 'Shrek');
  assert.deepEqual(readLog(), ['assistant_query Shrek']);
});

test('POST /command maps find movie phrases to Google TV search', async () => {
  const res = await fetch(`${BASE}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'find the movie Shrek' }),
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.parsed.action, 'ask_tv_assistant');
  assert.equal(body.parsed.query, 'Shrek');
  assert.deepEqual(readLog(), ['assistant_query Shrek']);
});

test('POST /command rejects unknown commands before any device action', async () => {
  const res = await fetch(`${BASE}/command`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'make toast' }),
  });
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.ok, false);
  assert.deepEqual(readLog(), []);
});

test('POST /type escapes spaces and sends input text', async () => {
  const res = await fetch(`${BASE}/type`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'hello world' }),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(readLog(), ['text hello%sworld']);
});

test('POST /launch/:appName launches the mapped package', async () => {
  const res = await fetch(`${BASE}/launch/netflix`, { method: 'POST' });
  assert.equal(res.status, 200);
  assert.deepEqual(readLog(), ['launch com.netflix.ninja']);
});

test('POST /launch/:appName with an unknown app is a 400', async () => {
  const res = await fetch(`${BASE}/launch/myspacetv`, { method: 'POST' });
  assert.equal(res.status, 400);
});

test('POST /task/reset-home presses Home', async () => {
  const res = await fetch(`${BASE}/task/reset-home`, { method: 'POST' });
  assert.equal(res.status, 200);
  assert.deepEqual(readLog(), ['keyevent KEYCODE_HOME']);
});

test('POST /task/wake sends wakeup without toggling power', async () => {
  const res = await fetch(`${BASE}/task/wake`, { method: 'POST' });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(readLog(), ['keyevent KEYCODE_WAKEUP']);
});

test('POST /command wakes the TV from natural language', async () => {
  const res = await fetch(`${BASE}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'wake up the TV' }),
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.parsed.action, 'wake_tv');
  assert.deepEqual(readLog(), ['keyevent KEYCODE_WAKEUP']);
});

test('GET /screenshot returns a PNG', async () => {
  const res = await fetch(`${BASE}/screenshot`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.length > 0);
  assert.equal(buf.slice(1, 4).toString(), 'PNG');
});

test('control_tv runner: press_button drives the device', async () => {
  const r = await runControlTv({ action: 'press_button', key: 'select' }, { baseUrl: BASE });
  assert.equal(r.ok, true);
  assert.deepEqual(readLog(), ['keyevent KEYCODE_DPAD_CENTER']);
});

test('control_tv runner: take_screenshot reports an image', async () => {
  const r = await runControlTv({ action: 'take_screenshot' }, { baseUrl: BASE });
  assert.equal(r.ok, true);
  assert.equal(r.image.content_type, 'image/png');
  assert.ok(r.image.bytes > 0);
});

test('control_tv runner: open_app launches the mapped package', async () => {
  const r = await runControlTv({ action: 'open_app', app_name: 'youtube' }, { baseUrl: BASE });
  assert.equal(r.ok, true);
  assert.deepEqual(readLog(), ['launch com.google.android.youtube.tv']);
});

test('control_tv runner: open_tv_assistant opens Google TV search', async () => {
  const r = await runControlTv({ action: 'open_tv_assistant' }, { baseUrl: BASE });
  assert.equal(r.ok, true);
  assert.deepEqual(readLog(), ['assistant_open']);
});

test('control_tv runner: ask_tv_assistant sends a Google TV search query', async () => {
  const r = await runControlTv({ action: 'ask_tv_assistant', query: 'weather' }, { baseUrl: BASE });
  assert.equal(r.ok, true);
  assert.deepEqual(readLog(), ['assistant_query weather']);
});

test('control_tv runner: wake_tv sends wakeup', async () => {
  const r = await runControlTv({ action: 'wake_tv' }, { baseUrl: BASE });
  assert.equal(r.ok, true);
  assert.deepEqual(readLog(), ['keyevent KEYCODE_WAKEUP']);
});

test('control_tv runner: missing required field is rejected before any call', async () => {
  const r = await runControlTv({ action: 'type_text' }, { baseUrl: BASE });
  assert.equal(r.ok, false);
  assert.deepEqual(readLog(), []);
});

test('control_tv runner: simulated "TV is stuck" flow', async () => {
  await runControlTv({ action: 'check_status' }, { baseUrl: BASE });
  await runControlTv({ action: 'take_screenshot' }, { baseUrl: BASE });
  const reset = await runControlTv({ action: 'reset_home' }, { baseUrl: BASE });
  assert.equal(reset.ok, true);
  assert.deepEqual(readLog(), ['keyevent KEYCODE_HOME']);
});
