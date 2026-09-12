'use strict';
var https = require('https');
var parseURL = require('url').parse;
var Service = require('webos-service');
var service = new Service('cz.jirak.kicktv.service');
var pending = Object.create(null);
var activeRequests = 0;

function respond(message, data) {
  try { message.respond(data); } catch (e) { /* The requesting app may have closed. */ }
}

function imageURL(value) {
  if (value && typeof value === 'object') value = value.src || value.url;
  return typeof value === 'string' && value.length < 2048 &&
    /^https:\/\/(?:files|images)\.kick\.com\/[^\s#]+$/.test(value) ? value : '';
}

function mediaURL(value) {
  return typeof value === 'string' && value.length < 4096 &&
    /^https:\/\/(?:stream\.kick\.com|(?:[a-z0-9-]+\.)+live-video\.net)\/[^\s?#]+\.m3u8(?:\?[^\s#]*)?$/.test(value) ? value : '';
}

function getText(hostname, path) {
  var key = hostname + path;
  if (pending[key]) return pending[key];
  if (activeRequests >= 6) return Promise.reject(new Error('Probíhá jiné načítání. Zkuste to za chvíli znovu.'));
  activeRequests++;
  var work = new Promise(function (resolve, reject) {
    var completed = false;
    var timer;
    function finish(error, data) {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(data);
    }
    // No caller-supplied host, redirects, credentials, or disabled TLS checks.
    var req = https.get({ hostname: hostname, path: path,
      headers: { Accept: '*/*', 'Cache-Control': 'no-cache' } }, function (res) {
      if (res.statusCode !== 200) {
        res.resume();
        finish(new Error('Kick API: HTTP ' + res.statusCode));
        return;
      }
      var body = '', bytes = 0;
      res.setEncoding('utf8');
      res.on('data', function (chunk) {
        if (completed) return;
        bytes += Buffer.byteLength(chunk, 'utf8');
        body += chunk;
        if (bytes > 1048576) {
          finish(new Error('Odpověď Kicku je příliš velká.'));
          req.abort();
        }
      });
      res.on('error', finish);
      res.on('aborted', function () { finish(new Error('Přenos dat se přerušil. Zkuste to znovu.')); });
      res.on('end', function () {
        finish(null, body);
      });
    });
    req.on('error', function () { finish(new Error('Nepodařilo se připojit ke Kicku.')); });
    timer = setTimeout(function () {
      finish(new Error('Kick neodpověděl včas. Zkuste to znovu.'));
      req.abort();
    }, 12000);
  });
  pending[key] = work.then(function (data) {
    activeRequests--; delete pending[key]; return data;
  }, function (error) {
    activeRequests--; delete pending[key]; throw error;
  });
  return pending[key];
}

function getJSON(path) {
  return getText('kick.com', '/api/v2/channels/' + path).then(function (body) {
    try { return JSON.parse(body); }
    catch (e) { throw new Error('Kick vrátil neplatná data.'); }
  });
}

service.register('prepare', function (message) {
  var source = mediaURL(message.payload && message.payload.url);
  if (!source) {
    respond(message, { returnValue: false, errorText: 'Nepovolená adresa videa.' });
    return;
  }
  var url = parseURL(source);
  getText(url.hostname, url.path).then(function (body) {
    if (body.trim().indexOf('#EXTM3U') !== 0) throw new Error('Neplatný playlist videa.');
    var variants = [];
    body.split(/\r?\n/).forEach(function (line) {
      if (line.indexOf('#EXT-X-STREAM-INF:') !== 0) return;
      var size = line.match(/(?:[:,])RESOLUTION=(\d+)x(\d+)/);
      var bps = line.match(/(?:[:,])BANDWIDTH=(\d+)/);
      var fps = line.match(/(?:[:,])FRAME-RATE=([\d.]+)/);
      if (size && bps && +size[1] > 0 && +size[2] > 0 && +bps[1] > 0 && +bps[1] <= 200000000 && +size[1] <= 3840 && +size[2] <= 2160) {
        variants.push({ width: +size[1], height: +size[2], bitrate: +bps[1], fps: fps ? +fps[1] : 0 });
      }
    });
    variants.sort(function (a, b) { return b.height - a.height || b.width - a.width || b.fps - a.fps || b.bitrate - a.bitrate; });
    // Keep the master playlist: webOS handles grouped audio and network adaptation.
    respond(message, { returnValue: true, best: variants[0] || null });
  }).catch(function (e) { respond(message, { returnValue: false, errorText: e.message }); });
});

service.register('channel', function (message) {
  var slug = message.payload && message.payload.channel;
  if (typeof slug !== 'string' || !/^[a-z0-9_-]{1,25}$/.test(slug)) {
    respond(message, { returnValue: false, errorText: 'Neplatný název kanálu.' });
    return;
  }
  Promise.all([getJSON(slug), getJSON(slug + '/videos').catch(function (e) {
    return { error: e.message };
  })]).then(function (results) {
    var channel = results[0];
    if (!channel || channel.slug !== slug) throw new Error('Kick nevrátil požadovaný kanál.');
    var live = channel.livestream;
    var source = mediaURL(channel.playback_url);
    var recordings = results[1];
    var videos = Array.isArray(recordings) ? recordings.filter(function (v) {
      return v && !v.is_live && v.video && v.video.is_private === false &&
        !v.video.deleted_at && !v.video.is_pruned && v.video.status === 'public' && mediaURL(v.source);
    }).slice(0, 30).map(function (v) {
      var length = Number(v.duration);
      return { title: String(v.session_title || 'Záznam').slice(0, 200),
        url: mediaURL(v.source), date: String(v.created_at || '').slice(0, 10),
        thumbnail: imageURL(v.thumbnail),
        duration: isFinite(length) && length > 0 ? Math.min(length / 1000, 2592000) : 0 };
    }) : [];
    respond(message, { returnValue: true, channel: slug,
      live: live && live.is_live === true && source ? {
        title: String(live.session_title || slug).slice(0, 200), url: source, isLive: true
      } : null,
      videos: videos,
      videosError: Array.isArray(recordings) ? '' : ((recordings && recordings.error) || 'Seznam záznamů není dostupný.') });
  }).catch(function (e) {
    respond(message, { returnValue: false, errorText: e.message });
  });
});
