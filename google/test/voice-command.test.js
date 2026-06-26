'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { cleanAssistantQuery, parseVoiceCommand } = require('../lib/voice-command');

const appPackages = {
  netflix: 'com.netflix.ninja',
  youtube: 'com.google.android.youtube.tv',
  youtube_tv: 'com.google.android.youtube.tvunplugged',
  hulu: 'com.hulu.livingroomplus',
};

const keyMap = {
  home: 'KEYCODE_HOME',
  right: 'KEYCODE_DPAD_RIGHT',
  select: 'KEYCODE_DPAD_CENTER',
  play_pause: 'KEYCODE_MEDIA_PLAY_PAUSE',
};

test('parseVoiceCommand maps app launch phrases', () => {
  assert.deepEqual(
    parseVoiceCommand('open YouTube TV', { appPackages, keyMap }),
    { ok: true, action: 'open_app', app_name: 'youtube_tv', message: 'Opening youtube tv.' }
  );
});

test('parseVoiceCommand maps direct app names', () => {
  assert.equal(parseVoiceCommand('Netflix', { appPackages, keyMap }).app_name, 'netflix');
});

test('parseVoiceCommand preserves typed text case', () => {
  const parsed = parseVoiceCommand('type Dr Phil', { appPackages, keyMap });
  assert.equal(parsed.action, 'type_text');
  assert.equal(parsed.text, 'Dr Phil');
});

test('parseVoiceCommand maps targeted Google TV assistant queries', () => {
  const parsed = parseVoiceCommand("ask Gemini what's the weather", { appPackages, keyMap });
  assert.equal(parsed.action, 'ask_tv_assistant');
  assert.equal(parsed.query, "what's the weather");
});

test('parseVoiceCommand maps Ask Gemini as the preferred phrase', () => {
  const parsed = parseVoiceCommand('ask Gemini for Shrek', { appPackages, keyMap });
  assert.equal(parsed.action, 'ask_tv_assistant');
  assert.equal(parsed.query, 'Shrek');
  assert.equal(parsed.message, 'Asking Gemini for "Shrek".');
});

test('parseVoiceCommand cleans connector words from dictated assistant queries', () => {
  assert.equal(parseVoiceCommand('ask Google TV for Shrek', { appPackages, keyMap }).query, 'Shrek');
  assert.equal(parseVoiceCommand('ask Google TV for for Shrek', { appPackages, keyMap }).query, 'Shrek');
  assert.equal(parseVoiceCommand('ask Gemini to find the movie Shrek', { appPackages, keyMap }).query, 'Shrek');
});

test('parseVoiceCommand maps opening Google TV search', () => {
  const parsed = parseVoiceCommand('open Gemini', { appPackages, keyMap });
  assert.equal(parsed.action, 'open_tv_assistant');
});

test('parseVoiceCommand maps wake phrases', () => {
  assert.equal(parseVoiceCommand('wake up the TV', { appPackages, keyMap }).action, 'wake_tv');
  assert.equal(parseVoiceCommand('turn it on', { appPackages, keyMap }).action, 'wake_tv');
  assert.equal(parseVoiceCommand('power on the streamer', { appPackages, keyMap }).message, 'Waking the TV.');
});

test('parseVoiceCommand maps find movie phrases to Google TV assistant queries', () => {
  const parsed = parseVoiceCommand('Find the movie Shrek', { appPackages, keyMap });
  assert.equal(parsed.action, 'ask_tv_assistant');
  assert.equal(parsed.query, 'Shrek');
});

test('parseVoiceCommand keeps generic search as text input', () => {
  const parsed = parseVoiceCommand('search for Dr Phil', { appPackages, keyMap });
  assert.equal(parsed.action, 'type_text');
  assert.equal(parsed.text, 'Dr Phil');
});

test('parseVoiceCommand maps remote key aliases', () => {
  assert.equal(parseVoiceCommand('ok', { appPackages, keyMap }).key, 'select');
  assert.equal(parseVoiceCommand('press right', { appPackages, keyMap }).key, 'right');
  assert.equal(parseVoiceCommand('pause', { appPackages, keyMap }).key, 'play_pause');
});

test('parseVoiceCommand rejects unknown commands', () => {
  const parsed = parseVoiceCommand('make toast', { appPackages, keyMap });
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /could not understand/i);
});

test('cleanAssistantQuery strips Siri filler without changing real questions', () => {
  assert.equal(cleanAssistantQuery('for for Shrek'), 'Shrek');
  assert.equal(cleanAssistantQuery('to find the movie Shrek'), 'Shrek');
  assert.equal(cleanAssistantQuery('who voices Donkey in Shrek'), 'who voices Donkey in Shrek');
});
