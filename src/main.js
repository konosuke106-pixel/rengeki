// 画面遷移とゲームループ。
import { CHARS, CHAR_IDS, SPECIAL_COMMANDS } from './characters.js';
import { createMatch, step, moveOf } from './sim.js';
import { createCpu, dummyInput } from './ai.js';
import { InputManager } from './input.js';
import { Renderer, paintFighter, paintStagePreview } from './render.js';
import { STAGE_IDS, STAGE_INFO } from './stages.js';
import { POSES } from './poses.js';
import { GROUND_Y, VIEW_W, VIEW_H, MAX_VIEW_W, BTN } from './config.js';
import { unlockAudio, playSound, isMuted, setMuted } from './audio.js';
import { RollbackSession } from './rollback.js';
import { OnlineLink, makeRoomCode, normalizeRoomCode, onlineAvailable, createTransport, NET_VERSION } from './net.js';
import { Matchmaker } from './lobby.js';
import { account, onAccount, initAccount, signInGoogle, signOut, deleteAccount, saveName, validName, rankedMatchInfo, matchResultFor, rankedUid, reportStart, reportResult, loadRanking, abnormalEndResult } from './account.js';
import { T, TX, LANGS, getLang, setLang, onLangChange, applyDom } from './i18n.js';

const $ = (sel) => document.querySelector(sel);
const screens = ['#screen-title', '#screen-select', '#screen-stage', '#screen-battle'];

const input = new InputManager();
const renderer = new Renderer($('#game'));

const app = {
  mode: 'cpu',
  level: 'normal',
  picks: [null, null],
  picking: 0,
  stage: null,     // 選んだステージ。null なら2人目のキャラのステージ
  gimmicks: true,  // ステージの仕掛けを動かすか
  match: null,
  controllers: [null, null],
  paused: false,
  running: false,
  dummy: 'stand',
  hitboxes: false,
  acc: 0,
  last: 0,
  resultShown: false,
  matchCount: 0,
  net: null,       // { link, host, session, myPick, peerPick, generation, wantRematch, peerRematch, started }
  guide: null,     // { i, hold, wait, savedDummy, ending }
};

// この端末の自分が何番目のキャラか。オンラインで部屋に入った側は 1
const myIdx = () => (app.net && app.net.session && !app.net.host ? 1 : 0);

const NET_DELAY = 2;
// 中継（Supabase 経由）のときは通信の節約のため入力を4コマ分まとめて送る。その分、入力の遅らせを増やして巻き戻しを抑える
const RELAY_SEND_EVERY = 4;
const NET_DELAY_RELAY = 4;
const RANDOM_WAIT_MS = 30000;      // ランダム対戦で相手を探す長さ。過ぎたらCPU戦へ
const RANDOM_ROOM_WAIT_MS = 8000;  // 組になったのに部屋で会えない時は、探し直す
const NET_TIMEOUT_MS = 8000;

function show(id) {
  screens.forEach((sel) => { $(sel).hidden = sel !== id; });
  document.body.dataset.screen = id.replace('#screen-', '');
  input.releaseAll(); // 前の画面で押していたスティックやボタンを持ち越さない
}

/* ---------- キャラ選択 ---------- */

function buildSelect() {
  const wrap = $('#char-list');
  wrap.textContent = '';
  CHAR_IDS.forEach((id) => {
    const ch = CHARS[id];
    const btn = document.createElement('button');
    btn.className = 'char-card';
    btn.type = 'button';
    btn.dataset.char = id;
    btn.style.setProperty('--card', ch.card || ch.palettes[0].gi);
    btn.style.setProperty('--card-dark', ch.palettes[0].dark);

    const cv = document.createElement('canvas');
    cv.width = 300;
    cv.height = 300;
    cv.className = 'portrait';
    const ctx = cv.getContext('2d');
    ctx.font = '250px "Dela Gothic One", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ch.palettes[0].dark;
    ctx.fillText(ch.kana, 150, 150);
    ctx.save();
    ctx.scale(1.1, 1.1);
    paintFighter(ctx, ch, ch.palettes[0], POSES.idle, 136, 262, 1, { clock: 8 });
    ctx.restore();
    btn.append(cv);

    const name = document.createElement('div');
    name.className = 'char-name';
    name.textContent = T(ch.name);
    const title = document.createElement('div');
    title.className = 'char-title';
    title.textContent = T(ch.title);
    const style = document.createElement('p');
    style.className = 'char-style';
    style.textContent = T(ch.style);
    const stats = document.createElement('dl');
    stats.className = 'char-stats';
    Object.entries(ch.stats).forEach(([k, v]) => {
      const dt = document.createElement('dt');
      dt.textContent = T(k);
      const dd = document.createElement('dd');
      dd.textContent = '■'.repeat(v) + '□'.repeat(5 - v);
      stats.append(dt, dd);
    });
    const info = document.createElement('div');
    info.className = 'char-info';
    info.append(name, title, style, stats);
    btn.append(info);
    btn.addEventListener('click', () => pickChar(id));
    wrap.append(btn);
  });
}

function updateSelectHeading() {
  const labels = {
    cpu: [TX('あなたのキャラを選ぶ'), TX('相手のキャラを選ぶ')],
    versus: [TX('1Pのキャラを選ぶ'), TX('2Pのキャラを選ぶ')],
    training: [TX('練習するキャラを選ぶ'), TX('練習相手を選ぶ')],
    online: [TX('自分のキャラを選ぶ'), TX('相手の準備を待っています')],
  };
  $('#select-heading').textContent = T(labels[app.mode][app.picking]);
  $('#cpu-level').hidden = app.mode !== 'cpu';
  document.querySelectorAll('.char-card').forEach((el) => {
    el.classList.toggle('picked', app.picking === 1 && el.dataset.char === app.picks[0]);
  });
}

function openSelect(mode) {
  app.mode = mode;
  app.stage = null;
  app.picks = [null, null];
  app.picking = 0;
  updateSelectHeading();
  show('#screen-select');
}

function pickChar(id) {
  playSound('ui');
  if (app.mode === 'online') {
    netPick(id);
    return;
  }
  app.picks[app.picking] = id;
  if (app.picking === 0) {
    app.picking = 1;
    updateSelectHeading();
    return;
  }
  openStageSelect();
}

/* ---------- ステージ選択 ---------- */

let stageCardsBuilt = false;

function stageCard(id, name, note, home) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'stage-card' + (home ? ' home' : '');
  btn.dataset.stage = id;
  const cv = document.createElement('canvas');
  cv.width = 320;
  cv.height = 180;
  const nm = document.createElement('div');
  nm.className = 'stage-name';
  nm.textContent = T(name);
  btn.dataset.name = name;
  const nt = document.createElement('div');
  nt.className = 'stage-note';
  nt.textContent = T(note);
  btn.dataset.note = note;
  if (!home && STAGE_INFO[id].plain) btn.classList.add('plain');
  btn.append(cv, nm, nt);
  btn.addEventListener('click', () => {
    playSound('ui');
    app.stage = home ? null : id;
    startMatch();
  });
  return btn;
}

function openStageSelect() {
  const wrap = $('#stage-list');
  const homeId = CHARS[app.picks[1]].stage;
  if (!stageCardsBuilt) {
    stageCardsBuilt = true;
    wrap.append(stageCard('', TX('おまかせ'), '', true));
    for (const id of STAGE_IDS) wrap.append(stageCard(id, STAGE_INFO[id].name, STAGE_INFO[id].note || '', false));
    // 見本の絵は重いので、1枚ずつ少しずつ描く
    const ids = STAGE_IDS.slice();
    const next = () => {
      const id = ids.shift();
      if (!id) return;
      paintStagePreview(wrap.querySelector(`.stage-card[data-stage="${id}"] canvas`), id);
      requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  }
  const home = wrap.querySelector('.stage-card.home');
  syncStageText();
  paintStagePreview(home.querySelector('canvas'), homeId);
  show('#screen-stage');
  home.focus();
}

// ステージの札の文字（言語を変えた時も呼ぶ）。「おまかせ」は相手（2人目）のキャラのステージ
function syncStageText() {
  document.querySelectorAll('#stage-list .stage-card').forEach((card) => {
    card.querySelector('.stage-name').textContent = T(card.dataset.name);
    card.querySelector('.stage-note').textContent = T(card.dataset.note);
  });
  const home = $('#stage-list .stage-card.home');
  if (home && app.picks[1]) {
    const homeId = CHARS[app.picks[1]].stage;
    home.querySelector('.stage-note').textContent = T('{name}のステージ（{stage}）', { name: T(CHARS[app.picks[1]].name), stage: T(STAGE_INFO[homeId].name) });
  }
}

/* ---------- 試合 ---------- */

function buildControllers() {
  const seed = (Date.now() & 0xffff) + 1;
  if (app.mode === 'cpu') {
    const cpu = createCpu(app.level, seed);
    return [() => input.read(0, true), (s) => cpu(s, 1)];
  }
  if (app.mode === 'training') {
    return [() => input.read(0, true), (s) => dummyInput(s, 1, app.dummy)];
  }
  return [() => input.read(0), () => input.read(1)];
}

function startMatch() {
  const [p1, p2] = app.picks;
  const stage = app.stage || CHARS[p2].stage;
  app.match = createMatch({ p1, p2, training: app.mode === 'training', stage, gimmicks: app.gimmicks });
  app.controllers = buildControllers();
  renderer.reset();
  renderer.setStage(stage);
  app.paused = false;
  app.resultShown = false;
  app.acc = 0;
  app.last = performance.now();
  $('#pause').hidden = true;
  $('#result').hidden = true;
  $('#training-tools').hidden = app.mode !== 'training';
  show('#screen-battle');
  fitCanvas();
  stopGuide();
  if (app.mode === 'training' && !guideSeen()) startGuide();
  if (!app.running) {
    app.running = true;
    requestAnimationFrame(frame);
  }
}

/* ---------- 操作ガイド（練習モード） ---------- */

const GUIDE_STEPS = [
  {
    title: TX('歩く'), touch: TX('左のスティックを、相手のいる方へ倒そう'), keys: TX('A か D で、相手のいる方へ歩こう'), hint: '#stick-base',
    done: (s, p, g) => {
      g.hold = (p.st === 'walk' || p.st === 'dash') && p.vx * p.facing > 0 ? g.hold + 1 : 0;
      return g.hold >= 15;
    },
  },
  {
    title: TX('ジャンプ'), touch: TX('「ジャンプ」ボタンを押そう（スティックを上に倒してもOK）'), keys: TX('W を押そう'), hint: '[data-btn="U"]',
    done: (s, p) => p.st === 'air',
  },
  {
    title: TX('しゃがむ'), touch: TX('スティックを下に倒したままにしよう'), keys: TX('S を押したままにしよう'), hint: '#stick-base',
    done: (s, p, g) => {
      g.hold = p.st === 'crouch' ? g.hold + 1 : 0;
      return g.hold >= 12;
    },
  },
  {
    title: TX('ガード'), touch: TX('相手が攻撃してくるよ。「ガード」ボタンを押し続けて防ごう'), keys: TX('相手が攻撃してくるよ。スペースキーを押し続けて防ごう'), hint: '[data-guard]', dummy: 'attack',
    done: (s) => s.events.some((e) => (e.t === 'block' && e.by === 1) || (e.t === 'justGuard' && e.by === 0)),
  },
  {
    title: TX('ジャストガード'),
    touch: TX('攻撃が当たる直前に「ガード」を押し始めよう。成功すると相手がよろけて、反撃のチャンス！（難しければ、何回か防げば次へ進むよ）'),
    keys: TX('攻撃が当たる直前にスペースキーを押し始めよう。成功すると相手がよろけて、反撃のチャンス！（難しければ、何回か防げば次へ進むよ）'),
    hint: '[data-guard]', dummy: 'attack',
    done: (s, p, g) => {
      if (s.events.some((e) => e.t === 'justGuard' && e.by === 0)) return true;
      g.hold += s.events.filter((e) => e.t === 'block' && e.by === 1).length;
      return g.hold >= 4;
    },
  },
  {
    title: TX('かわす'),
    touch: TX('スティックを倒しながら「ガード」を押そう。その方向へ転がって攻撃をすり抜けるよ（前に転がれば相手の後ろへ回れる）'),
    keys: TX('A か D を押しながらスペースを押そう。その方向へ転がって攻撃をすり抜けるよ（前に転がれば相手の後ろへ回れる）'),
    hint: '[data-guard], #stick-base', dummy: 'attack',
    done: (s, p) => p.st === 'evade' || (p.st === 'dash' && p.dashDir !== p.facing),
  },
  {
    title: TX('攻撃'), touch: TX('近づいて「弱」を押し、相手に当てよう'), keys: TX('近づいて J を押し、相手に当てよう'), hint: '[data-btn="A"]',
    done: (s) => s.events.some((e) => e.t === 'hit' && e.by === 0),
  },
  {
    title: TX('コンボ'), touch: TX('近づいて「弱→中→強」と順に押し、3回つなげよう'), keys: TX('近づいて J→K→L と順に押し、3回つなげよう'), hint: '[data-btn="B"], [data-btn="C"], [data-btn="A"]',
    done: (s) => s.events.some((e) => e.t === 'hit' && e.by === 0 && e.hits >= 3),
  },
  {
    title: TX('必殺技'), touch: TX('「必殺」を押そう。コンボの最後につなげると強いよ'), keys: TX('U を押そう。コンボの最後につなげると強いよ'), hint: '[data-btn="S"]',
    done: (s, p) => p.st === 'attack' && moveOf(p) && moveOf(p).rank === 4,
  },
];

function guideSeen() {
  try { return localStorage.getItem('rengeki-guide') === 'done'; } catch { return false; }
}

function markGuideSeen() {
  try { localStorage.setItem('rengeki-guide', 'done'); } catch { /* 保存できなくても遊べる */ }
}

function setGuideHint(sel) {
  document.querySelectorAll('.guide-hint').forEach((el) => el.classList.remove('guide-hint'));
  if (sel) document.querySelectorAll(sel).forEach((el) => el.classList.add('guide-hint'));
}

function showGuideStep() {
  const g = app.guide;
  const stepDef = GUIDE_STEPS[g.i];
  const touch = window.matchMedia('(pointer: coarse)').matches;
  $('#guide-count').textContent = `${g.i + 1} / ${GUIDE_STEPS.length}`;
  $('#guide-title').textContent = T(stepDef.title);
  $('#guide-text').textContent = T(touch ? stepDef.touch : stepDef.keys);
  $('#guide').classList.remove('ok');
  setGuideHint(stepDef.hint);
  app.dummy = stepDef.dummy || 'stand';
  g.hold = 0;
  g.wait = 0;
}

function startGuide() {
  stopGuide();
  app.guide = { i: 0, hold: 0, wait: 0, savedDummy: app.dummy, ending: false };
  $('#guide').hidden = false;
  $('#guide-skip').textContent = T('ガイドを終わる');
  showGuideStep();
}

function stopGuide() {
  if (!app.guide) return;
  app.dummy = app.guide.savedDummy;
  app.guide = null;
  setGuideHint(null);
  $('#guide').hidden = true;
}

function guideTick(s) {
  const g = app.guide;
  if (g.ending) {
    if (--g.wait <= 0) stopGuide();
    return;
  }
  if (g.wait > 0) {
    if (--g.wait === 0) {
      g.i++;
      if (g.i < GUIDE_STEPS.length) {
        showGuideStep();
      } else {
        markGuideSeen();
        g.ending = true;
        g.wait = 360;
        app.dummy = g.savedDummy;
        $('#guide').classList.remove('ok');
        $('#guide-count').textContent = T('完了');
        $('#guide-title').textContent = T('これで基本はOK！');
        $('#guide-text').textContent = T('技の出し方は「II」で見られるよ。自由に練習してね');
        $('#guide-skip').textContent = T('閉じる');
      }
    }
    return;
  }
  if (s.phase === 'fight' && GUIDE_STEPS[g.i].done(s, s.ps[0], g)) {
    g.wait = 40;
    playSound('ui');
    $('#guide').classList.add('ok');
    $('#guide-title').textContent = T('{title} OK！', { title: T(GUIDE_STEPS[g.i].title) });
    setGuideHint(null);
  }
}

function netFrame(now) {
  const net = app.net;
  const sess = net.session;
  app.acc += Math.min(100, now - app.last);
  const stepMs = 1000 / 60;
  let safety = 0;
  while (app.acc >= stepMs && safety++ < 5) {
    const r = sess.tick(app.paused ? 0 : input.read(0, true), performance.now());
    renderer.consume(r.events, sess.state);
    if (r.stepped) renderer.tick(sess.state);
    app.acc -= stepMs;
  }
  app.match = sess.state;
  if (sess.confirmedOver && !app.resultShown) {
    togglePause(false);
    showResult(sess.state);
  }
  if (sess.desync && !net.ended) endOnline(T('通信の食い違いが起きました。もう一度部屋を作ってね'));
  else if (sess.silentFor(performance.now()) > NET_TIMEOUT_MS && !net.ended) endOnline(T('相手との通信が切れました'));
}

function netNote() {
  const net = app.net;
  if (!net || !net.session) return undefined;
  const kind = { direct: T('直結'), relay: T('中継'), local: T('テスト回線') }[net.link.transport.kind] || '';
  return `${kind} ${Math.round(net.session.rtt)}ms`;
}

function frame(now) {
  if (!app.running) return;
  requestAnimationFrame(frame);
  runFrame(now);
}

function runFrame(now) {
  if (app.net && app.net.session) {
    netFrame(now);
    app.last = now;
    if (!app.match) return;
    renderer.draw(app.match, { hitboxes: false, note: netNote() });
    updateControls(app.match);
    return;
  }
  const s = app.match;
  if (!s) return;
  // 通信が終わった後は結果画面の裏で止めておく
  if (!app.paused && !app.net) {
    app.acc += Math.min(100, now - app.last);
    const stepMs = 1000 / 60;
    let safety = 0;
    while (app.acc >= stepMs && safety++ < 5) {
      const inputs = [app.controllers[0](s), app.controllers[1](s)];
      step(s, inputs);
      if (app.guide) guideTick(s);
      renderer.consume(s.events, s);
      renderer.tick(s);
      app.acc -= stepMs;
    }
    if (s.phase === 'over' && !app.resultShown) showResult(s);
  }
  app.last = now;
  renderer.draw(s, { hitboxes: app.hitboxes });
  updateControls(s);
}

// 超ボタンの光り方と、スティックの左右の説明を今の状況に合わせる
function updateControls(s) {
  const idx = myIdx();
  const me = s.ps[idx];
  const op = s.ps[1 - idx];
  const ready = me.meter >= 100;
  const el = $('#btn-super');
  if (el.classList.contains('ready') !== ready) el.classList.toggle('ready', ready);
  const opOnRight = op.x > me.x;
  input.backBit = opOnRight ? BTN.L : BTN.R;
  const left = opOnRight ? T('後ろへ') : T('前へ');
  const right = opOnRight ? T('前へ') : T('後ろへ');
  if ($('#stick-left').textContent !== left) {
    $('#stick-left').textContent = left;
    $('#stick-right').textContent = right;
  }
}

// 結果をサーバーに届け、レートの変化を結果画面に出す。相手の報告がまだなら少し待って聞き直す
async function reportRanked(result) {
  const net = app.net;
  const g = net.generation;
  const el = $('#result-rating');
  el.hidden = false;
  el.textContent = T('レートを集計中…');
  for (let i = 0; i < 4; i++) {
    const out = await reportResult(net.room, g, net.ranked.oppId, result);
    if (app.net !== net || net.generation !== g) return;
    if (out && typeof out.delta === 'number') {
      el.textContent = T('レート {delta}（{rating}）', { delta: (out.delta >= 0 ? '+' : '') + out.delta, rating: out.rating });
      return;
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  el.textContent = T('レートは少しあとで反映されます');
}

function showResult(s) {
  app.resultShown = true;
  $('#result-rating').hidden = true;
  const rnet = app.mode === 'online' ? app.net : null;
  if (rnet && rnet.ranked && rnet.reportedGen !== rnet.generation) {
    rnet.reportedGen = rnet.generation;
    reportRanked(matchResultFor(s, myIdx()));
  }
  const win = s.matchWinner;
  const title = $('#result-title');
  if (win < 0) {
    title.textContent = T('引き分け');
  } else {
    const ch = CHARS[s.ps[win].char];
    if (app.mode === 'cpu') title.textContent = win === 0 ? T('勝利！') : T('敗北…');
    else if (app.mode === 'online') title.textContent = win === (app.net.host ? 0 : 1) ? T('勝利！') : T('敗北…');
    else title.textContent = T('{n}P {name} の勝ち', { n: win + 1, name: T(ch.name) });
  }
  const body = $('#result-stats');
  body.textContent = '';
  const header = ['', ...s.ps.map((p) => T(CHARS[p.char].name))];
  const rows = [
    header,
    [T('取ったラウンド'), ...s.ps.map((p) => p.wins)],
    [T('最大コンボ'), ...s.ps.map((p) => T('{n} 連撃', { n: p.stats.maxCombo }))],
    [T('与えたダメージ'), ...s.ps.map((p) => p.stats.dmg)],
    [T('超必殺'), ...s.ps.map((p) => T('{n} 回', { n: p.stats.supers }))],
  ];
  rows.forEach((row, ri) => {
    const tr = document.createElement('tr');
    row.forEach((cell) => {
      const td = document.createElement(ri === 0 ? 'th' : 'td');
      td.textContent = cell;
      tr.append(td);
    });
    body.append(tr);
  });
  $('#result').hidden = false;
  $('#btn-rematch').hidden = false;
  $('#btn-rematch').disabled = false;
  $('#btn-rematch').textContent = T('もう一戦');
  $('#btn-reselect').hidden = app.mode === 'online';
  $('#btn-rematch').focus();
}

function togglePause(force) {
  if (!app.match || document.body.dataset.screen !== 'battle' || app.resultShown) return;
  app.paused = force !== undefined ? force : !app.paused;
  $('#pause').hidden = !app.paused;
  input.releaseAll();
  // オンラインでは止められない。メニューを開いている間も試合は進む
  $('#btn-retry').hidden = app.mode === 'online';
  $('#pause h2').textContent = app.mode === 'online' ? T('試合は続いています') : T('一時停止');
  if (app.paused) fillMoveList();
  app.last = performance.now();
}

/* ---------- オンライン ---------- */

/* ---------- ランダム対戦 ---------- */

function stopRandom() {
  const r = app.random;
  if (!r) return;
  app.random = null;
  clearInterval(r.timer);
  clearTimeout(r.roomTimer);
  if (r.mm) r.mm.close();
}

async function startRandom(until = performance.now() + RANDOM_WAIT_MS) {
  stopRandom();
  closeLink();
  setOnlineError('');
  $('#online-menu').hidden = true;
  $('#online-wait').hidden = false;
  $('#room-code').textContent = '';
  $('#btn-room-copy').hidden = true;
  $('#online-status').textContent = T('サーバーにつないでいます…');
  const r = { until, mm: null, timer: 0, roomTimer: 0, room: null };
  app.random = r;
  // 待合室は版ごとに分ける（版が違う相手とは試合が食い違うため）
  const transport = createTransport(`lobby-${NET_VERSION}`);
  try {
    await transport.open();
  } catch (err) {
    transport.close();
    if (app.random === r) netFail(err.message);
    return;
  }
  if (app.random !== r) {
    transport.close();
    return;
  }
  r.mm = new Matchmaker({
    transport,
    makeRoom: () => `R${makeRoomCode()}${makeRoomCode()}`,
    onMatch: (room, host) => randomMatched(r, room, host),
  });
  const tick = () => {
    if (app.random !== r || !r.mm) return;
    const now = performance.now();
    const left = Math.ceil((r.until - now) / 1000);
    if (left <= 0) {
      randomToCpu();
      return;
    }
    $('#online-status').textContent = T('相手を探しています…（あと{n}秒）', { n: left });
    r.mm.tick(now);
  };
  r.timer = setInterval(tick, 200);
  tick();
}

function randomMatched(r, room, host) {
  if (app.random !== r) return;
  clearInterval(r.timer);
  // 「決まり」を送り終えてから待合室を出る
  const mm = r.mm;
  r.mm = null;
  setTimeout(() => mm.close(), 500);
  enterRoom(room, host, true);
  // enterRoom が古い接続を閉じても、探している記録は残す
  app.random = r;
  r.room = room;
  r.roomTimer = setTimeout(() => {
    if (app.random === r && app.net && !app.net.session && app.mode !== 'online') netFail('');
  }, RANDOM_ROOM_WAIT_MS);
}

function randomToCpu() {
  stopRandom();
  closeLink();
  $('#online').hidden = true;
  openSelect('cpu');
  $('#select-heading').textContent = T('相手が見つからなかったので、CPUと対戦します。あなたのキャラを選ぶ');
}

function setOnlineError(text) {
  const el = $('#online-error');
  el.textContent = text || '';
  el.hidden = !text;
}

function openOnline() {
  setOnlineError(onlineAvailable() ? '' : T('オンライン対戦のサーバーがまだ設定されていません'));
  $('#online-menu').hidden = false;
  $('#online-wait').hidden = true;
  $('#btn-room-create').disabled = !onlineAvailable();
  $('#btn-random').disabled = !onlineAvailable();
  $('#btn-room-join').disabled = !onlineAvailable();
  $('#online').hidden = false;
}

function closeLink() {
  if (app.net) app.net.link.close();
  app.net = null;
}

async function enterRoom(code, host, random = false) {
  closeLink();
  setOnlineError('');
  $('#online-menu').hidden = true;
  $('#online-wait').hidden = false;
  $('#room-code').textContent = random ? '' : code;
  $('#btn-room-copy').hidden = !host || random;
  $('#btn-room-copy').textContent = T('コードをコピー');
  $('#online-status').textContent = T('サーバーにつないでいます…');
  const link = new OnlineLink({
    room: code,
    host,
    onPeer: () => netPeerFound(),
    onMessage: (m) => netMessage(m),
    onFail: (text) => netFail(text),
  });
  app.net = {
    link, host, session: null, myPick: null, peerPick: null, generation: 0, wantRematch: false, peerRematch: false, ended: false,
    // レート：ランダム対戦の時だけ、選んだキャラと一緒にログインの id を送り合う
    random, room: code, peerUid: null, ranked: null, reportedGen: -1,
  };
  try {
    await link.connect();
    if (app.net && app.net.link === link) {
      if (random) $('#online-status').textContent = T('相手が見つかりました。つないでいます…');
      else $('#online-status').textContent = host ? T('このコードを相手に伝えてね。入ってくるのを待っています…') : T('部屋を探しています…');
    }
  } catch (err) {
    netFail(err.message);
  }
}

function netFail(text) {
  // ランダム対戦で組んだ相手と部屋で会えなかった時は、残りの時間で探し直す
  if (app.random && app.random.room) {
    const until = app.random.until;
    stopRandom();
    closeLink();
    startRandom(until);
    return;
  }
  stopRandom();
  closeLink();
  $('#online-menu').hidden = false;
  $('#online-wait').hidden = true;
  setOnlineError(text);
}

function netPeerFound() {
  stopRandom();
  $('#online').hidden = true;
  app.mode = 'online';
  app.picking = 0;
  updateSelectHeading();
  show('#screen-select');
}

function netPick(id) {
  const net = app.net;
  if (!net) return;
  net.myPick = id;
  app.picks[0] = id;
  app.picking = 1;
  updateSelectHeading();
  net.link.send({ t: 'pick', id, g: net.generation, uid: net.random ? rankedUid() : null });
  maybeStartNet();
}

function maybeStartNet() {
  const net = app.net;
  if (!net || !net.host || !net.myPick || !net.peerPick || net.session) return;
  const delay = net.link.transport.kind === 'relay' ? NET_DELAY_RELAY : NET_DELAY;
  const msg = { t: 'start', p1: net.myPick, p2: net.peerPick, g: net.generation, delay };
  net.startMsg = msg;
  net.link.send(msg);
  startNetMatch(msg);
}

function startNetMatch(msg) {
  const net = app.net;
  app.mode = 'online';
  app.picks = [msg.p1, msg.p2];
  net.delay = msg.delay; // 再戦でも同じ遅らせを使う
  const relayed = net.link.transport.kind === 'relay';
  net.session = new RollbackSession({
    state: createMatch({ p1: msg.p1, p2: msg.p2, gimmicks: true }),
    localIdx: net.host ? 0 : 1,
    // 入力と答え合わせ（h）は落ちてもよいので直結を優先。直結中は中継を使わない
    send: (m) => net.link.send(m, m.t === 'i' || m.t === 'h'),
    delay: msg.delay,
    generation: msg.g,
    sendEvery: relayed ? RELAY_SEND_EVERY : 1,
  });
  // 中継から直結に変わったら送信回数を戻す
  net.link.transport.onkind = (kind) => {
    if (net.session) net.session.sendEvery = kind === 'relay' ? RELAY_SEND_EVERY : 1;
  };
  // 開始の合図が届かなかった場合に備えて、部屋主は少しの間送り直す
  if (net.host) {
    clearInterval(net.startTimer);
    let tries = 0;
    net.startTimer = setInterval(() => {
      if (++tries > 8 || !app.net || net.session.remoteUpTo > net.session.delay - 1) clearInterval(net.startTimer);
      else net.link.send(msg);
    }, 400);
  }
  app.match = net.session.state;
  net.wantRematch = false;
  // レートの付く試合なら、2人それぞれが「この試合を始めた」とサーバーに届ける
  net.ranked = rankedMatchInfo({ random: net.random, myUid: rankedUid(), peerUid: net.peerUid });
  if (net.ranked) reportStart(net.room, msg.g, net.ranked.oppId);
  net.peerRematch = false;
  renderer.reset();
  renderer.setStage(CHARS[msg.p2].stage);
  app.paused = false;
  app.resultShown = false;
  app.acc = 0;
  app.last = performance.now();
  $('#pause').hidden = true;
  $('#result').hidden = true;
  $('#online').hidden = true;
  $('#training-tools').hidden = true;
  show('#screen-battle');
  fitCanvas();
  if (!app.running) {
    app.running = true;
    requestAnimationFrame(frame);
  }
}

function netMessage(m) {
  const net = app.net;
  if (!net) return;
  switch (m.t) {
    case 'i':
    case 'h':
      if (net.session) net.session.receive(m, performance.now());
      break;
    case 'pick':
      if (m.g === net.generation) {
        net.peerPick = m.id;
        if (net.random && typeof m.uid === 'string') net.peerUid = m.uid;
        maybeStartNet();
      }
      break;
    case 'start':
      if (!net.host && m.g === net.generation && !net.session) startNetMatch(m);
      break;
    case 'rematch':
      if (m.g === net.generation) {
        net.peerRematch = true;
        maybeRematch();
      }
      break;
    case 'bye':
      if (!net.ended) endOnline(T('相手が部屋を出ました'));
      break;
    default:
      break;
  }
}

function askRematch() {
  const net = app.net;
  net.wantRematch = true;
  net.link.send({ t: 'rematch', g: net.generation });
  $('#btn-rematch').disabled = true;
  $('#btn-rematch').textContent = T('相手を待っています…');
  maybeRematch();
}

function maybeRematch() {
  const net = app.net;
  if (!net || !net.wantRematch || !net.peerRematch) return;
  // 両者が同じ番号と組み合わせで作り直すので、どちらが先でもよい
  net.generation++;
  clearInterval(net.startTimer);
  startNetMatch({ p1: app.picks[0], p2: app.picks[1], g: net.generation, delay: net.delay || NET_DELAY });
}

function endOnline(text) {
  const net = app.net;
  // 試合の途中で終わったら（相手が切れた・食い違い）「相手が切れた」と届ける。逃げた側の負けになり、
  // 相手がでっち上げの勝ちを届けても食い違いになってレートは動かない
  const dc = abnormalEndResult({ ranked: net.ranked, inMatch: !!net.session && !app.resultShown, reportedGen: net.reportedGen, generation: net.generation });
  if (dc) {
    net.reportedGen = net.generation;
    reportResult(net.room, net.generation, net.ranked.oppId, dc);
  }
  net.ended = true;
  net.session = null;
  clearInterval(net.startTimer);
  app.resultShown = true;
  $('#pause').hidden = true;
  $('#result-title').textContent = text;
  $('#result-stats').textContent = '';
  $('#btn-rematch').hidden = true;
  $('#btn-reselect').hidden = true;
  $('#result').hidden = false;
  $('#btn-result-quit').focus();
}

function leaveOnline() {
  const net = app.net;
  if (net) {
    clearInterval(net.startTimer);
    if (!net.ended) net.link.send({ t: 'bye' });
    // 別れの合図が届く時間だけ待って閉じる
    const link = net.link;
    setTimeout(() => link.close(), 400);
    app.net = null;
  }
}

function fillMoveList() {
  const box = $('#movelist');
  box.textContent = '';
  const ch = CHARS[app.match.ps[myIdx()].char];
  const rows = SPECIAL_COMMANDS.map(([id, simple, motion]) => [T(ch.moves[id].name), T(simple) + (ch.moves[id].hint ? T('（{hint}）', { hint: T(ch.moves[id].hint) }) : ''), T(motion)]);
  if (ch.moves.jS) rows.splice(3, 0, [T(ch.moves.jS.name), T('ジャンプ中に必殺'), '']);
  rows.push([T('溜め強'), T('強を押し続けて離す'), T('最大でガード崩し')]);
  rows.forEach(([name, simple, motion]) => {
    const tr = document.createElement('tr');
    [name, simple, motion].forEach((c) => {
      const td = document.createElement('td');
      td.textContent = c;
      tr.append(td);
    });
    box.append(tr);
  });
  $('#movelist-name').textContent = T('{name}の技', { name: T(ch.name) });
}

function quitToTitle() {
  stopGuide();
  leaveOnline();
  app.match = null;
  app.paused = false;
  $('#pause').hidden = true;
  $('#result').hidden = true;
  show('#screen-title');
}

/* ---------- 画面サイズ ---------- */

function fitCanvas() {
  const box = $('#screen-battle');
  const w = box.clientWidth;
  const h = box.clientHeight;
  if (!w || !h) return;
  // 16:9 より細長い画面では、黒帯を出さずにステージを左右へ広げて見せる
  const viewW = Math.max(VIEW_W, Math.min(MAX_VIEW_W, VIEW_H * w / h));
  const scale = Math.min(w / viewW, h / VIEW_H);
  const cw = Math.round(viewW * scale);
  const ch = Math.round(VIEW_H * scale);
  renderer.resize(cw, ch);
  box.style.setProperty('--canvas-top', `${Math.round((h - ch) / 2)}px`);
  box.style.setProperty('--canvas-h', `${ch}px`);
}

// 画面の回転やアドレスバーの出入りでも、実際の大きさが変わった時に合わせ直す
new ResizeObserver(fitCanvas).observe($('#screen-battle'));
document.addEventListener('visibilitychange', () => {
  if (document.hidden && app.match && !app.resultShown && !app.net) togglePause(true);
});
window.addEventListener('pagehide', () => {
  if (app.net && !app.net.ended) app.net.link.send({ t: 'bye' });
});

/* ---------- ボタン ---------- */

function bind(sel, fn) {
  $(sel).addEventListener('click', () => {
    playSound('ui');
    fn();
  });
}

document.querySelectorAll('[data-mode]').forEach((el) => {
  el.addEventListener('click', () => {
    playSound('ui');
    openSelect(el.dataset.mode);
  });
});
document.querySelectorAll('[data-level]').forEach((el) => {
  el.addEventListener('click', () => {
    app.level = el.dataset.level;
    playSound('ui');
    document.querySelectorAll('[data-level]').forEach((b) => b.classList.toggle('on', b === el));
  });
});
bind('#btn-online', () => openOnline());
bind('#btn-random', () => startRandom());
bind('#btn-online-close', () => {
  stopRandom();
  closeLink();
  $('#online').hidden = true;
});
bind('#btn-room-create', () => enterRoom(makeRoomCode(), true));
bind('#btn-room-join', () => {
  const code = normalizeRoomCode($('#room-input').value);
  if (code.length !== 4) {
    setOnlineError(T('コードは4文字で入れてね'));
    return;
  }
  enterRoom(code, false);
});
$('#room-input').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') $('#btn-room-join').click();
});
$('#room-input').addEventListener('keyup', (e) => e.stopPropagation());
$('#btn-room-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#room-code').textContent);
    $('#btn-room-copy').textContent = T('コピーしました');
  } catch {
    $('#btn-room-copy').textContent = T('コードを長押ししてコピーしてね');
  }
});
bind('#btn-back', () => {
  if (app.mode === 'online') {
    leaveOnline();
    app.picks = [null, null];
    app.picking = 0;
    show('#screen-title');
    return;
  }
  if (app.picking === 1) {
    app.picking = 0;
    updateSelectHeading();
  } else {
    show('#screen-title');
  }
});
bind('#btn-gimmick', () => {
  app.gimmicks = !app.gimmicks;
  $('#btn-gimmick').textContent = (app.gimmicks ? T('ギミック：あり') : T('ギミック：なし'));
  $('#btn-gimmick').classList.toggle('on', app.gimmicks);
  $('#stage-list').classList.toggle('no-gimmick', !app.gimmicks);
});
bind('#btn-stage-back', () => {
  show('#screen-select');
  updateSelectHeading();
});
bind('#btn-pause', () => togglePause());
bind('#btn-resume', () => togglePause(false));
bind('#btn-retry', () => startMatch());
bind('#btn-quit', () => quitToTitle());
bind('#btn-rematch', () => {
  if (app.mode === 'online') askRematch();
  else startMatch();
});
bind('#btn-reselect', () => {
  app.match = null;
  $('#result').hidden = true;
  openSelect(app.mode);
});
bind('#btn-result-quit', () => quitToTitle());
bind('#btn-howto', () => { $('#howto').hidden = false; });
bind('#btn-howto-close', () => { $('#howto').hidden = true; });
bind('#btn-howto-guide', () => {
  $('#howto').hidden = true;
  app.mode = 'training';
  app.picks = ['kagari', 'goutetsu'];
  startMatch();
  startGuide();
});
bind('#btn-guide', () => {
  togglePause(false);
  startGuide();
});
bind('#guide-skip', () => {
  markGuideSeen();
  stopGuide();
});
bind('#btn-rotate-skip', () => { document.body.classList.add('rotate-skip'); });

$('#btn-sound').addEventListener('click', () => {
  setMuted(!isMuted());
  syncSoundLabel();
  playSound('ui');
});
function syncSoundLabel() {
  $('#btn-sound').textContent = isMuted() ? T('音：切') : T('音：入');
}
syncSoundLabel();

// 言語の切り替え（タイトル画面）。押すたびに次の言語へ
function syncLangLabel() {
  $('#btn-lang').textContent = LANGS.find((l) => l.id === getLang()).label;
}
$('#btn-lang').addEventListener('click', () => {
  const i = LANGS.findIndex((l) => l.id === getLang());
  setLang(LANGS[(i + 1) % LANGS.length].id);
  playSound('ui');
});
function refreshLang() {
  applyDom(document.body);
  syncLangLabel();
  syncSoundLabel();
  syncFullLabel();
  $('#btn-gimmick').textContent = app.gimmicks ? T('ギミック：あり') : T('ギミック：なし');
  buildSelect();
  if (app.mode) updateSelectHeading();
  syncStageText();
  $('#btn-room-copy').textContent = T('コードをコピー');
  syncAccountButton();
  if (!$('#account').hidden) fillAccount();
}
onLangChange(refreshLang);

/* ---------- ランキング ---------- */

async function openRanking() {
  $('#ranking').hidden = false;
  const status = $('#ranking-status');
  const body = $('#ranking-rows');
  const me = $('#ranking-me');
  body.textContent = '';
  me.hidden = true;
  if (!onlineAvailable()) {
    status.textContent = T('オンライン対戦のサーバーがまだ設定されていません');
    return;
  }
  status.textContent = T('読み込み中…');
  let data;
  try {
    data = await loadRanking();
  } catch {
    status.textContent = T('読み込めませんでした。時間をおいてもう一度試してね');
    return;
  }
  if ($('#ranking').hidden) return;
  const { profile } = account();
  status.textContent = data.rows.length ? '' : T('まだ誰もいません。ランダム対戦で最初の1人になろう');
  if (data.rows.length) {
    const head = document.createElement('tr');
    [T('順位'), T('名前'), T('レート'), T('勝ち / 試合')].forEach((c) => {
      const th = document.createElement('th');
      th.textContent = c;
      head.append(th);
    });
    body.append(head);
  }
  for (const r of data.rows) {
    const tr = document.createElement('tr');
    if (profile && data.myRank === r.rank && profile.name === r.name) tr.className = 'me';
    // 名前は人が決めた文字なので、必ず文字として入れる
    [r.rank, r.name, r.rating, `${r.wins} / ${r.games}`].forEach((c) => {
      const td = document.createElement('td');
      td.textContent = String(c);
      tr.append(td);
    });
    body.append(tr);
  }
  if (!account().user) me.textContent = T('ログインすると、ランダム対戦の結果でランキングに載ります');
  else if (!data.myRank) me.textContent = T('ランダム対戦で1試合すると載ります');
  else me.textContent = T('あなたは {rank}位（レート {rating}）', { rank: data.myRank, rating: profile ? profile.rating : '' });
  me.hidden = false;
}

bind('#btn-ranking', () => openRanking());
bind('#btn-ranking-close', () => { $('#ranking').hidden = true; });

/* ---------- アカウント ---------- */

function syncAccountButton() {
  const { user, profile } = account();
  $('#btn-account').textContent = !user ? T('ログイン') : profile ? profile.name : T('名前を決める');
}

function accountMsg(text) {
  $('#account-msg').textContent = text || '';
  $('#account-msg').hidden = !text;
}

function fillAccount() {
  const { user, profile } = account();
  $('#account-guest').hidden = !!user;
  $('#account-user').hidden = !user;
  $('#btn-login-google').disabled = !onlineAvailable();
  if (user) {
    if (document.activeElement !== $('#name-input')) $('#name-input').value = profile ? profile.name : '';
    $('#account-stats').textContent = profile
      ? T('レート {rating}・{wins}勝 / {games}試合', { rating: profile.rating, wins: profile.wins, games: profile.games })
      : T('まずランキングに出す名前を決めてね');
  }
  const del = $('#btn-delete-account');
  del.classList.remove('armed');
  del.textContent = T('アカウントを削除');
}

function openAccount() {
  accountMsg('');
  fillAccount();
  $('#account').hidden = false;
}

onAccount(() => {
  syncAccountButton();
  if (!$('#account').hidden) fillAccount();
});
bind('#btn-account', () => openAccount());
bind('#btn-account-close', () => { $('#account').hidden = true; });
bind('#btn-login-google', async () => {
  accountMsg(T('Google のページへ移動します…'));
  try {
    await signInGoogle();
  } catch {
    accountMsg(T('ログインできませんでした。時間をおいてもう一度試してね'));
  }
});
bind('#btn-name-save', async () => {
  const name = validName($('#name-input').value);
  if (!name) {
    accountMsg(T('名前は2〜12文字にしてね'));
    return;
  }
  try {
    await saveName(name);
    accountMsg(T('保存しました'));
  } catch {
    accountMsg(T('保存できませんでした。時間をおいてもう一度試してね'));
  }
});
$('#name-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#btn-name-save').click();
});
bind('#btn-logout', async () => {
  await signOut();
  accountMsg(T('ログアウトしました'));
});
bind('#btn-delete-account', async () => {
  const del = $('#btn-delete-account');
  // うっかり消さないよう、2回押して削除（ブラウザの確認の窓は使わない）
  if (!del.classList.contains('armed')) {
    del.classList.add('armed');
    del.textContent = T('もう一度押すと削除（元に戻せません）');
    return;
  }
  try {
    await deleteAccount();
    accountMsg(T('アカウントを削除しました'));
  } catch {
    fillAccount();
    accountMsg(T('削除できませんでした。時間をおいてもう一度試してね'));
  }
});

$('#dummy-mode').addEventListener('change', (e) => { app.dummy = e.target.value; e.target.blur(); });
$('#show-hitbox').addEventListener('change', (e) => { app.hitboxes = e.target.checked; e.target.blur(); });

/* ---------- 全画面 ---------- */

const fullBtn = $('#btn-full');
const canFullscreen = typeof document.documentElement.requestFullscreen === 'function';
const phoneLandscape = window.matchMedia('(orientation: landscape) and (pointer: coarse)');
const launchedFromHome = navigator.standalone === true
  || window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
let fullOptOut = false; // 全画面ボタンで自分から解除したら、勝手に戻さない

function enterFullscreen() {
  return document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}

// ブラウザは「画面に触った直後」しか全画面を許さない。回転の直後に試して、
// 断られたら次に画面を触った時に入る
function autoFullscreen(e) {
  if (!canFullscreen || fullOptOut || document.fullscreenElement || !phoneLandscape.matches) return;
  if (e.target === fullBtn) return;
  enterFullscreen();
}
phoneLandscape.addEventListener('change', autoFullscreen);
window.addEventListener('pointerup', autoFullscreen, { capture: true });
window.addEventListener('touchend', autoFullscreen, { capture: true });

function syncFullLabel() {
  fullBtn.textContent = document.fullscreenElement ? T('全画面を解除') : T('全画面');
}
document.addEventListener('fullscreenchange', syncFullLabel);

// iPhone の Safari には全画面の機能がないので、ホーム画面に追加する手順を案内する
if (launchedFromHome || (!canFullscreen && !window.matchMedia('(pointer: coarse)').matches)) fullBtn.hidden = true;
fullBtn.addEventListener('click', async () => {
  if (!canFullscreen) {
    $('#fullhint').hidden = false;
    return;
  }
  try {
    if (document.fullscreenElement) {
      fullOptOut = true;
      await document.exitFullscreen();
    } else {
      fullOptOut = false;
      await enterFullscreen();
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape').catch(() => {});
    }
  } catch { /* 全画面が使えない環境ではそのまま遊ぶ */ }
});
bind('#btn-fullhint-close', () => { $('#fullhint').hidden = true; });

window.addEventListener('pointerdown', unlockAudio, { capture: true });
window.addEventListener('keydown', unlockAudio, { capture: true });
window.addEventListener('contextmenu', (e) => {
  if (document.body.dataset.screen === 'battle') e.preventDefault();
});

// 対戦中は、スマホのブラウザの「2回タップで拡大・画面がずれる」などの動きを止める。
// スティックとボタンは pointer イベントで読むので影響しない。
// 一時停止ボタンやメニューの普通のボタンは、押した扱い（click）が要るので止めない
const battleScreen = $('#screen-battle');
const keepTouch = (e) => e.target.closest && e.target.closest('button:not(.tbtn), select, input, a, .panel');
for (const type of ['touchstart', 'touchmove', 'touchend']) {
  battleScreen.addEventListener(type, (e) => {
    if (e.cancelable && !keepTouch(e)) e.preventDefault();
  }, { passive: false });
}
battleScreen.addEventListener('dblclick', (e) => e.preventDefault());
// それでも画面がずれてしまったら元の位置に戻す
const unscroll = () => {
  if (document.body.dataset.screen !== 'battle') return;
  if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
  for (const el of [$('#app'), battleScreen]) if (el.scrollTop || el.scrollLeft) el.scrollTop = el.scrollLeft = 0;
};
window.addEventListener('scroll', unscroll, { passive: true });
$('#app').addEventListener('scroll', unscroll, { passive: true, capture: true });

input.onPause = () => togglePause();
input.bindTouch($('#touch'));

/* ---------- タイトルに並ぶキャラ ---------- */

// [キャラ, 横の位置(0〜1), 奥行き(1=手前), ポーズ, 地面からの高さ(背の何倍)]
const TITLE_CAST = [
  // 奥の列（小さく、少し上）
  ['oni', 0.0, 0.72, 'idle', 0],
  ['shizuku', 0.14, 0.68, 'cast', 0],
  ['tsuzumi', 0.28, 0.68, 'castW', 0],
  ['maboroshi', 0.42, 0.68, 'parry', 0],
  ['yumi', 0.58, 0.68, 'cast', 0],
  ['kabuto', 0.72, 0.7, 'parry', 0],
  ['kage', 0.86, 0.68, 'parry', 0],
  ['goutetsu', 1.0, 0.72, 'idle', 0],
  // 手前の列
  ['kusari', 0.04, 0.9, 'jab', 0],
  ['rai', 0.2, 0.92, 'idle', 0],
  ['haze', 0.34, 0.9, 'upper', 0],
  ['kagari', 0.5, 1.04, 'heavy', 0],
  ['hayate', 0.64, 0.92, 'jump', 0.18],
  ['tsubasa', 0.36, 0.86, 'jump', 0.3],
  ['hami', 0.8, 0.9, 'crouch', 0],
  ['kogarashi', 0.96, 0.92, 'castW', 0],
];
let titleClock = 0;

function drawTitleCast() {
  const cv = $('#title-cast');
  if (!cv || document.body.dataset.screen !== 'title') return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(cv.clientWidth * dpr);
  const h = Math.round(cv.clientHeight * dpr);
  if (!w || !h) return;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  // 背の高さを画面の高さに合わせる。横に詰まる時は少し小さく
  const unit = Math.min(h * 0.0024, w * 0.00115);
  const ground = h * 0.93;
  for (const [id, fx, depth, poseName, lift] of TITLE_CAST) {
    const ch = CHARS[id];
    const k = unit * depth;
    const x = w * (0.06 + fx * 0.88);
    const facing = fx <= 0.5 ? 1 : -1;
    const bob = Math.sin(titleClock * 0.05 + fx * 9) * 2;
    ctx.save();
    ctx.translate(x, ground - lift * h - (depth < 0.8 ? h * 0.15 : 0) + bob);
    ctx.scale(k, k);
    paintFighter(ctx, ch, ch.palettes[0], POSES[poseName], 0, 0, facing, { clock: titleClock, vx: id === 'hayate' ? 6 * facing : 0 });
    ctx.restore();
  }
}

function titleLoop() {
  titleClock++;
  if (titleClock % 2 === 0) drawTitleCast();
  requestAnimationFrame(titleLoop);
}

refreshLang();
show('#screen-title');
// ログインの記録がある時だけ通信の部品を読み込む。初めてログインした人には名前を決めてもらう
initAccount().then(() => {
  syncAccountButton();
  const { user, profile } = account();
  if (user && !profile) openAccount();
});
requestAnimationFrame(titleLoop);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(buildSelect);

// 動作確認用の窓口（ゲームの挙動には影響しない）
window.__rengeki = { app, input, GROUND_Y, pump: runFrame };
