'use strict';

/**
 * RokuPi API
 * -----------
 * Small Express bridge that forwards remote commands (from a phone web remote
 * or an AI agent) to a Roku TV via the Roku ECP HTTP API (port 8060), reachable
 * only on the local LAN. Remote clients reach this server over Tailscale.
 *
 * Roku IP resolution (see Decision: "SSDP-first Roku discovery"):
 *   1. ROKU_IP env var, if set -> use it verbatim (manual override / local dev).
 *   2. Otherwise -> discover via SSDP on startup and cache the result.
 *   3. On a failed Roku request -> re-run discovery once before giving up,
 *      so a DHCP-driven IP change self-heals without an SSH visit.
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const dgram = require('dgram');

const PORT = process.env.PORT || 3000;
const ECP_PORT = 8060;
const ROKU_IP_OVERRIDE = process.env.ROKU_IP || null;

// Friendly name -> Roku channel (app) ID. IDs are stable per channel but
// best-effort here; confirm against GET /apps on the actual Roku and adjust.
const APP_MAP = {
  netflix: '12',
  youtube: '837',
  plex: '13535',
  youtube_tv: '195316',
};

// ---------------------------------------------------------------------------
// Logging: one structured JSON object per line to stdout (journald captures it).
// ---------------------------------------------------------------------------
function logAction(event, fields = {}) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), event, ...fields }) + '\n'
  );
}

// ---------------------------------------------------------------------------
// Roku IP resolution
// ---------------------------------------------------------------------------
let cachedRokuIp = ROKU_IP_OVERRIDE;

/**
 * Discover a Roku on the LAN via SSDP (the same mechanism the official Roku
 * app uses). Sends an M-SEARCH for `roku:ecp` and returns the first responder's
 * IP, parsed from the LOCATION header. Resolves to null on timeout.
 */
function discoverRokuViaSsdp(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const message = Buffer.from(
      [
        'M-SEARCH * HTTP/1.1',
        'HOST: 239.255.255.250:1900',
        'MAN: "ssdp:discover"',
        'ST: roku:ecp',
        'MX: 3',
        '',
        '',
      ].join('\r\n')
    );

    let settled = false;
    const finish = (ip) => {
      if (settled) return;
      settled = true;
      try { socket.close(); } catch (_) { /* already closed */ }
      resolve(ip);
    };

    socket.on('message', (msg) => {
      const text = msg.toString();
      if (!/roku:ecp/i.test(text)) return;
      const match = text.match(/LOCATION:\s*http:\/\/([\d.]+):\d+/i);
      if (match) {
        logAction('roku_discovered', { ip: match[1], via: 'ssdp' });
        finish(match[1]);
      }
    });

    socket.on('error', (err) => {
      logAction('ssdp_error', { error: err.message });
      finish(null);
    });

    socket.bind(() => {
      try {
        socket.send(message, 0, message.length, 1900, '239.255.255.250');
      } catch (err) {
        logAction('ssdp_send_error', { error: err.message });
        finish(null);
      }
    });

    setTimeout(() => finish(null), timeoutMs);
  });
}

/**
 * Return a usable Roku IP, discovering if necessary. When force is true,
 * bypass the cache and re-discover (used after a failed request). The manual
 * ROKU_IP override always wins and is never replaced by discovery.
 */
async function resolveRokuIp(force = false) {
  if (ROKU_IP_OVERRIDE) return ROKU_IP_OVERRIDE;
  if (cachedRokuIp && !force) return cachedRokuIp;
  const found = await discoverRokuViaSsdp();
  if (found) cachedRokuIp = found;
  return cachedRokuIp;
}

function ecpUrl(ip, suffix) {
  return `http://${ip}:${ECP_PORT}${suffix}`;
}

/**
 * Make an ECP request, transparently re-discovering the Roku once if the call
 * fails and we're not pinned to a manual ROKU_IP.
 */
async function ecpRequest(method, suffix, { retried = false } = {}) {
  const ip = await resolveRokuIp(retried);
  if (!ip) {
    const err = new Error('No Roku IP available (discovery failed)');
    err.code = 'NO_ROKU';
    throw err;
  }
  try {
    return await axios({
      method,
      url: ecpUrl(ip, suffix),
      timeout: 5000,
      responseType: 'text',
    });
  } catch (err) {
    if (!retried && !ROKU_IP_OVERRIDE) {
      logAction('ecp_retry', { suffix, reason: err.message });
      return ecpRequest(method, suffix, { retried: true });
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// GET /health — is the Roku reachable?
app.get('/health', async (req, res) => {
  try {
    await ecpRequest('get', '/query/device-info');
    const ip = await resolveRokuIp();
    logAction('health', { ok: true, roku_ip: ip });
    res.json({ ok: true, roku_ip: ip });
  } catch (err) {
    logAction('health', { ok: false, error: err.message });
    res.status(503).json({ ok: false, error: err.message });
  }
});

// GET /active-app — currently running app (XML passthrough)
app.get('/active-app', async (req, res) => {
  try {
    const r = await ecpRequest('get', '/query/active-app');
    logAction('active_app');
    res.type('application/xml').send(r.data);
  } catch (err) {
    logAction('active_app_error', { error: err.message });
    res.status(502).json({ error: err.message });
  }
});

// GET /apps — all installed apps (XML passthrough)
app.get('/apps', async (req, res) => {
  try {
    const r = await ecpRequest('get', '/query/apps');
    logAction('apps');
    res.type('application/xml').send(r.data);
  } catch (err) {
    logAction('apps_error', { error: err.message });
    res.status(502).json({ error: err.message });
  }
});

// POST /remote/:key — send a single keypress (Home, Back, Up, Select, Play, ...)
app.post('/remote/:key', async (req, res) => {
  const { key } = req.params;
  try {
    await ecpRequest('post', `/keypress/${encodeURIComponent(key)}`);
    logAction('keypress', { key });
    res.json({ ok: true, key });
  } catch (err) {
    logAction('keypress_error', { key, error: err.message });
    res.status(502).json({ ok: false, key, error: err.message });
  }
});

// POST /launch/:appId — launch an app by Roku channel ID
app.post('/launch/:appId', async (req, res) => {
  const { appId } = req.params;
  try {
    await ecpRequest('post', `/launch/${encodeURIComponent(appId)}`);
    logAction('launch', { appId });
    res.json({ ok: true, appId });
  } catch (err) {
    logAction('launch_error', { appId, error: err.message });
    res.status(502).json({ ok: false, appId, error: err.message });
  }
});

// POST /task/reset-home — double Home press to recover a stuck TV
app.post('/task/reset-home', async (req, res) => {
  try {
    await ecpRequest('post', '/keypress/Home');
    await ecpRequest('post', '/keypress/Home');
    logAction('task_reset_home');
    res.json({ ok: true, task: 'reset-home' });
  } catch (err) {
    logAction('task_reset_home_error', { error: err.message });
    res.status(502).json({ ok: false, task: 'reset-home', error: err.message });
  }
});

// POST /task/open/:appName — launch by friendly name (netflix, youtube, ...)
app.post('/task/open/:appName', async (req, res) => {
  const appName = String(req.params.appName).toLowerCase();
  const appId = APP_MAP[appName];
  if (!appId) {
    logAction('task_open_unknown', { appName });
    return res.status(400).json({
      ok: false,
      error: `Unknown app "${appName}"`,
      known: Object.keys(APP_MAP),
    });
  }
  try {
    await ecpRequest('post', `/launch/${appId}`);
    logAction('task_open', { appName, appId });
    res.json({ ok: true, task: 'open', appName, appId });
  } catch (err) {
    logAction('task_open_error', { appName, appId, error: err.message });
    res.status(502).json({ ok: false, appName, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
app.listen(PORT, '0.0.0.0', async () => {
  logAction('server_start', { port: PORT, roku_ip_override: ROKU_IP_OVERRIDE });
  if (!ROKU_IP_OVERRIDE) {
    const ip = await resolveRokuIp();
    if (ip) logAction('startup_discovery', { roku_ip: ip });
    else logAction('startup_discovery_failed', { note: 'will retry on first request' });
  }
  // eslint-disable-next-line no-console
  console.log(`RokuPi API running on port ${PORT}`);
});
