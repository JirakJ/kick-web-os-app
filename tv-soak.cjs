// Long-playback soak sampler for the installed app (issue #27). ES5 so it also runs on old webOS engines.
// In the TV's Web Inspector console: paste this file, start playback, then
//   var soak = startSoak({ minutes: 180, intervalSeconds: 60 });
// Later: soak.summary() for the verdict and JSON.stringify(soak.samples()) for the raw record.
// Samples are observations only. Native decoder memory and pipelines are not visible to the page;
// record those separately (see docs/hardware-acceptance.md).
function startSoak(options, scope) {
  options = options || {};
  scope = scope || (typeof window !== 'undefined' ? window : {});
  var doc = scope.document, now = scope.Date ? scope.Date.now : Date.now;
  var intervalMs = Math.max(1, Number(options.intervalSeconds) || 60) * 1000;
  var limitMs = Math.max(1, Number(options.minutes) || 180) * 60000;
  var started = now(), samples = [], timer = null, finished = false;
  function text(id) { var node = doc.getElementById(id); return node && !node.hidden ? String(node.textContent || '').slice(0, 160) : ''; }
  function screen() {
    var ids = ['watch', 'catalog', 'home', 'about'];
    for (var i = 0; i < ids.length; i++) { var node = doc.getElementById(ids[i]); if (node && !node.hidden) return ids[i]; }
    return '';
  }
  function sample() {
    var videos = doc.getElementsByTagName('video'), video = videos[0] || null;
    var memory = scope.performance && scope.performance.memory, previous = samples[samples.length - 1];
    var entry = {
      seconds: Math.round((now() - started) / 1000), screen: screen(), videos: videos.length,
      position: video ? Math.round(Number(video.currentTime) * 10) / 10 : null,
      paused: video ? !!video.paused : null, readyState: video ? video.readyState : null,
      mediaError: video && video.error ? video.error.code : null,
      dom: doc.getElementsByTagName('*').length, heap: memory ? memory.usedJSHeapSize : null,
      online: scope.navigator ? scope.navigator.onLine !== false : null, status: text('playback-status')
    };
    // A playing element whose clock did not move since the previous sample is a stall candidate.
    entry.stalled = !!(previous && video && previous.position !== null && !entry.paused && !previous.paused && entry.position <= previous.position);
    samples.push(entry);
    if (now() - started >= limitMs) stop();
    return entry;
  }
  function range(key) {
    var values = samples.map(function (s) { return s[key]; }).filter(function (v) { return typeof v === 'number'; });
    return values.length ? { first: values[0], min: Math.min.apply(null, values), max: Math.max.apply(null, values), last: values[values.length - 1] } : null;
  }
  function summary() {
    var stalls = samples.filter(function (s) { return s.stalled; }).length;
    var maxVideos = samples.reduce(function (max, s) { return Math.max(max, s.videos); }, 0);
    var errors = samples.filter(function (s) { return s.mediaError !== null; }).length;
    var watching = samples.filter(function (s) { return s.screen === 'watch'; }).length;
    var problems = [];
    if (maxVideos > 1) problems.push('More than one video element was present');
    if (stalls) problems.push(stalls + ' sample(s) without playback progress');
    if (errors) problems.push(errors + ' sample(s) with a media error');
    if (watching < samples.length) problems.push((samples.length - watching) + ' sample(s) outside the player');
    return { samples: samples.length, seconds: samples.length ? samples[samples.length - 1].seconds : 0, finished: finished,
      maxVideos: maxVideos, stalls: stalls, mediaErrors: errors, dom: range('dom'), heap: range('heap'), position: range('position'),
      problems: problems, note: 'Settle with a forced GC before the final sample; native decoder memory is not visible here.' };
  }
  function stop() {
    if (timer !== null) { scope.clearInterval(timer); timer = null; }
    finished = true;
    return summary();
  }
  sample();
  if (!finished) timer = scope.setInterval(sample, intervalMs);
  return { stop: stop, sample: sample, summary: summary, samples: function () { return samples.slice(); } };
}
if (typeof module !== 'undefined') module.exports = startSoak;
