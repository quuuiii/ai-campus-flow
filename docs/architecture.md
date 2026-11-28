# 系統架構（2026-11-28）

Vanilla JS + Vite 的單頁應用，部署在 Vercel（靜態檔案）。團隊資料庫為 Supabase（Postgres + RLS + REST），前端以 `fetch` 直接呼叫，不使用 SDK。

## 目錄

```
src/
  main.js            路由、共用 ctx（save / toast / go / courses() / plan() / allObs() / sync / auth / demo）
  store.js           localStorage 讀寫、驗證、遷移、示範隔離、觀察紀錄、CSV
  util.js  icons.js  共用工具、Lucide 圖示
  data/              places（地點、時段經驗、步行時間、宿舍、系館）、demo（示範課表）、demoObs（示範觀察）、food、locations
  engine/
    scheduler.js     需求解析、空堂、排程、縮短、重新調配、推薦理由
    crowd.js         人潮來源判定（五種）、擁擠度顯示、排隊估計
    model.js         殘差核平滑回歸、留一日驗證
    stats.js         資料儀表板、組員蒐集缺口
  lib/
    sync.js          待上傳佇列、上傳、下載團隊資料、合併
    auth.js          Email magic link、token 更新、角色、管理員審核
  pages/             home、plan、schedule、explore、settings
supabase/schema.sql  資料表、RLS、欄位權限、trigger、view
supabase/test/       本機 PostgreSQL 驗證腳本
test/                node:test 單元測試     e2e/  Playwright 端對端
```

## 本機儲存（localStorage）

| key | 內容 |
|---|---|
| `campus-flow-v2` | `{ courses（只有使用者的課）, plan, demoPlan, ui, demo }` |
| `campus-flow-v1` | 舊版資料，遷移後保留不刪 |
| `campus-flow-observations-v1` | 這台裝置的觀察紀錄 |
| `campus-flow-outbox-v1` | 待上傳佇列（pending / failed） |
| `campus-flow-remote-obs-v1` | 下載的團隊已核可資料 |
| `campus-flow-demo-days`、`-demo-scenario` | 示範人潮資料設定 |
| `campus-flow-session-v1` | 登入 token |

損壞的資料會先備份成 `campus-flow-v2-corrupt-<時間>` 再重設。

## 示範模式的隔離

- **示範課表**：不寫進 `courses`，每次由 `demoCourses()` 產生；示範規劃存在 `demoPlan`。`ctx.courses()`／`ctx.plan()` 依 `demo` 旗標回傳對應的一份。示範課表在課表頁為唯讀。
- **示範人潮資料**：只在記憶體產生，帶 `demo: true`，不進「我的觀察紀錄」、不進待上傳佇列、不計入組員蒐集進度。
- 舊版把示範課混在 `courses`（`demo: true`）的資料，載入時自動拆開。

## 排程流程

1. `parseRequest`：切句 → 類型 → 時長／時段／截止／指定地點；看不懂的回傳 `unknown`，推測上下午回傳 `notes`。
2. `computeSlots`：課表 → 空堂（含前後教室）。
3. `buildPlan`：依序為每個任務在空堂中找候選地點（步行、緩衝、排隊、時段、截止、營業時間），評分挑選；指定地點不換；縮短採「試算、不行就還原」；有時段的任務在時段開始時抵達，之前標為自由時間。超出規劃範圍的任務回傳 `extendTo`，由介面詢問是否延長。
4. `reallocate`：≤ 6 項窮舉順序，> 6 項局部搜尋；必要時縮短彈性任務或延後。
5. 不變條件由 `test/fuzz.test.js` 以隨機課表、隨機順序／縮短／換地點驗證。

## 團隊同步資料流

回報 → 本機 → 待上傳佇列 → `POST crowd_observations?on_conflict=client_id`（成功移出；離線／5xx／429 保留重送；其他 4xx 標記被拒絕）→ 伺服器 trigger 決定狀態（組員核可、其他待審）→ 管理員審核 → `GET crowd_observations_public`（只有已核可、去識別）→ 與本機合併供儀表板與模型使用。

## 清除

- 本機清除（設定頁）只刪這台裝置的資料，不影響雲端。
- 雲端資料不能從 App 刪除；管理員可設為「拒絕」排除於統計，真正刪除需在 Supabase 後台。
