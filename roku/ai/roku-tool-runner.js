'use strict';

/**
 * Executor for the `control_roku` tool (see control_roku.tool.json).
 *
 * Maps a validated tool-use input object to a single RokuPi HTTP call and
 * returns a plain result object suitable for handing back to the model as the
 * tool result. The model only ever speaks this tool's vocabulary — it never
 * touches raw Roku ECP. See the Decision record "control_roku AI tool surface".
 *
 * Usage:
 *   const { runControlRoku } = require('./roku-tool-runner');
 *   const result = await runControlRoku(toolInput, { baseUrl: 'http://100.x.x.x:3000' });
 *
 * baseUrl defaults to the ROKUPI_BASE_URL env var, then http://localhost:3000.
 */

const DEFAULT_BASE_URL =
  process.env.ROKUPI_BASE_URL || 'http://localhost:3000';

// action -> { method, path(input), needs: [requiredFields] }
const ROUTES = {
  health: { method: 'GET', path: () => '/health' },
  active_app: { method: 'GET', path: () => '/active-app' },
  list_apps: { method: 'GET', path: () => '/apps' },
  press_key: {
    method: 'POST',
    needs: ['key'],
    path: (i) => `/remote/${encodeURIComponent(i.key)}`,
  },
  open_app: {
    method: 'POST',
    needs: ['app_name'],
    path: (i) => `/task/open/${encodeURIComponent(i.app_name)}`,
  },
  launch_app: {
    method: 'POST',
    needs: ['app_id'],
    path: (i) => `/launch/${encodeURIComponent(i.app_id)}`,
  },
  reset_home: { method: 'POST', path: () => '/task/reset-home' },
};

async function runControlRoku(input, { baseUrl = DEFAULT_BASE_URL, timeoutMs = 8000 } = {}) {
  const action = input && input.action;
  const route = ROUTES[action];
  if (!route) {
    return { ok: false, error: `Unknown action "${action}"`, valid_actions: Object.keys(ROUTES) };
  }
  for (const field of route.needs || []) {
    if (!input[field]) {
      return { ok: false, error: `Action "${action}" requires "${field}"` };
    }
  }

  const url = baseUrl.replace(/\/$/, '') + route.path(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: route.method, signal: controller.signal });
    const text = await res.text();
    // Query endpoints return XML; control endpoints return JSON.
    let body = text;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) {
      try { body = JSON.parse(text); } catch { /* leave as text */ }
    }
    return { ok: res.ok, status: res.status, action, body };
  } catch (err) {
    return { ok: false, action, error: err.name === 'AbortError' ? 'Request timed out' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { runControlRoku, ROUTES, DEFAULT_BASE_URL };
