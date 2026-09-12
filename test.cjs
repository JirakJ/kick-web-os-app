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
let elements, document, window, navigator, bridges, timers, clock;
function element(id = '') {
  return {
    id, hidden: false, disabled: false, value: '', _text: '', children: [], attrs: {}, handlers: {},
    get textContent(){return this._text+this.children.map(c=>c.textContent).join('');},
    set textContent(value){this._text=String(value);this.children.forEach(c=>{c.parentNode=null;});this.children=[];},
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
function boot(localStorage = storage, bridgeMode = 'ok') {
  elements = {}; bridges = []; timers = new Map(); clock = 1000;
  document = {hidden:false,activeElement:null,handlers:{},
    getElementById(id){return elements[id];},createElement(){return element();},
    addEventListener(name,fn){this.handlers[name]=fn;}};
  for(const [,id] of fs.readFileSync('app/index.html','utf8').matchAll(/id="([^"]+)"/g)) elements[id]=element(id);
  window={innerWidth:1920,handlers:{},addEventListener(name,fn){this.handlers[name]=fn;},scrollTo(){}};
  navigator={onLine:true};
  const context={document,window,navigator,localStorage,Date:{now:()=>clock},
    setTimeout(fn,ms){const id={};timers.set(id,{fn,ms,at:clock+ms});return id;},clearTimeout(id){timers.delete(id);}};
  if(bridgeMode!=='missing')context.PalmServiceBridge=function(){
    if(bridgeMode==='throw')throw Error('bridge unavailable');
    bridges.push(this);
    this.call=(uri,payload)=>{this.uri=uri;this.payload=JSON.parse(payload);};
    this.cancel=()=>{this.cancelled=true;};
  };
  vm.createContext(context);
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
function names(){return elements['recent-channels'].children.map(b=>b.textContent);}
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
elements['recent-channels'].children[2].handlers.click();respond();assert.equal(names()[0],'channel-5');
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

async function testService() {
  const {EventEmitter}=require('node:events');
  let handlers={}, calls=[], replies=[], status=200, transport='ok', waiting=[];
  const responseData={slug:'example',playback_url:live.url,livestream:{is_live:true,session_title:'Live'}};
  const good={is_live:false,source:vod.url,session_title:'Public',duration:60000,thumbnail:{src:'https://files.kick.com/test.jpg'},video:{uuid:'fd0d9069-63ca-42b2-b7b9-4d23134506b1',is_private:false,status:'public'}};
  let recordings=[good,{...good,video:{is_private:true,status:'public'}},{...good,is_live:true},{...good,source:'https://evil.test/x.m3u8'},{...good,video:{is_private:false,status:'public',deleted_at:'now'}}];
  let playlist='#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=7000000,RESOLUTION=1920x1080,FRAME-RATE=60\n1080.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=18000000,RESOLUTION=3840x2160,FRAME-RATE=30\n4k.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=11000000,RESOLUTION=2560x1440,FRAME-RATE=60\n1440.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=90000000,RESOLUTION=7680x4320\n8k.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=200000\naudio.m3u8';
  const https={get(options, callback){
    calls.push(options);
    const req=new EventEmitter();req.abort=()=>{};
    const deliver=()=>{
      const res=new EventEmitter();res.statusCode=status;res.resume=()=>{};res.setEncoding=()=>{};
      callback(res);
      if(transport==='aborted'){res.emit('aborted');return;}
      if(transport==='large'){res.emit('data','ž'.repeat(600000));res.emit('end');return;}
      if(transport==='invalid'){res.emit('data','null');res.emit('end');return;}
      res.emit('data',options.hostname==='kick.com' ? JSON.stringify(options.path.endsWith('/videos')?recordings:responseData) : playlist);res.emit('end');
    };
    if(transport==='wait')waiting.push(deliver);else queueMicrotask(deliver);
    return req;
  }};
  function Service(name){assert.equal(name,'cz.jirak.kicktv.service');this.register=(name,fn)=>{handlers[name]=fn;};}
  vm.runInNewContext(fs.readFileSync('service/index.js','utf8'),{require(name){return name==='https'?https:name==='url'?require('node:url'):Service;},Promise,Buffer,setTimeout,clearTimeout});
  const send=payload=>handlers.channel({payload,respond(data){replies.push(data);}});
  for(const channel of [undefined,null,'../admin','https://evil.test','foo?bar','A','a'.repeat(26)])send({channel});
  assert.equal(calls.length,0,'Invalid channels never reach the network');
  assert.ok(replies.every(r=>r.returnValue===false));replies=[];
  send({channel:'example'});await new Promise(r=>setImmediate(r));
  assert.equal(replies[0].returnValue,true);assert.equal(replies[0].videos.length,1);
  assert.equal(replies[0].videos[0].thumbnail,'https://files.kick.com/test.jpg');
  assert.equal(replies[0].videos[0].duration,60);assert.equal(replies[0].live.url,live.url);
  assert.equal(replies[0].videos[0].id,good.video.uuid);
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
  assert.equal(replies.length,10);assert.ok(replies.some(r=>/Probíhá/.test(r.errorText)));
  for(const [mode,pattern] of [['aborted',/přerušil/],['large',/velká/],['invalid',/nevrátil/]]){
    replies=[];transport=mode;send({channel:'example'});await new Promise(r=>setImmediate(r));
    assert.equal(replies.length,1);assert.match(replies[0].errorText,pattern);
  }
  transport='ok';handlers.channel({payload:{channel:'example'},respond(){throw Error('client closed');}});
  await new Promise(r=>setImmediate(r));
  replies=[];send({channel:'example'});await new Promise(r=>setImmediate(r));assert.equal(replies[0].returnValue,true);
  console.log('TV service: passed (channel validation, fixed API origin, public replays only, media URL validation, offline and HTTP errors).');
}
testService().catch(e=>{console.error(e);process.exitCode=1;});
