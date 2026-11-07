// キーボード・タッチ・ゲームパッドの入力を、1フレーム分のビット列にまとめる。
import { BTN } from './config.js';

const KEYMAP_P1 = {
  KeyW: BTN.U, KeyS: BTN.D, KeyA: BTN.L, KeyD: BTN.R,
  KeyJ: BTN.A, KeyK: BTN.B, KeyL: BTN.C, KeyU: BTN.S, KeyI: BTN.T, KeyO: BTN.X,
};
const KEYMAP_P2 = {
  ArrowUp: BTN.U, ArrowDown: BTN.D, ArrowLeft: BTN.L, ArrowRight: BTN.R,
  Numpad1: BTN.A, Numpad2: BTN.B, Numpad3: BTN.C, Numpad4: BTN.S, Numpad5: BTN.T, Numpad6: BTN.X,
  Comma: BTN.A, Period: BTN.B, Slash: BTN.C, Semicolon: BTN.S, Quote: BTN.T, BracketRight: BTN.X,
};

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

    const moveKnob = (dx, dy) => {
      const d = Math.hypot(dx, dy);
      const lim = d > R ? R / d : 1;
      knob.style.transform = `translate(${dx * lim}px, ${dy * lim}px)`;
      let m = 0;
      if (d > 15) {
        const ang = Math.atan2(dy, dx) * 180 / Math.PI;
        if (ang > -157.5 && ang < -22.5) m |= d > 22 ? BTN.U : 0;
        if (ang > 22.5 && ang < 157.5) m |= BTN.D;
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
      base.style.left = `${cx - rect.left}px`;
      base.style.top = `${cy - rect.top}px`;
      base.classList.add('active');
      moveKnob(0, 0);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== stickId) return;
      moveKnob(e.clientX - cx, e.clientY - cy);
    });
    const endStick = (e) => {
      if (e.pointerId !== stickId) return;
      stickId = null;
      this.touchDir = 0;
      knob.style.transform = '';
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
  }
}
