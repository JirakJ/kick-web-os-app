/* Native webOS media lifecycle. No network proxy or browser player library. Status messages are i18n keys. */
function KickPlayer(host, events) {
  'use strict';
  var media = null, item = null, epoch = 0, ready = false;
  var wantPlay = false, phase = 'idle', position = 0, duration = 0;
  var queuedSeek = null, activeSeek = null, seekTimer, deadline, retryTimer;
  var retries = 0, healthySince = 0, playPending = false, playAttempt = 0;

  function validURL(url) {
    return typeof url === 'string' && url.length < 4096 &&
      /^https:\/\/(?:stream\.kick\.com|(?:[a-z0-9-]+\.)+live-video\.net)\/[^\s?#]+\.m3u8(?:\?[^\s#]*)?$/.test(url);
  }
  function finite(value) { return typeof value === 'number' && isFinite(value); }
  function target() { return queuedSeek !== null ? queuedSeek : activeSeek !== null ? activeSeek : position; }
  function state() {
    return { phase: phase, paused: !wantPlay, ready: ready, position: target(), duration: duration,
      isLive: !!(item && item.isLive), seeking: queuedSeek !== null || activeSeek !== null };
  }
  function changed() { events.change(state()); }
  function status(key, params) { events.status(key, params); }
  function clearDeadline() { clearTimeout(deadline); deadline = null; }
  function armDeadline() {
    clearDeadline();
    deadline = setTimeout(function () { recover('p_stalled'); }, 20000);
  }
  function dispose() {
    epoch++;
    playAttempt++;
    clearDeadline(); clearTimeout(seekTimer); clearTimeout(retryTimer);
    seekTimer = retryTimer = null;
    ready = false; playPending = false; activeSeek = queuedSeek = null;
    var previous = media;
    media = null;
    if (previous) {
      try {
        previous.pause(); previous.removeAttribute('src');
        while (previous.firstChild) previous.removeChild(previous.firstChild);
        previous.load();
      } catch (e) { /* Still detach a failed native decoder. */ }
      if (previous.parentNode === host) host.removeChild(previous);
    }
  }
  function recover(reason, params) {
    if (!item || retryTimer || phase === 'error' || document.hidden) return;
    position = target();
    dispose(); healthySince = 0;
    if (navigator.onLine === false) {
      phase = 'error'; wantPlay = false;
      status('p_offline'); changed(); return;
    }
    if (retries >= 2) {
      phase = 'error'; wantPlay = false;
      status('p_failed_final', { reason: reason, reasonParams: params }); changed(); return;
    }
    retries++; phase = 'recovering';
    status('p_recovering', { attempt: retries }); changed();
    var token = epoch;
    retryTimer = setTimeout(function () {
      retryTimer = null;
      if (token === epoch && item && !document.hidden) mount();
    }, 600);
  }
  function requestPlay() {
    if (!media || playPending) return;
    var node = media, token = epoch, attempt = ++playAttempt;
    playPending = true;
    try {
      var result = node.play();
      if (result && result.then) result.then(function () {
        if (token === epoch && attempt === playAttempt) playPending = false;
      }, function (error) {
        if (token !== epoch || node !== media || attempt !== playAttempt) return;
        playPending = false;
        if (!wantPlay || error && error.name === 'AbortError') return;
        if (error && error.name === 'NotAllowedError') {
          wantPlay = false; phase = 'paused'; clearDeadline();
          status('p_press_ok'); changed();
        } else recover('p_play_failed');
      });
      else playPending = false;
    } catch (e) { playPending = false; recover('p_play_failed'); }
  }
  function commitSeek() {
    seekTimer = null;
    if (!media || !ready || activeSeek !== null || queuedSeek === null || media.seeking) return;
    activeSeek = queuedSeek; queuedSeek = null; phase = 'seeking';
    status('p_seeking'); changed(); armDeadline();
    try { media.currentTime = activeSeek; }
    catch (e) { recover('p_seek_failed'); }
  }
  function mount() {
    if (!item || document.hidden) return;
    dispose();
    phase = 'loading'; status('p_loading');
    var node = document.createElement('video');
    node.id = 'video'; node.preload = 'auto'; node.setAttribute('playsinline', '');
    media = node;
    var token = epoch;
    function on(name, callback) {
      node.addEventListener(name, function () {
        if (node === media && token === epoch && item) callback();
      });
    }
    on('loadedmetadata', function () {
      if (finite(node.duration) && node.duration > 0) duration = node.duration;
      changed();
    });
    on('loadeddata', function () {
      ready = true;
      if (!wantPlay) { node.pause(); phase = 'paused'; clearDeadline(); status(''); }
      if (queuedSeek !== null) commitSeek();
      changed();
    });
    on('playing', function () {
      ready = true; playPending = false;
      if (!wantPlay) { node.pause(); phase = 'paused'; clearDeadline(); changed(); return; }
      phase = activeSeek === null ? 'playing' : 'seeking';
      if (activeSeek === null) status('');
      if (!healthySince) healthySince = Date.now();
      armDeadline(); changed();
    });
    on('timeupdate', function () {
      if (activeSeek === null && finite(node.currentTime)) {
        var delta = node.currentTime - position;
        var advanced = Math.abs(delta) > 0.05;
        position = Math.max(0, node.currentTime);
        if (advanced && wantPlay && !node.paused) {
          phase = 'playing'; status(''); armDeadline();
          if (healthySince && Date.now() - healthySince >= 30000) retries = 0;
          if (!item.isLive && delta > 0 && !node.seeking && queuedSeek === null && events.progress) {
            events.progress(position, duration, false);
          }
        }
      }
      changed();
    });
    on('durationchange', function () {
      if (finite(node.duration) && node.duration > 0) duration = node.duration;
      changed();
    });
    on('seeked', function () {
      if (activeSeek !== null) position = activeSeek;
      activeSeek = null;
      clearDeadline(); phase = wantPlay ? 'playing' : 'paused'; status('');
      if (!wantPlay) node.pause(); else armDeadline();
      changed();
      if (queuedSeek !== null) commitSeek();
    });
    on('pause', changed);
    on('waiting', function () {
      healthySince = 0;
      if (wantPlay || activeSeek !== null) {
        phase = activeSeek === null ? 'buffering' : 'seeking';
        status(activeSeek === null ? 'p_loading' : 'p_seeking');
        if (!deadline) armDeadline();
        changed();
      }
    });
    on('error', function () { recover('p_media_error', { code: node.error && typeof node.error.code === 'number' ? node.error.code : '?' }); });
    on('ended', function () {
      if (item.isLive) { recover('p_live_interrupted'); return; }
      wantPlay = false; phase = 'ended'; position = duration;
      if (events.progress) events.progress(position, duration, true);
      clearDeadline(); status('p_ended'); changed();
    });
    on('click', function () { if (events.interact) events.interact(); });
    try {
      node.muted = false; node.volume = 1;
      var source = document.createElement('source');
      var best = item.best;
      var options = { mediaTransportType: 'HLS', option: {
        adaptiveStreaming: { maxWidth: 3840, maxHeight: 2160, adaptiveResolution: true,
          bps: { start: best && finite(best.bitrate) && best.bitrate > 0 ? best.bitrate : 40000000 } }
      } };
      if (!item.isLive && position > 0) options.option.transmission = { playTime: { start: Math.round(position * 1000) } };
      source.setAttribute('src', item.url);
      source.setAttribute('type', 'application/x-mpegurl;mediaOption=' + encodeURI(JSON.stringify(options)));
      node.appendChild(source); host.appendChild(node); node.load();
      armDeadline(); changed();
      if (wantPlay) requestPlay();
    } catch (e) { recover('p_mount_failed'); }
  }
  function stop() {
    item = null; wantPlay = false; dispose();
    position = duration = retries = healthySince = 0; phase = 'idle';
    status(''); changed();
  }
  function load(value) {
    stop();
    if (!value || !validURL(value.url)) { phase = 'error'; status('p_invalid_url'); changed(); return false; }
    item = value; duration = finite(value.duration) && value.duration > 0 ? value.duration : 0;
    wantPlay = true; mount(); return true;
  }
  function play() {
    if (!item || document.hidden) return;
    wantPlay = true;
    if (phase === 'ended') position = 0;
    if (phase === 'error') retries = 0;
    if (!media && !retryTimer) mount(); else { requestPlay(); armDeadline(); changed(); }
  }
  function pause() {
    wantPlay = false;
    playAttempt++; playPending = false;
    if (media) { try { media.pause(); } catch (e) { recover('p_pause_failed'); } }
    if (activeSeek === null && ready) { clearDeadline(); phase = 'paused'; }
    changed();
  }
  function seekTo(value) {
    if (!item || item.isLive || !finite(value) || !duration || phase === 'error') return;
    queuedSeek = Math.max(0, Math.min(Math.max(0, duration - 0.1), value));
    clearTimeout(seekTimer); seekTimer = setTimeout(commitSeek, 300); changed();
  }
  function suspend() {
    position = target(); wantPlay = false; dispose(); phase = item ? 'paused' : 'idle';
    if (item) status('p_suspended');
    changed();
  }
  return { load: load, stop: stop, play: play, pause: pause, suspend: suspend, state: state,
    toggle: function () { if (wantPlay) pause(); else play(); },
    seekTo: seekTo, seekBy: function (seconds) { if (finite(seconds)) seekTo(target() + seconds); } };
}
if (typeof module !== 'undefined') module.exports = KickPlayer;
