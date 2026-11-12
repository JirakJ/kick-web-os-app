'use strict';
// Regression fixtures for the reusable geometry checker (test-layout.cjs), issue #28.
// The checker must ignore scroll extent that paints nothing (Chromium 68 counts a collapsed
// trailing child margin in scrollHeight) and still report clipped text, painted boxes that leave
// their container, out-of-viewport controls and overlapping controls.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const checkLayout = require('./test-layout.cjs');

const renditions = ['Auto (adaptive)', '1080p · 60 fps', '720p · 60 fps', '480p · 30 fps', '360p · 30 fps', '160p · 30 fps'];
const fixture = `<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; font: 24px Arial, sans-serif; background: #000; color: #fff; }
  .card { width: 900px; padding: 30px; }
  .list { display: block; }
  .list button { display: block; width: 100%; height: 68px; margin: 8px 0; font: inherit; }
  #broken-box { height: 100px; }
  #broken-box div { height: 150px; background: #222; }
  #clipped-text { width: 300px; height: 28px; line-height: 28px; }
  #outside { margin-left: 3000px; }
</style><body></body>`;

function list(id) {
  return `<div class="card"><div id="${id}" class="list">${renditions.map(text => `<button type="button">${text}</button>`).join('')}</div><button type="button">Cancel</button></div>`;
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.setContent(fixture);
    const run = () => page.evaluate(checkLayout, { report: true });

    // Real six-choice rendition list: every painted button fits, so nothing is reported.
    await page.evaluate(html => { document.body.innerHTML = html; }, list('quality-options'));
    let result = await run();
    assert.deepEqual(result.errors, [], 'A fitting six-choice rendition list passes');

    // Reproduce the native measurement: clientHeight 502, scrollHeight 510 from the collapsed
    // trailing 8px margin. Modern Chromium excludes that margin, so the old engine's accounting
    // is applied to the element directly; all painted geometry stays real.
    const native = await page.evaluate(() => {
      const box = document.getElementById('quality-options');
      box.style.height = '502px'; box.style.boxSizing = 'border-box';
      const natural = box.scrollHeight;
      Object.defineProperty(box, 'scrollHeight', { configurable: true, get() { return 510; } });
      return { client: box.clientHeight, natural, last: box.lastElementChild.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom };
    });
    assert.equal(native.client, 502, 'Fixture matches the native container height');
    assert.ok(native.last <= 0, 'Every painted rendition button lies inside its container');
    result = await run();
    assert.deepEqual(result.errors, [], 'Collapsed-margin scroll extent is not painted overflow');
    assert.ok(result.notes.some(note => /^quality-options: vertical scroll extent \+8px without painted overflow/.test(note)),
      'The ignored extent remains visible as a note: ' + JSON.stringify(result.notes));
    assert.deepEqual(await page.evaluate(checkLayout), [], 'The default call keeps the error-array contract');

    // The same list with one more rendition than fits is painted overflow and must fail,
    // under both the old engine's and the modern engine's scroll accounting.
    await page.evaluate(() => {
      const box = document.getElementById('quality-options');
      box.appendChild(box.lastElementChild.cloneNode(true));
    });
    result = await run();
    assert.ok(result.errors.includes('quality-options: vertical content overflow'), 'A rendition painted below its container is reported: ' + JSON.stringify(result));
    await page.evaluate(() => { delete document.getElementById('quality-options').scrollHeight; });
    result = await run();
    assert.ok(result.errors.includes('quality-options: vertical content overflow'), 'Painted overflow is reported with native scroll accounting');

    // Deliberately broken cases that must remain errors; no element-ID exemption exists.
    await page.evaluate(() => {
      document.body.innerHTML = '<div id="broken-box"><div></div></div>' +
        '<div id="clipped-text">' + 'Long replay title that wraps beyond its fixed height '.repeat(4) + '</div>' +
        '<button id="outside" type="button">Out of bounds</button>' +
        '<button id="play" type="button" style="position:absolute;left:0;top:600px;width:300px">Play</button>' +
        '<button id="recordings" type="button" style="position:absolute;left:100px;top:610px;width:300px">Replays</button>';
    });
    result = await run();
    for (const expected of ['broken-box: vertical content overflow', 'clipped-text: vertical content overflow',
      'outside: box outside viewport', 'play overlaps recordings', 'Page has horizontal overflow'])
      assert.ok(result.errors.includes(expected), expected + ' in ' + JSON.stringify(result.errors));

    // Text alone (no element children) is measured too.
    await page.evaluate(() => {
      document.body.innerHTML = '<div id="text-only" style="width:200px;height:20px">' + 'word '.repeat(80) + '</div>';
    });
    result = await run();
    assert.deepEqual(result.errors, ['text-only: vertical content overflow'], 'Clipped text without child elements is reported');
  } finally {
    await browser.close();
  }
  console.log('Layout audit: passed (collapsed-margin extent ignored with a note; painted box/text overflow, out-of-bounds and overlapping controls reported).');
})().catch(error => { console.error(error); process.exitCode = 1; });
