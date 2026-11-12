'use strict';
// Checks the Web Inspector soak sampler (tv-soak.cjs) with a simulated three-hour run.
// This validates the measuring tool only; it is not evidence of native TV playback.
const assert = require('node:assert/strict');
const startSoak = require('./tv-soak.cjs');

function scope() {
  let clock = 0, interval = null;
  const video = { currentTime: 0, paused: false, readyState: 4, error: null };
  const nodes = { watch: { hidden: false }, catalog: { hidden: true }, home: { hidden: true }, about: { hidden: true },
    'playback-status': { hidden: true, textContent: '' } };
  let videos = [video], extra = 0;
  const env = {
    Date: { now: () => clock }, navigator: { onLine: true }, performance: { memory: { usedJSHeapSize: 2000000 } },
    document: { getElementById: id => nodes[id] || null, getElementsByTagName: tag => tag === 'video' ? videos : { length: 600 + extra } },
    setInterval(fn, ms) { interval = { fn, ms }; return 1; }, clearInterval() { interval = null; }
  };
  return { env, video, nodes, tick(seconds, advance = true) { clock += seconds * 1000; if (advance && !video.paused) video.currentTime += seconds; interval && interval.fn(); },
    get interval() { return interval; }, addVideo() { videos = [video, {}]; }, grow(n) { extra += n; } };
}

let s = scope();
let soak = startSoak({ minutes: 180, intervalSeconds: 60 }, s.env);
assert.equal(s.interval.ms, 60000);
for (let i = 0; i < 180; i++) s.tick(60);
let result = soak.summary();
assert.equal(result.samples, 181);assert.equal(result.finished, true, 'The run stops itself at the time limit');assert.equal(s.interval, null);
assert.deepEqual(result.problems, []);assert.equal(result.maxVideos, 1);assert.equal(result.position.last, 10800);
assert.deepEqual(result.dom, { first: 600, min: 600, max: 600, last: 600 });

s = scope();soak = startSoak({ minutes: 10, intervalSeconds: 60 }, s.env);
s.tick(60);s.tick(60, false);s.video.paused = true;s.tick(60, false);s.video.paused = false;s.tick(60);
s.addVideo();s.grow(40);s.tick(60);s.video.error = { code: 3 };s.nodes.watch.hidden = true;s.nodes.catalog.hidden = false;s.tick(60);
result = soak.stop();
assert.equal(result.stalls, 1, 'A frozen clock while playing is a stall; a paused clock is not');
assert.equal(result.maxVideos, 2);assert.equal(result.mediaErrors, 1);assert.equal(result.dom.max, 640);
assert.deepEqual(result.problems, ['More than one video element was present', '1 sample(s) without playback progress', '1 sample(s) with a media error', '1 sample(s) outside the player']);
assert.equal(soak.samples().at(-1).screen, 'catalog');

s = scope();soak = startSoak({ minutes: 0.001, intervalSeconds: 1 }, s.env);
assert.equal(soak.summary().samples, 1);
console.log('Soak sampler: passed (bounded run, stalls vs pause, extra video elements, media errors, screen changes and DOM/heap ranges).');
