'use strict';
var https = require('https');
var zlib = require('zlib');
var URL = require('url').URL;
var Service = require('webos-service');
var service = new Service('cz.jirak.kicktv.service');
var pending = Object.create(null);
var activeRequests = 0;
// Reuse TLS connections between channel, replay and status lookups on the same host.
var agent = new https.Agent({ keepAlive: true, keepAliveMsecs: 15000, maxSockets: 6, maxFreeSockets: 2 });

function titleText(value, fallback) {
  // Limit Unicode code points, never half of an emoji's UTF-16 surrogate pair.
  return Array.from(String(value || fallback || '').normalize('NFKC')).slice(0, 200).join('');
}

// Errors carry a stable code that the app translates; the message is an English fallback.
function failure(code, message, params) {
  var error = new Error(message);
  error.code = code;
  error.params = params || {};
  return error;
}

function errorReply(error) {
  // Only failure() errors carry a code; any other exception maps to a fixed internal code.
  var known = error && typeof error.code === 'string' && error.params;
  return { returnValue: false, errorCode: known ? error.code : 'internal', errorParams: known ? error.params : {},
    errorText: known ? error.message : 'The data from Kick could not be processed.' };
}

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

function getText(hostname, path, background) {
  var key = hostname + path;
  if (pending[key]) return pending[key];
  // Background status checks leave two request slots for opening a channel/video.
  if (activeRequests >= (background ? 4 : 6)) return Promise.reject(failure('busy', 'Another request is in progress. Try again shortly.'));
  activeRequests++;
  var work = new Promise(function (resolve, reject) {
    var completed = false, retried = false;
    var timer, req = null, inflater = null;
    function finish(error, data) {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      if (inflater && typeof inflater.destroy === 'function') { try { inflater.destroy(); } catch (e) { /* Already destroyed. */ } }
      if (error) {
        if (req) req.abort();
        reject(error);
      } else resolve(data);
    }
    function attempt() {
      var responded = false;
      // No caller-supplied host, redirects, credentials, or disabled TLS checks.
      req = https.get({ hostname: hostname, path: path, agent: agent,
        headers: { Accept: '*/*', 'Accept-Encoding': 'gzip', 'Cache-Control': 'no-cache' } }, function (res) {
        responded = true;
        if (res.statusCode !== 200) {
          finish(failure('http', 'Kick API: HTTP ' + res.statusCode, { status: res.statusCode }));
          return;
        }
        var encoding = String(res.headers && res.headers['content-encoding'] || '').trim().toLowerCase();
        var body = '', bytes = 0;
        var stream = res;
        if (encoding === 'gzip' || encoding === 'x-gzip') {
          // Compressed transfers are inflated incrementally with backpressure; the 1 MiB limit applies to inflated text.
          inflater = stream = zlib.createGunzip();
          inflater.on('error', function () { finish(failure('decode', 'The response from Kick could not be decoded.')); });
          res.pipe(inflater);
        } else if (encoding && encoding !== 'identity') {
          finish(failure('decode', 'Unsupported content encoding.'));
          return;
        }
        stream.setEncoding('utf8');
        stream.on('data', function (chunk) {
          if (completed) return;
          bytes += Buffer.byteLength(chunk, 'utf8');
          if (bytes > 1048576) {
            finish(failure('too_large', 'The response from Kick is too large.'));
          } else body += chunk;
        });
        res.on('error', function (error) { finish(failure('transfer', error && error.message || 'Transfer failed.')); });
        res.on('aborted', function () { finish(failure('aborted', 'The transfer was interrupted. Try again.')); });
        stream.on('end', function () {
          finish(null, body);
        });
      });
      req.on('error', function (error) {
        // A kept-alive socket may have been closed by the server; retry once on a fresh connection.
        var reset = error && (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.message === 'socket hang up');
        if (!completed && !responded && !retried && reset) { retried = true; attempt(); return; }
        finish(failure('connect', 'Could not connect to Kick.'));
      });
    }
    attempt();
    timer = setTimeout(function () {
      finish(failure('timeout', 'Kick did not respond in time. Try again.'));
    }, 12000);
  });
  pending[key] = work.then(function (data) {
    activeRequests--; delete pending[key]; return data;
  }, function (error) {
    activeRequests--; delete pending[key]; throw error;
  });
  return pending[key];
}

function getJSON(path, background) {
  return getText('kick.com', '/api/v2/channels/' + path, background).then(function (body) {
    try { return JSON.parse(body); }
    catch (e) { throw failure('invalid_data', 'Kick returned invalid data.'); }
  });
}

service.register('statuses', function (message) {
  var channels = message.payload && message.payload.channels;
  if (!Array.isArray(channels) || !channels.length || channels.length > 6 || channels.some(function (name, i) {
    return typeof name !== 'string' || !/^[a-z0-9_-]{1,25}$/.test(name) || channels.indexOf(name) !== i;
  })) {
    respond(message, errorReply(failure('invalid_channels', 'Invalid channel list.'))); return;
  }
  var next = 0, statuses = [];
  function worker() {
    var index = next++;
    if (index >= channels.length) return Promise.resolve();
    var name = channels[index];
    return getJSON(name, true).then(function (channel) {
      if (!channel || channel.slug !== name) throw new Error('channel');
      statuses[index] = { channel: name, live: !!(channel.livestream && channel.livestream.is_live === true) };
    }).catch(function () { statuses[index] = { channel: name, live: null }; }).then(worker);
  }
  Promise.all([worker(), worker()]).then(function () {
    respond(message, { returnValue: true, statuses: statuses });
  }).catch(function () { respond(message, errorReply(failure('statuses_unavailable', 'Channel status is not available.'))); });
});

service.register('prepare', function (message) {
  var source = mediaURL(message.payload && message.payload.url);
  if (!source) {
    respond(message, errorReply(failure('bad_url', 'Video address not allowed.')));
    return;
  }
  // mediaURL already restricted the origin; the WHATWG parser percent-encodes unsafe path characters.
  var url = new URL(source);
  getText(url.hostname, url.pathname + url.search).then(function (body) {
    if (body.trim().indexOf('#EXTM3U') !== 0) throw failure('bad_playlist', 'Invalid video playlist.');
    var variants = [];
    body.split(/\r?\n/).forEach(function (line) {
      if (line.indexOf('#EXT-X-STREAM-INF:') !== 0) return;
      var size = line.match(/(?:[:,])RESOLUTION=(\d+)x(\d+)/);
      var bps = line.match(/(?:[:,])BANDWIDTH=(\d+)/);
      var fps = line.match(/(?:[:,])FRAME-RATE=([\d.]+)/);
      if (size && bps && +size[1] > 0 && +size[2] > 0 && +bps[1] > 0 && +bps[1] <= 200000000 && +size[1] <= 3840 && +size[2] <= 2160) {
        var rate = fps ? +fps[1] : 0;
        variants.push({ width: +size[1], height: +size[2], bitrate: +bps[1], fps: isFinite(rate) && rate > 0 && rate <= 240 ? rate : 0 });
      }
    });
    variants.sort(function (a, b) { return b.height - a.height || b.width - a.width || b.fps - a.fps || b.bitrate - a.bitrate; });
    // Keep the master playlist: webOS handles grouped audio and network adaptation.
    respond(message, { returnValue: true, best: variants[0] || null });
  }).catch(function (e) { respond(message, errorReply(e)); });
});

service.register('channel', function (message) {
  var slug = message.payload && message.payload.channel;
  if (typeof slug !== 'string' || !/^[a-z0-9_-]{1,25}$/.test(slug)) {
    respond(message, errorReply(failure('invalid_channel', 'Invalid channel name.')));
    return;
  }
  // A private marker distinguishes an internal replay-list failure from any object Kick might return.
  var failedVideos = {};
  Promise.all([getJSON(slug), getJSON(slug + '/videos').catch(function (e) {
    return { marker: failedVideos, error: e };
  })]).then(function (results) {
    var channel = results[0];
    if (!channel || channel.slug !== slug) throw failure('wrong_channel', 'Kick did not return the requested channel.');
    var live = channel.livestream;
    var source = mediaURL(channel.playback_url);
    var recordings = results[1];
    var videos = Array.isArray(recordings) ? recordings.filter(function (v) {
      return v && !v.is_live && v.video && v.video.is_private === false &&
        !v.video.deleted_at && !v.video.is_pruned && v.video.status === 'public' && mediaURL(v.source);
    }).slice(0, 30).map(function (v) {
      var length = Number(v.duration);
      var id = String(v.video.uuid || v.video.id || v.id || '');
      // An empty title lets the app supply its localized "Replay" label.
      return { id: /^[a-z0-9-]{1,64}$/.test(id) ? id : '', title: titleText(v.session_title, ''),
        url: mediaURL(v.source), date: String(v.created_at || '').slice(0, 10),
        thumbnail: imageURL(v.thumbnail),
        duration: isFinite(length) && length > 0 ? Math.min(length / 1000, 2592000) : 0 };
    }) : [];
    var videosError = Array.isArray(recordings) ? null :
      recordings && recordings.marker === failedVideos ? recordings.error : failure('videos_unavailable', 'The replay list is not available.');
    respond(message, { returnValue: true, channel: slug,
      live: live && live.is_live === true && source ? {
        title: titleText(live.session_title, slug), url: source, isLive: true
      } : null,
      videos: videos,
      videosError: videosError ? errorReply(videosError) : null });
  }).catch(function (e) {
    respond(message, errorReply(e));
  });
});
