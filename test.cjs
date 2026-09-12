const assert = require('node:assert/strict');
const channel = require('./app/app.js');

for (const [input, expected] of [
  ['  My_Channel-1  ', 'my_channel-1'],
  ['https://kick.com/Example/', 'example'],
  ['kick.com/example', 'example'],
  ['https://www.kick.com/example', 'example'],
  ['a'.repeat(25), 'a'.repeat(25)]
]) assert.equal(channel(input), expected);

for (const input of [null, {}, '', ' ', 'a'.repeat(26), 'foo bar',
  'https://evil.test/example', 'https://kick.com.evil.test/example',
  'https://kick.com@evil.test/example', '//evil.test/example',
  'https://kick.com/example/video', 'https://kick.com/example?x=1',
  'https://kick.com/%2e%2e', '../example', '<script>', 'foo&muted=true',
  'javascript:alert(1)', 'https://kick.com/example#fragment'
]) assert.equal(channel(input), '', String(input));

console.log('Channel validation: passed (valid names, links, length, URL injection).');

const vm = require('node:vm');
const fs = require('node:fs');
const appVersion=JSON.parse(fs.readFileSync('app/appinfo.json','utf8')).version;
assert.equal(fs.readFileSync('app/index.html','utf8').match(/id="app-version">v([^<]+)</)[1],appVersion,'Footer must match the packaged app version');
let elements, document, window, navigator, bridges, timers, clock, created, textWrites;
function element(id = '') {
  return {
    id, hidden: false, disabled: false, value: '', _text: '', children: [], attrs: {}, handlers: {},
    get textContent(){return this._text+this.children.map(c=>c.textContent).join('');},
    set textContent(value){textWrites[id]=(textWrites[id]||0)+1;this._text=String(value);this.children.forEach(c=>{c.parentNode=null;});this.children=[];},
    paused: true, _time: 0, duration: 300, readyState: 0, seeking: false, seeks: [],
    get currentTime() { return this._time; },
    set currentTime(value) { this._time = value; this.seeks.push(value); this.seeking = true; },
    get firstChild() { return this.children[0]; },
    appendChild(child) { this.children.push(child); child.parentNode = this; if (child.id) elements[child.id] = child; },
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; },
    setAttribute(name, value) { this.attrs[name] = value; },
    removeAttribute(name) { delete this.attrs[name]; },
    addEventListener(name, fn) { this.handlers[name] = fn; },
    focus() {
      const old = document.activeElement;
      document.activeElement = this;
      if (old !== this && old?.handlers.blur) old.handlers.blur();
    },
    scrollIntoView() {},
    pause() { const changed = !this.paused; this.paused = true; if (changed) this.handlers.pause?.(); },
    play() { this.paused = false; return { then: (resolve,reject) => { this.rejectPlay = reject; } }; },
    load() {}
  };
}
const stored = new Map();
const storage = {getItem(key){return stored.get(key)||null;},setItem(key,value){stored.set(key,value);}};
function boot(localStorage = storage, bridgeMode = 'ok', locale = 'cs-CZ') {
  elements = {}; bridges = []; timers = new Map(); clock = 1000; created = {}; textWrites = {};
  document = {hidden:false,activeElement:null,handlers:{},
    getElementById(id){return elements[id];},createElement(tag){created[tag]=(created[tag]||0)+1;return element();},
    addEventListener(name,fn){this.handlers[name]=fn;}};
  for(const [,id] of fs.readFileSync('app/index.html','utf8').matchAll(/id="([^"]+)"/g)) elements[id]=element(id);
  window={innerWidth:1920,handlers:{},addEventListener(name,fn){this.handlers[name]=fn;},scrollTo(){}};
  navigator={onLine:true,language:locale};
  const context={document,window,navigator,localStorage,Date:{now:()=>clock},webOSSystem:{locale,platformBack(){}},
    setTimeout(fn,ms){const id={};timers.set(id,{fn,ms,at:clock+ms});return id;},clearTimeout(id){timers.delete(id);}};
  if(bridgeMode!=='missing')context.PalmServiceBridge=function(){
    if(bridgeMode==='throw')throw Error('bridge unavailable');
    bridges.push(this);
    this.call=(uri,payload)=>{this.uri=uri;this.payload=JSON.parse(payload);};
    this.cancel=()=>{this.cancelled=true;};
  };
  if(locale===null){delete context.webOSSystem;delete navigator.language;}
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('app/i18n.js','utf8'),context);
  vm.runInContext(fs.readFileSync('app/player.js','utf8'),context);
  vm.runInContext(fs.readFileSync('app/app.js','utf8'),context);
}
function advance(ms) {
  const until=clock+ms;let steps=0;
  while(true){
    const next=[...timers.entries()].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];
    if(!next)break;
    assert.ok(++steps<1000,'Timers must remain bounded');
    timers.delete(next[0]);clock=next[1].at;next[1].fn();
  }
  clock=until;
}
const vod={title:'Záznam',url:'https://stream.kick.com/a/master.m3u8',date:'2026-09-12',duration:600};
const live={title:'Živý stream',url:'https://abc.us-west-2.playback.live-video.net/a/master.m3u8',isLive:true};
function node(){return elements['video-host'].firstChild;}
function videoSource(){return node()?.firstChild?.attrs.src;}
function options(){return JSON.parse(decodeURI(node().firstChild.attrs.type.split('mediaOption=')[1]));}
function ready(){const v=node();v.readyState=2;v.handlers.loadedmetadata();v.handlers.loadeddata();if(!v.paused)v.handlers.playing();}
function seeked(){node().seeking=false;node().handlers.seeked();}
function qualityResponse(){bridges.at(-1).onservicecallback(JSON.stringify({returnValue:true,best:{width:1920,height:1080,fps:60,bitrate:7000000}}));}
function respond(data={},prepare=true){
  bridges.at(-1).onservicecallback(JSON.stringify({returnValue:true,channel:elements.channel.value,live,videos:[vod],videosError:'',...data}));
  if(prepare&&bridges.at(-1)?.uri.endsWith('/prepare')&&!bridges.at(-1).cancelled){qualityResponse();ready();}
}
function submit(value){elements.channel.value=value;elements['channel-form'].handlers.submit({preventDefault(){}});}
function click(id){elements[id].handlers.click();}
function key(keyCode){document.handlers.keydown({keyCode,target:document.activeElement,preventDefault(){}});}
function names(){return elements['recent-channels'].children.map(row=>row.firstChild.firstChild.textContent);}
function startVOD(){click('watch-recordings');elements.videos.firstChild.handlers.click();qualityResponse();ready();}

boot({getItem(){throw Error('Denied');},setItem(){throw Error('Full');}});
submit('https://evil.test/channel');assert.equal(bridges.length,0);
navigator.onLine=false;submit('example');assert.match(elements.error.textContent,/internetu/);
navigator.onLine=true;submit('example');respond();
assert.equal(videoSource(),live.url);assert.equal(node().muted,false);assert.equal(node().volume,1);
assert.deepEqual(names(),['example']);assert.match(elements.quality.textContent,/1080p/);
assert.equal(options().option.adaptiveStreaming.maxHeight,2160);
assert.equal(options().option.adaptiveStreaming.bps.start,7000000);
advance(6000);assert.equal(elements.back.hidden,true);assert.equal(elements['playback-controls'].hidden,true);
key(40);assert.equal(elements.back.hidden,false);
click('toggle');assert.equal(node().paused,true);click('toggle');assert.equal(node().paused,false);
node().handlers.playing();
const oldLive=node();document.hidden=true;document.handlers.visibilitychange();
assert.equal(videoSource(),undefined,'No decoder or background audio after leaving');
document.hidden=false;document.handlers.visibilitychange();assert.equal(videoSource(),undefined);
click('toggle');ready();assert.equal(videoSource(),live.url);
oldLive.handlers.error();oldLive.rejectPlay({name:'NotAllowedError'});
assert.equal(elements['playback-status'].hidden,true,'Old media callbacks cannot change current playback');
startVOD();assert.equal(videoSource(),vod.url);
assert.equal(elements.timeline.hidden,false);
// Repeated seek keys are debounced, accumulate, and never overlap native seeks.
elements.watch.focus();key(39);key(39);key(39);advance(299);
assert.equal(node().seeks.length,0);
advance(1);assert.deepEqual(node().seeks,[30]);
key(39);advance(300);assert.deepEqual(node().seeks,[30]);
seeked();assert.deepEqual(node().seeks,[30,40]);seeked();
key(37);advance(300);seeked();assert.equal(node().currentTime,30);
click('toggle');assert.equal(node().paused,true);
elements.seek.value=180;elements.seek.handlers.input();assert.equal(elements.elapsed.textContent,'3:00');
assert.equal(node().currentTime,30,'Pointer drag only previews');
elements.seek.handlers.change();advance(300);seeked();assert.equal(node().currentTime,180);
assert.equal(node().paused,true,'Seeking preserves pause intent');
click('toggle');node().handlers.playing();elements.seek.focus();advance(6000);
assert.equal(elements.back.hidden,true);assert.equal(elements['playback-controls'].hidden,true,'Timeline blur cannot reopen hidden controls');
// Preserve position through visibility changes using native start time, avoiding an early seek.
node()._time=180;node().handlers.timeupdate();
document.hidden=true;document.handlers.visibilitychange();document.hidden=false;document.handlers.visibilitychange();
click('toggle');assert.equal(options().option.transmission.playTime.start,180000);ready();
// Decoder recovery retains the requested seek position and has a strict retry limit.
elements.seek.value=220;elements.seek.handlers.change();advance(300);
const broken=node();broken.error={code:3};broken.handlers.error();assert.equal(videoSource(),undefined);
advance(600);assert.notEqual(node(),broken);assert.equal(options().option.transmission.playTime.start,220000);
broken.handlers.playing();assert.match(elements['playback-status'].textContent,/Načítání/);
node().error={code:3};node().handlers.error();advance(600);
node().error={code:3};node().handlers.error();advance(60000);
assert.equal(videoSource(),undefined);assert.match(elements['playback-status'].textContent,/chyba 3/);
assert.equal(elements.toggle.textContent,'Zkusit znovu');click('toggle');assert.equal(videoSource(),vod.url);ready();
// Back cancels every retry and pending seek; no later callback can resurrect a decoder.
node().error={code:3};node().handlers.error();key(461);advance(30000);
assert.equal(videoSource(),undefined);assert.equal(elements.catalog.hidden,false);
key(461);assert.equal(elements.home.hidden,false);
submit('offline-channel');respond({live:null});assert.equal(videoSource(),undefined);
assert.equal(elements.catalog.hidden,false);assert.equal(elements.videos.children.length,1);
click('catalog-back');submit('empty-channel');respond({live:null,videos:[]});assert.match(elements['videos-status'].textContent,/nemá/);
click('catalog-back');submit('failed');respond({returnValue:false,errorText:'HTTP 403'});
assert.match(elements['channel-status'].textContent,/403/);assert.equal(elements['catalog-retry'].hidden,false);
click('catalog-back');submit('bad-data');bridges.at(-1).onservicecallback('null');assert.equal(elements['catalog-retry'].hidden,false);
click('catalog-back');submit('first');const stale=bridges.at(-1);
click('catalog-back');submit('second');respond({live:null});stale.onservicecallback(JSON.stringify({returnValue:true,live,videos:[]}));
assert.equal(videoSource(),undefined);
click('catalog-back');submit('timeout');advance(18000);assert.match(elements['channel-status'].textContent,/neobdržela/);
boot(storage,'missing');submit('example');assert.match(elements['channel-status'].textContent,/služby/);
boot(storage,'throw');submit('example');assert.match(elements['channel-status'].textContent,/nelze spustit/);
boot();submit('example');const interruptedLookup=bridges.at(-1);
document.hidden=true;document.handlers.visibilitychange();document.hidden=false;document.handlers.visibilitychange();
assert.equal(elements['catalog-retry'].hidden,false);assert.match(elements['channel-status'].textContent,/přerušeno/);
interruptedLookup.onservicecallback(JSON.stringify({returnValue:true,live,videos:[]}));assert.equal(videoSource(),undefined);
click('catalog-retry');respond({live:null});assert.equal(elements.videos.children.length,1);
// An OK pressed while manifest preparation is pending must not mount another player.
boot();submit('example');respond({},false);elements.watch.focus();key(13);assert.equal(videoSource(),undefined);
qualityResponse();ready();assert.equal(elements['video-host'].children.length,1);
const count=bridges.length;key(13);key(13);node().handlers.playing();assert.equal(bridges.length,count);
// Both synchronous play failures and stalled streams recover without throwing or looping.
node().play=()=>{throw Error('native failure');};click('toggle');click('toggle');advance(600);
assert.equal(videoSource(),live.url);ready();advance(20000);assert.equal(videoSource(),undefined);advance(600);
assert.equal(videoSource(),live.url);click('back');advance(30000);assert.equal(videoSource(),undefined);
boot();
for(let i=0;i<8;i++){submit('channel-'+i);respond();click('back');}
assert.deepEqual(names(),['channel-7','channel-6','channel-5','channel-4','channel-3','channel-2']);
boot();assert.equal(elements.channel.value,'channel-7');
elements['recent-channels'].children[2].firstChild.handlers.click();respond();assert.equal(names()[0],'channel-5');
window.handlers.pagehide();assert.equal(videoSource(),undefined);
stored.set('kick-channel','legacy');
for(const bad of ['{broken','{}','null','false']){stored.set('kick-recent-channels',bad);boot();assert.deepEqual(names(),['legacy']);}
stored.set('kick-recent-channels',JSON.stringify(['Safe','safe',null,{},'<img>','https://evil.test/a','second']));boot();assert.deepEqual(names(),['safe','second']);
// Pause/resume while the original play promise is pending cannot inherit its rejection.
boot();submit('example');respond();click('toggle');click('toggle');const obsoletePlay=node().rejectPlay;
click('toggle');click('toggle');obsoletePlay({name:'NotAllowedError'});node().handlers.playing();
assert.equal(node().paused,false);assert.equal(elements['playback-status'].hidden,true);
click('back');
// Offline errors stop immediately; retry is an explicit user action.
boot();submit('example');respond();navigator.onLine=false;node().handlers.error();advance(60000);
assert.equal(videoSource(),undefined);assert.match(elements['playback-status'].textContent,/internetu/);
navigator.onLine=true;click('toggle');ready();assert.equal(videoSource(),live.url);
startVOD();node().handlers.ended();advance(60000);assert.equal(elements.toggle.textContent,'Pokračovat');
assert.match(elements['playback-status'].textContent,/skončil/);click('back');click('catalog-back');
// Grid pagination bounds image/DOM load and supports vertical remote navigation.
submit('example');respond({live:null,videos:Array.from({length:14},(_,i)=>({...vod,title:'Video '+i}))});
assert.equal(elements.videos.children.length,6);assert.equal(elements['page-number'].textContent,'1 / 3');
elements.videos.children[0].focus();key(40);assert.equal(document.activeElement,elements.videos.children[3]);
click('next-page');assert.equal(elements['page-number'].textContent,'2 / 3');
click('next-page');assert.equal(elements.videos.children.length,2);assert.equal(elements['next-page'].disabled,true);
console.log('Player and TV UI: passed (serialized seeking, bounded recovery, stale events, stalled/failed media, lifecycle, API failures, history, grid navigation).');

// Replay history follows actual media progress, survives restarts, and never stores signed URLs.
const historyKey='kick-watched-videos', historyData=new Map();let historyWrites=0;
const historyStorage={getItem:k=>historyData.get(k)||null,setItem(k,v){if(k===historyKey)historyWrites++;historyData.set(k,v);}};
const replayA={...vod,id:'replay-a'}, replayB={...vod,id:'replay-b',url:'https://stream.kick.com/b/master.m3u8'};
function openReplay(index=0){elements.videos.children[index].handlers.click();qualityResponse();ready();}
function progressAt(seconds){node()._time=seconds;node().handlers.timeupdate();}
function history(){return JSON.parse(historyData.get(historyKey)||'[]');}
function replayBadge(index,cls){return elements.videos.children[index].firstChild.children.find(c=>c.className===cls);}
boot(historyStorage);submit('astatoro');respond({live:null,videos:[replayA,replayB]});
openReplay();assert.equal(history().length,0,'Loading and playing events alone are not viewing');
click('toggle');elements.seek.value=150;elements.seek.handlers.change();advance(300);seeked();progressAt(150);
assert.equal(history().length,0,'A paused seek does not mark the recording as seen');
click('toggle');progressAt(150.25);assert.equal(history()[0].position,150.25);
assert.equal(history()[0].key,'astatoro:replay-a');assert.equal(historyWrites,1);
advance(3000);progressAt(153.25);assert.equal(historyWrites,1,'Do not write storage on every timeupdate');
click('toggle');assert.equal(history()[0].position,153.25,'Pause flushes the latest played position');
const previousReplay=node();key(461);
assert.equal(replayBadge(0,'last-watched').textContent,'Naposledy sledované');
assert.equal(replayBadge(0,'watched-badge').textContent,'Sledováno · 2:33');
assert.match(elements.videos.firstChild.attrs['aria-label'],/Naposledy sledované, Sledováno/);
assert.equal(replayBadge(1,'watched-badge'),undefined);
openReplay(1);node().handlers.error();key(461);
assert.equal(replayBadge(1,'watched-badge'),undefined,'A failed start is not viewing');
openReplay(1);progressAt(2);advance(1000);progressAt(3);window.handlers.pagehide();
assert.equal(history()[0].key,'astatoro:replay-b');assert.equal(history()[0].position,3);
previousReplay.handlers.timeupdate();assert.equal(history()[0].key,'astatoro:replay-b','Old decoder events cannot reorder history');
assert.ok(history().every(h=>Object.keys(h).sort().join(',')==='duration,finished,key,position'));
boot(historyStorage);submit('astatoro');respond({live:null,videos:[{...replayA,url:replayA.url+'?token=changed'},replayB]});
assert.equal(replayBadge(0,'watched-badge').textContent,'Sledováno · 2:33','Stable IDs survive refreshed stream URLs');
assert.equal(replayBadge(0,'last-watched'),undefined);assert.ok(replayBadge(1,'last-watched'));
openReplay();progressAt(1);node().handlers.ended();key(461);
assert.equal(replayBadge(0,'watched-badge').textContent,'Zhlédnuto');
assert.equal(replayBadge(0,'watched-progress').value,replayBadge(0,'watched-progress').max);
assert.ok(replayBadge(0,'last-watched'));assert.equal(replayBadge(1,'last-watched'),undefined);
click('catalog-back');submit('another');respond({live:null,videos:[replayA]});
assert.equal(replayBadge(0,'watched-badge'),undefined,'Replay identity includes its channel');
click('catalog-back');submit('astatoro');respond({videos:[replayA],live});progressAt(3);key(461);
assert.equal(history()[0].key,'astatoro:replay-a','LIVE does not change replay history');
for(const invalid of ['{broken','null','{}','x'.repeat(100001),JSON.stringify([null,{key:'astatoro:replay-a',position:'1',duration:300,finished:false}])]){
 historyData.set(historyKey,invalid);boot(historyStorage);submit('astatoro');respond({live:null,videos:[replayA]});
 assert.equal(replayBadge(0,'watched-badge'),undefined);
 openReplay();node().handlers.ended();assert.equal(replayBadge(0,'watched-badge'),undefined);
 progressAt(1);key(461);assert.equal(replayBadge(0,'watched-badge'),undefined,'Ended without any playback never marks viewed');
}
historyData.set(historyKey,JSON.stringify(Array.from({length:220},(_,i)=>({key:'astatoro:old-'+i,position:10,duration:300,finished:false}))));
boot(historyStorage);submit('astatoro');respond({live:null,videos:[replayA]});openReplay();progressAt(1);
assert.equal(history().length,200);assert.equal(history()[0].key,'astatoro:replay-a');assert.equal(history().at(-1).key,'astatoro:old-198');
boot({getItem(){throw Error('Denied');},setItem(){throw Error('Quota');}});
submit('astatoro');respond({live:null,videos:[replayA]});openReplay();progressAt(2);document.hidden=true;document.handlers.visibilitychange();
document.hidden=false;document.handlers.visibilitychange();key(461);assert.ok(replayBadge(0,'watched-badge'),'Storage failure preserves this session without crashing');
console.log('Replay history: passed (actual progress, stable IDs, last-viewed badges, completion, restarts, bounded storage and storage failures).');
boot();submit('astatoro');respond({live:null,videos:[{...vod,title:'x'.repeat(199)+'🔴tail'}]});
assert.equal(elements.videos.firstChild.children[1].textContent,'x'.repeat(199)+'🔴','UI title limits preserve complete emoji');
const symbolTitle='🔴ONE🔴TWO🔴 👩🏽‍💻 🇨🇿 🪖Kdo mi bude krýt záda? 778-037 🫡 <img src=x>';
click('catalog-back');submit('astatoro');respond({live:null,videos:[{...vod,title:symbolTitle}]});
const renderedTitle=elements.videos.firstChild.children[1];
assert.equal(renderedTitle.textContent,symbolTitle,'Untrusted titles stay plain text');
assert.deepEqual(renderedTitle.children.filter(c=>c.className==='title-symbol').map(c=>c.textContent),['🔴','🔴','🔴','👩🏽‍💻','🇨🇿','🪖','🫡']);
assert.ok(renderedTitle.children.filter(c=>!c.className).some(c=>c.textContent.includes('778-037 ')),'Text and spaces must stay outside emoji spans');
openReplay();assert.equal(elements['video-title'].textContent,symbolTitle,'Catalog and player use the same symbol rendering');
// The pinned font has locally verified helmet/saluting-face glyphs; retain it in every IPK.
const emojiFont=fs.readFileSync('app/fonts/NotoEmoji-Regular.woff2');
assert.equal(require('node:crypto').createHash('sha256').update(emojiFont).digest('hex'),'72149441d478acb7e5e4fe27adbabde4330f86affed8b3301e4bc4c4d92d53c1');
assert.match(fs.readFileSync('app/fonts/OFL.txt','utf8'),/SIL OPEN FONT LICENSE Version 1.1/);
const css=fs.readFileSync('app/style.css','utf8');
assert.match(css,/\.title-symbol\s*\{[^}]*font-family:[^}]*"Kick Emoji"/);
assert.doesNotMatch(css.match(/body, input, button\s*\{[^}]*\}/)[0],/Emoji/,'Body text must keep its original font metrics');
function fontCovers(family, cp) {
  const face=css.match(/@font-face\s*\{[^}]+\}/g).find(f=>f.includes('"'+family+'"'));
  return face.match(/unicode-range:([^;]+)/)[1].split(',').some(range=>{
    const [start,end]=range.trim().slice(2).split('-').map(n=>parseInt(n,16));
    return cp>=start&&cp<=(end??start);
  });
}
for(let cp=32;cp<127;cp++)assert.equal(fontCovers('Kick Emoji',cp),false,'Ordinary ASCII cannot pick up emoji font metrics');
assert.match(css,/\.title-keycap\s*\{[^}]*"Kick Keycap"/);
for(const cp of [0x23,0x2a,0x31,0x20e3,0xfe0f])assert.ok(fontCovers('Kick Keycap',cp));
assert.match(fs.readFileSync('app/index.html','utf8'),/font-src 'self' file:/,'Packaged local fonts must be allowed by CSP');
// Distinct emoji from 681 public LIVE/replay titles across 35 channels (2026-09-12).
const sampledSymbols=['⚔️','⚠️','⛽','✍️','❌','❣️','🇲🇹','🌊','🌍','🌎','🌞','🌴','🍂','🍦','🍷','🎒','🎓',
 '🏙️','🐌','🐕','🐟','🐠','🐳','👁️','👄','👈','👐','👓','👹','👺','👾','💀','💈','💗','💬','💰','💼',
 '🔥','🔪','🔴','🖌','🖱️','😇','😈','😱','🚀','🚗','🚘','🚬','🛑','🤖','🤗','🤤','🥂','🥡','🥰','🥳',
 '🥵','🥶','🦒','🦲','🧀','🧠','🧡','🧳','🪖','🫡','🫦'];
const compoundSymbols=['❤️‍🔥','🏴‍☠️','✍🏽','👩🏽‍💻','1️⃣','#️⃣','*️⃣','🏴\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f}'];
boot();
for(const symbol of sampledSymbols.concat(compoundSymbols)){
 const title='Český text ¿Qué? 778-037 # * 123 '+symbol+' / '+symbol;
 submit('example');respond({live:null,videos:[{...vod,title}]});
 function checkSymbols(node){
  assert.equal(node.textContent,title);
  const spans=node.children.filter(c=>(c.className||'').split(' ').includes('title-symbol'));
  assert.deepEqual(spans.map(c=>c.textContent),[symbol,symbol],'Keep each repeated emoji sequence intact: '+symbol);
  assert.ok(!node.children[0].className,'Ordinary text, digits and spaces keep the text font');
  const keycap=/^[#*0-9]/.test(symbol);
  for(const span of spans)assert.equal(span.className.includes('title-keycap'),keycap);
  for(const c of symbol)assert.ok(fontCovers(keycap?'Kick Keycap':'Kick Emoji',c.codePointAt(0)),'Fallback CSS covers '+symbol);
 }
 checkSymbols(elements.videos.firstChild.children[1]);
 openReplay();checkSymbols(elements['video-title']);key(461);click('catalog-back');
}
console.log('Title symbols: passed (68 sampled sequences, 8 compound cases, catalog/player isolation and ordinary text spacing).');
const performanceReplays=Array.from({length:30},(_,i)=>({...vod,id:'perf-'+i,thumbnail:'https://files.kick.com/'+i+'.jpg'}));
boot();submit('example');respond({live:null,videos:performanceReplays});
assert.equal(created.img,6,'Render only the six visible thumbnails, once per catalog load');
const perfImages=created.img;
boot();submit('example');respond({videos:performanceReplays});
assert.equal(created.img||0,0,'Autoplay must not construct a hidden catalog');
click('watch-recordings');assert.equal(created.img,6);
openReplay();
const beforeTimeWrites=textWrites.elapsed||0,beforeToggleWrites=textWrites.toggle||0;
for(let i=1;i<=240;i++){node()._time=i/4;node().handlers.timeupdate();}
const timelineWrites=textWrites.elapsed-beforeTimeWrites,toggleWrites=textWrites.toggle-beforeToggleWrites;
assert.ok(timelineWrites<=60,'Timeline text changes at most once per second during continuous playback');
assert.equal(toggleWrites,0,'Steady playback never rewrites the pause label');
assert.equal(elements.elapsed.textContent,'1:00');
assert.equal(elements['seek-progress'].value,60);
click('toggle');assert.equal(elements.toggle.textContent,'Pokračovat','Transitions update immediately');
for(const [width,columns] of [[560,1],[800,2],[1280,3]]){
 boot();window.innerWidth=width;submit('example');respond({live:null,videos:performanceReplays});
 elements.videos.firstChild.focus();key(40);assert.equal(document.activeElement,elements.videos.children[columns]);
}
boot({getItem(key){return key==='kick-recent-channels'?'["'+'x'.repeat(4096)+'"]':null;},setItem(){}});
assert.deepEqual(names(),[],'Oversized recent history is ignored');
submit('example');bridges.at(-1).onservicecallback(' '.repeat(1048577));
assert.match(elements['channel-status'].textContent,/neplatnou/,'Oversized bridge payload fails visibly');
console.log('Performance budgets: '+JSON.stringify({catalogThumbnails:perfImages,timelineTextWritesPerMinute:timelineWrites,pauseLabelWritesDuringPlayback:toggleWrites}));

// Recent channels: page-local status requests, removal, persistence and stale callbacks.
const recentStore=new Map([['kick-recent-channels',JSON.stringify(Array.from({length:50},(_,i)=>'saved-'+i))],['kick-channel','legacy']]);
const recentStorage={getItem:k=>recentStore.get(k)||null,setItem:(k,v)=>recentStore.set(k,v)};
const recentRow=i=>elements['recent-channels'].children[i];
const statusReply=(bridge,live)=>bridge.onservicecallback(JSON.stringify({returnValue:true,statuses:bridge.payload.channels.map(channel=>({channel,live}))}));
boot(recentStorage);
assert.equal(names().length,6);assert.equal(elements['recent-page-number'].textContent,'1 / 9');
assert.equal(bridges[0].payload.channels.length,6);assert.match(bridges[0].uri,/statuses$/);
const obsoleteStatus=bridges[0];click('recent-next');assert.equal(obsoleteStatus.cancelled,true);
statusReply(obsoleteStatus,true);assert.equal(recentRow(0).firstChild.children[1].hidden,true);
statusReply(bridges.at(-1),true);assert.equal(recentRow(0).firstChild.children[1].hidden,false);
assert.match(recentRow(0).firstChild.attrs['aria-label'],/právě vysílá/);
recentRow(0).firstChild.focus();key(39);assert.equal(document.activeElement,recentRow(0).children[1]);
key(40);assert.equal(document.activeElement,recentRow(1).children[1]);
recentRow(0).children[1].handlers.click();assert.equal(names()[0],'saved-7');
assert.equal(JSON.parse(recentStore.get('kick-recent-channels')).includes('saved-6'),false);
assert.equal(document.activeElement,recentRow(0).firstChild);
advance(60000);assert.equal(recentRow(0).firstChild.children[1].hidden,true,'Expired status is hidden while refreshing');
statusReply(bridges.at(-1),false);assert.equal(recentRow(0).firstChild.children[1].hidden,true);
click('recent-previous');const pendingStatus=bridges.at(-1);submit('new-channel');
assert.equal(pendingStatus.cancelled,true);respond({live:null});
assert.equal(JSON.parse(recentStore.get('kick-recent-channels')).length,50);
click('catalog-back');submit('newer-channel');respond({live:null});
assert.equal(JSON.parse(recentStore.get('kick-recent-channels')).length,50);
boot(recentStorage);assert.equal(names()[0],'newer-channel');
for(let i=0;i<8;i++)click('recent-next');
assert.equal(names().length,2);recentRow(1).children[1].handlers.click();recentRow(0).children[1].handlers.click();
assert.equal(elements['recent-page-number'].textContent,'8 / 8','Deleting the final row clamps the page');
recentStore.set('kick-recent-channels','["only"]');boot(recentStorage);
recentRow(0).children[1].handlers.click();assert.equal(elements.recent.hidden,true);assert.equal(document.activeElement,elements.channel);
boot(recentStorage);assert.deepEqual(names(),[],'Deleted channels are not restored by legacy migration');
recentStore.set('kick-recent-channels','["only"]');boot(recentStorage);
bridges.at(-1).onservicecallback('x'.repeat(4097));assert.equal(recentRow(0).firstChild.children[1].hidden,true);
advance(60000);const timeoutStatus=bridges.at(-1);advance(40000);assert.equal(timeoutStatus.cancelled,true);
document.hidden=true;document.handlers.visibilitychange();const hiddenRequests=bridges.length;
advance(120000);assert.equal(bridges.length,hiddenRequests,'No background status polling while hidden');
console.log('Recent channels: passed (50 stored, six per page, LIVE status, expiry, cancellation, removal and restart).');

// UI language follows the TV locale; every language covers every key with identical placeholders.
const i18n=require('./app/i18n.js');
const baseKeys=Object.keys(i18n.strings.en).sort();
const placeholders=text=>(text.match(/\{[a-z]+\}/g)||[]).sort();
assert.ok(i18n.languages.length>=13&&i18n.languages.includes('cs')&&i18n.languages.includes('en'));
for(const lang of i18n.languages){
 assert.deepEqual(Object.keys(i18n.strings[lang]).sort(),baseKeys,lang+' must translate every key');
 for(const key of baseKeys){
  const text=i18n.strings[lang][key];
  assert.ok(typeof text==='string'&&text.length>0&&text.length<=200,lang+'.'+key);
  assert.deepEqual(placeholders(text),placeholders(i18n.strings.en[key]),lang+'.'+key+' placeholders');
  assert.doesNotMatch(text,/[<>]/,'Translations never carry markup');
 }
 const resource=JSON.parse(fs.readFileSync('app/resources/'+lang+'/appinfo.json','utf8'));
 assert.deepEqual(resource,{title:i18n.strings[lang].title,appDescription:i18n.strings[lang].footer_note},'Launcher title for '+lang);
}
assert.equal(fs.readdirSync('app/resources').sort().join(),[...i18n.languages].sort().join(),'No stray launcher resources');
const appinfo=JSON.parse(fs.readFileSync('app/appinfo.json','utf8'));
assert.equal(appinfo.title,i18n.strings.en.title);assert.equal(appinfo.appDescription,i18n.strings.en.footer_note);
for(const [candidates,expected] of [[['cs-CZ'],'cs'],[['sk_SK'],'sk'],[['SK'],'sk'],[['pt-BR'],'pt'],[['zh-Hans-CN','de-AT'],'de'],[['xx'],'en'],[[null,42,{}],'en'],[['a'.repeat(40)],'en'],[[],'en'],[['en-GB','cs'],'en'],[['tr-TR'],'tr'],[['uk'],'uk']])
 assert.equal(i18n.language(candidates),expected,JSON.stringify(candidates));
assert.equal(i18n.detect({webOSSystem:{locale:'de-DE'},navigator:{language:'cs'}}),'de','webOS locale wins');
assert.equal(i18n.detect({PalmSystem:{locale:'sk-SK'},navigator:{language:'cs'}}),'sk');
assert.equal(i18n.detect({navigator:{language:'xx',languages:['yy','pl-PL']}}),'pl');
assert.equal(i18n.detect({}),'en');assert.equal(i18n.detect({get webOSSystem(){throw Error('denied');}}),'en');
const cs=i18n.translator('cs');
assert.equal(cs('p_media_error',{code:3}),'TV nemůže přehrát video (chyba 3).');
assert.equal(cs('svc_http',{}),'Kick API: HTTP {status}');assert.equal(cs('missing_key'),'missing_key');
assert.equal(i18n.translator('xx')('retry'),'Try again');assert.equal(i18n.translator('xx').language,'xx');
boot(storage,'ok','en-US');
assert.equal(elements.heading.textContent,'What will you watch?');assert.equal(elements.channel.attrs.placeholder,'Channel name or kick.com/… link');
assert.equal(elements['play-label'].textContent,'Play live');assert.equal(elements['live-label'].textContent,'Play live');
assert.equal(elements.seek.attrs['aria-label'],'Replay position');assert.equal(elements.toggle.textContent,'Pause');
assert.equal(document.title,'Stream for Kick');
submit('example');respond({live:null,videos:[{...vod,title:''}],videosErrorCode:'videos_unavailable',videosError:'The replay list is not available.'});
assert.equal(elements['channel-status'].textContent,'Offline · Choose one of the replays.');
assert.equal(elements['videos-status'].textContent,'The replay list is not available.');assert.equal(elements['catalog-retry'].hidden,false);
assert.equal(elements.videos.firstChild.children[1].textContent,'Replay','Empty titles use the localized fallback');
assert.match(elements.videos.firstChild.children[2].textContent,/0 h 10 min/);
elements.videos.firstChild.handlers.click();qualityResponse();ready();
assert.equal(elements.quality.textContent,'Highest available: 1080p · 60 fps');
node().handlers.ended();assert.equal(elements['playback-status'].textContent,'The replay has ended. Choose another.');
assert.equal(elements.toggle.textContent,'Resume');
click('toggle');ready();node().error={code:3};node().handlers.error();advance(600);node().error={code:3};node().handlers.error();advance(600);
node().error={code:3};node().handlers.error();advance(600);
assert.equal(elements['playback-status'].textContent,'The TV cannot play this video (error 3). Select Try again or another replay.');
assert.equal(elements.toggle.textContent,'Try again');
click('back');
for(const [reply,expected] of [[{errorCode:'http',errorParams:{status:403},errorText:'Kick API: HTTP 403'},'Kick API: HTTP 403'],
 [{errorCode:'busy',errorText:'x'},'Another download is in progress. Try again in a moment.'],
 [{errorCode:'<script>',errorText:'y'.repeat(500)},'y'.repeat(200)],
 [{errorCode:'not_a_key',errorText:''},'The channel could not be loaded. Try again.'],
 [{errorCode:'http',errorParams:{status:'<b>'.repeat(40)},errorText:''},'Kick API: HTTP {status}'],
 [{errorCode:'http',errorParams:{status:{}},errorText:''},'Kick API: HTTP {status}']]){
 submit('failed');respond({returnValue:false,...reply});assert.equal(elements['channel-status'].textContent,expected);click('catalog-back');
}
navigator.onLine=false;submit('example');assert.equal(elements.error.textContent,'The TV is not connected to the internet. Check the connection.');navigator.onLine=true;
boot(storage,'ok','sk-SK');assert.equal(elements.heading.textContent,'Čo si pustíš?');
submit('failed');respond({returnValue:false,errorCode:'timeout',errorText:'late'});assert.equal(elements['channel-status'].textContent,'Kick neodpovedal včas. Skúste to znova.');
boot(storage,'ok','tlh');assert.equal(elements.heading.textContent,'What will you watch?','Unsupported TV languages fall back to English');
boot(storage,'ok',null);assert.equal(elements.heading.textContent,'What will you watch?','No locale source still renders');
boot(storage,'missing','fr-FR');submit('example');assert.equal(elements['channel-status'].textContent,'La lecture nécessite l’installation de l’application avec son service sur le téléviseur.');
boot();assert.equal(elements.heading.textContent,'Co si pustíš?');
console.log('Localization: passed ('+i18n.languages.length+' languages, key coverage, placeholder parity, locale detection, launcher resources, service error codes).');

async function testService() {
  const {EventEmitter}=require('node:events');
  let handlers={}, calls=[], replies=[], status=200, transport='ok', waiting=[], aborted=0, agents=[];
  const gzip=text=>require('node:zlib').gzipSync(Buffer.from(text,'utf8'));
  const serviceTimers=new Map();
  const responseData={slug:'example',playback_url:live.url,livestream:{is_live:true,session_title:'Live'}};
  const good={is_live:false,source:vod.url,session_title:'Public',duration:60000,thumbnail:{src:'https://files.kick.com/test.jpg'},video:{uuid:'fd0d9069-63ca-42b2-b7b9-4d23134506b1',is_private:false,status:'public'}};
  let recordings=[good,{...good,video:{is_private:true,status:'public'}},{...good,is_live:true},{...good,source:'https://evil.test/x.m3u8'},{...good,video:{is_private:false,status:'public',deleted_at:'now'}}];
  let playlist='#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=7000000,RESOLUTION=1920x1080,FRAME-RATE=60\n1080.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=18000000,RESOLUTION=3840x2160,FRAME-RATE=30\n4k.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=11000000,RESOLUTION=2560x1440,FRAME-RATE=60\n1440.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=90000000,RESOLUTION=7680x4320\n8k.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=200000\naudio.m3u8';
  const https={get(options, callback){
    calls.push(options);
    assert.ok(/^[a-z0-9.-]+$/.test(options.hostname)&&options.path.startsWith('/'),'Host and path are split safely');
    const req=new EventEmitter();req.abort=()=>{aborted++;};
    const deliver=()=>{
      const res=new EventEmitter();res.statusCode=status;res.resume=()=>{};res.setEncoding=()=>{};res.headers={};
      if(transport.startsWith('gzip'))res.headers['content-encoding']='gzip';
      if(transport==='deflate')res.headers['content-encoding']='br';
      callback(res);
      if(transport==='gzip'){const packed=gzip(JSON.stringify(options.path.endsWith('/videos')?recordings:responseData));res.emit('data',packed.subarray(0,5));res.emit('data',packed.subarray(5));res.emit('end');return;}
      if(transport==='gzip-large'){res.emit('data',gzip(' '.repeat(2097152)));res.emit('end');return;}
      if(transport==='gzip-bad'){res.emit('data',Buffer.from('not gzip at all'));res.emit('end');return;}
      if(transport==='deflate'){res.emit('data','{}');res.emit('end');return;}
      if(options.hostname!=='kick.com')assert.equal(options.path,'/a/master.m3u8');
      if(transport==='aborted'){res.emit('aborted');return;}
      if(transport==='response-error'){res.emit('error',Error('response failed'));return;}
      if(transport==='large'){res.emit('data','ž'.repeat(600000));res.emit('end');return;}
      if(transport==='invalid'){res.emit('data','null');res.emit('end');return;}
      res.emit('data',options.hostname==='kick.com' ? JSON.stringify(options.path.endsWith('/videos')?recordings:responseData) : playlist);res.emit('end');
    };
    if(transport==='wait')waiting.push(deliver);else queueMicrotask(deliver);
    return req;
  }};
  function Service(name){assert.equal(name,'cz.jirak.kicktv.service');this.register=(name,fn)=>{handlers[name]=fn;};}
  https.Agent=function(options){agents.push(options);};
  vm.runInNewContext(fs.readFileSync('service/index.js','utf8'),{require(name){return name==='https'?https:name==='url'?require('node:url'):name==='zlib'?require('node:zlib'):Service;},Promise,Buffer,
    setTimeout(fn,ms){assert.equal(ms,12000);const id={};serviceTimers.set(id,fn);return id;},clearTimeout(id){serviceTimers.delete(id);}});
  const send=payload=>handlers.channel({payload,respond(data){replies.push(data);}});
  for(const channel of [undefined,null,'../admin','https://evil.test','foo?bar','A','a'.repeat(26)])send({channel});
  assert.equal(calls.length,0,'Invalid channels never reach the network');
  assert.ok(replies.every(r=>r.returnValue===false));replies=[];
  send({channel:'example'});await new Promise(r=>setImmediate(r));
  assert.equal(replies[0].returnValue,true);assert.equal(replies[0].videos.length,1);
  assert.equal(replies[0].videos[0].thumbnail,'https://files.kick.com/test.jpg');
  assert.equal(replies[0].videos[0].duration,60);assert.equal(replies[0].live.url,live.url);
  assert.equal(replies[0].videos[0].id,good.video.uuid);assert.equal(replies[0].videosErrorCode,'');
  replies=[];recordings=null;send({channel:'example'});await new Promise(r=>setImmediate(r));
  assert.equal(replies[0].videosErrorCode,'videos_unavailable');assert.equal(replies[0].videos.length,0);
  recordings=[good,{...good,session_title:''}];replies=[];send({channel:'example'});await new Promise(r=>setImmediate(r));
  assert.equal(replies[0].videos[1].title,'','Missing titles stay empty for the app to localize');recordings.pop();
  assert.ok(calls.every(c=>c.hostname==='kick.com'&&c.rejectUnauthorized!==false));
  replies=[];good.session_title='🔴ONE🔴TWO🔴 𝕋𝕍 e\u030c';responseData.livestream.session_title=good.session_title;
  send({channel:'example'});await new Promise(r=>setImmediate(r));
  assert.equal(replies[0].videos[0].title,'🔴ONE🔴TWO🔴 TV ě');assert.equal(replies[0].live.title,replies[0].videos[0].title);
  replies=[];good.session_title='x'.repeat(199)+'🔴tail';good.video.uuid='';good.video.id=122451580;
  send({channel:'example'});await new Promise(r=>setImmediate(r));
  assert.equal(replies[0].videos[0].title,'x'.repeat(199)+'🔴','Service truncation never splits a surrogate pair');
  assert.equal(replies[0].videos[0].id,'122451580');
  replies=[];good.video.uuid='<script>';
  send({channel:'example'});await new Promise(r=>setImmediate(r));assert.equal(replies[0].videos[0].id,'');
  replies=[];responseData.livestream=null;send({channel:'example'});await new Promise(r=>setImmediate(r));
  assert.equal(replies[0].live,null);
  replies=[];status=403;send({channel:'example'});await new Promise(r=>setImmediate(r));
  assert.equal(replies[0].returnValue,false);assert.match(replies[0].errorText,/403/);
  assert.equal(replies[0].errorCode,'http');assert.equal(replies[0].errorParams.status,403);
  assert.equal(aborted,2,'Both HTTP error responses release their network connections');
  assert.ok(calls.every(c=>c.headers['Accept-Encoding']==='gzip'&&c.agent instanceof https.Agent),'Requests accept gzip on a keep-alive agent');
  assert.equal(JSON.stringify(agents),JSON.stringify([{keepAlive:true,keepAliveMsecs:15000,maxSockets:6,maxFreeSockets:2}]));
  replies=[];status=200;transport='gzip';send({channel:'example'});await new Promise(r=>setTimeout(r,30));
  assert.equal(replies[0].returnValue,true);assert.equal(replies[0].videos.length,1,'Compressed responses are inflated');
  for(const [mode,code] of [['gzip-large','too_large'],['gzip-bad','decode'],['deflate','decode']]){
    const beforeAborted=aborted;replies=[];transport=mode;send({channel:'example'});
    await new Promise(r=>setTimeout(r,30));
    assert.equal(replies.length,1);assert.equal(replies[0].errorCode,code,mode);assert.equal(replies[0].returnValue,false);
    assert.equal(aborted-beforeAborted,2,mode+' aborts both transfers');
  }
  transport='ok';
  replies=[];status=200;
  handlers.prepare({payload:{url:vod.url},respond(d){replies.push(d);}});
  await new Promise(r=>setImmediate(r));
  assert.equal(replies[0].best.height,2160,'Prefer 4K over 1440p and 1080p; exclude unsupported 8K and audio-only');
  assert.equal(replies[0].best.bitrate,18000000);
  for (const height of [1440,1080]) {
    playlist=playlist.replace(/#EXT-X-STREAM-INF:[^\n]*RESOLUTION=\d+x(\d+)[^\n]*\n[^\n]+\n?/g, (variant,h)=>Number(h)>height?'':variant);
    replies=[];
    handlers.prepare({payload:{url:vod.url},respond(d){replies.push(d);}});
    await new Promise(r=>setImmediate(r));
    assert.equal(replies[0].best.height,height,'Select the next available resolution when higher variants are absent');
  }
  playlist='#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=7000000,RESOLUTION=1920x1080,FRAME-RATE='+('9'.repeat(400))+'\nx.m3u8';
  replies=[];handlers.prepare({payload:{url:vod.url},respond(d){replies.push(d);}});await new Promise(r=>setImmediate(r));
  assert.equal(replies[0].best.fps,0,'Invalid frame rates never reach UI labels');
  const before=calls.length;
  for(const url of ['http://stream.kick.com/x.m3u8','https://stream.kick.com.evil.test/x.m3u8','https://user@stream.kick.com/x.m3u8','https://127.0.0.1/x.m3u8','file:///tmp/a.m3u8']) handlers.prepare({payload:{url},respond(d){assert.equal(d.returnValue,false);}});
  assert.equal(calls.length,before,'Playlist endpoint rejects untrusted origins before any request');
  transport='wait';replies=[];const start=calls.length;
  for(let i=0;i<20;i++)send({channel:'example'});
  assert.equal(calls.length-start,2,'Concurrent identical lookups share the two HTTP requests');
  transport='ok';waiting.splice(0).forEach(fn=>fn());await new Promise(r=>setImmediate(r));
  assert.equal(replies.length,20);assert.ok(replies.every(r=>r.returnValue));
  transport='wait';replies=[];const bounded=calls.length;
  for(let i=0;i<10;i++)send({channel:'channel'+i});
  assert.equal(calls.length-bounded,6,'At most six network requests may be active');
  transport='ok';waiting.splice(0).forEach(fn=>fn());await new Promise(r=>setImmediate(r));
  assert.equal(replies.length,10);assert.ok(replies.some(r=>r.errorCode==='busy'));
  transport='wait';replies=[];const beforeTimeout=aborted;
  send({channel:'example'});assert.equal(serviceTimers.size,2);
  [...serviceTimers.values()].forEach(fn=>fn());await new Promise(r=>setImmediate(r));
  assert.equal(serviceTimers.size,0);assert.equal(aborted-beforeTimeout,2);
  assert.equal(replies.length,1);assert.equal(replies[0].errorCode,'timeout');
  waiting.splice(0);
  for(const [mode,code,pattern] of [['aborted','aborted',/interrupted/],['response-error','transfer',/response failed/],['large','too_large',/too large/],['invalid','wrong_channel',/requested channel/]]){
    const beforeAborted=aborted;
    replies=[];transport=mode;send({channel:'example'});await new Promise(r=>setImmediate(r));
    assert.equal(replies.length,1);assert.match(replies[0].errorText,pattern);assert.equal(replies[0].errorCode,code);
    if(mode!=='invalid')assert.equal(aborted-beforeAborted,2,'Failed or oversized transfers are aborted');
  }
  transport='ok';handlers.channel({payload:{channel:'example'},respond(){throw Error('client closed');}});
  await new Promise(r=>setImmediate(r));
  replies=[];send({channel:'example'});await new Promise(r=>setImmediate(r));assert.equal(replies[0].returnValue,true);
  const statuses=channels=>handlers.statuses({payload:{channels},respond(d){replies.push(d);}});
  replies=[];const invalidStart=calls.length;
  for(const channels of [null,[],['../bad'],['example','example'],Array.from({length:7},(_,i)=>'c'+i)])statuses(channels);
  assert.equal(calls.length,invalidStart);assert.ok(replies.every(r=>!r.returnValue));
  replies=[];responseData.livestream={is_live:true};const statusStart=calls.length;
  statuses(['example','missing']);await new Promise(r=>setImmediate(r));
  assert.equal(replies[0].statuses[0].live,true);assert.equal(replies[0].statuses[1].live,null);
  assert.ok(calls.slice(statusStart).every(c=>!c.path.endsWith('/videos')));
  replies=[];responseData.livestream=null;statuses(['example']);await new Promise(r=>setImmediate(r));
  assert.equal(replies[0].statuses[0].live,false);
  transport='wait';replies=[];const backgroundStart=calls.length;
  statuses(['one','two','three','four','five','six']);
  assert.equal(calls.length-backgroundStart,2,'One status batch uses two workers');
  statuses(['seven','eight']);statuses(['nine','ten']);
  assert.equal(calls.length-backgroundStart,4,'Background requests leave two foreground slots');
  send({channel:'example'});assert.equal(calls.length-backgroundStart,6,'Foreground channel lookup retains capacity');
  transport='ok';waiting.splice(0).forEach(fn=>fn());await new Promise(r=>setImmediate(r));
  assert.equal(serviceTimers.size,0);
  console.log('TV service: passed (channel validation, fixed API origin, public replays only, media URL validation, offline and HTTP errors).');
}
testService().catch(e=>{console.error(e);process.exitCode=1;});
