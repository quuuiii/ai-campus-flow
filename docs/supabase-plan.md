# 多人資料蒐集：Supabase 架構、資料流程與安全設計

> 狀態：前端同步程式與 SQL 已寫好並通過測試（用假的伺服器模擬）；**尚未連上任何真實 Supabase 專案**。沒有建立帳號、沒有金鑰。

## 1. 為什麼需要
目前每支手機的觀察紀錄只存在自己的 localStorage，組員之間無法合併，模型永遠湊不到「每地點 20 筆、3 天」。接上 Supabase 後，大家回報的資料會進同一張表，儀表板與模型都改用「本機＋團隊」資料。

## 2. 資料表（`supabase/schema.sql`）
| 表 / view | 用途 | 重點欄位 |
|---|---|---|
| `places` | 可回報的地點（與前端代碼一致） | `id`、`category`、`active`（停業改 false，不刪歷史） |
| `profiles` | 登入者角色 | `role`：`reporter`（新登入，回報需審核）／`member`（管理員確認的組員，直接核可）／`admin` |
| `member_list` | 管理員看成員 email 與角色（僅 admin 可讀） | |
| `crowd_observations` | 人潮觀察 | `client_id`（去重）、`observed_at`、`place_id`、`crowd_level` 1–5、`queue_minutes`、`method`、`source`（app / csv_import / field_team）、`status`（pending / approved / rejected）、`reporter`、`device_hash`、`reviewed_by/at`、`created_at` |
| `crowd_observations_public` | 對外唯讀：只有已核可、不含回報者與裝置 | |
| `crowd_dashboard` | 各地點筆數、天數、最近時間 | |
| `crowd_review_queue` | 管理員待審清單 | |

## 3. 資料流程
```
回報（手機）→ 先存本機 localStorage（離線也能用）
          → 加入「待上傳佇列」(campus-flow-outbox-v1)
          → 有網路時 POST /rest/v1/crowd_observations?on_conflict=client_id
               成功：移出佇列
               離線 / 5xx / 429 限流：留在佇列，上線或下次開啟自動重送
               其他 4xx（資料被拒）：標記「被拒絕」並顯示原因，可手動重試
伺服器 trigger：決定 status（member/admin→approved；匿名與 reporter→pending）、填 reporter、檢查地點、限流
管理員：在後台審核 pending → approved / rejected
下載：GET crowd_observations_public（只有 approved）→ 存 campus-flow-remote-obs-v1
預測／模型／儀表板 = 本機紀錄 ∪ 團隊資料（以 client_id 去重，本機優先）
```
- 去重：每筆紀錄的前端 id 即 `client_id`（unique），重送或多台匯入同一份 CSV 都不會重複。
- 刪除：App 裡刪除只刪本機；伺服器資料只有管理員能處理（沒有開放 delete policy）。

## 4. 安全設計
- **金鑰**：前端只用 `anon` key（公開是 Supabase 的設計，安全靠 RLS）。`service_role` key 絕不可放進前端、repo、截圖或簡報。
- **RLS**（全部資料表啟用）：
  - 任何人可新增觀察，但 `status`、`reporter`、審核欄位由伺服器 trigger 覆寫，前端無法偽造「已核可」。
  - 匿名者不能直接讀表，只能讀去識別化的 public view。
  - 登入成員可讀已核可資料與自己的回報；只有 admin 可更新（審核）。
  - 不提供任何 delete policy。
- **防濫用**：欄位範圍檢查、時間不可在未來、地點必須在白名單且 active、同裝置／同帳號 10 分鐘最多 5 筆（回 HTTP 429）、匿名資料需審核。
- **個資**：不收姓名、學號；`device_hash` 是隨機字串，只用於限流且不對外公開。

## 5. CSV
- App：匯出（UTF-8 BOM、台灣時間，Excel 可直接開）、匯入（逐列驗證、去重），匯入的資料只存本機，不會自動上傳。
- 管理員：可在 Supabase Table Editor 匯入 CSV 到 `crowd_observations`（`source` 填 `csv_import`、`client_id` 用 CSV 的 id 欄），或用 SQL Editor 匯出 `crowd_observations_public`。

## 6. 你需要做的設定（約 15 分鐘）
1. 到 <https://supabase.com> 用 GitHub 登入 → New project（Free 方案即可，區域選 Northeast Asia (Tokyo)）。**我不會代你建立帳號或任何付費資源。**
2. 左側 **SQL Editor** → 貼上 `supabase/schema.sql` 全文 → Run。到 **Table Editor** 確認三張表都顯示 RLS enabled。
3. **Authentication → Providers**：確認 Email 已開啟（magic link）。
   **Authentication → URL Configuration**：Site URL 填 `https://ai-campus-flow-qtg2.vercel.app`；Redirect URLs 加入同一網址，若要在 Vercel 預覽版測試再加 `https://*-quuuiiis-projects.vercel.app/**`（實際網域以 Vercel 預覽網址為準）。
   你先在網站「設定」頁用 email 登入一次，再到 Supabase **Table Editor → profiles** 把自己那列的 `role` 改成 `admin`（只有第一位管理員需要在後台改）。之後組員的角色可以直接在網站「設定 → 載入待審與成員」裡調整。
4. **Project Settings → API Keys**：複製 **Publishable key**（`sb_publishable_…`，新專案預設）；舊專案可在 **Legacy API Keys** 分頁複製 `anon`。**不要**複製 secret / service_role。Project URL 在 **Data API** 頁或首頁的 Connect，只要 `https://xxxx.supabase.co`，不要加 `/rest/v1/`。
5. **Vercel → ai-campus-flow-qtg2 → Settings → Environment Variables** 新增：
   - `VITE_SUPABASE_URL` = 剛剛的 Project URL（形如 `https://xxxx.supabase.co`）
   - `VITE_SUPABASE_ANON_KEY` = anon public key
6. Vercel → Deployments → 最新一筆 → Redeploy。打開網站 → 探索 → 人潮觀察，「團隊同步」應顯示「已設定」。

## 7. 登入與審核（App 內）
- 設定頁：輸入 email → 收信點連結 → 回到網站即登入（token 從網址取出後立刻清除）。
- 角色：新帳號是「回報者」，回報仍需審核；管理員在設定頁把組員改為「組員」後，其回報直接核可。
- 管理員：設定頁「載入待審與成員」→ 逐筆核可／拒絕；調整成員角色。審核人與時間由資料庫記錄，審核時無法改動觀察內容。
- 安全：登入後所有請求都用使用者自己的 token，權限完全由 RLS 決定；前端隱藏按鈕不是安全機制。

## 8. 尚未完成
- SQL 尚未在真實 Supabase 執行驗證；第一次執行若有錯誤，把錯誤訊息貼給我。
- Supabase 免費方案內建寄信有每小時數量限制，組員多時可能要等或設定自己的 SMTP。
- 沒有限制只能用學校信箱註冊（任何 email 都能登入成為「回報者」，但回報仍需審核）。
