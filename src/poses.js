// キャラの骨格ポーズ。角度は度数で、真下が 0、前方が +90、真上が 180。
// t=胴体の傾き(+で前傾) af/ab=手前/奥の腕[上腕,前腕] lf/lb=手前/奥の脚[太もも,すね]
export const POSES = {
  idle: { t: 8, af: [52, 128], ab: [24, 112], lf: [30, -6], lb: [-22, -34] },
  walkA: { t: 10, af: [52, 126], ab: [26, 110], lf: [38, 8], lb: [-30, -48] },
  walkB: { t: 10, af: [46, 122], ab: [32, 116], lf: [-10, -38], lb: [22, -2] },
  crouch: { t: 26, af: [62, 130], ab: [34, 122], lf: [82, -12], lb: [28, -82] },
  jump: { t: 4, af: [72, 150], ab: [-18, 44], lf: [82, -18], lb: [34, -58] },
  fall: { t: 12, af: [96, 130], ab: [-40, 20], lf: [48, -10], lb: [-12, -40] },
  dashF: { t: 34, af: [70, 110], ab: [-40, -10], lf: [64, -6], lb: [-52, -74] },
  dashB: { t: -14, af: [36, 112], ab: [12, 96], lf: [36, -22], lb: [-48, -28] },
  block: { t: 2, af: [112, 168], ab: [92, 164], lf: [28, -8], lb: [-26, -34] },
  cblock: { t: 16, af: [108, 166], ab: [88, 160], lf: [82, -14], lb: [26, -82] },
  hit: { t: -20, af: [-24, 12], ab: [-44, -8], lf: [14, -8], lb: [-30, -32] },
  hitAir: { t: -52, af: [-112, -82], ab: [-148, -118], lf: [46, 14], lb: [20, -28] },
  down: { t: -86, af: [-92, -74], ab: [-70, -100], lf: [84, 88], lb: [72, 98] },
  win: { t: 0, af: [168, 176], ab: [14, 96], lf: [18, -4], lb: [-18, -10] },
  jabW: { t: 6, af: [34, 118], ab: [38, 124], lf: [32, -6], lb: [-26, -36] },
  jab: { t: 18, af: [92, 90], ab: [18, 128], lf: [38, 0], lb: [-34, -40] },
  kickW: { t: -6, af: [50, 120], ab: [20, 100], lf: [70, -40], lb: [0, -6] },
  kickM: { t: -14, af: [10, 88], ab: [-30, 50], lf: [92, 86], lb: [-4, -10] },
  heavyW: { t: -10, af: [-30, 60], ab: [60, 124], lf: [20, -18], lb: [-26, -34] },
  heavy: { t: 34, af: [97, 94], ab: [-46, 10], lf: [58, 8], lb: [-54, -60] },
  cjab: { t: 30, af: [90, 90], ab: [34, 120], lf: [82, -12], lb: [28, -82] },
  sweep: { t: 38, af: [40, 100], ab: [-20, 40], lf: [84, 86], lb: [26, -86] },
  upper: { t: -12, af: [168, 176], ab: [12, 90], lf: [34, -8], lb: [-26, -48] },
  aKick: { t: 2, af: [46, 110], ab: [-14, 40], lf: [84, 74], lb: [36, -48] },
  aPunch: { t: 24, af: [86, 82], ab: [-20, 30], lf: [62, -8], lb: [12, -52] },
  aWind: { t: -16, af: [170, 150], ab: [160, 136], lf: [62, -14], lb: [20, -42] },
  aSpike: { t: 34, af: [54, 44], ab: [66, 58], lf: [40, 2], lb: [-8, -44] },
  grabW: { t: 10, af: [60, 110], ab: [50, 104], lf: [34, -2], lb: [-28, -36] },
  grab: { t: 22, af: [90, 84], ab: [82, 78], lf: [44, 2], lb: [-36, -42] },
  throwHold: { t: -10, af: [152, 132], ab: [144, 122], lf: [32, -6], lb: [-26, -34] },
  throwEnd: { t: 40, af: [78, 66], ab: [72, 60], lf: [56, 6], lb: [-50, -56] },
  castW: { t: -8, af: [-34, 50], ab: [-20, 60], lf: [30, -14], lb: [-26, -30] },
  cast: { t: 22, af: [92, 92], ab: [84, 88], lf: [52, 4], lb: [-46, -52] },
  rising: { t: -14, af: [170, 178], ab: [-10, 60], lf: [108, 158], lb: [14, -28] },
  slam: { t: 46, af: [40, 28], ab: [48, 36], lf: [66, -8], lb: [-40, -66] },
  // 回避：前へは体を丸めて前転、後ろへは体を伸ばしてバク転（回転は render.js で付ける）
  rollTuck: { t: 118, af: [-30, 60], ab: [-40, 50], lf: [72, -112], lb: [62, -118] },
  flip: { t: -6, af: [176, 182], ab: [170, 178], lf: [8, 4], lb: [-8, -4] },
  slipEnd: { t: 18, af: [64, 126], ab: [32, 112], lf: [58, -16], lb: [-22, -72] },
  parry: { t: -4, af: [120, 60], ab: [100, 150], lf: [36, -4], lb: [-30, -40] },
  dive: { t: 20, af: [70, 120], ab: [-40, 10], lf: [48, 44], lb: [-30, -90] },
  slide: { t: -50, af: [40, 80], ab: [-60, -20], lf: [88, 90], lb: [60, 20] },
};

// 回避で1回転するコマ数（転がって移動している間）。見た目だけの値
export const EVADE_SPIN = 16;

const lerpVal = (a, b, k) => a + (b - a) * k;

export function clonePose(p) {
  return { t: p.t, af: [...p.af], ab: [...p.ab], lf: [...p.lf], lb: [...p.lb] };
}

export function blendPose(out, target, k) {
  out.t = lerpVal(out.t, target.t, k);
  for (const key of ['af', 'ab', 'lf', 'lb']) {
    out[key][0] = lerpVal(out[key][0], target[key][0], k);
    out[key][1] = lerpVal(out[key][1], target[key][1], k);
  }
  return out;
}

const walkMix = clonePose(POSES.idle);

export function targetPose(p, move) {
  switch (p.st) {
    case 'walk': {
      const phase = 0.5 + 0.5 * Math.sin(p.f * 0.36);
      walkMix.t = POSES.walkA.t;
      for (const key of ['af', 'ab', 'lf', 'lb']) {
        walkMix[key][0] = lerpVal(POSES.walkA[key][0], POSES.walkB[key][0], phase);
        walkMix[key][1] = lerpVal(POSES.walkA[key][1], POSES.walkB[key][1], phase);
      }
      return walkMix;
    }
    case 'crouch':
    case 'squat':
    case 'land':
    case 'getup':
      return POSES.crouch;
    case 'dash':
      return p.dashDir === p.facing ? POSES.dashF : POSES.dashB;
    case 'evade':
      if (p.f >= EVADE_SPIN) return POSES.slipEnd;
      return p.dashDir === p.facing ? POSES.rollTuck : POSES.flip;
    case 'air':
      return p.vy > 0 ? POSES.jump : POSES.fall;
    case 'attack': {
      let name = 'idle';
      if (move && move.anim) {
        for (const [frame, pose] of move.anim) if (p.f >= frame) name = pose;
      }
      return POSES[name] || POSES.idle;
    }
    case 'throwing': {
      const hold = (move && move.holdF) || 18;
      return p.f < hold ? POSES.throwHold : POSES.throwEnd;
    }
    case 'thrown':
    case 'hitair':
      return POSES.hitAir;
    case 'hit':
      return POSES.hit;
    case 'block':
    case 'guard':
      return p.crouching ? POSES.cblock : POSES.block;
    case 'down':
      return POSES.down;
    case 'win':
      return POSES.win;
    default:
      return POSES.idle;
  }
}
