'use strict';

/**
 * google-tv driver — implements the FamilyTV TvDriver interface over ADB.
 *
 * See docs/Driver-Interface in Markbase for the shared contract. This driver
 * uses ADB for everything in v1 (key events, screenshots, foreground app,
 * app launch, text input). Android TV Remote protocol may replace the basic
 * button path later.
 */

const { adb, GOOGLE_TV_ADDR } = require('../../lib/adb');

// Safe remote keys -> Android keycodes. Only non-destructive navigation/media.
const KEYMAP = {
  home: 'KEYCODE_HOME',
  back: 'KEYCODE_BACK',
  up: 'KEYCODE_DPAD_UP',
  down: 'KEYCODE_DPAD_DOWN',
  left: 'KEYCODE_DPAD_LEFT',
  right: 'KEYCODE_DPAD_RIGHT',
  select: 'KEYCODE_DPAD_CENTER',
  play_pause: 'KEYCODE_MEDIA_PLAY_PAUSE',
  rewind: 'KEYCODE_MEDIA_REWIND',
  fast_forward: 'KEYCODE_MEDIA_FAST_FORWARD',
  volume_up: 'KEYCODE_VOLUME_UP',
  volume_down: 'KEYCODE_VOLUME_DOWN',
  mute: 'KEYCODE_VOLUME_MUTE',
};

// Friendly app name -> Android package. Verified against the parents' Google TV
// Streamer via `pm list packages -3` on 2026-06-26. Re-run /apps if apps change.
const APP_PACKAGES = {
  netflix: 'com.netflix.ninja',
  youtube: 'com.google.android.youtube.tv',
  youtube_tv: 'com.google.android.youtube.tvunplugged',
  disney_plus: 'com.disney.disneyplus',
  prime_video: 'com.amazon.amazonvideo.livingroom',
  hulu: 'com.hulu.livingroomplus',
  tubi: 'com.tubitv',
  peacock: 'com.peacocktv.peacockandroid',
};

const name = 'google-tv';

function quoteShellArg(value) {
  return `"${String(value).replace(/(["\\$`])/g, '\\$1').replace(/\s+/g, ' ').trim()}"`;
}

async function health() {
  const model = (await adb(['shell', 'getprop', 'ro.product.model'])).trim();
  return { ok: true, device: GOOGLE_TV_ADDR, model: model || 'unknown' };
}

async function currentApp() {
  // mCurrentFocus / mResumedActivity look like: ".../com.pkg/com.pkg.Activity"
  const out = await adb(['shell', 'dumpsys', 'window']);
  const m = out.match(/mCurrentFocus=.*\s([a-zA-Z0-9_.]+)\/([a-zA-Z0-9_.$]+)/);
  if (!m) return { package: null, activity: null };
  const friendly = Object.keys(APP_PACKAGES).find((k) => APP_PACKAGES[k] === m[1]) || null;
  return { package: m[1], activity: m[2], app: friendly };
}

async function listApps() {
  const out = await adb(['shell', 'pm', 'list', 'packages', '-3']);
  const packages = out
    .split('\n')
    .map((l) => l.replace(/^package:/, '').trim())
    .filter(Boolean);
  return packages.map((pkg) => {
    const friendly = Object.keys(APP_PACKAGES).find((k) => APP_PACKAGES[k] === pkg) || null;
    return { package: pkg, app: friendly };
  });
}

async function pressButton(key) {
  const code = KEYMAP[key];
  if (!code) {
    const err = new Error(`Unknown key "${key}"`);
    err.code = 'BAD_KEY';
    throw err;
  }
  await adb(['shell', 'input', 'keyevent', code]);
  return { ok: true, key };
}

async function typeText(text) {
  // `input text` treats spaces specially; %s is the documented escape.
  const safe = String(text).replace(/ /g, '%s');
  await adb(['shell', 'input', 'text', safe]);
  return { ok: true, length: String(text).length };
}

async function launchApp(appName) {
  const pkg = APP_PACKAGES[String(appName).toLowerCase()];
  if (!pkg) {
    const err = new Error(`Unknown app "${appName}"`);
    err.code = 'BAD_APP';
    err.known = Object.keys(APP_PACKAGES);
    throw err;
  }
  await adb(['shell', 'monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1']);
  return { ok: true, app: appName, package: pkg };
}

async function openAssistant() {
  await adb(['shell', 'am', 'start', '-a', 'android.search.action.GLOBAL_SEARCH']);
  return { ok: true, assistant: 'google-tv-search' };
}

async function askAssistant(query) {
  const text = String(query || '').trim();
  if (!text) {
    const err = new Error('query is required');
    err.code = 'BAD_QUERY';
    throw err;
  }
  await adb(['shell', 'am', 'start', '-a', 'android.search.action.GLOBAL_SEARCH', '--es', 'query', quoteShellArg(text)]);
  return { ok: true, assistant: 'google-tv-search', query: text };
}

async function takeScreenshot() {
  const png = await adb(['exec-out', 'screencap', '-p'], { binary: true });
  return { contentType: 'image/png', buffer: png };
}

async function resetHome() {
  await adb(['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
  return { ok: true, task: 'reset-home' };
}

async function wakeDevice() {
  await adb(['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);
  return { ok: true, task: 'wake' };
}

module.exports = {
  name,
  KEYMAP,
  APP_PACKAGES,
  health,
  currentApp,
  listApps,
  pressButton,
  typeText,
  launchApp,
  openAssistant,
  askAssistant,
  takeScreenshot,
  resetHome,
  wakeDevice,
};
