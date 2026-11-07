// オンライン対戦の同期（ロールバック方式）。
// 相手の入力が届くまでは「同じ入力が続く」と予想して進め、予想が外れたら
// 過去のコマまで戻って計算し直す。通信や画面には依存しない。
import { step, cloneState, stateHash } from './sim.js';

const HASH_EVERY = 120;
const SEND_WINDOW = 24;

export class RollbackSession {
  constructor({ state, localIdx, send, delay = 2, maxPredict = 10, generation = 0, sendEvery = 1 }) {
    this.state = state;
    this.localIdx = localIdx;
    this.remoteIdx = 1 - localIdx;
    this.send = send;
    this.delay = delay;
    this.maxPredict = maxPredict;
    this.generation = generation;
    this.sendEvery = sendEvery;   // 中継経由のときは送信回数を減らす

    this.frame = 0;               // 次に計算するコマ
    this.local = new Map();
    this.remote = new Map();
    this.used = new Map();        // そのコマの計算に使った相手入力
    this.states = new Map();      // そのコマを計算する前の状態
    this.emitted = new Map();     // 演出を二重に出さないための記録
    for (let f = 0; f < delay; f++) {
      this.local.set(f, 0);
      this.remote.set(f, 0);
    }
    this.localUpTo = delay - 1;
    this.remoteUpTo = delay - 1;
    this.peerAck = -1;
    this.confirmed = -1;
    this.rollbackTo = null;
    this.pendingMask = 0;
    this.overFrame = null;

    this.peerFrame = 0;
    this.peerAdvantage = 0;
    this.rtt = 0;
    this.lastPeerStamp = null;    // [相手の時刻, 受信した時刻]
    this.skipCooldown = 0;
    this.tickCount = 0;

    this.stats = { rollbacks: 0, rolledFrames: 0, maxRollback: 0, stalls: 0, skips: 0 };
    this.localHashes = new Map();
    this.peerHashes = new Map();
    this.desync = false;
    this.lastHeard = null;
  }

  receive(msg, now = 0) {
    if (msg.g !== this.generation) return;
    this.lastHeard = now;
    if (msg.t === 'h') {
      this.peerHashes.set(msg.f, msg.h);
      this.compareHash(msg.f);
      return;
    }
    if (msg.t !== 'i') return;
    this.peerAck = Math.max(this.peerAck, msg.a);
    this.peerFrame = Math.max(this.peerFrame, msg.f);
    this.peerAdvantage = msg.adv;
    this.lastPeerStamp = [msg.p, now];
    if (msg.e !== null && msg.e !== undefined) {
      const sample = Math.max(0, now - msg.e[0] - msg.e[1]);
      this.rtt = this.rtt ? this.rtt * 0.85 + sample * 0.15 : sample;
    }
    msg.m.forEach((mask, i) => {
      const f = msg.s + i;
      if (f !== this.remoteUpTo + 1) return;
      this.remote.set(f, mask);
      this.remoteUpTo = f;
      if (f < this.frame && this.used.get(f) !== mask) {
        this.rollbackTo = this.rollbackTo === null ? f : Math.min(this.rollbackTo, f);
      }
    });
  }

  remoteFor(f) {
    if (this.remote.has(f)) return this.remote.get(f);
    return this.remote.get(this.remoteUpTo) || 0;
  }

  simulate(f, out) {
    this.states.set(f, cloneState(this.state));
    const remote = this.remoteFor(f);
    this.used.set(f, remote);
    const inputs = this.localIdx === 0 ? [this.local.get(f) || 0, remote] : [remote, this.local.get(f) || 0];
    step(this.state, inputs);
    if (this.state.phase === 'over') {
      if (this.overFrame === null || f + 1 < this.overFrame) this.overFrame = f + 1;
    } else if (this.overFrame !== null && f + 1 >= this.overFrame) {
      this.overFrame = null;   // 巻き戻しの結果、まだ終わっていなかった
    }
    // 演出は「まだ出していないものだけ」出す
    let seen = this.emitted.get(f);
    if (!seen) {
      seen = new Set();
      this.emitted.set(f, seen);
    }
    for (const ev of this.state.events) {
      const key = `${ev.t}:${ev.by}:${ev.fx || ''}:${ev.hits || 0}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(ev);
      }
    }
  }

  applyRollback(out) {
    if (this.rollbackTo === null) return;
    const from = this.rollbackTo;
    this.rollbackTo = null;
    const saved = this.states.get(from);
    if (!saved) {
      this.desync = true;
      return;
    }
    const distance = this.frame - from;
    this.stats.rollbacks++;
    this.stats.rolledFrames += distance;
    this.stats.maxRollback = Math.max(this.stats.maxRollback, distance);
    this.state = cloneState(saved);
    for (let f = from; f < this.frame; f++) this.simulate(f, out);
  }

  compareHash(f) {
    if (this.localHashes.has(f) && this.peerHashes.has(f) && this.localHashes.get(f) !== this.peerHashes.get(f)) {
      this.desync = true;
    }
  }

  finishConfirmed() {
    const next = Math.min(this.remoteUpTo, this.frame - 1);
    for (let f = this.confirmed + 1; f <= next + 1; f++) {
      if (f > 0 && f % HASH_EVERY === 0 && f <= next + 1 && this.states.has(f) && !this.localHashes.has(f)) {
        const h = stateHash(this.states.get(f));
        this.localHashes.set(f, h);
        this.send({ t: 'h', g: this.generation, f, h });
        this.compareHash(f);
      }
    }
    this.confirmed = Math.max(this.confirmed, next);
    // 確定済みで不要になった記録を捨てる
    const keepFrom = this.confirmed - 2;
    for (const map of [this.states, this.used, this.emitted]) {
      for (const k of map.keys()) {
        if (k < keepFrom) map.delete(k);
        else break;
      }
    }
    const keepInputs = Math.min(this.peerAck, this.confirmed) - 2;
    for (const k of this.local.keys()) {
      if (k < keepInputs) this.local.delete(k);
      else break;
    }
    for (const k of this.remote.keys()) {
      if (k < this.confirmed - 2) this.remote.delete(k);
      else break;
    }
  }

  // 相手より先に進みすぎていたら、1コマ休んで足並みを揃える
  shouldSkip() {
    if (this.skipCooldown > 0) {
      this.skipCooldown--;
      return false;
    }
    const latency = this.rtt / 2 / (1000 / 60);
    const myAdvantage = this.frame - (this.peerFrame + latency);
    this.myAdvantage = myAdvantage;
    if ((myAdvantage - this.peerAdvantage) / 2 >= 1.5) {
      this.skipCooldown = 20;
      this.stats.skips++;
      return true;
    }
    return false;
  }

  sendInputs(now) {
    if (this.tickCount % this.sendEvery !== 0) return;
    const start = Math.max(this.peerAck + 1, this.localUpTo - SEND_WINDOW + 1, 0);
    const masks = [];
    for (let f = start; f <= this.localUpTo; f++) masks.push(this.local.get(f) || 0);
    const echo = this.lastPeerStamp ? [this.lastPeerStamp[0], now - this.lastPeerStamp[1]] : null;
    this.send({
      t: 'i', g: this.generation, s: start, m: masks, a: this.remoteUpTo, f: this.frame,
      adv: this.myAdvantage || 0, p: now, e: echo,
    });
  }

  // 1描画コマごとに呼ぶ。events は今コマで見せる演出
  tick(mask, now = 0) {
    this.tickCount++;
    const events = [];
    this.pendingMask |= mask;
    this.applyRollback(events);
    if (this.lastHeard === null) this.lastHeard = now;

    let stepped = false;
    const predicting = this.frame - (this.remoteUpTo + 1);
    if (predicting >= this.maxPredict) {
      this.stats.stalls++;
    } else if (!this.shouldSkip()) {
      const target = this.frame + this.delay;
      this.local.set(target, this.pendingMask);
      this.localUpTo = target;
      this.pendingMask = 0;
      this.simulate(this.frame, events);
      this.frame++;
      stepped = true;
    } else {
      // 休むコマの入力は次のコマへ持ち越す
    }
    this.finishConfirmed();
    this.sendInputs(now);
    return { stepped, events };
  }

  // 全コマの入力が確定したうえで試合が終わっているか
  get confirmedOver() {
    return this.overFrame !== null && this.confirmed >= this.overFrame - 1;
  }

  silentFor(now) {
    return this.lastHeard === null ? 0 : now - this.lastHeard;
  }
}
