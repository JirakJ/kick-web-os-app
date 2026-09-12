function kickChannel(value) {
  if (typeof value !== 'string') return '';
  var input = value.trim().toLowerCase();
  var url = input.match(/^(?:https:\/\/)?(?:www\.)?kick\.com\/([a-z0-9_-]{1,25})\/?$/);
  return url ? url[1] : (/^[a-z0-9_-]{1,25}$/.test(input) ? input : '');
}
if (typeof module !== 'undefined') module.exports = kickChannel;

if (typeof document !== 'undefined') (function () {
  'use strict';
  function el(id) { return document.getElementById(id); }
  var input = el('channel');
  var playback = { paused: true, phase: 'idle', position: 0, duration: 0, ready: false, seeking: false };
  var preparing = false;
  var hidingControls = false;
  var page = 0;
  var recents = [];
  var recentPage = 0, recentStatus = Object.create(null), recentRequest = null, recentTimer, recentGeneration = 0;
  var watched = [], historyDirty = false, historyWrittenAt = 0;
  var recentButtons = [], recentControls = [];
  var videoButtons = [];
  var current = null;
  var catalog = null;
  var screen = 'home';
  var request = null;
  var requestTimer;
  var controlsTimer;
  var generation = 0;
  var scrubbing = false;
  var timelineState = '';
  var player = KickPlayer(el('video-host'), { status: mediaStatus, change: function (next) {
    var transition = playback.phase !== next.phase || playback.paused !== next.paused;
    playback = next;
    var label = next.phase === 'error' ? 'Zkusit znovu' : next.paused ? 'Pokračovat' : 'Pozastavit';
    if (el('toggle').textContent !== label) el('toggle').textContent = label;
    updateTimeline();
    if (next.paused) saveWatched();
    if (transition && screen === 'watch' && next.phase !== 'idle') showControls();
  }, progress: rememberVideo, interact: function () { showControls(); el('toggle').focus(); } });

  function videoKey(item) {
    return item && !item.isLive && typeof item.id === 'string' && /^[a-z0-9-]{1,64}$/.test(item.id) ?
      kickChannel(input.value) + ':' + item.id : '';
  }
  function watchedVideo(item) {
    var key = videoKey(item);
    for (var i = 0; i < watched.length; i++) if (watched[i].key === key) return watched[i];
  }
  function saveWatched() {
    if (!historyDirty) return;
    try { localStorage.setItem('kick-watched-videos', JSON.stringify(watched)); } catch (e) { /* Keep this session's history if storage is unavailable. */ }
    historyDirty = false; historyWrittenAt = Date.now();
  }
  function rememberVideo(position, duration, ended) {
    var key = videoKey(current), previous = watchedVideo(current);
    if (!key || ended && !previous || !isFinite(position) || position <= 0) return;
    var entry = previous || { key: key, finished: false };
    entry.position = Math.min(position, 2592000);
    entry.duration = isFinite(duration) && duration > 0 ? Math.min(duration, 2592000) : 0;
    entry.finished = !!ended || entry.finished;
    if (watched[0] !== entry) watched = [entry].concat(watched.filter(function (other) {
      return other.key !== key;
    })).slice(0, 200);
    historyDirty = true;
    if (!previous || ended || Date.now() - historyWrittenAt >= 10000) saveWatched();
  }

  function setScreen(name) {
    screen = name;
    ['home', 'catalog', 'watch'].forEach(function (id) { el(id).hidden = id !== name; });
    window.scrollTo(0, 0);
    if (name === 'home') refreshRecentStatus(); else cancelRecentStatus();
  }
  function cancelRequest() {
    generation++;
    clearTimeout(requestTimer);
    var previous = request;
    request = null;
    if (previous) { try { previous.cancel(); } catch (e) { /* A closed bridge is already cancelled. */ } }
  }
  function unload() {
    saveWatched();
    clearTimeout(controlsTimer);
    preparing = false;
    el('toggle').disabled = false;
    player.stop();
  }
  function goHome() {
    cancelRequest();
    current = null;
    unload();
    setScreen('home');
    input.focus();
  }
  function renderRecents() {
    var list = el('recent-channels');
    while (list.firstChild) list.removeChild(list.firstChild);
    recentButtons = []; recentControls = [];
    el('recent').hidden = !recents.length;
    var pages = Math.max(1, Math.ceil(recents.length / 6));
    recentPage = Math.max(0, Math.min(recentPage, pages - 1));
    recents.slice(recentPage * 6, recentPage * 6 + 6).forEach(function (name) {
      var row = document.createElement('div'); row.className = 'recent-row';
      var button = document.createElement('button');
      button.type = 'button'; button.className = 'recent-play';
      var label = document.createElement('span');
      label.className = 'recent-name'; label.textContent = name; button.appendChild(label);
      var live = document.createElement('span');
      live.className = 'recent-live'; live.textContent = 'ŽIVĚ'; live.hidden = true; button.appendChild(live);
      button.addEventListener('click', function () { startChannel(name, true); });
      var remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'recent-remove'; remove.textContent = '×';
      remove.setAttribute('aria-label', 'Odebrat kanál ' + name);
      remove.setAttribute('title', 'Odebrat kanál');
      remove.addEventListener('click', function () {
        cancelRecentStatus();
        var index = recentButtons.indexOf(button);
        recents = recents.filter(function (item) { return item !== name; });
        delete recentStatus[name]; saveRecents(); renderRecents();
        if (input.value === name) input.value = recents[0] || '';
        (recentButtons[Math.min(index, recentButtons.length - 1)] || input).focus();
        refreshRecentStatus();
      });
      row.appendChild(button); row.appendChild(remove); list.appendChild(row);
      recentButtons.push(button); recentControls.push(button, remove);
    });
    el('recent-pages').hidden = pages <= 1;
    el('recent-previous').disabled = recentPage === 0;
    el('recent-next').disabled = recentPage === pages - 1;
    el('recent-page-number').textContent = (recentPage + 1) + ' / ' + pages;
    showRecentStatus();
  }
  function showRecentStatus() {
    recentButtons.forEach(function (button, index) {
      var name = recents[recentPage * 6 + index], status = recentStatus[name];
      var live = !!(status && status.live === true && Date.now() - status.at < 60000);
      button.children[1].hidden = !live;
      button.setAttribute('aria-label', name + (live ? ', právě vysílá' : ''));
    });
  }
  function cancelRecentStatus() {
    recentGeneration++; clearTimeout(recentTimer);
    var request = recentRequest; recentRequest = null;
    if (request) { try { request.cancel(); } catch (e) { /* The status connection may already be closed. */ } }
  }
  function refreshRecentStatus() {
    cancelRecentStatus();
    if (screen !== 'home' || document.hidden || !recents.length) return;
    showRecentStatus();
    var names = recents.slice(recentPage * 6, recentPage * 6 + 6).filter(function (name) {
      return !recentStatus[name] || Date.now() - recentStatus[name].at >= 60000;
    });
    if (!names.length || navigator.onLine === false || typeof PalmServiceBridge === 'undefined') {
      var delay = 60000;
      if (!names.length) recents.slice(recentPage * 6, recentPage * 6 + 6).forEach(function (name) {
        delay = Math.min(delay, Math.max(1, 60000 - (Date.now() - recentStatus[name].at)));
      });
      recentTimer = setTimeout(refreshRecentStatus, delay); return;
    }
    var token = recentGeneration;
    function finish(data) {
      if (token !== recentGeneration) return;
      cancelRecentStatus();
      names.forEach(function (name) { recentStatus[name] = { live: null, at: Date.now() }; });
      if (data && data.returnValue && Array.isArray(data.statuses)) data.statuses.slice(0, 6).forEach(function (status) {
        if (status && names.indexOf(status.channel) !== -1 && typeof status.live === 'boolean')
          recentStatus[status.channel] = { live: status.live, at: Date.now() };
      });
      refreshRecentStatus();
    }
    try {
      recentRequest = new PalmServiceBridge();
      recentRequest.onservicecallback = function (response) {
        var data;
        try { if (typeof response === 'string' && response.length <= 4096) data = JSON.parse(response); } catch (e) { /* Show no status for malformed replies. */ }
        finish(data);
      };
      recentTimer = setTimeout(function () { finish(null); }, 40000);
      recentRequest.call('luna://cz.jirak.kicktv.service/statuses', JSON.stringify({ channels: names }));
    } catch (e) { finish(null); }
  }
  function saveRecents() {
    try {
      localStorage.setItem('kick-recent-channels', JSON.stringify(recents));
      localStorage.setItem('kick-channel', recents[0] || '');
    } catch (e) { /* Optional storage. */ }
  }
  function remember(name) {
    recents = [name].concat(recents.filter(function (item) { return item !== name; })).slice(0, 50);
    recentPage = 0;
    Object.keys(recentStatus).forEach(function (key) { if (recents.indexOf(key) === -1) delete recentStatus[key]; });
    saveRecents();
    renderRecents();
  }
  function showControls() {
    if (screen !== 'watch') return;
    el('playback-controls').hidden = false;
    el('back').hidden = false;
    clearTimeout(controlsTimer);
    if (!playback.paused && !playback.seeking && !scrubbing && !preparing && el('playback-status').hidden) {
      controlsTimer = setTimeout(function () {
        hidingControls = true;
        el('watch').focus();
        hidingControls = false;
        el('playback-controls').hidden = true;
        el('back').hidden = true;
      }, 6000);
    }
  }
  function callService(method, payload, callback) {
    cancelRequest();
    var token = generation;
    try { request = new PalmServiceBridge(); }
    catch (e) { callback({ errorText: 'Službu přehrávače nelze spustit. Zkuste aplikaci znovu otevřít.' }); return; }
    request.onservicecallback = function (response) {
      if (token !== generation) return;
      var data;
      try {
        if (typeof response !== 'string' || response.length > 1048576) throw new Error('response size');
        data = JSON.parse(response);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('response');
      }
      catch (e) { data = { errorText: 'TV vrátila neplatnou odpověď.' }; }
      cancelRequest();
      callback(data);
    };
    requestTimer = setTimeout(function () {
      if (token !== generation) return;
      cancelRequest();
      callback({ errorText: 'TV neobdržela odpověď. Vraťte se a zkuste to znovu.' });
    }, 18000);
    try { request.call('luna://cz.jirak.kicktv.service/' + method, JSON.stringify(payload)); }
    catch (e) {
      cancelRequest();
      callback({ errorText: 'Službu přehrávače se nepodařilo spustit. Zkuste aplikaci znovu otevřít.' });
    }
  }
  function mediaStatus(message) {
    if (el('playback-status').textContent === message) return;
    el('playback-status').textContent = message;
    el('playback-status').hidden = !message;
    if (message) showControls();
  }
  function setVideoTitle(node, value) {
    var text = Array.from(String(value || 'Záznam')).slice(0, 200).join('');
    node.textContent = '';
    // BMP emoji covered by the bundled font. ASCII stays in ordinary text spans.
    var bmp = '\u00A9\u00AE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9-\u21AA\u231A-\u231B\u2328\u23CF\u23E9-\u23F3\u23F8-\u23FA\u24C2\u25AA-\u25AB\u25B6\u25C0\u25FB-\u25FE\u2600-\u2604\u260E\u2611\u2614-\u2615\u2618\u261D\u2620\u2622-\u2623\u2626\u262A\u262E-\u262F\u2638-\u263A\u2640\u2642\u2648-\u2653\u265F-\u2660\u2663\u2665-\u2666\u2668\u267B\u267E-\u267F\u2692-\u2697\u2699\u269B-\u269C\u26A0-\u26A1\u26A7\u26AA-\u26AB\u26B0-\u26B1\u26BD-\u26BE\u26C4-\u26C5\u26C8\u26CE-\u26CF\u26D1\u26D3-\u26D4\u26E9-\u26EA\u26F0-\u26F5\u26F7-\u26FA\u26FD\u2702\u2705\u2708-\u270D\u270F\u2712\u2714\u2716\u271D\u2721\u2728\u2733-\u2734\u2744\u2747\u274C\u274E\u2753-\u2755\u2757\u2763-\u2764\u2795-\u2797\u27A1\u27B0\u27BF\u2934-\u2935\u2B05-\u2B07\u2B1B-\u2B1C\u2B50\u2B55\u3030\u303D\u3297\u3299';
    var atom = '(?:[' + bmp + ']|[\\uD800-\\uDBFF][\\uDC00-\\uDFFF])';
    var part = atom + '(?:[\\uFE0E\\uFE0F]|\\uD83C[\\uDFFB-\\uDFFF]|\\uDB40[\\uDC20-\\uDC7F])*';
    var symbols = new RegExp('[#*0-9]\\uFE0F?\\u20E3|(?:\\uD83C[\\uDDE6-\\uDDFF]){2}|' + part + '(?:\\u200D' + part + ')*', 'g');
    var index = 0, match;
    function append(value, className) {
      if (!value) return;
      var span = document.createElement('span');
      if (className) span.className = className;
      span.textContent = value; node.appendChild(span);
    }
    // Isolate whole emoji sequences to avoid webOS 5's repeated-glyph corruption.
    while ((match = symbols.exec(text)) !== null) {
      append(text.slice(index, match.index), '');
      append(match[0], /^[#*0-9]/.test(match[0]) ? 'title-symbol title-keycap' : 'title-symbol');
      index = match.index + match[0].length;
    }
    append(text.slice(index), '');
  }
  function startVideo(item) {
    if (!item || typeof item.url !== 'string' ||
      !/^https:\/\/(?:stream\.kick\.com|(?:[a-z0-9-]+\.)+live-video\.net)\/[^\s?#]+\.m3u8(?:\?[^\s#]*)?$/.test(item.url)) {
      el('videos-status').textContent = 'Kick neposkytl platnou adresu videa.';
      return;
    }
    current = item;
    scrubbing = false;
    setScreen('watch');
    setVideoTitle(el('video-title'), (item.isLive ? 'ŽIVĚ · ' : '') + item.title);
    el('timeline').hidden = !!item.isLive;
    el('seek').value = 0;
    el('seek').max = 0;
    el('quality').textContent = 'Nejvyšší dostupná kvalita';
    el('toggle').textContent = 'Pozastavit';
    unload();
    mediaStatus('Načítání nejlepší dostupné kvality…');
    preparing = true;
    el('toggle').disabled = true;
    callService('prepare', { url: item.url }, function (data) {
      if (current !== item) return;
      preparing = false;
      el('toggle').disabled = false;
      var best = data.returnValue && data.best;
      item.best = best && typeof best.bitrate === 'number' && isFinite(best.bitrate) && best.bitrate > 0 &&
        typeof best.height === 'number' && best.height > 0 && best.height <= 2160 ? best : null;
      if (item.best) el('quality').textContent = 'Nejvyšší dostupná: ' + (item.best.height === 2160 ? '4K' : item.best.height + 'p') + (item.best.fps ? ' · ' + item.best.fps + ' fps' : '');
      if (!document.hidden) player.load(item);
      else mediaStatus('Přehrávání je zastavené. Zvolte Pokračovat.');
    });
    el('watch').focus();
  }
  function showCatalog() {
    cancelRequest();
    current = null;
    unload();
    setScreen('catalog');
    renderVideos();
    (catalog && catalog.live ? el('live') : videoButtons[0] || el('catalog-back')).focus();
  }
  function renderVideos() {
    var list = el('videos');
    while (list.firstChild) list.removeChild(list.firstChild);
    videoButtons = [];
    var all = catalog ? catalog.videos : [];
    var count = Math.max(1, Math.ceil(all.length / 6));
    page = Math.max(0, Math.min(page, count - 1));
    all.slice(page * 6, page * 6 + 6).forEach(function (item) {
      var button = document.createElement('button');
      button.type = 'button';
      var preview = document.createElement('span');
      preview.className = 'video-preview';
      preview.setAttribute('aria-hidden', 'true');
      if (typeof item.thumbnail === 'string' && /^https:\/\/(?:files|images)\.kick\.com\/[^\s#]+$/.test(item.thumbnail)) {
        var img = document.createElement('img');
        img.alt = ''; img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', function () { img.hidden = true; });
        img.src = item.thumbnail;
        preview.appendChild(img);
      }
      button.appendChild(preview);
      var title = document.createElement('span');
      title.className = 'video-title'; setVideoTitle(title, item.title);
      button.appendChild(title);
      var details = document.createElement('small');
      var seconds = Number(item.duration);
      var minutes = isFinite(seconds) && seconds > 0 ? Math.floor(seconds / 60) : 0;
      details.textContent = String(item.date || '').slice(0, 10) + ' · ' + Math.floor(minutes / 60) + ' h ' + minutes % 60 + ' min';
      button.appendChild(details);
      var entry = watchedVideo(item);
      if (entry) {
        var badge = document.createElement('span');
        badge.className = 'watched-badge';
        badge.textContent = entry.finished ? 'Zhlédnuto' : 'Sledováno · ' + formatTime(entry.position);
        preview.appendChild(badge);
        var latest = watched[0].key === entry.key;
        if (latest) {
          var last = document.createElement('span');
          last.className = 'last-watched'; last.textContent = 'Naposledy sledované';
          preview.appendChild(last);
        }
        if (entry.duration) {
          var progress = document.createElement('progress');
          progress.className = 'watched-progress'; progress.max = entry.duration;
          progress.value = entry.finished ? entry.duration : Math.min(entry.position, entry.duration);
          preview.appendChild(progress);
        }
        button.setAttribute('aria-label', title.textContent + ', ' + details.textContent + ', ' +
          (latest ? 'Naposledy sledované, ' : '') + badge.textContent);
      }
      button.addEventListener('click', function () { startVideo(item); });
      list.appendChild(button); videoButtons.push(button);
    });
    el('pages').hidden = count <= 1;
    el('previous-page').disabled = page === 0;
    el('next-page').disabled = page === count - 1;
    el('page-number').textContent = (page + 1) + ' / ' + count;
  }
  function renderCatalog(data) {
    catalog = data; page = 0;
    recentStatus[kickChannel(input.value)] = { live: !!data.live, at: Date.now() };
    data.videos = data.videos.filter(function (v) { return v && typeof v.url === 'string'; }).slice(0, 30);
    el('channel-status').textContent = data.live ? 'Právě vysílá' : 'Právě offline · Vyber si některý ze záznamů.';
    el('live').hidden = !data.live;
    el('catalog-retry').hidden = !data.videosError;
    el('videos-status').textContent = data.videosError || (data.videos.length ? '' : 'Kanál nemá dostupné veřejné záznamy.');
  }
  function startChannel(value, autoplay) {
    var name = kickChannel(value);
    if (!name) {
      el('error').textContent = 'Zadejte název kanálu nebo odkaz https://kick.com/kanal.';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    if (navigator.onLine === false) {
      el(screen === 'catalog' ? 'channel-status' : 'error').textContent = 'TV není připojená k internetu. Zkontrolujte připojení.';
      return;
    }
    input.value = name;
    input.removeAttribute('aria-invalid');
    el('error').textContent = '';
    cancelRequest();
    current = null;
    unload();
    catalog = null;
    videoButtons = [];
    while (el('videos').firstChild) el('videos').removeChild(el('videos').firstChild);
    el('pages').hidden = true;
    el('catalog-retry').hidden = true;
    el('live').hidden = true;
    el('catalog-heading').textContent = name;
    el('channel-status').textContent = 'Načítání kanálu…';
    el('videos-status').textContent = '';
    setScreen('catalog');
    el('catalog-back').focus();
    if (typeof PalmServiceBridge === 'undefined') {
      el('channel-status').textContent = 'Přehrávání vyžaduje instalaci aplikace včetně služby do TV.';
      return;
    }
    callService('channel', { channel: name }, function (data) {
      if (!data.returnValue || !Array.isArray(data.videos)) {
        el('channel-status').textContent = data.errorText || 'Kanál se nepodařilo načíst. Zkuste to znovu.';
        el('catalog-retry').hidden = false;
        return;
      }
      remember(name);
      renderCatalog(data);
      if (autoplay && data.live && !document.hidden) startVideo(data.live);
      else showCatalog();
    });
  }
  function toggle() {
    if (!current || preparing) return;
    if (playback.phase === 'idle') player.load(current); else player.toggle();
    showControls();
  }
  function seek(seconds) {
    if (!current || current.isLive || preparing) return;
    player.seekBy(seconds);
    showControls();
  }
  function formatTime(seconds) {
    seconds = Math.max(0, Math.floor(seconds) || 0);
    var h = Math.floor(seconds / 3600);
    var m = Math.floor(seconds % 3600 / 60);
    var s = seconds % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function updateTimeline() {
    if (!current || current.isLive) return;
    var position = Math.floor(scrubbing ? Number(el('seek').value) : playback.position);
    var duration = Math.floor(playback.duration);
    var state = playback.ready + ':' + position + ':' + duration + ':' + scrubbing;
    if (timelineState === state) return;
    timelineState = state;
    el('seek').disabled = !playback.ready;
    el('seek').max = duration;
    if (!scrubbing) el('seek').value = position;
    el('seek-progress').max = duration || 1;
    el('seek-progress').value = position;
    var elapsed = formatTime(position), total = formatTime(duration);
    el('elapsed').textContent = elapsed;
    el('duration').textContent = total;
    el('seek').setAttribute('aria-valuetext', elapsed + ' z ' + total);
  }
  el('channel-form').addEventListener('submit', function (event) { event.preventDefault(); startChannel(input.value, true); });
  el('recordings').addEventListener('click', function () { startChannel(input.value, false); });
  el('catalog-back').addEventListener('click', goHome);
  function turnRecentPage(delta) {
    cancelRecentStatus(); recentPage += delta; renderRecents();
    if (recentButtons[0]) recentButtons[0].focus();
    refreshRecentStatus();
  }
  el('recent-previous').addEventListener('click', function () { turnRecentPage(-1); });
  el('recent-next').addEventListener('click', function () { turnRecentPage(1); });
  el('catalog-retry').addEventListener('click', function () { startChannel(input.value, false); });
  function turnPage(delta) { page += delta; renderVideos(); if (videoButtons[0]) videoButtons[0].focus(); }
  el('previous-page').addEventListener('click', function () { turnPage(-1); });
  el('next-page').addEventListener('click', function () { turnPage(1); });
  el('back').addEventListener('click', goHome);
  el('live').addEventListener('click', function () { if (catalog) startVideo(catalog.live); });
  el('watch-recordings').addEventListener('click', showCatalog);
  el('toggle').addEventListener('click', toggle);
  el('seek').addEventListener('input', function () { scrubbing = true; updateTimeline(); showControls(); });
  el('seek').addEventListener('change', function () {
    player.seekTo(Number(el('seek').value));
    scrubbing = false;
    updateTimeline();
    showControls();
  });
  el('seek').addEventListener('blur', function () { scrubbing = false; if (!hidingControls) showControls(); });
  el('watch').addEventListener('mousemove', showControls);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      cancelRecentStatus();
      var interrupted = !!request;
      cancelRequest();
      preparing = false;
      el('toggle').disabled = false;
      clearTimeout(controlsTimer);
      if (current) player.suspend();
      else if (interrupted && screen === 'catalog') {
        el('channel-status').textContent = 'Načítání bylo přerušeno. Zvolte Zkusit znovu.';
        el('catalog-retry').hidden = false;
      }
    } else if (current) { showControls(); el('toggle').focus(); }
    else if (screen === 'home') refreshRecentStatus();
  });
  window.addEventListener('pagehide', function () { cancelRecentStatus(); cancelRequest(); player.suspend(); });
  window.addEventListener('online', refreshRecentStatus);
  document.addEventListener('keydown', function (event) {
    var key = event.keyCode;
    if (key === 461 || key === 27) {
      event.preventDefault();
      if (screen === 'watch') showCatalog();
      else if (screen === 'catalog') goHome();
      else if (typeof webOSSystem !== 'undefined') webOSSystem.platformBack();
      return;
    }
    if (screen === 'watch') {
      if ((key === 37 || key === 39) && current && !current.isLive &&
        (event.target === el('watch') || event.target === el('seek'))) {
        event.preventDefault();
        scrubbing = false;
        seek(key === 37 ? -10 : 10);
        updateTimeline();
        el('seek').focus();
        return;
      }
      if (key === 415 || key === 19 || key === 179 || (key === 13 && (event.target === el('watch') || event.target === el('seek')))) {
        event.preventDefault();
        if (preparing) return;
        if (key === 415) { if (playback.phase === 'idle' && current) player.load(current); else player.play(); }
        else if (key === 19) player.pause(); else toggle();
        showControls();
        return;
      }
      if (key === 412 || key === 417) { event.preventDefault(); seek(key === 412 ? -10 : 10); return; }
      if (key >= 37 && key <= 40) showControls();
    }
    var controls = screen === 'home' ? [input, el('play'), el('recordings')].concat(recentControls,
      el('recent-pages').hidden ? [] : [el('recent-previous'), el('recent-next')]) :
      screen === 'catalog' ? (el('live').hidden ? [] : [el('live')]).concat(videoButtons,
        el('catalog-retry').hidden ? [] : [el('catalog-retry')],
        el('pages').hidden ? [] : [el('previous-page'), el('next-page')].filter(function (b) { return !b.disabled; }), [el('catalog-back')]) :
      (current && current.isLive ? [] : [el('seek')]).concat([el('toggle'), el('watch-recordings'), el('back')]);
    controls = controls.filter(function (control) { return !control.disabled; });
    var index = controls.indexOf(event.target);
    var recentIndex = recentControls.indexOf(event.target);
    if (screen === 'home' && recentIndex >= 0 && (key === 38 || key === 40)) {
      event.preventDefault();
      var rowTarget = recentIndex + (key === 38 ? -2 : 2);
      (rowTarget < 0 ? el('recordings') : recentControls[rowTarget] ||
        (!el('recent-next').disabled ? el('recent-next') : recentControls[recentIndex])).focus();
      return;
    }
    var cardIndex = videoButtons.indexOf(event.target);
    if (screen === 'catalog' && cardIndex >= 0 && (key === 38 || key === 40)) {
      event.preventDefault();
      var columns = window.innerWidth <= 560 ? 1 : window.innerWidth <= 800 ? 2 : 3;
      var card = cardIndex + (key === 38 ? -columns : columns);
      var target = card < 0 ? (el('live').hidden ? el('catalog-back') : el('live')) :
        card >= videoButtons.length ? (!el('pages').hidden && !el('next-page').disabled ? el('next-page') : el('catalog-back')) : videoButtons[card];
      target.focus(); target.scrollIntoView({ block: 'nearest' }); return;
    }
    if (key >= 37 && key <= 40) {
      if (event.target === input && (key === 37 || key === 39)) return;
      event.preventDefault();
      var next = index < 0 ? 0 : Math.max(0, Math.min(controls.length - 1, index + (key === 37 || key === 38 ? -1 : 1)));
      if (!controls[next]) return;
      controls[next].focus();
      if (screen === 'catalog') controls[next].scrollIntoView({ block: 'nearest' });
    }
  });
  try {
    var rawHistory = localStorage.getItem('kick-watched-videos') || '[]';
    var savedHistory = rawHistory.length <= 100000 ? JSON.parse(rawHistory) : [];
    if (Array.isArray(savedHistory)) savedHistory.slice(0, 200).forEach(function (entry) {
      if (!entry || typeof entry.key !== 'string' || !/^[a-z0-9_-]{1,25}:[a-z0-9-]{1,64}$/.test(entry.key) ||
        typeof entry.position !== 'number' || !isFinite(entry.position) || entry.position <= 0 || entry.position > 2592000 ||
        typeof entry.duration !== 'number' || !isFinite(entry.duration) || entry.duration < 0 || entry.duration > 2592000 ||
        typeof entry.finished !== 'boolean' || watched.some(function (other) { return other.key === entry.key; })) return;
      watched.push({ key: entry.key, position: entry.position, duration: entry.duration, finished: entry.finished });
    });
  } catch (e) { /* Ignore corrupt or unavailable replay history. */ }
  try {
    var rawRecent = localStorage.getItem('kick-recent-channels') || '[]';
    var saved = rawRecent.length <= 2048 ? JSON.parse(rawRecent) : [];
    if (Array.isArray(saved)) saved.forEach(function (value) {
      var name = kickChannel(value);
      if (name && recents.indexOf(name) === -1 && recents.length < 50) recents.push(name);
    });
  } catch (e) { /* Ignore corrupt or unavailable storage. */ }
  if (!recents.length) {
    try { var last = kickChannel(localStorage.getItem('kick-channel')); if (last) recents.push(last); }
    catch (e) { /* Optional migration. */ }
  }
  input.value = recents[0] || '';
  renderRecents();
  setScreen('home');
  (recentButtons[0] || input).focus();
}());
