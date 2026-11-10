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
import { OnlineLink, makeRoomCode, normalizeRoomCode, onlineAvailable } from './net.js';

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
const NET_TIMEOUT_MS = 8000;

function show(id) {
  screens.forEach((sel) => { $(sel).hidden = sel !== id; });
  document.body.dataset.screen = id.replace('#screen-', '');
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
    name.textContent = ch.name;
    const title = document.createElement('div');
    title.className = 'char-title';
    title.textContent = ch.title;
    const style = document.createElement('p');
    style.className = 'char-style';
    style.textContent = ch.style;
    const stats = document.createElement('dl');
    stats.className = 'char-stats';
    Object.entries(ch.stats).forEach(([k, v]) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
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
    cpu: ['あなたのキャラを選ぶ', '相手のキャラを選ぶ'],
    versus: ['1Pのキャラを選ぶ', '2Pのキャラを選ぶ'],
    training: ['練習するキャラを選ぶ', '練習相手を選ぶ'],
    online: ['自分のキャラを選ぶ', '相手の準備を待っています'],
  };
  $('#select-heading').textContent = labels[app.mode][app.picking];
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
  nm.textContent = name;
  const nt = document.createElement('div');
  nt.className = 'stage-note';
  nt.textContent = note;
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
    wrap.append(stageCard('', 'おまかせ', '', true));
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
  // 「おまかせ」は相手（2人目）のキャラのステージ
  const home = wrap.querySelector('.stage-card.home');
  home.querySelector('.stage-note').textContent = `${CHARS[app.picks[1]].name}のステージ（${STAGE_INFO[homeId].name}）`;
  paintStagePreview(home.querySelector('canvas'), homeId);
  show('#screen-stage');
  home.focus();
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
    title: '歩く', touch: '左のスティックを、相手のいる方へ倒そう', keys: 'A か D で、相手のいる方へ歩こう', hint: '#stick-base',
    done: (s, p, g) => {
      g.hold = (p.st === 'walk' || p.st === 'dash') && p.vx * p.facing > 0 ? g.hold + 1 : 0;
      return g.hold >= 15;
    },
  },
  {
    title: 'ジャンプ', touch: '「ジャンプ」ボタンを押そう（スティックを上に倒してもOK）', keys: 'W を押そう', hint: '[data-btn="U"]',
    done: (s, p) => p.st === 'air',
  },
  {
    title: 'しゃがむ', touch: 'スティックを下に倒したままにしよう', keys: 'S を押したままにしよう', hint: '#stick-base',
    done: (s, p, g) => {
      g.hold = p.st === 'crouch' ? g.hold + 1 : 0;
      return g.hold >= 12;
    },
  },
  {
    title: 'ガード', touch: '相手が攻撃してくるよ。「ガード」ボタンを押し続けて防ごう', keys: '相手が攻撃してくるよ。スペースキーを押し続けて防ごう', hint: '[data-guard]', dummy: 'attack',
    done: (s) => s.events.some((e) => (e.t === 'block' && e.by === 1) || (e.t === 'justGuard' && e.by === 0)),
  },
  {
    title: 'ジャストガード',
    touch: '攻撃が当たる直前に「ガード」を押し始めよう。成功すると相手がよろけて、反撃のチャンス！（難しければ、何回か防げば次へ進むよ）',
    keys: '攻撃が当たる直前にスペースキーを押し始めよう。成功すると相手がよろけて、反撃のチャンス！（難しければ、何回か防げば次へ進むよ）',
    hint: '[data-guard]', dummy: 'attack',
    done: (s, p, g) => {
      if (s.events.some((e) => e.t === 'justGuard' && e.by === 0)) return true;
      g.hold += s.events.filter((e) => e.t === 'block' && e.by === 1).length;
      return g.hold >= 4;
    },
  },
  {
    title: 'かわす', touch: 'スティックを相手と反対へ素早くはじこう。後ろへ飛びのいて攻撃をかわせるよ', keys: '相手と反対の方向（A か D）を素早く2回押そう。後ろへ飛びのいて攻撃をかわせるよ', hint: '#stick-base', dummy: 'attack',
    done: (s, p) => p.st === 'dash' && p.dashDir !== p.facing,
  },
  {
    title: '攻撃', touch: '近づいて「弱」を押し、相手に当てよう', keys: '近づいて J を押し、相手に当てよう', hint: '[data-btn="A"]',
    done: (s) => s.events.some((e) => e.t === 'hit' && e.by === 0),
  },
  {
    title: 'コンボ', touch: '近づいて「弱→中→強」と順に押し、3回つなげよう', keys: '近づいて J→K→L と順に押し、3回つなげよう', hint: '[data-btn="B"], [data-btn="C"], [data-btn="A"]',
    done: (s) => s.events.some((e) => e.t === 'hit' && e.by === 0 && e.hits >= 3),
  },
  {
    title: '必殺技', touch: '「必殺」を押そう。コンボの最後につなげると強いよ', keys: 'U を押そう。コンボの最後につなげると強いよ', hint: '[data-btn="S"]',
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
  $('#guide-title').textContent = stepDef.title;
  $('#guide-text').textContent = touch ? stepDef.touch : stepDef.keys;
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
  $('#guide-skip').textContent = 'ガイドを終わる';
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
        $('#guide-count').textContent = '完了';
        $('#guide-title').textContent = 'これで基本はOK！';
        $('#guide-text').textContent = '技の出し方は「II」で見られるよ。自由に練習してね';
        $('#guide-skip').textContent = '閉じる';
      }
    }
    return;
  }
  if (s.phase === 'fight' && GUIDE_STEPS[g.i].done(s, s.ps[0], g)) {
    g.wait = 40;
    playSound('ui');
    $('#guide').classList.add('ok');
    $('#guide-title').textContent = `${GUIDE_STEPS[g.i].title} OK！`;
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
  if (sess.desync && !net.ended) endOnline('通信の食い違いが起きました。もう一度部屋を作ってね');
  else if (sess.silentFor(performance.now()) > NET_TIMEOUT_MS && !net.ended) endOnline('相手との通信が切れました');
}

function netNote() {
  const net = app.net;
  if (!net || !net.session) return undefined;
  const kind = { direct: '直結', relay: '中継', local: 'テスト回線' }[net.link.transport.kind] || '';
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
  const left = opOnRight ? '後ろへ' : '前へ';
  const right = opOnRight ? '前へ' : '後ろへ';
  if ($('#stick-left').textContent !== left) {
    $('#stick-left').textContent = left;
    $('#stick-right').textContent = right;
  }
}

function showResult(s) {
  app.resultShown = true;
  const win = s.matchWinner;
  const title = $('#result-title');
  if (win < 0) {
    title.textContent = '引き分け';
  } else {
    const ch = CHARS[s.ps[win].char];
    if (app.mode === 'cpu') title.textContent = win === 0 ? '勝利！' : '敗北…';
    else if (app.mode === 'online') title.textContent = win === (app.net.host ? 0 : 1) ? '勝利！' : '敗北…';
    else title.textContent = `${win + 1}P ${ch.name} の勝ち`;
  }
  const body = $('#result-stats');
  body.textContent = '';
  const header = ['', ...s.ps.map((p) => CHARS[p.char].name)];
  const rows = [
    header,
    ['取ったラウンド', ...s.ps.map((p) => p.wins)],
    ['最大コンボ', ...s.ps.map((p) => `${p.stats.maxCombo} 連撃`)],
    ['与えたダメージ', ...s.ps.map((p) => p.stats.dmg)],
    ['超必殺', ...s.ps.map((p) => `${p.stats.supers} 回`)],
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
  $('#btn-rematch').textContent = 'もう一戦';
  $('#btn-reselect').hidden = app.mode === 'online';
  $('#btn-rematch').focus();
}

function togglePause(force) {
  if (!app.match || document.body.dataset.screen !== 'battle' || app.resultShown) return;
  app.paused = force !== undefined ? force : !app.paused;
  $('#pause').hidden = !app.paused;
  // オンラインでは止められない。メニューを開いている間も試合は進む
  $('#btn-retry').hidden = app.mode === 'online';
  $('#pause h2').textContent = app.mode === 'online' ? '試合は続いています' : '一時停止';
  if (app.paused) fillMoveList();
  app.last = performance.now();
}

/* ---------- オンライン ---------- */

function setOnlineError(text) {
  const el = $('#online-error');
  el.textContent = text || '';
  el.hidden = !text;
}

function openOnline() {
  setOnlineError(onlineAvailable() ? '' : 'オンライン対戦のサーバーがまだ設定されていません');
  $('#online-menu').hidden = false;
  $('#online-wait').hidden = true;
  $('#btn-room-create').disabled = !onlineAvailable();
  $('#btn-room-join').disabled = !onlineAvailable();
  $('#online').hidden = false;
}

function closeLink() {
  if (app.net) app.net.link.close();
  app.net = null;
}

async function enterRoom(code, host) {
  closeLink();
  setOnlineError('');
  $('#online-menu').hidden = true;
  $('#online-wait').hidden = false;
  $('#room-code').textContent = code;
  $('#btn-room-copy').hidden = !host;
  $('#online-status').textContent = 'サーバーにつないでいます…';
  const link = new OnlineLink({
    room: code,
    host,
    onPeer: () => netPeerFound(),
    onMessage: (m) => netMessage(m),
    onFail: (text) => netFail(text),
  });
  app.net = { link, host, session: null, myPick: null, peerPick: null, generation: 0, wantRematch: false, peerRematch: false, ended: false };
  try {
    await link.connect();
    if (app.net && app.net.link === link) {
      $('#online-status').textContent = host ? 'このコードを相手に伝えてね。入ってくるのを待っています…' : '部屋を探しています…';
    }
  } catch (err) {
    netFail(err.message);
  }
}

function netFail(text) {
  closeLink();
  $('#online-menu').hidden = false;
  $('#online-wait').hidden = true;
  setOnlineError(text);
}

function netPeerFound() {
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
  net.link.send({ t: 'pick', id, g: net.generation });
  maybeStartNet();
}

function maybeStartNet() {
  const net = app.net;
  if (!net || !net.host || !net.myPick || !net.peerPick || net.session) return;
  const msg = { t: 'start', p1: net.myPick, p2: net.peerPick, g: net.generation, delay: NET_DELAY };
  net.startMsg = msg;
  net.link.send(msg);
  startNetMatch(msg);
}

function startNetMatch(msg) {
  const net = app.net;
  app.mode = 'online';
  app.picks = [msg.p1, msg.p2];
  const relayed = net.link.transport.kind === 'relay';
  net.session = new RollbackSession({
    state: createMatch({ p1: msg.p1, p2: msg.p2, gimmicks: true }),
    localIdx: net.host ? 0 : 1,
    send: (m) => net.link.send(m, m.t === 'i'),
    delay: msg.delay,
    generation: msg.g,
    sendEvery: relayed ? 2 : 1,
  });
  // 中継から直結に変わったら送信回数を戻す
  net.link.transport.onkind = (kind) => {
    if (net.session) net.session.sendEvery = kind === 'relay' ? 2 : 1;
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
      if (!net.ended) endOnline('相手が部屋を出ました');
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
  $('#btn-rematch').textContent = '相手を待っています…';
  maybeRematch();
}

function maybeRematch() {
  const net = app.net;
  if (!net || !net.wantRematch || !net.peerRematch) return;
  // 両者が同じ番号と組み合わせで作り直すので、どちらが先でもよい
  net.generation++;
  clearInterval(net.startTimer);
  startNetMatch({ p1: app.picks[0], p2: app.picks[1], g: net.generation, delay: NET_DELAY });
}

function endOnline(text) {
  const net = app.net;
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
  const rows = SPECIAL_COMMANDS.map(([id, simple, motion]) => [ch.moves[id].name, simple + (ch.moves[id].hint ? `（${ch.moves[id].hint}）` : ''), motion]);
  if (ch.moves.jS) rows.splice(3, 0, [ch.moves.jS.name, 'ジャンプ中に必殺', '']);
  rows.push(['溜め強', '強を押し続けて離す', '最大でガード崩し']);
  rows.forEach(([name, simple, motion]) => {
    const tr = document.createElement('tr');
    [name, simple, motion].forEach((c) => {
      const td = document.createElement('td');
      td.textContent = c;
      tr.append(td);
    });
    box.append(tr);
  });
  $('#movelist-name').textContent = `${ch.name}の技`;
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
bind('#btn-online-close', () => {
  closeLink();
  $('#online').hidden = true;
});
bind('#btn-room-create', () => enterRoom(makeRoomCode(), true));
bind('#btn-room-join', () => {
  const code = normalizeRoomCode($('#room-input').value);
  if (code.length !== 4) {
    setOnlineError('コードは4文字で入れてね');
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
    $('#btn-room-copy').textContent = 'コピーしました';
  } catch {
    $('#btn-room-copy').textContent = 'コードを長押ししてコピーしてね';
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
  $('#btn-gimmick').textContent = `ギミック：${app.gimmicks ? 'あり' : 'なし'}`;
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
  $('#btn-sound').textContent = isMuted() ? '音：切' : '音：入';
}
syncSoundLabel();

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
  fullBtn.textContent = document.fullscreenElement ? '全画面を解除' : '全画面';
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

buildSelect();
show('#screen-title');
requestAnimationFrame(titleLoop);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(buildSelect);

// 動作確認用の窓口（ゲームの挙動には影響しない）
window.__rengeki = { app, input, GROUND_Y, pump: runFrame };
