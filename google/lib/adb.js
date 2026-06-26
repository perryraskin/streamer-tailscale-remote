'use strict';

/**
 * Thin wrapper around the `adb` binary.
 *
 * The binary is `ADB_BIN` (default `adb`) and, when `GOOGLE_TV_ADDR` is set
 * (e.g. `<tv-name>.<tailnet>.ts.net:5555`), every call is targeted at that device with
 * `-s`. Tests point `ADB_BIN` at a fake adb script, so the driver needs no
 * test seams of its own.
 */

const { execFile } = require('child_process');

const ADB_BIN = process.env.ADB_BIN || 'adb';
const GOOGLE_TV_ADDR = process.env.GOOGLE_TV_ADDR || null;

/**
 * Run adb with the given args. Resolves with stdout (string, or Buffer when
 * opts.binary). Rejects with stderr/message on non-zero exit.
 */
function adb(args, { binary = false, timeoutMs = 8000 } = {}) {
  const full = GOOGLE_TV_ADDR ? ['-s', GOOGLE_TV_ADDR, ...args] : args;
  return new Promise((resolve, reject) => {
    execFile(
      ADB_BIN,
      full,
      { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, encoding: binary ? 'buffer' : 'utf8' },
      (err, stdout, stderr) => {
        if (err) {
          const detail = (stderr && stderr.toString().trim()) || err.message;
          return reject(new Error(detail));
        }
        resolve(stdout);
      }
    );
  });
}

module.exports = { adb, ADB_BIN, GOOGLE_TV_ADDR };
