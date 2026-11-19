// ランダム対戦の相手探し。相手を探す人どうしが「待合室」の通信路で声をかけ合い、2人ずつ組になる。
// サーバーには何も置かない（データベースなし）。組になったら部屋の名前を決めて、普通の部屋の仕組みに流す。
//
// 手順（id の小さい方が申し込む。同じ相手を取り合っても最後の「決まり」は1回だけ）
//   探す人 → みんな : seek            1秒ごと「探しています」
//   小さい id → 大きい id : offer      「この部屋で戦おう」
//   大きい id → 小さい id : accept     「いいよ」（ここから他の申し込みは断る）
//   小さい id → 大きい id : go         「決まり」→ 2人とも部屋へ
// 返事が来なければ少し待って探し直す。tick(now) を外から定期的に呼ぶ（時刻は外から渡すのでテストしやすい）
export const LOBBY_SEEK_MS = 1000;     // 「探しています」を出す間隔
export const LOBBY_FORGET_MS = 3000;   // これより長く声が聞こえない人は、もういないとみなす
export const LOBBY_REPLY_MS = 1500;    // 申し込み・返事を待つ長さ

export class Matchmaker {
  constructor({ transport, makeRoom, onMatch }) {
    this.transport = transport;
    this.id = transport.id;
    this.makeRoom = makeRoom;
    this.onMatch = onMatch;
    this.state = 'seek';           // seek / offering / awaiting / done
    this.pending = null;           // { peer, room, until }
    this.candidates = new Map();   // id → { heard, first }
    this.order = 0;
    this.lastSeek = -Infinity;
    this.now = 0;
    transport.onmessage = (m) => this.handle(m);
  }

  send(m) {
    this.transport.send({ ...m, from: this.id });
  }

  tick(now) {
    this.now = now;
    if (this.state === 'done') return;
    for (const [id, c] of this.candidates) if (now - c.heard > LOBBY_FORGET_MS) this.candidates.delete(id);
    if (this.pending && now > this.pending.until) {
      // 返事がなかった相手は後回しにする
      const c = this.candidates.get(this.pending.peer);
      if (c) c.first = ++this.order;
      this.pending = null;
      this.state = 'seek';
    }
    if (this.state !== 'seek') return;
    if (now - this.lastSeek >= LOBBY_SEEK_MS) {
      this.lastSeek = now;
      this.send({ t: 'seek' });
    }
    this.tryOffer();
  }

  tryOffer() {
    if (this.state !== 'seek') return;
    let best = null;
    for (const [id, c] of this.candidates) {
      if (id > this.id && (!best || c.first < best.first)) best = { id, first: c.first };
    }
    if (!best) return;
    const room = this.makeRoom();
    this.state = 'offering';
    this.pending = { peer: best.id, room, until: this.now + LOBBY_REPLY_MS };
    this.send({ t: 'offer', to: best.id, room });
  }

  handle(m) {
    if (!m || m.from === this.id || this.state === 'done') return;
    if (m.t === 'seek') {
      const c = this.candidates.get(m.from);
      if (c) c.heard = this.now;
      else this.candidates.set(m.from, { heard: this.now, first: ++this.order });
      this.tryOffer();
      return;
    }
    if (m.to !== this.id) return;
    if (m.t === 'offer') {
      if (this.state !== 'seek' || m.from > this.id) return;
      this.state = 'awaiting';
      this.pending = { peer: m.from, room: m.room, until: this.now + LOBBY_REPLY_MS };
      this.send({ t: 'accept', to: m.from, room: m.room });
    } else if (m.t === 'accept') {
      if (this.state !== 'offering' || this.pending.peer !== m.from || this.pending.room !== m.room) return;
      this.send({ t: 'go', to: m.from, room: m.room });
      this.finish(m.room, true);
    } else if (m.t === 'go') {
      if (this.state !== 'awaiting' || this.pending.peer !== m.from || this.pending.room !== m.room) return;
      this.finish(m.room, false);
    }
  }

  finish(room, host) {
    this.state = 'done';
    this.pending = null;
    if (this.onMatch) this.onMatch(room, host);
  }

  close() {
    this.state = 'done';
    this.transport.onmessage = null;
    this.transport.close();
  }
}
