// 校園地點：只收錄有官方資料佐證的事實，不含營業時間、價格、評價。
// 來源代碼見 SOURCES。松苑餐廳、第九餐廳暫停營業，未列入。
export const SOURCES = {
  map: '中大校園導覽圖（2024.08 / 2025.01）',
  lib: '中大圖書館簡介',
  guide: '中大 Campus Guide（2024.08）',
  bldg: '教務處 上課大樓代號表',
  bus: '中大交通路線資訊（校園公車站牌）',
  safe: '中大安全地圖（SOS 求救點位置）',
  team: '團隊實地確認（2026-11）',
  veg: '總務處 蔬食友善餐廳名單（2022，店家可能已異動）',
};

export const LOCATION_KINDS = ['讀書', '教學', '行政', '用餐', '活動', '休閒', '運動', '交通'];

// query：地圖搜尋字串（以名稱搜尋，非精確座標）
export const CAMPUS_LOCATIONS = [
  { name: '總圖書館', kind: '讀書', description: '1994 年 6 月竣工。1F 借還書與參考諮詢、2F 現期期刊、3–6F 書庫與公用研究室、7F 博碩士論文、B1 閱報室。', source: 'lib', query: '國立中央大學 總圖書館' },
  { name: '中正圖書館（舊圖）', kind: '讀書', description: '2F 有視聽資料室、K書中心、英語自學中心。', source: 'lib', query: '國立中央大學 中正圖書館' },
  { name: '國鼎圖書資料館', kind: '讀書', description: '為紀念李國鼎先生設置的國鼎分館，1F 報刊閱覽室、B1 典藏李國鼎先生圖書文物。', source: 'lib', query: '國立中央大學 國鼎圖書資料館' },
  { name: '志希館', kind: '教學', description: '管理學院辦公室所在、課程代號 I 館；校園公車站牌「志希館」；館前露天廣場有小木屋鬆餅。', source: 'map', query: '國立中央大學 志希館' },
  { name: '管理二館', kind: '教學', description: '課程代號 I1。', source: 'bldg', query: '國立中央大學 管理二館' },
  { name: '工程五館', kind: '教學', description: '課程代號 E6；工學院辦公室、資訊電機學院辦公室所在。', source: 'map', query: '國立中央大學 工程五館' },
  { name: '教學研究綜合大樓', kind: '教學', description: '位於校園中軸線；永續與綠能科技研究學院辦公室所在；內有松果造型的大禮堂（約 1,500 席）。', source: 'guide', query: '國立中央大學 教學研究綜合大樓' },
  { name: '人文社會科學大樓', kind: '教學', description: '校園導覽圖標示的教學大樓之一。', source: 'map', query: '國立中央大學 人文社會科學大樓' },
  { name: '行政大樓', kind: '行政', description: '校園導覽圖標示的行政大樓；辦理事項請先向承辦單位確認。', source: 'map', query: '國立中央大學 行政大樓' },
  { name: '松果餐廳', kind: '用餐', description: '校園導覽圖標示的餐廳；店家以現場為準。', source: 'map', query: '國立中央大學 松果餐廳' },
  { name: '女十四舍 B1 商場', kind: '用餐', description: '宿舍地下一樓商場；2022 名單列有拉亞漢堡，現況請以現場為準。', source: 'veg', query: '國立中央大學 女14舍' },
  { name: '後門（餐飲區）', kind: '用餐', description: '後門一帶有早餐與簡餐店家，另見「後門美食」分頁。', source: 'safe', query: '國立中央大學 後門' },
  { name: '宵夜街', kind: '用餐', description: '校內安全地圖標示有求救點的區域，店家另見「宵夜街美食」分頁。', source: 'safe', query: '國立中央大學 宵夜街' },
  { name: '依仁堂', kind: '活動', description: '校園公車站牌「依仁堂」；安全地圖標示的活動場所。', source: 'bus', query: '國立中央大學 依仁堂' },
  { name: '游藝館', kind: '活動', description: '有練舞空間；沒有開放的討論空間。', source: 'team', query: '國立中央大學 游藝館' },
  { name: '百花川', kind: '休閒', description: '橫貫校園的引水渠道；右側為百花川文學步道，鑄刻十位文壇校友的作品。', source: 'guide', query: '國立中央大學 百花川' },
  { name: '中大湖', kind: '休閒', description: '校園導覽圖標示的湖區（南側、湖島設有求救點）。', source: 'safe', query: '國立中央大學 中大湖' },
  { name: '中大路木棉花道', kind: '休閒', description: '筆直的校門大道；學校導覽稱春夏之交木棉花開。', source: 'guide', query: '國立中央大學 中大路' },
  { name: '桃園市中大國民運動中心', kind: '運動', description: '校園導覽圖標示；另有室內游泳池與室外排球場。開放資訊請向場館確認。', source: 'map', query: '桃園市中大國民運動中心' },
  { name: '前門（正門圓環）', kind: '交通', description: '校園公車站牌「前門警衛室」；市區公車 132、133、172 行駛於中壢市區與中大之間。', source: 'bus', query: '國立中央大學 正門' },
];
