// NCU 地點庫、步行時間（預估）。所有人潮 / 空位率 / 步行分鐘皆為「模擬或預估值」，非即時資料。
// 松苑餐廳、第九餐廳目前暫停營業，已先移除；重新營業後再加回 PLACES。

// 上課建築（課表用）
export const BUILDINGS = {
  mgmt2: '管理二館',
  eng5: '工程五館',
  zhixi: '志希館',
  zhidao: '志道樓',
  hss: '人文社會科學大樓',
};

// 任務類型。flex = 時間不夠時允許彈性縮短；icon 為 icons.js 的圖示名稱
export const KINDS = {
  meal: { label: '用餐', icon: 'meal', dur: 30, flex: false, window: [660, 870] },
  study: { label: '圖書館讀書', icon: 'study', dur: 60, flex: true },
  homework: { label: '完成作業', icon: 'homework', dur: 60, flex: false },
  group: { label: '小組討論', icon: 'group', dur: 60, flex: true },
  errand: { label: '校園事務', icon: 'errand', dur: 30, flex: true },
};

// base/peak：模擬人潮 = base + peak × 下課尖峰係數（用餐/辦事）；vac：讀書空間 15:00 的模擬空位率（%）；quiet：安靜程度 1–5
export const PLACES = {
  backdoor: { id: 'backdoor', name: '後門餐飲區', short: '後門', kinds: ['meal'], eat: 30, base: 30, peak: 55 },
  female14: { id: 'female14', name: '女十四舍 B1 商場', short: '女十四', kinds: ['meal'], eat: 30, base: 25, peak: 30 },
  nightmarket: { id: 'nightmarket', name: '宵夜街（外帶）', short: '宵夜街外帶', kinds: ['meal'], eat: 20, takeaway: true, base: 24, peak: 24 },
  mainlib: { id: 'mainlib', name: '總圖書館 閱覽區', short: '總圖書館', kinds: ['study', 'homework'], vac: 68, quiet: 4 },
  zhongzheng: { id: 'zhongzheng', name: '中正圖書館 K書中心', short: 'K書中心', kinds: ['study', 'homework'], vac: 52, quiet: 5 },
  youyi: { id: 'youyi', name: '游藝館 討論空間', short: '游藝館', kinds: ['study', 'homework', 'group'], vac: 76, quiet: 2 },
  admin: { id: 'admin', name: '行政大樓', short: '行政大樓', kinds: ['errand'], base: 20, peak: 15 },
};

export const placeName = (id) => PLACES[id]?.name || BUILDINGS[id] || '起點';
export const placeShort = (id) => PLACES[id]?.short || BUILDINGS[id] || '起點';
export const originOptions = () => [...Object.entries(BUILDINGS).map(([id, name]) => [id, name]), ...Object.values(PLACES).map((p) => [p.id, p.name])];

// 兩點間預估步行分鐘（人工估算；實際請以地圖為準）
const W = {
  'mgmt2|backdoor': 8, 'mgmt2|female14': 9, 'mgmt2|nightmarket': 11,
  'mgmt2|mainlib': 8, 'mgmt2|zhongzheng': 7, 'mgmt2|youyi': 6, 'mgmt2|admin': 6,
  'eng5|backdoor': 6, 'eng5|female14': 7, 'eng5|nightmarket': 7,
  'eng5|mainlib': 6, 'eng5|zhongzheng': 5, 'eng5|youyi': 4, 'eng5|admin': 8,
  'mgmt2|eng5': 9,
  'mainlib|zhongzheng': 3, 'mainlib|youyi': 5, 'zhongzheng|youyi': 5,
  'backdoor|nightmarket': 4, 'backdoor|female14': 8, 'nightmarket|female14': 7,
};
export const DEFAULT_WALK = 7;
export const walk = (a, b) => {
  if (a === b) return 0;
  if (!a || !b) return 5;
  return W[a + '|' + b] ?? W[b + '|' + a] ?? DEFAULT_WALK;
};

export const PROVENANCE =
  '數據來源分三類：「觀察」＝團隊現場觀察紀錄；「模擬」＝人工設定的示範參數（假設的選課人數分布、Wi-Fi 密度與下課尖峰規則），並非即時感測；「模型」＝尚未實作，目前不會出現。步行時間為人工預估。';
