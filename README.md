# AI Campus Flow

給中央大學學生的校園行程助手：讀取課表找出空堂，依步行時間、人潮與截止時間安排吃飯、讀書、作業與討論，並說明每個推薦的理由。另外可以讓團隊回報真實人潮，資料累積後再評估預測模型。

正式網站：<https://ai-campus-flow-qtg2.vercel.app/>（Vercel，`main` 分支自動部署）

## 功能（現況）

| 功能 | 狀態 |
|---|---|
| 課表：中大節次格子（1–9、Z、A–F）、新增／編輯／刪除、連堂、衝突檢查、清除 | 可用 |
| 示範課表：另外保存、唯讀，切換不影響自己的課表 | 可用 |
| Planner：自然語言解析（地點、時段、時長、截止）、手動修改、偏好、換地點、調整順序、一鍵重新調配 | 可用（規則式，非大型語言模型） |
| 人潮：五種來源（模擬／真實觀察／混合估計／模型預測／無資料），以擁擠度 1–5 顯示 | 可用；模擬值來自團隊經驗，非實測 |
| 人潮回報、CSV 匯出入、資料儀表板、組員蒐集進度、模型評估 | 可用 |
| 團隊同步（Supabase）：匿名回報、Email 登入、組員直接核可、管理員審核 | 程式完成並以模擬伺服器與本機 PostgreSQL 測試；正式環境需依文件設定與驗證 |
| 預測模型（殘差核平滑回歸＋留一日驗證） | 程式完成；尚無真實資料通過驗證 |
| 校園地點、後門與宵夜街餐廳目錄（35 間，營業狀態待確認） | 可用 |
| PWA（可加入主畫面、離線開啟） | 可用 |

## 開發與測試

```bash
npm install
npm run dev          # 本機開發
npm run build        # 建置
npm test             # 單元、不變條件、一致性、隨機排程（fuzz）、模型、資料守門測試
```

端對端（需 Playwright + Chromium）：

```bash
npm run build && npx vite preview --port 4173 &
python3 -I e2e/mobile.py                     # 手機版完整流程
# 團隊同步／登入（假的 Supabase 端點）
VITE_SUPABASE_URL=https://e2etest.supabase.co VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx npx vite build --outDir dist-sync
npx vite preview --outDir dist-sync --port 4174 &
python3 -I e2e/sync.py && python3 -I e2e/auth.py
```

資料庫權限（本機 PostgreSQL，不需 Supabase）：`PGHOST=... bash supabase/test/run.sh`

## 文件

- `docs/architecture.md`：系統架構、資料流、儲存與隔離
- `docs/ai-architecture.md`：人潮資料來源、模型與評估方式、限制
- `docs/supabase-plan.md`：Supabase 建立、SQL、環境變數、管理員初始化、驗證清單
- `docs/audit-2026-11.md`：審查報告

## 資料誠實原則

排程是規則式演算法，不是大型語言模型。人潮「模擬」值來自團隊成員經驗；擁擠度是主觀等級，不是空位率或人流量。示範資料一律標示「示範」且不上傳。模型只有在真實資料通過驗證後才會被標為「模型預測」。
