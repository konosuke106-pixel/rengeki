// キーボード・タッチ・ゲームパッドの入力を、1フレーム分のビット列にまとめる。
import { BTN } from './config.js';

const KEYMAP_P1 = {
  KeyW: BTN.U, KeyS: BTN.D, KeyA: BTN.L, KeyD: BTN.R,
  KeyJ: BTN.A, KeyK: BTN.B, KeyL: BTN.C, KeyU: BTN.S, KeyI: BTN.T, KeyO: BTN.X,
  Space: BTN.G, KeyH: BTN.G,
};
const KEYMAP_P2 = {
  ArrowUp: BTN.U, ArrowDown: BTN.D, ArrowLeft: BTN.L, ArrowRight: BTN.R,
  Numpad1: BTN.A, Numpad2: BTN.B, Numpad3: BTN.C, Numpad4: BTN.S, Numpad5: BTN.T, Numpad6: BTN.X, Numpad0: BTN.G,
  Comma: BTN.A, Period: BTN.B, Slash: BTN.C, Semicolon: BTN.S, Quote: BTN.T, BracketRight: BTN.X, BracketLeft: BTN.G,
};

// スティックを素早くはじいたか判定する。ゆっくり倒して歩くのと区別するため、
// 中心を離れてからの時間と距離で見る。dx,dy は px、ms は中心を離れてからの時間
const FLICK_MS = 75;
const FLICK_DIST = 34;
const FLICK_RELEASE_MS = 160;
const FLICK_RELEASE_DIST = 26;

export function flickBit(dx, dy, ms, released = false) {
  if (Math.abs(dx) < Math.abs(dy) * 1.6) return 0;
  const fast = released
    ? ms <= FLICK_RELEASE_MS && Math.abs(dx) >= FLICK_RELEASE_DIST
    : ms <= FLICK_MS && Math.abs(dx) >= FLICK_DIST;
  if (!fast) return 0;
  return dx > 0 ? BTN.R : BTN.L;
}

function cleanDirections(m) {
  let mask = m;
  if ((mask & BTN.L) && (mask & BTN.R)) mask &= ~(BTN.L | BTN.R);
  if ((mask & BTN.U) && (mask & BTN.D)) mask &= ~BTN.D;
  return mask;
}

export class InputManager {
  constructor() {
    this.keys = new Set();
    this.tappedKeys = new Set();  // 1コマより短い押下も取りこぼさないための記録
    this.touchDir = 0;
    this.touchBtn = 0;
    this.touchTap = 0;
    this.touchGuard = false;
    this.backBit = 0;  // 相手と反対の方向。ガードボタンで使うので画面側が毎コマ入れる
    this.flickQueue = [];  // はじいた時に流す「同じ方向に2回」の入力
    this.onPause = null;
    this.padPauseHeld = false;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (!e.repeat && this.onPause) this.onPause();
        return;
      }
      if (KEYMAP_P1[e.code] !== undefined || KEYMAP_P2[e.code] !== undefined) {
        // メニューを操作しているときはブラウザ標準の操作に任せる
        if (document.activeElement && document.activeElement.tagName === 'SELECT') return;
        // スペースは対戦中だけガード。メニューではボタンを押す普通の操作に使う
        if (e.code === 'Space' && document.body.dataset.screen !== 'battle') return;
        if (e.code === 'Space' && document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
        e.preventDefault();
        this.keys.add(e.code);
        if (!e.repeat) this.tappedKeys.add(e.code);
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.tappedKeys.clear();
      this.touchTap = 0;
      this.touchDir = 0;
      this.touchBtn = 0;
      this.touchGuard = false;
      this.flickQueue = [];
    });
  }

  readPad(i) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && pads[i];
    if (!pad) return 0;
    const b = (n) => pad.buttons[n] && pad.buttons[n].pressed;
    let m = 0;
    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    if (b(12) || ay < -0.5) m |= BTN.U;
    if (b(13) || ay > 0.5) m |= BTN.D;
    if (b(14) || ax < -0.5) m |= BTN.L;
    if (b(15) || ax > 0.5) m |= BTN.R;
    if (b(0)) m |= BTN.A;
    if (b(2)) m |= BTN.B;
    if (b(3)) m |= BTN.C;
    if (b(1)) m |= BTN.S;
    if (b(4)) m |= BTN.T;
    if (b(5)) m |= BTN.X;
    if (b(6) || b(7)) m |= BTN.G; // 背面のトリガー（LT / RT）でガード
    const pauseBtn = b(9);
    if (pauseBtn && !this.padPauseHeld && this.onPause) this.onPause();
    if (i === 0 || pauseBtn) this.padPauseHeld = pauseBtn;
    return m;
  }

  keyMask(map) {
    let m = 0;
    for (const code of this.keys) if (map[code] !== undefined) m |= map[code];
    for (const code of this.tappedKeys) {
      if (map[code] !== undefined) {
        m |= map[code];
        this.tappedKeys.delete(code);
      }
    }
    return m;
  }

  // solo=true のときは矢印キーも P1 として使える
  read(idx, solo = false) {
    let m = this.readPad(idx);
    if (idx === 0) {
      m |= this.keyMask(KEYMAP_P1) | this.touchDir | this.touchBtn | this.touchTap;
      this.touchTap = 0;
      if (solo) m |= this.keyMask(KEYMAP_P2);
      if (this.touchGuard) m |= BTN.G;
      if (this.flickQueue.length) m = (m & ~(BTN.L | BTN.R)) | this.flickQueue.shift();
    } else {
      m |= this.keyMask(KEYMAP_P2);
    }
    return cleanDirections(m);
  }

  // 画面上のスティックとボタンをつなぐ
  bindTouch(root) {
    const zone = root.querySelector('#stick-zone');
    const base = root.querySelector('#stick-base');
    const knob = root.querySelector('#stick-knob');
    let stickId = null;
    let cx = 0;
    let cy = 0;
    const R = 46;
    let leftCenterAt = 0;  // 最後に中心付近にいた時刻
    let flicked = false;
    let lastDx = 0;
    let lastDy = 0;

    const flick = (bit) => {
      if (!bit || flicked) return;
      flicked = true;
      this.flickQueue = [bit, 0, bit];
    };

    const moveKnob = (dx, dy, t) => {
      const d = Math.hypot(dx, dy);
      lastDx = dx;
      lastDy = dy;
      if (d < 15) {
        leftCenterAt = t;
        flicked = false;
      } else {
        flick(flickBit(dx, dy, t - leftCenterAt));
      }
      const lim = d > R ? R / d : 1;
      knob.style.transform = `translate(${dx * lim}px, ${dy * lim}px)`;
      let m = 0;
      if (d > 15) {
        const ang = Math.atan2(dy, dx) * 180 / Math.PI;
        // 歩いているつもりで飛んだりしゃがんだりしないよう、上下の範囲は狭めにする
        if (ang > -135 && ang < -45) m |= d > 22 ? BTN.U : 0;
        if (ang > 45 && ang < 135) m |= BTN.D;
        if (ang > -67.5 && ang < 67.5) m |= BTN.R;
        if (ang > 112.5 || ang < -112.5) m |= BTN.L;
      }
      this.touchDir = m;
    };

    zone.addEventListener('pointerdown', (e) => {
      if (stickId !== null) return;
      e.preventDefault();
      stickId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      const rect = zone.getBoundingClientRect();
      cx = e.clientX;
      cy = e.clientY;
      base.style.left = `${Math.max(62, cx - rect.left)}px`; // 説明の文字が画面の外に出ないように
      base.style.top = `${cy - rect.top}px`;
      base.classList.add('active');
      moveKnob(0, 0, e.timeStamp);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== stickId) return;
      moveKnob(e.clientX - cx, e.clientY - cy, e.timeStamp);
    });
    const endStick = (e) => {
      if (e.pointerId !== stickId) return;
      if (e.type === 'pointerup') flick(flickBit(lastDx, lastDy, e.timeStamp - leftCenterAt, true));
      stickId = null;
      this.touchDir = 0;
      knob.style.transform = '';
      base.style.left = '';
      base.style.top = '';
      base.classList.remove('active');
    };
    zone.addEventListener('pointerup', endStick);
    zone.addEventListener('pointercancel', endStick);

    root.querySelectorAll('[data-btn]').forEach((el) => {
      const bit = BTN[el.dataset.btn];
      const release = () => {
        this.touchBtn &= ~bit;
        el.classList.remove('down');
      };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch { /* 捕捉できなくても押下は有効 */ }
        this.touchBtn |= bit;
        this.touchTap |= bit;
        el.classList.add('down');
      });
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
    });

    const guard = root.querySelector('[data-guard]');
    const releaseGuard = () => {
      this.touchGuard = false;
      guard.classList.remove('down');
    };
    guard.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { guard.setPointerCapture(e.pointerId); } catch { /* 捕捉できなくても押下は有効 */ }
      this.touchGuard = true;
      guard.classList.add('down');
    });
    guard.addEventListener('pointerup', releaseGuard);
    guard.addEventListener('pointercancel', releaseGuard);
  }
}
