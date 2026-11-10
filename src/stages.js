// ステージの一覧と並び順。見た目は render.js の STAGES、戦闘に関わる仕掛け（ギミック）はここに書く
export const STAGE_IDS = [
  'sunset', 'foundry', 'rain', 'storm', 'bamboo', 'moonroof', 'snow', 'festival',
  'onirock', 'harbor', 'autumn', 'swamp', 'mirror', 'skytower', 'castle', 'powder',
];

export const STAGE_INFO = {
  sunset: { name: '夕焼け峠' },
  foundry: { name: '鉄の製錬所' },
  rain: { name: '雨の社' },
  storm: { name: '雷雲の頂' },
  bamboo: { name: '竹林の道' },
  moonroof: { name: '月夜の屋根' },
  snow: { name: '雪原' },
  festival: { name: '祭りの舞台' },
  onirock: { name: '鬼の岩山' },
  harbor: { name: '港の倉庫' },
  autumn: { name: '紅葉の山道' },
  swamp: { name: '霧の沼地' },
  mirror: { name: '鏡の間' },
  skytower: { name: '雲の上の塔' },
  castle: { name: '城門' },
  powder: { name: '火薬工房' },
};
