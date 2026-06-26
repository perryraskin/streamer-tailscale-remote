'use strict';

/**
 * Executor for the `control_tv` tool (see control_tv.tool.json).
 *
 * Maps a validated tool-use input to one FamilyTV HTTP call and returns a
 * plain result for the model. The model only speaks this tool's vocabulary —
 * it never runs raw ADB.
 *
 *   const { runControlTv } = require('./familytv-tool-runner');
 *   const result = await runControlTv(input, { baseUrl: 'http://100.x.x.x:3000' });
 *
 * baseUrl defaults to FAMILYTV_BASE_URL, then http://localhost:3000.
 */

const DEFAULT_BASE_URL = process.env.FAMILYTV_BASE_URL || 'http://localhost:3000';

const ROUTES = {
  check_status: { method: 'GET', path: () => '/health' },
  current_app: { method: 'GET', path: () => '/current-app' },
  list_apps: { method: 'GET', path: () => '/apps' },
  take_screenshot: { method: 'GET', path: () => '/screenshot', binary: true },
  press_button: { method: 'POST', needs: ['key'], path: (i) => `/remote/${encodeURIComponent(i.key)}` },
  type_text: { method: 'POST', needs: ['text'], path: () => '/type', body: (i) => ({ text: i.text }) },
  open_app: { method: 'POST', needs: ['app_name'], path: (i) => `/launch/${encodeURIComponent(i.app_name)}` },
  open_tv_assistant: { method: 'POST', path: () => '/command', body: () => ({ text: 'open Gemini' }) },
  ask_tv_assistant: { method: 'POST', needs: ['query'], path: () => '/command', body: (i) => ({ text: `ask Google TV ${i.query}` }) },
  wake_tv: { method: 'POST', path: () => '/task/wake' },
  reset_home: { method: 'POST', path: () => '/task/reset-home' },
};

async function runControlTv(input, { baseUrl = DEFAULT_BASE_URL, timeoutMs = 10000 } = {}) {
  const action = input && input.action;
  const route = ROUTES[action];
  if (!route) return { ok: false, error: `Unknown action "${action}"`, valid_actions: Object.keys(ROUTES) };
  for (const field of route.needs || []) {
    if (!input[field]) return { ok: false, error: `Action "${action}" requires "${field}"` };
  }

  const url = baseUrl.replace(/\/$/, '') + route.path(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const init = { method: route.method, signal: controller.signal };
    if (route.body) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(route.body(input));
    }
    const res = await fetch(url, init);

    if (route.binary) {
      const buf = Buffer.from(await res.arrayBuffer());
      // A screenshot's bytes aren't useful as text to the model; report that an
      // image was captured and where to fetch it. The agent layer should attach
      // the image to the conversation itself if it wants the model to see it.
      return { ok: res.ok, status: res.status, action, image: { content_type: res.headers.get('content-type'), bytes: buf.length, url } };
    }

    const text = await res.text();
    let body = text;
    if ((res.headers.get('content-type') || '').includes('json')) {
      try { body = JSON.parse(text); } catch { /* leave as text */ }
    }
    return { ok: res.ok, status: res.status, action, body };
  } catch (err) {
    return { ok: false, action, error: err.name === 'AbortError' ? 'Request timed out' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { runControlTv, ROUTES, DEFAULT_BASE_URL };
