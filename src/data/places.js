// NCU 地點庫、步行時間（預估）。所有人潮 / 空位率 / 步行分鐘皆為「模擬或預估值」，非即時資料。
// 松苑餐廳、第九餐廳目前暫停營業，已先移除；重新營業後再加回 PLACES。

// 上課建築（課表用）：依教務處「上課大樓名稱代號對照表」，顯示為「代號 名稱」，與選課系統教室代碼一致。
// 既有的 key（mgmt2、eng5、zhixi、hss、zhidao）保留，避免舊課表資料失效；志道樓不在代號表上，僅為相容保留。
export const BUILDINGS = {
  A: 'A 文學一館', C2: 'C2 文學二館', E: 'E 工程一館', E1: 'E1 工程二館（資電學院）', E2: 'E2 機械館', E3: 'E3 環工化工館',
  E4: 'E4 機電實驗室', E5: 'E5 大型力學實驗室', eng5: 'E6 工程五館（工學院）', H2: 'H2 理學院教學館', HK: 'HK 客家學院大樓',
  zhixi: 'I 志希館（管理學院）', mgmt2: 'I1 管理二館', IL: 'IL 國鼎光電大樓', L3: 'L3 國鼎圖書資料館', LH: 'LH 大講堂',
  hss: 'LS 人文社會科學大樓（文學院）', M: 'M 鴻經館', O: 'O 綜教館（語言中心）', R2: 'R2 太空及遙測研究中心',
  R3: 'R3 研究中心大樓二期（生醫理工學院）', S: 'S 科學一館（地科院）', S1: 'S1 科學二館（理學院）', S2: 'S2 科學三館',
  S4: 'S4 健雄館（科學四館）', S5: 'S5 科學五館', TR: 'TR 教學研究綜合大樓（教研大樓）', YH: 'YH 依仁堂（體育館）',
  zhidao: '志道樓',
};

// 宿舍（只作為出發地點，團隊提供名單 2026-11）。到各地點的步行時間尚未查詢，使用預設值並標「預估」。
export const DORMS = {
  dorm_f1_4: '女一～女四舍', dorm_m3: '男三舍', dorm_m9: '男九舍', dorm_m11: '男十一舍', dorm_m13: '男十三舍',
  dorm_xiwang: '曦望居', dorm_guesthouse: '中大會館', dorm_intl: '國際學舍',
};

// 任務類型。flex = 時間不夠時允許彈性縮短；icon 為 icons.js 的圖示名稱
export const KINDS = {
  meal: { label: '用餐', icon: 'meal', dur: 30, flex: false, window: [660, 870] },
  study: { label: '圖書館讀書', icon: 'study', dur: 60, flex: true },
  homework: { label: '完成作業', icon: 'homework', dur: 60, flex: false },
  group: { label: '小組討論', icon: 'group', dur: 60, flex: true },
  errand: { label: '校園事務', icon: 'errand', dur: 30, flex: true },
};

// 人潮設定＝團隊成員的使用經驗（2026-11，非實測）。等級 1 很空、2 偏空、3 普通、4 擠、5 爆滿。
// weekday：[時間(分鐘), 等級] 折線，其間線性內插；時段外沿用最近一點。adj：特定星期的調整（星期 0=日…6=六）。
// queuePeak：尖峰時估計排隊分鐘；closed：不營業的星期（營業時間未設定，請以現場為準）。quiet：安靜程度 1–5（團隊假設）。
// 「人數降低」團隊沒有給幅度，暫以 -1.5 級表示（假設）。
const H = (h, m = 0) => h * 60 + m;
const LOW = -1.5;
const BACKDOOR = {
  weekday: [[H(11, 30), 3], [H(12), 5], [H(12, 30), 5], [H(13, 30), 3], [H(16, 30), 3], [H(17), 4.5], [H(17, 30), 4.5], [H(18), 3.5], [H(19), 3.5], [H(20), 3]],
  adj: { 5: [{ from: H(16, 30), delta: LOW }], 6: [{ from: H(11), to: H(14), delta: LOW }, { from: H(16, 30), delta: LOW }], 0: [{ from: H(11), to: H(14), delta: LOW }] },
};
export const PLACES = {
  backdoor: { id: 'backdoor', name: '後門餐飲區', short: '後門', kinds: ['meal'], eat: 30, queuePeak: 20, profile: BACKDOOR },
  nightmarket: { id: 'nightmarket', name: '宵夜街（外帶）', short: '宵夜街外帶', kinds: ['meal'], eat: 20, takeaway: true, queuePeak: 20, profile: BACKDOOR, profileNote: '團隊經驗：與後門差不多' },
  pinecone: { id: 'pinecone', name: '松果餐廳', short: '松果', kinds: ['meal'], eat: 30, queuePeak: 15, closed: [0, 6],
    profile: { weekday: [[H(11, 30), 2], [H(12), 4], [H(12, 20), 4], [H(12, 50), 2]] } },
  female14: { id: 'female14', name: '女十四舍 B1 商場', short: '女十四', kinds: ['meal'], eat: 30, queuePeak: 7,
    profile: { weekday: [[H(11, 30), 2], [H(12), 3.5], [H(12, 30), 3.5], [H(13), 2], [H(16, 30), 2], [H(17), 3.5], [H(17, 30), 3.5], [H(18), 2]] } },
  male9_711: { id: 'male9_711', name: '男九 7-11', short: '男九 7-11', kinds: ['meal'], eat: 15, takeaway: true, queuePeak: 25,
    profile: { weekday: [[H(11, 30), 3], [H(12), 5], [H(12, 30), 5], [H(13), 3], [H(16, 30), 3], [H(17), 4], [H(17, 30), 4], [H(18), 3]], weekend: [[0, 2]], weekendNote: '六日沒什麼人' } },
  mainlib: { id: 'mainlib', name: '總圖書館 閱覽區', short: '總圖書館', kinds: ['study', 'homework'], study: true, quiet: 4,
    profile: { weekday: [[H(10), 2], [H(15), 2], [H(19), 3]], adj: { 6: [{ delta: 1 }], 0: [{ delta: 1 }] } } },
  zhongzheng: { id: 'zhongzheng', name: '中正圖書館 K書中心', short: 'K書中心', kinds: ['study', 'homework'], study: true, quiet: 5,
    profile: { weekday: [[H(10), 3], [H(15), 3], [H(18), 4]], weekend: [[0, 3.5]] } },
  // 小組討論：校內查無開放給學生的討論室公開資料，改由使用者自選地點；不提供人潮或步行估計
  self: { id: 'self', name: '自選討論地點（例如空教室、系館）', short: '自選地點', kinds: ['group'], nodata: true },
  // 行政大樓：不蒐集人潮，只作為辦事目的地（排程時顯示「無人潮資料」）
  admin: { id: 'admin', name: '行政大樓', short: '行政大樓', kinds: ['errand'], nodata: true },
};

export const placeName = (id) => PLACES[id]?.name || BUILDINGS[id] || DORMS[id] || '起點';
export const placeShort = (id) => PLACES[id]?.short || BUILDINGS[id] || DORMS[id] || '起點';
// 出發地點分組：宿舍、教學大樓、校園地點（自選地點與行政大樓不列）
export const originGroups = () => [
  ['宿舍', Object.entries(DORMS)],
  ['教學大樓', Object.entries(BUILDINGS)],
  ['校園地點', Object.values(PLACES).filter((p) => !p.nodata).map((p) => [p.id, p.name])],
];
export const originOptions = () => originGroups().flatMap(([, list]) => list);

// 兩點間步行分鐘。GMAPS＝團隊以 Google 地圖步行路線查詢（2026-11-27，取整分鐘）；EST＝人工預估（未查證）。
const GMAPS = {
  'mgmt2|backdoor': 9, 'mgmt2|nightmarket': 10, 'mgmt2|pinecone': 10, 'mgmt2|female14': 11, 'mgmt2|male9_711': 3,
  'mgmt2|mainlib': 4, 'mgmt2|zhongzheng': 4,
  'eng5|backdoor': 7, 'eng5|pinecone': 14, 'eng5|female14': 15, 'eng5|male9_711': 15, 'eng5|mainlib': 12,
  'backdoor|mainlib': 7, 'pinecone|mainlib': 6, 'male9_711|mainlib': 5,
  // 第二批（2026-11-28）
  'backdoor|nightmarket': 5, 'backdoor|pinecone': 8, 'backdoor|female14': 6, 'backdoor|male9_711': 12, 'backdoor|zhongzheng': 9,
  'nightmarket|pinecone': 6, 'nightmarket|female14': 2, 'nightmarket|male9_711': 10, 'nightmarket|mainlib': 7, 'nightmarket|zhongzheng': 7,
  'pinecone|female14': 4, 'pinecone|male9_711': 7, 'pinecone|zhongzheng': 8,
  'female14|male9_711': 9, 'female14|mainlib': 6, 'female14|zhongzheng': 6,
  'male9_711|zhongzheng': 5, 'mainlib|zhongzheng': 1,
};
const EST = {
  'mgmt2|admin': 6, 'eng5|nightmarket': 7, 'eng5|zhongzheng': 5, 'eng5|admin': 8,
  'mgmt2|eng5': 9, 'mainlib|zhongzheng': 3,
  'backdoor|nightmarket': 4, 'backdoor|female14': 8, 'nightmarket|female14': 7,
  'dorm_m9|male9_711': 1, // 7-11 位於男九舍（團隊說明），步行時間為預估
};
const W = { ...EST, ...GMAPS };
const lookup = (t, a, b) => t[a + '|' + b] ?? t[b + '|' + a];
// 'gmaps'：Google 地圖查詢；'estimate'：預估或預設值；'none'：不需移動
export const walkSource = (a, b) => (a === b || a === 'self' || b === 'self' ? 'none' : a && b && lookup(GMAPS, a, b) != null ? 'gmaps' : 'estimate');
export const DEFAULT_WALK = 7;
export const walk = (a, b) => {
  if (a === b || a === 'self' || b === 'self') return 0; // 自選地點不估算步行
  // 未列在表中的組合（含新增的系館、松果、男九 7-11）用預設值，畫面標「預估」
  if (!a || !b) return 5;
  return lookup(W, a, b) ?? DEFAULT_WALK;
};

export const PROVENANCE =
  '數據來源分三類：「觀察」＝團隊現場觀察紀錄；「模擬」＝團隊人工設定的示範參數（基準值與下課尖峰規則），沒有使用 Wi-Fi、選課或人流感測資料；「模型」＝統計模型，只有在該地點的觀察資料通過驗證後才會出現。步行時間為人工預估。';
