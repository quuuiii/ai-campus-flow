// NCU 地點庫、步行時間（預估）與 Demo 情境資料。
// 所有人潮 / 空位率 / 步行分鐘皆為「模擬或預估值」，非即時資料。

export const DAYS = ['日', '一', '二', '三', '四', '五', '六'];

// 上課建築（課表用）
export const BUILDINGS = {
  mgmt2: '管理二館',
  eng5: '工程五館',
  zhixi: '志希館',
  zhidao: '志道樓',
  hss: '人文社會科學大樓',
};

// 任務類型。flex = 時間不夠時允許彈性縮短
export const KINDS = {
  meal: { label: '午餐', icon: '🍱', dur: 30, flex: false, window: [660, 870] },
  study: { label: '圖書館讀書', icon: '📚', dur: 60, flex: true },
  homework: { label: '完成作業', icon: '✍️', dur: 60, flex: false },
  group: { label: '小組討論', icon: '💬', dur: 60, flex: true },
  errand: { label: '校園事務', icon: '🗂️', dur: 30, flex: true },
};

// base/peak：人潮 = base + peak × 下課尖峰係數（用餐/辦事）
// vac：讀書空間在 15:00 的空位率（%）；quiet：安靜程度 1–5
export const PLACES = {
  songyuan: { id: 'songyuan', name: '松苑餐廳', short: '松苑', kinds: ['meal'], eat: 30, base: 30, peak: 58 },
  dorm9: { id: 'dorm9', name: '第九餐廳（男九舍旁）', short: '第九餐廳', kinds: ['meal'], eat: 30, base: 22, peak: 20 },
  female14: { id: 'female14', name: '女十四舍 B1 商場', short: '女十四', kinds: ['meal'], eat: 30, base: 25, peak: 30 },
  nightmarket: { id: 'nightmarket', name: '宵夜街（外帶）', short: '宵夜街外帶', kinds: ['meal'], eat: 20, takeaway: true, base: 24, peak: 24 },
  mainlib: { id: 'mainlib', name: '總圖書館 閱覽區', short: '總圖書館', kinds: ['study', 'homework'], vac: 68, quiet: 4 },
  zhongzheng: { id: 'zhongzheng', name: '中正圖書館 K書中心', short: 'K書中心', kinds: ['study', 'homework'], vac: 52, quiet: 5 },
  youyi: { id: 'youyi', name: '游藝館 討論空間', short: '游藝館', kinds: ['study', 'homework', 'group'], vac: 76, quiet: 2 },
  admin: { id: 'admin', name: '行政大樓', short: '行政大樓', kinds: ['errand'], base: 20, peak: 15 },
};

export const placeName = (id) => PLACES[id]?.name || BUILDINGS[id] || '起點';
export const placeShort = (id) => PLACES[id]?.short || BUILDINGS[id] || '起點';

// 兩點間預估步行分鐘（人工估算，Demo 用；實際請以地圖為準）
const W = {
  'mgmt2|songyuan': 4, 'mgmt2|dorm9': 4, 'mgmt2|female14': 9, 'mgmt2|nightmarket': 11,
  'mgmt2|mainlib': 8, 'mgmt2|zhongzheng': 7, 'mgmt2|youyi': 6, 'mgmt2|admin': 6,
  'eng5|songyuan': 4, 'eng5|dorm9': 5, 'eng5|female14': 7, 'eng5|nightmarket': 7,
  'eng5|mainlib': 6, 'eng5|zhongzheng': 5, 'eng5|youyi': 4, 'eng5|admin': 8,
  'mgmt2|eng5': 9,
  'mainlib|zhongzheng': 3, 'mainlib|youyi': 5, 'zhongzheng|youyi': 5,
  'songyuan|dorm9': 6, 'songyuan|female14': 3, 'dorm9|female14': 7,
};
export const walk = (a, b) => {
  if (a === b) return 0;
  if (!a || !b) return 5;
  return W[a + '|' + b] ?? W[b + '|' + a] ?? 7;
};

export const PROVENANCE =
  '數據模型（模擬）：以「假設的歷史選課人數分布」與「校園 Wi-Fi 連線密度參數」搭配下課尖峰規則估算，並非即時感測或真實統計；步行時間為人工預估。正式上線需串接選課系統與 Wi-Fi 匿名計數。';

// ── Demo 情境（中央大學學生日常）──
export const DEMO_TEXT = '我想吃午餐、去圖書館讀書一小時，還要在五點前完成一份作業。';
export const demoCourses = () => {
  const rows = [];
  let id = 1;
  for (const day of ['1', '2', '3', '4', '5']) {
    rows.push(
      { id: id++, day, start: '09:00', end: '12:00', name: '系統分析與設計', building: 'mgmt2' },
      { id: id++, day, start: '13:00', end: '15:00', name: '企業資料通訊', building: 'eng5' },
    );
  }
  return rows;
};
