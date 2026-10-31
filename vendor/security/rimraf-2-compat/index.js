'use strict';
// rimraf 2 API (callback and .sync) on Node's fs.rm. fstream and temp only pass literal paths,
// so the glob expansion of rimraf 2 (glob 7 -> minimatch 3, GHSA-g3hv-75wg-m249) is dropped.
const fs = require('node:fs');

function rmOptions(options) {
  const retries = options && Number.isInteger(options.maxBusyTries) ? options.maxBusyTries : 3;
  return { recursive: true, force: true, maxRetries: retries };
}

function check(p) {
  if (typeof p !== 'string' || p === '') throw new TypeError('rimraf: path must be a non-empty string');
}

function rimraf(p, options, cb) {
  if (typeof options === 'function') { cb = options; options = {}; }
  check(p);
  if (typeof cb !== 'function') throw new TypeError('rimraf: callback function required');
  fs.rm(p, rmOptions(options), (er) => cb(er || null));
}

rimraf.sync = function rimrafSync(p, options) {
  check(p);
  fs.rmSync(p, rmOptions(options));
};

module.exports = rimraf;
