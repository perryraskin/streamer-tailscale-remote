#!/usr/bin/env node
'use strict';

/**
 * Fake `adb` for tests — emulates just the subcommands the google-tv driver
 * uses, with canned output, and appends a token per mutating call to ADB_LOG
 * so tests can assert what was sent. Point ADB_BIN at this file.
 */

const fs = require('fs');

let args = process.argv.slice(2);
if (args[0] === '-s') args = args.slice(2); // drop `-s <addr>`

const log = (line) => {
  if (process.env.ADB_LOG) fs.appendFileSync(process.env.ADB_LOG, line + '\n');
};

const is = (...parts) => parts.every((p, i) => args[i] === p);
const unquote = (value) => String(value || '').replace(/^"|"$/g, '').replace(/\\"/g, '"').replace(/\\\\/g, '\\');

// 1x1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

if (is('shell', 'getprop', 'ro.product.model')) {
  process.stdout.write('Google TV Streamer\n');
} else if (is('shell', 'echo', 'ok')) {
  process.stdout.write('ok\n');
} else if (is('shell', 'dumpsys', 'window')) {
  process.stdout.write(
    'mCurrentFocus=Window{abc123 u0 com.google.android.youtube.tv/com.google.android.apps.youtube.tv.activity.ShellActivity}\n'
  );
} else if (is('shell', 'pm', 'list', 'packages', '-3')) {
  process.stdout.write(
    ['com.netflix.ninja', 'com.google.android.youtube.tv', 'com.plexapp.android', 'com.example.unknown']
      .map((p) => `package:${p}`)
      .join('\n') + '\n'
  );
} else if (is('shell', 'input', 'keyevent')) {
  log(`keyevent ${args[3]}`);
} else if (is('shell', 'input', 'text')) {
  log(`text ${args[3]}`);
} else if (is('shell', 'monkey', '-p')) {
  log(`launch ${args[3]}`);
  process.stdout.write('Events injected: 1\n');
} else if (is('shell', 'am', 'start', '-a', 'android.search.action.GLOBAL_SEARCH', '--es', 'query')) {
  log(`assistant_query ${unquote(args[7])}`);
  process.stdout.write('Starting: Intent { act=android.search.action.GLOBAL_SEARCH (has extras) }\n');
} else if (is('shell', 'am', 'start', '-a', 'android.search.action.GLOBAL_SEARCH')) {
  log('assistant_open');
  process.stdout.write('Starting: Intent { act=android.search.action.GLOBAL_SEARCH }\n');
} else if (is('exec-out', 'screencap', '-p')) {
  process.stdout.write(PNG);
} else {
  process.stderr.write(`fake-adb: unhandled args: ${args.join(' ')}\n`);
  process.exit(1);
}
