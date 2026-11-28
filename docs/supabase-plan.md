# 團隊資料庫（Supabase）：設定、權限與驗證

> 狀態（2026-11-28）：SQL 已在本機 PostgreSQL 16（模擬 Supabase auth）驗證權限；前端同步與登入以模擬伺服器端對端測試。**正式 Supabase 專案的連線，需依第 7 節清單由團隊實際驗證。**

## 1. 資料表與 view（`supabase/schema.sql`）
| 物件 | 用途 |
|---|---|
| `places` | 可回報地點（停用用 `active = false`，不刪歷史） |
| `profiles` | 角色：`reporter`（新登入，回報待審）／`member`（組員，直接核可）／`admin` |
| `crowd_observations` | 人潮觀察：`client_id`（去重）、時間、地點、擁擠度 1–5、排隊、方式、來源、備註、`status`、`reporter`、`device_hash`、審核人與時間 |
| `crowd_observations_public` | 公開讀取：只有已核可，不含回報者、裝置與備註 |
| `crowd_dashboard` | 各地點筆數、天數、最近時間 |
| `crowd_review_queue` | 待審清單（只有 admin 看得到內容） |
| `member_list` | 成員 email 與角色（只有 admin） |

## 2. 權限設計（已用 `supabase/test/security.sql` 驗證）
- **欄位權限**：收回 Supabase 預設的整表權限。一般使用者只能寫入觀察內容、只能看到 `id / client_id / status`，**讀不到別人的回報者、裝置碼、備註**。
- **RLS**：只有 admin 能更新狀態與角色；沒有任何刪除權限。
- **Trigger**：伺服器決定 `status` 與 `reporter`（前端無法偽造「已核可」或冒用他人）；審核時觀察內容不可改，審核人與時間自動記錄；同裝置／帳號 10 分鐘最多 5 筆（HTTP 429）；地點必須有效、時間不可在未來。
- 前端只用 **Publishable key**（`sb_publishable_…`，或舊版 anon key）。**Secret / service_role key 絕不可放進前端**，網站會拒絕使用 `sb_secret_` 開頭的 key。

本機驗證結果（9 種攻擊全部失敗）：自行升級角色、讀他人 device_hash／note／reporter、改他人狀態、改內容、刪除、偽造回報者、匿名偽造核可、一般人讀成員或待審清單。

## 3. 第一次設定（約 15 分鐘）
1. supabase.com → 用 GitHub 登入 → New organization（Free）→ New project（區域 Northeast Asia (Tokyo)）。資料庫密碼另存，不要放進網站。
2. **SQL Editor** → 清空 → 貼上 `supabase/schema.sql` 全文 → **Run**，看到 Success。
3. **Authentication → URL Configuration**：Site URL 與 Redirect URLs 填 `https://ai-campus-flow-qtg2.vercel.app`。
4. **Project Settings → API Keys** 複製 **Publishable key**；**Data API** 頁複製 Project URL（只要 `https://xxxx.supabase.co`）。
5. **Vercel → ai-campus-flow-qtg2 → Settings → Environment Variables**（Type 選 Config、All Environments）：
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = Publishable key
6. Vercel → Deployments → 最新一筆 → ⋯ → **Redeploy**（不要勾 build cache）。

## 4. 管理員初始化
1. 在網站「設定」頁用你的 email 登入一次（會自動建立 `reporter` 角色）。
2. Supabase **SQL Editor** 執行（換成你的 email）：
   ```sql
   update public.profiles set role = 'admin'
   where user_id = (select id from auth.users where email = '你的email');
   ```
3. 回網站「設定」重新整理，出現「載入待審與成員」即成功。之後組員登入一次，由你在網站裡改成「組員」。

## 5. 更新既有專案（每次 `schema.sql` 有更新時）
`schema.sql` 可重複執行、不刪資料。到 SQL Editor 清空後貼上最新版全文 → Run。**2026-11-28 版修正了「未登入回報會被拒絕」與「登入者可讀他人裝置碼與備註」兩個問題，請務必重跑一次。**

## 6. CSV
- App：匯出（UTF-8 BOM、台灣時間）、匯入（驗證、去重）；匯入的資料只存本機，不自動上傳。
- 管理員：Supabase Table Editor 可匯入 CSV（`source` 填 `csv_import`、`client_id` 用 CSV 的 id），或從 `crowd_observations_public` 匯出。

## 7. 正式環境驗證清單（請團隊實際操作並記錄結果）
| # | 操作 | 預期 |
|---|---|---|
| 1 | 探索 → 人潮觀察 →「團隊同步」 | 顯示「已設定」 |
| 2 | **未登入**（無痕視窗）送一筆回報 | 待上傳變 0；Supabase `crowd_observations` 多一筆 `pending` |
| 3 | 設定頁 Email 登入 | 收到信、點連結回到網站顯示「登入成功」 |
| 4 | 管理員：設定 → 載入待審與成員 → 核可第 2 步那筆 | 該筆變 `approved`，`reviewed_by` 有值 |
| 5 | 組員帳號（已設為組員）送一筆 | 直接 `approved` |
| 6 | 另一台裝置打開網站 → 人潮觀察 → 立即同步 | 儀表板顯示「本機＋團隊」，筆數包含別人的已核可資料 |
| 7 | 用 reporter 帳號在瀏覽器主控台嘗試讀 `crowd_observations?select=note` | 回傳權限錯誤 |

## 8. 限制
免費方案閒置會暫停、內建寄信有每小時上限；任何 email 都能登入成為 reporter（回報需審核）；App 內無法刪除雲端資料（請用拒絕或後台刪除）。
