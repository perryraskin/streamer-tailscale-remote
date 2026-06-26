'use strict';

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const KEY_ALIASES = {
  home: 'home',
  'go home': 'home',
  'go to home': 'home',
  back: 'back',
  'go back': 'back',
  up: 'up',
  'move up': 'up',
  down: 'down',
  'move down': 'down',
  left: 'left',
  'move left': 'left',
  right: 'right',
  'move right': 'right',
  ok: 'select',
  okay: 'select',
  select: 'select',
  enter: 'select',
  pause: 'play_pause',
  play: 'play_pause',
  'play pause': 'play_pause',
  'play or pause': 'play_pause',
  rewind: 'rewind',
  'fast forward': 'fast_forward',
  forward: 'fast_forward',
  mute: 'mute',
  'volume up': 'volume_up',
  'turn volume up': 'volume_up',
  louder: 'volume_up',
  'volume down': 'volume_down',
  'turn volume down': 'volume_down',
  quieter: 'volume_down',
};

const APP_ALIASES = {
  netflix: 'netflix',
  youtube: 'youtube',
  'you tube': 'youtube',
  'youtube tv': 'youtube_tv',
  youtubetv: 'youtube_tv',
  'you tube tv': 'youtube_tv',
  'disney plus': 'disney_plus',
  disney: 'disney_plus',
  'prime video': 'prime_video',
  prime: 'prime_video',
  'amazon prime': 'prime_video',
  hulu: 'hulu',
  tubi: 'tubi',
  peacock: 'peacock',
};

function appAliases(appPackages = {}) {
  const aliases = { ...APP_ALIASES };
  for (const name of Object.keys(appPackages)) {
    aliases[name] = name;
    aliases[name.replace(/_/g, ' ')] = name;
  }
  return aliases;
}

function findKnownApp(raw, appPackages = {}) {
  const phrase = normalize(raw);
  const aliases = appAliases(appPackages);
  const matches = Object.keys(aliases)
    .filter((alias) => phrase === alias || phrase.endsWith(` ${alias}`) || phrase.includes(` ${alias} `))
    .sort((a, b) => b.length - a.length);
  return matches.length ? aliases[matches[0]] : null;
}

function friendlyAppName(appName) {
  return String(appName || '').replace(/_/g, ' ');
}

function cleanAssistantQuery(rawQuery) {
  let query = String(rawQuery || '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  query = query.replace(/^(?:please\s+)+/i, '');
  query = query.replace(/^(?:(?:for|about)\s+)+/i, '');
  query = query.replace(/^(?:to\s+)?(?:find|look up|search for|search)\s+(?:the\s+)?(?:movie|show|series)\s+/i, '');
  query = query.replace(/^(?:to\s+)?(?:find|look up|search for|search)\s+/i, '');
  query = query.replace(/^(?:the\s+)?(?:movie|show|series)\s+/i, '');
  query = query.replace(/^(?:(?:for|about)\s+)+/i, '');

  return query.trim();
}

function parseAssistantQuery(rawText) {
  const patterns = [
    /^(?:ask|tell)\s+(?:the\s+)?(?:tv|google\s+tv|gemini|google|assistant)\s+(?:to\s+)?(.+)$/i,
    /^(?:search|find)\s+(?:the\s+)?(?:tv|google\s+tv|gemini|google)\s+(?:for\s+)?(.+)$/i,
    /^(?:tv\s+search|google\s+tv\s+search|gemini\s+search)\s+(?:for\s+)?(.+)$/i,
    /^(?:gemini|assistant)\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    if (match && match[1] && match[1].trim()) return cleanAssistantQuery(match[1]);
  }
  return null;
}

function parseVoiceCommand(text, { appPackages = {}, keyMap = {} } = {}) {
  const rawText = String(text || '').trim();
  const command = normalize(text);
  if (!command) return { ok: false, error: 'Say a command first.' };

  if (/\b(status|health|connected|reachable)\b/.test(command)) {
    return { ok: true, action: 'check_status', message: 'Checking TV status.' };
  }

  if (/\b(current app|what app|whats on|what is on|what is playing|screen)\b/.test(command)) {
    if (/\b(screenshot|picture|screen shot|see|show|look)\b/.test(command)) {
      return { ok: true, action: 'take_screenshot', message: 'Taking a screenshot.' };
    }
    return { ok: true, action: 'current_app', message: 'Checking the current app.' };
  }

  if (/\b(screenshot|screen shot|take a picture|show me the tv|see the tv)\b/.test(command)) {
    return { ok: true, action: 'take_screenshot', message: 'Taking a screenshot.' };
  }

  if (/\b(list apps|what apps|show apps)\b/.test(command)) {
    return { ok: true, action: 'list_apps', message: 'Listing installed apps.' };
  }

  const wakeIntent =
    /\bwake(?: up)?\b/.test(command) ||
    /\bpower on\b/.test(command) ||
    /\bturn on\b/.test(command) ||
    /\bturn (?:it|the tv|tv|the streamer|streamer|the screen|screen|the device|device) on\b/.test(command);
  const wakeTarget = /\b(tv|streamer|screen|device|it)\b/.test(command) || /^(wake|wake up)$/.test(command);
  if (wakeIntent && wakeTarget) {
    return { ok: true, action: 'wake_tv', message: 'Waking the TV.' };
  }

  const openAssistantMatch = command.match(/^(?:open|launch|start)\s+(?:gemini|assistant|google assistant|tv assistant|tv search|google tv search)$/);
  if (openAssistantMatch) {
    return { ok: true, action: 'open_tv_assistant', message: 'Opening Google TV search.' };
  }

  const assistantQuery = parseAssistantQuery(rawText);
  if (assistantQuery) {
    return {
      ok: true,
      action: 'ask_tv_assistant',
      query: assistantQuery,
      message: `Asking Gemini for "${assistantQuery}".`,
    };
  }

  if (/\b(reset|reset home|stuck|start over)\b/.test(command)) {
    return { ok: true, action: 'reset_home', message: 'Sending the TV home.' };
  }

  const typeMatch = rawText.match(/^(?:search for|type|enter|search|write)\s+(.+)$/i);
  if (typeMatch) {
    const typedText = typeMatch[1].trim();
    return { ok: true, action: 'type_text', text: typedText, message: `Typing "${typedText}".` };
  }

  const appMatch = command.match(/^(open|launch|start|watch|go to)\s+(.+)$/);
  if (appMatch) {
    const appName = findKnownApp(appMatch[2], appPackages);
    if (!appName) {
      return {
        ok: false,
        error: `I do not know the app "${appMatch[2]}".`,
        known_apps: Object.keys(appPackages),
      };
    }
    return { ok: true, action: 'open_app', app_name: appName, message: `Opening ${friendlyAppName(appName)}.` };
  }

  const keyPhrase = command.replace(/^(press|tap|hit|send|click)\s+/, '');
  const keyMatches = Object.keys(KEY_ALIASES)
    .filter((alias) => keyPhrase === alias)
    .sort((a, b) => b.length - a.length);
  if (keyMatches.length) {
    const key = KEY_ALIASES[keyMatches[0]];
    if (!keyMap[key]) return { ok: false, error: `The key "${key}" is not available.` };
    return { ok: true, action: 'press_button', key, message: `Pressing ${key.replace(/_/g, ' ')}.` };
  }

  const appName = findKnownApp(command, appPackages);
  if (appName) {
    return { ok: true, action: 'open_app', app_name: appName, message: `Opening ${friendlyAppName(appName)}.` };
  }

  const findMatch = rawText.match(/^(?:find|look up)\s+(?:the\s+)?(?:movie\s+|show\s+|series\s+)?(.+)$/i);
  if (findMatch && findMatch[1] && findMatch[1].trim()) {
    const query = cleanAssistantQuery(findMatch[1]);
    return {
      ok: true,
      action: 'ask_tv_assistant',
      query,
      message: `Asking Gemini for "${query}".`,
    };
  }

  return {
    ok: false,
    error: `I could not understand "${text}".`,
    examples: [
      'open YouTube TV',
      'go home',
      'press right',
      'type Dr Phil',
      'take screenshot',
    ],
  };
}

async function runParsedCommand(parsed, driver) {
  if (!parsed.ok) return parsed;

  if (parsed.action === 'check_status') return { ok: true, parsed, result: await driver.health() };
  if (parsed.action === 'current_app') return { ok: true, parsed, result: await driver.currentApp() };
  if (parsed.action === 'list_apps') return { ok: true, parsed, result: await driver.listApps() };
  if (parsed.action === 'take_screenshot') {
    const screenshot = await driver.takeScreenshot();
    return {
      ok: true,
      parsed,
      result: {
        contentType: screenshot.contentType,
        bytes: screenshot.buffer.length,
        url: '/screenshot',
      },
    };
  }
  if (parsed.action === 'press_button') return { ok: true, parsed, result: await driver.pressButton(parsed.key) };
  if (parsed.action === 'type_text') return { ok: true, parsed, result: await driver.typeText(parsed.text) };
  if (parsed.action === 'open_app') return { ok: true, parsed, result: await driver.launchApp(parsed.app_name) };
  if (parsed.action === 'open_tv_assistant') {
    if (!driver.openAssistant) return { ok: false, parsed, error: 'TV assistant is not supported by this driver.' };
    return { ok: true, parsed, result: await driver.openAssistant() };
  }
  if (parsed.action === 'ask_tv_assistant') {
    if (!driver.askAssistant) return { ok: false, parsed, error: 'TV assistant queries are not supported by this driver.' };
    return { ok: true, parsed, result: await driver.askAssistant(parsed.query) };
  }
  if (parsed.action === 'wake_tv') {
    if (!driver.wakeDevice) return { ok: false, parsed, error: 'Wake is not supported by this driver.' };
    return { ok: true, parsed, result: await driver.wakeDevice() };
  }
  if (parsed.action === 'reset_home') return { ok: true, parsed, result: await driver.resetHome() };

  return { ok: false, parsed, error: `Unsupported action "${parsed.action}".` };
}

module.exports = { normalize, cleanAssistantQuery, parseVoiceCommand, runParsedCommand };
