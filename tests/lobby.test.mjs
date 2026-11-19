// ランダム対戦の相手探し：仮の通信路で、人数・遅れ・取りこぼしを変えて組み合わせを確かめる
import test from 'node:test';
import assert from 'node:assert/strict';
import { Matchmaker } from '../src/lobby.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// 全員に届く通信路。lag は届くまでのミリ秒、loss は落ちる割合
function makeWorld({ seed = 1, lag = 80, jitter = 60, loss = 0 } = {}) {
  const rand = rng(seed);
  const world = { now: 0, queue: [], people: [], rooms: 0 };
  world.join = (id) => {
    const tr = {
      id, onmessage: null,
      send(m) {
        for (const p of world.people) {
          if (p.tr === tr || rand() < loss) continue;
          world.queue.push({ at: world.now + lag + rand() * jitter, to: p, m });
        }
      },
      close() { tr.closed = true; },
    };
    const person = { id, tr, match: null };
    person.mm = new Matchmaker({
      transport: tr,
      makeRoom: () => `room${++world.rooms}`,
      onMatch: (room, host) => { assert.equal(person.match, null, `${id} が2回組になった`); person.match = { room, host }; },
    });
    world.people.push(person);
    return person;
  };
  world.run = (ms) => {
    const end = world.now + ms;
    for (; world.now < end; world.now += 10) {
      const due = world.queue.filter((q) => q.at <= world.now);
      world.queue = world.queue.filter((q) => q.at > world.now);
      for (const q of due) if (!q.to.tr.closed && q.to.tr.onmessage) q.to.tr.onmessage(q.m);
      for (const p of world.people) p.mm.tick(world.now);
    }
  };
  return world;
}

// 同じ部屋に入るのはちょうど2人で、片方が部屋主
function checkPairs(world) {
  const byRoom = new Map();
  for (const p of world.people) if (p.match) byRoom.set(p.match.room, [...(byRoom.get(p.match.room) || []), p]);
  for (const [room, ps] of byRoom) {
    assert.equal(ps.length, 2, `${room} に ${ps.length} 人`);
    assert.deepEqual(ps.map((p) => p.match.host).sort(), [false, true], `${room} の部屋主`);
  }
  return byRoom.size;
}

test('2人なら組になり、片方が部屋主になる', () => {
  const w = makeWorld();
  const a = w.join('aaa');
  const b = w.join('bbb');
  w.run(3000);
  assert.ok(a.match && b.match);
  assert.equal(a.match.room, b.match.room);
  assert.equal(a.match.host, true, 'id の小さい方が部屋主');
  assert.equal(checkPairs(w), 1);
});

test('1人だけなら誰とも組にならない', () => {
  const w = makeWorld();
  const a = w.join('aaa');
  w.run(5000);
  assert.equal(a.match, null);
});

test('3人なら1組でき、余った1人はあとから来た人と組になる', () => {
  const w = makeWorld();
  ['m1', 'm2', 'm3'].forEach((id) => w.join(id));
  w.run(4000);
  assert.equal(checkPairs(w), 1);
  const left = w.people.find((p) => !p.match);
  const late = w.join('z9');
  w.run(4000);
  assert.ok(left.match && late.match);
  assert.equal(left.match.room, late.match.room);
  assert.equal(checkPairs(w), 2);
});

test('大勢が同時に探しても、全員がちょうど2人ずつの組になる（遅れ・順番を変えて）', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const w = makeWorld({ seed, lag: 40 + seed * 5, jitter: 150 });
    const r = rng(seed * 7);
    for (let i = 0; i < 10; i++) w.join(Math.floor(r() * 1e9).toString(16).padStart(8, '0') + i);
    w.run(20000);
    assert.equal(checkPairs(w), 5, `種 ${seed}`);
  }
});

test('通信が落ちても、食い違った組（相手のいない部屋）は「決まり」が落ちた時だけ', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const w = makeWorld({ seed, loss: 0.2 });
    for (let i = 0; i < 8; i++) w.join(`p${seed}-${i}`);
    w.run(30000);
    // 部屋に入る客は、必ず部屋主が待っている部屋に入る
    const hosts = new Set(w.people.filter((p) => p.match && p.match.host).map((p) => p.match.room));
    for (const p of w.people) if (p.match && !p.match.host) assert.ok(hosts.has(p.match.room), `種 ${seed}: ${p.id} の部屋に主がいない`);
  }
});

test('やめた人には申し込まない', () => {
  const w = makeWorld();
  const a = w.join('aaa');
  w.run(1500);
  a.mm.close();
  w.people = w.people.filter((p) => p !== a);
  w.run(4000);
  const b = w.join('bbb');
  w.run(4000);
  assert.equal(b.match, null);
});
