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
