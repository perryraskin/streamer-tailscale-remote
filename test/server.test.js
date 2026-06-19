'use strict';

/**
 * Black-box integration test: real server.js (as a child process) talking to a
 * mock Roku, exercised over HTTP and through the control_roku AI runner.
 * No hardware required.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { startMockRoku } = require('./mock-roku');
const { runControlRoku } = require('../ai/roku-tool-runner');

const SERVER_PORT = 3999;
const BASE = `http://127.0.0.1:${SERVER_PORT}`;
const ROOT = path.join(__dirname, '..');

let mock;
let serverProc;

async function waitForHealthy(timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not become healthy in time');
}

before(async () => {
  mock = startMockRoku({ port: 8060 });
  await mock.ready;
  serverProc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      ROKU_IP: '127.0.0.1',
      PORT: String(SERVER_PORT),
      STREAM_URL: 'http://127.0.0.1:8080/stream',
    },
    stdio: 'ignore',
  });
  await waitForHealthy();
});

after(async () => {
  if (serverProc) serverProc.kill();
  if (mock) await mock.close();
});

test('GET /health reports the Roku reachable', async () => {
  const res = await fetch(`${BASE}/health`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.roku_ip, '127.0.0.1');
});

test('GET /config exposes the configured stream URL', async () => {
  const res = await fetch(`${BASE}/config`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.stream_url, 'http://127.0.0.1:8080/stream');
});

test('GET /apps returns the installed-apps XML', async () => {
  const res = await fetch(`${BASE}/apps`);
  const text = await res.text();
  assert.equal(res.status, 200);
  assert.match(text, /id="837"/); // YouTube present in mock
});

test('POST /remote/:key forwards the keypress to the Roku', async () => {
  mock.reset();
  const res = await fetch(`${BASE}/remote/Home`, { method: 'POST' });
  assert.equal(res.status, 200);
  assert.deepEqual(mock.received.keypresses, ['Home']);
});

test('POST /task/reset-home sends two Home presses', async () => {
  mock.reset();
  const res = await fetch(`${BASE}/task/reset-home`, { method: 'POST' });
  assert.equal(res.status, 200);
  assert.deepEqual(mock.received.keypresses, ['Home', 'Home']);
});

test('POST /task/open/:appName launches the mapped app id', async () => {
  mock.reset();
  const res = await fetch(`${BASE}/task/open/netflix`, { method: 'POST' });
  assert.equal(res.status, 200);
  assert.deepEqual(mock.received.launches, ['12']);
});

test('POST /task/open with an unknown app is a 400', async () => {
  const res = await fetch(`${BASE}/task/open/nope`, { method: 'POST' });
  assert.equal(res.status, 400);
});

test('control_roku runner: press_key drives the Roku', async () => {
  mock.reset();
  const result = await runControlRoku({ action: 'press_key', key: 'Up' }, { baseUrl: BASE });
  assert.equal(result.ok, true);
  assert.deepEqual(mock.received.keypresses, ['Up']);
});

test('control_roku runner: open_app launches the mapped id', async () => {
  mock.reset();
  const result = await runControlRoku({ action: 'open_app', app_name: 'plex' }, { baseUrl: BASE });
  assert.equal(result.ok, true);
  assert.deepEqual(mock.received.launches, ['13535']);
});

test('control_roku runner: missing required field is rejected before any call', async () => {
  mock.reset();
  const result = await runControlRoku({ action: 'press_key' }, { baseUrl: BASE });
  assert.equal(result.ok, false);
  assert.deepEqual(mock.received.keypresses, []);
});

test('control_roku runner: simulated "TV is stuck" recovery flow', async () => {
  mock.reset();
  const health = await runControlRoku({ action: 'health' }, { baseUrl: BASE });
  assert.equal(health.ok, true);
  await runControlRoku({ action: 'active_app' }, { baseUrl: BASE });
  const reset = await runControlRoku({ action: 'reset_home' }, { baseUrl: BASE });
  assert.equal(reset.ok, true);
  assert.deepEqual(mock.received.keypresses, ['Home', 'Home']);
});
