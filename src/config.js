// ゲーム全体の定数。画面は 1280x720 の論理座標で扱う。
export const VIEW_W = 1280;
export const VIEW_H = 720;
export const MAX_VIEW_W = 2160;   // 細長い画面で左右に見せる限界（戦闘の結果には影響しない）
export const GROUND_Y = 628;      // 地面の画面上の高さ
export const STAGE_HALF = 820;    // ステージの端（中心からの距離）
export const MAX_SEP = 1040;      // 2人が離れられる最大距離（画面内に収める）
export const GRAVITY = 0.95;
export const ROUND_FRAMES = 99 * 60;
export const WINS_NEEDED = 2;
export const MAX_ROUNDS = 5;
export const METER_MAX = 200;
export const SUPER_COST = 100;
export const BUFFER_FRAMES = 7;   // 先行入力の猶予

// 1フレーム分の入力はこのビットの組み合わせで表す
export const BTN = {
  U: 1, D: 2, L: 4, R: 8,
  A: 16,   // 弱
  B: 32,   // 中
  C: 64,   // 強
  S: 128,  // 必殺
  T: 256,  // 投げ
  X: 512,  // 超必殺
  G: 1024, // ガード（押している間だけ守る。当たる直前に押し始めるとジャストガード）
};
export const JUST_WINDOW = 5;   // ジャストガードの受付（当たる何コマ前までに押し始めればよいか）
export const STAGGER = 28;      // ジャストガードされた側がよろける長さ
// 回避（左右を押しながらガードを押す）：全体のコマ数・すり抜けるコマ数・速さ
export const EVADE_TOTAL = 26;
export const EVADE_INV = 14;
export const EVADE_SPEED = 9;
export const ATTACK_MASK = BTN.A | BTN.B | BTN.C | BTN.S | BTN.T | BTN.X;
