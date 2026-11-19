// 画面のスティックとボタンが「押しっぱなし」で固まらないことのテスト（偽の画面で試す）
import test from 'node:test';
import assert from 'node:assert/strict';
import { BTN } from '../src/config.js';

class FakeEl {
  constructor(data = {}) {
    this.dataset = data;
    this.style = {};
    this.handlers = {};
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); }
  fire(type, ev = {}) { for (const fn of this.handlers[type] || []) fn({ type, preventDefault() {}, timeStamp: 0, ...ev }); }
  setPointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0 }; }
}

globalThis.window ??= new FakeEl();
globalThis.document ??= { addEventListener() {}, body: { dataset: {} }, activeElement: null, visibilityState: 'visible' };
const { InputManager } = await import('../src/input.js');

function setup() {
  const els = {
    '#stick-zone': new FakeEl(), '#stick-base': new FakeEl(), '#stick-knob': new FakeEl(), '[data-guard]': new FakeEl(),
  };
  const btnA = new FakeEl({ btn: 'A' });
  const root = { querySelector: (q) => els[q], querySelectorAll: () => [btnA] };
  const input = new InputManager();
  input.bindTouch(root);
  return { input, zone: els['#stick-zone'], guard: els['[data-guard]'], btnA };
}

const holdDown = (zone, id = 1) => {
  zone.fire('pointerdown', { pointerId: id, clientX: 100, clientY: 100 });
  zone.fire('pointermove', { pointerId: id, clientX: 100, clientY: 160, timeStamp: 500 });
};

test('指の追跡が切れたら（離した知らせが来なくても）スティックを戻す', () => {
  const { input, zone } = setup();
  holdDown(zone);
  assert.equal(input.touchDir, BTN.D);
  zone.fire('lostpointercapture', { pointerId: 1 });
  assert.equal(input.touchDir, 0);
});

test('前の指が行方不明のままでも、新しく触ればスティックが効く', () => {
  const { input, zone } = setup();
  holdDown(zone, 1); // 1本目の指の「離した」が届かなかった
  zone.fire('pointerdown', { pointerId: 2, clientX: 100, clientY: 100 });
  assert.equal(input.touchDir, 0, '新しい指は真ん中から');
  zone.fire('pointerup', { pointerId: 2, timeStamp: 900 });
  assert.equal(input.touchDir, 0);
});

test('画面の切り替えなどで全部の押下を放せる', () => {
  const { input, zone, guard, btnA } = setup();
  holdDown(zone);
  guard.fire('pointerdown', { pointerId: 3 });
  btnA.fire('pointerdown', { pointerId: 4 });
  input.releaseAll();
  assert.equal(input.touchDir, 0);
  assert.equal(input.touchBtn, 0);
  assert.equal(input.touchGuard, false);
  zone.fire('pointerdown', { pointerId: 5, clientX: 100, clientY: 100 });
  zone.fire('pointermove', { pointerId: 5, clientX: 160, clientY: 100, timeStamp: 900 });
  assert.equal(input.touchDir, BTN.R, '放したあともスティックは使える');
});

test('ボタンとガードも追跡が切れたら放す', () => {
  const { input, guard, btnA } = setup();
  guard.fire('pointerdown', { pointerId: 3 });
  btnA.fire('pointerdown', { pointerId: 4 });
  guard.fire('lostpointercapture', { pointerId: 3 });
  btnA.fire('lostpointercapture', { pointerId: 4 });
  assert.equal(input.touchGuard, false);
  assert.equal(input.touchBtn, 0);
});
