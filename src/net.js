// 相手とのつなぎ方。部屋コードで出会い、できれば端末どうしの直結(WebRTC)に切り替える。
// send(msg, fast): fast=true は入力など「落ちてもよいが速さ優先」のデータ
import { SUPABASE_URL, SUPABASE_KEY } from './online-config.js';

const SUPABASE_SCRIPT = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function makeRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

export function normalizeRoomCode(text) {
  return String(text || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 4);
}

export function onlineAvailable() {
  return !!(SUPABASE_URL && SUPABASE_KEY) || localTestOptions() !== null;
}

// ?net=local&lag=60&loss=0.05 で、同じブラウザの別画面どうしを仮想回線でつなぐ（開発用）
export function localTestOptions() {
  const q = new URLSearchParams(location.search);
  if (q.get('net') !== 'local') return null;
  return { lag: Number(q.get('lag') || 0), jitter: Number(q.get('jitter') || 0), loss: Number(q.get('loss') || 0) };
}

const makeId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');

class LocalTransport {
  constructor(room, opts) {
    this.opts = opts;
    this.id = makeId();
    this.kind = 'local';
    this.onmessage = null;
    this.channel = new BroadcastChannel(`rengeki-${room}`);
    this.channel.onmessage = (e) => {
      if (e.data.from !== this.id && this.onmessage) this.onmessage(e.data.body);
    };
  }

  async open() { /* すぐ使える */ }

  send(body, fast = false) {
    if (fast && Math.random() < this.opts.loss) return;
    const wait = fast ? this.opts.lag + Math.random() * this.opts.jitter : this.opts.lag;
    setTimeout(() => {
      try { this.channel.postMessage({ from: this.id, body }); } catch { /* 閉じた後 */ }
    }, wait);
  }

  close() { this.channel.close(); }
}

function loadSupabase() {
  if (window.supabase) return Promise.resolve(window.supabase);
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = SUPABASE_SCRIPT;
    el.onload = () => resolve(window.supabase);
    el.onerror = () => reject(new Error('通信用の部品を読み込めませんでした'));
    document.head.append(el);
  });
}

class SupabaseTransport {
  constructor(room) {
    this.room = room;
    this.id = makeId();
    this.kind = 'relay';
    this.onmessage = null;
    this.onkind = null;
    this.pc = null;
    this.dc = null;
    this.closed = false;
    this.pendingIce = [];
  }

  async open() {
    const lib = await loadSupabase();
    this.client = lib.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 40 } },
    });
    this.channel = this.client.channel(`rengeki-${this.room}`, { config: { broadcast: { self: false, ack: false } } });
    this.channel.on('broadcast', { event: 'm' }, ({ payload }) => {
      if (payload.from !== this.id && this.onmessage) this.onmessage(payload.body);
    });
    this.channel.on('broadcast', { event: 'rtc' }, ({ payload }) => {
      if (payload.from !== this.id && (!payload.to || payload.to === this.id)) this.handleSignal(payload);
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('サーバーに接続できませんでした')), 12000);
      this.channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer);
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timer);
          reject(new Error('サーバーに接続できませんでした'));
        }
      });
    });
  }

  relay(event, payload) {
    if (this.closed) return;
    this.channel.send({ type: 'broadcast', event, payload: { from: this.id, ...payload } });
  }

  send(body, fast = false) {
    if (fast && this.dc && this.dc.readyState === 'open') {
      try {
        this.dc.send(JSON.stringify(body));
        return;
      } catch { /* 中継に切り替える */ }
    }
    this.relay('m', { body });
  }

  // 部屋を作った側から呼ぶ。失敗しても中継のまま遊べる
  async startDirect(peerId) {
    this.peerId = peerId;
    this.makePeerConnection();
    this.attachChannel(this.pc.createDataChannel('input', { ordered: false, maxRetransmits: 0 }));
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.relay('rtc', { to: peerId, sdp: this.pc.localDescription });
  }

  makePeerConnection() {
    if (typeof RTCPeerConnection === 'undefined') return;
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.relay('rtc', { to: this.peerId, ice: e.candidate });
    };
    this.pc.ondatachannel = (e) => this.attachChannel(e.channel);
  }

  attachChannel(dc) {
    this.dc = dc;
    dc.onopen = () => {
      this.kind = 'direct';
      if (this.onkind) this.onkind('direct');
    };
    dc.onclose = () => {
      this.kind = 'relay';
      if (this.onkind) this.onkind('relay');
    };
    dc.onmessage = (e) => {
      if (this.onmessage) this.onmessage(JSON.parse(e.data));
    };
  }

  async handleSignal(p) {
    try {
      if (p.sdp) {
        this.peerId = p.from;
        if (!this.pc) this.makePeerConnection();
        if (!this.pc) return;
        await this.pc.setRemoteDescription(p.sdp);
        for (const c of this.pendingIce.splice(0)) await this.pc.addIceCandidate(c);
        if (p.sdp.type === 'offer') {
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          this.relay('rtc', { to: p.from, sdp: this.pc.localDescription });
        }
      } else if (p.ice) {
        if (this.pc && this.pc.remoteDescription) await this.pc.addIceCandidate(p.ice);
        else this.pendingIce.push(p.ice);
      }
    } catch { /* 直結できなくても中継で続行する */ }
  }

  close() {
    this.closed = true;
    try { if (this.dc) this.dc.close(); } catch { /* 無視 */ }
    try { if (this.pc) this.pc.close(); } catch { /* 無視 */ }
    try { if (this.channel) this.client.removeChannel(this.channel); } catch { /* 無視 */ }
  }
}

export function createTransport(room) {
  const local = localTestOptions();
  return local ? new LocalTransport(room, local) : new SupabaseTransport(room);
}

// 部屋での出会いの手順。host=部屋を作った側（1P）
export class OnlineLink {
  constructor({ room, host, onPeer, onMessage, onFail }) {
    this.room = room;
    this.host = host;
    this.onPeer = onPeer;
    this.onMessage = onMessage;
    this.onFail = onFail;
    this.peerId = null;
    this.timers = [];
    this.transport = createTransport(room);
  }

  async connect() {
    this.transport.onmessage = (m) => this.handle(m);
    await this.transport.open();
    this.helloTimer = setInterval(() => {
      if (!this.peerId) this.transport.send({ t: 'hello', host: this.host, id: this.transport.id });
    }, 500);
    this.transport.send({ t: 'hello', host: this.host, id: this.transport.id });
    if (!this.host) {
      this.joinTimer = setTimeout(() => {
        if (!this.peerId && this.onFail) this.onFail('その部屋は見つかりませんでした。コードを確かめてね');
      }, 10000);
    }
  }

  handle(m) {
    if (m.t === 'hello') {
      if (m.host === this.host) {
        // 同じ役割どうし（同じコードの部屋が重なった）はつながない
        if (this.host && this.onFail && !this.peerId) this.onFail('この部屋コードは使われています。作り直してね');
        return;
      }
      if (this.peerId && this.peerId !== m.id) {
        if (this.host) this.transport.send({ t: 'full', to: m.id });
        return;
      }
      if (this.peerId === m.id) return;
      this.peerId = m.id;
      clearTimeout(this.joinTimer);
      this.transport.send({ t: 'hello', host: this.host, id: this.transport.id });
      if (this.host && this.transport.startDirect) this.transport.startDirect(m.id).catch(() => {});
      if (this.onPeer) this.onPeer();
      return;
    }
    if (m.t === 'full') {
      if (m.to === this.transport.id && this.onFail) this.onFail('その部屋はもう満員です');
      return;
    }
    if (this.onMessage) this.onMessage(m);
  }

  send(m, fast = false) { this.transport.send(m, fast); }

  close() {
    clearInterval(this.helloTimer);
    clearTimeout(this.joinTimer);
    this.transport.close();
  }
}
