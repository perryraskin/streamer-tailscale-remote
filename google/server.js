'use strict';

/**
 * FamilyTV API (Google TV)
 * ------------------------
 * Express bridge that exposes a small, safe control surface for a Google TV
 * Streamer to remote clients (phone web remote, AI agent) over Tailscale.
 * It talks to the device through a TvDriver (see drivers/), never letting
 * callers run raw ADB. Only non-destructive actions are exposed.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDriver } = require('./drivers');
const { parseVoiceCommand, runParsedCommand } = require('./lib/voice-command');

const PORT = process.env.PORT || 3000;
const LISTEN_HOST = process.env.LISTEN_HOST || '0.0.0.0';
const STREAM_URL = process.env.STREAM_URL || null; // optional HDMI live view
const driver = getDriver();
let screenshotInFlight = null;

function logAction(event, fields = {}) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), event, driver: driver.name, ...fields }) + '\n'
  );
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Small helper: run a driver action, log it, and shape errors consistently.
async function handle(res, event, fields, fn) {
  try {
    const result = await fn();
    logAction(event, fields);
    res.json(result);
  } catch (err) {
    logAction(`${event}_error`, { ...fields, error: err.message });
    const status = err.code === 'BAD_KEY' || err.code === 'BAD_APP' ? 400 : 502;
    res.status(status).json({ ok: false, error: err.message, known: err.known });
  }
}

// GET /config — client-discoverable settings for the web remote.
app.get('/config', (req, res) => {
  res.json({
    driver: driver.name,
    stream_url: STREAM_URL,
    apps: Object.keys(driver.APP_PACKAGES || {}),
    keys: Object.keys(driver.KEYMAP || {}),
  });
});

// GET /health — is the device reachable?
app.get('/health', async (req, res) => {
  try {
    const result = await driver.health();
    logAction('health', { ok: true });
    res.json(result);
  } catch (err) {
    logAction('health', { ok: false, error: err.message });
    res.status(503).json({ ok: false, error: err.message });
  }
});

// GET /current-app — foreground package/activity.
app.get('/current-app', (req, res) => handle(res, 'current_app', {}, () => driver.currentApp()));

// GET /apps — installed third-party apps.
app.get('/apps', (req, res) => handle(res, 'apps', {}, () => driver.listApps()));

// POST /remote/:key — single safe keypress.
app.post('/remote/:key', (req, res) => {
  const key = String(req.params.key).toLowerCase();
  handle(res, 'keypress', { key }, () => driver.pressButton(key));
});

// POST /type — type text into the focused field. { text } or ?text=
app.post('/type', (req, res) => {
  const text = (req.body && req.body.text) || req.query.text || '';
  if (!text) return res.status(400).json({ ok: false, error: 'text is required' });
  handle(res, 'type_text', { length: String(text).length }, () => driver.typeText(text));
});

// POST /launch/:appName — launch a known app by friendly name.
app.post('/launch/:appName', (req, res) => {
  const appName = String(req.params.appName).toLowerCase();
  handle(res, 'launch', { appName }, () => driver.launchApp(appName));
});

// POST /command — natural-language command for PWA voice and Siri Shortcuts.
app.post('/command', async (req, res) => {
  const text = (req.body && req.body.text) || req.query.text || '';
  const parsed = parseVoiceCommand(text, {
    appPackages: driver.APP_PACKAGES || {},
    keyMap: driver.KEYMAP || {},
  });

  if (!parsed.ok) {
    logAction('voice_command_rejected', { text, error: parsed.error });
    return res.status(400).json(parsed);
  }

  try {
    const result = await runParsedCommand(parsed, driver);
    logAction('voice_command', { text, action: parsed.action, key: parsed.key, appName: parsed.app_name });
    res.json({ ...result, message: parsed.message });
  } catch (err) {
    logAction('voice_command_error', { text, action: parsed.action, error: err.message });
    const status = err.code === 'BAD_KEY' || err.code === 'BAD_APP' ? 400 : 502;
    res.status(status).json({ ok: false, parsed, error: err.message, known: err.known });
  }
});

// POST /task/reset-home — recover to the home screen.
app.post('/task/reset-home', (req, res) => handle(res, 'reset_home', {}, () => driver.resetHome()));

// POST /task/wake — wake the streamer/TV if it is asleep.
app.post('/task/wake', (req, res) => handle(res, 'wake', {}, () => driver.wakeDevice()));

function takeSharedScreenshot() {
  if (!screenshotInFlight) {
    screenshotInFlight = driver.takeScreenshot().finally(() => {
      screenshotInFlight = null;
    });
  }
  return screenshotInFlight;
}

// GET /screenshot — current screen as PNG (the key diagnostic).
app.get('/screenshot', async (req, res) => {
  try {
    const { contentType, buffer } = await takeSharedScreenshot();
    logAction('screenshot', { bytes: buffer.length });
    res.set('Cache-Control', 'no-store');
    res.type(contentType).send(buffer);
  } catch (err) {
    logAction('screenshot_error', { error: err.message });
    res.status(502).json({ ok: false, error: err.message });
  }
});

if (require.main === module) {
  app.listen(PORT, LISTEN_HOST, () => {
    logAction('server_start', { port: PORT, stream_url: STREAM_URL });
    // eslint-disable-next-line no-console
    console.log(`FamilyTV API (${driver.name}) running on ${LISTEN_HOST}:${PORT}`);
  });
}

module.exports = { app, driver };
