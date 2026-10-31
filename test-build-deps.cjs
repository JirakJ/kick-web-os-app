const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const cliRequire = createRequire(require.resolve('@webos-tools/cli/package.json'));
let failures = 0;
function check(name, fn) {
  try { fn(); console.log(name + ': passed'); }
  catch (error) { failures++; console.error(name + ': ' + error.message); }
}

check('Proxy trust rejects IPv4 outside a mapped IPv6 subnet', () => {
  const proxyaddr = cliRequire('proxy-addr');
  assert.equal(proxyaddr.compile('::ffff:10.0.0.0/8')('203.0.113.9'), false);
  assert.equal(proxyaddr.compile('::ffff:10.0.0.0/104')('10.1.2.3'), true);
  assert.equal(proxyaddr.compile('10.0.0.0/8')('203.0.113.9'), false);
});

check('Sprintf source and shipped bundle tolerate hostile numeric precision', () => {
  const source = cliRequire.resolve('sprintf-js');
  const dist = path.join(path.dirname(path.dirname(source)), 'dist/sprintf.min.js');
  for (const target of [source, dist]) {
    const { sprintf, vsprintf } = require(target);
    assert.equal(sprintf('%-6s %04d %.2f', 'TV', 7, 1.25), 'TV     0007 1.25');
    assert.equal(vsprintf('%s %d', ['TV', 7]), 'TV 7');
    assert.equal(sprintf('%.0s', 'text'), '');
    assert.equal(sprintf('%.0t', true), '');
    assert.equal(sprintf('%.0f', 1.75), '2');
    assert.equal(sprintf('%.0g', 1.75), '2');
    const child = spawnSync(process.execPath, ['-e', `
      const { sprintf } = require(${JSON.stringify(target)});
      setImmediate(() => {
        for (const type of ['e', 'f', 'g']) {
          for (const p of ['101', '1000000', '9'.repeat(10000)]) {
            const result = sprintf('%.' + p + type, 1.25);
            if (typeof result !== 'string' || result.length > 120) process.exit(2);
          }
        }
        if (sprintf('%.0g', 1) !== '1') process.exit(3);
      });
    `], { timeout: 5000, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr || String(child.error));
  }
});

check('Braces accepts normal patterns and bounds parsing and AST traversal', () => {
  const braces = cliRequire('braces');
  assert.deepEqual(braces.expand('file-{a,b}-{1..2}'), ['file-a-1', 'file-a-2', 'file-b-1', 'file-b-2']);
  assert.equal(braces.stringify(braces.parse('{a,b}'), { escapeInvalid: true }), '{a,b}');
  for (const [open, close] of [['{', '}'], ['(', ')']]) {
    const pattern = open.repeat(101) + 'a,b' + close.repeat(101);
    assert.throws(() => braces.parse(pattern), /depth/i);
    assert.throws(() => braces.parse(pattern, { maxDepth: 100000 }), /depth/i);
    const ast = braces.parse(open.repeat(20) + 'a,b' + close.repeat(20));
    for (const fn of ['compile', 'expand', 'stringify']) {
      assert.throws(() => braces[fn](ast, { maxDepth: 5 }), /depth/i);
    }
  }
});

check('Only patched glob and minimatch remain and bound hostile brace expansions', () => {
  const rimrafDir = path.dirname(cliRequire.resolve('rimraf/package.json'));
  const globDir = path.dirname(require.resolve('glob/package.json', { paths: [rimrafDir] }));
  assert.equal(require(path.join(globDir, 'package.json')).version, '14.0.3');
  const target = require.resolve('minimatch', { paths: [globDir] });
  assert.ok(Number(require(path.join(path.dirname(target), '..', '..', 'package.json')).version.split('.')[0]) >= 11);
  const { packages } = require('./package-lock.json');
  const major = (name) => Object.keys(packages)
    .filter((key) => key.endsWith('node_modules/' + name))
    .map((key) => Number(packages[key].version.split('.')[0]));
  assert.deepEqual(major('glob').filter((m) => m < 14), [], 'glob before 14 (GHSA-3g3m-2fjr-6pw4)');
  assert.deepEqual(major('minimatch').filter((m) => m < 11), [], 'minimatch before 11 (GHSA-g3hv-75wg-m249)');
  const child = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const { braceExpand } = require(${JSON.stringify(target)});
    assert.deepEqual(braceExpand('file-{a,b}'), ['file-a', 'file-b']);
    braceExpand('{' + '{a},'.repeat(7000) + 'b}');
    braceExpand('{'.repeat(3200) + 'a,b' + '}'.repeat(3200));
    braceExpand('{a}' + '}'.repeat(32000) + ',z}');
  `], { timeout: 5000, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr || String(child.error));
});

check('Glob-free rimraf 2 shim removes trees for fstream and temp', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  for (const dependent of ['fstream', 'temp']) {
    const from = path.dirname(cliRequire.resolve(dependent + '/package.json'));
    const rimraf = require(require.resolve('rimraf', { paths: [from] }));
    assert.equal(typeof rimraf, 'function');
    assert.equal(typeof rimraf.sync, 'function');
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rimraf-shim-'));
    fs.mkdirSync(path.join(base, 'a', 'b'), { recursive: true });
    fs.writeFileSync(path.join(base, 'a', 'b', 'f'), 'x');
    fs.writeFileSync(path.join(base, '*'), 'literal');
    rimraf.sync(path.join(base, '*'), { maxBusyTries: 6 });
    assert.ok(fs.existsSync(path.join(base, 'a')), 'a literal "*" must not glob');
    rimraf.sync(base);
    assert.equal(fs.existsSync(base), false);
    rimraf.sync(base);
  }
});

check('Glob-free rimraf 2 shim keeps the callback API', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const from = path.dirname(cliRequire.resolve('fstream/package.json'));
  const target = require.resolve('rimraf', { paths: [from] });
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rimraf-shim-cb-'));
  fs.mkdirSync(path.join(base, 'x', 'y'), { recursive: true });
  const child = spawnSync(process.execPath, ['-e', `
    const rimraf = require(${JSON.stringify(target)});
    rimraf(${JSON.stringify(base)}, (er) => {
      if (er || require('node:fs').existsSync(${JSON.stringify(base)})) process.exit(2);
      rimraf(${JSON.stringify(base)}, { maxBusyTries: 6 }, (er2) => process.exit(er2 ? 3 : 0));
    });
  `], { timeout: 5000, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr || String(child.error));
});
process.exitCode = failures ? 1 : 0;
