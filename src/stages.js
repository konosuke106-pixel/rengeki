// ステージの一覧と並び順、戦闘に関わる仕掛け（ギミック）の数値。見た目は render.js の STAGES。
// ギミックはすべて「試合が始まってからのコマ数」だけで動く（乱数・時刻は使わない。オンラインでずれないため）
export const STAGE_IDS = [
  'arena', 'sunset', 'foundry', 'rain', 'storm', 'bamboo', 'moonroof', 'snow', 'festival',
  'onirock', 'harbor', 'autumn', 'swamp', 'mirror', 'skytower', 'castle', 'powder',
];

// gim の種類
//   wind   … every コマごとに、warn コマの予告のあと len コマ風が吹き、毎コマ push だけ流される（向きは交互）
//   hotWall… のけぞり中に画面端へ着くと hit を受ける
//   slip   … のけぞり・ガード中の減速（ふだんは 0.86）
//   spot   … every コマごとに、2人に交互に狙いを付けて印を出し、warn のあと active コマの間 幅 w に当たり（poison なら毒）
//   slow   … 歩きとダッシュの速さの倍率
//   drum   … every コマごとに2人ともゲージが meter 増える
//   mover  … every コマごとに画面端から横切る物（予告 warn、速さ vx、高さ h。向きは交互）
//   crate  … 左右に揺れ続ける荷物（振れ幅 amp、周期 period、下端の高さ y）
//   mirror … 飛び道具が画面端で1回跳ね返る
//   gravity… 重力の倍率
//   barrels… 床の樽。攻撃や飛び道具が当たると爆発し、respawn コマ後に元に戻る
export const STAGE_INFO = {
  // 仕掛けのない普通の舞台。どのキャラの「おまかせ」でもなく、選んだときだけ使う
  arena: { name: '闘技場', note: '仕掛けなし：腕だけで勝負する舞台', plain: true, gim: {} },
  sunset: { name: '夕焼け峠', note: '突風：ときどき風で流される', gim: { wind: { every: 900, warn: 60, len: 180, push: 1.8 } } },
  foundry: { name: '鉄の製錬所', note: '熱い壁：端に叩きつけられるとやけど', gim: { hotWall: { dmg: 40, stun: 24, kb: 6, launch: 9, kd: true, hs: 10, fx: 'h' } } },
  rain: { name: '雨の社', note: 'ぬかるみ：攻撃を受けると遠くまで滑る', gim: { slip: 0.94 } },
  storm: {
    name: '雷雲の頂', note: '落雷：印の場所に雷が落ちる',
    gim: { spot: { kind: 'bolt', every: 420, warn: 70, active: 8, w: 120, h: 999, hit: { dmg: 70, stun: 30, kb: 3, launch: 12, kd: true, hs: 12, fx: 'h' } } },
  },
  bamboo: {
    name: '竹林の道', note: '倒れる竹：印の場所に竹が倒れてくる',
    gim: { spot: { kind: 'bamboo', every: 480, warn: 70, active: 10, w: 90, h: 999, hit: { dmg: 60, stun: 30, kb: 4, launch: 8, kd: true, hs: 10, fx: 'h' } } },
  },
  moonroof: {
    name: '月夜の屋根', note: '瓦落とし：ときどき瓦が降ってくる',
    gim: { spot: { kind: 'tile', every: 240, warn: 50, active: 6, w: 60, h: 999, hit: { dmg: 35, stun: 22, kb: 2, hs: 8, fx: 'm' } } },
  },
  snow: { name: '雪原', note: '深い雪：歩きとダッシュが遅くなる', gim: { slow: 0.8 } },
  festival: { name: '祭りの舞台', note: '太鼓の拍子：鳴るたびにゲージが増える', gim: { drum: { every: 300, meter: 12 } } },
  onirock: {
    name: '鬼の岩山', note: '落石：大岩が転がってくる。跳んでよける',
    gim: { mover: { kind: 'boulder', every: 600, warn: 70, vx: 9, w: 90, h: 90, hit: { dmg: 80, stun: 30, kb: 7, launch: 12, kd: true, hs: 12, fx: 'h' } } },
  },
  harbor: {
    name: '港の倉庫', note: '揺れる荷物：当たると吹き飛ぶ。しゃがめばくぐれる',
    gim: { crate: { amp: 520, period: 400, y: 130, w: 90, h: 80, hit: { dmg: 60, stun: 26, kb: 9, launch: 10, kd: true, hs: 11, fx: 'h' } } },
  },
  autumn: {
    name: '紅葉の山道', note: 'つむじ風：巻き込まれると打ち上げられる',
    gim: { mover: { kind: 'whirl', every: 540, warn: 60, vx: 5, w: 80, h: 220, hit: { dmg: 20, stun: 30, kb: 1, launch: 19, hs: 6, fx: 'm' } } },
  },
  swamp: {
    name: '霧の沼地', note: '毒の霧：霧の中にいると毒になる',
    gim: { spot: { kind: 'fog', every: 540, warn: 60, active: 150, w: 300, h: 200, poison: 120 } },
  },
  mirror: { name: '鏡の間', note: '鏡の壁：飛び道具が端で1回跳ね返る', gim: { mirror: true } },
  skytower: { name: '雲の上の塔', note: '軽い重力：高く跳べて空中コンボが続く', gim: { gravity: 0.72 } },
  castle: {
    name: '城門', note: '矢の雨：表示された範囲に矢が降る',
    gim: { spot: { kind: 'arrows', every: 420, warn: 80, active: 10, w: 240, h: 999, hit: { dmg: 50, stun: 26, kb: 2, hs: 9, fx: 'm' } } },
  },
  powder: {
    name: '火薬工房', note: '火薬樽：攻撃を当てると爆発する',
    gim: { barrels: { xs: [-420, 420], respawn: 600, w: 60, h: 80, blast: 260, hit: { dmg: 80, stun: 30, kb: 9, launch: 14, kd: true, hs: 13, fx: 'h' } } },
  },
};
