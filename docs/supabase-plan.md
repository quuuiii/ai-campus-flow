# Supabase 導入評估與計畫（尚未實作、尚未建立任何帳號或資源）

## 為什麼要（以及何時才需要）
目前觀察紀錄只存在各自手機的 localStorage，四位組員的資料無法合併，預測模型也就沒有足夠樣本。Supabase（Postgres + RLS + 自動 REST API）能讓大家寫入同一張表，且前端不需要自架後端。**若比賽期間用共用 Google 表單 / CSV 彙整就夠，可以不接**；接上後才有「團隊共同資料集」。

## 資料表
見 `supabase/schema.sql`（草案）：`crowd_observations`（id、observed_at、place_id、crowd_level 1–5、queue_minutes、method、note、device_hash、created_at）。
地點只能是前端 PLACES 白名單；課表**不上傳**（含個資、無必要）。

## 安全（RLS）
- 啟用 RLS；匿名角色只有 `insert` 與讀取公開欄位，不能 update / delete。
- 前端只放 **anon key + project URL**（公開可見是設計如此，安全性來自 RLS）。**service_role key 絕不可進前端、repo、截圖或簡報。**
- 清理壞資料、刪除請在 Supabase 後台（或僅限本機腳本）用 service_role 處理。

## 防濫用
- 欄位 check constraint（範圍、長度、未來時間）。
- `device_hash` + trigger 限流（每分鐘 ≤ 3 筆）；可再加 Cloudflare Turnstile 或「組員邀請碼」。
- 若擔心外人亂填：改為 Supabase Auth（學校信箱 magic link），policy 改 `to authenticated`。

## 從 localStorage 遷移
1. 保留 localStorage 為「離線暫存」：寫入時先存本機，連線後再批次上傳。
2. 首次連線時，把本機觀察用 CSV 匯入邏輯（已實作 `importObservationsCSV`，含去重）轉成 insert；以 `id` 或 (observed_at, place_id, crowd_level) 去重。
3. 上傳成功才標記已同步，**不刪除**本機資料。

## CSV 匯入 / 匯出
App 已支援匯出（UTF-8 BOM，Excel 直接開得到繁體中文）與匯入（驗證、去重）。也可在 Supabase 後台 Table Editor 直接 Import CSV。

## 你需要自己做的步驟（我不會代你建立付費或帳號資源）
1. 到 supabase.com 用 GitHub 登入，建立免費專案（Free plan 足夠），區域選 Northeast Asia。
2. SQL Editor 貼上 `supabase/schema.sql` 執行；到 Table Editor 確認 RLS 為 Enabled。
3. Settings → API 複製 **Project URL** 與 **anon public key**（不要複製 service_role）。
4. Vercel → Project → Settings → Environment Variables 新增 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`，重新部署。
5. 回報給我後，我再實作 `src/lib/supabase.js`（同步佇列、錯誤處理）並加測試。

## 風險
免費專案閒置會暫停；資料屬於校園眾包、品質需靠規範（見 AI 架構文件）；若要公開給全校使用，需要隱私說明。
